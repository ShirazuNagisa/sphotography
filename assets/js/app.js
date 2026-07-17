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

    // ---------------------------------------------------------------
    // Night mode (v1.3.2)
    //
    // The three-way switch (light / dark / follow-system) overrides the
    // backend `night_mode` at runtime. The choice is remembered in
    // localStorage; the first visit falls back to the backend default. This
    // drives BOTH the UI theme (body class) and — for the auto basemap — the
    // map style, so `nightMode` here is the single source of truth the map
    // resolvers read.
    // ---------------------------------------------------------------
    var NIGHT_STORAGE_KEY = 'sp-night-mode';
    function readStoredNightMode() {
        try {
            var v = localStorage.getItem(NIGHT_STORAGE_KEY);
            if (v === 'light' || v === 'dark' || v === 'system') return v;
        } catch (e) {}
        return null;
    }
    var nightMode = readStoredNightMode() || SETTINGS.nightMode || 'system';

    function resolveMapIsLight() {
        var mode = nightMode;
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
        dom.articleSummary = document.getElementById('article-summary');
        dom.articleContent = document.getElementById('article-content');
        dom.articleShare = document.getElementById('article-share');
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
        dom.sidebarProfile = document.getElementById('sidebar-profile');
        dom.sidebarProfileToggle = document.getElementById('sidebar-profile-toggle');
        dom.sidebarProfilePanel = document.getElementById('sidebar-profile-panel');
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

    // Per-post metric accessors. Posts arrive either from wp/v2/posts (REST
    // fields sp_word_count / sp_views) or the inline-data mirror (same keys
    // populated in useInlineData). Returns null when unknown so callers can
    // omit the unit rather than render "0".
    function getPostWordCount(post) {
        var n = post && post.sp_word_count;
        return (typeof n === 'number' && n > 0) ? n : null;
    }
    function getPostViews(post) {
        var n = post && post.sp_views;
        return (typeof n === 'number' && n >= 0) ? n : null;
    }

    // Compact number for tight card lines: 1234 → "1.2k", 12345 → "1.2万".
    function formatCount(n) {
        n = Number(n) || 0;
        if (n < 1000) return String(n);
        if (n < 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
        return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1).replace(/\.0$/, '') + '万';
    }

    // Small inline SVG icons (stroke = currentColor) reused across meta lines.
    var SP_ICON_EYE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    var SP_ICON_WORDS = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>';
    // Sparkle mark for the AI summary card.
    var SP_ICON_AI = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.6 4.3a4 4 0 0 0 2.35 2.35L20.25 10.75l-4.3 1.6a4 4 0 0 0-2.35 2.35L12 19l-1.6-4.3a4 4 0 0 0-2.35-2.35L3.75 10.75l4.3-1.6a4 4 0 0 0 2.35-2.35L12 2.5z"/><path d="M18.5 3.5l.55 1.45a1.4 1.4 0 0 0 .82.82L21.5 6.4l-1.45.55a1.4 1.4 0 0 0-.82.82L18.5 9.3l-.55-1.45a1.4 1.4 0 0 0-.82-.82L15.5 6.4l1.45-.55a1.4 1.4 0 0 0 .82-.82z"/></svg>';

    // ---------------------------------------------------------------
    // AI full-text summary card (v1.3.6). Shows post.sp_ai_summary between the
    // header and the content; typewritten on the reader's FIRST open of a post
    // (tracked per browser via localStorage), full text on later opens.
    // ---------------------------------------------------------------
    var summaryTypeTimer = null;
    function renderArticleSummary(post) {
        var el = dom.articleSummary;
        if (!el) return;
        if (summaryTypeTimer) { clearTimeout(summaryTypeTimer); summaryTypeTimer = null; }
        el.classList.remove('is-typing');

        var summary = (SETTINGS.aiSummary && post && typeof post.sp_ai_summary === 'string')
            ? post.sp_ai_summary.trim() : '';
        if (!summary) { el.hidden = true; el.innerHTML = ''; return; }

        el.innerHTML =
            '<div class="article-summary-label">' + SP_ICON_AI + '<span>AI 概述</span></div>' +
            '<div class="article-summary-text"></div>';
        el.hidden = false;
        var textEl = el.querySelector('.article-summary-text');

        var key = 'sp-summary-typed-' + (post.id || '');
        var alreadyTyped = false;
        try { alreadyTyped = !!localStorage.getItem(key); } catch (e) {}

        if (alreadyTyped || prefersReducedMotion()) {
            textEl.textContent = summary;
            return;
        }

        // Typewriter reveal (Array.from keeps emoji/surrogate pairs intact).
        el.classList.add('is-typing');
        var chars = Array.from(summary);
        var i = 0;
        var pid = post.id;
        function tick() {
            if (state.openedPostId !== pid) { el.classList.remove('is-typing'); summaryTypeTimer = null; return; }
            i += 1;
            textEl.textContent = chars.slice(0, i).join('');
            if (i < chars.length) {
                summaryTypeTimer = setTimeout(tick, 38);
            } else {
                el.classList.remove('is-typing');
                summaryTypeTimer = null;
                try { localStorage.setItem(key, '1'); } catch (e) {}
            }
        }
        summaryTypeTimer = setTimeout(tick, 260); // brief lead-in after the panel opens
    }

    // Record + fire a view hit for a post, de-duplicated per browser/post/day
    // via localStorage. Calls back with the authoritative count when the server
    // increments. No-op when the feature is disabled.
    function recordArticleView(postId, onCount) {
        if (!SETTINGS.viewCounter) return;
        var key = 'sp-viewed-' + postId;
        var now = Date.now();
        var dedup = false;
        try {
            var last = parseInt(window.localStorage.getItem(key) || '0', 10);
            if (last && (now - last) < 86400000) { dedup = true; }
        } catch (e) {}
        if (dedup) return;
        try { window.localStorage.setItem(key, String(now)); } catch (e) {}
        fetch(CONFIG.restBase + '/sphotography/v1/view/' + postId, {
            method: 'POST',
            headers: { 'X-WP-Nonce': (APP.restNonce || '') },
            credentials: 'same-origin'
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && typeof data.views === 'number' && typeof onCount === 'function') {
                onCount(data.views);
            }
        }).catch(function () {});
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
    // 6b. Night-mode switch (v1.3.2)
    //
    // A vertical three-segment control stacked below the zoom/compass in the
    // top-right. Icons only (sun / moon / monitor). Toggling swaps the body
    // night class immediately and, when the auto basemap is active, re-applies
    // the resolved style and re-adds our photo layers.
    // ---------------------------------------------------------------
    var NIGHT_ICONS = {
        light: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
        dark: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        system: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
    };
    var NIGHT_LABELS = { light: '浅色', dark: '深色', system: '跟随系统' };

    function updateNightSwitchUI() {
        var btns = document.querySelectorAll('.sp-night-switch .sp-night-btn');
        Array.prototype.forEach.call(btns, function (b) {
            var on = b.getAttribute('data-mode') === nightMode;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    // Re-apply the auto basemap after a night-mode change: setStyle preserves
    // the camera; on idle we re-add the photo source/layers (and region layers)
    // the new style dropped, then re-sync the DOM droplets.
    function reapplyAutoStyle() {
        if (!state.map) return;
        try {
            state.map.setStyle(autoStyle());
        } catch (e) {
            return;
        }
        state.map.once('idle', function () {
            if (!state.map.getSource(CONFIG.clusterSourceId)) {
                addPhotoSource(REGION.active ? state.regionUnmatched : state.allPhotos);
                addPhotoLayers();
                if (REGION.active) addRegionLayers();
            }
            if (typeof syncDroplets === 'function') syncDroplets();
        });
    }

    function applyNightMode(mode) {
        if (mode !== 'light' && mode !== 'dark' && mode !== 'system') mode = 'system';
        if (mode === nightMode) return;
        var wasLight = resolveMapIsLight();
        nightMode = mode;
        try { localStorage.setItem(NIGHT_STORAGE_KEY, mode); } catch (e) {}

        var b = document.body;
        b.classList.remove('sphotography-night-force-dark', 'sphotography-night-force-light', 'sphotography-night-system');
        b.classList.add(mode === 'dark' ? 'sphotography-night-force-dark'
            : mode === 'light' ? 'sphotography-night-force-light'
            : 'sphotography-night-system');

        updateNightSwitchUI();

        // Only the auto basemap tracks light/dark; other presets keep their
        // tiles. Re-apply just once the resolved lightness actually changed.
        if (usingAutoStyle() && resolveMapIsLight() !== wasLight) {
            reapplyAutoStyle();
        }
    }

    function NightSwitchControl() {}
    NightSwitchControl.prototype.onAdd = function (map) {
        this._map = map;
        var c = document.createElement('div');
        c.className = 'maplibregl-ctrl maplibregl-ctrl-group sp-night-switch';
        c.setAttribute('role', 'group');
        c.setAttribute('aria-label', '明暗模式');
        ['light', 'dark', 'system'].forEach(function (m) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sp-night-btn';
            btn.setAttribute('data-mode', m);
            btn.title = NIGHT_LABELS[m];
            btn.setAttribute('aria-label', NIGHT_LABELS[m]);
            btn.innerHTML = NIGHT_ICONS[m];
            btn.addEventListener('click', function () { applyNightMode(m); });
            c.appendChild(btn);
        });
        this._container = c;
        // Defer to next frame so the buttons exist before we mark the active one.
        requestAnimationFrame(updateNightSwitchUI);
        return c;
    };
    NightSwitchControl.prototype.onRemove = function () {
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._map = undefined;
    };

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
        // Stacks in top-right immediately below the zoom/compass group.
        state.map.addControl(new NightSwitchControl(), 'top-right');
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

            // Word count (always, when known) and view count (only when the
            // counter is enabled) sit on the same line as the date.
            var metaExtra = '';
            var wc = getPostWordCount(post);
            if (wc != null) {
                metaExtra += '<span class="post-card-words" title="字数">' + SP_ICON_WORDS + formatCount(wc) + '</span>';
            }
            if (SETTINGS.viewCounter) {
                var pv = getPostViews(post);
                metaExtra += '<span class="post-card-views" title="阅读量">' + SP_ICON_EYE + '<span class="post-card-views-num">' + (pv != null ? formatCount(pv) : '0') + '</span></span>';
            }

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
                + '<div class="post-card-date"><span class="post-card-date-item"><svg width=12 height=12 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + escapeHtml(dateStr) + '</span>' + metaExtra + '</div>'
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
        if (dom.articleSummary) { dom.articleSummary.hidden = true; dom.articleSummary.innerHTML = ''; }
        if (dom.articleShare) { dom.articleShare.hidden = true; dom.articleShare.innerHTML = ''; }
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
                if (dom.articleSummary) { dom.articleSummary.hidden = true; dom.articleSummary.innerHTML = ''; }
                if (dom.articleShare) { dom.articleShare.hidden = true; dom.articleShare.innerHTML = ''; }
                dom.articlePanel.classList.add('active');
                return;
            }
            var dateStr = post.date ? formatDate(post.date.split('T')[0]) : '';
            dom.articleTitle.textContent = post.title.rendered || '';
            var metaHtml = '';
            if (dateStr) metaHtml += '<span>' + escapeHtml(dateStr) + '</span>';
            if (SETTINGS.viewCounter) {
                var vc = getPostViews(post);
                metaHtml += '<span class="article-views" title="阅读量">' + SP_ICON_EYE + '<span class="article-views-num">' + (vc != null ? vc.toLocaleString('en-US') : '—') + '</span></span>';
            }
            if (post.sp_write_location) {
                metaHtml += '<span class="article-wloc" title="撰写地点"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + escapeHtml(post.sp_write_location) + '</span>';
            }
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
            renderArticleSummary(post);
            var articleHtml = post.content && post.content.rendered ? post.content.rendered : '<p style="color:var(--text-muted)">暂无内容</p>';
            dom.articleContent.innerHTML = articleHtml;
            dom.articlePanel.scrollTop = 0;
            dom.articleContent.querySelectorAll('a').forEach(function(a) { if(!a.href.startsWith(window.location.origin)) a.target='_blank'; });
            wireArticleImages();
            renderShareBar(post);
            renderComments(requestPostId, post.comment_status);
            animateWindowsOpen(requestPostId);
            setupArticleNav();
            // Count the view (de-duplicated client-side) and reflect the fresh
            // number in the meta line once the server confirms.
            recordArticleView(requestPostId, function (n) {
                if (state.openedPostId !== requestPostId) return;
                var numEl = dom.articleMeta.querySelector('.article-views-num');
                if (numEl) numEl.textContent = Number(n).toLocaleString('en-US');
                // Keep the sidebar card (if present) in sync.
                var card = dom.sidebarPosts && dom.sidebarPosts.querySelector('.post-card[data-post-id="' + requestPostId + '"] .post-card-views-num');
                if (card) card.textContent = formatCount(n);
                var sp = state.allPosts && state.allPosts.filter(function (p) { return p.id === requestPostId; })[0];
                if (sp) sp.sp_views = n;
            });
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
        hideArticleNav();
        // Photograph articles have no source card — fall back to a plain fade.
        if (targetPostId == null || !getPostCardGeometry(targetPostId)) {
            clearMotion();
            dom.articlePanel.classList.remove('active');
            return;
        }
        animateWindowsClose(targetPostId);
    }

    // ---------------------------------------------------------------
    // 10b. Social share bar (after content, before comments)
    // ---------------------------------------------------------------
    function htmlToText(s) {
        var d = document.createElement('div');
        d.innerHTML = String(s || '');
        return (d.textContent || d.innerText || '').trim();
    }

    function shareTargetUrls(url, title) {
        var u = encodeURIComponent(url);
        var t = encodeURIComponent(title);
        return {
            qq:       'https://connect.qq.com/widget/shareqq/index.html?url=' + u + '&title=' + t,
            qzone:    'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=' + u + '&title=' + t,
            weibo:    'https://service.weibo.com/share/share.php?url=' + u + '&title=' + t,
            twitter:  'https://twitter.com/intent/tweet?url=' + u + '&text=' + t,
            facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + u
        };
    }

    function makeShareQr(el, text) {
        if (typeof qrcode === 'undefined') { el.textContent = text; return; }
        try {
            if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
                qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
            }
            var qr = qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            el.innerHTML = qr.createImgTag(4, 8, 'QR');
        } catch (e) {
            el.textContent = text;
        }
    }

    function copyShareLink(url, btn) {
        var done = function () {
            var prevHtml = btn.getAttribute('data-icon') || btn.innerHTML;
            btn.classList.add('is-copied');
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(function () { btn.classList.remove('is-copied'); btn.innerHTML = prevHtml; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
        } else {
            fallbackCopy(url);
            done();
        }
    }

    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) {}
    }

    // Monochrome brand glyphs (single <path>, filled with currentColor so they
    // follow the theme primary). Copy uses a stroked link icon to match the
    // theme's line-icon set.
    var SHARE_ICONS = {
        wechat:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>',
        qq:       '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"/></svg>',
        qzone:    '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M23.9868 9.2012c-.032-.099-.127-.223-.334-.258-.207-.036-7.352-1.4063-7.352-1.4063s-.105-.022-.198-.07c-.092-.047-.127-.167-.127-.167S12.4472.954 12.3491.7679c-.099-.187-.245-.238-.349-.238-.104 0-.251.051-.349.238C11.5531.954 8.0245 7.3 8.0245 7.3s-.035.12-.128.167c-.092.047-.197.07-.197.07S.5546 8.9071.3466 8.9421c-.208.036-.302.16-.333.258a.477.477 0 00.125.4491L5.5013 15.14s.072.08.119.172c.016.104.005.21.005.21s-1.1891 7.243-1.2201 7.451c-.031.208.075.369.159.4301.083.062.233.106.421.013.189-.093 6.813-3.2614 6.813-3.2614s.098-.044.201-.061c.103-.017.201.061.201.061s6.624 3.1684 6.813 3.2614c.188.094.338.049.421-.013a.463.463 0 00.159-.43c-.021-.14-.93-5.6778-.93-5.6778.876-.5401 1.4251-1.0392 1.8492-1.7473-2.5944.9692-6.0069 1.7173-9.4163 1.8663-.9152.041-2.4104.097-3.4735-.015-.6781-.071-1.1702-.144-1.2432-.438-.053-.2151.054-.4601.5451-.8312a2640.8625 2640.8625 0 012.8614-2.1553c1.2852-.9681 3.5595-2.4703 3.5595-2.7314 0-.285-2.1443-.781-4.0376-.781-1.9452 0-2.2753.132-2.8114.168-.488.034-.769.005-.804-.138-.06-.2481.183-.3891.588-.5682.7091-.314 1.8603-.594 1.9843-.626.194-.052 3.0824-.8051 5.6188-.5351 1.3181.14 3.2444.668 3.2444 1.2762 0 .342-1.7212 1.4942-3.2254 2.5973-1.1492.8431-2.2173 1.5612-2.2173 1.6883 0 .342 3.5334 1.2411 6.6899 1.01l.003-.022c.048-.092.119-.172.119-.172l5.3627-5.4907a.477.477 0 00.127-.449z"/></svg>',
        weibo:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.404-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.809-1.338-1.337-4.869.045-7.888 3.08C1.309 10.87 0 13.273 0 15.348c0 3.981 5.099 6.395 10.086 6.395 6.536 0 10.888-3.801 10.888-6.82 0-1.822-1.547-2.854-2.915-3.284v.01zm1.908-5.092c-.766-.856-1.908-1.187-2.96-.962-.436.09-.706.511-.616.932.09.42.511.691.932.602.511-.105 1.067.044 1.442.465.376.421.466.977.316 1.473-.136.406.089.856.51.992.405.119.857-.105.992-.512.33-1.021.12-2.178-.646-3.035l.03.045zm2.418-2.195c-1.576-1.757-3.905-2.419-6.054-1.968-.496.104-.812.587-.706 1.081.104.496.586.813 1.082.707 1.532-.331 3.185.15 4.296 1.383 1.112 1.246 1.429 2.943.947 4.416-.165.48.106 1.007.586 1.157.479.165.991-.104 1.157-.586.675-2.088.241-4.478-1.338-6.235l.03.045z"/></svg>',
        twitter:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>',
        facebook: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
        copy:     '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
    };

    function renderShareBar(post) {
        var bar = dom.articleShare;
        if (!bar) return;
        var url = post.link || (window.location.origin + '/?p=' + post.id);
        var title = (post.title && post.title.rendered) ? htmlToText(post.title.rendered) : (APP.siteName || '');

        var order = ['wechat', 'qq', 'qzone', 'weibo', 'twitter', 'facebook', 'copy'];
        var titles = { wechat: '微信', qq: 'QQ', qzone: 'QQ 空间', weibo: '微博', twitter: 'Twitter / X', facebook: 'Facebook', copy: '复制链接' };

        var buttonsHtml = '';
        order.forEach(function (k) {
            var btn = '<button type="button" class="share-btn share-' + k + '" data-share="' + k + '" data-icon=\'' + SHARE_ICONS[k] + '\' title="' + escapeHtml(titles[k]) + '" aria-label="' + escapeHtml(titles[k]) + '">' + SHARE_ICONS[k] + '</button>';
            if (k === 'wechat') {
                // Wrap so the QR popover can float above the button on hover
                // without taking layout space.
                btn = '<span class="share-wechat-wrap">' + btn
                    + '<div class="share-qr" hidden><div class="share-qr-code"></div><p class="share-qr-hint">微信扫码打开</p></div>'
                    + '</span>';
            }
            buttonsHtml += btn;
        });

        bar.innerHTML = '<div class="share-bar">'
            + '<span class="share-bar-label">分享</span>'
            + '<div class="share-bar-buttons">' + buttonsHtml + '</div>'
            + '</div>';
        bar.hidden = false;

        var urls = shareTargetUrls(url, title);
        var wechatWrap = bar.querySelector('.share-wechat-wrap');
        var qrWrap = bar.querySelector('.share-qr');
        var qrCode = bar.querySelector('.share-qr-code');
        var qrBuilt = false;
        function ensureQr() { if (!qrBuilt) { makeShareQr(qrCode, url); qrBuilt = true; } }

        // WeChat: QR floats in on hover, out on leave. Click toggles it too so
        // touch devices (no hover) can still reach it.
        if (wechatWrap && qrWrap) {
            wechatWrap.addEventListener('mouseenter', function () { ensureQr(); qrWrap.hidden = false; });
            wechatWrap.addEventListener('mouseleave', function () { qrWrap.hidden = true; });
        }

        bar.querySelectorAll('.share-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var k = btn.getAttribute('data-share');
                if (k === 'wechat') {
                    ensureQr();
                    qrWrap.hidden = !qrWrap.hidden;
                    return;
                }
                if (k === 'copy') { copyShareLink(url, btn); return; }
                if (urls[k]) { window.open(urls[k], '_blank', 'width=620,height=520,noopener'); }
            });
        });
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
    // 10a-bis. Article panel scroll controls (v1.3.6)
    //
    // The panel is the scroll container AND carries a transform + backdrop-filter
    // while active, which makes position:fixed descendants scroll WITH the
    // content (the v1.3.5 bug). Fix: the controls live in a body-mounted overlay
    // that is NOT inside the panel, so it never scrolls; JS mirrors the overlay's
    // box onto the panel's on-screen rect (getBoundingClientRect) on
    // open/scroll/resize. The buttons are position:absolute within that
    // non-transformed, non-scrolling overlay, so they stay pinned to the frame.
    //   • back-to-top — top-centre, appears once scrolled down
    //   • bottom trio — to-content-end / reading-progress% / jump-to-comment,
    //     centred at the panel bottom, visible only while the article text still
    //     extends below the panel bottom.
    // ---------------------------------------------------------------
    var SP_NAV_SCROLL_MS = 640; // 中等偏快
    function buildArticleNav() {
        if (dom.articleNavBuilt) return;
        var panel = dom.articlePanel;
        if (!panel) return;

        var upIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
        var downIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
        var commentIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

        // Overlay wrapper: fixed to the viewport, geometry synced to the panel.
        // pointer-events:none so it never blocks panel scroll/clicks; only the
        // buttons re-enable pointer events.
        var overlay = document.createElement('div');
        overlay.className = 'article-nav-overlay';

        var top = document.createElement('button');
        top.type = 'button';
        top.className = 'article-nav-btn article-nav-top';
        top.setAttribute('aria-label', '回到顶部');
        top.title = '回到顶部';
        top.innerHTML = upIcon;
        top.addEventListener('click', function (e) {
            e.stopPropagation();
            animateScroll(panel, panel.scrollTop, 0, SP_NAV_SCROLL_MS);
        });

        var bottom = document.createElement('div');
        bottom.className = 'article-nav-bottom';

        var toBottom = document.createElement('button');
        toBottom.type = 'button';
        toBottom.className = 'article-nav-btn article-nav-to-bottom';
        toBottom.setAttribute('aria-label', '到文章末尾');
        toBottom.title = '到文章末尾';
        toBottom.innerHTML = downIcon;
        toBottom.addEventListener('click', function (e) {
            e.stopPropagation();
            animateScroll(panel, panel.scrollTop, articleTextEndScrollTop(), SP_NAV_SCROLL_MS);
        });

        var progress = document.createElement('div');
        progress.className = 'article-nav-btn article-nav-progress';
        progress.setAttribute('aria-hidden', 'true');
        progress.title = '阅读进度';
        progress.innerHTML = '<span class="article-nav-progress-num">0%</span>';

        var comment = document.createElement('button');
        comment.type = 'button';
        comment.className = 'article-nav-btn article-nav-comment';
        comment.setAttribute('aria-label', '跳到评论');
        comment.title = '跳到评论';
        comment.innerHTML = commentIcon;
        comment.addEventListener('click', function (e) {
            e.stopPropagation();
            var target = articleCommentsScrollTop();
            animateScroll(panel, panel.scrollTop, target, SP_NAV_SCROLL_MS);
            setTimeout(function () {
                var ta = dom.articleComments && dom.articleComments.querySelector('.comment-textarea');
                if (ta) { try { ta.focus({ preventScroll: true }); } catch (err) { ta.focus(); } }
            }, SP_NAV_SCROLL_MS + 40);
        });

        bottom.appendChild(toBottom);
        bottom.appendChild(progress);
        bottom.appendChild(comment);

        overlay.appendChild(top);
        overlay.appendChild(bottom);
        document.body.appendChild(overlay);

        dom.articleNavOverlay = overlay;
        dom.articleNavTop = top;
        dom.articleNavBottom = bottom;
        dom.articleNavProgressNum = progress.querySelector('.article-nav-progress-num');

        var scheduled = false;
        panel.addEventListener('scroll', function () {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function () { scheduled = false; updateArticleNav(); });
        });
        window.addEventListener('resize', function () {
            if (state.articleOpen) { syncArticleNavGeom(); updateArticleNav(); }
        });

        dom.articleNavBuilt = true;
    }

    // Mirror the overlay box onto the panel's current on-screen rect so the
    // absolutely-positioned buttons resolve against the panel frame.
    function syncArticleNavGeom() {
        var panel = dom.articlePanel;
        var overlay = dom.articleNavOverlay;
        if (!panel || !overlay) return;
        var r = panel.getBoundingClientRect();
        overlay.style.left = r.left + 'px';
        overlay.style.top = r.top + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
    }

    function hideArticleNav() {
        if (dom.articleNavOverlay) dom.articleNavOverlay.classList.remove('is-active');
        if (dom.articleNavTop) dom.articleNavTop.classList.remove('is-visible');
        if (dom.articleNavBottom) dom.articleNavBottom.classList.remove('is-visible');
    }

    // Absolute scrollTop that brings the bottom of #article-content level with
    // the bottom of the panel viewport (i.e. the last line of text sits at the
    // panel bottom). Clamped to the scrollable range.
    function articleTextEndScrollTop() {
        var panel = dom.articlePanel;
        var content = dom.articleContent;
        if (!panel || !content) return 0;
        var panelRect = panel.getBoundingClientRect();
        var contentRect = content.getBoundingClientRect();
        var target = panel.scrollTop + (contentRect.bottom - panelRect.bottom);
        var max = panel.scrollHeight - panel.clientHeight;
        return Math.max(0, Math.min(target, max));
    }

    function articleCommentsScrollTop() {
        var panel = dom.articlePanel;
        var el = dom.articleComments;
        if (!panel || !el) return panel ? panel.scrollHeight : 0;
        var panelRect = panel.getBoundingClientRect();
        var rect = el.getBoundingClientRect();
        var target = panel.scrollTop + (rect.top - panelRect.top) - 24;
        var max = panel.scrollHeight - panel.clientHeight;
        return Math.max(0, Math.min(target, max));
    }

    // Recompute button visibility + progress readout. Cheap; called on rAF from
    // the panel scroll handler and on open/resize.
    function updateArticleNav() {
        if (!dom.articleNavBuilt || !state.articleOpen) return;
        var panel = dom.articlePanel;
        var content = dom.articleContent;
        if (!panel || !content) return;
        syncArticleNavGeom();
        var panelRect = panel.getBoundingClientRect();
        var contentRect = content.getBoundingClientRect();
        var scrollTop = panel.scrollTop;

        // Back-to-top: once the reader has scrolled down a little.
        dom.articleNavTop.classList.toggle('is-visible', scrollTop > 120);

        // Bottom trio: visible while the article text still extends below the
        // panel bottom (its end has not yet risen above the viewport bottom).
        var deltaToTextEnd = contentRect.bottom - panelRect.bottom;
        var trioVisible = deltaToTextEnd > 2;
        dom.articleNavBottom.classList.toggle('is-visible', trioVisible);

        // Reading progress: how far the reader is toward the text end resting at
        // the panel bottom (0 → 100%).
        var textEnd = scrollTop + deltaToTextEnd;
        var pct = textEnd > 4 ? Math.round(Math.max(0, Math.min(1, scrollTop / textEnd)) * 100) : 100;
        if (dom.articleNavProgressNum) dom.articleNavProgressNum.textContent = pct + '%';
    }

    // Called once an article's content is in place: ensure controls exist, start
    // at the top, and sync their state. Because the panel slides/scales in over
    // ~openDuration, keep the overlay glued to it for the length of the entrance.
    function setupArticleNav() {
        buildArticleNav();
        if (dom.articleNavOverlay) dom.articleNavOverlay.classList.add('is-active');
        syncArticleNavGeom();
        var until = (typeof ARTICLE_MOTION === 'object' && ARTICLE_MOTION.openDuration ? ARTICLE_MOTION.openDuration : 600) + 80;
        var t0 = null;
        requestAnimationFrame(function loop(t) {
            if (!state.articleOpen) return;
            if (t0 === null) t0 = t;
            syncArticleNavGeom();
            if (t - t0 < until) requestAnimationFrame(loop);
            else updateArticleNav();
        });
    }

    // ---------------------------------------------------------------
    // 10b. Article Comments (custom sphotography/v1/comments REST API)
    //
    // Single-level threading, captcha, 悄悄话 (private) threads, reply e-mail
    // notifications, safe Markdown, Unicode emoji, likes, pinning, commenter
    // editing with edit history, UA display and generated text avatars — all
    // driven by the per-site config in APP.comments.
    // ---------------------------------------------------------------
    var CCFG = (APP.comments && typeof APP.comments === 'object') ? APP.comments : {};
    var COMMENTS_BASE = 'sphotography/v1/comments';
    // Per-post render state so pagination / reloads stay scoped to one article.
    var cState = { postId: 0, page: 1, hasMore: false, loading: false };

    var EMOJI_LIST = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','😅','😜','🤔','😴','😇','🙃','😉','😌','😢','😭','😤','😱','😳','🥺','😔','🙄','😏','😬','🤯','🤗','👍','👎','👌','🙏','👏','🙌','💪','🤝','✌️','🤞','❤️','🧡','💛','💚','💙','💜','🖤','💔','✨','🔥','🎉','🎂','🌟','⭐','☀️','🌈','🌸','🍀','🐶','🐱','🍎','🍕','☕','🎵','📷','💯'];

    function ccEndpoint(path) {
        return CONFIG.restBase + '/' + COMMENTS_BASE + (path || '');
    }

    // Avatar block: preferred Gravatar with a text-avatar fallback (colour from
    // the email hash) revealed when the Gravatar 404s. When text avatars are
    // disabled the fallback is a neutral initial placeholder.
    function commentAvatar(c) {
        var name = (c.author || '匿名');
        var initial = escapeHtml(name.trim().charAt(0).toUpperCase() || '?');
        var textAvatar = CCFG.textAvatar !== false;
        var hue = hashHue(c.hash || name);
        var baseStyle = textAvatar ? (' style="background:hsl(' + hue + ',60%,52%)"') : '';
        var baseCls = 'comment-avatar comment-avatar-fallback' + (textAvatar ? ' comment-text-avatar' : ' comment-avatar--placeholder');
        var html = '<span class="comment-avatar-wrap">';
        html += '<span class="' + baseCls + '"' + baseStyle + '>' + initial + '</span>';
        if (c.gravatar) {
            html += '<img class="comment-avatar comment-gravatar" src="' + escapeHtml(c.gravatar) + '" alt="" loading="lazy" onerror="this.remove()">';
        }
        html += '</span>';
        return html;
    }

    // Deterministic hue (0–359) from a string hash — matches the server's
    // "colour by email hash" rule closely enough for a stable per-user colour.
    function hashHue(str) {
        str = String(str || '');
        var h = 0;
        for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
        return h % 360;
    }

    function commentMetaLine(c, isChild) {
        var bits = [];
        if (c.author_is_admin) bits.push('<span class="comment-badge comment-badge-admin">博主</span>');
        if (c.pinned) bits.push('<span class="comment-badge comment-badge-pin">置顶</span>');
        if (c.is_private) bits.push('<span class="comment-badge comment-badge-private">悄悄话</span>');
        var reply = '';
        if (isChild && CCFG.showReplyTo !== false && c.reply_to && c.reply_to.name) {
            reply = '<span class="comment-reply-to">回复 @' + escapeHtml(c.reply_to.name) + '</span>';
        }
        var date = c.date ? formatDate(String(c.date).split('T')[0]) : '';
        var ua = c.ua ? '<span class="comment-ua">' + escapeHtml(c.ua) + '</span>' : '';
        var loc = (CCFG.ipLocation && c.ip_region) ? '<span class="comment-ip-loc" title="IP 属地">' + escapeHtml(c.ip_region) + '</span>' : '';
        var edited = c.edited ? '<button type="button" class="comment-edited" data-cc-history="' + c.id + '">已编辑</button>' : '';
        return ''
            + '<div class="comment-head">'
            +   '<span class="comment-author">' + escapeHtml(c.author || '匿名') + '</span>'
            +   bits.join('')
            +   reply
            + '</div>'
            + '<div class="comment-sub">'
            +   (date ? '<span class="comment-date">' + escapeHtml(date) + '</span>' : '')
            +   loc + ua + edited
            + '</div>';
    }

    function commentActions(c) {
        var acts = [];
        if (CCFG.likeEnabled !== false) {
            acts.push('<button type="button" class="comment-act comment-like' + (c.liked ? ' is-liked' : '') + '" data-cc-like="' + c.id + '">♥ <span class="comment-like-count">' + (c.likes || 0) + '</span></button>');
        }
        acts.push('<button type="button" class="comment-act" data-cc-reply="' + c.id + '" data-cc-name="' + escapeHtml(c.author || '') + '">回复</button>');
        if (c.can_edit) acts.push('<button type="button" class="comment-act" data-cc-edit="' + c.id + '">编辑</button>');
        if (c.can_pin) acts.push('<button type="button" class="comment-act" data-cc-pin="' + c.id + '">' + (c.pinned ? '取消置顶' : '置顶') + '</button>');
        return '<div class="comment-actions">' + acts.join('') + '</div>';
    }

    function buildCommentNode(c, isChild) {
        // Cache per-comment raw text (for edit prefill) and edit history.
        ccEditRaw[c.id] = c.content_raw || '';
        ccHistory[c.id] = c.history || [];
        var children = '';
        if (!isChild && c.children && c.children.length) {
            children = '<ul class="comment-children">' + c.children.map(function (ch) { return buildCommentNode(ch, true); }).join('') + '</ul>';
        }
        return ''
            + '<li class="comment-item' + (isChild ? ' comment-item--child' : '') + (c.pinned ? ' is-pinned' : '') + '" id="comment-' + c.id + '" data-cc-id="' + c.id + '">'
            +   commentAvatar(c)
            +   '<div class="comment-body">'
            +     commentMetaLine(c, isChild)
            +     '<div class="comment-text" data-cc-text="' + c.id + '">' + (c.content || '') + '</div>'
            +     commentActions(c)
            +     '<div class="comment-reply-slot"></div>'
            +   '</div>'
            +   children
            + '</li>';
    }

    function renderComments(postId, commentStatus) {
        var wrap = dom.articleComments;
        if (!wrap) return;
        cState = { postId: postId, page: 1, hasMore: false, loading: false };
        var isOpen = commentStatus !== 'closed';
        wrap.innerHTML = ''
            + '<div class="comments-section" data-cc-align="' + escapeHtml(CCFG.avatarAlign || 'top') + '">'
            +   '<h4 class="comments-title"><span class="comments-count-label">评论</span> <span class="comments-count">…</span></h4>'
            +   '<ul class="comment-list" id="comment-list"></ul>'
            +   '<div class="comment-pager" id="comment-pager"></div>'
            +   (isOpen ? buildCommentFormHtml(0) : '<p class="comments-closed">' + escapeHtml(APP.commentsClosedText || '评论已关闭。') + '</p>')
            + '</div>';

        var listEl = wrap.querySelector('#comment-list');
        var countEl = wrap.querySelector('.comments-count');
        listEl.innerHTML = '<li class="comments-loading">加载中…</li>';

        wireCommentList(postId, listEl, countEl);
        if (isOpen) wireCommentForm(postId, wrap.querySelector('.comment-form'), listEl, countEl);

        loadCommentPage(postId, 1, true, listEl, countEl);
    }

    // GET with credentials + nonce. Logged-in users MUST send the REST nonce or
    // WordPress rejects cookie-authenticated requests (rest_cookie_invalid_nonce),
    // so we can't reuse the plain fetchFromRest helper here.
    function ccGet(endpoint, params) {
        var qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return fetch(CONFIG.restBase + '/' + endpoint + qs, {
            credentials: 'same-origin',
            headers: { 'X-WP-Nonce': APP.restNonce || '' }
        }).then(function (res) {
            if (!res.ok) return null;
            return res.json();
        }).catch(function () { return null; });
    }

    function loadCommentPage(postId, page, replace, listEl, countEl) {
        if (cState.loading) return;
        cState.loading = true;
        ccGet(COMMENTS_BASE, { post: postId, page: page }).then(function (data) {
            cState.loading = false;
            if (state.openedPostId !== postId || !data) return;
            var items = Array.isArray(data.items) ? data.items : [];
            cState.page = data.page || page;
            cState.hasMore = !!data.has_more;
            countEl.textContent = '(' + (data.total || 0) + ')';

            var loading = listEl.querySelector('.comments-loading');
            if (loading) loading.remove();
            if (replace) listEl.innerHTML = '';
            var emptyEl = listEl.querySelector('.comments-empty');
            if (emptyEl) emptyEl.remove();

            if (replace && items.length === 0) {
                listEl.innerHTML = '<li class="comments-empty">还没有评论，来抢沙发吧。</li>';
            } else {
                listEl.insertAdjacentHTML('beforeend', items.map(function (c) { return buildCommentNode(c, false); }).join(''));
                applyFolding(listEl);
            }
            renderPager(postId, listEl, countEl);
        });
    }

    function renderPager(postId, listEl, countEl) {
        var pager = dom.articleComments.querySelector('#comment-pager');
        if (!pager) return;
        var paged = (CCFG.pagination === 'paged');
        pager.innerHTML = '';
        if (!cState.hasMore && cState.page <= 1) return;

        if (paged) {
            var html = '';
            if (cState.page > 1) html += '<button type="button" class="comment-page-btn" data-cc-page="' + (cState.page - 1) + '">上一页</button>';
            html += '<span class="comment-page-cur">第 ' + cState.page + ' 页</span>';
            if (cState.hasMore) html += '<button type="button" class="comment-page-btn" data-cc-page="' + (cState.page + 1) + '">下一页</button>';
            pager.innerHTML = html;
        } else if (cState.hasMore) {
            pager.innerHTML = '<button type="button" class="comment-page-btn comment-load-more" data-cc-page="' + (cState.page + 1) + '">加载更多评论</button>';
        }
    }

    function applyFolding(listEl) {
        if (CCFG.foldLong === false) return;
        var limit = CCFG.foldPx || 200;
        var texts = listEl.querySelectorAll('.comment-text');
        for (var i = 0; i < texts.length; i++) {
            var el = texts[i];
            if (el.dataset.ccFolded) continue;
            if (el.scrollHeight > limit + 40) {
                el.dataset.ccFolded = '1';
                el.classList.add('is-folded');
                el.style.maxHeight = limit + 'px';
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'comment-fold-toggle';
                btn.textContent = '展开阅读全文';
                btn.setAttribute('data-cc-fold', '1');
                el.parentNode.insertBefore(btn, el.nextSibling);
            }
        }
    }

    function buildCommentFormHtml(parentId, replyName) {
        var loggedIn = !!APP.loggedIn;
        var isReply = parentId > 0;
        var identityRow = loggedIn
            ? '<p class="comment-identity">以 <strong>' + escapeHtml(APP.currentUserName || '') + '</strong> 的身份' + (isReply ? '回复' : '评论') + '</p>'
            : ''
                + '<div class="comment-fields">'
                +   '<input type="text" class="comment-input comment-author" placeholder="昵称 *" autocomplete="name" required>'
                +   '<input type="email" class="comment-input comment-email" placeholder="邮箱（不公开）*" autocomplete="email" required>'
                + '</div>';

        var emojiBtn = (CCFG.emojiPanel !== false)
            ? '<button type="button" class="comment-emoji-btn" title="插入表情">😊</button>'
            : '';

        var captchaRow = (CCFG.captcha && !loggedIn)
            ? '<div class="comment-captcha-row"><span class="comment-captcha-q">…</span><input type="text" class="comment-input comment-captcha-input" inputmode="numeric" placeholder="= ?" autocomplete="off"><button type="button" class="comment-captcha-refresh" title="换一题">↻</button></div>'
            : '';

        var options = '';
        if (!isReply && CCFG.allowPrivate) {
            options += '<label class="comment-opt"><input type="checkbox" class="comment-private"> 悄悄话（仅自己和博主可见）</label>';
        }
        if (CCFG.mailNotify) {
            options += '<label class="comment-opt"><input type="checkbox" class="comment-notify" checked> 启用邮件通知</label>';
        }

        return ''
            + '<form class="comment-form' + (isReply ? ' comment-form--reply' : '') + '" novalidate data-cc-parent="' + (parentId || 0) + '">'
            +   identityRow
            +   '<textarea class="comment-textarea" rows="3" placeholder="' + (isReply ? ('回复 @' + escapeHtml(replyName || '') + '…') : '写下你的评论…') + '" required></textarea>'
            +   (CCFG.emojiPanel !== false ? '<div class="comment-emoji-panel" hidden>' + EMOJI_LIST.map(function (e) { return '<button type="button" class="comment-emoji">' + e + '</button>'; }).join('') + '</div>' : '')
            +   captchaRow
            +   (options ? '<div class="comment-options">' + options + '</div>' : '')
            +   '<div class="comment-form-footer">'
            +     emojiBtn
            +     '<span class="comment-feedback"></span>'
            +     '<button type="submit" class="comment-submit">' + (isReply ? '回复' : '发表评论') + '</button>'
            +   '</div>'
            + '</form>';
    }

    // Fetch and inject a fresh captcha challenge into a form.
    function loadCaptcha(form) {
        var qEl = form.querySelector('.comment-captcha-q');
        var input = form.querySelector('.comment-captcha-input');
        if (!qEl || !input) return;
        qEl.textContent = '…';
        input.value = '';
        input.removeAttribute('data-cc-token');
        fetchFromRest(COMMENTS_BASE + '/captcha', null).then(function (data) {
            if (!data) { qEl.textContent = '验证码加载失败'; return; }
            qEl.textContent = data.question + ' =';
            input.setAttribute('data-cc-token', data.token);
        });
    }

    // Insert text at the caret of a textarea.
    function insertAtCaret(textarea, text) {
        var start = textarea.selectionStart || 0;
        var end = textarea.selectionEnd || 0;
        var val = textarea.value;
        textarea.value = val.slice(0, start) + text + val.slice(end);
        var pos = start + text.length;
        textarea.selectionStart = textarea.selectionEnd = pos;
        textarea.focus();
    }

    // Wire an individual form (top-level or reply/edit) — submit, emoji, captcha.
    function wireCommentForm(postId, form, listEl, countEl, editId) {
        if (!form) return;
        form.addEventListener('click', function (e) { e.stopPropagation(); });

        var textarea = form.querySelector('.comment-textarea');
        var emojiBtn = form.querySelector('.comment-emoji-btn');
        var emojiPanel = form.querySelector('.comment-emoji-panel');
        if (emojiBtn && emojiPanel) {
            emojiBtn.addEventListener('click', function () { emojiPanel.hidden = !emojiPanel.hidden; });
            emojiPanel.addEventListener('click', function (e) {
                var b = e.target.closest('.comment-emoji');
                if (b) { insertAtCaret(textarea, b.textContent); }
            });
        }

        var captchaInput = form.querySelector('.comment-captcha-input');
        if (captchaInput) {
            loadCaptcha(form);
            var refresh = form.querySelector('.comment-captcha-refresh');
            if (refresh) refresh.addEventListener('click', function () { loadCaptcha(form); });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            submitCommentForm(postId, form, listEl, countEl, editId);
        });
    }

    function submitCommentForm(postId, form, listEl, countEl, editId) {
        var feedback = form.querySelector('.comment-feedback');
        var submitBtn = form.querySelector('.comment-submit');
        var textarea = form.querySelector('.comment-textarea');
        var content = (textarea.value || '').trim();
        var submitLabel = submitBtn.textContent;
        feedback.className = 'comment-feedback';
        if (!content) { feedback.textContent = '请输入评论内容。'; feedback.classList.add('is-error'); return; }

        // Edit mode → PUT-style edit endpoint.
        if (editId) {
            postJson(ccEndpoint('/' + editId + '/edit'), { content: content }).then(function (r) {
                if (!r.ok) { feedback.textContent = ccError(r); feedback.classList.add('is-error'); return; }
                var textEl = listEl.querySelector('[data-cc-text="' + editId + '"]');
                if (textEl && r.data.comment) {
                    textEl.innerHTML = r.data.comment.content || '';
                    textEl.removeAttribute('data-cc-folded');
                    textEl.classList.remove('is-folded');
                    textEl.style.maxHeight = '';
                    var stale = textEl.parentNode.querySelector('.comment-fold-toggle');
                    if (stale) stale.remove();
                    applyFolding(listEl);
                    // Mark edited.
                    var head = textEl.parentNode.querySelector('.comment-sub');
                    if (head && !head.querySelector('.comment-edited')) {
                        head.insertAdjacentHTML('beforeend', '<button type="button" class="comment-edited" data-cc-history="' + editId + '">已编辑</button>');
                    }
                }
                closeInlineForm(form);
            });
            return;
        }

        var parentId = parseInt(form.getAttribute('data-cc-parent'), 10) || 0;
        var payload = { post: postId, content: content, parent: parentId };

        if (!APP.loggedIn) {
            var author = (form.querySelector('.comment-author').value || '').trim();
            var email = (form.querySelector('.comment-email').value || '').trim();
            if (!author || !email) { feedback.textContent = '请填写昵称与邮箱。'; feedback.classList.add('is-error'); return; }
            payload.author_name = author;
            payload.author_email = email;
        }

        var captchaInput = form.querySelector('.comment-captcha-input');
        if (captchaInput) {
            payload.captcha_token = captchaInput.getAttribute('data-cc-token') || '';
            payload.captcha_answer = (captchaInput.value || '').trim();
            if (!payload.captcha_answer) { feedback.textContent = '请回答验证码。'; feedback.classList.add('is-error'); return; }
        }

        var privateEl = form.querySelector('.comment-private');
        if (privateEl && privateEl.checked) payload.is_private = 1;
        var notifyEl = form.querySelector('.comment-notify');
        if (notifyEl) payload.notify = notifyEl.checked ? 1 : 0;

        submitBtn.disabled = true;
        submitBtn.textContent = '提交中…';
        feedback.textContent = '';

        postJson(ccEndpoint(''), payload).then(function (r) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
            if (!r.ok) {
                feedback.textContent = ccError(r);
                feedback.classList.add('is-error');
                if (captchaInput) loadCaptcha(form);
                return;
            }
            textarea.value = '';
            var c = r.data.comment;
            if (r.data.status !== 'approved') {
                feedback.textContent = '评论已提交，等待审核后显示。';
                feedback.classList.add('is-success');
                if (captchaInput) loadCaptcha(form);
                return;
            }
            insertNewComment(c, parentId, listEl, countEl, form);
            feedback.textContent = parentId ? '回复成功！' : '评论发表成功！';
            feedback.classList.add('is-success');
            if (captchaInput) loadCaptcha(form);
        });
    }

    // Place a freshly-approved comment into the DOM.
    function insertNewComment(c, parentId, listEl, countEl, form) {
        var empty = listEl.querySelector('.comments-empty');
        if (empty) empty.remove();
        if (parentId) {
            var parentLi = listEl.querySelector('.comment-item[data-cc-id="' + parentId + '"]');
            // Replies always attach to the top-level ancestor's children list.
            var rootLi = parentLi && parentLi.classList.contains('comment-item--child')
                ? listEl.querySelector('.comment-item[data-cc-id="' + c.parent + '"]')
                : parentLi;
            if (rootLi) {
                var childUl = rootLi.querySelector(':scope > .comment-children');
                if (!childUl) {
                    childUl = document.createElement('ul');
                    childUl.className = 'comment-children';
                    rootLi.appendChild(childUl);
                }
                childUl.insertAdjacentHTML('beforeend', buildCommentNode(c, true));
            }
            closeInlineForm(form);
        } else {
            listEl.insertAdjacentHTML('beforeend', buildCommentNode(c, false));
        }
        applyFolding(listEl);
        var current = parseInt((countEl.textContent || '').replace(/\D/g, ''), 10) || 0;
        countEl.textContent = '(' + (current + 1) + ')';
    }

    function closeInlineForm(form) {
        var slot = form.closest('.comment-reply-slot');
        if (slot) slot.innerHTML = '';
    }

    // Delegated handling for the whole list: like / reply / edit / pin / fold /
    // pager / history.
    function wireCommentList(postId, listEl, countEl) {
        var section = dom.articleComments.querySelector('.comments-section');
        section.addEventListener('click', function (e) {
            var t = e.target;

            var likeBtn = t.closest('[data-cc-like]');
            if (likeBtn) {
                var lid = likeBtn.getAttribute('data-cc-like');
                postJson(ccEndpoint('/' + lid + '/like'), {}).then(function (r) {
                    if (!r.ok) return;
                    likeBtn.classList.toggle('is-liked', !!r.data.liked);
                    var cnt = likeBtn.querySelector('.comment-like-count');
                    if (cnt) cnt.textContent = r.data.likes;
                });
                return;
            }

            var pinBtn = t.closest('[data-cc-pin]');
            if (pinBtn) {
                var pid = pinBtn.getAttribute('data-cc-pin');
                postJson(ccEndpoint('/' + pid + '/pin'), {}).then(function (r) {
                    if (!r.ok) return;
                    // Simplest correct refresh: reload from page 1.
                    loadCommentPage(postId, 1, true, listEl, countEl);
                });
                return;
            }

            var replyBtn = t.closest('[data-cc-reply]');
            if (replyBtn) {
                openReplyForm(postId, replyBtn, listEl, countEl);
                return;
            }

            var editBtn = t.closest('[data-cc-edit]');
            if (editBtn) {
                openEditForm(postId, editBtn, listEl, countEl);
                return;
            }

            var foldBtn = t.closest('[data-cc-fold]');
            if (foldBtn) {
                var text = foldBtn.previousElementSibling;
                if (text && text.classList.contains('comment-text')) {
                    var expanded = text.classList.toggle('is-expanded');
                    text.style.maxHeight = expanded ? 'none' : (CCFG.foldPx || 200) + 'px';
                    foldBtn.textContent = expanded ? '收起' : '展开阅读全文';
                }
                return;
            }

            var histBtn = t.closest('[data-cc-history]');
            if (histBtn) {
                toggleHistory(histBtn);
                return;
            }

            var pageBtn = t.closest('[data-cc-page]');
            if (pageBtn) {
                var pg = parseInt(pageBtn.getAttribute('data-cc-page'), 10) || 1;
                var replace = (CCFG.pagination === 'paged');
                loadCommentPage(postId, pg, replace, listEl, countEl);
                return;
            }
        });
    }

    function openReplyForm(postId, btn, listEl, countEl) {
        var li = btn.closest('.comment-item');
        var slot = li.querySelector(':scope > .comment-body > .comment-reply-slot');
        if (!slot) return;
        if (slot.innerHTML) { slot.innerHTML = ''; return; } // toggle off.
        var name = btn.getAttribute('data-cc-name') || '';
        slot.innerHTML = buildCommentFormHtml(parseInt(btn.getAttribute('data-cc-reply'), 10), name);
        wireCommentForm(postId, slot.querySelector('.comment-form'), listEl, countEl);
        var ta = slot.querySelector('.comment-textarea');
        if (ta) ta.focus();
    }

    function openEditForm(postId, btn, listEl, countEl) {
        var li = btn.closest('.comment-item');
        var id = parseInt(btn.getAttribute('data-cc-edit'), 10);
        var slot = li.querySelector(':scope > .comment-body > .comment-reply-slot');
        if (!slot) return;
        if (slot.innerHTML) { slot.innerHTML = ''; return; }
        var textEl = li.querySelector(':scope > .comment-body > [data-cc-text="' + id + '"]');
        var raw = (textEl && textEl.getAttribute('data-cc-raw')) || '';
        // Edit form: a minimal textarea + save/cancel.
        slot.innerHTML = ''
            + '<form class="comment-form comment-form--edit" novalidate>'
            +   '<textarea class="comment-textarea" rows="3"></textarea>'
            + (CCFG.emojiPanel !== false ? '<button type="button" class="comment-emoji-btn" title="插入表情">😊</button><div class="comment-emoji-panel" hidden>' + EMOJI_LIST.map(function (em) { return '<button type="button" class="comment-emoji">' + em + '</button>'; }).join('') + '</div>' : '')
            +   '<div class="comment-form-footer"><span class="comment-feedback"></span><button type="button" class="comment-edit-cancel comment-act">取消</button><button type="submit" class="comment-submit">保存</button></div>'
            + '</form>';
        var form = slot.querySelector('.comment-form');
        var ta = form.querySelector('.comment-textarea');
        ta.value = ccEditRaw[id] || raw || stripHtml(textEl ? textEl.innerHTML : '');
        wireCommentForm(postId, form, listEl, countEl, id);
        form.querySelector('.comment-edit-cancel').addEventListener('click', function () { slot.innerHTML = ''; });
        ta.focus();
    }

    function toggleHistory(btn) {
        var id = btn.getAttribute('data-cc-history');
        var body = btn.closest('.comment-body');
        var existing = body.querySelector('.comment-history');
        if (existing) { existing.remove(); return; }
        var hist = ccHistory[id];
        var html = '<div class="comment-history">';
        if (hist && hist.length) {
            html += '<p class="comment-history-title">编辑记录</p>';
            for (var i = 0; i < hist.length; i++) {
                var d = hist[i].date ? formatDate(String(hist[i].date).split('T')[0]) : '';
                html += '<div class="comment-history-item"><span class="comment-history-date">' + escapeHtml(d) + '</span>' + (hist[i].content || '') + '</div>';
            }
        } else {
            html += '<p class="comment-history-empty">无可查看的编辑记录。</p>';
        }
        html += '</div>';
        btn.closest('.comment-body').querySelector('.comment-text').insertAdjacentHTML('afterend', html);
    }

    // Caches keyed by comment id, populated as nodes are built.
    var ccHistory = {};
    var ccEditRaw = {};

    // POST helper: JSON body + nonce, returns { ok, data }.
    function postJson(url, payload) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': APP.restNonce || '' },
            body: JSON.stringify(payload || {})
        }).then(function (res) {
            return res.json().then(function (data) { return { ok: res.ok, data: data }; })
                .catch(function () { return { ok: res.ok, data: {} }; });
        }).catch(function () { return { ok: false, data: {} }; });
    }

    function ccError(r) {
        if (r.data && r.data.message) return stripHtml(r.data.message);
        return '操作失败，请稍后再试。';
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
    // 16b. Profile expand (v1.3.2)
    //
    // Both profile modes reveal the same content (avatar / name / bio / stats /
    // links). The card (mode A) grows in place upward; the sidebar panel
    // (mode B) slides up over the article list. Height is measured so the
    // max-height transition lands exactly on the content height for a clean,
    // reversible animation. Closes on outside click, re-click, or Esc.
    // ---------------------------------------------------------------
    function initProfileExpand() {
        // --- Mode A: bottom-right card ---
        var card = dom.aboutCard;
        if (card) {
            var cardExpand = card.querySelector('.about-card-expand');
            var setCard = function (open) {
                card.classList.toggle('is-expanded', open);
                card.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (cardExpand) {
                    cardExpand.setAttribute('aria-hidden', open ? 'false' : 'true');
                    cardExpand.style.maxHeight = open ? (cardExpand.scrollHeight + 'px') : '';
                }
            };
            card.addEventListener('click', function (e) {
                e.stopPropagation();
                if (e.target.closest('a')) return; // let links work
                setCard(!card.classList.contains('is-expanded'));
            });
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.closest('a')) return;
                    e.preventDefault();
                    setCard(!card.classList.contains('is-expanded'));
                }
            });
            document.addEventListener('click', function () {
                if (card.classList.contains('is-expanded')) setCard(false);
            });
            window.addEventListener('resize', debounce(function () {
                if (card.classList.contains('is-expanded') && cardExpand) {
                    cardExpand.style.maxHeight = cardExpand.scrollHeight + 'px';
                }
            }, 150));
            state._closeAboutCard = function () {
                if (card.classList.contains('is-expanded')) setCard(false);
            };
        }

        // --- Mode B: sidebar bottom panel ---
        var wrap = dom.sidebarProfile;
        var toggle = dom.sidebarProfileToggle;
        var panel = dom.sidebarProfilePanel;
        if (wrap && toggle && panel) {
            var setSidebar = function (open) {
                wrap.classList.toggle('is-expanded', open);
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                panel.setAttribute('aria-hidden', open ? 'false' : 'true');
                panel.style.maxHeight = open ? (panel.scrollHeight + 'px') : '';
            };
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                setSidebar(!wrap.classList.contains('is-expanded'));
            });
            // The expanded panel covers the trigger row, so a click on it
            // (anywhere but a link) is the "click again to close" gesture.
            panel.addEventListener('click', function (e) {
                e.stopPropagation();
                if (e.target.closest('a')) return; // let links work
                setSidebar(false);
            });
            document.addEventListener('click', function (e) {
                if (wrap.classList.contains('is-expanded') && !wrap.contains(e.target)) {
                    setSidebar(false);
                }
            });
            window.addEventListener('resize', debounce(function () {
                if (wrap.classList.contains('is-expanded')) {
                    panel.style.maxHeight = panel.scrollHeight + 'px';
                }
            }, 150));
            state._closeSidebarProfile = function () {
                if (wrap.classList.contains('is-expanded')) setSidebar(false);
            };
        }
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
                    sp_word_count: p.wordCount,
                    sp_views: p.views,
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
        // The about-card's own click handling (toggle expand) lives in
        // initProfileExpand(); no plain stop-propagation binding here.

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
                if (state._closeAboutCard) state._closeAboutCard();
                if (state._closeSidebarProfile) state._closeSidebarProfile();
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
            initProfileExpand();
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