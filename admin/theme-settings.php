<?php
/**
 * Sphotography Theme Settings Page
 *
 * @package Sphotography
 * @version 1.0.0
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
        'primary_color'       => '#e67e22',
        'allow_custom_color'  => false,
        'immersive_color'     => false,
        'night_mode'          => 'system',
        'dark_scheme'         => 'default',
        // ② Card Style
        'card_radius'         => 16,
        'card_shadow'         => 'light',
        // ③ Date Format
        'date_format'         => 'Y-m-d',
        'custom_date_format'  => '',
        // ④ Sidebar Info
        'site_title'          => '',
        'enable_hitokoto'     => false,
        'author_nickname'     => '',
        'avatar_url'          => '',
        'bio'                 => '',
        // ⑤ Animation
        'smooth_scroll'       => 'enabled',
        'entry_animation'     => true,
        'pjax_animation'      => true,
        // ⑥ Footer
        'footer_content'      => '',
        // ⑦ CDN
        'cdn_source'          => 'jsdelivr',
    );
}

// ============================================
// Sanitize all settings before save
// ============================================
function sphotography_sanitize_settings( $input ) {
    $defaults = sphotography_get_default_settings();
    $sanitized = array();

    // ① Global Theme
    $sanitized['primary_color'] = sanitize_hex_color( $input['primary_color'] ) ?: $defaults['primary_color'];
    $sanitized['allow_custom_color'] = ! empty( $input['allow_custom_color'] ) ? 1 : 0;
    $sanitized['immersive_color'] = ! empty( $input['immersive_color'] ) ? 1 : 0;
    $allowed_night = array( 'system', 'light', 'dark' );
    $sanitized['night_mode'] = in_array( $input['night_mode'], $allowed_night, true ) ? $input['night_mode'] : $defaults['night_mode'];
    $allowed_dark = array( 'default', 'blue', 'purple' );
    $sanitized['dark_scheme'] = in_array( $input['dark_scheme'], $allowed_dark, true ) ? $input['dark_scheme'] : $defaults['dark_scheme'];

    // ② Card Style
    $sanitized['card_radius'] = min( max( (int) $input['card_radius'], 0 ), 40 );
    $sanitized['card_shadow'] = in_array( $input['card_shadow'], array( 'light', 'deep' ), true ) ? $input['card_shadow'] : $defaults['card_shadow'];

    // ③ Date Format
    $sanitized['date_format'] = sanitize_text_field( $input['date_format'] ) ?: $defaults['date_format'];
    $sanitized['custom_date_format'] = sanitize_text_field( $input['custom_date_format'] );

    // ④ Sidebar Info
    $sanitized['site_title'] = sanitize_text_field( $input['site_title'] );
    $sanitized['enable_hitokoto'] = ! empty( $input['enable_hitokoto'] ) ? 1 : 0;
    $sanitized['author_nickname'] = sanitize_text_field( $input['author_nickname'] );
    $sanitized['avatar_url'] = esc_url_raw( $input['avatar_url'] );
    $sanitized['bio'] = sanitize_textarea_field( $input['bio'] );

    // ⑤ Animation
    $allowed_scroll = array( 'disabled', 'enabled', 'mouse-only' );
    $sanitized['smooth_scroll'] = in_array( $input['smooth_scroll'], $allowed_scroll, true ) ? $input['smooth_scroll'] : $defaults['smooth_scroll'];
    $sanitized['entry_animation'] = ! empty( $input['entry_animation'] ) ? 1 : 0;
    $sanitized['pjax_animation'] = ! empty( $input['pjax_animation'] ) ? 1 : 0;

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

        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="sphotography_save_settings">
            <?php wp_nonce_field( 'sphotography_save_settings', 'sphotography_save_nonce' ); ?>

            <!-- ============================================ -->
            <!-- Module 1: 全局主题 -->
            <!-- ============================================ -->
            <div class="sphotography-module">
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
                                   data-default-color="#e67e22">
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
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 2: 卡片样式 -->
            <!-- ============================================ -->
            <div class="sphotography-module">
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
            <div class="sphotography-module">
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
            <div class="sphotography-module">
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
            <div class="sphotography-module">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-update"></span>
                    <h2><?php _e( '动画设置', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">

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
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 6: 页脚设置 -->
            <!-- ============================================ -->
            <div class="sphotography-module">
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
                        <p class="sphotography-desc"><?php _e( '留空则隐藏页脚。支持 HTML 脚本标签。显示在地图底部中央位置。', 'sphotography' ); ?></p>
                    </div>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- Module 8: CDN 来源配置 -->
            <!-- ============================================ -->
            <div class="sphotography-module">
                <div class="sphotography-module-header">
                    <span class="sphotography-module-icon dashicons dashicons-networking"></span>
                    <h2><?php _e( 'CDN 来源', 'sphotography' ); ?></h2>
                </div>
                <div class="sphotography-module-body">
                    <div class="sphotography-field">
                        <label class="sphotography-label" for="sphotography-cdn-source"><?php _e( 'MapLibre / Supercluster 加载源', 'sphotography' ); ?></label>
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
            <!-- Module 9: 版本与更新 -->
            <!-- ============================================ -->
            <div class="sphotography-module">
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
                            <button type="button" id="sphotography-do-update" class="button button-primary" style="display:inline-flex;align-items:center;gap:4px;background:#e67e22;border-color:#d35400;">
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

    // Admin custom styles
    wp_add_inline_style( 'wp-color-picker', '
        .sphotography-settings-wrap {
            max-width: 960px;
            margin: 20px auto;
            background: #e0f2f1;
            padding: 30px 40px;
            border-radius: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .sphotography-settings-title {
            font-size: 1.75rem;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: #1a1a1a;
        }
        .sphotography-settings-subtitle {
            color: #555;
            margin: 0 0 28px 0;
            font-size: 0.9375rem;
        }
        .sphotography-module {
            background: #ffffff;
            border-radius: 14px;
            margin-bottom: 20px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
        }
        .sphotography-module-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 24px;
            background: #fafffe;
            border-bottom: 1px solid #e0f2f1;
        }
        .sphotography-module-header h2 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #1a1a1a;
        }
        .sphotography-module-icon {
            color: #00a896;
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
            border-bottom: 1px solid #f0f0f0;
        }
        .sphotography-field:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        .sphotography-label {
            display: block;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 8px;
            font-size: 0.9375rem;
        }
        .sphotography-field-checkbox .sphotography-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        .sphotography-field-checkbox input[type="checkbox"] {
            margin: 0;
        }
        .sphotography-desc {
            color: #718096;
            font-size: 0.8125rem;
            margin: 6px 0 0 0;
            line-height: 1.5;
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
            transition: all 0.2s ease;
            padding: 0;
            outline: none;
        }
        .sphotography-preset-btn:hover {
            transform: scale(1.15);
        }
        .sphotography-preset-btn.active {
            border-color: #1a1a1a;
            box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1a1a1a;
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
        }
        .sphotography-actions .button-primary {
            background: #00a896;
            border-color: #00897b;
        }
        .sphotography-actions .button-primary:hover {
            background: #00897b;
        }
        #sphotography-reset-btn {
            color: #e53e3e;
            border-color: #e53e3e;
        }
        #sphotography-reset-btn:hover {
            background: #e53e3e;
            color: #fff;
        }
        .sphotography-field input[type="text"],
        .sphotography-field input[type="url"],
        .sphotography-field input[type="number"],
        .sphotography-field select,
        .sphotography-field textarea {
            width: 100%;
            max-width: 420px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
            font-size: 0.9375rem;
        }
        .sphotography-field textarea {
            max-width: 520px;
        }
        .sphotography-field input:focus,
        .sphotography-field select:focus,
        .sphotography-field textarea:focus {
            border-color: #00a896;
            box-shadow: 0 0 0 1px #00a896;
            outline: none;
        }
        .sphotography-custom-date-field {
            margin-top: 12px;
        }
        .sphotography-module-header .sphotography-module-icon {
            margin-right: 4px;
        }
        .notice {
            border-radius: 10px;
        }
    ' );

    // Admin custom script
    wp_add_inline_script( 'wp-color-picker', '
        jQuery(document).ready(function($) {
            // Init color picker
            $(".sphotography-color-picker").wpColorPicker({
                change: function(event, ui) {
                    var color = ui.color.toString();
                    $(".sphotography-preset-btn").removeClass("active");
                }
            });

            // Preset color buttons
            $(".sphotography-preset-btn").on("click", function() {
                var color = $(this).data("color");
                $(".sphotography-color-picker").iris("color", color);
                $(".sphotography-color-picker").val(color);
                $(".sphotography-preset-btn").removeClass("active");
                $(this).addClass("active");
            });

            // Date format toggle
            $("#sphotography-date-format").on("change", function() {
                if ($(this).val() === "custom") {
                    $(".sphotography-custom-date-field").show();
                } else {
                    $(".sphotography-custom-date-field").hide();
                }
            });

            // Reset confirmation
            $("#sphotography-reset-btn").on("click", function() {
                if (confirm("' . esc_js( __( '确定要重置所有设置为默认值吗？此操作不可撤销。', 'sphotography' ) ) . '")) {
                    $("#sphotography-reset-form").submit();
                }
            });

            // Helper: compare semantic versions, returns true if a > b
            function semverGreater(a, b) {
                var pa = a.split(".");
                var pb = b.split(".");
                for (var i = 0; i < 3; i++) {
                    var na = parseInt(pa[i]) || 0;
                    var nb = parseInt(pb[i]) || 0;
                    if (na > nb) return true;
                    if (na < nb) return false;
                }
                return false;
            }

            // Check update via raw GitHub (reliable, no CDN delay)
            $("#sphotography-check-update").on("click", function() {
                var btn = $(this);
                var resultDiv = $("#sphotography-update-result");
                var statusSpan = $("#sphotography-version-status");

                btn.prop("disabled", true).text("检查中...");
                resultDiv.html("<p style=\"color:#718096;\">正在检查更新...</p>");

                $.ajax({
                    url: "https://raw.githubusercontent.com/ShirazuNagisa/sphotography/master/version.json",
                    type: "GET", dataType: "json",
                    timeout: 15000,
                    success: function(data) {
                        var currentVer = "' . esc_js( SPHOTOGRAPHY_VERSION ) . '";
                        var latestVer = data.version || "";
                        var html = "";

                        if (!latestVer) {
                            html = "<p style=\"color:#e67e22;\">ℹ 无法解析版本信息。</p>";
                            statusSpan.text("检查失败").css("color", "#e67e22");
                        } else if (semverGreater(latestVer, currentVer)) {
                            html = "<p style=\"color:#e67e22;font-weight:600;\">★ 发现新版本: v" + latestVer + "</p>"
                                 + "<p style=\"margin-top:6px;\">当前版本: v" + currentVer + "</p>"
                                 + '<p style="margin-top:8px;"><a href="https://github.com/ShirazuNagisa/sphotography/releases" target="_blank" class="button button-secondary">查看 Release</a></p>';
                            statusSpan.text("有新版本: v" + latestVer).css("color", "#e67e22");
                            if (data.changelog) {
                                var log = data.changelog.replace(/\\n/g, "<br>");
                                html += "<div style=\"margin-top:10px;padding:10px 14px;background:#f8f9fa;border-radius:8px;font-size:0.8125rem;color:#555;max-height:200px;overflow-y:auto;\">"
                                     + "<strong>更新说明:</strong><br>" + log + "</div>";
                            }
                        } else {
                            html = "<p style=\"color:#2ecc71;font-weight:600;\">✓ 当前 v" + currentVer + " 已是最新版本</p>";
                            statusSpan.text("已是最新").css("color", "#2ecc71");
                        }
                        resultDiv.html(html);
                        btn.prop("disabled", false).text("检查更新");
                    },
                    error: function() {
                        resultDiv.html("<p style=\"color:#e74c3c;\">✗ 无法连接到 raw.githubusercontent.com。可直接访问 <a href=\'https://github.com/ShirazuNagisa/sphotography/releases\' target=\'_blank\'>GitHub Releases</a> 手动查看。</p>");
                        statusSpan.text("检查失败").css("color", "#e74c3c");
                        btn.prop("disabled", false).text("检查更新");
                    }
                });
            });

            // One-click update: download ZIP and overwrite theme
            $("#sphotography-do-update").on("click", function() {
                var btn = $(this);
                var resultDiv = $("#sphotography-update-result");

                if (!confirm("确定从 master 分支下载并覆盖主题文件吗？\n\n配置数据存在数据库中，不受影响。\n更新后请重新激活主题。")) {
                    return;
                }

                btn.prop("disabled", true).text("下载更新中...");
                resultDiv.html("<p style=\"color:#718096;\">正在从 master 分支下载更新...</p>");

                $.ajax({
                    url: ajaxurl || window.location.origin + "/wp-admin/admin-ajax.php",
                    type: "POST",
                    data: {
                        action: "sphotography_do_update",
                        branch: "master",
                        nonce: "' . wp_create_nonce( 'sphotography_update_nonce' ) . '"
                    },
                    success: function(res) {
                        if (res.success) {
                            resultDiv.html("<p style=\"color:#2ecc71;font-weight:600;\">✓ 更新完成！请重新激活主题以确保生效。</p>"
                                         + "<p><a href=\"" + window.location.href + "\" class=\"button button-primary\">刷新页面</a></p>");
                        } else {
                            resultDiv.html("<p style=\"color:#e74c3c;\">✗ 更新失败: " + (res.data || "未知错误") + "</p>");
                        }
                        btn.prop("disabled", false).text("从 master 分支更新主题");
                    },
                    error: function() {
                        resultDiv.html("<p style=\"color:#e74c3c;\">✗ 请求失败，请查看服务器错误日志</p>");
                        btn.prop("disabled", false).text("从 master 分支更新主题");
                    }
                });
            });
        });
    ' );
}
