<?php
/**
 * Sphotography - Admin Appearance
 *
 * Two related concerns live here:
 *   1. A shared scheme body-class (light / dark / system) driven by the same
 *      night_mode setting the frontend map uses.
 *   2. An optional global "Sphotography style" that themes the whole of
 *      wp-admin — elegant serif type, the theme primary colour, and light/dark
 *      following night_mode. This is gated entirely behind the
 *      `admin_global_style` toggle and is ON by default.
 *
 * The settings page (admin/theme-settings.php) always adopts the Sphotography
 * look regardless of the global toggle; it relies on the scheme class added
 * here.
 *
 * @package Sphotography
 * @version 1.2.8
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ============================================
// Small helpers
// ============================================
function sphotography_admin_primary_color() {
    return get_theme_mod( 'sphotography_primary_color', '#1abc9c' );
}

function sphotography_admin_night_mode() {
    $mode = get_theme_mod( 'sphotography_night_mode', 'system' );
    return in_array( $mode, array( 'system', 'light', 'dark' ), true ) ? $mode : 'system';
}

function sphotography_admin_global_enabled() {
    return (bool) get_theme_mod( 'sphotography_admin_global_style', true );
}

/**
 * True on the Sphotography settings screen.
 */
function sphotography_is_settings_screen( $hook = '' ) {
    if ( $hook ) {
        return 'toplevel_page_sphotography-settings' === $hook;
    }
    $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
    return $screen && 'toplevel_page_sphotography-settings' === $screen->id;
}

// ============================================
// Scheme body class (light / dark / system)
// ============================================
function sphotography_admin_body_class( $classes ) {
    $on_settings = sphotography_is_settings_screen();
    $global      = sphotography_admin_global_enabled();

    if ( ! $on_settings && ! $global ) {
        return $classes;
    }

    $classes .= ' sphotography-admin sphotography-admin-scheme-' . sphotography_admin_night_mode();
    if ( $global ) {
        $classes .= ' sphotography-admin-global';
    }
    return $classes;
}
add_filter( 'admin_body_class', 'sphotography_admin_body_class' );

// ============================================
// Enqueue serif font + global theming CSS
// ============================================
function sphotography_admin_enqueue_appearance( $hook ) {
    $on_settings = sphotography_is_settings_screen( $hook );
    $global      = sphotography_admin_global_enabled();

    if ( ! $on_settings && ! $global ) {
        return;
    }

    // Elegant serif, matching the frontend.
    wp_enqueue_style(
        'sphotography-admin-font',
        'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap',
        array(),
        null
    );

    // Only the whole-admin theming is gated behind the toggle. The settings
    // page brings its own component styles (theme-settings.php).
    if ( $global ) {
        wp_register_style( 'sphotography-admin-global', false, array( 'sphotography-admin-font' ), SPHOTOGRAPHY_VERSION );
        wp_enqueue_style( 'sphotography-admin-global' );
        wp_add_inline_style( 'sphotography-admin-global', sphotography_admin_global_css() );
    }
}
add_action( 'admin_enqueue_scripts', 'sphotography_admin_enqueue_appearance' );

/**
 * Build the whole-admin theming CSS. Scoped to the scheme body classes so it
 * only ever applies when the global style is enabled.
 *
 * @return string
 */
function sphotography_admin_global_css() {
    $primary = sphotography_admin_primary_color();
    $serif   = "'Noto Serif SC', Georgia, 'Times New Roman', 'Songti SC', serif";

    // The variable blocks below are reused for both explicit dark mode and the
    // system-preference branch, so define them once as strings.
    $light_vars = "
        --sp-bg: #f4f1ec;
        --sp-surface: #ffffff;
        --sp-surface-2: #faf8f4;
        --sp-text: #2b2622;
        --sp-text-muted: #6b6259;
        --sp-border: #e6e0d8;
        --sp-accent: {$primary};
        --sp-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
        color-scheme: light;
    ";
    $dark_vars = "
        --sp-bg: #121212;
        --sp-surface: #1c1c1c;
        --sp-surface-2: #242424;
        --sp-text: #ececec;
        --sp-text-muted: #9a9a9a;
        --sp-border: rgba(255,255,255,0.10);
        --sp-accent: {$primary};
        --sp-shadow: 0 2px 8px rgba(0,0,0,0.4);
        color-scheme: dark;
    ";

    $css = "
    /* ---- scheme variables ---- */
    body.sphotography-admin-global { {$light_vars} }
    body.sphotography-admin-global.sphotography-admin-scheme-dark { {$dark_vars} }
    @media (prefers-color-scheme: dark) {
        body.sphotography-admin-global.sphotography-admin-scheme-system { {$dark_vars} }
    }

    /* ---- base chrome ---- */
    body.sphotography-admin-global,
    body.sphotography-admin-global #wpwrap,
    body.sphotography-admin-global #wpcontent,
    body.sphotography-admin-global .wrap {
        background: var(--sp-bg);
        color: var(--sp-text);
    }
    body.sphotography-admin-global,
    body.sphotography-admin-global .wrap,
    body.sphotography-admin-global .wp-core-ui,
    body.sphotography-admin-global p,
    body.sphotography-admin-global td,
    body.sphotography-admin-global th,
    body.sphotography-admin-global label,
    body.sphotography-admin-global h1,
    body.sphotography-admin-global h2,
    body.sphotography-admin-global h3 {
        font-family: {$serif};
    }
    body.sphotography-admin-global .wrap h1,
    body.sphotography-admin-global .wrap h2 { color: var(--sp-text); }

    /* Admin menu */
    body.sphotography-admin-global #adminmenu,
    body.sphotography-admin-global #adminmenuback,
    body.sphotography-admin-global #adminmenuwrap {
        background: var(--sp-surface);
    }
    body.sphotography-admin-global #adminmenu a { color: var(--sp-text-muted); }
    body.sphotography-admin-global #adminmenu .wp-menu-name { font-family: {$serif}; }
    body.sphotography-admin-global #adminmenu li.menu-top:hover,
    body.sphotography-admin-global #adminmenu li.opensub > a.menu-top,
    body.sphotography-admin-global #adminmenu li > a.menu-top:focus {
        background: var(--sp-surface-2);
        color: var(--sp-accent);
    }
    body.sphotography-admin-global #adminmenu li.current a.menu-top,
    body.sphotography-admin-global #adminmenu li.wp-has-current-submenu a.wp-has-current-submenu {
        background: var(--sp-accent);
        color: #fff;
    }
    body.sphotography-admin-global #adminmenu .wp-submenu {
        background: var(--sp-surface-2);
    }
    body.sphotography-admin-global #adminmenu .wp-submenu a { color: var(--sp-text-muted); }
    body.sphotography-admin-global #adminmenu .wp-submenu a:hover,
    body.sphotography-admin-global #adminmenu .wp-submenu li.current a { color: var(--sp-accent); }

    /* Admin bar */
    body.sphotography-admin-global #wpadminbar {
        background: var(--sp-surface);
        color: var(--sp-text);
    }

    /* Cards, metaboxes, tables */
    body.sphotography-admin-global .postbox,
    body.sphotography-admin-global .card,
    body.sphotography-admin-global .wp-list-table,
    body.sphotography-admin-global .widefat {
        background: var(--sp-surface);
        color: var(--sp-text);
        border: 1px solid var(--sp-border);
        border-radius: 12px;
        box-shadow: var(--sp-shadow);
    }
    body.sphotography-admin-global .wp-list-table th,
    body.sphotography-admin-global .wp-list-table td { color: var(--sp-text); }
    body.sphotography-admin-global .postbox .hndle,
    body.sphotography-admin-global .postbox-header { border-bottom: 1px solid var(--sp-border); }

    /* Inputs */
    body.sphotography-admin-global input[type=text],
    body.sphotography-admin-global input[type=search],
    body.sphotography-admin-global input[type=email],
    body.sphotography-admin-global input[type=url],
    body.sphotography-admin-global input[type=password],
    body.sphotography-admin-global input[type=number],
    body.sphotography-admin-global select,
    body.sphotography-admin-global textarea {
        background: var(--sp-surface-2);
        color: var(--sp-text);
        border: 1px solid var(--sp-border);
        border-radius: 8px;
        font-family: {$serif};
    }
    body.sphotography-admin-global input:focus,
    body.sphotography-admin-global select:focus,
    body.sphotography-admin-global textarea:focus {
        border-color: var(--sp-accent);
        box-shadow: 0 0 0 1px var(--sp-accent);
        outline: none;
    }
    /* Keep native form controls readable in dark mode. Without explicit
       colours on every state, browsers (and WordPress core form.css) fall back
       to a dark/black text colour on the select control and its option list —
       both when hovered and at rest — which becomes unreadable on the dark
       surface. Pin colour + background on the control, the option list, and the
       hovered/checked option, with !important so core rules cannot override. */
    body.sphotography-admin-global select {
        color: var(--sp-text) !important;
        background-color: var(--sp-surface-2) !important;
    }
    body.sphotography-admin-global select:hover,
    body.sphotography-admin-global select:focus,
    body.sphotography-admin-global select:active {
        color: var(--sp-text) !important;
        background-color: var(--sp-surface-2) !important;
    }
    body.sphotography-admin-global select option {
        color: var(--sp-text) !important;
        background-color: var(--sp-surface) !important;
    }
    body.sphotography-admin-global select option:hover,
    body.sphotography-admin-global select option:focus,
    body.sphotography-admin-global select option:checked,
    body.sphotography-admin-global select option:active {
        color: #ffffff !important;
        background-color: var(--sp-accent) !important;
    }
    body.sphotography-admin-global input[type=text]:hover,
    body.sphotography-admin-global input[type=search]:hover,
    body.sphotography-admin-global input[type=email]:hover,
    body.sphotography-admin-global input[type=url]:hover,
    body.sphotography-admin-global input[type=password]:hover,
    body.sphotography-admin-global input[type=number]:hover,
    body.sphotography-admin-global textarea:hover {
        background: var(--sp-surface-2);
        color: var(--sp-text);
    }

    /* Primary buttons — subtle, not flashy */
    body.sphotography-admin-global .wp-core-ui .button-primary {
        background: var(--sp-accent);
        border-color: var(--sp-accent);
        border-radius: 8px;
        box-shadow: none;
        text-shadow: none;
        transition: transform 160ms cubic-bezier(0.16,1,0.3,1), filter 160ms ease;
    }
    body.sphotography-admin-global .wp-core-ui .button-primary:hover {
        filter: brightness(1.07);
        transform: translateY(-1px);
    }
    body.sphotography-admin-global .wp-core-ui .button-primary:active { transform: translateY(0); }
    body.sphotography-admin-global .wp-core-ui .button,
    body.sphotography-admin-global .wp-core-ui .button-secondary {
        background: var(--sp-surface-2);
        color: var(--sp-text);
        border: 1px solid var(--sp-border);
        border-radius: 8px;
        transition: border-color 160ms ease, color 160ms ease;
    }
    body.sphotography-admin-global .wp-core-ui .button:hover {
        border-color: var(--sp-accent);
        color: var(--sp-accent);
    }
    body.sphotography-admin-global a { color: var(--sp-accent); }

    /* ---- v1.3.4: list-table row striping ----
       WordPress core paints .striped odd rows a light grey (#f6f7f7) with high
       specificity, which under the dark scheme became a white band swallowing
       the light row text. Neutralise the core row/cell backgrounds and paint a
       subtle scheme-aware stripe from our own surfaces instead. */
    body.sphotography-admin-global .wp-list-table td,
    body.sphotography-admin-global .wp-list-table th,
    body.sphotography-admin-global .wp-list-table > tbody > tr,
    body.sphotography-admin-global .wp-list-table.striped > tbody > tr:nth-child(odd),
    body.sphotography-admin-global .wp-list-table > tbody > tr.alternate,
    body.sphotography-admin-global .striped > tbody > tr:nth-child(odd) {
        background: transparent !important;
        color: var(--sp-text);
    }
    body.sphotography-admin-global .wp-list-table.striped > tbody > tr:nth-child(even),
    body.sphotography-admin-global .wp-list-table.widefat > tbody > tr:nth-child(even) {
        background: var(--sp-surface-2) !important;
    }
    body.sphotography-admin-global .wp-list-table > tbody > tr:hover,
    body.sphotography-admin-global .wp-list-table > tbody > tr:hover > * {
        background: var(--sp-surface-2) !important;
    }
    body.sphotography-admin-global .wp-list-table a.row-title,
    body.sphotography-admin-global .wp-list-table .column-title strong,
    body.sphotography-admin-global .wp-list-table strong { color: var(--sp-text); }
    body.sphotography-admin-global .wp-list-table a.row-title:hover { color: var(--sp-accent); }
    body.sphotography-admin-global .wp-list-table .row-actions,
    body.sphotography-admin-global .wp-list-table .row-actions a { color: var(--sp-text-muted); }
    body.sphotography-admin-global .wp-list-table .row-actions a:hover { color: var(--sp-accent); }

    /* ---- v1.3.4: light-mode contrast for native WP option text ----
       Core leaves much of its settings-screen copy at a pale grey that is hard
       to read on our cream light surface. Darken the muted token in light mode
       and pin native form/description text to a readable colour. */
    body.sphotography-admin-global:not(.sphotography-admin-scheme-dark) { --sp-text-muted: #57514a; }
    @media (prefers-color-scheme: light) {
        body.sphotography-admin-global.sphotography-admin-scheme-system { --sp-text-muted: #57514a; }
    }
    body.sphotography-admin-global #wpbody-content,
    body.sphotography-admin-global .form-table th,
    body.sphotography-admin-global .form-table td,
    body.sphotography-admin-global .form-wrap label,
    body.sphotography-admin-global fieldset label,
    body.sphotography-admin-global .wrap li,
    body.sphotography-admin-global .wrap p { color: var(--sp-text); }
    body.sphotography-admin-global .description,
    body.sphotography-admin-global p.description,
    body.sphotography-admin-global .form-table .description,
    body.sphotography-admin-global .howto { color: var(--sp-text-muted); }
    ";

    // Dark block-editor interface (sidebar, panels, inputs, meta boxes).
    $css .= sphotography_admin_editor_dark_css();

    return $css;
}

/**
 * Dark theming for the block-editor interface chrome (header, sidebars,
 * inspector panels, form inputs, meta-box area) when the global style is on and
 * the dark scheme is active. Emitted under both the explicit dark class and the
 * system-preference branch so it never leaks into light mode.
 *
 * The rules reference the --sp-* tokens, which already resolve to dark values
 * under these selectors, so a single rule body serves both branches.
 *
 * @return string
 */
function sphotography_admin_editor_dark_css() {
    $rules = "
        {P} .edit-post-header,
        {P} .editor-header,
        {P} .edit-post-header__toolbar,
        {P} .edit-post-header__settings,
        {P} .editor-document-tools,
        {P} .edit-post-editor-regions__header { background: var(--sp-surface); color: var(--sp-text); border-color: var(--sp-border); }
        {P} .interface-interface-skeleton__body,
        {P} .interface-interface-skeleton__content,
        {P} .edit-post-visual-editor,
        {P} .edit-post-layout__metaboxes { background: var(--sp-bg); }
        {P} .interface-complementary-area,
        {P} .interface-interface-skeleton__sidebar,
        {P} .editor-sidebar,
        {P} .edit-post-sidebar { background: var(--sp-surface); color: var(--sp-text); }
        {P} .components-panel,
        {P} .components-panel__body,
        {P} .components-panel__header,
        {P} .block-editor-block-inspector,
        {P} .editor-sidebar .components-panel { background: var(--sp-surface); color: var(--sp-text); border-color: var(--sp-border); }
        {P} .components-panel__body-title,
        {P} .components-panel__body-title .components-button,
        {P} .block-editor-block-card__title,
        {P} .interface-complementary-area h2,
        {P} .interface-complementary-area h3,
        {P} .components-base-control__label,
        {P} .components-base-control__help,
        {P} .block-editor-block-card__description,
        {P} .edit-post-sidebar label,
        {P} .components-toggle-control__label,
        {P} .components-panel label { color: var(--sp-text); }
        {P} .components-text-control__input,
        {P} .components-textarea-control__input,
        {P} .components-select-control__input,
        {P} .components-input-control__input,
        {P} .block-editor-plain-text,
        {P} .components-form-token-field__input,
        {P} .components-form-token-field {
            background: var(--sp-surface-2) !important;
            color: var(--sp-text) !important;
            border-color: var(--sp-border) !important;
        }
        {P} .editor-post-title__input,
        {P} .wp-block-post-title { color: var(--sp-text) !important; }
        {P} .edit-post-meta-boxes-area .postbox,
        {P} .metabox-location-side .postbox,
        {P} #poststuff .postbox { background: var(--sp-surface); color: var(--sp-text); border-color: var(--sp-border); }
        {P} #poststuff .postbox .hndle,
        {P} #poststuff .postbox-header { color: var(--sp-text); border-color: var(--sp-border); }
        {P} .components-popover__content,
        {P} .components-dropdown-menu__menu,
        {P} .components-menu-group,
        {P} .components-menu-item__button { background-color: var(--sp-surface); color: var(--sp-text); }
        {P} .components-button.is-tertiary,
        {P} .components-button.is-secondary { color: var(--sp-text); }
    ";

    $dark   = str_replace( '{P}', 'body.sphotography-admin-global.sphotography-admin-scheme-dark', $rules );
    $system = str_replace( '{P}', 'body.sphotography-admin-global.sphotography-admin-scheme-system', $rules );

    return $dark . "\n@media (prefers-color-scheme: dark) {\n" . $system . "\n}\n";
}

// ============================================
// Dark editor canvas (iframed content in WP 6.3+)
//
// The rules above style the editor chrome, which lives in the main admin
// document. The writing canvas is rendered in its own iframe, so its dark
// styling must be enqueued via enqueue_block_assets (which WordPress injects
// into the canvas iframe). Guarded to the admin, the global style, and dark
// mode; the system branch is resolved with a media query because the iframe
// body carries no scheme class.
// ============================================
function sphotography_admin_block_canvas_dark() {
    if ( ! is_admin() || ! sphotography_admin_global_enabled() ) {
        return;
    }
    $mode = sphotography_admin_night_mode();
    if ( 'light' === $mode ) {
        return; // Editor stays light in light mode.
    }

    $primary = sphotography_admin_primary_color();
    $body = "
        .editor-styles-wrapper,
        .block-editor-writing-flow {
            background-color: #121212 !important;
            color: #ececec !important;
        }
        .editor-styles-wrapper .wp-block,
        .editor-styles-wrapper p,
        .editor-styles-wrapper li,
        .editor-styles-wrapper h1,
        .editor-styles-wrapper h2,
        .editor-styles-wrapper h3,
        .editor-styles-wrapper h4,
        .editor-styles-wrapper h5,
        .editor-styles-wrapper h6,
        .editor-styles-wrapper .wp-block-post-title { color: #ececec !important; }
        .editor-styles-wrapper a { color: {$primary} !important; }
        .editor-styles-wrapper .wp-block-quote,
        .editor-styles-wrapper .wp-block-code,
        .editor-styles-wrapper pre { background-color: #1c1c1c !important; color: #ececec !important; }
        .editor-styles-wrapper .block-editor-default-block-appender__content,
        .editor-styles-wrapper .wp-block-paragraph[data-empty=\"true\"]:before { color: #9a9a9a !important; }
    ";

    if ( 'dark' === $mode ) {
        $css = $body;
    } else {
        // system
        $css = "@media (prefers-color-scheme: dark) {\n{$body}\n}\n";
    }

    wp_register_style( 'sphotography-editor-canvas-dark', false, array(), SPHOTOGRAPHY_VERSION );
    wp_enqueue_style( 'sphotography-editor-canvas-dark' );
    wp_add_inline_style( 'sphotography-editor-canvas-dark', $css );
}
add_action( 'enqueue_block_assets', 'sphotography_admin_block_canvas_dark' );