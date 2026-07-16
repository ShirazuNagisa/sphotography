<?php
/**
 * Sphotography Theme Settings Page
 *
 * @package Sphotography
 * @version 1.2.5
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ============================================
// Default values for all theme mods
// ============================================
function sphotography_get_default_settings() {
    return array(
        // ① Global Theme
        'primary_color'       => '#1abc9c',
        'allow_custom_color'  => false,
        'immersive_color'     => false,
        'night_mode'          => 'system',
        'dark_scheme'         => 'default',
        'frontend_font'       => 'serif',
        'admin_global_style'  => true,
        // ② Card Style
        'card_radius'         => 16,
        'card_shadow'         => 'light',
        // ③ Date Format
        'date_format'         => 'Y-m-d',
        'custom_date_format'  => '',
        // ④ Sidebar Info
        'site_title'          => '',
        'sidebar_default_open' => false,
        'article_card_size'   => 'small',
        'enable_hitokoto'     => false,
        'author_nickname'     => '',
        'avatar_url'          => '',
        'bio'                 => '',
        // ⑤ Animation
        'preloader_style'     => 'aperture',
        'smooth_scroll'       => 'enabled',
        'entry_animation'     => true,
        'pjax_animation'      => true,
        // ⑤b Motion personality (v1.2.5)
        'motion_tier'          => 'standard',   // subtle | standard | expressive
        'motion_article_easing' => 'inherit',   // inherit | linear | ease-out | ease-in-out | sharp
        'motion_article_scale'  => 100,          // duration multiplier, 50–200 (%)
        'motion_droplet_easing' => 'inherit',   // inherit | linear | ease-out | ease-in-out | spring | sharp
        'motion_droplet_scale'  => 100,          // duration multiplier, 50–200 (%)
        'motion_ignore_reduced' => false,        // play motion even when OS prefers reduced motion
        // ⑥ Reading Info
        'reading_info'        => false,
        'reading_speed_cjk'   => 300,
        'reading_speed_latin' => 200,
        // ⑦ Map Style
        'map_style'           => 'auto',
        'map_style_custom_url' => '',
        'map_tint'            => false,
        'map_tint_intensity'  => 18,
        // ⑦b Cluster & tag styling (v1.2.5)
        'cluster_radius'       => 18,      // 10–60 px
        'droplet_goo_strength' => 7,       // SVG feGaussianBlur stdDeviation, 3–12
        'tag_color'            => false,   // colour markers by region_tag
        'tag_legend'           => true,    // show the tag colour legend (only when tag_color on)
        // ⑧ Footer
        'footer_content'      => '',
        // ⑨ CDN
        'cdn_source'          => 'jsdelivr',
    );
}

// ============================================
// Sanitize all settings before save
// ============================================
function sphotography_sanitize_settings( $input ) {
    $defaults = sphotography_get_default_settings();
    $input = is_array( $input ) ? wp_unslash( $input ) : array();
    foreach ( array( 'allow_custom_color', 'immersive_color', 'admin_global_style', 'sidebar_default_open', 'enable_hitokoto', 'entry_animation', 'pjax_animation', 'reading_info', 'map_tint', 'motion_ignore_reduced', 'tag_color', 'tag_legend' ) as $checkbox ) {
        if ( ! array_key_exists( $checkbox, $input ) ) {
            $input[ $checkbox ] = 0;
        }
    }
    $input = wp_parse_args( $input, $defaults );
    $sanitized = array();

    // ① Global Theme
    $sanitized['primary_color'] = sanitize_hex_color( $input['primary_color'] ) ?: $defaults['primary_color'];
    $sanitized['allow_custom_color'] = ! empty( $input['allow_custom_color'] ) ? 1 : 0;
    $sanitized['immersive_color'] = ! empty( $input['immersive_color'] ) ? 1 : 0;
    $allowed_night = array( 'system', 'light', 'dark' );
    $sanitized['night_mode'] = in_array( $input['night_mode'], $allowed_night, true ) ? $input['night_mode'] : $defaults['night_mode'];
    $allowed_dark = array( 'default', 'blue', 'purple' );
    $sanitized['dark_scheme'] = in_array( $input['dark_scheme'], $allowed_dark, true ) ? $input['dark_scheme'] : $defaults['dark_scheme'];
    $allowed_font = array( 'serif', 'wordpress' );
    $sanitized['frontend_font'] = in_array( $input['frontend_font'], $allowed_font, true ) ? $input['frontend_font'] : $defaults['frontend_font'];
    $sanitized['admin_global_style'] = ! empty( $input['admin_global_style'] ) ? 1 : 0;

    // ② Card Style
    $sanitized['card_radius'] = min( max( (int) $input['card_radius'], 0 ), 40 );
    $sanitized['card_shadow'] = in_array( $input['card_shadow'], array( 'light', 'deep' ), true ) ? $input['card_shadow'] : $defaults['card_shadow'];

    // ③ Date Format
    $sanitized['date_format'] = sanitize_text_field( $input['date_format'] ) ?: $defaults['date_format'];
    $sanitized['custom_date_format'] = sanitize_text_field( $input['custom_date_format'] );

    // ④ Sidebar Info
    $sanitized['site_title'] = sanitize_text_field( $input['site_title'] );
    $sanitized['sidebar_default_open'] = ! empty( $input['sidebar_default_open'] ) ? 1 : 0;
    $allowed_card_size = array( 'small', 'large' );
    $sanitized['article_card_size'] = in_array( $input['article_card_size'], $allowed_card_size, true ) ? $input['article_card_size'] : $defaults['article_card_size'];
    $sanitized['enable_hitokoto'] = ! empty( $input['enable_hitokoto'] ) ? 1 : 0;
    $sanitized['author_nickname'] = sanitize_text_field( $input['author_nickname'] );
    $sanitized['avatar_url'] = esc_url_raw( $input['avatar_url'] );
    $sanitized['bio'] = sanitize_textarea_field( $input['bio'] );

    // ⑤ Animation
    $allowed_preloader = array( 'off', 'aperture', 'flythrough' );
    $sanitized['preloader_style'] = in_array( $input['preloader_style'], $allowed_preloader, true ) ? $input['preloader_style'] : $defaults['preloader_style'];
    $allowed_scroll = array( 'disabled', 'enabled', 'mouse-only' );
    $sanitized['smooth_scroll'] = in_array( $input['smooth_scroll'], $allowed_scroll, true ) ? $input['smooth_scroll'] : $defaults['smooth_scroll'];
    $sanitized['entry_animation'] = ! empty( $input['entry_animation'] ) ? 1 : 0;
    $sanitized['pjax_animation'] = ! empty( $input['pjax_animation'] ) ? 1 : 0;

    // ⑤b Motion personality
    $allowed_tier = array( 'subtle', 'standard', 'expressive' );
    $sanitized['motion_tier'] = in_array( $input['motion_tier'], $allowed_tier, true ) ? $input['motion_tier'] : $defaults['motion_tier'];
    // Article stays monotonic → no spring option offered.
    $allowed_article_easing = array( 'inherit', 'linear', 'ease-out', 'ease-in-out', 'sharp' );
    $sanitized['motion_article_easing'] = in_array( $input['motion_article_easing'], $allowed_article_easing, true ) ? $input['motion_article_easing'] : $defaults['motion_article_easing'];
    $allowed_droplet_easing = array( 'inherit', 'linear', 'ease-out', 'ease-in-out', 'spring', 'sharp' );
    $sanitized['motion_droplet_easing'] = in_array( $input['motion_droplet_easing'], $allowed_droplet_easing, true ) ? $input['motion_droplet_easing'] : $defaults['motion_droplet_easing'];
    $sanitized['motion_article_scale'] = min( max( (int) $input['motion_article_scale'], 50 ), 200 );
    $sanitized['motion_droplet_scale'] = min( max( (int) $input['motion_droplet_scale'], 50 ), 200 );
    $sanitized['motion_ignore_reduced'] = ! empty( $input['motion_ignore_reduced'] ) ? 1 : 0;

    // ⑥ Reading Info
    $sanitized['reading_info'] = ! empty( $input['reading_info'] ) ? 1 : 0;
    $sanitized['reading_speed_cjk'] = min( max( (int) $input['reading_speed_cjk'], 100 ), 1500 );
    if ( empty( $input['reading_speed_cjk'] ) ) {
        $sanitized['reading_speed_cjk'] = $defaults['reading_speed_cjk'];
    }
    $sanitized['reading_speed_latin'] = min( max( (int) $input['reading_speed_latin'], 50 ), 1000 );
    if ( empty( $input['reading_speed_latin'] ) ) {
        $sanitized['reading_speed_latin'] = $defaults['reading_speed_latin'];
    }

    // ⑦ Map Style
    $allowed_map_style = array( 'auto', 'satellite', 'terrain', 'voyager', 'watercolor', 'custom' );
    $sanitized['map_style'] = in_array( $input['map_style'], $allowed_map_style, true ) ? $input['map_style'] : $defaults['map_style'];
    // MapLibre fetches this style JSON client-side, so require https to avoid
    // mixed-content on secure sites; fall back to empty (→ auto) otherwise.
    $custom_url = esc_url_raw( trim( (string) $input['map_style_custom_url'] ), array( 'https' ) );
    $sanitized['map_style_custom_url'] = $custom_url;
    $sanitized['map_tint'] = ! empty( $input['map_tint'] ) ? 1 : 0;
    $sanitized['map_tint_intensity'] = min( max( (int) $input['map_tint_intensity'], 0 ), 100 );

    // ⑦b Cluster & tag styling
    $sanitized['cluster_radius'] = min( max( (int) $input['cluster_radius'], 10 ), 60 );
    $sanitized['droplet_goo_strength'] = min( max( (int) $input['droplet_goo_strength'], 3 ), 12 );
    $sanitized['tag_color'] = ! empty( $input['tag_color'] ) ? 1 : 0;
    $sanitized['tag_legend'] = ! empty( $input['tag_legend'] ) ? 1 : 0;

    // ⑧ Footer. This settings page is restricted to trusted administrators.
    // Raw HTML (including scripts) is intentionally supported by the theme.
    $sanitized['footer_content'] = (string) $input['footer_content'];

    // ⑨ CDN
    $allowed_cdn = array( 'jsdelivr', 'unpkg', 'cdnjs' );
    $sanitized['cdn_source'] = in_array( $input['cdn_source'], $allowed_cdn, true )
        ? $input['cdn_source']
        : $defaults['cdn_source'];

    return $sanitized;
}

// ============================================
// Handle form submission: Save
// ============================================
function sphotography_handle_save_settings() {
    if ( ! isset( $_POST['sphotography_save_nonce'] ) ) {
        return;
    }
    if ( ! wp_verify_nonce( $_POST['sphotography_save_nonce'], 'sphotography_save_settings' ) ) {
        wp_die( __( 'Security check failed.', 'sphotography' ) );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'You do not have sufficient permissions.', 'sphotography' ) );
    }

    $raw = isset( $_POST['sphotography'] ) ? $_POST['sphotography'] : array();
    $sanitized = sphotography_sanitize_settings( $raw );

    foreach ( $sanitized as $key => $value ) {
        set_theme_mod( 'sphotography_' . $key, $value );
    }

    // Redirect back with success message
    wp_safe_redirect( add_query_arg( 'settings-updated', 'true', wp_get_referer() ) );
    exit;
}
add_action( 'admin_post_sphotography_save_settings', 'sphotography_handle_save_settings' );

// ============================================
// Handle form submission: Reset
// ============================================
function sphotography_handle_reset_settings() {
    if ( ! isset( $_POST['sphotography_reset_nonce'] ) ) {
        return;
    }
    if ( ! wp_verify_nonce( $_POST['sphotography_reset_nonce'], 'sphotography_reset_settings' ) ) {
        wp_die( __( 'Security check failed.', 'sphotography' ) );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'You do not have sufficient permissions.', 'sphotography' ) );
    }

    $defaults = sphotography_get_default_settings();
    foreach ( $defaults as $key => $value ) {
        set_theme_mod( 'sphotography_' . $key, $value );
    }

    wp_safe_redirect( add_query_arg( 'settings-updated', 'true', wp_get_referer() ) );
    exit;
}
add_action( 'admin_post_sphotography_reset_settings', 'sphotography_handle_reset_settings' );

// ============================================
// Render the settings page
// ============================================
function sphotography_render_settings_page() {
    // Get current values from theme mod
    $defaults = sphotography_get_default_settings();
    $values = array();
    foreach ( $defaults as $key => $default_value ) {
        $values[ $key ] = get_theme_mod( 'sphotography_' . $key, $default_value );
    }

    $show_success = isset( $_GET['settings-updated'] ) && $_GET['settings-updated'] === 'true';
    ?>
    <div class="wrap sphotography-settings-wrap">
        <h1 class="sphotography-settings-title"><?php _e( '主题全局配置', 'sphotography' ); ?></h1>
        <p class="sphotography-settings-subtitle"><?php _e( '管理 Sphotography 主题的外观、布局与行为', 'sphotography' ); ?></p>

        <?php if ( $show_success ) : ?>
            <div class="notice notice-success is-dismissible">
                <p><?php _e( '设置已保存。', 'sphotography' ); ?></p>
            </div>
        <?php endif; ?>

        <div class="sphotography-settings-layout">
        <form id="sphotography-settings-form" class="sphotography-settings-main" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="sphotography_save_settings">
            <?php wp_nonce_field( 'sphotography_save_settings', 'sphotography_save_nonce' ); ?>

            <!-- ============================================ -->
            <!-- Module 1: 全局主题 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-theme">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-art"></span>
                    <h2><?php _e( '全局主题', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <!-- Primary Color -->
                    <div class="sphotography-field">
                        <label class="sphotography-label"><?php _e( '主题主色调', 'sphotography' ); ?></label>
                        <div class="sphotography-color-group">
                            <input type="text"
                                   class="sphotography-color-picker"
                                   name="sphotography[primary_color]"
                                   value="<?php echo esc_attr( $values['primary_color'] ); ?>"
                                   data-default-color="#1abc9c">
                            <div class="sphotography-preset-colors">
                                <?php
                                $preset_colors = array(
                                    '#e67e22' => __( '暖橙', 'sphotography' ),
                                    '#e74c3c' => __( '赤红', 'sphotography' ),
                                    '#e91e63' => __( '玫红', 'sphotography' ),
                                    '#9b59b6' => __( '紫罗兰', 'sphotography' ),
                                    '#3498db' => __( '天蓝', 'sphotography' ),
                                    '#2ecc71' => __( '翠绿', 'sphotography' ),
                                    '#1abc9c' => __( '青绿', 'sphotography' ),
                                    '#f1c40f' => __( '金黄', 'sphotography' ),
                                    '#e67e22' => __( '暖橙', 'sphotography' ),
                                    '#95a5a6' => __( '灰白', 'sphotography' ),
                                    '#34495e' => __( '深蓝灰', 'sphotography' ),
                                    '#2c3e50' => __( '墨黑', 'sphotography' ),
                                );
                                foreach ( $preset_colors as $color => $name ) :
                                ?>
                                <button type="button"
                                        class="sphotography-preset-btn <?php echo $values['primary_color'] === $color ? 'active' : ''; ?>"
                                        data-color="<?php echo esc_attr( $color ); ?>"
                                        style="background:<?php echo esc_attr( $color ); ?>"
                                        title="<?php echo esc_attr( $name ); ?>">
                                </button>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>

                    <!-- Allow custom color -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[allow_custom_color]"
                                   value="1"
                                   <?php checked( $values['allow_custom_color'], 1 ); ?>>
                            <?php _e( '允许前端自定义配色', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，访客可在前端通过颜色选择器自行调整主题色。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Immersive color -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[immersive_color]"
                                   value="1"
                                   <?php checked( $values['immersive_color'], 1 ); ?>>
                            <?php _e( '沉浸式主题色', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，顶部导航栏和底部区域将使用主题主色调填充。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Night mode -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-night-mode"><?php _e( '夜间模式', 'sphotography' ); ?></label>
                        <select id="sphotography-night-mode" name="sphotography[night_mode]">
                            <option value="system" <?php selected( $values['night_mode'], 'system' ); ?>><?php _e( '跟随系统', 'sphotography' ); ?></option>
                            <option value="light" <?php selected( $values['night_mode'], 'light' ); ?>><?php _e( '浅色常驻', 'sphotography' ); ?></option>
                            <option value="dark" <?php selected( $values['night_mode'], 'dark' ); ?>><?php _e( '深色常驻', 'sphotography' ); ?></option>
                        </select>
                    </div>

                    <!-- Dark scheme -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-dark-scheme"><?php _e( '深色模式配色方案', 'sphotography' ); ?></label>
                        <select id="sphotography-dark-scheme" name="sphotography[dark_scheme]">
                            <option value="default" <?php selected( $values['dark_scheme'], 'default' ); ?>><?php _e( '经典暗色（#0b0b0b）', 'sphotography' ); ?></option>
                            <option value="blue" <?php selected( $values['dark_scheme'], 'blue' ); ?>><?php _e( '深海暗色（#0a1628）', 'sphotography' ); ?></option>
                            <option value="purple" <?php selected( $values['dark_scheme'], 'purple' ); ?>><?php _e( '暗夜紫（#1a0a1e）', 'sphotography' ); ?></option>
                        </select>
                    </div>

                    <!-- Frontend font -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-frontend-font"><?php _e( '前端字体', 'sphotography' ); ?></label>
                        <select id="sphotography-frontend-font" name="sphotography[frontend_font]">
                            <option value="serif" <?php selected( $values['frontend_font'], 'serif' ); ?>><?php _e( '衬线字体（Noto Serif SC，默认）', 'sphotography' ); ?></option>
                            <option value="wordpress" <?php selected( $values['frontend_font'], 'wordpress' ); ?>><?php _e( 'WordPress 默认字体（系统无衬线）', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '选择前端全局字体。衬线字体呈现更优雅的排版；WordPress 默认字体使用系统无衬线字体栈，观感更现代。全局生效，默认衬线字体。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Global admin style toggle -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[admin_global_style]"
                                   value="1"
                                   <?php checked( $values['admin_global_style'], 1 ); ?>>
                            <?php _e( '启用全局后台 Sphotography 风格', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，整个 WordPress 后台将统一为 Sphotography 风格：优雅衬线字体、主题主色调，并跟随上方“深色模式”设置在深/浅色间切换。默认关闭，保持 WordPress 原生外观。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 2: 卡片样式 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-card">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-screenoptions"></span>
                    <h2><?php _e( '卡片样式', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <!-- Card Radius -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-card-radius"><?php _e( '卡片圆角 (px)', 'sphotography' ); ?></label>
                        <input type="number"
                               id="sphotography-card-radius"
                               name="sphotography[card_radius]"
                               value="<?php echo esc_attr( $values['card_radius'] ); ?>"
                               min="0" max="40" step="1">
                        <p class="sphotography-desc"><?php _e( '设置卡片面板的圆角大小，范围 0-40px。推荐 12-20px。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Card Shadow -->
                    <div class="sphotography-field">
                        <label class="sphotography-label"><?php _e( '阴影样式', 'sphotography' ); ?></label>
                        <div class="sphotography-radio-group">
                            <label class="sphotography-radio-label">
                                <input type="radio"
                                       name="sphotography[card_shadow]"
                                       value="light"
                                       <?php checked( $values['card_shadow'], 'light' ); ?>>
                                <span class="sphotography-radio-text"><?php _e( '浅阴影', 'sphotography' ); ?></span>
                            </label>
                            <label class="sphotography-radio-label">
                                <input type="radio"
                                       name="sphotography[card_shadow]"
                                       value="deep"
                                       <?php checked( $values['card_shadow'], 'deep' ); ?>>
                                <span class="sphotography-radio-text"><?php _e( '深阴影', 'sphotography' ); ?></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 3: 日期格式 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-date">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-calendar-alt"></span>
                    <h2><?php _e( '日期格式', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-date-format"><?php _e( '日期展示格式', 'sphotography' ); ?></label>
                        <select id="sphotography-date-format" name="sphotography[date_format]">
                            <option value="Y-m-d" <?php selected( $values['date_format'], 'Y-m-d' ); ?>><?php _e( '2026-07-13', 'sphotography' ); ?></option>
                            <option value="Y/m/d" <?php selected( $values['date_format'], 'Y/m/d' ); ?>><?php _e( '2026/07/13', 'sphotography' ); ?></option>
                            <option value="Y年m月d日" <?php selected( $values['date_format'], 'Y年m月d日' ); ?>><?php _e( '2026年7月13日', 'sphotography' ); ?></option>
                            <option value="m/d/Y" <?php selected( $values['date_format'], 'm/d/Y' ); ?>><?php _e( '07/13/2026', 'sphotography' ); ?></option>
                            <option value="d/m/Y" <?php selected( $values['date_format'], 'd/m/Y' ); ?>><?php _e( '13/07/2026', 'sphotography' ); ?></option>
                            <option value="F j, Y" <?php selected( $values['date_format'], 'F j, Y' ); ?>><?php _e( 'July 13, 2026', 'sphotography' ); ?></option>
                            <option value="j F Y" <?php selected( $values['date_format'], 'j F Y' ); ?>><?php _e( '13 July 2026', 'sphotography' ); ?></option>
                            <option value="custom" <?php selected( $values['date_format'], 'custom' ); ?>><?php _e( '自定义格式', 'sphotography' ); ?></option>
                        </select>
                    </div>

                    <div class="sphotography-field sphotography-custom-date-field" style="<?php echo $values['date_format'] === 'custom' ? '' : 'display:none;'; ?>">
                        <label class="sphotography-label" for="sphotography-custom-date-format"><?php _e( '自定义 PHP 日期格式', 'sphotography' ); ?></label>
                        <input type="text"
                               id="sphotography-custom-date-format"
                               name="sphotography[custom_date_format]"
                               value="<?php echo esc_attr( $values['custom_date_format'] ); ?>"
                               placeholder="<?php esc_attr_e( '例如：l, F j, Y', 'sphotography' ); ?>">
                        <p class="sphotography-desc">
                            <?php _e( '请输入 PHP date() 函数支持的格式字符。', 'sphotography' ); ?>
                            <a href="https://www.php.net/manual/zh/function.date.php" target="_blank"><?php _e( '查看格式参考', 'sphotography' ); ?></a>
                        </p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 4: 左侧栏信息 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-sidebar">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-info"></span>
                    <h2><?php _e( '左侧栏信息', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-site-title"><?php _e( '站点标题', 'sphotography' ); ?></label>
                        <input type="text"
                               id="sphotography-site-title"
                               name="sphotography[site_title]"
                               value="<?php echo esc_attr( $values['site_title'] ); ?>"
                               placeholder="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?>">
                        <p class="sphotography-desc"><?php _e( '留空则自动读取 WordPress 站点标题。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[sidebar_default_open]"
                                   value="1"
                                   <?php checked( $values['sidebar_default_open'], 1 ); ?>>
                            <?php _e( '默认展开边栏', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，首次进入站点时左侧文章栏将默认展开；关闭则默认收起，仅显示全屏地图。默认关闭。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-article-card-size"><?php _e( '文章卡片尺寸', 'sphotography' ); ?></label>
                        <select id="sphotography-article-card-size" name="sphotography[article_card_size]">
                            <option value="small" <?php selected( $values['article_card_size'], 'small' ); ?>><?php _e( '小尺寸（仅标题，默认）', 'sphotography' ); ?></option>
                            <option value="large" <?php selected( $values['article_card_size'], 'large' ); ?>><?php _e( '大尺寸（标题 + 全文简介，纵向为小尺寸两倍）', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '选择左侧栏文章列表卡片的尺寸。小尺寸仅展示标题与日期；大尺寸额外展示文章简介，卡片纵向高度约为小尺寸的两倍。默认小尺寸。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[enable_hitokoto]"
                                   value="1"
                                   <?php checked( $values['enable_hitokoto'], 1 ); ?>>
                            <?php _e( '一言格言', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，在左侧栏底部显示来自一言 API 的随机格言。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-author-nickname"><?php _e( '作者昵称', 'sphotography' ); ?></label>
                        <input type="text"
                               id="sphotography-author-nickname"
                               name="sphotography[author_nickname]"
                               value="<?php echo esc_attr( $values['author_nickname'] ); ?>"
                               placeholder="<?php echo esc_attr( wp_get_current_user()->display_name ); ?>">
                        <p class="sphotography-desc"><?php _e( '留空自动读取当前用户昵称。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-avatar-url"><?php _e( '头像 URL', 'sphotography' ); ?></label>
                        <input type="url"
                               id="sphotography-avatar-url"
                               name="sphotography[avatar_url]"
                               value="<?php echo esc_attr( $values['avatar_url'] ); ?>"
                               placeholder="<?php esc_attr_e( 'https://example.com/avatar.jpg', 'sphotography' ); ?>">
                        <p class="sphotography-desc"><?php _e( '留空则显示 WordPress 默认 Gravatar 头像。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-bio"><?php _e( '个人简介', 'sphotography' ); ?></label>
                        <textarea id="sphotography-bio"
                                  name="sphotography[bio]"
                                  rows="4"
                                  placeholder="<?php esc_attr_e( '行走于街巷与山野，用镜头收集人间烟火与自然纹理。', 'sphotography' ); ?>"><?php echo esc_textarea( $values['bio'] ); ?></textarea>
                        <p class="sphotography-desc"><?php _e( '留空则自动隐藏该模块。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 5: 动画设置 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-animation">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-update"></span>
                    <h2><?php _e( '动画设置', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-preloader-style"><?php _e( '开屏加载动画', 'sphotography' ); ?></label>
                        <select id="sphotography-preloader-style" name="sphotography[preloader_style]">
                            <option value="off" <?php selected( $values['preloader_style'], 'off' ); ?>><?php _e( '关闭', 'sphotography' ); ?></option>
                            <option value="aperture" <?php selected( $values['preloader_style'], 'aperture' ); ?>><?php _e( '光圈（默认）', 'sphotography' ); ?></option>
                            <option value="flythrough" <?php selected( $values['preloader_style'], 'flythrough' ); ?>><?php _e( '流光穿越', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '地图首页首次加载时的开屏动画。「光圈」为品牌化光圈加载；「流光穿越」以站点名称流光登场，加载完成后镜头穿过文字进入地图；「关闭」则不显示开屏。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-smooth-scroll"><?php _e( '平滑滚动', 'sphotography' ); ?></label>
                        <select id="sphotography-smooth-scroll" name="sphotography[smooth_scroll]">
                            <option value="disabled" <?php selected( $values['smooth_scroll'], 'disabled' ); ?>><?php _e( '禁用', 'sphotography' ); ?></option>
                            <option value="enabled" <?php selected( $values['smooth_scroll'], 'enabled' ); ?>><?php _e( '启用', 'sphotography' ); ?></option>
                            <option value="mouse-only" <?php selected( $values['smooth_scroll'], 'mouse-only' ); ?>><?php _e( '仅鼠标滚轮', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '启用后，页面内锚点跳转和滚轮滚动将带有平滑过渡效果。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[entry_animation]"
                                   value="1"
                                   <?php checked( $values['entry_animation'], 1 ); ?>>
                            <?php _e( '文章进场动画', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，文章卡片在进入视口时会有淡入上滑的入场动画效果。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[pjax_animation]"
                                   value="1"
                                   <?php checked( $values['pjax_animation'], 1 ); ?>>
                            <?php _e( 'Pjax 跳转滚动动画', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，通过 Pjax 无刷新跳转页面时会附带滚动动画过渡效果。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Motion personality (v1.2.5) -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-motion-tier"><?php _e( '动效性格', 'sphotography' ); ?></label>
                        <select id="sphotography-motion-tier" name="sphotography[motion_tier]">
                            <option value="subtle" <?php selected( $values['motion_tier'], 'subtle' ); ?>><?php _e( '克制（更快、更平，弱化存在感）', 'sphotography' ); ?></option>
                            <option value="standard" <?php selected( $values['motion_tier'], 'standard' ); ?>><?php _e( '标准（默认，主题原有手感）', 'sphotography' ); ?></option>
                            <option value="expressive" <?php selected( $values['motion_tier'], 'expressive' ); ?>><?php _e( '张扬（更慢、更有弹性，水滴回弹）', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '统一调节全站动效的时长与缓动手感。文章面板始终保持单调收放（无回弹），仅地图水滴在「张扬」档带明显弹性。默认「标准」。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Advanced motion (collapsible) -->
                    <div class="sphotography-field">
                        <button type="button" class="sphotography-advanced-toggle" id="sphotography-motion-advanced-toggle" aria-expanded="false">
                            <span class="dashicons dashicons-arrow-right-alt2"></span>
                            <?php _e( '高级：分别微调文章与水滴动效', 'sphotography' ); ?>
                        </button>
                        <div class="sphotography-advanced-body" id="sphotography-motion-advanced" hidden>
                            <p class="sphotography-desc" style="margin-top:0;"><?php _e( '两条通道独立微调。缓动保持「跟随动效性格」、倍率保持 100% 时，完全由上方档位决定。', 'sphotography' ); ?></p>

                            <div class="sphotography-advanced-group">
                                <p class="sphotography-advanced-group-title"><?php _e( '文章面板动效', 'sphotography' ); ?></p>
                                <label class="sphotography-sublabel" for="sphotography-motion-article-easing"><?php _e( '缓动曲线', 'sphotography' ); ?></label>
                                <select id="sphotography-motion-article-easing" name="sphotography[motion_article_easing]">
                                    <option value="inherit" <?php selected( $values['motion_article_easing'], 'inherit' ); ?>><?php _e( '跟随动效性格（默认）', 'sphotography' ); ?></option>
                                    <option value="linear" <?php selected( $values['motion_article_easing'], 'linear' ); ?>><?php _e( '线性', 'sphotography' ); ?></option>
                                    <option value="ease-out" <?php selected( $values['motion_article_easing'], 'ease-out' ); ?>><?php _e( '缓出', 'sphotography' ); ?></option>
                                    <option value="ease-in-out" <?php selected( $values['motion_article_easing'], 'ease-in-out' ); ?>><?php _e( '缓入缓出', 'sphotography' ); ?></option>
                                    <option value="sharp" <?php selected( $values['motion_article_easing'], 'sharp' ); ?>><?php _e( '锐利', 'sphotography' ); ?></option>
                                </select>
                                <label class="sphotography-sublabel" for="sphotography-motion-article-scale"><?php _e( '时长倍率', 'sphotography' ); ?></label>
                                <div class="sphotography-slider-row">
                                    <input type="range" id="sphotography-motion-article-scale" name="sphotography[motion_article_scale]"
                                           value="<?php echo esc_attr( $values['motion_article_scale'] ); ?>" min="50" max="200" step="5">
                                    <span class="sphotography-slider-val" data-suffix="%"><?php echo esc_html( $values['motion_article_scale'] ); ?>%</span>
                                </div>
                            </div>

                            <div class="sphotography-advanced-group">
                                <p class="sphotography-advanced-group-title"><?php _e( '地图水滴动效', 'sphotography' ); ?></p>
                                <label class="sphotography-sublabel" for="sphotography-motion-droplet-easing"><?php _e( '缓动曲线', 'sphotography' ); ?></label>
                                <select id="sphotography-motion-droplet-easing" name="sphotography[motion_droplet_easing]">
                                    <option value="inherit" <?php selected( $values['motion_droplet_easing'], 'inherit' ); ?>><?php _e( '跟随动效性格（默认）', 'sphotography' ); ?></option>
                                    <option value="linear" <?php selected( $values['motion_droplet_easing'], 'linear' ); ?>><?php _e( '线性', 'sphotography' ); ?></option>
                                    <option value="ease-out" <?php selected( $values['motion_droplet_easing'], 'ease-out' ); ?>><?php _e( '缓出', 'sphotography' ); ?></option>
                                    <option value="ease-in-out" <?php selected( $values['motion_droplet_easing'], 'ease-in-out' ); ?>><?php _e( '缓入缓出', 'sphotography' ); ?></option>
                                    <option value="spring" <?php selected( $values['motion_droplet_easing'], 'spring' ); ?>><?php _e( '弹性回弹', 'sphotography' ); ?></option>
                                    <option value="sharp" <?php selected( $values['motion_droplet_easing'], 'sharp' ); ?>><?php _e( '锐利', 'sphotography' ); ?></option>
                                </select>
                                <label class="sphotography-sublabel" for="sphotography-motion-droplet-scale"><?php _e( '时长倍率', 'sphotography' ); ?></label>
                                <div class="sphotography-slider-row">
                                    <input type="range" id="sphotography-motion-droplet-scale" name="sphotography[motion_droplet_scale]"
                                           value="<?php echo esc_attr( $values['motion_droplet_scale'] ); ?>" min="50" max="200" step="5">
                                    <span class="sphotography-slider-val" data-suffix="%"><?php echo esc_html( $values['motion_droplet_scale'] ); ?>%</span>
                                </div>
                            </div>

                            <div class="sphotography-field-checkbox" style="margin-top:4px;">
                                <label class="sphotography-label">
                                    <input type="checkbox" name="sphotography[motion_ignore_reduced]" value="1" <?php checked( $values['motion_ignore_reduced'], 1 ); ?>>
                                    <?php _e( '即使系统开启「减弱动态效果」仍播放动效', 'sphotography' ); ?>
                                </label>
                                <p class="sphotography-desc"><?php _e( '默认关闭：尊重操作系统的「减弱动态效果」偏好，此时全站动效自动最小化。仅当你确定要覆盖该无障碍偏好时才勾选。', 'sphotography' ); ?></p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 6: 阅读信息 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-reading">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-book"></span>
                    <h2><?php _e( '阅读信息', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[reading_info]"
                                   value="1"
                                   <?php checked( $values['reading_info'], 1 ); ?>>
                            <?php _e( '显示字数与阅读时长', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，在文章展开页顶部的日期与分类之间显示「字数 · 约 N 分钟」。阅读时长根据下方阅读速度估算，中英文分别计算。默认关闭。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-reading-speed-cjk"><?php _e( '中文阅读速度（字/分钟）', 'sphotography' ); ?></label>
                        <input type="number"
                               id="sphotography-reading-speed-cjk"
                               name="sphotography[reading_speed_cjk]"
                               value="<?php echo esc_attr( $values['reading_speed_cjk'] ); ?>"
                               min="100" max="1500" step="10">
                        <p class="sphotography-desc"><?php _e( '每分钟阅读的中文字符数，范围 100-1500。默认 300。', 'sphotography' ); ?></p>
                    </div>

                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-reading-speed-latin"><?php _e( '英文阅读速度（词/分钟）', 'sphotography' ); ?></label>
                        <input type="number"
                               id="sphotography-reading-speed-latin"
                               name="sphotography[reading_speed_latin]"
                               value="<?php echo esc_attr( $values['reading_speed_latin'] ); ?>"
                               min="50" max="1000" step="10">
                        <p class="sphotography-desc"><?php _e( '每分钟阅读的英文单词数，范围 50-1000。默认 200。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 7: 页脚设置 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-footer">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-editor-paragraph"></span>
                    <h2><?php _e( '页脚设置', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-footer-content"><?php _e( '页脚内容', 'sphotography' ); ?></label>
                        <textarea id="sphotography-footer-content"
                                  name="sphotography[footer_content]"
                                  rows="3"
                                  style="max-width:100%;font-family:monospace;"
                                  placeholder="<?php esc_attr_e( '例如：© 2026 Your Name. All rights reserved.', 'sphotography' ); ?>"><?php echo esc_textarea( $values['footer_content'] ); ?></textarea>
                        <p class="sphotography-desc"><?php _e( '留空则隐藏页脚。支持可信管理员输入的 HTML 与脚本标签，显示在地图底部中央位置。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 8: 地图样式 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-mapstyle">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-location-alt"></span>
                    <h2><?php _e( '地图样式', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

                    <!-- Style preset -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-map-style"><?php _e( '底图样式', 'sphotography' ); ?></label>
                        <select id="sphotography-map-style" name="sphotography[map_style]">
                            <option value="auto" <?php selected( $values['map_style'], 'auto' ); ?>><?php _e( '自动（跟随夜间模式，默认）', 'sphotography' ); ?></option>
                            <option value="satellite" <?php selected( $values['map_style'], 'satellite' ); ?>><?php _e( '卫星影像（Esri World Imagery）', 'sphotography' ); ?></option>
                            <option value="terrain" <?php selected( $values['map_style'], 'terrain' ); ?>><?php _e( '地形（OpenTopoMap）', 'sphotography' ); ?></option>
                            <option value="voyager" <?php selected( $values['map_style'], 'voyager' ); ?>><?php _e( '街道（CartoDB Voyager）', 'sphotography' ); ?></option>
                            <option value="watercolor" <?php selected( $values['map_style'], 'watercolor' ); ?>><?php _e( '复古水彩（Stamen / Stadia Maps）', 'sphotography' ); ?></option>
                            <option value="custom" <?php selected( $values['map_style'], 'custom' ); ?>><?php _e( '自定义（粘贴 MapLibre style JSON URL）', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '选择前端地图的底图样式。选择「自动」时保持跟随夜间模式的深/浅色底图；选择其他预设或自定义样式时，将始终使用该样式，覆盖夜间模式的底图切换（站点界面明暗仍跟随夜间模式）。', 'sphotography' ); ?></p>
                        <p class="sphotography-desc" style="color:#e0a800;"><?php _e( '注意：「复古水彩」由 Stadia Maps 托管，正式站点需在 Stadia 免费注册并添加你的域名后方可正常加载（本地开发无需注册）。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Custom style URL (revealed when style = custom) -->
                    <div class="sphotography-field sphotography-custom-mapstyle-field" style="<?php echo $values['map_style'] === 'custom' ? '' : 'display:none;'; ?>">
                        <label class="sphotography-label" for="sphotography-map-style-custom-url"><?php _e( '自定义 style JSON URL', 'sphotography' ); ?></label>
                        <input type="url"
                               id="sphotography-map-style-custom-url"
                               name="sphotography[map_style_custom_url]"
                               value="<?php echo esc_attr( $values['map_style_custom_url'] ); ?>"
                               placeholder="https://example.com/style.json">
                        <p class="sphotography-desc"><?php _e( '粘贴任意 MapLibre 兼容的 style JSON 地址（必须为 https）。留空或加载失败时将自动回退到「自动」底图。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Map tint toggle -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox"
                                   name="sphotography[map_tint]"
                                   value="1"
                                   <?php checked( $values['map_tint'], 1 ); ?>>
                            <?php _e( '地图主题色滤镜', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，在地图上叠加一层主题主色调色叠加（正片叠底混合），让底图染上站点主题色。适合让暗色地图与站点风格统一。默认关闭。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Tint intensity -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-map-tint-intensity"><?php _e( '滤镜强度（%）', 'sphotography' ); ?></label>
                        <input type="range"
                               id="sphotography-map-tint-intensity"
                               name="sphotography[map_tint_intensity]"
                               value="<?php echo esc_attr( $values['map_tint_intensity'] ); ?>"
                               min="0" max="100" step="1"
                               style="max-width:320px;vertical-align:middle;">
                        <span id="sphotography-map-tint-intensity-val" style="margin-left:10px;font-variant-numeric:tabular-nums;"><?php echo esc_html( $values['map_tint_intensity'] ); ?>%</span>
                        <p class="sphotography-desc"><?php _e( '色叠加的不透明度，范围 0-100%。数值越高染色越浓。默认 18%。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Cluster radius (v1.2.5) -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-cluster-radius"><?php _e( '标记聚合半径', 'sphotography' ); ?></label>
                        <div class="sphotography-slider-row">
                            <input type="range" id="sphotography-cluster-radius" name="sphotography[cluster_radius]"
                                   value="<?php echo esc_attr( $values['cluster_radius'] ); ?>" min="10" max="60" step="1">
                            <span class="sphotography-slider-val" data-suffix="px"><?php echo esc_html( $values['cluster_radius'] ); ?>px</span>
                        </div>
                        <p class="sphotography-desc"><?php _e( '控制邻近标记合并为聚合水滴的距离阈值，范围 10-60px。值越大越容易合并成大水滴，值越小标记越倾向保持独立。默认 18px。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Gooey fusion strength (v1.2.5) -->
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-droplet-goo-strength"><?php _e( '水滴融合强度', 'sphotography' ); ?></label>
                        <div class="sphotography-slider-row">
                            <input type="range" id="sphotography-droplet-goo-strength" name="sphotography[droplet_goo_strength]"
                                   value="<?php echo esc_attr( $values['droplet_goo_strength'] ); ?>" min="3" max="12" step="1">
                            <span class="sphotography-slider-val"><?php echo esc_html( $values['droplet_goo_strength'] ); ?></span>
                        </div>
                        <p class="sphotography-desc"><?php _e( '控制聚合／拆分时水滴之间的「拉丝融合」程度，范围 3-12。值越大，邻近水滴越容易黏连成一团；值越小水滴边缘越清爽。默认 7。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Tag colour master toggle (v1.2.5) -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox" name="sphotography[tag_color]" value="1" <?php checked( $values['tag_color'], 1 ); ?>>
                            <?php _e( '按地区标签为标记分色', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '开启后，地图标记按其「地区标签（region_tag）」着色，让不同地区一眼可辨。默认按标签别名自动生成配色，可在「地区标签」编辑页手动指定颜色覆盖。聚合水滴按簇内出现最多的标签着色，无共同标签时回退主题主色。默认关闭，保持原有统一配色。', 'sphotography' ); ?></p>
                    </div>

                    <!-- Legend toggle (v1.2.5) -->
                    <div class="sphotography-field sphotography-field-checkbox">
                        <label class="sphotography-label">
                            <input type="checkbox" name="sphotography[tag_legend]" value="1" <?php checked( $values['tag_legend'], 1 ); ?>>
                            <?php _e( '显示标签配色图例', 'sphotography' ); ?>
                        </label>
                        <p class="sphotography-desc"><?php _e( '仅在上方「按地区标签分色」开启时生效。在地图左下角显示可折叠的标签配色图例（移动端折叠为「图例」小胶囊）。默认开启。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 9: CDN 来源配置 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-cdn">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-networking"></span>
                    <h2><?php _e( 'CDN 来源', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-cdn-source"><?php _e( 'MapLibre 加载源', 'sphotography' ); ?></label>
                        <select id="sphotography-cdn-source" name="sphotography[cdn_source]">
                            <option value="jsdelivr" <?php selected( $values['cdn_source'], 'jsdelivr' ); ?>><?php _e( 'jsDelivr（推荐，速度最快）', 'sphotography' ); ?></option>
                            <option value="unpkg" <?php selected( $values['cdn_source'], 'unpkg' ); ?>><?php _e( 'unpkg（当前默认）', 'sphotography' ); ?></option>
                            <option value="cdnjs" <?php selected( $values['cdn_source'], 'cdnjs' ); ?>><?php _e( 'cdnjs（Cloudflare）', 'sphotography' ); ?></option>
                        </select>
                        <p class="sphotography-desc"><?php _e( '切换前端地图引擎的 CDN 来源。jsDelivr 在中国大陆及全球均有较好的加速效果。更改后保存，刷新前端页面生效。地图瓦片始终从 CartoDB CDN 直接加载，不受此设置影响。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 10: 版本与更新 -->
            <!-- ============================================ -->
            <div class="sphotography-module" id="sp-mod-version">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-update"></span>
                    <h2><?php _e( '版本与更新', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">
                    <div class="sphotography-field" id="sphotography-updater">
                        <label class="sphotography-label"><?php _e( '当前版本', 'sphotography' ); ?></label>
                        <p style="font-size:1rem;margin-bottom:10px;">
                            <strong><?php echo 'v' . SPHOTOGRAPHY_VERSION; ?></strong>
                            <span id="sphotography-version-status" style="margin-left:12px;font-size:0.8125rem;color:var(--text-muted);"></span>
                        </p>

                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            <button type="button" id="sphotography-check-update" class="button button-secondary" style="display:inline-flex;align-items:center;gap:4px;">
                                <span class="dashicons dashicons-search" style="font-size:16px;width:16px;height:16px;"></span>
                                <?php _e( '检查更新', 'sphotography' ); ?>
                            </button>
                            <button type="button" id="sphotography-do-update" class="button button-primary" style="display:inline-flex;align-items:center;gap:4px;background:#1abc9c;border-color:#16a085;">
                                <span class="dashicons dashicons-download" style="font-size:16px;width:16px;height:16px;"></span>
                                <?php _e( '从 master 分支更新主题', 'sphotography' ); ?>
                            </button>
                        </div>

                        <div id="sphotography-update-result" style="margin-top:12px;font-size:0.875rem;"></div>

                        <p class="sphotography-desc" style="margin-top:10px;">
                            <?php _e( '点击「检查更新」从 jsDelivr CDN 获取最新版本信息，点击「从 master 分支更新主题」直接从 GitHub 下载并覆盖主题文件。配置数据存储在数据库中，不受影响。', 'sphotography' ); ?>
                            <a href="https://github.com/ShirazuNagisa/sphotography/releases" target="_blank"><?php _e( '在 GitHub 上查看所有版本', 'sphotography' ); ?></a>
                        </p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Submit Buttons -->
            <!-- ============================================ -->
            <div class="sphotography-actions">
                <button type="submit" class="button button-primary button-large">
                    <span class="dashicons dashicons-yes"></span>
                    <?php _e( '保存设置', 'sphotography' ); ?>
                </button>
                <button type="button" id="sphotography-reset-btn" class="button button-secondary button-large">
                    <span class="dashicons dashicons-dismiss"></span>
                    <?php _e( '重置默认', 'sphotography' ); ?>
                </button>
            </div>
        </form>

        <!-- ============================================ -->
        <!-- Right-side index (TOC) — quick jump + save -->
        <!-- ============================================ -->
        <aside class="sphotography-toc" aria-label="<?php esc_attr_e( '配置索引', 'sphotography' ); ?>">
            <div class="sphotography-toc-inner">
                <p class="sphotography-toc-heading"><?php _e( '配置索引', 'sphotography' ); ?></p>
                <nav class="sphotography-toc-nav">
                    <?php
                    $toc_items = array(
                        'sp-mod-theme'     => __( '全局主题', 'sphotography' ),
                        'sp-mod-card'      => __( '卡片样式', 'sphotography' ),
                        'sp-mod-date'      => __( '日期格式', 'sphotography' ),
                        'sp-mod-sidebar'   => __( '左侧栏信息', 'sphotography' ),
                        'sp-mod-animation' => __( '动画设置', 'sphotography' ),
                        'sp-mod-reading'   => __( '阅读信息', 'sphotography' ),
                        'sp-mod-footer'    => __( '页脚设置', 'sphotography' ),
                        'sp-mod-mapstyle'  => __( '地图样式', 'sphotography' ),
                        'sp-mod-cdn'       => __( 'CDN 来源', 'sphotography' ),
                        'sp-mod-version'   => __( '版本与更新', 'sphotography' ),
                    );
                    foreach ( $toc_items as $anchor => $label ) :
                    ?>
                        <a class="sphotography-toc-link" href="#<?php echo esc_attr( $anchor ); ?>" data-target="<?php echo esc_attr( $anchor ); ?>"><?php echo esc_html( $label ); ?></a>
                    <?php endforeach; ?>
                </nav>
                <button type="submit" form="sphotography-settings-form" class="button button-primary sphotography-toc-save">
                    <span class="dashicons dashicons-yes"></span>
                    <?php _e( '保存设置', 'sphotography' ); ?>
                </button>
            </div>
        </aside>
        </div><!-- /.sphotography-settings-layout -->

        <!-- Reset form (submitted via JS) -->
        <form id="sphotography-reset-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:none;">
            <input type="hidden" name="action" value="sphotography_reset_settings">
            <?php wp_nonce_field( 'sphotography_reset_settings', 'sphotography_reset_nonce' ); ?>
        </form>
    </div>
    <?php
}

// ============================================
// Enqueue admin styles & scripts for settings page
// ============================================
function sphotography_admin_enqueue_settings( $hook ) {
    if ( $hook !== 'toplevel_page_sphotography-settings' ) {
        return;
    }

    // Color picker
    wp_enqueue_style( 'wp-color-picker' );
    wp_enqueue_script( 'wp-color-picker' );

    // Admin custom styles — Sphotography look: serif type, theme primary as
    // accent, light/dark following the night_mode setting (the scheme body
    // class is added in admin/admin-style.php). Effects are kept subtle.
    $sp_primary = sphotography_admin_primary_color();
    $sp_serif   = "'Noto Serif SC', Georgia, 'Times New Roman', 'Songti SC', serif";

    $sp_light = "
        --sp-bg: #f4f1ec;
        --sp-surface: #ffffff;
        --sp-surface-2: #faf8f4;
        --sp-text: #2b2622;
        --sp-text-muted: #6b6259;
        --sp-border: #e6e0d8;
        --sp-accent: {$sp_primary};
        --sp-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
        color-scheme: light;
    ";
    $sp_dark = "
        --sp-bg: #121212;
        --sp-surface: #1c1c1c;
        --sp-surface-2: #242424;
        --sp-text: #ececec;
        --sp-text-muted: #9a9a9a;
        --sp-border: rgba(255,255,255,0.10);
        --sp-accent: {$sp_primary};
        --sp-shadow: 0 2px 8px rgba(0,0,0,0.4);
        color-scheme: dark;
    ";

    $settings_css = "
        /* Scheme variables — self-contained so the settings page is themed
           whether or not the global admin style is enabled. */
        .sphotography-settings-wrap { {$sp_light} }
        body.sphotography-admin-scheme-dark .sphotography-settings-wrap { {$sp_dark} }
        @media (prefers-color-scheme: dark) {
            body.sphotography-admin-scheme-system .sphotography-settings-wrap { {$sp_dark} }
        }

        .sphotography-settings-wrap {
            max-width: 1180px;
            margin: 20px auto;
            background: var(--sp-bg);
            color: var(--sp-text);
            padding: 30px 40px;
            border-radius: 16px;
            font-family: {$sp_serif};
        }
        /* Two-column layout: settings on the left, sticky index on the right. */
        .sphotography-settings-layout {
            display: flex;
            align-items: flex-start;
            gap: 28px;
        }
        .sphotography-settings-main {
            flex: 1 1 auto;
            min-width: 0;
        }
        .sphotography-toc {
            flex: 0 0 210px;
            position: sticky;
            top: 46px;
            align-self: flex-start;
        }
        .sphotography-toc-inner {
            background: var(--sp-surface);
            border: 1px solid var(--sp-border);
            border-radius: 14px;
            box-shadow: var(--sp-shadow);
            padding: 16px 14px;
        }
        .sphotography-toc-heading {
            margin: 0 0 10px 0;
            padding: 0 6px;
            font-size: 0.8125rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            color: var(--sp-text-muted);
            text-transform: uppercase;
        }
        .sphotography-toc-nav {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .sphotography-toc-link {
            display: block;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 0.9rem;
            color: var(--sp-text-muted);
            text-decoration: none;
            border-left: 2px solid transparent;
            transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .sphotography-toc-link:hover {
            background: var(--sp-surface-2);
            color: var(--sp-accent);
        }
        .sphotography-toc-link.active {
            background: var(--sp-surface-2);
            color: var(--sp-accent);
            border-left-color: var(--sp-accent);
            font-weight: 600;
        }
        .sphotography-toc-save {
            display: flex !important;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            margin-top: 14px;
            padding: 9px 12px !important;
            height: auto !important;
            border-radius: 8px !important;
            font-family: {$sp_serif};
            background: var(--sp-accent) !important;
            border-color: var(--sp-accent) !important;
            box-shadow: none !important;
            text-shadow: none !important;
            transition: transform 160ms cubic-bezier(0.16,1,0.3,1), filter 160ms ease;
        }
        .sphotography-toc-save:hover {
            filter: brightness(1.07);
            transform: translateY(-1px);
        }
        .sphotography-toc-save:active { transform: translateY(0); }
        @media (max-width: 960px) {
            .sphotography-settings-layout { display: block; }
            .sphotography-toc { display: none; }
        }
        .sphotography-settings-title {
            font-size: 1.9rem;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: var(--sp-text);
            font-family: {$sp_serif};
            letter-spacing: 0.01em;
        }
        .sphotography-settings-subtitle {
            color: var(--sp-text-muted);
            margin: 0 0 28px 0;
            font-size: 0.9375rem;
        }
        .sphotography-module {
            background: var(--sp-surface);
            border: 1px solid var(--sp-border);
            border-radius: 14px;
            margin-bottom: 20px;
            overflow: hidden;
            box-shadow: var(--sp-shadow);
        }
        .sphotography-module-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 24px;
            background: var(--sp-surface-2);
            border-bottom: 1px solid var(--sp-border);
        }
        .sphotography-module-header h2 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 600;
            color: var(--sp-text);
            font-family: {$sp_serif};
        }
        .sphotography-module-icon {
            color: var(--sp-accent);
            font-size: 1.3rem;
            width: auto;
            height: auto;
        }
        .sphotography-module-body {
            padding: 20px 24px;
        }
        .sphotography-field {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--sp-border);
        }
        .sphotography-field:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        .sphotography-label {
            display: block;
            font-weight: 600;
            color: var(--sp-text);
            margin-bottom: 8px;
            font-size: 0.9375rem;
        }
        .sphotography-field-checkbox .sphotography-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        .sphotography-field-checkbox input[type=\"checkbox\"] {
            margin: 0;
        }
        .sphotography-desc {
            color: var(--sp-text-muted);
            font-size: 0.8125rem;
            margin: 6px 0 0 0;
            line-height: 1.6;
        }
        .sphotography-color-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .sphotography-preset-colors {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .sphotography-preset-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid transparent;
            cursor: pointer;
            transition: transform 180ms cubic-bezier(0.16,1,0.3,1);
            padding: 0;
            outline: none;
        }
        .sphotography-preset-btn:hover {
            transform: scale(1.12);
        }
        .sphotography-preset-btn.active {
            border-color: var(--sp-accent);
            box-shadow: 0 0 0 2px var(--sp-surface), 0 0 0 4px var(--sp-accent);
        }
        .sphotography-radio-group {
            display: flex;
            gap: 24px;
        }
        .sphotography-radio-label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        .sphotography-radio-text {
            font-size: 0.9375rem;
        }
        .sphotography-actions {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-top: 24px;
            padding: 20px 0;
        }
        .sphotography-actions .button-large {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 24px;
            font-size: 0.9375rem;
            border-radius: 8px;
            font-family: {$sp_serif};
        }
        .sphotography-actions .button-primary {
            background: var(--sp-accent);
            border-color: var(--sp-accent);
            box-shadow: none;
            text-shadow: none;
            transition: transform 160ms cubic-bezier(0.16,1,0.3,1), filter 160ms ease;
        }
        .sphotography-actions .button-primary:hover {
            filter: brightness(1.07);
            transform: translateY(-1px);
        }
        .sphotography-actions .button-primary:active { transform: translateY(0); }
        #sphotography-reset-btn {
            color: #e05a4d;
            border-color: #e05a4d;
            background: transparent;
            transition: background 160ms ease, color 160ms ease;
        }
        #sphotography-reset-btn:hover {
            background: #e05a4d;
            color: #fff;
        }
        .sphotography-field input[type=\"text\"],
        .sphotography-field input[type=\"url\"],
        .sphotography-field input[type=\"number\"],
        .sphotography-field select,
        .sphotography-field textarea {
            width: 100%;
            max-width: 420px;
            border-radius: 8px;
            border: 1px solid var(--sp-border);
            background: var(--sp-surface-2);
            color: var(--sp-text);
            padding: 8px 12px;
            font-size: 0.9375rem;
            font-family: {$sp_serif};
        }
        .sphotography-field textarea {
            max-width: 520px;
        }
        .sphotography-field input:focus,
        .sphotography-field select:focus,
        .sphotography-field textarea:focus {
            border-color: var(--sp-accent);
            box-shadow: 0 0 0 1px var(--sp-accent);
            outline: none;
        }
        /* Keep native form controls readable in dark mode. Without explicit
           colours on every state, browsers (and WordPress core form.css) fall
           back to a dark/black text colour on the select control and its
           option list — both when hovered and at rest — which becomes
           unreadable on the dark surface. We pin colour + background on the
           control, the option list, and the hovered/checked option, and use
           !important so core rules cannot override them. */
        .sphotography-field select {
            color: var(--sp-text) !important;
            background-color: var(--sp-surface-2) !important;
        }
        .sphotography-field select:hover,
        .sphotography-field select:focus,
        .sphotography-field select:active {
            color: var(--sp-text) !important;
            background-color: var(--sp-surface-2) !important;
        }
        .sphotography-field select option {
            color: var(--sp-text) !important;
            background-color: var(--sp-surface) !important;
        }
        .sphotography-field select option:hover,
        .sphotography-field select option:focus,
        .sphotography-field select option:checked,
        .sphotography-field select option:active {
            color: #ffffff !important;
            background-color: var(--sp-accent) !important;
        }
        .sphotography-field input[type=\"text\"]:hover,
        .sphotography-field input[type=\"url\"]:hover,
        .sphotography-field input[type=\"number\"]:hover,
        .sphotography-field textarea:hover {
            background: var(--sp-surface-2);
            color: var(--sp-text);
        }
        .sphotography-custom-date-field {
            margin-top: 12px;
        }
        /* v1.2.5 — advanced motion block + slider rows */
        .sphotography-advanced-toggle {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            color: var(--sp-accent);
            font-family: {$sp_serif};
            font-size: 0.9rem;
            font-weight: 600;
        }
        .sphotography-advanced-toggle .dashicons {
            transition: transform 160ms ease;
            font-size: 18px;
            width: 18px;
            height: 18px;
        }
        .sphotography-advanced-toggle[aria-expanded=\"true\"] .dashicons {
            transform: rotate(90deg);
        }
        .sphotography-advanced-body {
            margin-top: 14px;
            padding: 16px 18px;
            border: 1px dashed var(--sp-border);
            border-radius: 10px;
            background: var(--sp-surface-2);
        }
        .sphotography-advanced-group {
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--sp-border);
        }
        .sphotography-advanced-group:last-of-type {
            border-bottom: none;
        }
        .sphotography-advanced-group-title {
            margin: 0 0 10px 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--sp-text);
        }
        .sphotography-sublabel {
            display: block;
            margin: 10px 0 4px 0;
            font-size: 0.8125rem;
            color: var(--sp-text-muted);
        }
        .sphotography-slider-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .sphotography-slider-row input[type=\"range\"] {
            flex: 1 1 auto;
            max-width: 320px;
        }
        .sphotography-slider-val {
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            color: var(--sp-text);
            min-width: 3ch;
        }
        .sphotography-module-header .sphotography-module-icon {
            margin-right: 4px;
        }
        .sphotography-settings-wrap .notice {
            border-radius: 10px;
        }
    ";

    wp_add_inline_style( 'wp-color-picker', $settings_css );

    wp_enqueue_script(
        'sphotography-admin-settings',
        get_template_directory_uri() . '/assets/js/admin-settings.js',
        array( 'jquery', 'wp-color-picker' ),
        SPHOTOGRAPHY_VERSION,
        true
    );

    wp_localize_script( 'sphotography-admin-settings', 'SphotographyAdmin', array(
        'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
        'currentVersion' => SPHOTOGRAPHY_VERSION,
        'updateUrl'      => 'https://raw.githubusercontent.com/ShirazuNagisa/sphotography/master/version.json',
        'releaseUrl'     => 'https://github.com/ShirazuNagisa/sphotography/releases',
        'updateNonce'    => wp_create_nonce( 'sphotography_update_nonce' ),
        'resetConfirm'   => __( '确定要重置所有设置为默认值吗？此操作不可撤销。', 'sphotography' ),
        'updateConfirm'  => __( "确定从 master 分支下载并覆盖主题文件吗？\n\n配置数据存在数据库中，不受影响。\n更新后请重新激活主题。", 'sphotography' ),
    ) );
}
