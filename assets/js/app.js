/**
 * Sphotography - Frontend Map Application v2
 *
 * @package Sphotography
 * @version 1.1.6
 */

(function () {
    'use strict';

    const SETTINGS = typeof SphotographySettings !== 'undefined' ? SphotographySettings : {};
    const PRIMARY_COLOR = SETTINGS.primaryColor || '#e67e22';

    const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    function getMapStyle() {
        var mode = SETTINGS.nightMode || 'system';
        if (mode === 'light') return LIGHT_STYLE;
        if (mode === 'dark') return DARK_STYLE;
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
        recentPosts: [],
        allPosts: [],
        sidebarOpen: true,
        articleOpen: false,
        detailOpen: false,
        isMobile: window.innerWidth < 768,
        clickedMarker: false,
        openPhotoIds: new Set(),
        visibleEntities: new Map(),
        photoPanels: new Map(),
        reconcileToken: 0,
        openedPostId: null,
        activePhotoPanelKey: null,
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
        dom.photoPanels = document.getElementById('photo-panels');
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

    function fetchPosts(params) {
        return fetchFromRest(CONFIG.postsEndpoint, { per_page: CONFIG.postsPerPage, _embed: '1', ...(params||{}) });
    }

    // ---------------------------------------------------------------
    // 6. Photo Data Processing
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

        state.map.on('move', function() {
            positionAllPhotoPanels();
        });

        state.map.on('idle', debounce(function() {
            reconcileOpenPhotoPanels();
        }, 120));

        window.addEventListener('resize', debounce(function() {
            if (state.map) state.map.resize();
            var m = isMobileView();
            if (m !== state.isMobile) { state.isMobile = m; }
        }, 200));
    }

    function addPhotoSource(geojson) {
        var data = geojson || {type:'FeatureCollection',features:[]};
        [CONFIG.clusterSourceId, CONFIG.sourceId].forEach(function(id){if(state.map.getSource(id))state.map.removeSource(id);});
        state.map.addSource(CONFIG.clusterSourceId, {
            type:'geojson', data:data, cluster:true,
            clusterMaxZoom:CONFIG.maxZoom, clusterRadius:40, clusterMinPoints:2
        });
    }

    function addPhotoLayers() {
        [CONFIG.clusterCountLayerId, CONFIG.clusterLayerId, CONFIG.layerId].forEach(function(id){if(state.map.getLayer(id))state.map.removeLayer(id);});
        state.map.addLayer({id:CONFIG.clusterLayerId,type:'circle',source:CONFIG.clusterSourceId,filter:['has','point_count'],paint:{'circle-color':'#e67e22','circle-radius':['step',['get','point_count'],18,10,22,50,28,200,36],'circle-opacity':0.85,'circle-stroke-width':2,'circle-stroke-color':'#ffffff','circle-opacity-transition':{'duration':400}}});
        state.map.addLayer({id:CONFIG.clusterCountLayerId,type:'symbol',source:CONFIG.clusterSourceId,filter:['has','point_count'],layout:{'text-field':'{point_count_abbreviated}','text-size':12},paint:{'text-color':'#ffffff'}});
        state.map.addLayer({id:CONFIG.layerId,type:'circle',source:CONFIG.clusterSourceId,filter:['!',['has','point_count']],paint:{'circle-color':CONFIG.markerColor,'circle-radius':CONFIG.markerRadius,'circle-stroke-width':CONFIG.markerBorderWidth,'circle-stroke-color':CONFIG.markerBorderColor,'circle-opacity':0.95,'circle-opacity-transition':{'duration':400}}});
        state.map.on('mouseenter',CONFIG.layerId,function(){state.map.getCanvas().style.cursor='pointer';});
        state.map.on('mouseleave',CONFIG.layerId,function(){state.map.getCanvas().style.cursor='';});
        state.map.on('mouseenter',CONFIG.clusterLayerId,function(){state.map.getCanvas().style.cursor='pointer';});
        state.map.on('mouseleave',CONFIG.clusterLayerId,function(){state.map.getCanvas().style.cursor='';});
    }

    function updatePhotoData(geojson) {
        if (!state.map||!(state.map.isStyleLoaded()||state.map.loaded())) return;
        var source=state.map.getSource(CONFIG.clusterSourceId);
        if(source&&typeof source.setData==='function')source.setData(geojson);
    }

    // ---------------------------------------------------------------
    // 8. Map Events
    // ---------------------------------------------------------------
    function bindMapEvents() {
        state.map.on('click', CONFIG.layerId, function(e) {
            if (!e.features||e.features.length===0) return;
            state.clickedMarker = true;
            var id = photoId(e.features[0].properties);
            if (id) {
                state.openPhotoIds.clear();
                state.openPhotoIds.add(id);
                reconcileOpenPhotoPanels();
            }
            if (e.originalEvent) e.originalEvent.stopPropagation();
        });

        state.map.on('click', CONFIG.clusterLayerId, function(e) {
            if (!e.features||e.features.length===0) return;
            state.clickedMarker = true;
            var clusterFeature = e.features[0];
            getClusterLeaves(clusterFeature).then(function(leaves) {
                state.openPhotoIds.clear();
                leaves.forEach(function(leaf) {
                    var id = photoId(leaf.properties);
                    if (id) state.openPhotoIds.add(id);
                });
                reconcileOpenPhotoPanels();
            });
            if (e.originalEvent) e.originalEvent.stopPropagation();
        });

        state.map.on('click', function() {
            if (state.clickedMarker) {
                state.clickedMarker = false;
                return;
            }
            closeAllPhotoPanels();
            closeArticlePanel();
            if (state.isMobile) { closeSidebar(); }
            closeAboutCard();
        });
    }

    // ---------------------------------------------------------------
    // 8b. Cluster split/merge reconciliation
    // ---------------------------------------------------------------
    function photoId(props) {
        return props && props.id !== undefined && props.id !== null ? String(props.id) : '';
    }

    function getClusterLeaves(feature) {
        return new Promise(function(resolve) {
            var source = state.map && state.map.getSource(CONFIG.clusterSourceId);
            var props = feature && feature.properties;
            if (!source || !props || typeof source.getClusterLeaves !== 'function') {
                resolve([]);
                return;
            }
            var count = Math.max(2, parseInt(props.point_count, 10) || 2);
            if (source.getClusterLeaves.length >= 4) {
                source.getClusterLeaves(props.cluster_id, count, 0, function(err, leaves) {
                    resolve(err || !leaves ? [] : leaves);
                });
                return;
            }
            var result;
            try {
                result = source.getClusterLeaves(props.cluster_id, count, 0);
            } catch (err) {
                resolve([]);
                return;
            }
            if (result && typeof result.then === 'function') {
                result.then(function(leaves) { resolve(leaves || []); })
                    .catch(function() { resolve([]); });
            } else {
                resolve(result || []);
            }
        });
    }

    function entityFromFeature(feature) {
        if (feature.properties && feature.properties.cluster_id !== undefined) {
            return getClusterLeaves(feature).then(function(leaves) {
                return { coords: feature.geometry.coordinates, photos: leaves };
            });
        }
        return Promise.resolve({ coords: feature.geometry.coordinates, photos: [feature] });
    }

    function reconcileOpenPhotoPanels() {
        if (!state.map || !state.map.isStyleLoaded()) return;
        var token = ++state.reconcileToken;
        if (state.openPhotoIds.size === 0) {
            clearRenderedPhotoPanels();
            return;
        }

        var rendered = state.map.queryRenderedFeatures(undefined, {
            layers: [CONFIG.clusterLayerId, CONFIG.layerId]
        });
        var seenRendered = new Set();
        var tasks = [];
        rendered.forEach(function(feature) {
            if (!feature.geometry || !feature.properties) return;
            var renderedKey = feature.properties.cluster_id !== undefined
                ? 'cluster:' + feature.properties.cluster_id
                : 'photo:' + photoId(feature.properties);
            if (seenRendered.has(renderedKey)) return;
            seenRendered.add(renderedKey);
            tasks.push(entityFromFeature(feature));
        });

        Promise.all(tasks).then(function(entities) {
            if (token !== state.reconcileToken) return;
            var next = new Map();
            entities.forEach(function(entity) {
                entity.photos = entity.photos.filter(function(photo) { return !!photoId(photo.properties); });
                var ids = entity.photos.map(function(photo) { return photoId(photo.properties); }).sort();
                if (!ids.some(function(id) { return state.openPhotoIds.has(id); })) return;
                ids.forEach(function(id) { state.openPhotoIds.add(id); });
                entity.ids = ids;
                entity.key = 'members:' + ids.join(',');
                next.set(entity.key, entity);
            });
            renderVisibleEntities(next);
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

    function closeSidebar(preserveOverlays) {
        if (state.isMobile) {
            dom.sidebar.classList.remove('open');
        }
        document.body.classList.add('sidebar-collapsed');
        state.sidebarOpen = false;
        if (preserveOverlays) return;
        closeAllPhotoPanels();
        closeArticlePanel();
        dom.detailSheet.classList.remove('active');
        state.detailOpen = false;
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
                if (state.articleOpen && state.openedPostId === post.id) {
                    closeArticlePanel();
                } else {
                    openArticle(post.id);
                }
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
    // 10. Article Panel — Windows Native Scale Motion
    // ---------------------------------------------------------------
    function getPostCardGeometry(postId) {
        var card = dom.sidebarPosts.querySelector('[data-post-id="' + postId + '"]');
        if (!card) return null;
        var rect = card.getBoundingClientRect();
        var listRect = dom.sidebarPosts.getBoundingClientRect();
        return {
            rect: rect,
            listRect: listRect,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            visible: rect.bottom > listRect.top && rect.top < listRect.bottom,
            direction: rect.top < listRect.top ? 'up' : (rect.bottom > listRect.bottom ? 'down' : 'visible')
        };
    }

    function createMotionRoot() {
        var existing = document.getElementById('motion-layer');
        if (existing) return existing;
        var layer = document.createElement('div');
        layer.id = 'motion-layer';
        layer.className = 'motion-layer';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
        return layer;
    }

    function ensureMotionPanel() {
        if (dom.motionPanel) return dom.motionPanel;
        var layer = createMotionRoot();
        var panel = document.createElement('div');
        panel.id = 'motion-panel';
        panel.className = 'motion-panel';
        panel.innerHTML = '<div class="motion-panel-surface"><div class="motion-panel-frame"></div></div>';
        layer.appendChild(panel);
        dom.motionPanel = panel;
        dom.motionSurface = panel.querySelector('.motion-panel-surface');
        dom.motionFrame = panel.querySelector('.motion-panel-frame');
        return panel;
    }

    function setMotionFrameContent(html) {
        ensureMotionPanel();
        dom.motionFrame.innerHTML = html;
    }

    function showMotionPanelFromGeometry(geom, html) {
        ensureMotionPanel();
        setMotionFrameContent(html);
        var rect = geom && geom.rect ? geom.rect : null;
        if (!rect) {
            dom.motionPanel.classList.add('motion-panel--open');
            dom.motionPanel.style.transform = '';
            return;
        }
        dom.motionPanel.style.left = rect.left + 'px';
        dom.motionPanel.style.top = rect.top + 'px';
        dom.motionPanel.style.width = rect.width + 'px';
        dom.motionPanel.style.height = rect.height + 'px';
        dom.motionPanel.classList.add('motion-panel--open');
        requestAnimationFrame(function () {
            dom.motionPanel.classList.add('motion-panel--expand');
        });
    }

    function updateMotionPanelToArticle(targetGeom) {
        if (!dom.motionPanel) return;
        var articleRect = dom.articlePanel.getBoundingClientRect();
        var rect = targetGeom && targetGeom.rect ? targetGeom.rect : articleRect;
        dom.motionPanel.style.left = rect.left + 'px';
        dom.motionPanel.style.top = rect.top + 'px';
        dom.motionPanel.style.width = rect.width + 'px';
        dom.motionPanel.style.height = rect.height + 'px';
        dom.motionPanel.classList.add('motion-panel--open');
        dom.motionPanel.classList.add('motion-panel--expanded');
    }

    function animateMotionOpen(postId, articleHtml) {
        var geom = getPostCardGeometry(postId);
        if (!geom) {
            dom.articlePanel.classList.add('active');
            return;
        }
        showMotionPanelFromGeometry(geom, articleHtml);
        var panel = dom.motionPanel;
        var target = dom.articlePanel.getBoundingClientRect();
        if (!target.width || !target.height) {
            dom.articlePanel.classList.add('active');
            return;
        }
        var dx = target.left - geom.rect.left;
        var dy = target.top - geom.rect.top;
        var sx = target.width / Math.max(1, geom.rect.width);
        var sy = target.height / Math.max(1, geom.rect.height);
        panel.animate([
            { transform: 'translate3d(0,0,0) scale(1)', borderRadius: '18px', filter: 'blur(0px)' },
            { transform: 'translate3d(' + (dx * 0.32) + 'px,' + (dy * 0.32) + 'px,0) scale(' + (1 + (sx - 1) * 0.32).toFixed(4) + ',' + (1 + (sy - 1) * 0.32).toFixed(4) + ')', borderRadius: '16px', offset: 0.22 },
            { transform: 'translate3d(' + (dx * 0.68) + 'px,' + (dy * 0.68) + 'px,0) scale(' + (1 + (sx - 1) * 0.68).toFixed(4) + ',' + (1 + (sy - 1) * 0.68).toFixed(4) + ')', borderRadius: '14px', offset: 0.62 },
            { transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')', borderRadius: '12px', filter: 'blur(0px)' }
        ], { duration: 520, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }).onfinish = function () {
            dom.motionPanel.classList.remove('motion-panel--expand');
            dom.motionPanel.classList.add('motion-panel--hidden');
            dom.articlePanel.classList.add('active');
            dom.articlePanel.style.willChange = '';
            dom.motionPanel.classList.remove('motion-panel--open');
        };
    }

    function animateMotionClose(postId) {
        var geom = getPostCardGeometry(postId);
        if (!geom || !dom.motionPanel) {
            dom.articlePanel.classList.remove('active');
            return;
        }
        var panel = dom.motionPanel;
        var articleRect = dom.articlePanel.getBoundingClientRect();
        var dx = geom.rect.left - articleRect.left;
        var dy = geom.rect.top - articleRect.top;
        var sx = Math.max(0.18, geom.rect.width / Math.max(1, articleRect.width));
        var sy = Math.max(0.18, geom.rect.height / Math.max(1, articleRect.height));
        panel.classList.remove('motion-panel--hidden');
        panel.animate([
            { transform: 'translate3d(0,0,0) scale(1)', borderRadius: '12px', opacity: 1 },
            { transform: 'translate3d(' + (dx * 0.28) + 'px,' + (dy * 0.28) + 'px,0) scale(' + (1 + (sx - 1) * 0.28).toFixed(4) + ',' + (1 + (sy - 1) * 0.28).toFixed(4) + ')', borderRadius: '14px', offset: 0.22 },
            { transform: 'translate3d(' + (dx * 0.72) + 'px,' + (dy * 0.72) + 'px,0) scale(' + (1 + (sx - 1) * 0.72).toFixed(4) + ',' + (1 + (sy - 1) * 0.72).toFixed(4) + ')', borderRadius: '16px', offset: 0.62 },
            { transform: 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')', borderRadius: '18px', opacity: 0.15 }
        ], { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).onfinish = function () {
            dom.motionPanel.classList.remove('motion-panel--open', 'motion-panel--expand', 'motion-panel--expanded');
            dom.motionPanel.remove();
            dom.motionPanel = null;
            dom.motionSurface = null;
            dom.motionFrame = null;
            dom.articlePanel.classList.remove('active');
        };
    }

    function openArticle(postId) {
        var requestPostId = postId;
        closeAllPhotoPanels();
        if (state.articleOpen) {
            if (state.openedPostId && state.openedPostId !== requestPostId) {
                animateMotionClose(state.openedPostId);
            }
        }
        state.openedPostId = requestPostId;
        state.articleOpen = true;
        dom.articleTitle.textContent = '加载中...';
        dom.articleMeta.textContent = '';
        dom.articleContent.innerHTML = '';
        dom.articlePanel.style.willChange = 'transform, opacity';
        if (state.isMobile) closeSidebar(true);
        fetchFromRest(CONFIG.postsEndpoint + '/' + requestPostId, { _embed: '1' }).then(function(post) {
            if (state.openedPostId !== requestPostId) return;
            if (!post) {
                dom.articleTitle.textContent = '文章加载失败';
                dom.articlePanel.classList.add('active');
                return;
            }
            var dateStr = post.date ? formatDate(post.date.split('T')[0]) : '';
            dom.articleTitle.textContent = post.title.rendered || '';
            var metaHtml = '';
            if (dateStr) metaHtml += '<span>' + escapeHtml(dateStr) + '</span>';
            if (post._embedded && post._embedded['wp:term']) {
                post._embedded['wp:term'].forEach(function(ta) { ta.forEach(function(t) { if (t.taxonomy === 'category' || t.taxonomy === 'region_tag') metaHtml += '<span style="color:var(--primary);font-size:0.75rem;">#' + escapeHtml(t.name) + '</span>'; }); });
            }
            dom.articleMeta.innerHTML = metaHtml;
            var articleHtml = post.content && post.content.rendered ? post.content.rendered : '<p style="color:var(--text-muted)">暂无内容</p>';
            dom.articleContent.innerHTML = articleHtml;
            dom.articleContent.querySelectorAll('a').forEach(function(a) { if(!a.href.startsWith(window.location.origin)) a.target='_blank'; });
            animateMotionOpen(requestPostId, articleHtml);
        });
    }

    function closeArticlePanel() {
        if (!state.articleOpen) return;
        var targetPostId = state.openedPostId;
        state.articleOpen = false;
        state.openedPostId = null;
        if (!targetPostId) return;
        animateMotionClose(targetPostId);
    }
    // ---------------------------------------------------------------
    // 11. Dynamic Photo Grid Panels
    // ---------------------------------------------------------------
    var PHOTO_GRID_MARGIN = 16;
    var PANEL_PADDING = 16;
    var THUMB_SIZE = 120;

    function normalizePhotoProperties(properties) {
        var props = properties || {};
        if (typeof props.tags === 'string') {
            try { props.tags = JSON.parse(props.tags); } catch (err) { props.tags = []; }
        }
        return props;
    }

    function dismissPhotoPanelWithAnim(key) {
        var panel = state.photoPanels.get(key);
        if (!panel || panel.dismissing) return;
        panel.dismissing = true;
        var el = panel.element;
        el.classList.add('photo-grid-panel--dismiss');
        el.classList.remove('active');
        setTimeout(function() {
            if (state.photoPanels.get(key) !== panel) return;
            el.remove();
            state.photoPanels.delete(key);
        }, 400);
    }

    function renderVisibleEntities(nextEntities) {
        var prevActiveKey = state.activePhotoPanelKey;
        var keys = Array.from(nextEntities.keys());
        var newActiveKey = keys.length > 0
            ? (nextEntities.has(prevActiveKey) ? prevActiveKey : keys[0])
            : null;
        state.activePhotoPanelKey = newActiveKey;

        state.photoPanels.forEach(function(panel, key) {
            if (!nextEntities.has(key)) {
                dismissPhotoPanelWithAnim(key);
            }
        });

        nextEntities.forEach(function(entity, key) {
            var panel = state.photoPanels.get(key);
            if (!panel) {
                panel = createPhotoPanel(entity, key === newActiveKey);
                state.photoPanels.set(key, panel);
            } else {
                panel.entity = entity;
                panel.element.classList.toggle('active', key === newActiveKey);
                panel.element.classList.remove('photo-grid-panel--dismiss');
            }
        });

        state.visibleEntities = nextEntities;
        positionAllPhotoPanels();
        if (!state.isMobile && nextEntities.size > 0) openSidebar();

        requestAnimationFrame(function() {
            state.photoPanels.forEach(function(panel) {
                panel.element.classList.add('photo-grid-panel--positioned');
            });
        });
    }

    function createPhotoPanel(entity, isActive) {
        if (typeof isActive === 'undefined') isActive = true;
        var element = document.createElement('div');
        element.className = 'photo-grid-panel glass-panel' + (isActive ? ' active' : '');
        element.setAttribute('role', 'dialog');
        element.setAttribute('aria-modal', 'false');
        element.setAttribute('aria-label', entity.photos.length > 1 ? 'Photo cluster' : 'Photo');

        var close = document.createElement('button');
        close.className = 'panel-close-btn';
        close.setAttribute('aria-label', 'Close photo grid');
        close.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        var title = document.createElement('div');
        title.className = 'photo-grid-title';
        title.textContent = entity.photos.length > 1 ? '聚合（' + entity.photos.length + ' 张）' : '';

        var container = document.createElement('div');
        container.className = 'photo-grid-container';
        var cols = Math.max(1, Math.min(entity.photos.length, 3));
        element.style.width = (cols * THUMB_SIZE + (cols - 1) * 10 + PANEL_PADDING * 2) + 'px';
        container.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';

        entity.photos.forEach(function(feature) {
            var props = normalizePhotoProperties(feature.properties || feature);
            var item = document.createElement('div');
            item.className = 'photo-grid-item';
            var imgUrl = props.thumbnail || props.fullImage || '';
            item.innerHTML = (imgUrl
                ? '<img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(props.title) + '" loading="lazy">'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem;">无图</div>')
                + '<div class="photo-item-overlay">' + escapeHtml(props.title) + '</div>';
            item.addEventListener('click', function(event) {
                event.stopPropagation();
                closeAllPhotoPanels();
                if (state.isMobile) {
                    openDetailPanel(props);
                } else {
                    openSidebar();
                    openPhotographArticle(props.id, props);
                }
            });
            container.appendChild(item);
        });

        close.addEventListener('click', function(event) {
            event.stopPropagation();
            entity.ids.forEach(function(id) { state.openPhotoIds.delete(id); });
            reconcileOpenPhotoPanels();
        });
        element.addEventListener('click', function(event) { event.stopPropagation(); });
        element.appendChild(close);
        element.appendChild(title);
        element.appendChild(container);
        dom.photoPanels.appendChild(element);
        return { element: element, entity: entity };
    }

    function positionAllPhotoPanels() {
        var index = 0;
        state.photoPanels.forEach(function(panel) {
            positionPhotoPanel(panel.element, panel.entity.coords, index++);
        });
    }

    function positionPhotoPanel(panel, coords, index) {
        if (!state.map || !coords) return;
        var panelW = panel.offsetWidth || parseInt(panel.style.width, 10) || 200;
        var panelH = panel.offsetHeight || 200;
        var screenPoint = state.map.project(new maplibregl.LngLat(coords[0], coords[1]));
        var left = screenPoint.x + PHOTO_GRID_MARGIN;
        var top = screenPoint.y - panelH / 2 + (index % 3) * 18;
        if (left + panelW > window.innerWidth - 20) left = screenPoint.x - panelW - PHOTO_GRID_MARGIN;
        left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12));
        top = Math.max(12, Math.min(top, window.innerHeight - panelH - 12));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function hasOpenPhotoPanels() {
        return state.photoPanels.size > 0;
    }

    function clearRenderedPhotoPanels() {
        state.photoPanels.forEach(function(panel) { panel.element.remove(); });
        state.photoPanels.clear();
        state.visibleEntities.clear();
        state.activePhotoPanelKey = null;
    }

    function closeAllPhotoPanels() {
        state.reconcileToken++;
        state.openPhotoIds.clear();
        clearRenderedPhotoPanels();
    }

    // ---------------------------------------------------------------
    // 12. Photograph Article Panel
    // ---------------------------------------------------------------
    function openPhotographArticle(photoId, props) {
        closeAllPhotoPanels();
        if (state.articleOpen) {
            dom.articlePanel.getAnimations().forEach(function(animation) { animation.cancel(); });
        }
        state.openedPostId = null;
        dom.articleTitle.textContent = props.title || 'Photograph';
        dom.articleMeta.innerHTML = props.cameraInfo
            ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/></svg>' + escapeHtml(props.cameraInfo) + '</span>'
            : '';
        if (props.takenAt) {
            dom.articleMeta.innerHTML += '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + formatDate(props.takenAt) + '</span>';
        }
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
        if (state.isMobile) closeSidebar(true);
    }

    // ---------------------------------------------------------------
    // 13. Detail Panel
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
    // 19. Use inline PHP data
    // ---------------------------------------------------------------
    function useInlineData() {
        if (typeof SphotographyInlineData === 'undefined') return false;
        var data = SphotographyInlineData;

        if (data.photos && data.photos.length > 0) {
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
                    },
                });
            });

            state.allPhotos = { type: 'FeatureCollection', features: features };
        }

        if (data.posts && data.posts.length > 0) {
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
        dom.sidebarToggle.addEventListener('click', function(e) { e.stopPropagation(); toggleSidebar(); });
        dom.sidebarExpand.addEventListener('click', function(e) { e.stopPropagation(); openSidebar(); });
        dom.sidebarSearch.addEventListener('input', debounce(function() { filterSidebarPosts(this.value); }, 300));
        dom.articleClose.addEventListener('click', function(e) { e.stopPropagation(); closeArticlePanel(); });
        dom.closeDetail.addEventListener('click', function(e) { e.stopPropagation(); closeDetailPanel(); });
        dom.aboutTrigger.addEventListener('click', function(e) { toggleAboutCard(e); });
        dom.aboutCard.addEventListener('click', function(e) { e.stopPropagation(); });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' || e.key === 'Esc') {
                closeAllPhotoPanels();
                closeArticlePanel();
                dom.detailSheet.classList.remove('active');
                state.detailOpen = false;
                closeAboutCard();
            }
        });

        dom.articlePanel.addEventListener('click', function(e) { e.stopPropagation(); });
        dom.detailSheet.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // ---------------------------------------------------------------
    // 21. Main Init
    // ---------------------------------------------------------------
    async function init() {
        cacheDom();

        var hasInlineData = useInlineData();

        try {
            if (!hasInlineData) {
                var photosData = await fetchPhotos();
                if (photosData && Array.isArray(photosData) && photosData.length > 0) {
                    state.allPhotos = buildGeoJSON(photosData);
                }

                var postsData = await fetchPosts();
                if (postsData && Array.isArray(postsData)) {
                    state.allPosts = postsData;
                    state.recentPosts = postsData;
                }
            }

            renderSidebarPosts(state.recentPosts);
            initMap();
            initHitokoto();
            initEntryAnimation();
            bindUIEvents();
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