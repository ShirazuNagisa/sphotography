<?php
/**
 * Sphotography Theme Functions
 *
 * @package Sphotography
 * @version 1.0.1
 */

// ============================================
// 0. Theme Version & Load Includes
// ============================================
define( 'SPHOTOGRAPHY_VERSION', '1.0.2' );

require_once get_template_directory() . '/admin/theme-settings.php';
require_once get_template_directory() . '/inc/theme-mods-applier.php';

// ============================================
// 1. Register Custom Post Type: photograph
// ============================================
function sphotography_register_photograph_cpt() {
    $labels = array(
        'name'                  => _x( 'Photographs', 'Post Type General Name', 'sphotography' ),
        'singular_name'         => _x( 'Photograph', 'Post Type Singular Name', 'sphotography' ),
        'menu_name'             => __( 'Photographs', 'sphotography' ),
        'name_admin_bar'        => __( 'Photograph', 'sphotography' ),
        'archives'              => __( 'Photograph Archives', 'sphotography' ),
        'attributes'            => __( 'Photograph Attributes', 'sphotography' ),
        'all_items'             => __( 'All Photographs', 'sphotography' ),
        'add_new_item'          => __( 'Add New Photograph', 'sphotography' ),
        'add_new'               => __( 'Add New', 'sphotography' ),
        'new_item'              => __( 'New Photograph', 'sphotography' ),
        'edit_item'             => __( 'Edit Photograph', 'sphotography' ),
        'update_item'           => __( 'Update Photograph', 'sphotography' ),
        'view_item'             => __( 'View Photograph', 'sphotography' ),
        'view_items'            => __( 'View Photographs', 'sphotography' ),
        'search_items'          => __( 'Search Photograph', 'sphotography' ),
        'not_found'             => __( 'Not found', 'sphotography' ),
        'not_found_in_trash'    => __( 'Not found in Trash', 'sphotography' ),
    );
    $args = array(
        'label'                 => __( 'Photograph', 'sphotography' ),
        'description'           => __( 'Photographs for the map display', 'sphotography' ),
        'labels'                => $labels,
        'supports'              => array( 'title', 'editor', 'thumbnail', 'custom-fields' ),
        'taxonomies'            => array( 'region_tag' ),
        'hierarchical'          => false,
        'public'                => true,
        'show_ui'               => true,
        'show_in_menu'          => true,
        'menu_position'         => 20,
        'menu_icon'             => 'dashicons-camera',
        'show_in_admin_bar'     => true,
        'show_in_nav_menus'     => false,
        'can_export'            => true,
        'has_archive'           => true,
        'exclude_from_search'   => true,
        'publicly_queryable'    => true,
        'capability_type'       => 'post',
        'show_in_rest'          => true,
        'rest_base'             => 'photograph',
        'rest_controller_class' => 'WP_REST_Posts_Controller',
    );
    register_post_type( 'photograph', $args );
}
add_action( 'init', 'sphotography_register_photograph_cpt' );

// ============================================
// 2. Register Custom Taxonomy: region_tag
// ============================================
function sphotography_register_region_tag_taxonomy() {
    $labels = array(
        'name'                       => _x( 'Region Tags', 'Taxonomy General Name', 'sphotography' ),
        'singular_name'              => _x( 'Region Tag', 'Taxonomy Singular Name', 'sphotography' ),
        'menu_name'                  => __( 'Region Tags', 'sphotography' ),
        'all_items'                  => __( 'All Region Tags', 'sphotography' ),
        'parent_item'                => __( 'Parent Region Tag', 'sphotography' ),
        'parent_item_colon'          => __( 'Parent Region Tag:', 'sphotography' ),
        'new_item_name'              => __( 'New Region Tag Name', 'sphotography' ),
        'add_new_item'               => __( 'Add New Region Tag', 'sphotography' ),
        'edit_item'                  => __( 'Edit Region Tag', 'sphotography' ),
        'update_item'                => __( 'Update Region Tag', 'sphotography' ),
        'view_item'                  => __( 'View Region Tag', 'sphotography' ),
        'separate_items_with_commas' => __( 'Separate tags with commas', 'sphotography' ),
        'add_or_remove_items'        => __( 'Add or remove tags', 'sphotography' ),
        'choose_from_most_used'      => __( 'Choose from the most used', 'sphotography' ),
        'popular_items'              => __( 'Popular Region Tags', 'sphotography' ),
        'search_items'               => __( 'Search Region Tags', 'sphotography' ),
        'not_found'                  => __( 'Not Found', 'sphotography' ),
        'no_terms'                   => __( 'No region tags', 'sphotography' ),
        'items_list'                 => __( 'Region Tags list', 'sphotography' ),
        'items_list_navigation'      => __( 'Region Tags list navigation', 'sphotography' ),
    );
    $args = array(
        'labels'                     => $labels,
        'hierarchical'               => false,
        'public'                     => true,
        'show_ui'                    => true,
        'show_admin_column'          => true,
        'show_in_nav_menus'          => false,
        'show_tagcloud'              => false,
        'show_in_rest'               => true,
        'rest_base'                  => 'region_tag',
        'rest_controller_class'      => 'WP_REST_Terms_Controller',
    );
    register_taxonomy( 'region_tag', array( 'photograph' ), $args );
}
add_action( 'init', 'sphotography_register_region_tag_taxonomy' );

// ============================================
// 3. Register Custom Meta Fields (no ACF required)
// ============================================
function sphotography_register_photograph_meta() {
    $meta_fields = array(
        'latitude' => array(
            'type'        => 'number',
            'description' => 'Latitude coordinate of the photograph location',
            'default'     => 0,
        ),
        'longitude' => array(
            'type'        => 'number',
            'description' => 'Longitude coordinate of the photograph location',
            'default'     => 0,
        ),
        'camera_info' => array(
            'type'        => 'string',
            'description' => 'Camera model and shooting parameters',
            'default'     => '',
        ),
        'taken_at' => array(
            'type'        => 'string',
            'description' => 'Date the photograph was taken (Y-m-d format)',
            'default'     => '',
        ),
    );

    foreach ( $meta_fields as $key => $args ) {
        register_post_meta(
            'photograph',
            $key,
            array(
                'show_in_rest'  => true,
                'single'        => true,
                'type'          => $args['type'],
                'description'   => $args['description'],
                'default'       => $args['default'],
                'auth_callback' => function() { return current_user_can( 'edit_posts' ); },
            )
        );
    }
}
add_action( 'init', 'sphotography_register_photograph_meta' );

// ============================================
// 4. Add Featured Image URLs to REST API
// ============================================
function sphotography_register_featured_image_rest_field() {
    register_rest_field(
        'photograph',
        'featured_image_src',
        array(
            'get_callback'    => 'sphotography_get_featured_image_src',
            'update_callback' => null,
            'schema'          => array(
                'description' => 'Featured image URLs in various sizes',
                'type'        => 'object',
                'properties'  => array(
                    'medium' => array( 'type' => 'string' ),
                    'full'   => array( 'type' => 'string' ),
                ),
            ),
        )
    );
}
add_action( 'rest_api_init', 'sphotography_register_featured_image_rest_field' );

function sphotography_get_featured_image_src( $object ) {
    $post_id = $object['id'];

    if ( ! has_post_thumbnail( $post_id ) ) {
        return array(
            'medium' => '',
            'full'   => '',
        );
    }

    $medium = wp_get_attachment_image_src(
        get_post_thumbnail_id( $post_id ),
        'medium'
    );

    $full = wp_get_attachment_image_src(
        get_post_thumbnail_id( $post_id ),
        'full'
    );

    return array(
        'medium' => $medium ? $medium[0] : '',
        'full'   => $full ? $full[0] : '',
    );
}

// ============================================
// 5. Increase REST API per_page limit to 500
// ============================================
function sphotography_increase_rest_per_page( $args, $request ) {
    $per_page = $request->get_param( 'per_page' );
    if ( $per_page !== null ) {
        $args['posts_per_page'] = min( (int) $per_page, 500 );
    } else {
        $args['posts_per_page'] = 500;
    }
    return $args;
}
add_filter( 'rest_photograph_query', 'sphotography_increase_rest_per_page', 10, 2 );

function sphotography_increase_rest_per_page_max( $query_params ) {
    if ( isset( $query_params['per_page'] ) ) {
        $query_params['per_page']['maximum'] = 500;
    }
    return $query_params;
}
add_filter( 'rest_photograph_collection_params', 'sphotography_increase_rest_per_page_max' );

// ============================================
// 6. Support region_tag filtering via REST API
// ============================================
function sphotography_rest_region_tag_filter( $args, $request ) {
    $region_tag = $request->get_param( 'region_tag' );

    if ( ! empty( $region_tag ) ) {
        $slugs = explode( ',', $region_tag );
        $slugs = array_map( 'sanitize_title', $slugs );
        $slugs = array_filter( $slugs );

        if ( ! empty( $slugs ) ) {
            $tax_query = array(
                array(
                    'taxonomy' => 'region_tag',
                    'field'    => 'slug',
                    'terms'    => $slugs,
                    'operator' => 'IN',
                ),
            );

            if ( isset( $args['tax_query'] ) && is_array( $args['tax_query'] ) ) {
                $args['tax_query'][] = $tax_query[0];
            } else {
                $args['tax_query'] = $tax_query;
            }
        }
    }

    return $args;
}
add_filter( 'rest_photograph_query', 'sphotography_rest_region_tag_filter', 20, 2 );

// ============================================
// 7. Load Frontend Assets
// ============================================
function sphotography_enqueue_scripts() {
    if ( ! is_page_template( 'template-map.php' ) ) {
        return;
    }

    wp_enqueue_style(
        'maplibre-gl',
        'https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css',
        array(),
        '4.0.0'
    );

    wp_enqueue_style(
        'google-fonts',
        'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap',
        array(),
        null
    );

    wp_enqueue_style(
        'sphotography-style',
        get_template_directory_uri() . '/style.css',
        array( 'maplibre-gl' ),
        SPHOTOGRAPHY_VERSION
    );

    wp_enqueue_script(
        'maplibre-gl',
        'https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js',
        array(),
        '4.0.0',
        true
    );

    wp_enqueue_script(
        'supercluster',
        'https://unpkg.com/supercluster@8/dist/supercluster.min.js',
        array(),
        '8.0.0',
        true
    );

    wp_enqueue_script(
        'sphotography-app',
        get_template_directory_uri() . '/assets/js/app.js',
        array( 'maplibre-gl', 'supercluster' ),
        SPHOTOGRAPHY_VERSION,
        true
    );

    wp_localize_script(
        'sphotography-app',
        'Sphotography',
        array(
            'restUrl'    => esc_url_raw( rest_url() ),
            'siteName'   => get_bloginfo( 'name' ),
            'restNonce'  => wp_create_nonce( 'wp_rest' ),
        )
    );
}
add_action( 'wp_enqueue_scripts', 'sphotography_enqueue_scripts' );

// ============================================
// 8. Theme Activation: Auto-create map page & set as front
// ============================================
function sphotography_theme_activation() {
    // Register post types and taxonomies first
    sphotography_register_photograph_cpt();
    sphotography_register_region_tag_taxonomy();

    // Flush rewrite rules
    flush_rewrite_rules();

    // Check if the map page already exists
    $map_page = get_page_by_path( 'photography-map', OBJECT, 'page' );

    if ( ! $map_page ) {
        // Create the map page
        $map_page_id = wp_insert_post( array(
            'post_title'     => __( 'Photography Map', 'sphotography' ),
            'post_name'      => 'photography-map',
            'post_content'   => '<!-- Sphotography fullscreen map page -->',
            'post_status'    => 'publish',
            'post_type'      => 'page',
            'page_template'  => 'template-map.php',
            'comment_status' => 'closed',
            'ping_status'    => 'closed',
        ) );

        if ( ! is_wp_error( $map_page_id ) && $map_page_id > 0 ) {
            // Set it as the static front page
            update_option( 'show_on_front', 'page' );
            update_option( 'page_on_front', $map_page_id );
        }
    } else {
        // Ensure the existing page uses the map template
        if ( get_page_template_slug( $map_page->ID ) !== 'template-map.php' ) {
            update_post_meta( $map_page->ID, '_wp_page_template', 'template-map.php' );
        }

        // Ensure it is set as front page
        if ( get_option( 'page_on_front' ) != $map_page->ID ) {
            update_option( 'show_on_front', 'page' );
            update_option( 'page_on_front', $map_page->ID );
        }
    }
}
add_action( 'after_switch_theme', 'sphotography_theme_activation' );

// ============================================
// 9. Register Admin Menu: 主题全局配置
// ============================================
function sphotography_register_admin_menu() {
    add_menu_page(
        __( '主题全局配置', 'sphotography' ),   // Page title
        __( '主题全局配置', 'sphotography' ),   // Menu title
        'manage_options',                       // Capability
        'sphotography-settings',                // Menu slug
        'sphotography_render_settings_page',    // Callback function (from theme-settings.php)
        'dashicons-admin-generic',              // Icon
        3                                       // Position (after Dashboard)
    );
}
add_action( 'admin_menu', 'sphotography_register_admin_menu' );

// Enqueue admin scripts for settings page
add_action( 'admin_enqueue_scripts', 'sphotography_admin_enqueue_settings' );

// ============================================
// 10. Remove admin bar margin for map template
// ============================================
function sphotography_remove_admin_bar_margin() {
    if ( is_page_template( 'template-map.php' ) ) {
        echo '<style>html{margin-top:0!important}* html body{margin-top:0!important}</style>';
    }
}
add_action( 'wp_head', 'sphotography_remove_admin_bar_margin' );

// ============================================
// 11. AJAX: Update theme from GitHub branch
// ============================================
function sphotography_ajax_do_update() {
    if ( ! wp_verify_nonce( $_POST['nonce'], 'sphotography_update_nonce' ) ) {
        wp_send_json_error( 'Security check failed' );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( 'Permission denied' );
    }

    $branch = sanitize_text_field( $_POST['branch'] );
    if ( empty( $branch ) ) {
        wp_send_json_error( 'No branch specified' );
    }

    $theme_dir = get_template_directory();
    $zip_url   = 'https://github.com/ShirazuNagisa/sphotography/archive/refs/heads/' . $branch . '.zip';
    $tmp_zip   = wp_tempnam( 'sphotography-update' );

    // Download ZIP
    $response = wp_remote_get( $zip_url, array( 'timeout' => 120, 'stream' => true, 'filename' => $tmp_zip ) );

    if ( is_wp_error( $response ) ) {
        unlink( $tmp_zip );
        wp_send_json_error( 'Download failed: ' . $response->get_error_message() );
    }

    $code = wp_remote_retrieve_response_code( $response );
    if ( $code !== 200 ) {
        unlink( $tmp_zip );
        wp_send_json_error( 'Download failed with HTTP code ' . $code );
    }

    // Unzip
    require_once ABSPATH . 'wp-admin/includes/file.php';
    WP_Filesystem();

    $unzip_dir = get_temp_dir() . 'sphotography-update-' . uniqid();
    $unzipped  = unzip_file( $tmp_zip, $unzip_dir );
    unlink( $tmp_zip );

    if ( is_wp_error( $unzipped ) ) {
        wp_send_json_error( 'Unzip failed: ' . $unzipped->get_error_message() );
    }

    // Find the extracted folder (contains branch name, e.g. sphotography-beta)
    $extracted = glob( $unzip_dir . '/sphotography-*' );
    if ( empty( $extracted ) || ! is_dir( $extracted[0] ) ) {
        // Cleanup
        sphotography_rrmdir( $unzip_dir );
        wp_send_json_error( 'Extracted folder not found' );
    }
    $src_dir = $extracted[0];

    // Copy all files from src to theme directory, overwriting
    $copied = copy_dir( $src_dir, $theme_dir );

    // Cleanup temp
    sphotography_rrmdir( $unzip_dir );

    if ( is_wp_error( $copied ) ) {
        wp_send_json_error( 'Copy failed: ' . $copied->get_error_message() );
    }

    wp_send_json_success( 'Theme updated from branch: ' . $branch );
}
add_action( 'wp_ajax_sphotography_do_update', 'sphotography_ajax_do_update' );

// Recursive rmdir helper
function sphotography_rrmdir( $dir ) {
    if ( ! is_dir( $dir ) ) return;
    $items = scandir( $dir );
    foreach ( $items as $item ) {
        if ( $item === '.' || $item === '..' ) continue;
        $path = $dir . '/' . $item;
        if ( is_dir( $path ) ) {
            sphotography_rrmdir( $path );
        } else {
            unlink( $path );
        }
    }
    rmdir( $dir );
}
