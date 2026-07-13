<?php
/**
 * Template Name: Fullscreen Map
 *
 * @package Sphotography
 * @version 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

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

    <!-- ============================================ -->
    <!-- Sidebar (left)                               -->
    <!-- ============================================ -->
    <aside id="sidebar" class="sidebar glass-panel" role="complementary" aria-label="<?php esc_attr_e( 'Article sidebar', 'sphotography' ); ?>">
        <!-- Search -->
        <div class="sidebar-search">
            <input type="text" id="sidebar-search-input" placeholder="<?php esc_attr_e( '搜索文章...', 'sphotography' ); ?>" aria-label="<?php esc_attr_e( 'Search articles', 'sphotography' ); ?>">
            <span class="sidebar-search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
        </div>

        <!-- Article list -->
        <div id="sidebar-posts" class="sidebar-posts">
            <!-- Dynamically populated by JS -->
        </div>

        <!-- Bottom: collapse button -->
        <div class="sidebar-footer">
            <button id="sidebar-toggle" class="sidebar-toggle-btn" aria-label="<?php esc_attr_e( 'Toggle sidebar', 'sphotography' ); ?>">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                <span><?php esc_html_e( '收起边栏', 'sphotography' ); ?></span>
            </button>
        </div>
    </aside>

    <!-- Sidebar expand button (visible when sidebar is collapsed) -->
    <button id="sidebar-expand" class="sidebar-expand-btn glass-panel" aria-label="<?php esc_attr_e( 'Expand sidebar', 'sphotography' ); ?>">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    </button>

    <!-- ============================================ -->
    <!-- Article Panel (covers map)                   -->
    <!-- ============================================ -->
    <div id="article-panel" class="article-panel glass-panel" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Article content', 'sphotography' ); ?>">
        <button id="article-close" class="panel-close-btn" aria-label="<?php esc_attr_e( 'Close article', 'sphotography' ); ?>">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="article-panel-header">
            <h3 id="article-title"></h3>
            <div id="article-meta" class="article-meta"></div>
        </div>
        <div id="article-content" class="article-content">
            <!-- WordPress formatted content loaded by JS -->
        </div>
    </div>

    <!-- ============================================ -->
    <!-- Photo Grid Panel (click map marker)           -->
    <!-- ============================================ -->
    <div id="photo-grid-panel" class="photo-grid-panel glass-panel" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Photo grid', 'sphotography' ); ?>">
        <button id="photo-grid-close" class="panel-close-btn" aria-label="<?php esc_attr_e( 'Close photo grid', 'sphotography' ); ?>">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div id="photo-grid-title" class="photo-grid-title"></div>
        <div id="photo-grid-container" class="photo-grid-container">
            <!-- 3-column photo grid populated by JS -->
        </div>
    </div>

    <!-- ============================================ -->
    <!-- Detail Sheet (existing, repurposed)           -->
    <!-- ============================================ -->
    <div id="detail-sheet" class="detail-sheet glass-panel" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Photo detail', 'sphotography' ); ?>">
        <button id="close-detail" class="panel-close-btn" aria-label="<?php esc_attr_e( 'Close detail panel', 'sphotography' ); ?>">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="detail-content">
            <div class="drag-handle"></div>
            <img id="detail-img" class="detail-img" src="" alt="" />
            <h3 id="detail-title" class="detail-title"></h3>
            <div id="detail-meta" class="detail-meta"></div>
            <div id="detail-desc" class="detail-desc"></div>
            <div id="detail-tags" class="detail-tags"></div>
        </div>
    </div>

    <!-- ============================================ -->
    <!-- About Trigger & Card (existing)               -->
    <!-- ============================================ -->
    <button id="about-trigger" class="about-trigger glass-panel" aria-label="<?php esc_attr_e( 'About the photographer', 'sphotography' ); ?>">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    </button>
    <div id="about-card" class="about-card glass-panel hidden">
        <?php
        $avatar_url = get_theme_mod( 'sphotography_avatar_url', '' );
        $author_name = get_theme_mod( 'sphotography_author_nickname', '' );
        $bio = get_theme_mod( 'sphotography_bio', '' );
        $hitokoto_enabled = get_theme_mod( 'sphotography_enable_hitokoto', false );

        if ( empty( $author_name ) ) {
            $author_name = __( 'Shirazu Nagisa', 'sphotography' );
        }
        if ( empty( $bio ) ) {
            $bio = __( '行走于街巷与山野，用镜头收集人间烟火与自然纹理。', 'sphotography' );
        }
        ?>
        <?php if ( $avatar_url ) : ?>
            <img src="<?php echo esc_url( $avatar_url ); ?>" alt="" class="about-avatar">
        <?php endif; ?>
        <h4><?php echo esc_html( $author_name ); ?></h4>
        <p><?php echo esc_html( $bio ); ?></p>
        <?php if ( $hitokoto_enabled ) : ?>
            <div id="hitokoto" class="about-hitokoto">
                <span id="hitokoto-text">Loading...</span>
            </div>
        <?php endif; ?>
    </div>

    <!-- ============================================ -->
    <!-- Footer -->
    <!-- ============================================ -->
    <?php $footer_content = get_theme_mod( 'sphotography_footer_content', '' ); ?>
    <?php if ( ! empty( $footer_content ) ) : ?>
    <div id="map-footer" class="map-footer glass-panel">
        <div class="footer-content"><?php echo $footer_content; ?></div>
    </div>
    <?php endif; ?>

<?php wp_footer(); ?>
</body>
</html>