<?php
/**
 * Sphotography — Post metrics (v1.3.5)
 *
 * Two lightweight per-post numbers surfaced on the frontend:
 *   • 阅读量 (view count) — stored in post meta `_sp_views`, incremented by a
 *     small REST endpoint the article panel calls when an article is opened.
 *     De-duplication (per browser / per post / once a day) is handled on the
 *     client via localStorage; the endpoint just does the atomic +1. Gated by
 *     the `view_counter` setting (default on): when off, no counting happens
 *     and the number is hidden everywhere on the frontend.
 *   • 字数 (word count) — computed from the post body with the same CJK-aware
 *     rule the frontend uses for the reading estimate, so the sidebar cards can
 *     show it without shipping the full content down with the posts list.
 *
 * Both are exposed as REST fields (`sp_views`, `sp_word_count`) so the article
 * panel and the sidebar list — which fetch posts through wp/v2/posts — get them
 * for free, and they are also mirrored into the inline-data path.
 *
 * @package Sphotography
 * @version 1.3.5
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SPHOTOGRAPHY_VIEWS_META = '_sp_views';

/**
 * Whether the view counter is enabled (setting, default on).
 *
 * @return bool
 */
function sphotography_views_enabled() {
	return (bool) sphotography_get_mod( 'view_counter' );
}

/**
 * Current view count for a post.
 *
 * @param int $post_id
 * @return int
 */
function sphotography_get_views( $post_id ) {
	return (int) get_post_meta( (int) $post_id, SPHOTOGRAPHY_VIEWS_META, true );
}

/**
 * Word count for a post body, CJK-aware and mirroring the frontend rule in
 * assets/js/app.js (CJK characters counted individually; runs of Latin
 * letters/digits counted as words). Shortcodes and HTML are stripped so only
 * visible text feeds the count.
 *
 * @param int $post_id
 * @return int
 */
function sphotography_post_word_count( $post_id ) {
	$post = get_post( (int) $post_id );
	if ( ! $post ) {
		return 0;
	}
	$text = (string) $post->post_content;
	$text = strip_shortcodes( $text );
	// Drop block comments and tags so only readable text remains.
	$text = preg_replace( '/<!--.*?-->/s', ' ', $text );
	$text = wp_strip_all_tags( $text );
	$text = html_entity_decode( $text, ENT_QUOTES, 'UTF-8' );
	if ( '' === trim( $text ) ) {
		return 0;
	}

	// CJK ranges kept in sync with SP_CJK_RE in app.js.
	$cjk_pattern = '/[\x{3400}-\x{9FFF}\x{F900}-\x{FAFF}\x{3040}-\x{30FF}\x{AC00}-\x{D7AF}]/u';
	$cjk = preg_match_all( $cjk_pattern, $text, $m );
	$cjk = $cjk ? (int) $cjk : 0;

	$latin_text = preg_replace( $cjk_pattern, ' ', $text );
	$latin = preg_match_all( "/[A-Za-z0-9]+(?:['’\\-][A-Za-z0-9]+)*/u", $latin_text, $lm );
	$latin = $latin ? (int) $latin : 0;

	return $cjk + $latin;
}

// ============================================================================
// REST fields on posts (auto-included in wp/v2/posts and single-post fetches).
// ============================================================================
function sphotography_metrics_register_rest_fields() {
	register_rest_field( 'post', 'sp_views', array(
		'get_callback' => function ( $arr ) {
			return sphotography_get_views( (int) $arr['id'] );
		},
		'schema'       => array(
			'description' => 'Sphotography article view count.',
			'type'        => 'integer',
		),
	) );

	register_rest_field( 'post', 'sp_word_count', array(
		'get_callback' => function ( $arr ) {
			return sphotography_post_word_count( (int) $arr['id'] );
		},
		'schema'       => array(
			'description' => 'Sphotography article word count.',
			'type'        => 'integer',
		),
	) );
}
add_action( 'rest_api_init', 'sphotography_metrics_register_rest_fields' );

// ============================================================================
// View-count increment endpoint: POST sphotography/v1/view/<id>
//
// Returns the (possibly incremented) count. De-dup is a client concern; the
// endpoint simply adds 1 unless the feature is disabled, in which case it
// returns the stored value untouched.
// ============================================================================
function sphotography_metrics_register_routes() {
	register_rest_route( 'sphotography/v1', '/view/(?P<id>\d+)', array(
		'methods'             => WP_REST_Server::CREATABLE,
		'callback'            => 'sphotography_rest_increment_view',
		'permission_callback' => '__return_true',
		'args'                => array(
			'id' => array(
				'validate_callback' => function ( $param ) {
					return is_numeric( $param );
				},
			),
		),
	) );
}
add_action( 'rest_api_init', 'sphotography_metrics_register_routes' );

/**
 * Increment (or just read, when disabled) a post's view count.
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function sphotography_rest_increment_view( $request ) {
	$post_id = (int) $request['id'];
	$post    = get_post( $post_id );
	if ( ! $post || 'post' !== $post->post_type || 'publish' !== $post->post_status ) {
		return new WP_Error( 'sp_not_found', 'Post not found.', array( 'status' => 404 ) );
	}

	if ( ! sphotography_views_enabled() ) {
		return rest_ensure_response( array(
			'views'   => sphotography_get_views( $post_id ),
			'counted' => false,
		) );
	}

	$views = sphotography_get_views( $post_id ) + 1;
	update_post_meta( $post_id, SPHOTOGRAPHY_VIEWS_META, $views );

	return rest_ensure_response( array(
		'views'   => $views,
		'counted' => true,
	) );
}
