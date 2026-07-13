<?php
/**
 * Sphotography - Fallback template
 *
 * This file is required by WordPress. If no page with the "Fullscreen Map"
 * template has been set as the front page, this fallback will display a
 * simple setup notice.
 *
 * @package Sphotography
 * @version 1.0.0
 */

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php bloginfo( 'name' ); ?> - <?php _e( 'Setup Required', 'sphotography' ); ?></title>
    <style>
        body {
            margin: 0;
            padding: 40px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0b0b0b;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .setup-card {
            max-width: 520px;
            padding: 40px;
            background: rgba(20, 20, 20, 0.75);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            text-align: center;
        }
        h1 {
            font-family: 'Playfair Display', serif;
            font-size: 2rem;
            margin-bottom: 16px;
            color: #ffffff;
        }
        p {
            font-size: 1rem;
            line-height: 1.6;
            color: #aaaaaa;
            margin-bottom: 24px;
        }
        .badge {
            display: inline-block;
            padding: 8px 20px;
            background: rgba(230, 126, 34, 0.15);
            color: #e67e22;
            border: 1px solid rgba(230, 126, 34, 0.3);
            border-radius: 8px;
            font-size: 0.875rem;
        }
    </style>
    <?php wp_head(); ?>
</head>
<body>
    <div class="setup-card">
        <h1><?php bloginfo( 'name' ); ?></h1>
        <p><?php _e( '请先创建一个页面并选择"Fullscreen Map"模板，然后设为首页。', 'sphotography' ); ?></p>
        <p><?php _e( 'Create a page, select the "Fullscreen Map" template, and set it as the front page.', 'sphotography' ); ?></p>
        <div class="badge">Sphotography</div>
    </div>
    <?php wp_footer(); ?>
</body>
</html>