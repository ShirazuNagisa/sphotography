/**
 * Sphotography - Frontend Map Application v2
 *
 * @package Sphotography
 * @version 1.0.1
 */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // 1. Configuration & Settings
    // ---------------------------------------------------------------
    const SETTINGS = typeof SphotographySettings !== 'undefined' ? SphotographySettings : {};
    const PRIMARY_COLOR = SETTINGS.primaryColor || '#e67e22';

    // Light and dark map styles
    const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    // Choose initial map style based on night mode setting
    function getMapStyle() {
        var mode = SETTINGS.nightMode || 'system';
        if (mode === 'light') return LIGHT_STYLE;
        if (mode === 'dark') return DARK_STYLE;
        // system: prefer-color-scheme
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return LIGHT_STYLE;
        }
        return DARK_STYLE;
    }

    const CONFIG = {
        center: [112.94, 28.23],
        zoom: 5,
        maxZoom: 18,
        minZoom: 2,
        styleUrl: getMapStyle(),
        restBase: (typeof Sphotography !== 'undefined' ? Sphotography.restUrl : '/wp-json').replace(/\/$/, ''),
        photosEndpoint: 'wp/v2/photograph',
        tagsEndpoint: 'wp/v2/region_tag',
        postsEndpoint: 'wp/v2/posts',
        perPage: 500,
        postsPerPage: 50,
        sourceId: 'photos',
        clusterSourceId: 'photos-clustered',
        layerId: 'photo-points',
        clusterLayerId: 'photo-clusters',
        clusterCountLayerId: 'photo-cluster-count',
        markerColor: '#ffffff',
        markerBorderColor: PRIMARY_COLOR,
        markerRadius: 8,
        markerBorderWidth: 3,
    };

    // ---------------------------------------------------------------
    // 2. State
    // ---------------------------------------------------------------
    const state = {
        map: null,
        allPhotos: null,
        filteredPhotos: null,
        regionTags: [],
        activeFilterSlugs: [],
        recentPosts: [],
        allPosts: [],
        sidebarOpen: true,
        articleOpen: false,
        photoGridOpen: false,
        filterOpen: false,
        detailOpen: false,
        useClustering: typeof supercluster !== 'undefined',
        isMobile: window.innerWidth < 768,
        currentPhotoPostId: null,
        clickedMarker: false, // flag to prevent bg-click from closing panel
    };

    // ---------------------------------------------------------------
    // 3. DOM Cache
    // ---------------------------------------------------------------
    const dom = {};
    function cacheDom() {
        dom.map = document.getElementById('map');
        dom.loadingOverlay = document.getElementById('loading-overlay');
        dom.sidebar = document.getElementById('sidebar');
        dom.sidebarPosts = document.getElementById('sidebar-posts');
        dom.sidebarToggle = document.getElementById('sidebar-toggle');
        dom.sidebarExpand = document.getElementById('sidebar-expand');
        dom.sidebarSearch = document.getElementById('sidebar-search-input');
        dom.articlePanel = document.getElementById('article-panel');
        dom.articleClose = document.getElementById('article-close');
        dom.articleTitle = document.getElementById('article-title');
        dom.articleMeta = document.getElementById('article-meta');
        dom.articleContent = document.getElementById('article-content');
        dom.photoGridPanel = document.getElementById('photo-grid-panel');
        dom.photoGridClose = document.getElementById('photo-grid-close');
        dom.photoGridTitle = document.getElementById('photo-grid-title');
        dom.photoGridContainer = document.getElementById('photo-grid-container');
        dom.detailSheet = document.getElementById('detail-sheet');
        dom.closeDetail = document.getElementById('close-detail');
        dom.detailImg = document.getElementById('detail-img');
        dom.detailTitle = document.getElementById('detail-title');
        dom.detailMeta = document.getElementById('detail-meta');
        dom.detailDesc = document.getElementById('detail-desc');
        dom.detailTags = document.getElementById('detail-tags');
        dom.aboutTrigger = document.getElementById('about-trigger');
        dom.aboutCard = document.getElementById('about-card');
    }

    // ---------------------------------------------------------------
    // 4. Utilities
    // ---------------------------------------------------------------
    function stripHtml(text) {
        var d = document.createElement('div');
        d.innerHTML = text;
        return d.textContent || d.innerText || '';
    }

    function escapeHtml(text) {
        if (!text) return '';
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        var year = parts[0], month = parseInt(parts[1]), day = parseInt(parts[2]);
        var fmt = SETTINGS.dateFormat || 'Y年n月j日';
        if (fmt === 'custom' && SETTINGS.customDateFormat) fmt = SETTINGS.customDateFormat;
        var map = {
            'Y': year, 'y': year.slice(-2),
            'm': ('0'+month).slice(-2), 'n': String(month),
            'd': ('0'+day).slice(-2), 'j': String(day),
            'F': ['January','February','March','April','May','June','July','August','September','October','November','December'][month-1]||'',
            'M': ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]||'',
        };
        var r = '';
        for (var i = 0; i < fmt.length; i++) {
            var c = fmt[i];
            if (c === '\\') { if (i+1<fmt.length) { r+=fmt[i+1]; i++; } continue; }
            r += map[c] !== undefined ? map[c] : c;
        }
        return r;
    }

    function debounce(fn, delay) {
        var t = null;
        return function () { var a=arguments, c=this; clearTimeout(t); t=setTimeout(function(){fn.apply(c,a);},delay); };
    }

    function isMobileView() { return window.innerWidth < 768; }

    // ---------------------------------------------------------------
    // 5. REST API
    // ---------------------------------------------------------------
    async function fetchFromRest(endpoint, params) {
        var qs = params ? '?' + new URLSearchParams(params).toString() : '';
        var url = CONFIG.restBase + '/' + endpoint + qs;
        try {
            var res = await fetch(url);
            if (!res.ok) { console.warn('API fail:', url, res.status); return null; }
            return await res.json();
        } catch (err) { console.error('API error:', err); return null; }
    }

    function fetchPhotos(params) {
        return fetchFromRest(CONFIG.photosEndpoint, { per_page: CONFIG.perPage, _embed: '1', ...(params||{}) });
    }

    function fetchRegionTags() {
        return fetchFromRest(CONFIG.tagsEndpoint, { per_page: 50 });
    }

    function fetchPosts(params) {
        return fetchFromRest(CONFIG.postsEndpoint, { per_page: CONFIG.postsPerPage, _embed: '1', ...(params||{}) });
    }

    // ---------------------------------------------------------------
    // 6. Photo Data Processing (unchanged)
    // ---------------------------------------------------------------
    function buildGeoJSON(photos) {
        var features = [];
        photos.forEach(function (photo) {
            var lat = parseFloat(photo.latitude) || parseFloat(photo.meta&&photo.meta.latitude) || 0;
            var lng = parseFloat(photo.longitude) || parseFloat(photo.meta&&photo.meta.longitude) || 0;
            if (lat === 0 && lng === 0) return;

            var tags = [];
            if (photo._embedded && photo._embedded['wp:term']) {
                photo._embedded['wp:term'].forEach(function(ta){ta.forEach(function(t){if(t.taxonomy==='region_tag')tags.push({id:t.id,name:t.name,slug:t.slug});});});
            }

            var thumbUrl='', fullUrl='';
            if (photo.featured_image_src) { thumbUrl=photo.featured_image_src.medium||''; fullUrl=photo.featured_image_src.full||''; }
            else if (photo._embedded&&photo._embedded['wp:featuredmedia']) {
                var m=photo._embedded['wp:featuredmedia'][0];
                if(m){thumbUrl=(m.media_details&&m.media_details.sizes&&m.media_details.sizes.medium&&m.media_details.sizes.medium.source_url)||m.source_url||'';fullUrl=m.source_url||'';}
            }

            var cameraInfo=photo.camera_info||(photo.meta&&photo.meta.camera_info)||'';
            var takenAt=photo.taken_at||(photo.meta&&photo.meta.taken_at)||'';

            features.push({
                type:'Feature',
                geometry:{type:'Point',coordinates:[lng,lat]},
                properties:{
                    id:photo.id, title:(photo.title&&photo.title.rendered)||'Untitled',
                    description:stripHtml((photo.content&&photo.content.rendered)||(photo.excerpt&&photo.excerpt.rendered)||''),
                    thumbnail:thumbUrl, fullImage:fullUrl, cameraInfo:cameraInfo, takenAt:takenAt,
                    tags:tags, tagSlugs:tags.map(function(t){return t.slug;}),
                },
            });
        });
        return {type:'FeatureCollection',features:features};
    }

    function countTagsInPhotos(geojson) {
        var counts={};
        (geojson.features||[]).forEach(function(f){(f.properties.tagSlugs||[]).forEach(function(s){counts[s]=(counts[s]||0)+1;});});
        return counts;
    }

    function filterGeoJSONByTags(geojson, slugs) {
        if (!slugs||slugs.length===0) return geojson;
        var filtered=(geojson.features||[]).filter(function(f){var fs=f.properties.tagSlugs||[];return slugs.some(function(s){return fs.indexOf(s)!==-1;});});
        return {type:'FeatureCollection',features:filtered};
    }

    // ---------------------------------------------------------------
    // 7. Map
    // ---------------------------------------------------------------
    function initMap() {
        state.map = new maplibregl.Map({
            container:'map', style:CONFIG.styleUrl,
            center:CONFIG.center, zoom:CONFIG.zoom,
            maxZoom:CONFIG.maxZoom, minZoom:CONFIG.minZoom,
            attributionControl:true,
        });
        state.map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
        state.map.addControl(new maplibregl.ScaleControl({unit:'metric',maxWidth:120}),'bottom-left');
        state.map.on('load', function() {
            addPhotoSource(state.allPhotos);
            addPhotoLayers();
            bindMapEvents();
            hideLoading();
        });
        state.map.on('error', function(e) { console.warn('Map error:',(e.error&&e.error.message)||e); });

        window.addEventListener('resize', debounce(function() {
            if (state.map) state.map.resize();
            var m = isMobileView();
            if (m !== state.isMobile) { state.isMobile = m; }
        }, 200));
    }

    function addPhotoSource(geojson) {
        var data = geojson || {type:'FeatureCollection',features:[]};
        [CONFIG.clusterSourceId, CONFIG.sourceId].forEach(function(id){if(state.map.getSource(id))state.map.removeSource(id);});
        if (state.useClustering) {
            state.map.addSource(CONFIG.clusterSourceId, {type:'geojson',data:data,cluster:true,clusterMaxZoom:14,clusterRadius:60,clusterMinPoints:2});
            state.map.addSource(CONFIG.sourceId, {type:'geojson',data:data});
        } else {
            state.map.addSource(CONFIG.sourceId, {type:'geojson',data:data});
        }
    }

    function addPhotoLayers() {
        [CONFIG.clusterCountLayerId, CONFIG.clusterLayerId, CONFIG.layerId].forEach(function(id){if(state.map.getLayer(id))state.map.removeLayer(id);});
        if (state.useClustering) {
            state.map.addLayer({id:CONFIG.clusterLayerId,type:'circle',source:CONFIG.clusterSourceId,filter:['has','point_count'],paint:{'circle-color':'#e67e22','circle-radius':['step',['get','point_count'],18,10,22,50,28,200,36],'circle-opacity':0.85,'circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
            state.map.addLayer({id:CONFIG.clusterCountLayerId,type:'symbol',source:CONFIG.clusterSourceId,filter:['has','point_count'],layout:{'text-field':'{point_count_abbreviated}','text-size':12},paint:{'text-color':'#ffffff'}});
            state.map.addLayer({id:CONFIG.layerId,type:'circle',source:CONFIG.clusterSourceId,filter:['!',['has','point_count']],paint:{'circle-color':CONFIG.markerColor,'circle-radius':CONFIG.markerRadius,'circle-stroke-width':CONFIG.markerBorderWidth,'circle-stroke-color':CONFIG.markerBorderColor,'circle-opacity':0.95}});
        } else {
            state.map.addLayer({id:CONFIG.layerId,type:'circle',source:CONFIG.sourceId,paint:{'circle-color':CONFIG.markerColor,'circle-radius':CONFIG.markerRadius,'circle-stroke-width':CONFIG.markerBorderWidth,'circle-stroke-color':CONFIG.markerBorderColor,'circle-opacity':0.95}});
        }
        state.map.on('mouseenter',CONFIG.layerId,function(){state.map.getCanvas().style.cursor='pointer';});
        state.map.on('mouseleave',CONFIG.layerId,function(){state.map.getCanvas().style.cursor='';});
    }

    function updatePhotoData(geojson) {
        if (!state.map||!(state.map.isStyleLoaded()||state.map.loaded())) return;
        if (state.useClustering) {
            var cs=state.map.getSource(CONFIG.clusterSourceId); if(cs&&typeof cs.setData==='function')cs.setData(geojson);
            var ps=state.map.getSource(CONFIG.sourceId); if(ps&&typeof ps.setData==='function')ps.setData(geojson);
        } else {
            var s=state.map.getSource(CONFIG.sourceId); if(s&&typeof s.setData==='function')s.setData(geojson);
        }
    }

    // ---------------------------------------------------------------
    // 8. Map Events
    // ---------------------------------------------------------------
    function bindMapEvents() {
        // Click marker → open photo grid
        state.map.on('click', CONFIG.layerId, function(e) {
            if (!e.features||e.features.length===0) return;
            state.clickedMarker = true; // prevent bg click handler
            var props = e.features[0].properties;
            openPhotoGrid(props);
            if (e.originalEvent) e.originalEvent.stopPropagation();
        });

        // Click cluster → zoom in
        if (state.useClustering) {
            state.map.on('click', CONFIG.clusterLayerId, function(e) {
                if (!e.features||e.features.length===0) return;
                state.clickedMarker = true;
                var cid=e.features[0].properties.cluster_id;
                var src=state.map.getSource(CONFIG.clusterSourceId);
                if(src&&typeof src.getClusterExpansionZoom==='function'){
                    src.getClusterExpansionZoom(cid,function(err,zoom){if(!err)state.map.easeTo({center:e.features[0].geometry.coordinates,zoom:zoom,duration:400});});
                }
                if(e.originalEvent)e.originalEvent.stopPropagation();
            });
        }

        // Click map bg → close panels (keep sidebar)
        state.map.on('click', function() {
            // If a marker was just clicked, skip closing panels
            if (state.clickedMarker) {
                state.clickedMarker = false;
                return;
            }
            closeDetailPanel();
            closePhotoGrid();
            closeArticlePanel();
            if (state.isMobile) { closeSidebar(); }
            closeAboutCard();
        });
    }

    // ---------------------------------------------------------------
    // 9. Sidebar
    // ---------------------------------------------------------------
    function openSidebar() {
        if (state.isMobile) {
            dom.sidebar.classList.add('open');
        }
        document.body.classList.remove('sidebar-collapsed');
        state.sidebarOpen = true;
    }

    function closeSidebar() {
        if (state.isMobile) {
            dom.sidebar.classList.remove('open');
        }
        document.body.classList.add('sidebar-collapsed');
        state.sidebarOpen = false;
        // Force close dependent panels
        closeArticlePanel();
        closePhotoGrid();
        closeDetailPanel();
    }

    function toggleSidebar() {
        if (state.sidebarOpen) closeSidebar();
        else openSidebar();
    }

    function renderSidebarPosts(posts) {
        dom.sidebarPosts.innerHTML = '';
        if (!posts || posts.length === 0) {
            dom.sidebarPosts.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">暂无文章</div>';
            return;
        }
        posts.forEach(function(post) {
            var card = document.createElement('div');
            card.className = 'post-card';
            card.dataset.postId = post.id;

            var thumbUrl = '';
            if (post._embedded && post._embedded['wp:featuredmedia']) {
                var m = post._embedded['wp:featuredmedia'][0];
                if (m) thumbUrl = (m.media_details && m.media_details.sizes && m.media_details.sizes.thumbnail && m.media_details.sizes.thumbnail.source_url) || m.source_url || '';
            }

            var dateStr = post.date ? formatDate(post.date.split('T')[0]) : '';

            card.innerHTML = ''
                + '<img class="post-card-thumb" src="' + (thumbUrl || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
                + '<div class="post-card-body">'
                + '<div class="post-card-title">' + escapeHtml(post.title.rendered || '') + '</div>'
                + '<div class="post-card-date"><svg width=12 height=12 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + escapeHtml(dateStr) + '</div>'
                + '</div>';

            card.addEventListener('click', function(e) {
                e.stopPropagation();
                openArticle(post.id);
            });

            dom.sidebarPosts.appendChild(card);
        });
    }

    function filterSidebarPosts(query) {
        var q = query.toLowerCase().trim();
        if (!q) { renderSidebarPosts(state.allPosts); return; }
        var filtered = state.allPosts.filter(function(p) {
            return (p.title.rendered||'').toLowerCase().indexOf(q) !== -1
                || stripHtml(p.excerpt&&p.excerpt.rendered||'').toLowerCase().indexOf(q) !== -1;
        });
        renderSidebarPosts(filtered);
    }

    // ---------------------------------------------------------------
    // 10. Article Panel
    // ---------------------------------------------------------------
    async function openArticle(postId) {
        closePhotoGrid();

        // Show loading state
        dom.articleTitle.textContent = '加载中...';
        dom.articleMeta.textContent = '';
        dom.articleContent.innerHTML = '';
        dom.articlePanel.classList.add('active');
        state.articleOpen = true;

        if (state.isMobile) closeSidebar();

        // Fetch full post
        var post = await fetchFromRest(CONFIG.postsEndpoint + '/' + postId, { _embed: '1' });
        if (!post) {
            dom.articleTitle.textContent = '文章加载失败';
            return;
        }

        var dateStr = post.date ? formatDate(post.date.split('T')[0]) : '';
        dom.articleTitle.textContent = post.title.rendered || '';

        var metaHtml = '';
        if (dateStr) metaHtml += '<span>' + escapeHtml(dateStr) + '</span>';
        if (post._embedded && post._embedded['wp:term']) {
            post._embedded['wp:term'].forEach(function(ta) {
                ta.forEach(function(t) {
                    if (t.taxonomy === 'category' || t.taxonomy === 'region_tag') {
                        metaHtml += '<span style="color:var(--primary);font-size:0.75rem;">#' + escapeHtml(t.name) + '</span>';
                    }
                });
            });
        }
        dom.articleMeta.innerHTML = metaHtml;

        // Render WP content
        dom.articleContent.innerHTML = post.content && post.content.rendered ? post.content.rendered : '<p style="color:var(--text-muted)">暂无内容</p>';

        // Target blank for external links
        dom.articleContent.querySelectorAll('a').forEach(function(a) { if(!a.href.startsWith(window.location.origin)) a.target='_blank'; });

        // Re-run entry animation
        if (SETTINGS.entryAnimation) initEntryAnimation();
    }

    function closeArticlePanel() {
        dom.articlePanel.classList.remove('active');
        state.articleOpen = false;
        if (state.isMobile && !state.photoGridOpen) openSidebar();
    }

    // ---------------------------------------------------------------
    // 11. Photo Grid Panel
    // ---------------------------------------------------------------
    var PHOTO_GRID_MARGIN = 16; // px gap from marker
    var PANEL_PADDING = 16; // internal padding
    var THUMB_SIZE = 120; // width of each thumb cell

    function getFeatureCoords(props) {
        if (!state.allPhotos) return null;
        var features = state.allPhotos.features || [];
        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            if (f.properties && f.properties.id === props.id) {
                return f.geometry.coordinates;
            }
        }
        return null;
    }

    function openPhotoGrid(props, clickLngLat) {
        if (!props) return;

        var coords = clickLngLat || getFeatureCoords(props);
        if (!coords) coords = [0, 0];

        var currentData = state.filteredPhotos || state.allPhotos;
        var allFeatures = currentData.features || [];
        if (allFeatures.length === 0) return;

        // Filter photos near the clicked marker (within ~1km at zoom levels)
        var PROXIMITY_THRESHOLD = 0.05; // degrees (~5km)
        var nearbyFeatures = [];
        for (var i = 0; i < allFeatures.length; i++) {
            var f = allFeatures[i];
            if (!f.geometry || !f.geometry.coordinates) continue;
            var dLng = Math.abs(f.geometry.coordinates[0] - coords[0]);
            var dLat = Math.abs(f.geometry.coordinates[1] - coords[1]);
            if (dLng < PROXIMITY_THRESHOLD && dLat < PROXIMITY_THRESHOLD) {
                nearbyFeatures.push(f);
            }
        }

        // If no nearby photos found, show just the clicked one
        var displayPhotos;
        if (nearbyFeatures.length === 0) {
            // Find the clicked feature by id
            for (var i = 0; i < allFeatures.length; i++) {
                if (allFeatures[i].properties && allFeatures[i].properties.id === props.id) {
                    displayPhotos = [allFeatures[i]];
                    break;
                }
            }
            if (!displayPhotos) return;
        } else {
            displayPhotos = nearbyFeatures;
        }

        if (displayPhotos.length > 6) displayPhotos = displayPhotos.slice(0, 6);

        renderPhotoGrid(displayPhotos, props.title || '照片', coords);
    }

    function renderPhotoGrid(photos, title, coords) {
        dom.photoGridTitle.textContent = title;
        dom.photoGridContainer.innerHTML = '';
        dom.photoGridPanel.classList.remove('active');

        var count = photos.length;
        var cols = Math.min(count, 3);
        var rows = Math.ceil(count / cols);

        // Dynamic sizing
        var panelW = cols * THUMB_SIZE + (cols - 1) * 10 + PANEL_PADDING * 2;
        var panelH = rows * THUMB_SIZE + (rows - 1) * 10 + PANEL_PADDING * 2 + 40; // +40 for title
        dom.photoGridPanel.style.width = panelW + 'px';

        dom.photoGridContainer.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';

        if (photos.length === 0) {
            dom.photoGridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">暂无照片</div>';
        } else {
            photos.forEach(function(feature) {
                var item = document.createElement('div');
                item.className = 'photo-grid-item';
                var p = feature.properties;
                var imgUrl = p.thumbnail || p.fullImage || '';

                item.innerHTML = ''
                    + (imgUrl ? '<img src="' + imgUrl + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem;">无图</div>')
                    + '<div class="photo-item-overlay">' + escapeHtml(p.title) + '</div>';

                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    closePhotoGrid();
                    if (state.isMobile) {
                        openDetailPanel(p);
                    } else {
                        openSidebar();
                        openPhotographArticle(p.id, p);
                    }
                });

                dom.photoGridContainer.appendChild(item);
            });
        }

        // Position near marker: use map.project to get screen coords
        if (state.map && coords) {
            var screenPoint = state.map.project(new maplibregl.LngLat(coords[0], coords[1]));
            var left = screenPoint.x + PHOTO_GRID_MARGIN;
            var top = screenPoint.y - panelH / 2;

            // Clamp to viewport
            if (top < 20) top = 20;
            if (top + panelH > window.innerHeight - 40) top = window.innerHeight - panelH - 40;
            if (left + panelW > window.innerWidth - 20) {
                // If too far right, place to left of marker
                left = screenPoint.x - panelW - PHOTO_GRID_MARGIN;
            }
            if (left < 20) left = 20;

            dom.photoGridPanel.style.left = left + 'px';
            dom.photoGridPanel.style.top = top + 'px';
            dom.photoGridPanel.style.right = 'auto';
            dom.photoGridPanel.style.transform = 'none';
        }

        // Force sidebar open on desktop
        if (!state.isMobile) openSidebar();

        dom.photoGridPanel.classList.add('active');
        state.photoGridOpen = true;
    }

    function closePhotoGrid() {
        dom.photoGridPanel.classList.remove('active');
        state.photoGridOpen = false;
    }

    // ---------------------------------------------------------------
    // 12. Photograph Article Panel (desktop: shows photo in article panel)
    // ---------------------------------------------------------------
    async function openPhotographArticle(photoId, props) {
        closePhotoGrid();
        dom.articleTitle.textContent = props.title || 'Photograph';
        dom.articleMeta.innerHTML = props.cameraInfo
            ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/></svg>' + escapeHtml(props.cameraInfo) + '</span>'
            : '';
        if (props.takenAt) {
            dom.articleMeta.innerHTML += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + formatDate(props.takenAt) + '</span>';
        }
        // Build content with image + description + tags
        var contentHtml = '';
        if (props.fullImage) {
            contentHtml += '<img src="' + props.fullImage + '" alt="' + escapeHtml(props.title) + '" style="width:100%;border-radius:12px;margin-bottom:20px;">';
        }
        if (props.description) {
            contentHtml += '<p>' + escapeHtml(props.description) + '</p>';
        }
        if (props.tags && props.tags.length > 0) {
            contentHtml += '<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:6px;">';
            props.tags.forEach(function(tag) {
                contentHtml += '<span style="padding:4px 12px;font-size:0.75rem;background:rgba(230,126,34,0.12);color:' + PRIMARY_COLOR + ';border:1px solid rgba(230,126,34,0.2);border-radius:12px;">' + escapeHtml(tag.name) + '</span>';
            });
            contentHtml += '</div>';
        }
        dom.articleContent.innerHTML = contentHtml;
        dom.articlePanel.classList.add('active');
        state.articleOpen = true;
        if (state.isMobile) closeSidebar();
    }

    // ---------------------------------------------------------------
    // 13. Detail Panel (for photograph CPT, mobile fallback)
    // ---------------------------------------------------------------
    function openDetailPanel(props) {
        if (!props) return;
        dom.detailImg.src = props.fullImage || props.thumbnail || '';
        dom.detailImg.alt = props.title || '';
        dom.detailTitle.textContent = props.title || '';

        var metaHtml = '';
        if (props.cameraInfo) {
            metaHtml += '<span class="detail-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/></svg>' + escapeHtml(props.cameraInfo) + '</span>';
        }
        if (props.takenAt) {
            metaHtml += '<span class="detail-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + formatDate(props.takenAt) + '</span>';
        }
        dom.detailMeta.innerHTML = metaHtml;
        dom.detailDesc.textContent = props.description || '';

        var tagsHtml = '';
        (props.tags || []).forEach(function(tag) { tagsHtml += '<span class="detail-tag">' + escapeHtml(tag.name) + '</span>'; });
        dom.detailTags.innerHTML = tagsHtml;

        dom.detailSheet.classList.add('active');
        state.detailOpen = true;
    }

    function closeDetailPanel() {
        dom.detailSheet.classList.remove('active');
        state.detailOpen = false;
    }

    // ---------------------------------------------------------------
    // 14. About Card
    // ---------------------------------------------------------------
    function toggleAboutCard(e) { if(e)e.stopPropagation(); dom.aboutCard.classList.toggle('hidden'); }
    function closeAboutCard() { dom.aboutCard.classList.add('hidden'); }

    // ---------------------------------------------------------------
    // 16. Loading
    // ---------------------------------------------------------------
    function hideLoading() {
        if (!dom.loadingOverlay) return;
        dom.loadingOverlay.classList.add('fade-out');
        setTimeout(function(){dom.loadingOverlay.style.display='none';},600);
    }

    // ---------------------------------------------------------------
    // 17. Hitokoto
    // ---------------------------------------------------------------
    function initHitokoto() {
        if (!SETTINGS.enableHitokoto) return;
        var el = document.getElementById('hitokoto-text');
        if (!el) return;
        fetch('https://v1.hitokoto.cn/?c=d&c=i&c=k')
            .then(function(r){return r.json();})
            .then(function(d){el.textContent=d.hitokoto||' ';if(d.from)el.textContent+=' ——'+d.from;})
            .catch(function(){el.textContent=' ';});
    }

    // ---------------------------------------------------------------
    // 18. Entry Animation
    // ---------------------------------------------------------------
    function initEntryAnimation() {
        if (!SETTINGS.entryAnimation) return;
        if (!('IntersectionObserver' in window)) return;
        var targets = document.querySelectorAll('.animate-on-scroll');
        if (targets.length === 0) return;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) { entry.target.classList.add('animated'); observer.unobserve(entry.target); }
            });
        }, {threshold:0.1});
        targets.forEach(function(el){observer.observe(el);});
    }

    // ---------------------------------------------------------------
    // 19. Use inline PHP data if available (bypasses REST API 403)
    // ---------------------------------------------------------------
    function useInlineData() {
        if (typeof SphotographyInlineData === 'undefined') return false;
        var data = SphotographyInlineData;

        // Build region tags from inline photos
        var tagMap = {};
        var allTags = [];

        if (data.photos && data.photos.length > 0) {
            // Build GeoJSON from inline data
            var features = [];
            data.photos.forEach(function(photo) {
                var lat = parseFloat(photo.latitude) || 0;
                var lng = parseFloat(photo.longitude) || 0;
                if (lat === 0 && lng === 0) return;

                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [lng, lat] },
                    properties: {
                        id: photo.id,
                        title: photo.title || 'Untitled',
                        description: photo.description || '',
                        thumbnail: photo.thumbnail || '',
                        fullImage: photo.full_image || '',
                        cameraInfo: photo.camera_info || '',
                        takenAt: photo.taken_at || '',
                        tags: photo.tags || [],
                        tagSlugs: photo.tag_slugs || [],
                    },
                });

                (photo.tags || []).forEach(function(tag) {
                    if (!tagMap[tag.slug]) {
                        tagMap[tag.slug] = { id: tag.id, name: tag.name, slug: tag.slug, count: 0 };
                    }
                    tagMap[tag.slug].count++;
                });
            });

            state.allPhotos = { type: 'FeatureCollection', features: features };
            state.regionTags = Object.keys(tagMap).map(function(k) { return tagMap[k]; });
        }

        if (data.posts && data.posts.length > 0) {
            // Map inline posts to the format expected by sidebar renderer
            state.allPosts = data.posts.map(function(p) {
                return {
                    id: p.id,
                    title: { rendered: p.title },
                    date: p.date,
                    excerpt: { rendered: p.excerpt },
                    _embedded: {
                        'wp:featuredmedia': p.thumb ? [{ source_url: p.thumb, media_details: { sizes: { thumbnail: { source_url: p.thumb } } } }] : [],
                        'wp:term': [p.terms || []],
                    },
                };
            });
            state.recentPosts = state.allPosts;
        }

        return true;
    }

    // ---------------------------------------------------------------
    // 20. UI Event Bindings
    // ---------------------------------------------------------------
    function bindUIEvents() {
        // Sidebar toggle
        dom.sidebarToggle.addEventListener('click', function(e) { e.stopPropagation(); toggleSidebar(); });
        dom.sidebarExpand.addEventListener('click', function(e) { e.stopPropagation(); openSidebar(); });

        // Sidebar search
        dom.sidebarSearch.addEventListener('input', debounce(function() {
            filterSidebarPosts(this.value);
        }, 300));

        // Article close
        dom.articleClose.addEventListener('click', function(e) { e.stopPropagation(); closeArticlePanel(); });

        // Photo grid close
        dom.photoGridClose.addEventListener('click', function(e) { e.stopPropagation(); closePhotoGrid(); });

        // Detail close
        dom.closeDetail.addEventListener('click', function(e) { e.stopPropagation(); closeDetailPanel(); });

        // About
        dom.aboutTrigger.addEventListener('click', function(e) { toggleAboutCard(e); });
        dom.aboutCard.addEventListener('click', function(e) { e.stopPropagation(); });

        // ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' || e.key === 'Esc') {
                closeArticlePanel();
                closePhotoGrid();
                closeDetailPanel();
                closeAboutCard();
            }
        });

        // Stop propagation on panels so map click doesn't close them
        dom.articlePanel.addEventListener('click', function(e) { e.stopPropagation(); });
        dom.photoGridPanel.addEventListener('click', function(e) { e.stopPropagation(); });
        dom.detailSheet.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // ---------------------------------------------------------------
    // 21. Main Init (with inline data fallback)
    // ---------------------------------------------------------------
    async function init() {
        cacheDom();

        // Try inline PHP data first (bypasses REST API 403)
        var hasInlineData = useInlineData();

        try {
            if (!hasInlineData) {
                // 1. Fetch photos
                var photosData = await fetchPhotos();
                if (photosData && Array.isArray(photosData) && photosData.length > 0) {
                    state.allPhotos = buildGeoJSON(photosData);
                }

                // 2. Fetch recent posts
                var postsData = await fetchPosts();
                if (postsData && Array.isArray(postsData)) {
                    state.allPosts = postsData;
                    state.recentPosts = postsData;
                }
            }

            // 3. Render sidebar posts
            renderSidebarPosts(state.recentPosts);

            // 4. Initialize map
            initMap();

            // 5. Hitokoto & animation
            initHitokoto();
            initEntryAnimation();

            // 6. Bind UI events
            bindUIEvents();

            // 7. Sidebar default open
            openSidebar();

        } catch (err) {
            console.error('Init error:', err);
            hideLoading();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();