/**
 * Sphotography - Frontend Map Application v2
 *
 * @package Sphotography
 * @version 1.2.5
 */

(function () {
    'use strict';

    const SETTINGS = typeof SphotographySettings !== 'undefined' ? SphotographySettings : {};
    const APP = typeof Sphotography !== 'undefined' ? Sphotography : {};
    const PRIMARY_COLOR = SETTINGS.primaryColor || '#e67e22';

    const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    // Exact `background` layer colors of the two basemaps above — used so the
    // flythrough preloader can land on the same color the map reveals.
    const MAP_BG_DARK = '#0e0e0e';   // dark-matter
    const MAP_BG_LIGHT = '#fafaf8';  // positron

    // Built-in presets. Hosted vector styles ship their own tiles + glyphs;
    // raster presets are wrapped in an inline MapLibre style pointing at free,
    // no-API-key tile providers (attribution is surfaced by AttributionControl).
    const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
    const WATERCOLOR_STYLE = 'https://tiles.stadiamaps.com/styles/stamen_watercolor.json';

    function rasterStyle(tiles, attribution, maxzoom) {
        return {
            version: 8,
            sources: {
                'sp-raster': {
                    type: 'raster',
                    tiles: tiles,
                    tileSize: 256,
                    maxzoom: maxzoom || 19,
                    attribution: attribution,
                },
            },
            layers: [{ id: 'sp-raster', type: 'raster', source: 'sp-raster' }],
        };
    }

    function satelliteStyle() {
        return rasterStyle(
            ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
            19
        );
    }

    function terrainStyle() {
        return rasterStyle(
            ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
             'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
             'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
            'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
            17
        );
    }

    function resolveMapIsLight() {
        var mode = SETTINGS.nightMode || 'system';
        if (mode === 'light') return true;
        if (mode === 'dark') return false;
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    }

    // The night-mode-driven basemap: this is what "auto" resolves to and what
    // any failed custom/preset style falls back to.
    function autoStyle() {
        return resolveMapIsLight() ? LIGHT_STYLE : DARK_STYLE;
    }

    function customStyleUrl() {
        var url = (SETTINGS.mapStyleCustomUrl || '').trim();
        return /^https:\/\//i.test(url) ? url : '';
    }

    // Is the effective basemap the auto (night-mode) style? True for the "auto"
    // preset and for "custom" with an empty/invalid URL (which falls back).
    function usingAutoStyle() {
        var choice = SETTINGS.mapStyle || 'auto';
        if (choice === 'auto') return true;
        if (choice === 'custom') return customStyleUrl() === '';
        return false;
    }

    // Resolve the configured style to a MapLibre `style` value: a hosted URL
    // string, or an inline style object for the raster presets.
    function getMapStyle() {
        switch (SETTINGS.mapStyle || 'auto') {
            case 'satellite':  return satelliteStyle();
            case 'terrain':    return terrainStyle();
            case 'voyager':    return VOYAGER_STYLE;
            case 'watercolor': return WATERCOLOR_STYLE;
            case 'custom':     return customStyleUrl() || autoStyle();
            case 'auto':
            default:           return autoStyle();
        }
    }

    function getMapBgColor() {
        return resolveMapIsLight() ? MAP_BG_LIGHT : MAP_BG_DARK;
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
        commentsEndpoint: 'wp/v2/comments',
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
        // Cluster merge distance — tied to droplet diameter by default (18px),
        // exposed as a setting (10–60). See addPhotoSource().
        clusterRadius: (function () {
            var r = parseInt(SETTINGS.clusterRadius, 10);
            return (r >= 10 && r <= 60) ? r : 18;
        })(),
    };

    // ---------------------------------------------------------------
    // 1b. Motion personality (v1.2.5)
    //
    // The admin passes only raw picker values; the tier→value table and all
    // resolution live here so there is one source of truth. The resolved
    // droplet duration/easing are also written to CSS custom properties so the
    // .droplet--transit rule (a CSS transition) stays in sync with the JS
    // timing that drives its cleanup setTimeouts.
    // ---------------------------------------------------------------
    var MOTION_TIERS = {
        subtle:     { artOpen: 180, artClose: 160, switchGap: 60,  artEase: 'cubic-bezier(0.33,0,0.2,1)',    drop: 380, dropEase: 'cubic-bezier(0.33,0,0.2,1)' },
        standard:   { artOpen: 260, artClose: 240, switchGap: 90,  artEase: 'cubic-bezier(0.18,0.85,0.28,1)', drop: 620, dropEase: 'cubic-bezier(0.22,1,0.36,1)' },
        expressive: { artOpen: 340, artClose: 300, switchGap: 120, artEase: 'cubic-bezier(0.16,1,0.3,1)',     drop: 820, dropEase: 'cubic-bezier(0.34,1.3,0.5,1)' }
    };
    // Named easing overrides. Article never offers 'spring' (stays monotonic),
    // but resolution is shared; the admin UI simply doesn't expose it there.
    var EASING_PRESETS = {
        'linear':      'linear',
        'ease-out':    'cubic-bezier(0.16,1,0.3,1)',
        'ease-in-out': 'cubic-bezier(0.65,0,0.35,1)',
        'sharp':       'cubic-bezier(0.4,0,0.2,1)',
        'spring':      'cubic-bezier(0.34,1.3,0.5,1)'
    };

    function motionScale(v) {
        var n = parseInt(v, 10);
        if (!(n >= 50 && n <= 200)) n = 100;
        return n / 100;
    }
    function motionEasing(choice, fallback) {
        return (choice && choice !== 'inherit' && EASING_PRESETS[choice]) ? EASING_PRESETS[choice] : fallback;
    }
    function resolveMotion() {
        var tier = MOTION_TIERS[SETTINGS.motionTier] ? MOTION_TIERS[SETTINGS.motionTier] : MOTION_TIERS.standard;
        var artScale = motionScale(SETTINGS.motionArticleScale);
        var dropScale = motionScale(SETTINGS.motionDropletScale);
        return {
            article: {
                openDuration: Math.round(tier.artOpen * artScale),
                closeDuration: Math.round(tier.artClose * artScale),
                switchGap: Math.round(tier.switchGap * artScale),
                easing: motionEasing(SETTINGS.motionArticleEasing, tier.artEase)
            },
            droplet: {
                transition: Math.round(tier.drop * dropScale),
                easing: motionEasing(SETTINGS.motionDropletEasing, tier.dropEase)
            }
        };
    }
    var MOTION_RESOLVED = resolveMotion();
    // Drive the CSS .droplet--transit rule from the resolved values.
    try {
        var _root = document.documentElement;
        _root.style.setProperty('--sp-droplet-duration', MOTION_RESOLVED.droplet.transition + 'ms');
        _root.style.setProperty('--sp-droplet-ease', MOTION_RESOLVED.droplet.easing);
    } catch (e) {}

    // ---------------------------------------------------------------
    // 1c. Tag colour (v1.2.5)
    //
    // Per-region_tag colouring. Colours are resolved server-side (override or
    // slug hash) and delivered as a slug→{name,color} map, so the frontend
    // never hashes anything — it just looks up. Falls back to the theme
    // primary when a tag has no colour or a droplet shares no common tag.
    // ---------------------------------------------------------------
    // Marker mode (v1.2.6): 'droplet' | 'tag' | 'region'. Mutually exclusive;
    // replaces the old boolean tag_color flag.
    var MARKER_MODE = SETTINGS.markerMode || 'droplet';

    var TAG = {
        enabled: MARKER_MODE === 'tag',
        map: (SETTINGS.tagColors && typeof SETTINGS.tagColors === 'object') ? SETTINGS.tagColors : {},
        color: function (slug) {
            var e = this.map[slug];
            return (e && e.color) ? e.color : PRIMARY_COLOR;
        },
        name: function (slug) {
            var e = this.map[slug];
            return (e && e.name) ? e.name : slug;
        }
    };

    // Feature properties survive clustering, but queryRenderedFeatures may
    // hand array values back as JSON strings — normalise to an array.
    function featureTagSlugs(props) {
        if (!props) return [];
        var t = props.tagSlugs;
        if (typeof t === 'string') {
            try { t = JSON.parse(t); } catch (e) { t = t ? [t] : []; }
        }
        return Array.isArray(t) ? t : [];
    }

    // Colour for a single point: its first tag, else primary.
    function pointColor(slugs) {
        if (!TAG.enabled || !slugs || !slugs.length) return PRIMARY_COLOR;
        return TAG.color(slugs[0]);
    }

    // Majority tag across a set of leaf features: most frequent slug wins,
    // ties broken by slug alphabetical order; no tags at all → null (primary).
    function majorityTagSlug(leaves) {
        var counts = {};
        (leaves || []).forEach(function (leaf) {
            featureTagSlugs(leaf.properties).forEach(function (s) {
                counts[s] = (counts[s] || 0) + 1;
            });
        });
        var best = null, bestCount = 0;
        Object.keys(counts).sort().forEach(function (s) {
            if (counts[s] > bestCount) { bestCount = counts[s]; best = s; }
        });
        return best;
    }

    // ---------------------------------------------------------------
    // 1d. Administrative-region colouring (v1.2.6)
    //
    // In 'region' mode the droplets are replaced by filled admin regions
    // (province worldwide, plus city inside China). Each photo carries its
    // resolved province/city adcode (computed server-side); we group photos by
    // the id for the chosen granularity and fill only the regions that hold
    // photos with the theme colour. Clicking a region opens a fused photo
    // panel. Photos with no resolved region fall back to normal droplets.
    // ---------------------------------------------------------------
    var REGION = {
        active: MARKER_MODE === 'region',
        granularity: (SETTINGS.regionGranularity === 'city') ? 'city' : 'province',
        opacity: (function () { var n = parseInt(SETTINGS.regionIntensity, 10); return (n >= 0 && n <= 100) ? n / 100 : 0.35; })(),
        geo: (typeof SphotographyGeo !== 'undefined' && SphotographyGeo && SphotographyGeo.features) ? SphotographyGeo : { type: 'FeatureCollection', features: [] },
        byId: {},        // region id → boundary feature
        photos: {},      // region id → [photo features]
        centroids: {},   // region id → [lng, lat]
        used: null,      // FeatureCollection of regions that hold photos
        sourceId: 'sp-regions',
        fillLayerId: 'sp-region-fill',
        lineLayerId: 'sp-region-line',
        hoverLayerId: 'sp-region-hover'
    };

    // The region id a photo colours, honouring the granularity + China-only
    // city fallback: city granularity uses the city adcode when present, else
    // the province adcode; province granularity always uses the province.
    function regionIdForPhoto(props) {
        if (!props) return '';
        var prov = props.provAdcode || '';
        var city = props.cityAdcode || '';
        if (REGION.granularity === 'city' && city) return city;
        return prov || '';
    }

    // Bounding-box centre of a Polygon/MultiPolygon — the panel anchor point.
    function geomCentroid(geom) {
        var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        var polys = (geom.type === 'Polygon') ? [geom.coordinates] : geom.coordinates;
        polys.forEach(function (poly) {
            poly.forEach(function (ring) {
                ring.forEach(function (pt) {
                    if (pt[0] < minx) minx = pt[0];
                    if (pt[0] > maxx) maxx = pt[0];
                    if (pt[1] < miny) miny = pt[1];
                    if (pt[1] > maxy) maxy = pt[1];
                });
            });
        });
        return [(minx + maxx) / 2, (miny + maxy) / 2];
    }

    // Partition photos into region-matched (grouped by id) and unmatched (kept
    // for the droplet fallback source). Builds the render FeatureCollection.
    function buildRegionData() {
        REGION.byId = {};
        REGION.photos = {};
        REGION.centroids = {};
        (REGION.geo.features || []).forEach(function (f) {
            var id = f.properties && f.properties.id != null ? String(f.properties.id) : '';
            if (id) REGION.byId[id] = f;
        });

        var unmatched = [];
        var feats = (state.allPhotos && state.allPhotos.features) ? state.allPhotos.features : [];
        feats.forEach(function (f) {
            var id = regionIdForPhoto(f.properties);
            if (id && REGION.byId[id]) {
                (REGION.photos[id] = REGION.photos[id] || []).push(f);
            } else {
                unmatched.push(f);
            }
        });

        var usedFeatures = [];
        Object.keys(REGION.photos).forEach(function (id) {
            var f = REGION.byId[id];
            usedFeatures.push(f);
            REGION.centroids[id] = geomCentroid(f.geometry);
        });
        REGION.used = { type: 'FeatureCollection', features: usedFeatures };
        state.regionUnmatched = { type: 'FeatureCollection', features: unmatched };
    }

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
        tipTimer: null,
        filterOpen: false,
        filterMotion: null,
        selectedCategories: new Set(),
        searchQuery: '',
        mapFlyId: 0,
        regionPanels: new Map(),
        regionUnmatched: null,
        pulseDot: null,
    };

    // ---------------------------------------------------------------
    // 3. DOM Cache
    // ---------------------------------------------------------------
    const dom = {};
    function cacheDom() {
        dom.map = document.getElementById('map');
        dom.loadingOverlay = document.getElementById('loading-overlay');
        dom.loadingTip = document.getElementById('loading-tip');
        dom.sidebar = document.getElementById('sidebar');
        dom.sidebarPosts = document.getElementById('sidebar-posts');
        dom.sidebarToggle = document.getElementById('sidebar-toggle');
        dom.sidebarExpand = document.getElementById('sidebar-expand');
        dom.sidebarSearch = document.getElementById('sidebar-search-input');
        dom.filterBtn = document.getElementById('sidebar-filter-btn');
        dom.filterPanel = document.getElementById('sidebar-filter-panel');
        dom.filterChips = document.getElementById('filter-chips');
        dom.articlePanel = document.getElementById('article-panel');
        dom.articleClose = document.getElementById('article-close');
        dom.articleTitle = document.getElementById('article-title');
        dom.articleMeta = document.getElementById('article-meta');
        dom.articleContent = document.getElementById('article-content');
        dom.articleComments = document.getElementById('article-comments');
        dom.photoPanels = document.getElementById('photo-panels');
        dom.detailSheet = document.getElementById('detail-sheet');
        dom.closeDetail = document.getElementById('close-detail');
        dom.detailImg = document.getElementById('detail-img');
        dom.detailTitle = document.getElementById('detail-title');
        dom.detailMeta = document.getElementById('detail-meta');
        dom.detailDesc = document.getElementById('detail-desc');
        dom.detailTags = document.getElementById('detail-tags');
        dom.detailViewArticle = document.getElementById('detail-view-article');
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

    // Word count + reading estimate from rendered article HTML. CJK characters
    // are counted individually; runs of Latin letters/digits count as words.
    // HTML/media is stripped so only visible text feeds the count. Returns null
    // when there's no readable text (e.g. photo-only posts) so the meta unit is
    // omitted rather than showing "0 字".
    var SP_CJK_RE = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
    function computeReadingInfo(html) {
        if (!html) return null;
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var drop = tmp.querySelectorAll('script,style');
        for (var i = 0; i < drop.length; i++) { drop[i].parentNode.removeChild(drop[i]); }
        var text = (tmp.textContent || '').trim();
        if (!text) return null;
        var cjkMatches = text.match(SP_CJK_RE);
        var cjk = cjkMatches ? cjkMatches.length : 0;
        var latinText = text.replace(SP_CJK_RE, ' ');
        var latinMatches = latinText.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g);
        var latin = latinMatches ? latinMatches.length : 0;
        var total = cjk + latin;
        if (total <= 0) return null;
        var cjkSpeed = SETTINGS.readingSpeedCjk || 300;
        var latinSpeed = SETTINGS.readingSpeedLatin || 200;
        var minutes = Math.ceil(cjk / cjkSpeed + latin / latinSpeed);
        if (minutes < 1) minutes = 1;
        return { words: total, minutes: minutes };
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
                    provAdcode: m.prov_adcode || m.provAdcode || '',
                    cityAdcode: m.city_adcode || m.cityAdcode || '',
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
            state.mapLoaded = true;
            // Region mode: only the unmatched photos become droplets; matched
            // ones are represented by the filled regions instead.
            addPhotoSource(REGION.active ? state.regionUnmatched : state.allPhotos);
            addPhotoLayers();
            if (REGION.active) addRegionLayers();
            bindMapEvents();
            hideLoading();
        });
        state.map.on('error', function(e) {
            var msg = (e && e.error && e.error.message) || e;
            console.warn('Map error:', msg);
            // A custom/preset style that fails to load before the map ever
            // finishes: fall back once to the auto (night-mode) basemap so the
            // map still renders rather than dying on a broken style URL.
            if (!state.mapLoaded && !state.styleFellBack && !usingAutoStyle()) {
                state.styleFellBack = true;
                applyAutoFallbackStyle();
                return;
            }
            onMapFatalError();
        });

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

    // Swap the failed style for the auto basemap, then re-add our photo source
    // and layers and finish the load sequence the normal 'load' path would have.
    function applyAutoFallbackStyle() {
        try {
            state.map.setStyle(autoStyle());
        } catch (err) {
            onMapFatalError();
            return;
        }
        state.map.once('idle', function() {
            if (!state.map.getSource(CONFIG.clusterSourceId)) {
                addPhotoSource(REGION.active ? state.regionUnmatched : state.allPhotos);
                addPhotoLayers();
                if (REGION.active) addRegionLayers();
            }
            if (!state.mapLoaded) {
                state.mapLoaded = true;
                bindMapEvents();
                hideLoading();
            }
        });
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
            clusterMaxZoom:CONFIG.maxZoom, clusterRadius:CONFIG.clusterRadius, clusterMinPoints:2
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
    // 7b. Region fill layers (region mode)
    // ---------------------------------------------------------------
    function addRegionLayers() {
        if (!REGION.used) return;
        [REGION.hoverLayerId, REGION.lineLayerId, REGION.fillLayerId].forEach(function (id) {
            if (state.map.getLayer(id)) state.map.removeLayer(id);
        });
        if (state.map.getSource(REGION.sourceId)) state.map.removeSource(REGION.sourceId);

        state.map.addSource(REGION.sourceId, { type: 'geojson', data: REGION.used, promoteId: 'id' });
        // Base fill (theme colour at the configured intensity).
        state.map.addLayer({
            id: REGION.fillLayerId, type: 'fill', source: REGION.sourceId,
            paint: { 'fill-color': PRIMARY_COLOR, 'fill-opacity': REGION.opacity }
        });
        // Hover highlight — a brighter overlay for the feature under the cursor.
        state.map.addLayer({
            id: REGION.hoverLayerId, type: 'fill', source: REGION.sourceId,
            paint: {
                'fill-color': PRIMARY_COLOR,
                'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], Math.min(1, REGION.opacity + 0.25), 0]
            }
        });
        // Outline for legibility.
        state.map.addLayer({
            id: REGION.lineLayerId, type: 'line', source: REGION.sourceId,
            paint: { 'line-color': PRIMARY_COLOR, 'line-width': 1, 'line-opacity': 0.85 }
        });

        var hoveredId = null;
        var setHover = function (id, on) {
            if (id == null) return;
            state.map.setFeatureState({ source: REGION.sourceId, id: id }, { hover: on });
        };
        state.map.on('mousemove', REGION.fillLayerId, function (e) {
            if (!e.features || !e.features.length) return;
            state.map.getCanvas().style.cursor = 'pointer';
            var id = e.features[0].id != null ? e.features[0].id : (e.features[0].properties && e.features[0].properties.id);
            if (id !== hoveredId) { setHover(hoveredId, false); hoveredId = id; setHover(hoveredId, true); }
        });
        state.map.on('mouseleave', REGION.fillLayerId, function () {
            state.map.getCanvas().style.cursor = '';
            setHover(hoveredId, false); hoveredId = null;
        });
        state.map.on('click', REGION.fillLayerId, function (e) {
            if (!e.features || !e.features.length) return;
            state.clickedMarker = true; // suppress the map-background close handler
            var props = e.features[0].properties || {};
            var id = props.id != null ? String(props.id) : '';
            if (id) openRegionPanel(id);
            if (e.originalEvent) e.originalEvent.stopPropagation();
        });
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
        });

        // Region-mode pulse dot: any manual pan/zoom is the "next interaction"
        // that clears it. Fires harmlessly before a dot exists.
        if (REGION.active) {
            state.map.on('dragstart', removePulseDot);
            state.map.on('zoomstart', removePulseDot);
        }
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
            dismissAllPhotoPanels();
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
    var DROPLET = MOTION_RESOLVED.droplet;

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

    // Recolour a droplet. Empty/primary clears the override so the CSS default
    // (var(--primary)) applies; the radial sheen is preserved via CSS.
    function applyDropletColor(rec, color) {
        rec.color = color || '';
        if (color && color !== PRIMARY_COLOR) {
            rec.el.style.setProperty('--droplet-color', color);
        } else {
            rec.el.style.removeProperty('--droplet-color');
        }
    }

    function createDroplet(spec) {
        var size = dropletSize(spec.isCluster, spec.count);
        var el = document.createElement('div');
        el.className = 'droplet';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        dom.dropletGoo.appendChild(el);
        var rec = { key: spec.key, isCluster: spec.isCluster, count: spec.count, coords: spec.coords, el: el, label: null, size: size, color: '', clusterId: spec.clusterId };
        if (TAG.enabled) applyDropletColor(rec, spec.color);
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
        if (spec.isCluster && spec.clusterId !== undefined) rec.clusterId = spec.clusterId;
        // Non-cluster (point) colour can update in place; cluster colour is
        // owned by the async majority resolver, so don't clobber it here.
        if (TAG.enabled && !spec.isCluster && spec.color !== undefined && spec.color !== rec.color) {
            applyDropletColor(rec, spec.color);
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
            var spec = {
                key: key,
                isCluster: isCluster,
                count: isCluster ? (parseInt(f.properties.point_count, 10) || 2) : 1,
                coords: f.geometry.coordinates.slice()
            };
            if (TAG.enabled) {
                if (isCluster) {
                    // Preliminary colour; the majority tag resolves async below.
                    spec.color = PRIMARY_COLOR;
                    spec.clusterId = f.properties.cluster_id;
                } else {
                    spec.color = pointColor(featureTagSlugs(f.properties));
                }
            }
            next.set(key, spec);
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
        if (TAG.enabled) resolveClusterColors(result);
    }

    // Cluster colour = majority tag among its leaves (ties by slug order),
    // resolved asynchronously from the clustered source. Runs only on the
    // debounced sync, and only for clusters, so the leaf queries stay cheap.
    function resolveClusterColors(dropletMap) {
        var source = state.map && state.map.getSource(CONFIG.clusterSourceId);
        if (!source || typeof source.getClusterLeaves !== 'function') return;
        dropletMap.forEach(function (rec) {
            if (!rec.isCluster || rec.clusterColorFor === rec.key + ':' + rec.count) return;
            var clusterId = rec.clusterId;
            if (clusterId === undefined) return;
            var limit = Math.max(2, rec.count || 2);
            var handle = function (leaves) {
                if (state.droplets.get(rec.key) !== rec) return; // gone/replaced
                var slug = majorityTagSlug(leaves || []);
                applyDropletColor(rec, slug ? TAG.color(slug) : PRIMARY_COLOR);
                rec.clusterColorFor = rec.key + ':' + rec.count;
            };
            try {
                if (source.getClusterLeaves.length >= 4) {
                    source.getClusterLeaves(clusterId, limit, 0, function (err, leaves) { if (!err) handle(leaves); });
                } else {
                    var p = source.getClusterLeaves(clusterId, limit, 0);
                    if (p && typeof p.then === 'function') p.then(handle).catch(function () {});
                }
            } catch (e) {}
        });
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
        closeFilterPanel();
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
        var isLarge = SETTINGS.articleCardSize === 'large';
        posts.forEach(function(post) {
            var card = document.createElement('div');
            card.className = isLarge ? 'post-card post-card--large' : 'post-card';
            card.dataset.postId = post.id;

            var thumbUrl = '';
            if (post._embedded && post._embedded['wp:featuredmedia']) {
                var m = post._embedded['wp:featuredmedia'][0];
                if (m) thumbUrl = (m.media_details && m.media_details.sizes && m.media_details.sizes.thumbnail && m.media_details.sizes.thumbnail.source_url) || m.source_url || '';
            }

            var dateStr = post.date ? formatDate(post.date.split('T')[0]) : '';

            // Large cards add the article excerpt beneath the title.
            var excerptHtml = '';
            if (isLarge) {
                var excerptText = stripHtml((post.excerpt && post.excerpt.rendered) || '').trim();
                if (excerptText) {
                    excerptHtml = '<div class="post-card-excerpt">' + escapeHtml(excerptText) + '</div>';
                }
            }

            card.innerHTML = ''
                + '<img class="post-card-thumb" src="' + (thumbUrl || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
                + '<div class="post-card-body">'
                + '<div class="post-card-title">' + escapeHtml(post.title.rendered || '') + '</div>'
                + excerptHtml
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

    // Categories (WordPress 分类) attached to a post, from either the REST
    // embed or the inline-data mirror.
    function getPostCategories(post) {
        var cats = [];
        if (post._embedded && post._embedded['wp:term']) {
            post._embedded['wp:term'].forEach(function (group) {
                (group || []).forEach(function (t) {
                    if (t && t.taxonomy === 'category') cats.push({ slug: t.slug, name: t.name });
                });
            });
        }
        return cats;
    }

    function filterSidebarPosts(query) {
        state.searchQuery = query || '';
        applySidebarFilters();
    }

    // Real-time combined filter: text search AND (any of) the selected
    // categories. The sidebar shows only the matching posts.
    function applySidebarFilters() {
        var q = (state.searchQuery || '').toLowerCase().trim();
        var selected = state.selectedCategories;
        var filtered = state.allPosts.filter(function (p) {
            if (q) {
                var matchesText = (p.title.rendered || '').toLowerCase().indexOf(q) !== -1
                    || stripHtml(p.excerpt && p.excerpt.rendered || '').toLowerCase().indexOf(q) !== -1;
                if (!matchesText) return false;
            }
            if (selected && selected.size > 0) {
                var cats = getPostCategories(p);
                var hit = cats.some(function (c) { return selected.has(c.slug); });
                if (!hit) return false;
            }
            return true;
        });
        renderSidebarPosts(filtered);
    }

    // ---------------------------------------------------------------
    // 9b. Category Filter — real-time, panel expands from the filter button
    // ---------------------------------------------------------------
    function buildFilterChips() {
        if (!dom.filterChips) return;
        // Unique categories across all loaded posts.
        var seen = {};
        var cats = [];
        (state.allPosts || []).forEach(function (p) {
            getPostCategories(p).forEach(function (c) {
                if (c.slug && !seen[c.slug]) { seen[c.slug] = true; cats.push(c); }
            });
        });
        cats.sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (cats.length === 0) {
            dom.filterChips.innerHTML = '<span class="filter-chips-empty">暂无分类可筛选</span>';
            return;
        }
        dom.filterChips.innerHTML = '';
        cats.forEach(function (c) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'filter-chip' + (state.selectedCategories.has(c.slug) ? ' is-selected' : '');
            chip.textContent = c.name;
            chip.dataset.slug = c.slug;
            chip.addEventListener('click', function (e) {
                e.stopPropagation();
                if (state.selectedCategories.has(c.slug)) {
                    state.selectedCategories.delete(c.slug);
                    chip.classList.remove('is-selected');
                } else {
                    state.selectedCategories.add(c.slug);
                    chip.classList.add('is-selected');
                }
                // Reflect whether any filter is active on the button.
                dom.filterBtn.classList.toggle('is-active', state.selectedCategories.size > 0);
                applySidebarFilters(); // real-time, no confirm needed
            });
            dom.filterChips.appendChild(chip);
        });
    }

    // ---------------------------------------------------------------
    // Tag colour legend (v1.2.5)
    //
    // A compact, collapsible key of the region_tags present on this map. Only
    // built when tag colouring + legend are both on. Lists tags used by loaded
    // markers (stable — doesn't flicker as clusters merge), sorted by name.
    // Desktop: expanded panel bottom-left; mobile: collapsed to a "图例" pill.
    // ---------------------------------------------------------------
    function buildLegend() {
        if (!TAG.enabled || !SETTINGS.tagLegend) return;
        if (dom.tagLegend) { dom.tagLegend.remove(); dom.tagLegend = null; }

        var seen = {};
        var tags = [];
        var feats = (state.allPhotos && state.allPhotos.features) ? state.allPhotos.features : [];
        feats.forEach(function (f) {
            var arr = (f.properties && Array.isArray(f.properties.tags)) ? f.properties.tags : [];
            arr.forEach(function (t) {
                if (t && t.slug && !seen[t.slug]) {
                    seen[t.slug] = true;
                    tags.push({ slug: t.slug, name: TAG.name(t.slug), color: TAG.color(t.slug) });
                }
            });
        });
        if (!tags.length) return;
        tags.sort(function (a, b) { return a.name.localeCompare(b.name); });

        var panel = document.createElement('div');
        panel.className = 'tag-legend';
        if (isMobileView()) panel.classList.add('tag-legend--collapsed');

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'tag-legend-toggle';
        toggle.setAttribute('aria-label', '标签配色图例');
        toggle.innerHTML = '<span class="tag-legend-toggle-icon" aria-hidden="true"></span><span class="tag-legend-toggle-text">图例</span>';
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.classList.toggle('tag-legend--collapsed');
        });

        var list = document.createElement('div');
        list.className = 'tag-legend-list';
        tags.forEach(function (t) {
            var item = document.createElement('div');
            item.className = 'tag-legend-item';
            var sw = document.createElement('span');
            sw.className = 'tag-legend-swatch';
            sw.style.background = t.color;
            var lbl = document.createElement('span');
            lbl.className = 'tag-legend-name';
            lbl.textContent = t.name;
            item.appendChild(sw);
            item.appendChild(lbl);
            list.appendChild(item);
        });

        panel.appendChild(toggle);
        panel.appendChild(list);
        document.body.appendChild(panel);
        dom.tagLegend = panel;
    }

    // Uses the article panel's window-scale motion: the panel grows out of the
    // filter button and collapses back into it, recomputed live each time.
    function openFilterPanel() {
        if (state.filterOpen || !dom.filterPanel) return;
        state.filterOpen = true;
        dom.filterBtn.setAttribute('aria-expanded', 'true');
        if (state.filterMotion) { state.filterMotion.cancel(); state.filterMotion = null; }

        dom.filterPanel.hidden = false;
        // Measure resting geometry, then animate from the button rect.
        var panelRect = dom.filterPanel.getBoundingClientRect();
        var btnRect = dom.filterBtn.getBoundingClientRect();
        if (prefersReducedMotion()) return;
        var from = collapseTransform(btnRect, panelRect);
        var anim = dom.filterPanel.animate([
            { transform: from, opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { transform: 'translate(0,0) scale(1,1)', opacity: 1 }
        ], { duration: ARTICLE_MOTION.openDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        state.filterMotion = anim;
        anim.onfinish = function () { if (state.filterMotion === anim) { anim.cancel(); state.filterMotion = null; } };
    }

    function closeFilterPanel() {
        if (!state.filterOpen || !dom.filterPanel) return;
        state.filterOpen = false;
        dom.filterBtn.setAttribute('aria-expanded', 'false');
        if (state.filterMotion) { state.filterMotion.cancel(); state.filterMotion = null; }

        if (prefersReducedMotion()) { dom.filterPanel.hidden = true; return; }
        var panelRect = dom.filterPanel.getBoundingClientRect();
        var btnRect = dom.filterBtn.getBoundingClientRect();
        var to = collapseTransform(btnRect, panelRect);
        var anim = dom.filterPanel.animate([
            { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
            { opacity: 1, offset: 0.82 },
            { transform: to, opacity: 0 }
        ], { duration: ARTICLE_MOTION.closeDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        state.filterMotion = anim;
        anim.onfinish = function () {
            if (state.filterMotion !== anim) return;
            anim.cancel();
            state.filterMotion = null;
            dom.filterPanel.hidden = true;
        };
    }

    function toggleFilterPanel() {
        if (state.filterOpen) closeFilterPanel();
        else openFilterPanel();
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
    var ARTICLE_MOTION = MOTION_RESOLVED.article;

    // Effective reduced-motion gate: the OS preference wins by default, unless
    // the site owner opted to override it (motionIgnoreReduced).
    function prefersReducedMotion() {
        if (SETTINGS.motionIgnoreReduced) return false;
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

    function openArticle(postId, options) {
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
            if (SETTINGS.readingInfo && post.content && post.content.rendered) {
                var ri = computeReadingInfo(post.content.rendered);
                if (ri) {
                    metaHtml += '<span class="article-reading-info">' + ri.words.toLocaleString('en-US') + ' 字 · 约 ' + ri.minutes + ' 分钟</span>';
                }
            }
            if (post._embedded && post._embedded['wp:term']) {
                post._embedded['wp:term'].forEach(function(ta) { ta.forEach(function(t) {
                    if (t.taxonomy !== 'category' && t.taxonomy !== 'region_tag') return;
                    // When tag colouring is on, region_tag chips get a leading
                    // colour dot (text/background stay unchanged).
                    var dot = '';
                    if (TAG.enabled && t.taxonomy === 'region_tag' && t.slug) {
                        dot = '<span class="tag-chip-dot" style="background:' + escapeHtml(TAG.color(t.slug)) + ';"></span>';
                    }
                    metaHtml += '<span class="article-term-chip" style="color:var(--primary);font-size:0.75rem;">' + dot + '#' + escapeHtml(t.name) + '</span>';
                }); });
            }
            dom.articleMeta.innerHTML = metaHtml;
            var articleHtml = post.content && post.content.rendered ? post.content.rendered : '<p style="color:var(--text-muted)">暂无内容</p>';
            dom.articleContent.innerHTML = articleHtml;
            dom.articleContent.querySelectorAll('a').forEach(function(a) { if(!a.href.startsWith(window.location.origin)) a.target='_blank'; });
            wireArticleImages();
            renderComments(requestPostId, post.comment_status);
            animateWindowsOpen(requestPostId);
            // Desktop (Feature 1): once the window-scale open settles, glide
            // the panel to the paragraph that holds the clicked photo.
            if (options && (options.scrollToImageId != null || options.scrollToImageUrl)) {
                var scrollId = options.scrollToImageId;
                var scrollUrl = options.scrollToImageUrl;
                setTimeout(function () {
                    if (state.openedPostId !== requestPostId) return;
                    scrollArticleToImage(scrollId, scrollUrl);
                }, ARTICLE_MOTION.openDuration + 60);
            }
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
    // 10c. Photo ↔ Map linking (desktop)
    //
    // A marker's `id` is the image's attachment id, and WordPress tags body
    // images with `wp-image-<id>`. That shared id is the reliable join
    // between an article-content image and its geolocated marker (coords).
    // ---------------------------------------------------------------

    // Look up a geolocated marker by image attachment id. The same image can
    // appear in several posts, but every such marker shares the image's
    // coordinates, so the first match is authoritative for position.
    function photoGeoById(id) {
        if (id == null || !state.allPhotos || !state.allPhotos.features) return null;
        var key = String(id);
        var feats = state.allPhotos.features;
        for (var i = 0; i < feats.length; i++) {
            var f = feats[i];
            if (f && f.properties && String(f.properties.id) === key && f.geometry && f.geometry.coordinates) {
                return { coords: f.geometry.coordinates, postId: f.properties.postId };
            }
        }
        return null;
    }

    // Strip a WordPress size suffix (e.g. "-1024x768") so medium/full/scaled
    // variants of the same upload compare equal by file stem.
    function imageStem(url) {
        if (!url) return '';
        var base = url.split('/').pop().split('?')[0];
        return base.replace(/-\d+x\d+(?=\.\w+$)/, '');
    }

    // Resolve the marker (coords) behind a rendered content image: prefer the
    // wp-image-<id> class, fall back to matching the file stem against the
    // marker set. Returns null for non-geolocated images.
    function photoGeoForImage(img) {
        var m = /wp-image-(\d+)/.exec(img.className || '');
        if (m) {
            var byId = photoGeoById(m[1]);
            if (byId) return byId;
        }
        var src = img.currentSrc || img.getAttribute('src') || '';
        var stem = imageStem(src);
        if (!stem) return null;
        var feats = (state.allPhotos && state.allPhotos.features) || [];
        for (var i = 0; i < feats.length; i++) {
            var p = feats[i].properties || {};
            if ((p.fullImage && imageStem(p.fullImage) === stem) ||
                (p.thumbnail && imageStem(p.thumbnail) === stem)) {
                return { coords: feats[i].geometry.coordinates, postId: p.postId };
            }
        }
        return null;
    }

    // Feature 2: make geolocated content images clickable (desktop only) so a
    // click flies the background map to that photo's location.
    function wireArticleImages() {
        var root = dom.articleContent;
        if (!root || state.isMobile) return;
        var imgs = root.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
            (function (img) {
                var geo = photoGeoForImage(img);
                if (!geo) return; // non-geo images stay inert
                img.classList.add('article-geo-img');
                img.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    flyMapToPhoto(geo.coords);
                });
            })(imgs[i]);
        }
    }

    // Centre of the visible map area to the right of the (open) article panel.
    // Read the panel's live rect so it adapts to width / window size.
    function rightMapAreaCenter() {
        var W = window.innerWidth, H = window.innerHeight;
        var panelRight = W * 0.5;
        if (dom.articlePanel) {
            var r = dom.articlePanel.getBoundingClientRect();
            if (r.width) panelRight = r.right;
        }
        return { x: (panelRight + W) / 2, y: H / 2 };
    }

    // ease-in-out sine — the "--ease-in-out-sine" token, as a JS easing fn for
    // MapLibre's animation options (accel then decel, no overshoot).
    function easeInOutSine(t) {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    // MapLibre zoom that renders `metersPerCm` at the 96dpi CSS reference
    // (1cm = 96/2.54 CSS px), matching the on-screen ScaleControl. Web Mercator
    // scale is latitude-dependent, so the target zoom is computed at `lat`.
    function zoomForScale(metersPerCm, lat) {
        var CSS_PX_PER_CM = 96 / 2.54; // ≈ 37.795
        var metersPerPixel = metersPerCm / CSS_PX_PER_CM;
        var latRad = lat * Math.PI / 180;
        return Math.log2(156543.03392 * Math.cos(latRad) / metersPerPixel);
    }

    // Feature 2 motion: pan the map (at current zoom) so the point rests at the
    // right-map-area centre, brief beat, then zoom about that pixel to 5km/1cm.
    // Two eased stages read like a hand dragging, then zooming in.
    function flyMapToPhoto(coords) {
        if (!state.map || !coords || state.isMobile) return;
        var lngLat = new maplibregl.LngLat(coords[0], coords[1]);
        var target = rightMapAreaCenter();
        var offset = [target.x - window.innerWidth / 2, target.y - window.innerHeight / 2];

        var targetZoom = zoomForScale(5000, coords[1]);
        targetZoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, targetZoom));

        var flyId = ++state.mapFlyId;
        removePulseDot(); // a fresh fly supersedes any previous dot

        // Phase 1 — pan at the current zoom until the point hits the target pixel.
        state.map.easeTo({
            center: lngLat,
            offset: offset,
            duration: 1200,
            easing: easeInOutSine
        });

        // Phase 2 — after a short beat, zoom about that same pixel (`around`
        // pins the point in place while the scale changes).
        state.map.once('moveend', function () {
            if (flyId !== state.mapFlyId) return; // superseded by a newer click
            setTimeout(function () {
                if (flyId !== state.mapFlyId) return;
                state.map.easeTo({
                    zoom: targetZoom,
                    around: lngLat,
                    duration: 1600,
                    easing: easeInOutSine
                });
                // Region mode: mark the exact photo location once the zoom
                // settles (no droplet exists there to show it otherwise).
                if (REGION.active) {
                    state.map.once('moveend', function () {
                        if (flyId !== state.mapFlyId) return;
                        showPulseDot(coords);
                    });
                }
            }, 100);
        });
    }

    // Locate a content image by attachment id (wp-image-<id>) or, failing that,
    // by file stem — the node the article should scroll to.
    function findContentImage(imgId, imgUrl) {
        var root = dom.articleContent;
        if (!root) return null;
        if (imgId != null) {
            var byClass = root.querySelector('img.wp-image-' + imgId);
            if (byClass) return byClass;
        }
        var stem = imageStem(imgUrl);
        if (stem) {
            var imgs = root.querySelectorAll('img');
            for (var i = 0; i < imgs.length; i++) {
                var src = imgs[i].currentSrc || imgs[i].getAttribute('src') || '';
                if (imageStem(src) === stem) return imgs[i];
            }
        }
        return null;
    }

    // Eased scrollTop animation on an element (ease-in-out quad).
    function animateScroll(el, from, to, duration) {
        if (prefersReducedMotion() || Math.abs(to - from) < 2) { el.scrollTop = to; return; }
        var start = null;
        function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / duration);
            el.scrollTop = from + (to - from) * ease(p);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Feature 1 motion: glide the article panel so the target image rests ~18%
    // below the panel's top edge. Silent no-op (rest at top) if not found.
    function scrollArticleToImage(imgId, imgUrl) {
        var panel = dom.articlePanel;
        var img = findContentImage(imgId, imgUrl);
        if (!panel || !img) return;
        var panelRect = panel.getBoundingClientRect();
        var imgRect = img.getBoundingClientRect();
        var current = panel.scrollTop;
        var target = current + (imgRect.top - panelRect.top) - panelRect.height * 0.18;
        var max = panel.scrollHeight - panel.clientHeight;
        target = Math.max(0, Math.min(target, max));
        animateScroll(panel, current, target, 650);
    }

    // ---------------------------------------------------------------
    // 10b. Article Comments (WordPress comment system, inline via REST)
    // ---------------------------------------------------------------
    function buildCommentItem(c) {
        var name = escapeHtml((c.author_name || '匿名').trim() || '匿名');
        var dateStr = c.date ? formatDate(c.date.split('T')[0]) : '';
        var avatar = '';
        if (c.author_avatar_urls) {
            var url = c.author_avatar_urls['48'] || c.author_avatar_urls['96'] || c.author_avatar_urls['24'];
            if (url) avatar = '<img class="comment-avatar" src="' + escapeHtml(url) + '" alt="" loading="lazy">';
        }
        if (!avatar) {
            avatar = '<span class="comment-avatar comment-avatar--placeholder">' + name.charAt(0).toUpperCase() + '</span>';
        }
        // content.rendered is sanitized HTML from WordPress.
        var body = (c.content && c.content.rendered) ? c.content.rendered : '';
        return ''
            + '<li class="comment-item">'
            +   avatar
            +   '<div class="comment-body">'
            +     '<div class="comment-head"><span class="comment-author">' + name + '</span>'
            +       (dateStr ? '<span class="comment-date">' + escapeHtml(dateStr) + '</span>' : '')
            +     '</div>'
            +     '<div class="comment-text">' + body + '</div>'
            +   '</div>'
            + '</li>';
    }

    function renderComments(postId, commentStatus) {
        var wrap = dom.articleComments;
        if (!wrap) return;
        var isOpen = commentStatus !== 'closed';
        wrap.innerHTML = ''
            + '<div class="comments-section">'
            +   '<h4 class="comments-title"><span class="comments-count-label">评论</span> <span class="comments-count">…</span></h4>'
            +   '<ul class="comment-list" id="comment-list"></ul>'
            +   (isOpen ? buildCommentFormHtml() : '<p class="comments-closed">' + escapeHtml(APP.commentsClosedText || '评论已关闭。') + '</p>')
            + '</div>';

        var listEl = wrap.querySelector('#comment-list');
        var countEl = wrap.querySelector('.comments-count');

        // Fetch approved comments for this post.
        fetchFromRest(CONFIG.commentsEndpoint, { post: postId, per_page: 100, order: 'asc', orderby: 'date' })
            .then(function (comments) {
                if (state.openedPostId !== postId) return;
                comments = Array.isArray(comments) ? comments : [];
                countEl.textContent = comments.length ? '(' + comments.length + ')' : '(0)';
                if (comments.length === 0) {
                    listEl.innerHTML = '<li class="comments-empty">还没有评论，来抢沙发吧。</li>';
                    return;
                }
                listEl.innerHTML = comments.map(buildCommentItem).join('');
            });

        if (isOpen) wireCommentForm(postId, listEl, countEl);
    }

    function buildCommentFormHtml() {
        var loggedIn = !!APP.loggedIn;
        var identityRow = loggedIn
            ? '<p class="comment-identity">以 <strong>' + escapeHtml(APP.currentUserName || '') + '</strong> 的身份评论</p>'
            : ''
                + '<div class="comment-fields">'
                +   '<input type="text" class="comment-input" id="comment-author" placeholder="昵称 *" autocomplete="name" required>'
                +   '<input type="email" class="comment-input" id="comment-email" placeholder="邮箱（不公开）*" autocomplete="email" required>'
                + '</div>';
        return ''
            + '<form class="comment-form" id="comment-form" novalidate>'
            +   identityRow
            +   '<textarea class="comment-textarea" id="comment-content" rows="3" placeholder="写下你的评论…" required></textarea>'
            +   '<div class="comment-form-footer">'
            +     '<span class="comment-feedback" id="comment-feedback"></span>'
            +     '<button type="submit" class="comment-submit">发表评论</button>'
            +   '</div>'
            + '</form>';
    }

    function wireCommentForm(postId, listEl, countEl) {
        var form = dom.articleComments.querySelector('#comment-form');
        if (!form) return;
        form.addEventListener('click', function (e) { e.stopPropagation(); });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var feedback = form.querySelector('#comment-feedback');
            var submitBtn = form.querySelector('.comment-submit');
            var contentEl = form.querySelector('#comment-content');
            var content = (contentEl.value || '').trim();
            feedback.className = 'comment-feedback';
            if (!content) { feedback.textContent = '请输入评论内容。'; feedback.classList.add('is-error'); return; }

            var payload = { post: postId, content: content };
            if (!APP.loggedIn) {
                var authorEl = form.querySelector('#comment-author');
                var emailEl = form.querySelector('#comment-email');
                var author = (authorEl.value || '').trim();
                var email = (emailEl.value || '').trim();
                if (!author || !email) { feedback.textContent = '请填写昵称与邮箱。'; feedback.classList.add('is-error'); return; }
                payload.author_name = author;
                payload.author_email = email;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '提交中…';
            feedback.textContent = '';

            fetch(CONFIG.restBase + '/' + CONFIG.commentsEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': APP.restNonce || '' },
                body: JSON.stringify(payload)
            }).then(function (res) {
                return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            }).then(function (result) {
                submitBtn.disabled = false;
                submitBtn.textContent = '发表评论';
                if (!result.ok) {
                    var msg = (result.data && result.data.message) ? stripHtml(result.data.message) : '评论提交失败，请稍后再试。';
                    feedback.textContent = msg;
                    feedback.classList.add('is-error');
                    return;
                }
                var c = result.data;
                contentEl.value = '';
                if (c && c.status && c.status !== 'approved') {
                    feedback.textContent = '评论已提交，等待审核后显示。';
                    feedback.classList.add('is-success');
                    return;
                }
                // Append the freshly approved comment and update the count.
                var empty = listEl.querySelector('.comments-empty');
                if (empty) listEl.innerHTML = '';
                listEl.insertAdjacentHTML('beforeend', buildCommentItem(c));
                var current = parseInt((countEl.textContent || '').replace(/\D/g, ''), 10) || 0;
                countEl.textContent = '(' + (current + 1) + ')';
                feedback.textContent = '评论发表成功！';
                feedback.classList.add('is-success');
            }).catch(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = '发表评论';
                feedback.textContent = '网络错误，请稍后再试。';
                feedback.classList.add('is-error');
            });
        });
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

    // Live screen position of a map coordinate — recomputed at animation time
    // so the panel always grows from / shrinks into the marker's current spot.
    function pointRectFor(coords) {
        if (!state.map || !coords) return null;
        var p = state.map.project(new maplibregl.LngLat(coords[0], coords[1]));
        return { left: p.x, top: p.y, width: 1, height: 1 };
    }

    // Grow the panel out of its map point (same window-scale motion as the
    // article panel: a FLIP transform with a top-left origin).
    function animatePhotoPanelOpen(el, coords) {
        if (!el || state.isMobile || prefersReducedMotion()) return;
        var target = pointRectFor(coords);
        var panelRect = el.getBoundingClientRect();
        if (!target || !panelRect.width || !panelRect.height) return;
        if (el._photoMotion) { el._photoMotion.cancel(); el._photoMotion = null; }
        var from = collapseTransform(target, panelRect);
        var anim = el.animate([
            { transform: from, opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { transform: 'translate(0,0) scale(1,1)', opacity: 1 }
        ], { duration: ARTICLE_MOTION.openDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        el._photoMotion = anim;
        anim.onfinish = function () { if (el._photoMotion === anim) { anim.cancel(); el._photoMotion = null; } };
    }

    // Shrink the panel back into its map point, then run onDone (removal).
    function animatePhotoPanelClose(el, coords, onDone) {
        if (!el) { if (onDone) onDone(); return; }
        el.style.pointerEvents = 'none';
        var target = pointRectFor(coords);
        var panelRect = el.getBoundingClientRect();
        if (state.isMobile || prefersReducedMotion() || !target || !panelRect.width) {
            el.classList.add('photo-grid-panel--dismiss');
            el.classList.remove('active');
            setTimeout(function () { if (onDone) onDone(); }, 400);
            return;
        }
        if (el._photoMotion) { el._photoMotion.cancel(); el._photoMotion = null; }
        var to = collapseTransform(target, panelRect);
        var anim = el.animate([
            { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
            { opacity: 1, offset: 0.82 },
            { transform: to, opacity: 0 }
        ], { duration: ARTICLE_MOTION.closeDuration, easing: ARTICLE_MOTION.easing, fill: 'both' });
        el._photoMotion = anim;
        anim.onfinish = function () { if (onDone) onDone(); };
    }

    function dismissPhotoPanelWithAnim(key) {
        var panel = state.photoPanels.get(key);
        if (!panel || panel.dismissing) return;
        panel.dismissing = true;
        var el = panel.element;
        animatePhotoPanelClose(el, panel.entity && panel.entity.coords, function () {
            el.remove();
            if (state.photoPanels.get(key) === panel) state.photoPanels.delete(key);
        });
    }

    // Shrink every open panel back into its point, then drop them all.
    function dismissAllPhotoPanels() {
        if (state.photoPanels.size === 0) {
            state.visibleEntities.clear();
            state.activePhotoPanelKey = null;
            return;
        }
        var panels = Array.from(state.photoPanels.values());
        state.photoPanels = new Map();
        state.visibleEntities = new Map();
        state.activePhotoPanelKey = null;
        panels.forEach(function (panel) {
            var el = panel.element;
            animatePhotoPanelClose(el, panel.entity && panel.entity.coords, function () { el.remove(); });
        });
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

        var newlyCreated = [];
        nextEntities.forEach(function(entity, key) {
            var panel = state.photoPanels.get(key);
            if (!panel) {
                panel = createPhotoPanel(entity, key === newActiveKey);
                state.photoPanels.set(key, panel);
                newlyCreated.push(panel);
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
            // Grow freshly opened panels out of their corresponding map point.
            newlyCreated.forEach(function(panel) {
                if (panel.element.classList.contains('active')) {
                    animatePhotoPanelOpen(panel.element, panel.entity.coords);
                }
            });
        });
    }

    function createPhotoPanel(entity, isActive, opts) {
        if (typeof isActive === 'undefined') isActive = true;
        opts = opts || {};
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
                // Mobile keeps the large detail sheet (parent article reachable
                // via its "查看文章" button). Desktop opens the parent article
                // directly and glides to the paragraph holding this image.
                if (state.isMobile) {
                    closeAllPhotoPanels();
                    openDetailPanel(props);
                    return;
                }
                var postId = props.postId || props.post_id || null;
                if (!postId) {
                    closeAllPhotoPanels();
                    openDetailPanel(props);
                    return;
                }
                openSidebar();
                openArticle(postId, {
                    scrollToImageId: props.id,
                    scrollToImageUrl: props.fullImage || props.thumbnail || ''
                });
            });
            container.appendChild(item);
        });

        close.addEventListener('click', function(event) {
            event.stopPropagation();
            if (opts.onClose) { opts.onClose(); return; }
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
        positionRegionPanels();
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

    function closeAllPhotoPanels() {
        state.reconcileToken++;
        state.openPhotoIds.clear();
        dismissAllPhotoPanels();
        closeAllRegionPanels();
    }

    // ---------------------------------------------------------------
    // 12b. Region photo panels (region mode)
    //
    // Kept in their own map so the droplet reconcile loop (which rebuilds
    // state.photoPanels from rendered clusters) never dismisses them. Only one
    // region panel is open at a time, anchored at the region centroid.
    // ---------------------------------------------------------------
    function openRegionPanel(id) {
        var photos = REGION.photos[id] || [];
        if (!photos.length) return;
        closeAllRegionPanels();
        var entity = {
            coords: REGION.centroids[id] || (photos[0].geometry && photos[0].geometry.coordinates),
            photos: photos,
            ids: photos.map(function (f) { return photoId(f.properties); }),
            key: 'region:' + id
        };
        var panel = createPhotoPanel(entity, true, { onClose: closeAllRegionPanels });
        state.regionPanels.set(entity.key, panel);
        positionPhotoPanel(panel.element, entity.coords, 0);
        if (!state.isMobile) openSidebar();
        requestAnimationFrame(function () {
            panel.element.classList.add('photo-grid-panel--positioned');
            animatePhotoPanelOpen(panel.element, entity.coords);
        });
    }

    function closeAllRegionPanels() {
        if (!state.regionPanels || state.regionPanels.size === 0) return;
        var panels = Array.from(state.regionPanels.values());
        state.regionPanels = new Map();
        panels.forEach(function (panel) {
            var el = panel.element;
            animatePhotoPanelClose(el, panel.entity && panel.entity.coords, function () { el.remove(); });
        });
    }

    function positionRegionPanels() {
        if (!state.regionPanels) return;
        state.regionPanels.forEach(function (panel) {
            positionPhotoPanel(panel.element, panel.entity.coords, 0);
        });
    }

    // ---------------------------------------------------------------
    // 12c. Photo pulse dot (region mode)
    //
    // Region mode has no droplets, so after an article image click flies the
    // map to a photo we drop a small pulsing dot at its exact coordinate to
    // show precisely where it sits. Colour keeps contrast against the basemap:
    // white on the dark auto style, black otherwise. Cleared on the next
    // interaction.
    // ---------------------------------------------------------------
    function pulseDotIsLight() {
        // A light dot (white) is only wanted on the dark auto basemap.
        return usingAutoStyle() && !resolveMapIsLight();
    }

    function showPulseDot(coords) {
        removePulseDot();
        if (!state.map || !coords) return;
        var el = document.createElement('div');
        el.className = 'sp-pulse-dot' + (pulseDotIsLight() ? ' sp-pulse-dot--light' : '');
        if (prefersReducedMotion()) el.classList.add('sp-pulse-dot--static');
        el.innerHTML = '<span class="sp-pulse-ring"></span><span class="sp-pulse-core"></span>';
        try {
            state.pulseDot = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(new maplibregl.LngLat(coords[0], coords[1]))
                .addTo(state.map);
        } catch (e) { state.pulseDot = null; }
    }

    function removePulseDot() {
        if (state.pulseDot) { try { state.pulseDot.remove(); } catch (e) {} state.pulseDot = null; }
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
        removePulseDot();
    }

    // ---------------------------------------------------------------
    // 14. About Card — 常驻右下角，无需展开/收起逻辑
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // 16. Loading
    // ---------------------------------------------------------------
    var LOADING_TIPS = [
        '正在搭建传送门',
        '再等等，马上就加载好了',
        '正在手磨咖啡中，好喝！',
        '正在摸鱼，不对这怎么能叫摸鱼呢',
        '正在环游世界',
        '正在标记地图钉',
        '正在打电动，美滋滋',
        '正在......不知道正在做什么呢',
        '正在劈里啪啦敲键盘'
    ];

    // Preloader style chosen in the admin (⑤ Animation): 'off' renders no
    // overlay at all, 'aperture' is the legacy branded loader, 'flythrough' is
    // the site-name streaming-light + camera-through-text reveal.
    var PRELOADER_STYLE = SETTINGS.preloaderStyle || 'aperture';
    // Minimum on-screen time for the flythrough so its rhythm reads properly
    // even on instant (cached) loads. Only enforced for 'flythrough'.
    var MIN_PRELOADER_MS = 1500;
    // Cap on waiting for web fonts before building the knockout mask / revealing
    // the name — a slow or stalled font never blocks the intro.
    var FONT_WAIT_MS = 1200;
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var PRELOADER_START = Date.now();
    var loadingHidden = false;
    // Populated by prepareFlythrough(); stays null for other styles.
    var flythrough = null;

    // Show a random loading tip below the aperture, swapping every 3s in random
    // order until loading finishes. The first tip is random too, and we avoid
    // repeating the immediately-previous one so it never looks frozen.
    function startLoadingTips() {
        if (!dom.loadingTip) return;
        var lastIndex = -1;

        function pickIndex() {
            if (LOADING_TIPS.length <= 1) return 0;
            var i;
            do { i = Math.floor(Math.random() * LOADING_TIPS.length); }
            while (i === lastIndex);
            return i;
        }

        function swap() {
            var i = pickIndex();
            lastIndex = i;
            // Fade out, change text, fade back in.
            dom.loadingTip.classList.remove('is-visible');
            setTimeout(function () {
                dom.loadingTip.textContent = LOADING_TIPS[i];
                dom.loadingTip.classList.add('is-visible');
            }, 300);
        }

        // First tip shows immediately (no fade-out delay).
        lastIndex = pickIndex();
        dom.loadingTip.textContent = LOADING_TIPS[lastIndex];
        dom.loadingTip.classList.add('is-visible');
        state.tipTimer = setInterval(swap, 3000);
    }

    function stopLoadingTips() {
        if (state.tipTimer) {
            clearInterval(state.tipTimer);
            state.tipTimer = null;
        }
    }

    // ---- Flythrough preloader ----

    // Emoji in the site name can't be cleanly knocked out of an SVG luminance
    // mask, so such names fall back to a plain fade (see runFlythroughExit).
    function preloaderContainsEmoji(str) {
        if (!str) return false;
        try { return /\p{Extended_Pictographic}/u.test(str); }
        catch (e) {
            return /[☀-➿⬀-⯿️‼⁉]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(str);
        }
    }

    // The reveal needs background-clip:text (for 流光) plus SVG masking. If the
    // browser lacks either, degrade to a plain fade.
    function preloaderSupportsKnockout() {
        var clip = false;
        if (window.CSS && CSS.supports) {
            clip = CSS.supports('-webkit-background-clip', 'text') || CSS.supports('background-clip', 'text');
        }
        return clip && typeof document.createElementNS === 'function';
    }

    // Run cb once fonts are ready, or after FONT_WAIT_MS — whichever comes
    // first — so hole shapes are correct without ever hanging on a slow font.
    function preloaderFontsReady(cb) {
        var done = false;
        function run() { if (!done) { done = true; cb(); } }
        if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
            document.fonts.ready.then(run, run);
            setTimeout(run, FONT_WAIT_MS);
        } else {
            setTimeout(run, 0);
        }
    }

    // Split an over-long name across two centered lines. Prefers a space near
    // the middle; falls back to a hard split for space-less (e.g. CJK) names.
    function wrapSvgTextTwoLines(textEl, name, vw, fontSize) {
        while (textEl.firstChild) { textEl.removeChild(textEl.firstChild); }
        var l1, l2;
        var mid = Math.floor(name.length / 2);
        var sp = name.indexOf(' ', mid);
        if (sp === -1) { sp = name.lastIndexOf(' ', mid); }
        if (sp > 0) { l1 = name.slice(0, sp).trim(); l2 = name.slice(sp + 1).trim(); }
        else { var c = Math.ceil(name.length / 2); l1 = name.slice(0, c); l2 = name.slice(c); }
        var lineH = fontSize * 1.1;
        var t1 = document.createElementNS(SVG_NS, 'tspan');
        t1.setAttribute('x', vw / 2); t1.setAttribute('dy', -lineH * 0.5); t1.textContent = l1;
        var t2 = document.createElementNS(SVG_NS, 'tspan');
        t2.setAttribute('x', vw / 2); t2.setAttribute('dy', lineH); t2.textContent = l2;
        textEl.appendChild(t1); textEl.appendChild(t2);
    }

    // Build the full-screen solid rect with the site name knocked out of it,
    // matching the visible .ft-name's font/size so the crossfade is seamless.
    function buildKnockoutSVG(nameEl, name) {
        var cs = window.getComputedStyle(nameEl);
        var vw = Math.max(window.innerWidth, 1);
        var vh = Math.max(window.innerHeight, 1);

        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'ft-mask-svg');
        svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svg.setAttribute('aria-hidden', 'true');

        var maskId = 'ft-knockout-' + Math.random().toString(36).slice(2);
        var defs = document.createElementNS(SVG_NS, 'defs');
        var mask = document.createElementNS(SVG_NS, 'mask');
        mask.setAttribute('id', maskId);
        mask.setAttribute('maskUnits', 'userSpaceOnUse');
        mask.setAttribute('x', '0'); mask.setAttribute('y', '0');
        mask.setAttribute('width', vw); mask.setAttribute('height', vh);

        var whiteRect = document.createElementNS(SVG_NS, 'rect');
        whiteRect.setAttribute('x', '0'); whiteRect.setAttribute('y', '0');
        whiteRect.setAttribute('width', vw); whiteRect.setAttribute('height', vh);
        whiteRect.setAttribute('fill', '#fff');
        mask.appendChild(whiteRect);

        var textEl = document.createElementNS(SVG_NS, 'text');
        textEl.setAttribute('x', vw / 2);
        textEl.setAttribute('y', vh / 2);
        textEl.setAttribute('text-anchor', 'middle');
        textEl.setAttribute('dominant-baseline', 'central');
        textEl.setAttribute('fill', '#000');
        textEl.setAttribute('font-family', cs.fontFamily || 'serif');
        textEl.setAttribute('font-weight', cs.fontWeight || '700');
        var lsPx = parseFloat(cs.letterSpacing);
        if (!isNaN(lsPx) && lsPx) { textEl.setAttribute('letter-spacing', lsPx); }
        var fontSize = parseFloat(cs.fontSize) || Math.min(vw, vh) * 0.1;
        textEl.setAttribute('font-size', fontSize);
        textEl.textContent = name;
        mask.appendChild(textEl);
        defs.appendChild(mask);
        svg.appendChild(defs);

        var fillRect = document.createElementNS(SVG_NS, 'rect');
        fillRect.setAttribute('class', 'ft-mask-fill');
        fillRect.setAttribute('x', '0'); fillRect.setAttribute('y', '0');
        fillRect.setAttribute('width', vw); fillRect.setAttribute('height', vh);
        fillRect.setAttribute('mask', 'url(#' + maskId + ')');
        svg.appendChild(fillRect);

        // Must be attached before measuring glyph widths.
        nameEl.parentNode.appendChild(svg);

        // Shrink, then wrap, so the knocked-out text fits ~80% of viewport width
        // even for very long names.
        var target = vw * 0.8;
        if (typeof textEl.getComputedTextLength === 'function') {
            try {
                var w = textEl.getComputedTextLength();
                if (w > target && w > 0) {
                    fontSize = Math.max(fontSize * (target / w), 14);
                    textEl.setAttribute('font-size', fontSize);
                    w = textEl.getComputedTextLength();
                    if (w > target) { wrapSvgTextTwoLines(textEl, name, vw, fontSize); }
                }
            } catch (e) { /* measurement unsupported → keep single line */ }
        }
        return svg;
    }

    function prepareFlythrough() {
        var overlay = dom.loadingOverlay;
        var nameEl = overlay ? overlay.querySelector('.ft-name') : null;
        if (!overlay || !nameEl) return;

        // Match the overlay + knockout fill to the actual basemap background so
        // the reveal lands on the same color (no color jump into the map).
        overlay.style.setProperty('--ft-map-bg', getMapBgColor());

        var name = (nameEl.textContent || '').trim();
        var reduced = prefersReducedMotion();
        var canKnockout = !reduced && name.length > 0 &&
            !preloaderContainsEmoji(name) && preloaderSupportsKnockout();

        flythrough = { overlay: overlay, nameEl: nameEl, name: name, canKnockout: canKnockout, svg: null, hintEl: null };

        // Wait for fonts before showing the name (avoids a fallback-font flash /
        // reflow) and before building the knockout mask (correct hole shapes).
        preloaderFontsReady(function () {
            if (!flythrough || !document.body.contains(nameEl)) { return; }
            nameEl.classList.add('is-in');
            if (flythrough.canKnockout) {
                try { flythrough.svg = buildKnockoutSVG(nameEl, name); }
                catch (e) { flythrough.canKnockout = false; flythrough.svg = null; }
            }
        });
    }

    // --- Load watchdogs (both styles) ---
    // Slow network: after SLOW_LOAD_MS still loading, reassure the user and keep
    // waiting for the real map 'load' (no upper cap). Only a *fatal* map error
    // (map can never load) force-reveals, after a short grace, so we never hang
    // forever. See onMapFatalError().
    var SLOW_LOAD_MS = 8000;
    var ERROR_GRACE_MS = 5000;
    var slowLoadTimer = null;
    var errorGraceTimer = null;

    function armLoadWatchdogs() {
        if (!dom.loadingOverlay) return; // 'off'
        slowLoadTimer = setTimeout(showSlowLoadHint, SLOW_LOAD_MS);
    }

    function clearLoadWatchdogs() {
        if (slowLoadTimer) { clearTimeout(slowLoadTimer); slowLoadTimer = null; }
        if (errorGraceTimer) { clearTimeout(errorGraceTimer); errorGraceTimer = null; }
    }

    function showSlowLoadHint() {
        if (loadingHidden || !dom.loadingOverlay) return;
        if (PRELOADER_STYLE === 'flythrough' && flythrough && !flythrough.hintEl) {
            var hint = document.createElement('span');
            hint.className = 'ft-hint';
            hint.textContent = '加载中，请稍候…';
            dom.loadingOverlay.appendChild(hint);
            // Next frame so the opacity transition actually plays.
            requestAnimationFrame(function () { hint.classList.add('is-in'); });
            flythrough.hintEl = hint;
        }
        // The aperture style already cycles reassuring tips, so it needs nothing.
    }

    // Called on every map 'error'. A single error may be a transient tile 404,
    // so we don't reveal immediately: we start a grace timer and only force the
    // reveal if 'load' still hasn't fired by the time it elapses (a successful
    // load runs hideLoading, which clears this timer).
    function onMapFatalError() {
        if (loadingHidden || errorGraceTimer) return;
        errorGraceTimer = setTimeout(function () {
            if (!loadingHidden) { hideLoading(); }
        }, ERROR_GRACE_MS);
    }

    function startPreloader() {
        PRELOADER_START = Date.now();
        if (PRELOADER_STYLE === 'flythrough') {
            prepareFlythrough();
        } else if (PRELOADER_STYLE === 'aperture') {
            startLoadingTips();
        }
        // 'off' → no overlay was rendered; nothing to start.
        armLoadWatchdogs();
    }

    function runApertureExit() {
        dom.loadingOverlay.classList.add('fade-out');
        setTimeout(function () { if (dom.loadingOverlay) { dom.loadingOverlay.style.display = 'none'; } }, 600);
    }

    function runFlythroughExit() {
        var ov = dom.loadingOverlay;
        if (!ov) return;
        if (flythrough && flythrough.canKnockout && flythrough.svg) {
            // Clear the inline landing color so the CSS `background: transparent`
            // in .is-revealing can take effect and the knockout holes show the map.
            ov.style.background = 'transparent';
            ov.classList.add('is-revealing');
            // Total = dissolve (460) overlapped + warp (340 delay + 1050) ≈ 1390ms.
            setTimeout(function () { if (ov) { ov.style.display = 'none'; } }, 1550);
        } else {
            // Reduced motion / emoji / unsupported / font timeout → plain fade.
            ov.classList.add('fade-out');
            setTimeout(function () { if (ov) { ov.style.display = 'none'; } }, 800);
        }
    }

    function hideLoading() {
        if (loadingHidden) return;
        loadingHidden = true;
        clearLoadWatchdogs();
        stopLoadingTips();
        if (!dom.loadingOverlay) return; // 'off' or overlay missing
        // Enforce a minimum on-screen time only for the flythrough so its
        // entrance + 流光 + reveal always reads; aperture keeps its instant exit.
        var wait = 0;
        if (PRELOADER_STYLE === 'flythrough') {
            wait = Math.max(0, MIN_PRELOADER_MS - (Date.now() - PRELOADER_START));
        }
        setTimeout(function () {
            if (PRELOADER_STYLE === 'flythrough') { runFlythroughExit(); }
            else { runApertureExit(); }
        }, wait);
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
        if (dom.filterBtn) dom.filterBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleFilterPanel(); });
        if (dom.filterPanel) dom.filterPanel.addEventListener('click', function(e) { e.stopPropagation(); });
        dom.articleClose.addEventListener('click', function(e) { e.stopPropagation(); closeArticlePanel(); });
        dom.closeDetail.addEventListener('click', function(e) { e.stopPropagation(); closeDetailPanel(); });
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
                closeFilterPanel();
                closeAllPhotoPanels();
                closeArticlePanel();
                dom.detailSheet.classList.remove('active');
                state.detailOpen = false;
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
        startPreloader();

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
            buildFilterChips();
            buildLegend();
            if (REGION.active) buildRegionData();
            initMap();
            initHitokoto();
            initEntryAnimation();
            bindUIEvents();
            // Sidebar defaults to collapsed unless the "default expand sidebar"
            // setting is enabled.
            if (SETTINGS.sidebarDefaultOpen) {
                openSidebar();
            } else {
                closeSidebar(true);
            }
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