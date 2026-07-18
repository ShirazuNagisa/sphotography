<?php
/**
 * Sphotography — Guestbook (v1.3.7).
 *
 * A dedicated guestbook (留言板) backend that reuses the comment engine.
 * Messages are stored as comments on a hidden holder post. Exposes a
 * REST endpoint /sphotography/v1/guestbook for random or paginated display,
 * with pinned-float, sort, and pagination support. Write endpoints
 * (create/like/edit/pin) delegate to the existing comment endpoints via
 * the holder post ID.
 *
 * @package Sphotography
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ============================================================================
// Holder post management
// ============================================================================

/**
 * Get or create the guestbook holder post.
 * Returns the post ID. If the post no longer exists, recreates it.
 *
 * @return int
 */
function sphotography_guestbook_post_id() {
	$post_id = (int) get_option( 'sphotography_guestbook_post' );

	// If we have a stored ID, verify it still exists.
	if ( $post_id > 0 ) {
		$post = get_post( $post_id );
		if ( $post && 'post' === $post->post_type ) {
			return $post_id;
		}
	}

	// Create the holder post.
	$new_post_id = wp_insert_post( array(
		'post_title'      => '留言板',
		'post_name'       => 'sphotography-guestbook',
		'post_status'     => 'private',
		'post_type'       => 'post',
		'comment_status'  => 'open',
		'ping_status'     => 'closed',
		'post_content'    => '',
	) );

	if ( is_wp_error( $new_post_id ) ) {
		return 0;
	}

	update_option( 'sphotography_guestbook_post', (int) $new_post_id );
	return (int) $new_post_id;
}

/**
 * Exclude the guestbook holder post from normal public queries (frontpage, etc).
 * Private posts are already hidden from anonymous users; this guards
 * against logged-in admins browsing the front end seeing it.
 */
function sphotography_exclude_guestbook_from_queries( $query ) {
	if ( ! is_admin() && $query->is_main_query() ) {
		$post_id = (int) get_option( 'sphotography_guestbook_post' );
		if ( $post_id > 0 ) {
			$query->set( 'post__not_in', array_merge(
				(array) $query->get( 'post__not_in' ),
				array( $post_id )
			) );
		}
	}
}
add_action( 'pre_get_posts', 'sphotography_exclude_guestbook_from_queries' );

// ============================================================================
// Guestbook settings
// ============================================================================

/**
 * Get the guestbook configuration: post ID and random display count.
 *
 * @return array
 */
function sphotography_guestbook_config() {
	return array(
		'postId'      => sphotography_guestbook_post_id(),
		'randomCount' => (int) sphotography_guestbook_random_count(),
	);
}

/**
 * Get the random display count setting (default 8, range 1-30).
 *
 * @return int
 */
function sphotography_guestbook_random_count() {
	$value = (int) get_option( 'sphotography_guestbook_random', 8 );
	return min( max( $value, 1 ), 30 );
}

/**
 * Register the guestbook settings admin submenu and save handler.
 * REMOVED: submenu registration moved to main settings (see admin/theme-settings.php render function)
 */
function sphotography_register_guestbook_admin() {
	add_action( 'admin_post_sphotography_save_guestbook', 'sphotography_handle_guestbook_save' );
}
add_action( 'admin_menu', 'sphotography_register_guestbook_admin' );

/**
 * Render the guestbook settings board for the settings page.
 * Returns markup (called from sphotography_render_settings_page in admin/theme-settings.php).
 */
function sphotography_render_guestbook_board() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return '';
	}

	$random_count = sphotography_guestbook_random_count();

	ob_start();
	?>
	<!-- Guestbook Settings Board (folded into social category) -->
	<div class="sphotography-module" id="sp-mod-guestbook">
		<div class="sphotography-module-header">
			<span class="sphotography-module-icon dashicons dashicons-testimonial"></span>
			<h3><?php _e( '留言板设置', 'sphotography' ); ?></h3>
		</div>
		<div class="sphotography-module-body">
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="sphotography_save_guestbook">
				<?php wp_nonce_field( 'sphotography_save_guestbook', 'sphotography_guestbook_nonce' ); ?>

				<div class="sphotography-field">
					<label class="sphotography-label" for="sphotography-guestbook-random"><?php _e( '随机展示条数', 'sphotography' ); ?></label>
					<input type="number"
						id="sphotography-guestbook-random"
						name="sphotography_guestbook_random"
						value="<?php echo esc_attr( $random_count ); ?>"
						min="1" max="30" step="1">
					<p class="sphotography-desc"><?php _e( '随机模式下展示的留言条数，范围 1-30。默认 8。', 'sphotography' ); ?></p>
				</div>

				<?php submit_button( __( '保存', 'sphotography' ), 'primary', 'submit', false ); ?>
			</form>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

/**
 * Render the guestbook settings admin page (legacy, no longer used but kept for compatibility).
 */
function sphotography_render_guestbook_admin() {
	// Legacy function - settings now folded into main settings page
	wp_safe_redirect( admin_url( 'admin.php?page=sphotography-settings#sp-cat-social' ) );
	exit;
}

/**
 * Handle guestbook settings save - redirects to main settings page.
 */
function sphotography_handle_guestbook_save() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( '权限不足。', 'sphotography' ) );
	}

	if ( ! isset( $_POST['sphotography_guestbook_nonce'] ) ||
		 ! wp_verify_nonce( $_POST['sphotography_guestbook_nonce'], 'sphotography_save_guestbook' ) ) {
		wp_die( esc_html__( '安全验证失败。', 'sphotography' ) );
	}

	$random_count = (int) $_POST['sphotography_guestbook_random'];
	$random_count = min( max( $random_count, 1 ), 30 );
	update_option( 'sphotography_guestbook_random', $random_count );

	wp_redirect( add_query_arg( 'page', 'sphotography-settings', admin_url( 'admin.php' ) ) . '#sp-cat-social' );
	exit;
}

// ============================================================================
// REST endpoint
// ============================================================================

/**
 * Register the guestbook REST route.
 */
function sphotography_register_guestbook_route() {
	register_rest_route( 'sphotography/v1', '/guestbook', array(
		'methods'             => WP_REST_Server::READABLE,
		'callback'            => 'sphotography_rest_guestbook',
		'permission_callback' => '__return_true',
	) );
}
add_action( 'rest_api_init', 'sphotography_register_guestbook_route' );

/**
 * GET /sphotography/v1/guestbook
 *
 * Params:
 *   - mode: 'random' | 'all' (default: 'random')
 *   - page: int (default: 1)
 *   - sort: 'time' | 'likes' (default: 'time')
 *   - order: 'asc' | 'desc' (default: 'asc')
 *
 * Response:
 *   {
 *     "items": [ { comment nodes with children } ],
 *     "page": int,
 *     "per_page": int,
 *     "total": int (count of visible top-level comments),
 *     "has_more": bool,
 *     "mode": "random" | "all"
 *   }
 */
function sphotography_rest_guestbook( WP_REST_Request $request ) {
	$post_id = sphotography_guestbook_post_id();
	if ( ! $post_id ) {
		return new WP_Error( 'sp_gb_no_post', __( '留言板不存在。', 'sphotography' ), array( 'status' => 500 ) );
	}

	$mode  = $request->get_param( 'mode' );
	$page  = max( 1, (int) $request->get_param( 'page' ) );
	$sort  = $request->get_param( 'sort' );
	$order = $request->get_param( 'order' );

	$mode  = ( 'all' === $mode ) ? 'all' : 'random';
	$sort  = ( 'likes' === $sort ) ? 'likes' : 'time';
	$order = ( 'desc' === $order ) ? 'desc' : 'asc';

	$per = SPHOTOGRAPHY_COMMENTS_PER_PAGE;

	// Fetch all approved top-level comments on the guestbook post.
	$tops = get_comments( array(
		'post_id' => $post_id,
		'parent'  => 0,
		'status'  => 'approve',
		'type'    => 'comment',
		'orderby' => 'comment_date_gmt',
		'order'   => 'ASC',
	) );

	// Filter visible (respecting private threads).
	$visible = array();
	foreach ( $tops as $c ) {
		if ( sphotography_comment_visible( $c ) ) {
			$visible[] = $c;
		}
	}

	// Split pinned vs normal. Pinned float to top, newest pin first.
	$pin_enabled  = sphotography_comment_setting( 'comment_pin_enabled' );
	$pinned_pairs = array();
	$normal       = array();
	foreach ( $visible as $c ) {
		$pin_time = $pin_enabled ? (int) get_comment_meta( $c->comment_ID, '_sp_pinned', true ) : 0;
		if ( $pin_time ) {
			$pinned_pairs[] = array( 'time' => $pin_time, 'comment' => $c );
		} else {
			$normal[] = $c;
		}
	}
	usort( $pinned_pairs, function ( $a, $b ) {
		return $b['time'] - $a['time'];
	} );
	$pinned = array();
	foreach ( $pinned_pairs as $pair ) {
		$pinned[] = $pair['comment'];
	}

	// Apply sorting to normal (non-pinned) list.
	if ( 'likes' === $sort ) {
		usort( $normal, function ( $a, $b ) {
			$la = (int) get_comment_meta( $a->comment_ID, '_sp_likes', true );
			$lb = (int) get_comment_meta( $b->comment_ID, '_sp_likes', true );
			if ( $la !== $lb ) {
				return $lb - $la; // more likes first
			}
			// Tie-break: newer comment first.
			return strcmp( $b->comment_date_gmt, $a->comment_date_gmt );
		} );
	} elseif ( 'desc' === $order ) {
		$normal = array_reverse( $normal );
	}

	// Determine which comments to return.
	if ( 'random' === $mode ) {
		// Random mode: shuffle normal list, take N, prepend pinned.
		$random_count = (int) sphotography_guestbook_random_count();
		shuffle( $normal );
		$normal_slice = array_slice( $normal, 0, $random_count );
		$slice = array_merge( $pinned, $normal_slice );
		$has_more = false;
	} else {
		// All mode: paginate, pinned first on page 1.
		if ( 1 === $page ) {
			$slice = array_merge( $pinned, array_slice( $normal, 0, $per ) );
			$has_more = count( $normal ) > $per;
		} else {
			$offset = ( $page - 1 ) * $per;
			$slice = array_slice( $normal, $offset, $per );
			$has_more = count( $normal ) > ( $offset + $per );
		}
	}

	// Prepare items with children (reuse comment system's structure).
	$items = array();
	foreach ( $slice as $c ) {
		$node = sphotography_prepare_comment( $c );
		$children = get_comments( array(
			'post_id' => $post_id,
			'parent'  => (int) $c->comment_ID,
			'status'  => 'approve',
			'type'    => 'comment',
			'orderby' => 'comment_date_gmt',
			'order'   => 'ASC',
		) );
		$node['children'] = array();
		foreach ( $children as $child ) {
			$node['children'][] = sphotography_prepare_comment( $child );
		}
		$items[] = $node;
	}

	return new WP_REST_Response( array(
		'items'    => $items,
		'page'     => $page,
		'per_page' => $per,
		'total'    => count( $visible ),
		'has_more' => $has_more,
		'mode'     => $mode,
	), 200 );
}
