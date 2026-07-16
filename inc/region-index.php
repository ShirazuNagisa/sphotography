<?php
/**
 * Sphotography - Administrative-region index (v1.2.6)
 *
 * For every geolocated image we resolve which administrative region contains
 * it — province/state worldwide, plus city level inside China — by running a
 * point-in-polygon test against the bundled boundary data in assets/geo/. The
 * resolved region ids (adcodes) are cached in attachment meta so the frontend
 * "行政区上色" mode can colour whole regions and group each region's photos
 * without any per-request geometry work beyond the regions actually in use.
 *
 * Boundary data (assets/geo/boundaries-*.json) is normalized to:
 *   properties.id    string  region id (China: 6-digit adcode; world: NE adm1_code)
 *   properties.name  string  display name
 *   properties.level 'province' | 'city'
 *   properties.cc    string  ISO country code ('CN' for China)
 *   properties.pid   string  (cities only) parent province adcode
 *
 * @package Sphotography
 * @version 1.2.6
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Attachment meta keys (underscore-prefixed → hidden from the custom-fields UI).
const SPHOTOGRAPHY_META_PROV   = '_sphotography_prov_adcode';
const SPHOTOGRAPHY_META_CITY   = '_sphotography_city_adcode';
const SPHOTOGRAPHY_META_GEOVER = '_sphotography_geo_ver';

// Bump when the boundary data changes so stale rows can be detected.
const SPHOTOGRAPHY_GEO_VERSION = '1';

// The boundary GeoJSON is NOT shipped in the theme package (it is ~3.7 MB and
// would bloat both the upload and the self-update archive). It lives on the
// repo's dedicated `geo-data` branch, served by jsDelivr, and is downloaded on
// demand into wp-content/uploads/sphotography-geo/ the first time the index is
// rebuilt, then cached on disk. Bump SPHOTOGRAPHY_GEO_DATA_VERSION to force a
// re-download when the hosted data changes.
const SPHOTOGRAPHY_GEO_DATA_VERSION = '1';
const SPHOTOGRAPHY_GEO_REMOTE_BASE  = 'https://cdn.jsdelivr.net/gh/ShirazuNagisa/sphotography@geo-data/';

// Nearest-region fallback radius in degrees (~20 km). Coastal / offshore
// photos that fall just outside a simplified polygon snap to the nearest
// region; anything farther (open ocean, uncovered areas) stays unresolved and
// the frontend renders it as a normal droplet instead.
const SPHOTOGRAPHY_NEAREST_DEG = 0.2;

// ============================================
// Boundary data storage (downloaded to uploads on demand)
// ============================================
/**
 * Directory the boundary files are cached in (created lazily).
 */
function sphotography_geo_dir() {
    $u = wp_upload_dir();
    return trailingslashit( $u['basedir'] ) . 'sphotography-geo';
}

/**
 * On-disk path for a boundary set.
 *
 * @param string $which 'provinces' | 'cities'
 */
function sphotography_geo_file_path( $which ) {
    return sphotography_geo_dir() . '/boundaries-' . $which . '.json';
}

/**
 * Are both boundary files present on disk at the current data version?
 */
function sphotography_geo_files_ready() {
    $ver_file = sphotography_geo_dir() . '/version.txt';
    $have_ver = is_readable( $ver_file ) ? trim( (string) file_get_contents( $ver_file ) ) : '';
    if ( $have_ver !== SPHOTOGRAPHY_GEO_DATA_VERSION ) {
        return false;
    }
    foreach ( array( 'provinces', 'cities' ) as $which ) {
        $p = sphotography_geo_file_path( $which );
        if ( ! is_readable( $p ) || filesize( $p ) < 1000 ) {
            return false;
        }
    }
    return true;
}

/**
 * Ensure the boundary files are present, downloading them from the hosted
 * geo-data branch (jsDelivr) into uploads if missing or outdated. This makes
 * an outbound HTTP request and is only ever called from the admin "rebuild
 * index" action — never on a frontend page render.
 *
 * @param bool $force Re-download even if present.
 * @return true|WP_Error
 */
function sphotography_geo_ensure_files( $force = false ) {
    if ( ! $force && sphotography_geo_files_ready() ) {
        return true;
    }
    $dir = sphotography_geo_dir();
    if ( ! wp_mkdir_p( $dir ) ) {
        return new WP_Error( 'sphotography_geo_mkdir', sprintf( __( '无法创建目录：%s', 'sphotography' ), $dir ) );
    }
    foreach ( array( 'provinces', 'cities' ) as $which ) {
        $url  = SPHOTOGRAPHY_GEO_REMOTE_BASE . 'boundaries-' . $which . '.json';
        // Generous timeout: this is a one-time admin download, and slow server
        // links shouldn't fail it. WordPress requests gzip and decompresses, so
        // the wire transfer is ~1 MB total, not the ~3.7 MB on-disk size.
        $resp = wp_remote_get( $url, array( 'timeout' => 120 ) );
        if ( is_wp_error( $resp ) ) {
            return new WP_Error( 'sphotography_geo_http', sprintf( __( '下载失败：%1$s（%2$s）', 'sphotography' ), $url, $resp->get_error_message() ) );
        }
        $code = (int) wp_remote_retrieve_response_code( $resp );
        if ( 200 !== $code ) {
            return new WP_Error( 'sphotography_geo_http', sprintf( __( '下载失败：%1$s（HTTP %2$d）', 'sphotography' ), $url, $code ) );
        }
        $body = wp_remote_retrieve_body( $resp );
        if ( strlen( $body ) < 1000 || false === strpos( $body, 'FeatureCollection' ) ) {
            return new WP_Error( 'sphotography_geo_body', sprintf( __( '下载内容异常：%s', 'sphotography' ), $url ) );
        }
        if ( false === file_put_contents( sphotography_geo_file_path( $which ), $body ) ) {
            return new WP_Error( 'sphotography_geo_write', sprintf( __( '无法写入文件：%s', 'sphotography' ), sphotography_geo_file_path( $which ) ) );
        }
    }
    @file_put_contents( $dir . '/version.txt', SPHOTOGRAPHY_GEO_DATA_VERSION );
    return true;
}

// ============================================
// Boundary data loading (decoded once per request, bbox precomputed)
// ============================================
/**
 * Load and cache the decoded features for one boundary set, with a bounding
 * box precomputed on each feature under the '_bbox' key [minX,minY,maxX,maxY].
 * Reads only from the on-disk cache (uploads); never downloads. Returns an
 * empty list when the files have not been fetched yet, so callers degrade
 * gracefully (frontend falls back to droplets).
 *
 * @param string $which 'provinces' | 'cities'
 * @return array[] List of GeoJSON features (may be empty if the file is missing).
 */
function sphotography_geo_load( $which ) {
    static $cache = array();
    if ( isset( $cache[ $which ] ) ) {
        return $cache[ $which ];
    }
    $file     = sphotography_geo_file_path( $which );
    $features = array();
    if ( is_readable( $file ) ) {
        $decoded = json_decode( (string) file_get_contents( $file ), true );
        if ( isset( $decoded['features'] ) && is_array( $decoded['features'] ) ) {
            foreach ( $decoded['features'] as $f ) {
                if ( empty( $f['geometry']['coordinates'] ) ) {
                    continue;
                }
                $f['_bbox']  = sphotography_geo_bbox( $f['geometry'] );
                $features[]  = $f;
            }
        }
    }
    $cache[ $which ] = $features;
    return $features;
}

/**
 * Bounding box of a Polygon/MultiPolygon geometry.
 *
 * @return float[] [minX, minY, maxX, maxY]
 */
function sphotography_geo_bbox( $geom ) {
    $minx = INF; $miny = INF; $maxx = -INF; $maxy = -INF;
    $polys = ( 'Polygon' === $geom['type'] ) ? array( $geom['coordinates'] ) : $geom['coordinates'];
    foreach ( $polys as $poly ) {
        foreach ( $poly as $ring ) {
            foreach ( $ring as $pt ) {
                if ( $pt[0] < $minx ) { $minx = $pt[0]; }
                if ( $pt[0] > $maxx ) { $maxx = $pt[0]; }
                if ( $pt[1] < $miny ) { $miny = $pt[1]; }
                if ( $pt[1] > $maxy ) { $maxy = $pt[1]; }
            }
        }
    }
    return array( $minx, $miny, $maxx, $maxy );
}

// ============================================
// Point-in-polygon + nearest-region resolution
// ============================================
/**
 * Ray-casting test: is (x,y) inside a single linear ring?
 */
function sphotography_geo_pip_ring( $x, $y, $ring ) {
    $inside = false;
    $n      = count( $ring );
    for ( $i = 0, $j = $n - 1; $i < $n; $j = $i++ ) {
        $xi = $ring[ $i ][0]; $yi = $ring[ $i ][1];
        $xj = $ring[ $j ][0]; $yj = $ring[ $j ][1];
        if ( ( ( $yi > $y ) !== ( $yj > $y ) )
            && ( $x < ( $xj - $xi ) * ( $y - $yi ) / ( $yj - $yi ) + $xi ) ) {
            $inside = ! $inside;
        }
    }
    return $inside;
}

/**
 * Is (x,y) inside a feature's geometry (outer ring, minus holes)?
 */
function sphotography_geo_point_in_feature( $x, $y, $feature ) {
    $bb = $feature['_bbox'];
    if ( $x < $bb[0] || $x > $bb[2] || $y < $bb[1] || $y > $bb[3] ) {
        return false;
    }
    $geom  = $feature['geometry'];
    $polys = ( 'Polygon' === $geom['type'] ) ? array( $geom['coordinates'] ) : $geom['coordinates'];
    foreach ( $polys as $poly ) {
        if ( empty( $poly[0] ) || ! sphotography_geo_pip_ring( $x, $y, $poly[0] ) ) {
            continue;
        }
        $in_hole = false;
        $rings   = count( $poly );
        for ( $k = 1; $k < $rings; $k++ ) {
            if ( sphotography_geo_pip_ring( $x, $y, $poly[ $k ] ) ) {
                $in_hole = true;
                break;
            }
        }
        if ( ! $in_hole ) {
            return true;
        }
    }
    return false;
}

/**
 * Squared distance from point to segment, x scaled by cos(lat) so degrees
 * behave roughly isotropically near the point (good enough for a nearest
 * tiebreak within ~20 km).
 */
function sphotography_geo_seg_dist2( $px, $py, $ax, $ay, $bx, $by, $kx ) {
    $dx = ( $bx - $ax ) * $kx;
    $dy = $by - $ay;
    $l2 = $dx * $dx + $dy * $dy;
    $t  = $l2 > 0 ? ( ( ( $px - $ax ) * $kx ) * $dx + ( $py - $ay ) * $dy ) / $l2 : 0;
    if ( $t < 0 ) { $t = 0; } elseif ( $t > 1 ) { $t = 1; }
    $cx = $ax + ( $t * $dx ) / $kx;
    $cy = $ay + $t * $dy;
    $ex = ( $px - $cx ) * $kx;
    $ey = $py - $cy;
    return $ex * $ex + $ey * $ey;
}

/**
 * Minimum squared distance (scaled degrees) from point to a feature's edges.
 */
function sphotography_geo_dist2_feature( $px, $py, $feature ) {
    $kx    = cos( $py * M_PI / 180 );
    $geom  = $feature['geometry'];
    $polys = ( 'Polygon' === $geom['type'] ) ? array( $geom['coordinates'] ) : $geom['coordinates'];
    $min   = INF;
    foreach ( $polys as $poly ) {
        foreach ( $poly as $ring ) {
            $n = count( $ring );
            for ( $i = 0, $j = $n - 1; $i < $n; $j = $i++ ) {
                $d = sphotography_geo_seg_dist2( $px, $py, $ring[ $j ][0], $ring[ $j ][1], $ring[ $i ][0], $ring[ $i ][1], $kx );
                if ( $d < $min ) { $min = $d; }
            }
        }
    }
    return $min;
}

/**
 * Resolve one boundary level for a coordinate: exact containment first, then
 * nearest region within SPHOTOGRAPHY_NEAREST_DEG.
 *
 * @return array|null Matched feature properties, or null if unresolved.
 */
function sphotography_geo_resolve_level( $lng, $lat, $which ) {
    $features = sphotography_geo_load( $which );
    foreach ( $features as $f ) {
        if ( sphotography_geo_point_in_feature( $lng, $lat, $f ) ) {
            return $f['properties'];
        }
    }
    $best     = null;
    $best_d2  = SPHOTOGRAPHY_NEAREST_DEG * SPHOTOGRAPHY_NEAREST_DEG;
    $margin   = SPHOTOGRAPHY_NEAREST_DEG;
    foreach ( $features as $f ) {
        $bb = $f['_bbox'];
        if ( $lng < $bb[0] - $margin || $lng > $bb[2] + $margin || $lat < $bb[1] - $margin || $lat > $bb[3] + $margin ) {
            continue;
        }
        $d2 = sphotography_geo_dist2_feature( $lng, $lat, $f );
        if ( $d2 < $best_d2 ) {
            $best_d2 = $d2;
            $best    = $f['properties'];
        }
    }
    return $best;
}

/**
 * Resolve province (worldwide) and city (China only) for a coordinate.
 *
 * @return array{prov: ?array, city: ?array}
 */
function sphotography_geo_resolve( $lat, $lng ) {
    $prov = sphotography_geo_resolve_level( $lng, $lat, 'provinces' );
    $city = null;
    if ( $prov && isset( $prov['cc'] ) && 'CN' === $prov['cc'] ) {
        $city = sphotography_geo_resolve_level( $lng, $lat, 'cities' );
    }
    return array( 'prov' => $prov, 'city' => $city );
}

// ============================================
// Per-attachment indexing
// ============================================
/**
 * Compute and cache the province/city adcode for one attachment from its
 * stored latitude/longitude. Clears the meta when coordinates are absent.
 *
 * @param int $attachment_id
 * @return array{prov: string, city: string}
 */
function sphotography_index_attachment( $attachment_id ) {
    $attachment_id = (int) $attachment_id;
    $lat = get_post_meta( $attachment_id, 'latitude', true );
    $lng = get_post_meta( $attachment_id, 'longitude', true );

    $clear = function () use ( $attachment_id ) {
        delete_post_meta( $attachment_id, SPHOTOGRAPHY_META_PROV );
        delete_post_meta( $attachment_id, SPHOTOGRAPHY_META_CITY );
        update_post_meta( $attachment_id, SPHOTOGRAPHY_META_GEOVER, SPHOTOGRAPHY_GEO_VERSION );
    };

    if ( '' === $lat || '' === $lng ) {
        $clear();
        return array( 'prov' => '', 'city' => '' );
    }
    $lat = (float) $lat;
    $lng = (float) $lng;
    if ( 0.0 === $lat && 0.0 === $lng ) {
        $clear();
        return array( 'prov' => '', 'city' => '' );
    }

    $r    = sphotography_geo_resolve( $lat, $lng );
    $prov = ( $r['prov'] && isset( $r['prov']['id'] ) ) ? (string) $r['prov']['id'] : '';
    $city = ( $r['city'] && isset( $r['city']['id'] ) ) ? (string) $r['city']['id'] : '';

    if ( '' !== $prov ) {
        update_post_meta( $attachment_id, SPHOTOGRAPHY_META_PROV, $prov );
    } else {
        delete_post_meta( $attachment_id, SPHOTOGRAPHY_META_PROV );
    }
    if ( '' !== $city ) {
        update_post_meta( $attachment_id, SPHOTOGRAPHY_META_CITY, $city );
    } else {
        delete_post_meta( $attachment_id, SPHOTOGRAPHY_META_CITY );
    }
    update_post_meta( $attachment_id, SPHOTOGRAPHY_META_GEOVER, SPHOTOGRAPHY_GEO_VERSION );

    return array( 'prov' => $prov, 'city' => $city );
}

// Re-index whenever an image's coordinates are (re)saved.
add_action( 'wp_generate_attachment_metadata', function ( $metadata, $attachment_id ) {
    if ( 'attachment' === get_post_type( $attachment_id ) ) {
        sphotography_index_attachment( $attachment_id );
    }
    return $metadata;
}, 20, 2 );

// Manual latitude/longitude edits in the media dialog run through
// attachment_fields_to_save (media-fields.php); re-index just after.
add_filter( 'attachment_fields_to_save', function ( $post, $attachment ) {
    if ( isset( $attachment['sphotography_latitude'] ) || isset( $attachment['sphotography_longitude'] ) ) {
        sphotography_index_attachment( $post['ID'] );
    }
    return $post;
}, 20, 2 );

// ============================================
// Frontend consumption helpers
// ============================================
/**
 * Cached province/city adcode for an attachment (no recompute).
 *
 * @return array{prov: string, city: string}
 */
function sphotography_attachment_adcodes( $attachment_id ) {
    return array(
        'prov' => (string) get_post_meta( (int) $attachment_id, SPHOTOGRAPHY_META_PROV, true ),
        'city' => (string) get_post_meta( (int) $attachment_id, SPHOTOGRAPHY_META_CITY, true ),
    );
}

/**
 * Return the boundary features whose id is in $ids, as a GeoJSON
 * FeatureCollection stripped of the internal '_bbox' key. Used to emit only
 * the regions that actually contain photos to the frontend.
 *
 * @param string[] $ids Region ids (mix of province + city).
 * @return array GeoJSON FeatureCollection.
 */
function sphotography_geo_features_for_ids( $ids ) {
    $want     = array_fill_keys( array_map( 'strval', $ids ), true );
    $features = array();
    foreach ( array( 'provinces', 'cities' ) as $which ) {
        foreach ( sphotography_geo_load( $which ) as $f ) {
            $id = isset( $f['properties']['id'] ) ? (string) $f['properties']['id'] : '';
            if ( '' !== $id && isset( $want[ $id ] ) ) {
                unset( $f['_bbox'] );
                $features[] = $f;
            }
        }
    }
    return array( 'type' => 'FeatureCollection', 'features' => $features );
}

// ============================================
// Manual "rebuild index" — batched admin-ajax endpoint
// ============================================
/**
 * All attachment ids that carry a latitude value (candidates for indexing).
 *
 * @return int[]
 */
function sphotography_geo_indexable_ids() {
    global $wpdb;
    $ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT DISTINCT p.ID FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
         WHERE p.post_type = %s AND m.meta_key = %s AND m.meta_value <> ''
         ORDER BY p.ID ASC",
        'attachment',
        'latitude'
    ) );
    return array_map( 'intval', $ids );
}

function sphotography_ajax_rebuild_geo_index() {
    check_ajax_referer( 'sphotography_geo_rebuild', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( array( 'message' => __( '权限不足。', 'sphotography' ) ) );
    }

    $offset = isset( $_POST['offset'] ) ? max( 0, (int) $_POST['offset'] ) : 0;

    // On the first batch, make sure the boundary data is present (downloaded
    // on demand into uploads). If the server cannot fetch it, tell the admin
    // how to place the files manually rather than failing silently.
    if ( 0 === $offset ) {
        $ready = sphotography_geo_ensure_files();
        if ( is_wp_error( $ready ) ) {
            wp_send_json_error( array(
                'message' => sprintf(
                    /* translators: 1: error detail, 2: uploads dir, 3: source base URL */
                    __( '%1$s。服务器可能无法访问外网。请手动下载边界文件放入 %2$s（来源：%3$s）。', 'sphotography' ),
                    $ready->get_error_message(),
                    sphotography_geo_dir(),
                    SPHOTOGRAPHY_GEO_REMOTE_BASE
                ),
            ) );
        }
    }

    $ids   = sphotography_geo_indexable_ids();
    $total = count( $ids );
    $batch  = 60; // polygons are heavy; keep each request comfortably under PHP time limits.

    $slice   = array_slice( $ids, $offset, $batch );
    $matched = 0;
    foreach ( $slice as $id ) {
        $r = sphotography_index_attachment( $id );
        if ( '' !== $r['prov'] ) {
            $matched++;
        }
    }

    $done = $offset + count( $slice );
    wp_send_json_success( array(
        'total'       => $total,
        'done'        => $done,
        'next_offset' => $done,
        'finished'    => $done >= $total,
        'batchMatched' => $matched,
    ) );
}
add_action( 'wp_ajax_sphotography_rebuild_geo_index', 'sphotography_ajax_rebuild_geo_index' );
