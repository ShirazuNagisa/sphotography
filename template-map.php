<?php
/**
 * Template Name: Fullscreen Map
 *
 * @package Sphotography
 * @version 1.0.0
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Get page title fallback
$page_title = get_the_title() ?: __( 'Shirazu Nagisa Photography', 'sphotography' );

// Get customizer or site info
$site_name = get_bloginfo( 'name' ) ?: 'Shirazu Nagisa Photography';

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="description" content="<?php echo esc_attr( get_bloginfo( 'description' ) ); ?>">
    <title><?php echo esc_html( $site_name ); ?></title>
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
</head>
<body <?php body_class( 'map-template-body' ); ?>>
<?php wp_body_open(); ?>

    <!-- Loading Overlay -->
    <div id="loading-overlay" class="loading-overlay">
        <div class="loading-spinner"></div>
    </div>

    <!-- Fullscreen Map Container -->
    <div id="map"></div>

    <!-- Filter Toggle Button (mobile only) -->
    <button id="filter-toggle" aria-label="<?php esc_attr_e( 'Toggle filter panel', 'sphotography' ); ?>">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="8" y1="12" x2="20" y2="12"></line>
            <line x1="12" y1="18" x2="20" y2="18"></line>
        </svg>
    </button>

    <!-- Filter Panel -->
    <div id="filter-panel" class="filter-panel" role="region" aria-label="<?php esc_attr_e( 'Photo filter panel', 'sphotography' ); ?>">
        <h2 class="filter-title"><?php esc_html_e( '探索地域', 'sphotography' ); ?></h2>
        <div id="tag-list" class="tag-list">
            <!-- Dynamically populated by JS -->
        </div>
    </div>

    <!-- Detail Sheet -->
    <div id="detail-sheet" class="detail-sheet" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Photo detail', 'sphotography' ); ?>">
        <button id="close-detail" class="close-btn" aria-label="<?php esc_attr_e( 'Close detail panel', 'sphotography' ); ?>">&times;</button>
        <div class="detail-content">
            <div class="drag-handle"></div>
            <img id="detail-img" class="detail-img" src="" alt="" />
            <h3 id="detail-title" class="detail-title"></h3>
            <div id="detail-meta" class="detail-meta"></div>
            <div id="detail-desc" class="detail-desc"></div>
            <div id="detail-tags" class="detail-tags"></div>
        </div>
    </div>

    <!-- About Trigger & Card -->
    <button id="about-trigger" class="about-trigger" aria-label="<?php esc_attr_e( 'About the photographer', 'sphotography' ); ?>">i</button>
    <div id="about-card" class="about-card hidden">
        <h4><?php esc_html_e( 'Shirazu Nagisa', 'sphotography' ); ?></h4>
        <p><?php esc_html_e( '行走于街巷与山野，用镜头收集人间烟火与自然纹理。', 'sphotography' ); ?></p>
    </div>

<?php wp_footer(); ?>
</body>
</html>