<?php
/**
 * v1.4.3: 前台多语言（中/英/日）动态内容翻译。
 *
 * 设计要点（详见 grilling 决策）：
 *  - 中文为站点原生语言，不翻译；仅 en / ja 需要调用文本模型翻译「动态正文内容」
 *    （文章标题+正文、AI 概述、评论正文、留言、照片墙文案）。
 *  - UI 界面文案在前端用静态词典翻译，不经过本接口。
 *  - 服务端缓存：每段文本按 hash(text)+目标语言 缓存为 transient，
 *    每段内容每种语言仅调用一次模型，之后复用；正文被编辑后 hash 变化即自动失效。
 *  - 名字、签名、地名、EXIF 等由前端决定「不发送」，故本接口天然不会碰它们。
 *  - 仅在 AI 功能开启时可用（前端也会据此隐藏语言切换控件）。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'SPHOTOGRAPHY_I18N_CACHE_TTL' ) ) {
	// 译文缓存有效期：一周。源文本变化会生成新 key，旧 key 自然过期。
	define( 'SPHOTOGRAPHY_I18N_CACHE_TTL', WEEK_IN_SECONDS );
}
if ( ! defined( 'SPHOTOGRAPHY_I18N_MAX_SEGMENTS' ) ) {
	define( 'SPHOTOGRAPHY_I18N_MAX_SEGMENTS', 40 );   // 单次请求最多翻译的段数
}
if ( ! defined( 'SPHOTOGRAPHY_I18N_MAX_CHARS' ) ) {
	define( 'SPHOTOGRAPHY_I18N_MAX_CHARS', 12000 );   // 单段最大字符数（超出截断保护）
}

/** 支持的目标语种 → 提示词里用的语言名。中文是原生语言，不在此列。 */
function sphotography_i18n_target_langs() {
	return array(
		'en' => 'English',
		'ja' => 'Japanese (日本語)',
	);
}

/** 计算某段文本在某语言下的缓存 key。 */
function sphotography_i18n_cache_key( $lang, $format, $text ) {
	return 'sp_i18n_' . $lang . '_' . md5( $format . '|' . $text );
}

/**
 * 注册 REST 路由： POST sphotography/v1/translate
 * body: { lang: 'en'|'ja', segments: [ { id, text, format? }, ... ] }
 * 返回: { lang, segments: { id: translated, ... } }
 */
function sphotography_i18n_register_routes() {
	register_rest_route( 'sphotography/v1', '/translate', array(
		'methods'             => WP_REST_Server::CREATABLE,
		'callback'            => 'sphotography_i18n_rest_translate',
		'permission_callback' => '__return_true', // 公开读取译文；下方按 AI 开关 + 缓存 + 长度上限约束成本
	) );
}
add_action( 'rest_api_init', 'sphotography_i18n_register_routes' );

/**
 * REST 回调：批量翻译请求。先查缓存，未命中的段落再合并成一次模型调用；
 * 若模型返回无法解析为 JSON，退化为逐段调用，最大程度保证可用。
 */
function sphotography_i18n_rest_translate( WP_REST_Request $request ) {
	if ( ! function_exists( 'sphotography_ai_is_enabled' ) || ! sphotography_ai_is_enabled() ) {
		return new WP_Error( 'ai_disabled', __( 'AI 功能未启用。', 'sphotography' ), array( 'status' => 403 ) );
	}

	$lang = (string) $request->get_param( 'lang' );
	$targets = sphotography_i18n_target_langs();
	if ( ! isset( $targets[ $lang ] ) ) {
		return new WP_Error( 'bad_lang', __( '不支持的目标语言。', 'sphotography' ), array( 'status' => 400 ) );
	}

	$segments = $request->get_param( 'segments' );
	if ( ! is_array( $segments ) || empty( $segments ) ) {
		return new WP_Error( 'no_segments', __( '缺少待翻译内容。', 'sphotography' ), array( 'status' => 400 ) );
	}
	if ( count( $segments ) > SPHOTOGRAPHY_I18N_MAX_SEGMENTS ) {
		$segments = array_slice( $segments, 0, SPHOTOGRAPHY_I18N_MAX_SEGMENTS );
	}

	$result   = array();   // id => translated text
	$todo     = array();   // 未命中缓存、需要送模型的段： id => array( text, format, key )

	foreach ( $segments as $seg ) {
		if ( ! is_array( $seg ) || ! isset( $seg['id'] ) || ! isset( $seg['text'] ) ) {
			continue;
		}
		$id     = (string) $seg['id'];
		$text   = (string) $seg['text'];
		$format = ( isset( $seg['format'] ) && 'html' === $seg['format'] ) ? 'html' : 'text';

		if ( '' === trim( $text ) ) {
			$result[ $id ] = $text; // 空白直接原样返回
			continue;
		}
		if ( mb_strlen( $text ) > SPHOTOGRAPHY_I18N_MAX_CHARS ) {
			$text = mb_substr( $text, 0, SPHOTOGRAPHY_I18N_MAX_CHARS );
		}

		$key    = sphotography_i18n_cache_key( $lang, $format, $text );
		$cached = get_transient( $key );
		if ( false !== $cached ) {
			$result[ $id ] = $cached;
			continue;
		}
		$todo[ $id ] = array( 'text' => $text, 'format' => $format, 'key' => $key );
	}

	if ( ! empty( $todo ) ) {
		$translated = sphotography_i18n_translate_batch( $todo, $lang, $targets[ $lang ] );
		foreach ( $todo as $id => $info ) {
			if ( isset( $translated[ $id ] ) && '' !== trim( (string) $translated[ $id ] ) ) {
				$out = (string) $translated[ $id ];
				set_transient( $info['key'], $out, SPHOTOGRAPHY_I18N_CACHE_TTL );
				$result[ $id ] = $out;
			} else {
				// 翻译失败：回退原文（前端也会据此淡入原文）。不缓存失败结果。
				$result[ $id ] = $info['text'];
			}
		}
	}

	return rest_ensure_response( array(
		'lang'     => $lang,
		'segments' => $result,
	) );
}

/**
 * 将多段文本合并为一次模型调用（JSON 进 / JSON 出）。解析失败时逐段重试。
 * 返回 id => 译文。仅包含成功翻译的项。
 */
function sphotography_i18n_translate_batch( $todo, $lang, $lang_name ) {
	$items = array();
	foreach ( $todo as $id => $info ) {
		$items[] = array( 'id' => $id, 'text' => $info['text'] );
	}

	$system = sprintf(
		'You are a professional translator. Translate every item in the user-provided JSON array into %s. '
		. 'Rules: (1) Preserve meaning, tone and register. (2) Some items contain HTML or Markdown — keep all tags, '
		. 'attributes, URLs, code and structure byte-for-byte; translate only human-readable text between them. '
		. '(3) Do NOT translate proper nouns such as personal names, brand names, place names or camera/EXIF values — leave them as-is. '
		. '(4) Never add notes or explanations. '
		. 'Return ONLY a compact JSON object mapping each item id (string) to its translated text, e.g. {"a":"...","b":"..."}.',
		$lang_name
	);
	$user = wp_json_encode( array( 'items' => $items ), JSON_UNESCAPED_UNICODE );

	$reply = sphotography_ai_chat(
		array(
			array( 'role' => 'system', 'content' => $system ),
			array( 'role' => 'user',   'content' => $user ),
		),
		array(
			'temperature'     => 0.2,
			'max_tokens'      => 8000,
			'response_format' => array( 'type' => 'json_object' ),
			'timeout'         => 90,
		)
	);

	if ( ! is_wp_error( $reply ) ) {
		$map = sphotography_i18n_parse_json_map( (string) $reply );
		if ( is_array( $map ) ) {
			// 至少解析出一部分即视为批量成功；缺失项交给逐段兜底。
			$missing = array();
			foreach ( $todo as $id => $info ) {
				if ( ! isset( $map[ $id ] ) || '' === trim( (string) $map[ $id ] ) ) {
					$missing[ $id ] = $info;
				}
			}
			if ( empty( $missing ) ) {
				return $map;
			}
			return array_merge( $map, sphotography_i18n_translate_each( $missing, $lang_name ) );
		}
	}

	// 批量整体失败（模型报错或非 JSON）：逐段翻译兜底。
	return sphotography_i18n_translate_each( $todo, $lang_name );
}

/** 逐段翻译兜底（每段一次模型调用，纯文本进出）。 */
function sphotography_i18n_translate_each( $todo, $lang_name ) {
	$out = array();
	$system = sprintf(
		'Translate the user text into %s. Preserve any HTML/Markdown structure and do not translate proper nouns '
		. '(personal names, brands, place names, EXIF values). Output only the translation, no notes.',
		$lang_name
	);
	foreach ( $todo as $id => $info ) {
		$reply = sphotography_ai_chat(
			array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user',   'content' => $info['text'] ),
			),
			array( 'temperature' => 0.2, 'max_tokens' => 8000, 'timeout' => 90 )
		);
		if ( ! is_wp_error( $reply ) ) {
			$out[ $id ] = trim( (string) $reply );
		}
	}
	return $out;
}

/**
 * 从模型返回里稳健地抠出 JSON 对象（有些模型会包裹 ```json fenced``` 或前后废话）。
 * 成功返回关联数组，失败返回 null。
 */
function sphotography_i18n_parse_json_map( $raw ) {
	$raw = trim( $raw );
	if ( '' === $raw ) {
		return null;
	}
	// 去掉 ```json ... ``` 代码围栏
	if ( 0 === strpos( $raw, '```' ) ) {
		$raw = preg_replace( '/^```[a-zA-Z]*\s*/', '', $raw );
		$raw = preg_replace( '/\s*```$/', '', $raw );
		$raw = trim( $raw );
	}
	$decoded = json_decode( $raw, true );
	if ( is_array( $decoded ) ) {
		// 可能返回 { "items": {...} } 或直接 { id: text }
		if ( isset( $decoded['items'] ) && is_array( $decoded['items'] ) ) {
			return $decoded['items'];
		}
		return $decoded;
	}
	// 退一步：截取第一个 { 到最后一个 } 再试
	$start = strpos( $raw, '{' );
	$end   = strrpos( $raw, '}' );
	if ( false !== $start && false !== $end && $end > $start ) {
		$decoded = json_decode( substr( $raw, $start, $end - $start + 1 ), true );
		if ( is_array( $decoded ) ) {
			return isset( $decoded['items'] ) && is_array( $decoded['items'] ) ? $decoded['items'] : $decoded;
		}
	}
	return null;
}
