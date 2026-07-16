<?php
/**
 * Sphotography - Apply Theme Mods to Frontend
 *
 * @package Sphotography
 * @version 1.2.4
 */

// ============================================
// 1. Get a single theme mod with default
// ============================================
function sphotography_get_mod( $key ) {
    $defaults = sphotography_get_default_settings();
    return get_theme_mod( 'sphotography_' . $key, $defaults[ $key ] );
}

// ============================================
// 2. Output dynamic CSS variables in <head>
// ============================================
function sphotography_output_head_links() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }
    // DNS preconnect for CDN resources to reduce latency
    $cdn = sphotography_get_cdn_urls();
    ?>
    <link rel="preconnect" href="https://<?php echo esc_attr( $cdn['domain'] ); ?>" crossorigin>
    <link rel="preconnect" href="https://basemaps.cartocdn.com" crossorigin>
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="dns-prefetch" href="https://<?php echo esc_attr( $cdn['domain'] ); ?>">
    <link rel="dns-prefetch" href="https://basemaps.cartocdn.com">
    <?php
}
add_action( 'wp_head', 'sphotography_output_head_links', 1 );

function sphotography_output_dynamic_css() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }

    $primary   = sphotography_get_mod( 'primary_color' );
    $radius    = (int) sphotography_get_mod( 'card_radius' );
    $shadow    = sphotography_get_mod( 'card_shadow' );
    $scheme    = sphotography_get_mod( 'dark_scheme' );
    $immersive = sphotography_get_mod( 'immersive_color' );

    $scheme_bgs = array(
        'default' => '#0b0b0b',
        'blue'    => '#0a1628',
        'purple'  => '#1a0a1e',
    );
    $bg = isset( $scheme_bgs[ $scheme ] ) ? $scheme_bgs[ $scheme ] : '#0b0b0b';

    $shadow_value = ( $shadow === 'deep' )
        ? '0 8px 32px rgba(0,0,0,0.4)'
        : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';

    $immersive_bg = $immersive ? $primary : 'transparent';

    // Map tint overlay opacity (0–1) from the intensity percentage.
    $tint_opacity = max( 0, min( 100, (int) sphotography_get_mod( 'map_tint_intensity' ) ) ) / 100;

    ?>
    <style id="sphotography-dynamic-css">
        :root {
            --sphotography-primary-color: <?php echo esc_attr( $primary ); ?>;
            --sphotography-card-radius: <?php echo esc_attr( $radius ); ?>px;
            --sphotography-card-shadow: <?php echo esc_attr( $shadow_value ); ?>;
            --sphotography-bg: <?php echo esc_attr( $bg ); ?>;
            --sphotography-immersive-bg: <?php echo esc_attr( $immersive_bg ); ?>;
            --sphotography-tint-opacity: <?php echo esc_attr( $tint_opacity ); ?>;
        }
    </style>
    <?php
}
add_action( 'wp_head', 'sphotography_output_dynamic_css', 20 );

// ============================================
// 3. Add body classes
// ============================================
function sphotography_body_classes( $classes ) {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return $classes;
    }

    $night_mode = sphotography_get_mod( 'night_mode' );

    if ( $night_mode === 'dark' ) {
        $classes[] = 'sphotography-night-force-dark';
    } elseif ( $night_mode === 'light' ) {
        $classes[] = 'sphotography-night-force-light';
    } else {
        $classes[] = 'sphotography-night-system';
    }

    $smooth = sphotography_get_mod( 'smooth_scroll' );
    if ( $smooth === 'disabled' ) {
        $classes[] = 'sphotography-scroll-disabled';
    } elseif ( $smooth === 'mouse-only' ) {
        $classes[] = 'sphotography-scroll-mouse';
    } else {
        $classes[] = 'sphotography-scroll-enabled';
    }

    // Frontend font: serif (default) keeps the theme's Noto Serif SC stack;
    // 'wordpress' switches to the system sans-serif stack globally.
    if ( sphotography_get_mod( 'frontend_font' ) === 'wordpress' ) {
        $classes[] = 'sphotography-font-wordpress';
    }

    // Map theme-color tint overlay.
    if ( sphotography_get_mod( 'map_tint' ) ) {
        $classes[] = 'sphotography-map-tint';
    }

    return $classes;
}
add_filter( 'body_class', 'sphotography_body_classes' );

// ============================================
// 4. Pass settings to JS + embed photo/post data
// ============================================
function sphotography_localize_data() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }

    // Settings
    wp_localize_script( 'sphotography-app', 'SphotographySettings', array(
        'nightMode'        => sphotography_get_mod( 'night_mode' ),
        'darkScheme'       => sphotography_get_mod( 'dark_scheme' ),
        'preloaderStyle'   => sphotography_get_mod( 'preloader_style' ),
        'dateFormat'       => sphotography_get_mod( 'date_format' ),
        'customDateFormat' => sphotography_get_mod( 'custom_date_format' ),
        'enableHitokoto'   => (bool) sphotography_get_mod( 'enable_hitokoto' ),
        'smoothScroll'     => sphotography_get_mod( 'smooth_scroll' ),
        'entryAnimation'   => (bool) sphotography_get_mod( 'entry_animation' ),
        'pjaxAnimation'    => (bool) sphotography_get_mod( 'pjax_animation' ),
        'primaryColor'     => sphotography_get_mod( 'primary_color' ),
        'frontendFont'     => sphotography_get_mod( 'frontend_font' ),
        'sidebarDefaultOpen' => (bool) sphotography_get_mod( 'sidebar_default_open' ),
        'articleCardSize'  => sphotography_get_mod( 'article_card_size' ),
        'readingInfo'      => (bool) sphotography_get_mod( 'reading_info' ),
        'readingSpeedCjk'  => (int) sphotography_get_mod( 'reading_speed_cjk' ),
        'readingSpeedLatin' => (int) sphotography_get_mod( 'reading_speed_latin' ),
        'mapStyle'         => sphotography_get_mod( 'map_style' ),
        'mapStyleCustomUrl' => sphotography_get_mod( 'map_style_custom_url' ),
    ) );

    // ============================================
    // Embed markers as inline JSON (bypasses REST API 403).
    // Markers come from the shared builder: every geolocated image used by a
    // published post, each linking back to its parent post. This mirrors the
    // sphotography/v1/photos REST route exactly.
    // ============================================
    $photo_data_arr = sphotography_collect_all_markers();

    // Embed recent posts
    $recent_posts = get_posts( array(
        'post_type'      => 'post',
        'posts_per_page' => 50,
        'post_status'    => 'publish',
    ) );

    $post_data = array();
    foreach ( $recent_posts as $p ) {
        $thumb_p = '';
        if ( has_post_thumbnail( $p->ID ) ) {
            $t = wp_get_attachment_image_src( get_post_thumbnail_id( $p->ID ), 'thumbnail' );
            if ( $t ) { $thumb_p = $t[0]; }
        }

        $cats = wp_get_post_categories( $p->ID, array( 'fields' => 'all' ) );
        $terms_data = array();
        foreach ( $cats as $cat ) {
            $terms_data[] = array(
                'taxonomy' => 'category',
                'name'     => $cat->name,
                'slug'     => $cat->slug,
            );
        }
        $region_terms = wp_get_post_terms( $p->ID, 'region_tag', array( 'fields' => 'all' ) );
        foreach ( $region_terms as $rt ) {
            $terms_data[] = array(
                'taxonomy' => 'region_tag',
                'name'     => $rt->name,
                'slug'     => $rt->slug,
            );
        }

        $post_data[] = array(
            'id'      => $p->ID,
            'title'   => get_the_title( $p->ID ),
            'date'    => $p->post_date,
            'excerpt' => strip_tags( $p->post_excerpt ?: wp_trim_words( $p->post_content, 30 ) ),
            'thumb'   => $thumb_p,
            'terms'   => $terms_data,
        );
    }

    // Inline script with all data (before map initializes)
    wp_add_inline_script( 'sphotography-app',
        'var SphotographyInlineData = ' . json_encode( array(
            'photos' => $photo_data_arr,
            'posts'  => $post_data,
        ) ) . ';',
        'before'
    );
}
add_action( 'wp_enqueue_scripts', 'sphotography_localize_data', 20 );
