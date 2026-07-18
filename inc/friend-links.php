<?php
if (!defined('ABSPATH')) exit;
function sphotography_get_friend_links() { return get_option('sphotography_friend_links', array()); }
function sphotography_get_friend_link_applications() { return get_option('sphotography_friend_link_apps', array()); }
function sphotography_get_friend_link_notify() { return get_option('sphotography_friend_link_notify', '1'); }
function sphotography_update_friend_links($links) { update_option('sphotography_friend_links', $links); }
function sphotography_update_friend_link_applications($apps) { update_option('sphotography_friend_link_apps', $apps); }
function sphotography_register_friend_links_page() {
	$apps = sphotography_get_friend_link_applications();
	$pending_count = count($apps);
	$menu_title = __('友链', 'sphotography');
	if ($pending_count > 0) {
		$menu_title .= ' <span class="awaiting-mod count-' . esc_attr($pending_count) . '"><span class="pending-count">' . number_format_i18n($pending_count) . '</span></span>';
	}
	$GLOBALS['sp_fl_hook'] = add_submenu_page('sphotography-settings', __('友链管理', 'sphotography'), $menu_title, 'manage_options', 'sphotography-friend-links', 'sphotography_friend_links_page');
}
add_action('admin_menu', 'sphotography_register_friend_links_page');
// Schedule the async title + thumbnail fetch for one friend link.
function sphotography_schedule_friend_meta($id) {
	$id = (int) $id;
	if (!wp_next_scheduled('sphotography_fetch_friend_meta', array($id))) {
		wp_schedule_single_event(time() + 5, 'sphotography_fetch_friend_meta', array($id));
	}
}

// Load the media library picker on the friend-links admin page.
function sphotography_friend_links_admin_assets($hook) {
	if (!isset($GLOBALS['sp_fl_hook']) || $hook !== $GLOBALS['sp_fl_hook']) return;
	wp_enqueue_media();
}
add_action('admin_enqueue_scripts', 'sphotography_friend_links_admin_assets');

// Process a POST action on the friend-links page (all nonce-guarded).
function sphotography_friend_links_handle_post() {
	if (empty($_POST['sp_fl_action'])) return;
	if (!current_user_can('manage_options')) wp_die(esc_html__('权限不足。', 'sphotography'));
	check_admin_referer('sphotography_friend_links');
	$action = sanitize_key($_POST['sp_fl_action']);
	$links = sphotography_get_friend_links();
	$apps = sphotography_get_friend_link_applications();

	if ('add' === $action) {
		$url = esc_url_raw(wp_unslash($_POST['fl_url'] ?? ''));
		if ($url && preg_match('/^https?:\/\//', $url)) {
			$new_id = (!empty($links) ? max(array_column($links, 'id')) : 0) + 1;
			$links[] = array(
				'id'       => $new_id,
				'url'      => $url,
				'name'     => sanitize_text_field(wp_unslash($_POST['fl_name'] ?? '')),
				'thumb_id' => (int) ($_POST['fl_thumb_id'] ?? 0),
				'pinned'   => empty($_POST['fl_pinned']) ? 0 : 1,
				'added'    => time(),
			);
			sphotography_update_friend_links($links);
			sphotography_schedule_friend_meta($new_id);
		}
	} elseif ('delete' === $action) {
		$id = (int) ($_POST['fl_id'] ?? 0);
		$links = array_values(array_filter($links, function ($l) use ($id) { return (int) $l['id'] !== $id; }));
		sphotography_update_friend_links($links);
	} elseif ('toggle_pin' === $action) {
		$id = (int) ($_POST['fl_id'] ?? 0);
		foreach ($links as &$l) { if ((int) $l['id'] === $id) { $l['pinned'] = empty($l['pinned']) ? 1 : 0; } }
		unset($l);
		sphotography_update_friend_links($links);
	} elseif ('refetch' === $action) {
		$id = (int) ($_POST['fl_id'] ?? 0);
		foreach ($links as &$l) { if ((int) $l['id'] === $id) { $l['thumb_id'] = 0; } }
		unset($l);
		sphotography_update_friend_links($links);
		sphotography_schedule_friend_meta($id);
	} elseif ('approve_app' === $action) {
		$id = (int) ($_POST['app_id'] ?? 0);
		foreach ($apps as $app) {
			if ((int) $app['id'] === $id) {
				$new_id = (!empty($links) ? max(array_column($links, 'id')) : 0) + 1;
				$links[] = array('id' => $new_id, 'url' => $app['url'], 'name' => $app['name'], 'thumb_id' => 0, 'pinned' => 0, 'added' => time());
				sphotography_update_friend_links($links);
				sphotography_schedule_friend_meta($new_id);
				break;
			}
		}
		$apps = array_values(array_filter($apps, function ($a) use ($id) { return (int) $a['id'] !== $id; }));
		sphotography_update_friend_link_applications($apps);
	} elseif ('ignore_app' === $action) {
		$id = (int) ($_POST['app_id'] ?? 0);
		$apps = array_values(array_filter($apps, function ($a) use ($id) { return (int) $a['id'] !== $id; }));
		sphotography_update_friend_link_applications($apps);
	} elseif ('save_notify' === $action) {
		update_option('sphotography_friend_link_notify', empty($_POST['fl_notify']) ? '0' : '1');
	}
}

function sphotography_friend_links_page() {
	if (!current_user_can('manage_options')) wp_die(esc_html__('权限不足。', 'sphotography'));
	sphotography_friend_links_handle_post();

	$links = sphotography_get_friend_links();
	usort($links, function ($a, $b) {
		if ((int) $a['pinned'] !== (int) $b['pinned']) return (int) $b['pinned'] - (int) $a['pinned'];
		return (int) $a['added'] - (int) $b['added'];
	});
	$apps = sphotography_get_friend_link_applications();
	$notify = sphotography_get_friend_link_notify();
	?>
	<div class="wrap">
		<h1><?php esc_html_e('友链管理', 'sphotography'); ?></h1>

		<h2><?php esc_html_e('添加友链', 'sphotography'); ?></h2>
		<form method="post" action="">
			<?php wp_nonce_field('sphotography_friend_links'); ?>
			<input type="hidden" name="sp_fl_action" value="add">
			<input type="hidden" name="fl_thumb_id" id="fl_thumb_id" value="0">
			<table class="form-table">
				<tr><th><label for="fl_url"><?php esc_html_e('网址（必填）', 'sphotography'); ?></label></th>
					<td><input type="url" name="fl_url" id="fl_url" class="regular-text" placeholder="https://example.com" required></td></tr>
				<tr><th><label for="fl_name"><?php esc_html_e('站点名称', 'sphotography'); ?></label></th>
					<td><input type="text" name="fl_name" id="fl_name" class="regular-text" placeholder="<?php esc_attr_e('留空则自动获取网站标题', 'sphotography'); ?>"></td></tr>
				<tr><th><?php esc_html_e('缩略图', 'sphotography'); ?></th>
					<td>
						<img id="fl_thumb_preview" src="" style="max-width:180px;max-height:120px;display:none;border-radius:6px;margin-bottom:8px;">
						<p>
							<button type="button" class="button" id="fl_thumb_pick"><?php esc_html_e('选择图片', 'sphotography'); ?></button>
							<button type="button" class="button" id="fl_thumb_clear"><?php esc_html_e('移除', 'sphotography'); ?></button>
						</p>
						<p class="description"><?php esc_html_e('留空则在保存后自动抓取网站主页截图。', 'sphotography'); ?></p>
					</td></tr>
				<tr><th><?php esc_html_e('置顶', 'sphotography'); ?></th>
					<td><label><input type="checkbox" name="fl_pinned" value="1"> <?php esc_html_e('置顶显示在最前', 'sphotography'); ?></label></td></tr>
			</table>
			<?php submit_button(__('添加友链', 'sphotography')); ?>
		</form>

		<h2><?php esc_html_e('现有友链', 'sphotography'); ?></h2>
		<table class="widefat striped">
			<thead><tr>
				<th><?php esc_html_e('缩略图', 'sphotography'); ?></th>
				<th><?php esc_html_e('名称', 'sphotography'); ?></th>
				<th><?php esc_html_e('网址', 'sphotography'); ?></th>
				<th><?php esc_html_e('操作', 'sphotography'); ?></th>
			</tr></thead>
			<tbody>
			<?php if (empty($links)) : ?>
				<tr><td colspan="4"><?php esc_html_e('还没有友链。', 'sphotography'); ?></td></tr>
			<?php else : foreach ($links as $l) :
				$thumb = $l['thumb_id'] ? wp_get_attachment_image_src($l['thumb_id'], 'thumbnail') : false; ?>
				<tr>
					<td><?php if ($thumb) : ?><img src="<?php echo esc_url($thumb[0]); ?>" style="width:60px;height:45px;object-fit:cover;border-radius:4px;"><?php else : ?>—<?php endif; ?></td>
					<td><?php echo esc_html($l['name'] ? $l['name'] : '（待抓取）'); ?><?php echo !empty($l['pinned']) ? ' <span class="dashicons dashicons-sticky" title="置顶"></span>' : ''; ?></td>
					<td><a href="<?php echo esc_url($l['url']); ?>" target="_blank" rel="noopener"><?php echo esc_html($l['url']); ?></a></td>
					<td>
						<form method="post" action="" style="display:inline"><?php wp_nonce_field('sphotography_friend_links'); ?><input type="hidden" name="sp_fl_action" value="toggle_pin"><input type="hidden" name="fl_id" value="<?php echo (int) $l['id']; ?>"><button class="button button-small"><?php echo !empty($l['pinned']) ? esc_html__('取消置顶', 'sphotography') : esc_html__('置顶', 'sphotography'); ?></button></form>
						<form method="post" action="" style="display:inline"><?php wp_nonce_field('sphotography_friend_links'); ?><input type="hidden" name="sp_fl_action" value="refetch"><input type="hidden" name="fl_id" value="<?php echo (int) $l['id']; ?>"><button class="button button-small"><?php esc_html_e('重新获取缩略图', 'sphotography'); ?></button></form>
						<form method="post" action="" style="display:inline" onsubmit="return confirm('确定删除此友链？');"><?php wp_nonce_field('sphotography_friend_links'); ?><input type="hidden" name="sp_fl_action" value="delete"><input type="hidden" name="fl_id" value="<?php echo (int) $l['id']; ?>"><button class="button button-small button-link-delete"><?php esc_html_e('删除', 'sphotography'); ?></button></form>
					</td>
				</tr>
			<?php endforeach; endif; ?>
			</tbody>
		</table>

		<h2><?php esc_html_e('待处理申请', 'sphotography'); ?> <?php echo !empty($apps) ? '<span class="awaiting-mod count-' . count($apps) . '"><span class="pending-count">' . number_format_i18n(count($apps)) . '</span></span>' : ''; ?></h2>
		<table class="widefat striped">
			<thead><tr>
				<th><?php esc_html_e('站点', 'sphotography'); ?></th>
				<th><?php esc_html_e('网址', 'sphotography'); ?></th>
				<th><?php esc_html_e('邮箱', 'sphotography'); ?></th>
				<th><?php esc_html_e('留言', 'sphotography'); ?></th>
				<th><?php esc_html_e('操作', 'sphotography'); ?></th>
			</tr></thead>
			<tbody>
			<?php if (empty($apps)) : ?>
				<tr><td colspan="5"><?php esc_html_e('暂无待处理申请。', 'sphotography'); ?></td></tr>
			<?php else : foreach ($apps as $a) : ?>
				<tr>
					<td><?php echo esc_html($a['name']); ?></td>
					<td><a href="<?php echo esc_url($a['url']); ?>" target="_blank" rel="noopener"><?php echo esc_html($a['url']); ?></a></td>
					<td><?php echo esc_html($a['email']); ?></td>
					<td><?php echo esc_html($a['message']); ?></td>
					<td>
						<form method="post" action="" style="display:inline"><?php wp_nonce_field('sphotography_friend_links'); ?><input type="hidden" name="sp_fl_action" value="approve_app"><input type="hidden" name="app_id" value="<?php echo (int) $a['id']; ?>"><button class="button button-primary button-small"><?php esc_html_e('通过', 'sphotography'); ?></button></form>
						<form method="post" action="" style="display:inline"><?php wp_nonce_field('sphotography_friend_links'); ?><input type="hidden" name="sp_fl_action" value="ignore_app"><input type="hidden" name="app_id" value="<?php echo (int) $a['id']; ?>"><button class="button button-small"><?php esc_html_e('忽略', 'sphotography'); ?></button></form>
					</td>
				</tr>
			<?php endforeach; endif; ?>
			</tbody>
		</table>

		<h2><?php esc_html_e('通知设置', 'sphotography'); ?></h2>
		<form method="post" action="">
			<?php wp_nonce_field('sphotography_friend_links'); ?>
			<input type="hidden" name="sp_fl_action" value="save_notify">
			<label><input type="checkbox" name="fl_notify" value="1" <?php checked($notify, '1'); ?>> <?php esc_html_e('收到新友链申请时通过邮件通知管理员', 'sphotography'); ?></label>
			<?php submit_button(__('保存', 'sphotography')); ?>
		</form>
	</div>
	<script>
	(function(){
		var pick=document.getElementById('fl_thumb_pick'),clear=document.getElementById('fl_thumb_clear'),idEl=document.getElementById('fl_thumb_id'),prev=document.getElementById('fl_thumb_preview'),frame;
		if(pick){pick.addEventListener('click',function(e){e.preventDefault();if(frame){frame.open();return;}frame=wp.media({title:'选择缩略图',multiple:false});frame.on('select',function(){var a=frame.state().get('selection').first().toJSON();idEl.value=a.id;prev.src=a.url;prev.style.display='block';});frame.open();});}
		if(clear){clear.addEventListener('click',function(e){e.preventDefault();idEl.value='0';prev.src='';prev.style.display='none';});}
	})();
	</script>
	<?php
}
function sphotography_friend_links_admin_notice() {
	if (!current_user_can('manage_options')) return;
	$screen = get_current_screen();
	if ($screen && isset($GLOBALS['sp_fl_hook']) && $screen->id === $GLOBALS['sp_fl_hook']) return;
	$apps = sphotography_get_friend_link_applications();
	if (empty($apps)) return;
	$count = count($apps);
	$url = admin_url('admin.php?page=sphotography-friend-links');
	echo '<div class="notice notice-info is-dismissible"><p>';
	printf(__('你有 %d 条<a href="%s">友链申请</a>待处理。', 'sphotography'), number_format_i18n($count), esc_url($url));
	echo '</p></div>';
}
add_action('admin_notices', 'sphotography_friend_links_admin_notice');
function sphotography_register_friend_links_routes() {
	$ns = 'sphotography/v1';
	register_rest_route($ns, '/friend-links', array('methods' => WP_REST_Server::READABLE, 'callback' => 'sphotography_rest_list_friend_links', 'permission_callback' => '__return_true'));
	register_rest_route($ns, '/friend-links/apply', array('methods' => WP_REST_Server::CREATABLE, 'callback' => 'sphotography_rest_apply_friend_link', 'permission_callback' => '__return_true'));
}
add_action('rest_api_init', 'sphotography_register_friend_links_routes');
function sphotography_rest_list_friend_links($request) {
	$links = sphotography_get_friend_links();
	usort($links, function ($a, $b) {
		if ((int) $a['pinned'] !== (int) $b['pinned']) return (int) $b['pinned'] - (int) $a['pinned'];
		return (int) $a['added'] - (int) $b['added'];
	});
	$items = array();
	foreach ($links as $link) {
		if (empty($link['url'])) continue;
		$thumb_url = '';
		if ($link['thumb_id']) {
			$src = wp_get_attachment_image_src($link['thumb_id'], 'full');
			if ($src) $thumb_url = $src[0];
		}
		$items[] = array('name' => $link['name'] ? (string) $link['name'] : '', 'url' => (string) $link['url'], 'thumb' => $thumb_url);
	}
	return new WP_REST_Response(array('items' => $items), 200);
}
function sphotography_rest_apply_friend_link($request) {
	$email = sanitize_email(wp_unslash($request->get_param('email') ?? ''));
	$url = esc_url_raw(wp_unslash($request->get_param('url') ?? ''));
	$name = sanitize_text_field(wp_unslash($request->get_param('name') ?? ''));
	$message = wp_kses(wp_unslash($request->get_param('message') ?? ''), array());
	if (!is_email($email)) return new WP_Error('sp_fl_invalid_email', __('邮箱格式不正确。', 'sphotography'), array('status' => 400));
	if (!$url || !preg_match('/^https?:\/\//', $url)) return new WP_Error('sp_fl_invalid_url', __('网址格式不正确。', 'sphotography'), array('status' => 400));
	if (!$name) return new WP_Error('sp_fl_no_name', __('请填写站点名称。', 'sphotography'), array('status' => 400));
	$message = substr($message, 0, 500);
	$apps = sphotography_get_friend_link_applications();
	if (count($apps) > 200) $apps = array_slice($apps, -199);
	$new_id = (!empty($apps) ? max(array_column($apps, 'id')) : 0) + 1;
	$apps[] = array('id' => $new_id, 'email' => $email, 'url' => $url, 'name' => $name, 'message' => $message, 'time' => time());
	sphotography_update_friend_link_applications($apps);
	if ('1' === sphotography_get_friend_link_notify()) {
		$admin_email = get_option('admin_email');
		$subject = '【友链申请】' . $name;
		$body = sprintf(__('网站名：%s\n网址：%s\n邮箱：%s\n备注：%s', 'sphotography'), $name, $url, $email, $message);
		wp_mail($admin_email, $subject, $body);
	}
	return new WP_REST_Response(array('ok' => true), 200);
}
function sphotography_friend_links_config() { return array('applyEnabled' => true); }
function sphotography_fetch_friend_meta_handler($link_id) {
	$links = sphotography_get_friend_links();
	$link = null;
	foreach ($links as &$l) {
		if ((int) $l['id'] === (int) $link_id) { $link = &$l; break; }
	}
	if (!$link) return;
	if (empty($link['name'])) {
		$response = wp_remote_get($link['url'], array('timeout' => 10));
		if (!is_wp_error($response)) {
			$body = wp_remote_retrieve_body($response);
			if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $body, $m)) {
				$link['name'] = sanitize_text_field($m[1]);
			}
		}
	}
	if (!$link['thumb_id']) {
		$mshots_url = 'https://s.wordpress.com/mshots/v1/' . rawurlencode($link['url']) . '?w=600&h=400';
		$response = wp_remote_get($mshots_url, array('timeout' => 20));
		$saved = false;
		if (!is_wp_error($response) && 200 === (int) wp_remote_retrieve_response_code($response)) {
			$body = wp_remote_retrieve_body($response);
			// mShots serves a tiny "generating" placeholder until the shot is
			// ready; gauge readiness by actual byte length (headers may omit
			// content-length) and retry a few times before giving up.
			if (strlen($body) > 8000) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				require_once ABSPATH . 'wp-admin/includes/image.php';
				require_once ABSPATH . 'wp-admin/includes/media.php';
				$upload = wp_upload_bits('mshots-' . md5($link['url']) . '.jpg', null, $body);
				if (empty($upload['error'])) {
					$attachment = array('post_mime_type' => 'image/jpeg', 'post_title' => preg_replace('/\.[^.]+$/', '', basename($upload['file'])), 'post_content' => '', 'post_status' => 'inherit');
					$attach_id = wp_insert_attachment($attachment, $upload['file']);
					if (!is_wp_error($attach_id)) {
						$meta = wp_generate_attachment_metadata($attach_id, $upload['file']);
						wp_update_attachment_metadata($attach_id, $meta);
						$link['thumb_id'] = $attach_id;
						$saved = true;
					}
				}
			}
		}
		if (!$saved) {
			// Still generating / transient failure — retry up to 4 times, ~25s apart.
			$attempts = isset($link['thumb_attempts']) ? (int) $link['thumb_attempts'] : 0;
			if ($attempts < 4) {
				$link['thumb_attempts'] = $attempts + 1;
				wp_schedule_single_event(time() + 25, 'sphotography_fetch_friend_meta', array((int) $link_id));
			}
		}
	}
	sphotography_update_friend_links($links);
}
add_action('sphotography_fetch_friend_meta', 'sphotography_fetch_friend_meta_handler');
