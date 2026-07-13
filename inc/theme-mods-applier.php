<?php
/**
 * Sphotography - Apply Theme Mods to Frontend
 *
 * Reads all theme_mod settings and outputs:
 * 1. Inline CSS variables in <head>
 * 2. Body classes for dark mode
 * 3. JS config via wp_localize_script
 *
 * @package Sphotography
 * @version 1.0.0
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
function sphotography_output_dynamic_css() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }

    $primary   = sphotography_get_mod( 'primary_color' );
    $radius    = (int) sphotography_get_mod( 'card_radius' );
    $shadow    = sphotography_get_mod( 'card_shadow' );
    $scheme    = sphotography_get_mod( 'dark_scheme' );
    $immersive = sphotography_get_mod( 'immersive_color' );

    // Dark scheme backgrounds
    $scheme_bgs = array(
        'default' => '#0b0b0b',
        'blue'    => '#0a1628',
        'purple'  => '#1a0a1e',
    );
    $bg = isset( $scheme_bgs[ $scheme ] ) ? $scheme_bgs[ $scheme ] : '#0b0b0b';

    // Shadow values
    $shadow_value = ( $shadow === 'deep' )
        ? '0 8px 32px rgba(0,0,0,0.4)'
        : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';

    // Immersive overlay
    $immersive_bg = $immersive ? $primary : 'transparent';

    ?>
    <style id="sphotography-dynamic-css">
        :root {
            --sphotography-primary-color: <?php echo esc_attr( $primary ); ?>;
            --sphotography-card-radius: <?php echo esc_attr( $radius ); ?>px;
            --sphotography-card-shadow: <?php echo esc_attr( $shadow_value ); ?>;
            --sphotography-bg: <?php echo esc_attr( $bg ); ?>;
            --sphotography-immersive-bg: <?php echo esc_attr( $immersive_bg ); ?>;
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

    return $classes;
}
add_filter( 'body_class', 'sphotography_body_classes' );

// ============================================
// 4. Pass settings to JS
// ============================================
function sphotography_localize_settings() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }

    wp_localize_script( 'sphotography-app', 'SphotographySettings', array(
        'nightMode'       => sphotography_get_mod( 'night_mode' ),
        'darkScheme'      => sphotography_get_mod( 'dark_scheme' ),
        'dateFormat'      => sphotography_get_mod( 'date_format' ),
        'customDateFormat' => sphotography_get_mod( 'custom_date_format' ),
        'enableHitokoto'  => (bool) sphotography_get_mod( 'enable_hitokoto' ),
        'smoothScroll'    => sphotography_get_mod( 'smooth_scroll' ),
        'entryAnimation'  => (bool) sphotography_get_mod( 'entry_animation' ),
        'pjaxAnimation'   => (bool) sphotography_get_mod( 'pjax_animation' ),
        'primaryColor'    => sphotography_get_mod( 'primary_color' ),
    ) );
}
add_action( 'wp_enqueue_scripts', 'sphotography_localize_settings', 20 );