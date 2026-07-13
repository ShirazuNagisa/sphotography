/**
 * Sphotography - Frontend Map Application
 *
 * @package Sphotography
 * @version 1.0.0
 */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // 1. Configuration
    // ---------------------------------------------------------------
    const CONFIG = {
        center: [112.94, 28.23],
        zoom: 5,
        maxZoom: 18,
        minZoom: 2,
        styleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        restBase: Sphotography.restUrl.replace(/\/$/, ''),
        photosEndpoint: 'wp/v2/photograph',
        tagsEndpoint: 'wp/v2/region_tag',
        perPage: 500,
        sourceId: 'photos',
        clusterSourceId: 'photos-clustered',
        layerId: 'photo-points',
        clusterLayerId: 'photo-clusters',
        clusterCountLayerId: 'photo-cluster-count',
        markerColor: '#ffffff',
        markerBorderColor: '#e67e22',
        markerRadius: 8,
        markerBorderWidth: 3,
    };

    // ---------------------------------------------------------------
    // 2. State
    // ---------------------------------------------------------------
    const state = {
        map: null,
        allPhotos: null,          // Full GeoJSON FeatureCollection
        filteredPhotos: null,
        regionTags: [],
        activeFilterSlugs: [],
        detailOpen: false,
        filterOpen: false,
        useClustering: typeof supercluster !== 'undefined',
        isMobile: window.innerWidth < 768,
    };

    // ---------------------------------------------------------------
    // 3. DOM References
    // ---------------------------------------------------------------
    const dom = {
        map: document.getElementById('map'),
        loadingOverlay: document.getElementById('loading-overlay'),
        filterPanel: document.getElementById('filter-panel'),
        filterToggle: document.getElementById('filter-toggle'),
        tagList: document.getElementById('tag-list'),
        detailSheet: document.getElementById('detail-sheet'),
        closeDetail: document.getElementById('close-detail'),
        detailImg: document.getElementById('detail-img'),
        detailTitle: document.getElementById('detail-title'),
        detailMeta: document.getElementById('detail-meta'),
        detailDesc: document.getElementById('detail-desc'),
        detailTags: document.getElementById('detail-tags'),
        aboutTrigger: document.getElementById('about-trigger'),
        aboutCard: document.getElementById('about-card'),
    };

    // ---------------------------------------------------------------
    // 4. Utility Functions
    // ---------------------------------------------------------------
    function stripHtml(text) {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
    }

    function debounce(fn, delay) {
        let timer = null;
        return function () {
            const args = arguments;
            const ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
        };
    }

    function isMobileView() {
        return window.innerWidth < 768;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---------------------------------------------------------------
    // 5. API Functions
    // ---------------------------------------------------------------
    async function fetchFromRest(endpoint, params) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const url = CONFIG.restBase + '/' + endpoint + qs;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('REST API failed:', url, res.status);
                return null;
            }
            return await res.json();
        } catch (err) {
            console.error('REST API error:', err);
            return null;
        }
    }

    async function fetchPhotos(params) {
        return await fetchFromRest(CONFIG.photosEndpoint, {
            per_page: CONFIG.perPage,
            _embed: '1',
            ...(params || {}),
        });
    }

    async function fetchRegionTags() {
        return await fetchFromRest(CONFIG.tagsEndpoint, { per_page: 50 });
    }

    // ---------------------------------------------------------------
    // 6. Data Processing
    // ---------------------------------------------------------------
    function buildGeoJSON(photos) {
        var features = [];

        photos.forEach(function (photo) {
            var lat = parseFloat(photo.latitude) || parseFloat(photo.meta && photo.meta.latitude) || 0;
            var lng = parseFloat(photo.longitude) || parseFloat(photo.meta && photo.meta.longitude) || 0;

            if (lat === 0 && lng === 0) return;

            var tags = [];
            if (photo._embedded && photo._embedded['wp:term']) {
                photo._embedded['wp:term'].forEach(function (termArray) {
                    termArray.forEach(function (term) {
                        if (term.taxonomy === 'region_tag') {
                            tags.push({ id: term.id, name: term.name, slug: term.slug });
                        }
                    });
                });
            }

            var thumbUrl = '';
            var fullUrl = '';
            if (photo.featured_image_src) {
                thumbUrl = photo.featured_image_src.medium || '';
                fullUrl = photo.featured_image_src.full || '';
            } else if (photo._embedded && photo._embedded['wp:featuredmedia']) {
                var media = photo._embedded['wp:featuredmedia'][0];
                if (media) {
                    thumbUrl = (media.media_details && media.media_details.sizes && media.media_details.sizes.medium && media.media_details.sizes.medium.source_url) || media.source_url || '';
                    fullUrl = media.source_url || '';
                }
            }

            var cameraInfo = photo.camera_info || (photo.meta && photo.meta.camera_info) || '';
            var takenAt = photo.taken_at || (photo.meta && photo.meta.taken_at) || '';

            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: {
                    id: photo.id,
                    title: (photo.title && photo.title.rendered) || 'Untitled',
                    description: stripHtml((photo.content && photo.content.rendered) || (photo.excerpt && photo.excerpt.rendered) || ''),
                    thumbnail: thumbUrl,
                    fullImage: fullUrl,
                    cameraInfo: cameraInfo,
                    takenAt: takenAt,
                    tags: tags,
                    tagSlugs: tags.map(function (t) { return t.slug; }),
                },
            });
        });

        return { type: 'FeatureCollection', features: features };
    }

    function countTagsInPhotos(geojson) {
        var counts = {};
        (geojson.features || []).forEach(function (f) {
            (f.properties.tagSlugs || []).forEach(function (slug) {
                counts[slug] = (counts[slug] || 0) + 1;
            });
        });
        return counts;
    }

    function filterGeoJSONByTags(geojson, slugs) {
        if (!slugs || slugs.length === 0) return geojson;
        var filtered = (geojson.features || []).filter(function (f) {
            var fs = f.properties.tagSlugs || [];
            return slugs.some(function (s) { return fs.indexOf(s) !== -1; });
        });
        return { type: 'FeatureCollection', features: filtered };
    }

    // ---------------------------------------------------------------
    // 7. Map Functions
    // ---------------------------------------------------------------
    function initMap() {
        state.map = new maplibregl.Map({
            container: 'map',
            style: CONFIG.styleUrl,
            center: CONFIG.center,
            zoom: CONFIG.zoom,
            maxZoom: CONFIG.maxZoom,
            minZoom: CONFIG.minZoom,
            attributionControl: true,
        });

        state.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        state.map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');

        state.map.on('load', function () {
            addPhotoSource(state.allPhotos);
            addPhotoLayers();
            bindMapEvents();
            hideLoading();
        });

        state.map.on('error', function (e) {
            console.warn('Map error:', (e.error && e.error.message) || e);
        });

        window.addEventListener('resize', debounce(function () {
            if (state.map) state.map.resize();
            var mobile = isMobileView();
            if (mobile !== state.isMobile) {
                state.isMobile = mobile;
                if (!mobile) closeFilterDrawer();
            }
        }, 200));
    }

    function addPhotoSource(geojson) {
        var data = geojson || { type: 'FeatureCollection', features: [] };

        // Remove old sources
        [CONFIG.clusterSourceId, CONFIG.sourceId].forEach(function (id) {
            if (state.map.getSource(id)) state.map.removeSource(id);
        });

        if (state.useClustering) {
            // Clustered source (MapLibre built-in clustering uses supercluster internally)
            state.map.addSource(CONFIG.clusterSourceId, {
                type: 'geojson',
                data: data,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 60,
                clusterMinPoints: 2,
            });
            // Also add an unclustered source for direct feature queries
            state.map.addSource(CONFIG.sourceId, {
                type: 'geojson',
                data: data,
            });
        } else {
            state.map.addSource(CONFIG.sourceId, {
                type: 'geojson',
                data: data,
            });
        }
    }

    function addPhotoLayers() {
        // Remove old layers
        [CONFIG.clusterCountLayerId, CONFIG.clusterLayerId, CONFIG.layerId].forEach(function (id) {
            if (state.map.getLayer(id)) state.map.removeLayer(id);
        });

        if (state.useClustering) {
            // Cluster circles
            state.map.addLayer({
                id: CONFIG.clusterLayerId,
                type: 'circle',
                source: CONFIG.clusterSourceId,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#e67e22',
                    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28, 200, 36],
                    'circle-opacity': 0.85,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                },
            });

            // Cluster count labels
            state.map.addLayer({
                id: CONFIG.clusterCountLayerId,
                type: 'symbol',
                source: CONFIG.clusterSourceId,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-size': 12,
                },
                paint: { 'text-color': '#ffffff' },
            });

            // Individual points (non-clustered)
            state.map.addLayer({
                id: CONFIG.layerId,
                type: 'circle',
                source: CONFIG.clusterSourceId,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': CONFIG.markerColor,
                    'circle-radius': CONFIG.markerRadius,
                    'circle-stroke-width': CONFIG.markerBorderWidth,
                    'circle-stroke-color': CONFIG.markerBorderColor,
                    'circle-opacity': 0.95,
                },
            });
        } else {
            state.map.addLayer({
                id: CONFIG.layerId,
                type: 'circle',
                source: CONFIG.sourceId,
                paint: {
                    'circle-color': CONFIG.markerColor,
                    'circle-radius': CONFIG.markerRadius,
                    'circle-stroke-width': CONFIG.markerBorderWidth,
                    'circle-stroke-color': CONFIG.markerBorderColor,
                    'circle-opacity': 0.95,
                },
            });
        }

        // Hover cursor
        state.map.on('mouseenter', CONFIG.layerId, function () {
            state.map.getCanvas().style.cursor = 'pointer';
        });
        state.map.on('mouseleave', CONFIG.layerId, function () {
            state.map.getCanvas().style.cursor = '';
        });
    }

    function updatePhotoData(geojson) {
        if (!state.map || !(state.map.isStyleLoaded() || state.map.loaded())) return;

        if (state.useClustering) {
            var cSource = state.map.getSource(CONFIG.clusterSourceId);
            if (cSource && typeof cSource.setData === 'function') cSource.setData(geojson);
            var pSource = state.map.getSource(CONFIG.sourceId);
            if (pSource && typeof pSource.setData === 'function') pSource.setData(geojson);
        } else {
            var source = state.map.getSource(CONFIG.sourceId);
            if (source && typeof source.setData === 'function') source.setData(geojson);
        }
    }

    // ---------------------------------------------------------------
    // 8. Map Event Bindings
    // ---------------------------------------------------------------
    function bindMapEvents() {
        // Click on individual photo point → open detail
        state.map.on('click', CONFIG.layerId, function (e) {
            if (!e.features || e.features.length === 0) return;
            var feature = e.features[0];
            openDetailPanel(feature.properties);
            if (e.originalEvent) e.originalEvent.stopPropagation();
        });

        // Click on cluster → zoom in
        if (state.useClustering) {
            state.map.on('click', CONFIG.clusterLayerId, function (e) {
                if (!e.features || e.features.length === 0) return;
                var props = e.features[0].properties;
                var clusterId = props.cluster_id;
                var source = state.map.getSource(CONFIG.clusterSourceId);

                if (source && typeof source.getClusterExpansionZoom === 'function') {
                    source.getClusterExpansionZoom(clusterId, function (err, zoom) {
                        if (err) return;
                        state.map.easeTo({
                            center: e.features[0].geometry.coordinates,
                            zoom: zoom,
                            duration: 400,
                        });
                    });
                }
                if (e.originalEvent) e.originalEvent.stopPropagation();
            });
        }

        // Click on map background → close panels
        state.map.on('click', function () {
            closeDetailPanel();
            if (state.isMobile) closeFilterDrawer();
            closeAboutCard();
        });
    }

    // ---------------------------------------------------------------
    // 9. Detail Panel
    // ---------------------------------------------------------------
    function openDetailPanel(props) {
        if (!props) return;

        dom.detailImg.src = props.fullImage || props.thumbnail || '';
        dom.detailImg.alt = props.title || '';
        dom.detailTitle.textContent = props.title || '';

        var metaHtml = '';
        if (props.cameraInfo) {
            metaHtml += '<span class="detail-meta-item">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M17 6V4H7v2"/></svg>'
                + escapeHtml(props.cameraInfo) + '</span>';
        }
        if (props.takenAt) {
            metaHtml += '<span class="detail-meta-item">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>'
                + formatDate(props.takenAt) + '</span>';
        }
        dom.detailMeta.innerHTML = metaHtml;

        dom.detailDesc.textContent = props.description || '';

        var tagsHtml = '';
        (props.tags || []).forEach(function (tag) {
            tagsHtml += '<span class="detail-tag">' + escapeHtml(tag.name) + '</span>';
        });
        dom.detailTags.innerHTML = tagsHtml;

        dom.detailSheet.classList.add('active');
        state.detailOpen = true;
    }

    function closeDetailPanel() {
        dom.detailSheet.classList.remove('active');
        state.detailOpen = false;
    }

    // ---------------------------------------------------------------
    // 10. Filter Panel
    // ---------------------------------------------------------------
    function renderFilterTags(tags, countMap) {
        dom.tagList.innerHTML = '';

        if (!tags || tags.length === 0) {
            dom.tagList.innerHTML = '<p style="color:#666;font-size:0.8125rem;">暂无标签</p>';
            return;
        }

        tags.forEach(function (tag) {
            var btn = document.createElement('button');
            btn.className = 'tag-btn';
            btn.dataset.slug = tag.slug;
            btn.innerHTML = escapeHtml(tag.name)
                + '<span class="tag-count">(' + ((countMap && countMap[tag.slug]) || tag.count || 0) + ')</span>';

            if (state.activeFilterSlugs.indexOf(tag.slug) !== -1) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', function () { toggleFilterTag(tag.slug); });
            dom.tagList.appendChild(btn);
        });
    }

    function toggleFilterTag(slug) {
        var idx = state.activeFilterSlugs.indexOf(slug);
        if (idx === -1) {
            state.activeFilterSlugs.push(slug);
        } else {
            state.activeFilterSlugs.splice(idx, 1);
        }

        dom.tagList.querySelectorAll('.tag-btn').forEach(function (btn) {
            if (btn.dataset.slug === slug) btn.classList.toggle('active');
        });

        applyFilter();
    }

    function applyFilter() {
        var data;
        if (state.activeFilterSlugs.length === 0) {
            data = state.allPhotos;
        } else {
            data = filterGeoJSONByTags(state.allPhotos, state.activeFilterSlugs);
        }
        state.filteredPhotos = data;
        updatePhotoData(data);
        updateTagCounts(data);
    }

    function updateTagCounts(geojson) {
        var counts = countTagsInPhotos(geojson);
        dom.tagList.querySelectorAll('.tag-btn').forEach(function (btn) {
            var slug = btn.dataset.slug;
            var span = btn.querySelector('.tag-count');
            if (span) span.textContent = '(' + (counts[slug] || 0) + ')';
        });
    }

    function openFilterDrawer() {
        dom.filterPanel.classList.add('open');
        state.filterOpen = true;
    }

    function closeFilterDrawer() {
        dom.filterPanel.classList.remove('open');
        state.filterOpen = false;
    }

    // ---------------------------------------------------------------
    // 11. About Card
    // ---------------------------------------------------------------
    function toggleAboutCard(e) {
        if (e) e.stopPropagation();
        dom.aboutCard.classList.toggle('hidden');
    }

    function closeAboutCard() {
        dom.aboutCard.classList.add('hidden');
    }

    // ---------------------------------------------------------------
    // 12. Loading State
    // ---------------------------------------------------------------
    function hideLoading() {
        if (!dom.loadingOverlay) return;
        dom.loadingOverlay.classList.add('fade-out');
        setTimeout(function () { dom.loadingOverlay.style.display = 'none'; }, 600);
    }

    // ---------------------------------------------------------------
    // 13. UI Event Bindings
    // ---------------------------------------------------------------
    function bindUIEvents() {
        dom.closeDetail.addEventListener('click', function (e) {
            e.stopPropagation();
            closeDetailPanel();
        });

        dom.filterToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (state.filterOpen) closeFilterDrawer();
            else openFilterDrawer();
        });

        dom.aboutTrigger.addEventListener('click', function (e) { toggleAboutCard(e); });
        dom.aboutCard.addEventListener('click', function (e) { e.stopPropagation(); });

        // ESC key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' || e.key === 'Esc') {
                closeDetailPanel();
                if (state.isMobile) closeFilterDrawer();
                closeAboutCard();
            }
        });
    }

    // ---------------------------------------------------------------
    // 14. Main Initialization
    // ---------------------------------------------------------------
    async function init() {
        try {
            // 1. Fetch tags
            var tagsData = await fetchRegionTags();
            if (tagsData && Array.isArray(tagsData)) {
                state.regionTags = tagsData.map(function (t) {
                    return { id: t.id, name: t.name, slug: t.slug, count: t.count || 0 };
                });
            }

            // 2. Fetch photos
            var photosData = await fetchPhotos();
            var geojson = { type: 'FeatureCollection', features: [] };
            if (photosData && Array.isArray(photosData) && photosData.length > 0) {
                geojson = buildGeoJSON(photosData);
            }
            state.allPhotos = geojson;

            // 3. Photo counts per tag
            var countMap = countTagsInPhotos(geojson);

            // 4. Render filter tags
            renderFilterTags(state.regionTags, countMap);

            // 5. Initialize map (adds data sources on load)
            initMap();

            // 6. Bind UI events
            bindUIEvents();

        } catch (err) {
            console.error('Init error:', err);
            hideLoading();
        }
    }

    // ---------------------------------------------------------------
    // 15. Kickoff
    // ---------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();