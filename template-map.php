<?php
/**
 * Template Name: Fullscreen Map
 *
 * @package Sphotography
 * @version 1.1.6
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
<body <?php body_class( array( 'map-template-body', 'sidebar-collapsed' ) ); ?>>
<?php wp_body_open(); ?>

    <!-- Loading Overlay — 品牌化光圈加载体验 -->
    <div id="loading-overlay" class="loading-overlay">
        <div class="loading-aperture">
            <!-- SVG 光圈环 -->
            <svg class="loading-aperture-ring" viewBox="0 0 88 88">
                <circle class="ring-outer" cx="44" cy="44" r="38"/>
                <circle class="ring-inner" cx="44" cy="44" r="28"/>
            </svg>
            <!-- 呼吸核心圆点 -->
            <div class="loading-aperture-core"></div>
        </div>
        <!-- 站点名称 -->
        <span class="loading-site-name"><?php echo esc_html( $site_name ); ?></span>
        <!-- 底部进度条 -->
        <div class="loading-progress"></div>
    </div>

    <!-- Fullscreen Map Container -->
    <div id="map"></div>

    <!-- Gooey (metaball) filter for the water-droplet cluster markers -->
    <svg class="droplet-goo-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
            <filter id="droplet-goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"></feGaussianBlur>
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo"></feColorMatrix>
                <feBlend in="SourceGraphic" in2="goo"></feBlend>
            </filter>
        </defs>
    </svg>

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
            <span id="sidebar-search-kbd" class="sidebar-search-kbd" aria-hidden="true">
                <kbd class="kbd-mod">Ctrl</kbd><kbd>K</kbd>
            </span>
        </div>

        <!-- Article list -->
        <div id="sidebar-posts" class="sidebar-posts">
            <!-- Dynamically populated by JS -->
        </div>

        <!-- Bottom: collapse button + branding -->
        <div class="sidebar-footer">
            <button id="sidebar-toggle" class="sidebar-toggle-mini" aria-label="<?php esc_attr_e( 'Toggle sidebar', 'sphotography' ); ?>">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            <span class="sidebar-brand">Theme Sphotography</span>
            <a id="sidebar-github" href="https://github.com/ShirazuNagisa/sphotography" target="_blank" rel="noopener noreferrer" class="sidebar-github-link" aria-label="GitHub repository">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
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
    <!-- Dynamic photo grid panels (click map markers) -->
    <!-- ============================================ -->
    <div id="photo-panels" class="photo-panels" aria-live="polite"></div>

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
            <div id="detail-actions" class="detail-actions">
                <button id="detail-view-article" type="button" class="detail-view-article-btn" hidden>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <span><?php esc_html_e( '查看文章', 'sphotography' ); ?></span>
                </button>
            </div>
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
        <?php // Intentionally raw: this value can only be saved by a trusted administrator. ?>
        <div class="footer-content"><?php echo $footer_content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></div>
    </div>
    <?php endif; ?>

<?php wp_footer(); ?>
</body>
</html>
