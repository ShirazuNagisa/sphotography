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
        markersEndpoint: 'sphotography/v1/photos',
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
        sidebarOpen: false,
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
        articleMotion: null,
        motionCard: null,
        droplets: new Map(),
        gooTimer: null,
        dropletZoom: undefined,
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
        dom.detailViewArticle = document.getElementById('detail-view-article');
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

    function fetchMarkers(params) {
        return fetchFromRest(CONFIG.markersEndpoint, { ...(params||{}) });
    }

    function fetchPosts(params) {
        return fetchFromRest(CONFIG.postsEndpoint, { per_page: CONFIG.postsPerPage, _embed: '1', ...(params||{}) });
    }

    // ---------------------------------------------------------------
    // 6. Photo Data Processing
    //
    // Markers come from the sphotography/v1/photos endpoint (or the inline
    // data mirror): one entry per geolocated image, each carrying the parent
    // post id so a marker can open its article.
    // ---------------------------------------------------------------
    function buildGeoJSONFromMarkers(markers) {
        var features = [];
        (markers || []).forEach(function (m) {
            var lat = parseFloat(m.latitude) || 0;
            var lng = parseFloat(m.longitude) || 0;
            if (lat === 0 && lng === 0) return;

            var tags = Array.isArray(m.tags) ? m.tags : [];
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: {
                    id: m.id,
                    postId: (m.post_id !== undefined ? m.post_id : m.postId) || null,
                    postTitle: m.post_title || m.postTitle || '',
                    title: m.title || m.post_title || 'Untitled',
                    description: m.description || '',
                    thumbnail: m.thumbnail || '',
                    fullImage: m.full_image || m.fullImage || '',
                    cameraInfo: m.camera_info || m.cameraInfo || '',
                    takenAt: m.taken_at || m.takenAt || '',
                    tags: tags,
                    tagSlugs: tags.map(function (t) { return t.slug; }),
                },
            });
        });
        return { type: 'FeatureCollection', features: features };
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
            positionDroplets();
        });

        // Re-evaluate clustering the moment movement stops rather than
        // waiting for full map 'idle' (which also waits on tile loads) —
        // keeps merge/split latency well under 200ms. 'idle' stays as a
        // fallback for changes without movement (e.g. data updates).
        var scheduleClusterSync = debounce(function() {
            reconcileOpenPhotoPanels();
            syncDroplets();
        }, 90);
        state.map.on('moveend', scheduleClusterSync);
        state.map.on('idle', scheduleClusterSync);

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
            // Cluster strictly by physical overlap: an individual droplet is
            // 18px across (radius 9), so two markers only overlap when their
            // centres are closer than that diameter. Points farther apart
            // render without overlap and stay separate.
            clusterMaxZoom:CONFIG.maxZoom, clusterRadius:18, clusterMinPoints:2
        });
    }

    function addPhotoLayers() {
        [CONFIG.clusterCountLayerId, CONFIG.clusterLayerId, CONFIG.layerId].forEach(function(id){if(state.map.getLayer(id))state.map.removeLayer(id);});
        // The circle/count layers are kept for hit-testing and cluster
        // queries but rendered invisible — the HTML water-droplet overlay
        // is the visible marker. queryRenderedFeatures still returns
        // opacity-0 features, so clicks and panel reconciliation are intact.
        state.map.addLayer({id:CONFIG.clusterLayerId,type:'circle',source:CONFIG.clusterSourceId,filter:['has','point_count'],paint:{'circle-color':'#e67e22','circle-radius':['step',['get','point_count'],18,10,22,50,28,200,36],'circle-opacity':0,'circle-stroke-width':2,'circle-stroke-color':'#ffffff','circle-stroke-opacity':0}});
        state.map.addLayer({id:CONFIG.clusterCountLayerId,type:'symbol',source:CONFIG.clusterSourceId,filter:['has','point_count'],layout:{'text-field':'{point_count_abbreviated}','text-size':12},paint:{'text-color':'#ffffff','text-opacity':0}});
        state.map.addLayer({id:CONFIG.layerId,type:'circle',source:CONFIG.clusterSourceId,filter:['!',['has','point_count']],paint:{'circle-color':CONFIG.markerColor,'circle-radius':CONFIG.markerRadius,'circle-stroke-width':CONFIG.markerBorderWidth,'circle-stroke-color':CONFIG.markerBorderColor,'circle-opacity':0,'circle-stroke-opacity':0}});
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
    // 8c. Water-droplet (gooey) cluster markers
    //
    // The visible markers are HTML "droplets" laid over the map, driven by
    // the same clustered source. When zoom changes the clustering, droplets
    // slide toward / away from the cluster centre and a gooey SVG filter
    // fuses close ones — reading as liquid merging and splitting. The WebGL
    // circle layers underneath stay invisible but handle all hit-testing.
    // ---------------------------------------------------------------
    var DROPLET = {
        transition: 620,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    };

    function ensureDropletLayers() {
        if (dom.dropletGoo && dom.dropletGoo.isConnected) return;
        var goo = document.createElement('div');
        goo.className = 'droplet-goo-layer';
        var labels = document.createElement('div');
        labels.className = 'droplet-label-layer';
        document.body.appendChild(goo);
        document.body.appendChild(labels);
        dom.dropletGoo = goo;
        dom.dropletLabels = labels;
    }

    // Cluster blob diameter by member count — mirrors the old circle-radius
    // step ramp (18/22/28/36 px radius → diameter).
    function dropletSize(isCluster, count) {
        if (!isCluster) return 18;
        if (count >= 200) return 60;
        if (count >= 50) return 52;
        if (count >= 10) return 40;
        return 34;
    }

    function projectCoords(coords) {
        return state.map.project(new maplibregl.LngLat(coords[0], coords[1]));
    }

    function applyDropletTransform(rec, x, y, scale, opacity) {
        rec.x = x;
        rec.y = y;
        rec.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%) scale(' + scale + ')';
        rec.el.style.opacity = opacity;
        if (rec.label) {
            rec.label.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%) scale(' + scale + ')';
            rec.label.style.opacity = opacity;
        }
    }

    function createDroplet(spec) {
        var size = dropletSize(spec.isCluster, spec.count);
        var el = document.createElement('div');
        el.className = 'droplet';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        dom.dropletGoo.appendChild(el);
        var rec = { key: spec.key, isCluster: spec.isCluster, count: spec.count, coords: spec.coords, el: el, label: null, size: size };
        if (spec.isCluster) {
            var label = document.createElement('div');
            label.className = 'droplet-label';
            label.textContent = spec.count;
            dom.dropletLabels.appendChild(label);
            rec.label = label;
        }
        return rec;
    }

    function updateDropletVisual(rec, spec) {
        rec.coords = spec.coords;
        if (rec.count !== spec.count) {
            rec.count = spec.count;
            var size = dropletSize(spec.isCluster, spec.count);
            rec.size = size;
            rec.el.style.width = size + 'px';
            rec.el.style.height = size + 'px';
            if (rec.label) rec.label.textContent = spec.count;
        }
    }

    function removeDroplet(rec) {
        if (rec.el) rec.el.remove();
        if (rec.label) rec.label.remove();
    }

    function setDropletTransit(rec, on) {
        rec.el.classList.toggle('droplet--transit', on);
        if (rec.label) rec.label.classList.toggle('droplet-label--transit', on);
    }

    function nearestPoint(collection, x, y) {
        var best = null, bestDist = Infinity;
        collection.forEach(function (item) {
            var dx = item.x - x, dy = item.y - y;
            var d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = item; }
        });
        return best;
    }

    function enableGoo() {
        if (dom.dropletGoo) dom.dropletGoo.classList.add('goo-active');
    }

    function scheduleGooDisable() {
        if (state.gooTimer) clearTimeout(state.gooTimer);
        state.gooTimer = setTimeout(function () {
            if (dom.dropletGoo) dom.dropletGoo.classList.remove('goo-active');
            state.gooTimer = null;
        }, DROPLET.transition + 80);
    }

    // Reposition existing droplets to track the map (called on every move).
    // No transition here so they follow the map rigidly without lag.
    function positionDroplets() {
        if (!state.map || !state.droplets || state.droplets.size === 0) return;
        state.droplets.forEach(function (rec) {
            // A map move means the user is interacting — track rigidly, so
            // drop any lingering transition from an in-flight split.
            if (rec.el.classList.contains('droplet--transit')) setDropletTransit(rec, false);
            var p = projectCoords(rec.coords);
            applyDropletTransform(rec, p.x, p.y, 1, 1);
        });
    }

    // Rebuild the droplet set from the clustered features and animate the
    // difference: new droplets spring out of the nearest previous one (split),
    // vanished droplets are pulled into the nearest surviving one (merge).
    function syncDroplets() {
        if (!state.map || !state.map.isStyleLoaded()) return;
        ensureDropletLayers();

        var feats = state.map.queryRenderedFeatures(undefined, {
            layers: [CONFIG.clusterLayerId, CONFIG.layerId]
        });
        var next = new Map();
        feats.forEach(function (f) {
            if (!f.geometry || !f.properties) return;
            var isCluster = f.properties.cluster_id !== undefined;
            var key = isCluster ? 'c:' + f.properties.cluster_id : 'p:' + photoId(f.properties);
            if (!isCluster && key === 'p:') return;
            if (next.has(key)) return;
            next.set(key, {
                key: key,
                isCluster: isCluster,
                count: isCluster ? (parseInt(f.properties.point_count, 10) || 2) : 1,
                coords: f.geometry.coordinates.slice()
            });
        });

        var prev = state.droplets;
        var reduced = prefersReducedMotion();
        // Clustering only changes with zoom; panning merely reveals/hides
        // markers. Animate merge/split on zoom change only, so panning
        // doesn't make markers slide in from unrelated neighbours.
        var z = state.map.getZoom();
        var zoomChanged = state.dropletZoom !== undefined && Math.abs(z - state.dropletZoom) > 0.001;
        state.dropletZoom = z;

        // Screen positions of both sets for the nearest-neighbour heuristic.
        var prevPts = [];
        prev.forEach(function (rec) {
            var p = projectCoords(rec.coords);
            rec.x = p.x; rec.y = p.y;
            prevPts.push(rec);
        });
        next.forEach(function (spec) {
            var p = projectCoords(spec.coords);
            spec.x = p.x; spec.y = p.y;
        });

        var result = new Map();
        var animating = false;

        next.forEach(function (spec, key) {
            if (prev.has(key)) {
                // Survivor — keep the element, refresh data/position in place.
                var rec = prev.get(key);
                updateDropletVisual(rec, spec);
                setDropletTransit(rec, false);
                applyDropletTransform(rec, spec.x, spec.y, 1, 1);
                result.set(key, rec);
                prev.delete(key);
            } else {
                // New droplet — split out of the nearest previous droplet.
                var rec2 = createDroplet(spec);
                var origin = (reduced || !zoomChanged) ? null : nearestPoint(prevPts, spec.x, spec.y);
                if (origin) {
                    setDropletTransit(rec2, false);
                    applyDropletTransform(rec2, origin.x, origin.y, 0.25, 0);
                    enableGoo();
                    animating = true;
                    // Next frame: transition to its real position.
                    (function (r, sx, sy) {
                        requestAnimationFrame(function () {
                            requestAnimationFrame(function () {
                                setDropletTransit(r, true);
                                applyDropletTransform(r, sx, sy, 1, 1);
                                // Drop the transition once it has played so
                                // later map moves track rigidly.
                                setTimeout(function () { setDropletTransit(r, false); }, DROPLET.transition + 40);
                            });
                        });
                    })(rec2, spec.x, spec.y);
                } else {
                    // First render or reduced motion — just place it.
                    setDropletTransit(rec2, false);
                    applyDropletTransform(rec2, spec.x, spec.y, 1, 1);
                }
                result.set(key, rec2);
            }
        });

        // Whatever remains in prev has disappeared → merge into nearest next.
        prev.forEach(function (rec) {
            if (reduced || !zoomChanged || result.size === 0) { removeDroplet(rec); return; }
            var target = nearestPoint(result, rec.x, rec.y);
            enableGoo();
            animating = true;
            setDropletTransit(rec, true);
            applyDropletTransform(rec, target ? target.x : rec.x, target ? target.y : rec.y, 0.25, 0);
            (function (r) {
                setTimeout(function () { removeDroplet(r); }, DROPLET.transition);
            })(rec);
        });

        state.droplets = result;
        if (animating) scheduleGooDisable();
    }

    // ---------------------------------------------------------------
    // 9. Sidebar
    // ---------------------------------------------------------------
    // Waterfall entrance: after the sidebar has slid open, the post cards
    // reveal one after another from top to bottom. Uses the Web Animations
    // API with a per-card delay and backwards fill, so each card holds its
    // hidden state until its turn, then settles back to the natural CSS
    // state on finish (no lingering delay to interfere with hover).
    var POST_STAGGER = {
        base: 160,   // wait for the sidebar to settle before cards appear
        step: 55,    // gap between consecutive cards
        duration: 440,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
    };

    function staggerRevealPosts() {
        var cards = dom.sidebarPosts.querySelectorAll('.post-card');
        if (!cards.length) return;
        var reduced = prefersReducedMotion();
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            // Cancel any in-flight entrance from a previous open.
            card.getAnimations().forEach(function (a) { a.cancel(); });
            if (reduced) continue;
            card.animate([
                { opacity: 0, transform: 'translateY(16px)' },
                { opacity: 1, transform: 'translateY(0)' }
            ], {
                duration: POST_STAGGER.duration,
                delay: POST_STAGGER.base + i * POST_STAGGER.step,
                easing: POST_STAGGER.easing,
                fill: 'backwards'
            });
        }
    }

    function openSidebar() {
        var wasCollapsed = !state.sidebarOpen;
        if (state.isMobile) {
            dom.sidebar.classList.add('open');
        }
        document.body.classList.remove('sidebar-collapsed');
        state.sidebarOpen = true;
        // Only run the waterfall when opening from a collapsed state, so
        // repeated openSidebar() calls (e.g. from marker clicks) don't flash.
        if (wasCollapsed) staggerRevealPosts();
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
    // 10. Article Panel — Windows Native Minimize / Restore Motion
    //
    // The article page grows out of / shrinks into its sidebar card the
    // way Windows DWM animates a window between full size and the taskbar:
    // a full-resolution snapshot of the window is scaled + translated as a
    // single rigid rectangle. We reproduce that with FLIP — a clone laid
    // out at the FULL article geometry (so content stays crisp) is mapped
    // onto the live card rect via a compositor-only transform. Only
    // transform / opacity animate, so there is no reflow and no warp.
    // ---------------------------------------------------------------
    var ARTICLE_MOTION = {
        openDuration: 260,
        closeDuration: 240,
        // Pause between collapsing the old article and expanding the new one.
        switchGap: 90,
        // Fast start, smooth middle, soft settle, no bounce (monotonic curve).
        easing: 'cubic-bezier(0.18, 0.85, 0.28, 1)'
    };

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Live geometry of a sidebar card + its scroll container, recomputed on
    // every animation so we never rely on cached or hard-coded coordinates.
    function getPostCardGeometry(postId) {
        if (postId == null) return null;
        var card = dom.sidebarPosts.querySelector('[data-post-id="' + postId + '"]');
        if (!card) return null;
        var rect = card.getBoundingClientRect();
        var listRect = dom.sidebarPosts.getBoundingClientRect();
        return {
            rect: rect,
            listRect: listRect,
            direction: rect.bottom <= listRect.top ? 'up' : (rect.top >= listRect.bottom ? 'down' : 'visible')
        };
    }

    // The article panel carries a transform while inactive, so its live
    // bounding box is offset. Read the true, untransformed layout rect.
    function measurePanelRect() {
        var panel = dom.articlePanel;
        var prevTransform = panel.style.transform;
        panel.classList.add('article-panel--instant');
        panel.style.transform = 'none';
        // Force layout so the neutralized transform is reflected in the rect.
        var rect = panel.getBoundingClientRect();
        panel.style.transform = prevTransform;
        panel.classList.remove('article-panel--instant');
        return rect;
    }

    // Rectangle the clone collapses into. Visible cards use their real rect;
    // cards scrolled out of the sidebar tuck just beyond the nearest edge so
    // the window slides into the edge instead of vanishing.
    function computeCollapseTarget(geom) {
        var rect = geom.rect, listRect = geom.listRect;
        if (geom.direction === 'up') {
            return { left: rect.left, top: listRect.top - rect.height, width: rect.width, height: rect.height };
        }
        if (geom.direction === 'down') {
            return { left: rect.left, top: listRect.bottom, width: rect.width, height: rect.height };
        }
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    // FLIP transform mapping the full panel box onto the target rect,
    // with transform-origin at the top-left corner. The effective centre
    // therefore tracks the target card automatically — no magic numbers.
    function collapseTransform(target, panelRect) {
        var sx = target.width / Math.max(1, panelRect.width);
        var sy = target.height / Math.max(1, panelRect.height);
        var tx = target.left - panelRect.left;
        var ty = target.top - panelRect.top;
        return 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + sx.toFixed(5) + ',' + sy.toFixed(5) + ')';
    }

    function readRadius(el) {
        var r = window.getComputedStyle(el).borderTopLeftRadius;
        return r || '16px';
    }

    function createMotionCard(panelRect) {
        var layer = document.getElementById('motion-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'motion-layer';
            layer.className = 'motion-layer';
            document.body.appendChild(layer);
        }
        var card = document.createElement('div');
        card.className = 'motion-card';
        card.style.left = panelRect.left + 'px';
        card.style.top = panelRect.top + 'px';
        card.style.width = panelRect.width + 'px';
        card.style.height = panelRect.height + 'px';
        card.innerHTML = '<div class="motion-card-content">' + dom.articlePanel.innerHTML + '</div>';
        layer.appendChild(card);
        return card;
    }

    function clearMotion() {
        if (state.articleMotion) {
            state.articleMotion.cancel();
            state.articleMotion = null;
        }
        if (state.motionCard) {
            state.motionCard.remove();
            state.motionCard = null;
        }
    }

    // Snap the real panel into its active/hidden state with no transition,
    // so the handoff to/from the clone is invisible (no second animation).
    function setPanelInstant(active) {
        dom.articlePanel.classList.add('article-panel--instant');
        dom.articlePanel.classList.toggle('active', active);
        // Force reflow so the transition-less change commits this frame.
        void dom.articlePanel.offsetHeight;
        requestAnimationFrame(function () {
            dom.articlePanel.classList.remove('article-panel--instant');
        });
    }

    function animateWindowsOpen(postId) {
        clearMotion();
        var geom = getPostCardGeometry(postId);
        if (!geom || state.isMobile || prefersReducedMotion()) {
            dom.articlePanel.classList.add('active');
            return;
        }
        var panelRect = measurePanelRect();
        var target = computeCollapseTarget(geom);
        var card = createMotionCard(panelRect);
        state.motionCard = card;
        // Hide the real panel instantly so no stale content shows behind the
        // clone (e.g. when switching directly from another open article).
        setPanelInstant(false);

        var panelRadius = readRadius(dom.articlePanel);
        var srcCard = dom.sidebarPosts.querySelector('[data-post-id="' + postId + '"]');
        var cardRadius = readRadius(srcCard || dom.articlePanel);

        var anim = card.animate([
            { transform: collapseTransform(target, panelRect), opacity: 0, borderRadius: cardRadius },
            { opacity: 1, offset: 0.12 },
            { transform: 'translate(0,0) scale(1,1)', opacity: 1, borderRadius: panelRadius }
        ], { duration: ARTICLE_MOTION.openDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        state.articleMotion = anim;
        anim.onfinish = function () {
            if (state.articleMotion !== anim) return;
            setPanelInstant(true);
            clearMotion();
        };
    }

    function animateWindowsClose(postId, onDone) {
        clearMotion();
        var geom = getPostCardGeometry(postId);
        if (!geom || state.isMobile || prefersReducedMotion()) {
            dom.articlePanel.classList.remove('active');
            if (onDone) onDone();
            return;
        }
        var panelRect = measurePanelRect();
        var target = computeCollapseTarget(geom);
        var card = createMotionCard(panelRect);
        state.motionCard = card;
        // Hide the real panel instantly so only the clone plays the motion.
        setPanelInstant(false);

        var panelRadius = readRadius(dom.articlePanel);
        var srcCard = dom.sidebarPosts.querySelector('[data-post-id="' + postId + '"]');
        var cardRadius = readRadius(srcCard || dom.articlePanel);

        var anim = card.animate([
            { transform: 'translate(0,0) scale(1,1)', opacity: 1, borderRadius: panelRadius },
            { opacity: 1, offset: 0.82 },
            { transform: collapseTransform(target, panelRect), opacity: 0, borderRadius: cardRadius }
        ], { duration: ARTICLE_MOTION.closeDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        state.articleMotion = anim;
        anim.onfinish = function () {
            if (state.articleMotion !== anim) return;
            clearMotion();
            if (onDone) onDone();
        };
    }

    function openArticle(postId) {
        var requestPostId = postId;
        closeAllPhotoPanels();

        // Switching from an already-open article: collapse the current one
        // first, then expand the new one after a short gap so the transition
        // reads as a deliberate hand-off rather than an abrupt swap. The
        // fetch runs in parallel with the collapse.
        var switching = state.articleOpen;
        var previousPostId = state.openedPostId;
        var collapseWait = 0;
        if (switching) {
            animateWindowsClose(previousPostId);
            collapseWait = ARTICLE_MOTION.closeDuration + ARTICLE_MOTION.switchGap;
        }

        state.openedPostId = requestPostId;
        state.articleOpen = true;
        if (!switching) {
            dom.articleTitle.textContent = '加载中...';
            dom.articleMeta.textContent = '';
            dom.articleContent.innerHTML = '';
        }
        if (state.isMobile) closeSidebar(true);

        var fetchPromise = fetchFromRest(CONFIG.postsEndpoint + '/' + requestPostId, { _embed: '1' });
        var waitPromise = collapseWait
            ? new Promise(function (resolve) { setTimeout(resolve, collapseWait); })
            : Promise.resolve();

        Promise.all([fetchPromise, waitPromise]).then(function (results) {
            var post = results[0];
            if (state.openedPostId !== requestPostId) return;
            if (!post) {
                dom.articleTitle.textContent = '文章加载失败';
                dom.articleMeta.textContent = '';
                dom.articleContent.innerHTML = '';
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
            animateWindowsOpen(requestPostId);
        });
    }

    function closeArticlePanel() {
        if (!state.articleOpen) return;
        var targetPostId = state.openedPostId;
        state.articleOpen = false;
        state.openedPostId = null;
        // Photograph articles have no source card — fall back to a plain fade.
        if (targetPostId == null || !getPostCardGeometry(targetPostId)) {
            clearMotion();
            dom.articlePanel.classList.remove('active');
            return;
        }
        animateWindowsClose(targetPostId);
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
                // Always show the large detail view first; the parent article
                // is reachable from the "查看文章" button inside it.
                openDetailPanel(props);
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

        // Link to the parent post. Hidden when the marker has no article
        // (e.g. an orphaned attachment with coordinates but no post).
        var postId = props.postId || props.post_id || null;
        if (dom.detailViewArticle) {
            if (postId) {
                dom.detailViewArticle.hidden = false;
                dom.detailViewArticle.onclick = function (event) {
                    event.stopPropagation();
                    closeDetailPanel();
                    openSidebar();
                    openArticle(postId);
                };
            } else {
                dom.detailViewArticle.hidden = true;
                dom.detailViewArticle.onclick = null;
            }
        }

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
            state.allPhotos = buildGeoJSONFromMarkers(data.photos);
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

        // Show the platform-correct modifier in the search hint (⌘ on Mac).
        var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
        if (isMac) {
            var kbdMod = document.querySelector('#sidebar-search-kbd .kbd-mod');
            if (kbdMod) kbdMod.textContent = '⌘';
        }

        document.addEventListener('keydown', function(e) {
            // Ctrl+K / ⌘+K focuses the search field.
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (!state.sidebarOpen) openSidebar();
                requestAnimationFrame(function () {
                    dom.sidebarSearch.focus();
                    dom.sidebarSearch.select();
                });
                return;
            }
            if (e.key === 'Escape' || e.key === 'Esc') {
                // Let Escape clear/blur the search field first.
                if (document.activeElement === dom.sidebarSearch && dom.sidebarSearch.value) {
                    dom.sidebarSearch.value = '';
                    filterSidebarPosts('');
                    dom.sidebarSearch.blur();
                    return;
                }
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
                var photosData = await fetchMarkers();
                if (photosData && Array.isArray(photosData) && photosData.length > 0) {
                    state.allPhotos = buildGeoJSONFromMarkers(photosData);
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
            // Sidebar starts collapsed on both desktop and mobile.
            closeSidebar(true);
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