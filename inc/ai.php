<?php
/**
 * Sphotography - AI module (experimental)
 *
 * A reusable server-side interface for OpenAI-compatible chat-completions
 * endpoints (Base URL + API Key + Model). Every AI feature routes through it.
 *
 * Model modes (v1.3.0):
 *   - single : one model does everything. If it is multimodal and image
 *              analysis is enabled, images are sent to it directly.
 *   - dual   : a vision model describes the post's images, then a separate
 *              text model writes/polishes using that description.
 *
 * Security posture (all three layers):
 *   1. Server-side only — keys never reach the browser or any frontend/REST
 *      output. Requests are made from PHP via wp_remote_post().
 *   2. Keys live in dedicated, non-autoloaded options (not theme_mods, so they
 *      never appear in a theme-mod export) and are masked in the admin UI.
 *   3. Keys are encrypted at rest with AES-256-CBC using a key derived from
 *      WordPress's AUTH_KEY/AUTH_SALT salts.
 *
 * @package Sphotography
 * @version 1.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Options holding the encrypted API keys. Deliberately NOT theme_mods; autoload
// disabled so they are only read on demand.
if ( ! defined( 'SPHOTOGRAPHY_AI_KEY_OPTION' ) ) {
    define( 'SPHOTOGRAPHY_AI_KEY_OPTION', 'sphotography_ai_api_key_enc' );          // primary / text / single
}
if ( ! defined( 'SPHOTOGRAPHY_AI_VISION_KEY_OPTION' ) ) {
    define( 'SPHOTOGRAPHY_AI_VISION_KEY_OPTION', 'sphotography_ai_vision_key_enc' ); // vision (dual mode)
}

// Multimodal limits.
if ( ! defined( 'SPHOTOGRAPHY_AI_MAX_IMAGES' ) ) {
    define( 'SPHOTOGRAPHY_AI_MAX_IMAGES', 6 );
}
if ( ! defined( 'SPHOTOGRAPHY_AI_IMAGE_MAX_EDGE' ) ) {
    define( 'SPHOTOGRAPHY_AI_IMAGE_MAX_EDGE', 1024 );
}

// ============================================
// Encryption at rest (AES-256-CBC, keyed off WP salts)
// ============================================

/**
 * Derive a stable 32-byte key from the site's auth salts. Different sites (and
 * a site whose salts were rotated) produce different keys, so a stolen DB row
 * cannot be decrypted without the matching wp-config salts.
 */
function sphotography_ai_encryption_key() {
    $material = '';
    if ( defined( 'AUTH_KEY' ) ) {
        $material .= AUTH_KEY;
    }
    if ( defined( 'AUTH_SALT' ) ) {
        $material .= AUTH_SALT;
    }
    if ( '' === $material ) {
        $material = wp_salt( 'auth' );
    }
    return hash( 'sha256', 'sphotography-ai|' . $material, true ); // 32 raw bytes
}

/**
 * Encrypt a plaintext secret for storage. Returns a self-describing string:
 *   enc:<base64(iv.ciphertext)>   when OpenSSL is available
 *   b64:<base64(plaintext)>       weak fallback if OpenSSL is missing
 */
function sphotography_ai_encrypt( $plaintext ) {
    $plaintext = (string) $plaintext;
    if ( '' === $plaintext ) {
        return '';
    }
    if ( ! function_exists( 'openssl_encrypt' ) ) {
        return 'b64:' . base64_encode( $plaintext );
    }
    $key    = sphotography_ai_encryption_key();
    $iv     = function_exists( 'random_bytes' ) ? random_bytes( 16 ) : openssl_random_pseudo_bytes( 16 );
    $cipher = openssl_encrypt( $plaintext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
    if ( false === $cipher ) {
        return '';
    }
    return 'enc:' . base64_encode( $iv . $cipher );
}

/**
 * Reverse sphotography_ai_encrypt(). Returns '' on any failure so callers never
 * accidentally send a corrupt key upstream.
 */
function sphotography_ai_decrypt( $stored ) {
    if ( ! is_string( $stored ) || '' === $stored ) {
        return '';
    }
    if ( 0 === strpos( $stored, 'b64:' ) ) {
        $decoded = base64_decode( substr( $stored, 4 ), true );
        return false === $decoded ? '' : $decoded;
    }
    if ( 0 !== strpos( $stored, 'enc:' ) ) {
        return '';
    }
    if ( ! function_exists( 'openssl_decrypt' ) ) {
        return '';
    }
    $raw = base64_decode( substr( $stored, 4 ), true );
    if ( false === $raw || strlen( $raw ) < 17 ) {
        return '';
    }
    $iv     = substr( $raw, 0, 16 );
    $cipher = substr( $raw, 16 );
    $plain  = openssl_decrypt( $cipher, 'aes-256-cbc', sphotography_ai_encryption_key(), OPENSSL_RAW_DATA, $iv );
    return false === $plain ? '' : $plain;
}

// ============================================
// API key storage helpers (primary + vision)
// ============================================

/** Persist a raw key (encrypted) into the given option. Empty clears it. */
function sphotography_ai_store_key_option( $option, $raw_key ) {
    $raw_key = trim( (string) $raw_key );
    if ( '' === $raw_key ) {
        delete_option( $option );
        return;
    }
    update_option( $option, sphotography_ai_encrypt( $raw_key ), false );
}

function sphotography_ai_store_key( $raw_key ) {
    sphotography_ai_store_key_option( SPHOTOGRAPHY_AI_KEY_OPTION, $raw_key );
}
function sphotography_ai_store_vision_key( $raw_key ) {
    sphotography_ai_store_key_option( SPHOTOGRAPHY_AI_VISION_KEY_OPTION, $raw_key );
}

function sphotography_ai_has_key() {
    $stored = get_option( SPHOTOGRAPHY_AI_KEY_OPTION, '' );
    return is_string( $stored ) && '' !== $stored;
}
function sphotography_ai_has_vision_key() {
    $stored = get_option( SPHOTOGRAPHY_AI_VISION_KEY_OPTION, '' );
    return is_string( $stored ) && '' !== $stored;
}

function sphotography_ai_get_key() {
    return sphotography_ai_decrypt( get_option( SPHOTOGRAPHY_AI_KEY_OPTION, '' ) );
}
function sphotography_ai_get_vision_key() {
    return sphotography_ai_decrypt( get_option( SPHOTOGRAPHY_AI_VISION_KEY_OPTION, '' ) );
}

// ============================================
// Config accessors
// ============================================

function sphotography_ai_is_enabled() {
    return (bool) sphotography_get_mod( 'ai_enabled' );
}

/** 'single' | 'dual' */
function sphotography_ai_get_model_mode() {
    $mode = sphotography_get_mod( 'ai_model_mode' );
    return in_array( $mode, array( 'single', 'dual' ), true ) ? $mode : 'single';
}

// Primary / text / single model.
function sphotography_ai_get_base_url() {
    return rtrim( (string) sphotography_get_mod( 'ai_base_url' ), '/' );
}
function sphotography_ai_get_model() {
    return trim( (string) sphotography_get_mod( 'ai_model' ) );
}

// Vision model (dual mode).
function sphotography_ai_get_vision_base_url() {
    return rtrim( (string) sphotography_get_mod( 'ai_vision_base_url' ), '/' );
}
function sphotography_ai_get_vision_model() {
    return trim( (string) sphotography_get_mod( 'ai_vision_model' ) );
}

/**
 * Whether image analysis is active right now:
 *   - dual mode  → always (the vision model handles images), if configured.
 *   - single mode → only when the user asserts the model is multimodal
 *                   (ai_image_enabled).
 */
function sphotography_ai_image_analysis_active() {
    if ( 'dual' === sphotography_ai_get_model_mode() ) {
        return true;
    }
    return (bool) sphotography_get_mod( 'ai_image_enabled' );
}

/** Primary/text model fully configured? */
function sphotography_ai_primary_ready() {
    return '' !== sphotography_ai_get_base_url()
        && '' !== sphotography_ai_get_model()
        && sphotography_ai_has_key();
}

/** Vision model fully configured? */
function sphotography_ai_vision_ready() {
    return '' !== sphotography_ai_get_vision_base_url()
        && '' !== sphotography_ai_get_vision_model()
        && sphotography_ai_has_vision_key();
}

/**
 * True when the module is enabled AND the active mode is fully configured.
 * In dual mode BOTH models must be configured.
 */
function sphotography_ai_is_ready() {
    if ( ! sphotography_ai_is_enabled() || ! sphotography_ai_primary_ready() ) {
        return false;
    }
    if ( 'dual' === sphotography_ai_get_model_mode() ) {
        return sphotography_ai_vision_ready();
    }
    return true;
}

/**
 * Resolve the chat-completions endpoint from a base URL. Accepts a bare base
 * ("https://api.openai.com/v1") or a full endpoint already ending in
 * /chat/completions.
 */
function sphotography_ai_chat_endpoint( $base ) {
    $base = rtrim( (string) $base, '/' );
    if ( preg_match( '#/chat/completions$#', $base ) ) {
        return $base;
    }
    return $base . '/chat/completions';
}

// ============================================
// Low-level request — the reserved interface
// ============================================

/**
 * Send a chat-completion request. Defaults to the primary/text model; pass
 * base_url/key/model in $args to target another endpoint (e.g. the vision
 * model). Messages follow the OpenAI format; content may be a string or an
 * array of parts (for multimodal).
 *
 * @param array $messages OpenAI-format messages.
 * @param array $args     base_url, key, model, temperature, max_tokens, timeout.
 * @return string|WP_Error Model text on success, WP_Error on failure.
 */
function sphotography_ai_chat( $messages, $args = array() ) {
    if ( ! sphotography_ai_is_enabled() ) {
        return new WP_Error( 'ai_disabled', __( 'AI 功能未启用。请在「实验性功能」中开启并配置。', 'sphotography' ) );
    }

    $base  = ! empty( $args['base_url'] ) ? rtrim( (string) $args['base_url'], '/' ) : sphotography_ai_get_base_url();
    $key   = ! empty( $args['key'] ) ? (string) $args['key'] : sphotography_ai_get_key();
    $model = ! empty( $args['model'] ) ? (string) $args['model'] : sphotography_ai_get_model();

    if ( '' === $base || '' === $key || '' === $model ) {
        return new WP_Error( 'ai_config', __( 'AI 接口尚未配置完整（需 Base URL、API Key、模型名称）。', 'sphotography' ) );
    }
    if ( ! is_array( $messages ) || empty( $messages ) ) {
        return new WP_Error( 'ai_messages', __( '缺少对话内容。', 'sphotography' ) );
    }

    $body = array(
        'model'       => $model,
        'messages'    => array_values( $messages ),
        'temperature' => isset( $args['temperature'] ) ? (float) $args['temperature'] : 0.7,
    );
    if ( ! empty( $args['max_tokens'] ) ) {
        $body['max_tokens'] = (int) $args['max_tokens'];
    }
    if ( ! empty( $args['response_format'] ) ) {
        $body['response_format'] = $args['response_format'];
    }

    $response = wp_remote_post( sphotography_ai_chat_endpoint( $base ), array(
        'timeout' => isset( $args['timeout'] ) ? (int) $args['timeout'] : 60,
        'headers' => array(
            'Content-Type'  => 'application/json',
            'Authorization' => 'Bearer ' . $key,
        ),
        'body'    => wp_json_encode( $body ),
    ) );

    if ( is_wp_error( $response ) ) {
        return $response;
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    $raw  = wp_remote_retrieve_body( $response );
    $data = json_decode( $raw, true );

    if ( $code < 200 || $code >= 300 ) {
        $msg = ( is_array( $data ) && isset( $data['error']['message'] ) ) ? $data['error']['message'] : '';
        if ( '' === $msg ) {
            $msg = mb_substr( (string) $raw, 0, 300 );
        }
        return new WP_Error( 'ai_http', sprintf( __( 'AI 接口返回错误（HTTP %1$d）：%2$s', 'sphotography' ), $code, $msg ) );
    }

    if ( ! is_array( $data ) || ! isset( $data['choices'][0]['message']['content'] ) ) {
        return new WP_Error( 'ai_parse', __( '无法解析 AI 返回内容。', 'sphotography' ) );
    }

    return (string) $data['choices'][0]['message']['content'];
}

// ============================================
// Multimodal image handling
// ============================================

/**
 * Turn one attachment ID into a base64 data URI, downscaled to a sane edge so
 * payloads stay small. Reads from disk (no HTTP round-trip), so it works on
 * localhost / private sites. Returns '' on failure.
 */
function sphotography_ai_attachment_data_uri( $attachment_id ) {
    $attachment_id = (int) $attachment_id;
    if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
        return '';
    }
    $path = get_attached_file( $attachment_id );
    if ( ! $path || ! file_exists( $path ) ) {
        return '';
    }

    // Try to produce a downscaled JPEG/PNG copy in memory via WP's editor.
    $editor = wp_get_image_editor( $path );
    if ( ! is_wp_error( $editor ) ) {
        $size = $editor->get_size();
        if ( is_array( $size ) && ! empty( $size['width'] ) ) {
            $max = SPHOTOGRAPHY_AI_IMAGE_MAX_EDGE;
            if ( $size['width'] > $max || $size['height'] > $max ) {
                $editor->resize( $max, $max, false );
            }
        }
        $tmp = wp_tempnam( 'sphotography-ai-img' );
        $saved = $editor->save( $tmp );
        if ( ! is_wp_error( $saved ) && ! empty( $saved['path'] ) && file_exists( $saved['path'] ) ) {
            $bytes = file_get_contents( $saved['path'] );
            $mime  = ! empty( $saved['mime-type'] ) ? $saved['mime-type'] : 'image/jpeg';
            @unlink( $saved['path'] );
            if ( $saved['path'] !== $tmp ) {
                @unlink( $tmp );
            }
            if ( false !== $bytes ) {
                return 'data:' . $mime . ';base64,' . base64_encode( $bytes );
            }
        } elseif ( file_exists( $tmp ) ) {
            @unlink( $tmp );
        }
    }

    // Fallback: inline the original file if it is not too large (< 4 MB).
    $bytes = file_get_contents( $path );
    if ( false === $bytes || strlen( $bytes ) > 4 * 1024 * 1024 ) {
        return '';
    }
    $mime = get_post_mime_type( $attachment_id ) ?: 'image/jpeg';
    return 'data:' . $mime . ';base64,' . base64_encode( $bytes );
}

/**
 * Build OpenAI multimodal image content-parts from an image list coming from
 * the editor. Each item: array('id'=>int, 'url'=>string). Attachment IDs are
 * read from disk + downscaled; external URLs are passed through. Capped.
 *
 * @return array List of ['type'=>'image_url','image_url'=>['url'=>...]] parts.
 */
function sphotography_ai_build_image_parts( $images ) {
    $parts = array();
    if ( ! is_array( $images ) ) {
        return $parts;
    }
    foreach ( $images as $img ) {
        if ( count( $parts ) >= SPHOTOGRAPHY_AI_MAX_IMAGES ) {
            break;
        }
        $id  = isset( $img['id'] ) ? (int) $img['id'] : 0;
        $url = isset( $img['url'] ) ? esc_url_raw( (string) $img['url'] ) : '';

        $data_uri = '';
        if ( $id > 0 ) {
            $data_uri = sphotography_ai_attachment_data_uri( $id );
        }
        // If we have no attachment but a URL that maps to a local attachment, resolve it.
        if ( '' === $data_uri && '' !== $url && 0 === $id ) {
            $resolved = attachment_url_to_postid( $url );
            if ( $resolved ) {
                $data_uri = sphotography_ai_attachment_data_uri( $resolved );
            }
        }

        if ( '' !== $data_uri ) {
            $parts[] = array( 'type' => 'image_url', 'image_url' => array( 'url' => $data_uri ) );
        } elseif ( '' !== $url && preg_match( '#^https?://#i', $url ) ) {
            // External image: let the provider fetch it.
            $parts[] = array( 'type' => 'image_url', 'image_url' => array( 'url' => $url ) );
        }
    }
    return $parts;
}

/**
 * Dual-mode step 1: ask the vision model to describe the images. Returns a
 * plain-text description used as context for the text model.
 *
 * @param array  $image_parts OpenAI image parts.
 * @param string $hint        Optional context to focus the description.
 * @return string|WP_Error
 */
function sphotography_ai_vision_describe( $image_parts, $hint = '' ) {
    if ( empty( $image_parts ) ) {
        return '';
    }
    $instruction = __( '请用简体中文客观描述这些图片的内容、场景、氛围与可见细节，作为写作参考。只输出描述，不要展开成文章。', 'sphotography' );
    if ( '' !== $hint ) {
        $instruction .= "\n" . sprintf( __( '写作主题参考：%s', 'sphotography' ), $hint );
    }

    $content = array_merge(
        array( array( 'type' => 'text', 'text' => $instruction ) ),
        $image_parts
    );
    $messages = array(
        array( 'role' => 'user', 'content' => $content ),
    );

    return sphotography_ai_chat( $messages, array(
        'base_url'    => sphotography_ai_get_vision_base_url(),
        'key'         => sphotography_ai_get_vision_key(),
        'model'       => sphotography_ai_get_vision_model(),
        'temperature' => 0.3,
        'max_tokens'  => 1024,
        'timeout'     => 60,
    ) );
}

// ============================================
// Prompt building — style / length
// ============================================

function sphotography_ai_style_directive( $style ) {
    switch ( $style ) {
        case 'rational':
            return __( '语气克制、理性、客观，重事实与逻辑，少用修辞。', 'sphotography' );
        case 'emotional':
            return __( '语气细腻、感性，富有画面感与情绪，善用具体感官细节。', 'sphotography' );
        case 'normal':
        default:
            return __( '语气自然、平实，张弛得当。', 'sphotography' );
    }
}

/** Returns array( guidance_text, max_tokens ). */
function sphotography_ai_length_spec( $length ) {
    switch ( $length ) {
        case 'short':
            return array( __( '篇幅精简，控制在一到两个自然段。', 'sphotography' ), 800 );
        case 'long':
            return array( __( '篇幅充分展开，多个自然段，细节丰富。', 'sphotography' ), 3200 );
        case 'medium':
        default:
            return array( __( '篇幅适中，数个自然段。', 'sphotography' ), 1800 );
    }
}

function sphotography_ai_html_format_rule() {
    return __( '输出必须是可直接粘贴进 WordPress 编辑器的原生 HTML 片段：只允许使用 <p>、<h2>、<h3>、<ul>、<ol>、<li>、<blockquote>、<strong>、<em> 标签；严禁使用 Markdown、代码块、``` 反引号，也不要用 <html>/<body>/<head> 包裹，不要输出多余解释。', 'sphotography' );
}

/**
 * Clean a model reply into safe, WP-native HTML. Strips code fences, converts
 * lingering Markdown headings/bold to HTML, then wp_kses_post.
 */
function sphotography_ai_clean_html( $text ) {
    $text = (string) $text;
    // Remove ```html ... ``` fences.
    $text = preg_replace( '/```[a-zA-Z]*\s*/', '', $text );
    $text = str_replace( '```', '', $text );
    $text = trim( $text );

    // If the model ignored the HTML rule and returned Markdown-ish plain text
    // (no HTML tags at all), do a minimal conversion so it is not one blob.
    if ( '' !== $text && ! preg_match( '/<(p|h2|h3|ul|ol|li|blockquote|strong|em|br)\b/i', $text ) ) {
        $blocks = preg_split( '/\n{2,}/', $text );
        $html   = '';
        foreach ( $blocks as $b ) {
            $b = trim( $b );
            if ( '' === $b ) {
                continue;
            }
            // Markdown heading → h2/h3.
            if ( preg_match( '/^#{1,2}\s+(.*)$/', $b, $m ) ) {
                $html .= '<h2>' . esc_html( trim( $m[1] ) ) . '</h2>';
            } elseif ( preg_match( '/^#{3,}\s+(.*)$/', $b, $m ) ) {
                $html .= '<h3>' . esc_html( trim( $m[1] ) ) . '</h3>';
            } else {
                $html .= '<p>' . esc_html( $b ) . '</p>';
            }
        }
        $text = $html;
    }

    return wp_kses_post( $text );
}

// ============================================
// Orchestrator — features call this
// ============================================

/**
 * High-level generation used by 文章补全 and 润色. Hides single-vs-dual mode
 * and multimodal plumbing from the features.
 *
 * @param array $opts task ('complete'|'polish'), text, keywords, images,
 *                    style, length.
 * @return string|WP_Error Cleaned WP-native HTML.
 */
function sphotography_ai_generate( $opts ) {
    $task     = isset( $opts['task'] ) ? $opts['task'] : 'complete';
    $text     = isset( $opts['text'] ) ? trim( (string) $opts['text'] ) : '';
    $keywords = isset( $opts['keywords'] ) ? trim( (string) $opts['keywords'] ) : '';
    $style    = isset( $opts['style'] ) ? $opts['style'] : 'normal';
    $length   = isset( $opts['length'] ) ? $opts['length'] : 'medium';
    $images   = isset( $opts['images'] ) ? $opts['images'] : array();

    $mode        = sphotography_ai_get_model_mode();
    $image_active = sphotography_ai_image_analysis_active();
    $image_parts  = $image_active ? sphotography_ai_build_image_parts( $images ) : array();

    $style_rule  = sphotography_ai_style_directive( $style );
    $format_rule = sphotography_ai_html_format_rule();

    // Build the task-specific instruction + system role.
    if ( 'polish' === $task ) {
        $system = __( '你是一位中文文字编辑，负责润色博客文章。', 'sphotography' );
        $task_rule = __( '请在保持原意与篇幅的前提下润色下面的文章：改善用词、语句连贯与节奏，纠正明显的语病；不得新增事实或观点，不得删减信息，不要明显改变文章长度。', 'sphotography' );
        $max_tokens = 3200;
    } else {
        $system = __( '你是一位中文博客写作助手。', 'sphotography' );
        list( $length_rule, $max_tokens ) = sphotography_ai_length_spec( $length );
        $task_rule = __( '请根据下面已有的图片信息、正文与关键词，把文章补全为一篇结构完整、连贯自然的博客文章正文（续写或扩写已有内容，保持与已有内容风格一致，不要重复已有段落，不要包含文章标题）。', 'sphotography' ) . ' ' . $length_rule;
    }

    // Compose the user text payload.
    $user_text = $task_rule . "\n\n" . __( '风格要求：', 'sphotography' ) . $style_rule . "\n" . $format_rule;

    if ( 'dual' === $mode && ! empty( $image_parts ) ) {
        // Step 1: vision model describes the images.
        $desc = sphotography_ai_vision_describe( $image_parts, $keywords );
        if ( is_wp_error( $desc ) ) {
            return $desc;
        }
        if ( '' !== $desc ) {
            $user_text .= "\n\n" . __( '图片内容（由识图模型分析得到，供参考）：', 'sphotography' ) . "\n" . $desc;
        }
        // Step 2: text model writes (no raw images here).
        if ( '' !== $text ) {
            $user_text .= "\n\n" . __( '已有正文：', 'sphotography' ) . "\n" . $text;
        }
        if ( '' !== $keywords ) {
            $user_text .= "\n\n" . __( '关键词：', 'sphotography' ) . $keywords;
        }
        $messages = array(
            array( 'role' => 'system', 'content' => $system ),
            array( 'role' => 'user', 'content' => $user_text ),
        );
        return sphotography_ai_chat( $messages, array( 'temperature' => ( 'polish' === $task ) ? 0.5 : 0.8, 'max_tokens' => $max_tokens ) );
    }

    // Single mode (multimodal or text-only), or dual mode with no images.
    if ( '' !== $text ) {
        $user_text .= "\n\n" . __( '已有正文：', 'sphotography' ) . "\n" . $text;
    }
    if ( '' !== $keywords ) {
        $user_text .= "\n\n" . __( '关键词：', 'sphotography' ) . $keywords;
    }

    if ( ! empty( $image_parts ) ) {
        // Send text + images to the (multimodal) primary model directly.
        $content = array_merge(
            array( array( 'type' => 'text', 'text' => $user_text ) ),
            $image_parts
        );
        $messages = array(
            array( 'role' => 'system', 'content' => $system ),
            array( 'role' => 'user', 'content' => $content ),
        );
    } else {
        $messages = array(
            array( 'role' => 'system', 'content' => $system ),
            array( 'role' => 'user', 'content' => $user_text ),
        );
    }

    return sphotography_ai_chat( $messages, array( 'temperature' => ( 'polish' === $task ) ? 0.5 : 0.8, 'max_tokens' => $max_tokens ) );
}

// ============================================
// Post-editor meta box (only when the module is enabled)
// ============================================

function sphotography_ai_register_meta_box() {
    if ( ! sphotography_ai_is_enabled() ) {
        return;
    }
    add_meta_box(
        'sphotography-ai',
        __( 'Sphotography AI（实验性）', 'sphotography' ),
        'sphotography_ai_render_meta_box',
        'post',
        'side',
        'default'
    );
}
add_action( 'add_meta_boxes', 'sphotography_ai_register_meta_box' );

function sphotography_ai_render_meta_box( $post ) {
    $ready        = sphotography_ai_is_ready();
    $image_active = sphotography_ai_image_analysis_active();
    ?>
    <div class="sphotography-ai-box" id="sphotography-ai-box">
        <p class="sphotography-ai-warning">
            <?php esc_html_e( '实验性功能：AI 生成内容可能不准确或凭空捏造，请务必人工核对。你的文章内容与图片会被发送到你所配置的第三方服务商，并可能产生费用。', 'sphotography' ); ?>
        </p>

        <?php if ( ! $ready ) : ?>
            <p class="sphotography-ai-notready">
                <?php
                printf(
                    /* translators: %s: settings page link */
                    wp_kses( __( 'AI 接口尚未配置完整，请先在 <a href="%s">主题设置 → 实验性功能</a> 中完成配置。', 'sphotography' ), array( 'a' => array( 'href' => array() ) ) ),
                    esc_url( admin_url( 'admin.php?page=sphotography-settings#sp-mod-experimental' ) )
                );
                ?>
            </p>
        <?php else : ?>
            <?php wp_nonce_field( 'sphotography_ai_action', 'sphotography_ai_nonce' ); ?>

            <!-- Shared style / length controls -->
            <div class="sphotography-ai-controls">
                <label class="sphotography-ai-label" for="sphotography-ai-style"><?php esc_html_e( '感情风格', 'sphotography' ); ?></label>
                <select id="sphotography-ai-style">
                    <option value="rational"><?php esc_html_e( '更理性', 'sphotography' ); ?></option>
                    <option value="normal" selected><?php esc_html_e( '普通', 'sphotography' ); ?></option>
                    <option value="emotional"><?php esc_html_e( '更感性', 'sphotography' ); ?></option>
                </select>
                <label class="sphotography-ai-label" for="sphotography-ai-length"><?php esc_html_e( '文案长度', 'sphotography' ); ?></label>
                <select id="sphotography-ai-length">
                    <option value="long"><?php esc_html_e( '更长', 'sphotography' ); ?></option>
                    <option value="medium" selected><?php esc_html_e( '中等', 'sphotography' ); ?></option>
                    <option value="short"><?php esc_html_e( '更短', 'sphotography' ); ?></option>
                </select>
                <p class="sphotography-ai-hint" id="sphotography-ai-length-hint" hidden><?php esc_html_e( '润色不改变篇幅，长度设置暂不生效。', 'sphotography' ); ?></p>
            </div>

            <!-- 文章补全 -->
            <div class="sphotography-ai-section">
                <label class="sphotography-ai-label" for="sphotography-ai-keywords"><?php esc_html_e( '文章补全', 'sphotography' ); ?></label>
                <p class="sphotography-ai-hint"><?php esc_html_e( '根据当前正文与图片补全文章，关键词可留空。', 'sphotography' ); ?></p>
                <textarea id="sphotography-ai-keywords" rows="2" placeholder="<?php esc_attr_e( '可选关键词/提纲，如：京都, 秋天, 银杏', 'sphotography' ); ?>"></textarea>
                <button type="button" class="button" id="sphotography-ai-complete-btn"><?php esc_html_e( '生成补全', 'sphotography' ); ?></button>
                <div class="sphotography-ai-result" id="sphotography-ai-complete-result" hidden>
                    <div class="sphotography-ai-preview" id="sphotography-ai-complete-preview"></div>
                    <button type="button" class="button button-primary" id="sphotography-ai-insert-btn"><?php esc_html_e( '插入正文', 'sphotography' ); ?></button>
                </div>
            </div>

            <!-- 润色 -->
            <div class="sphotography-ai-section">
                <label class="sphotography-ai-label"><?php esc_html_e( '润色', 'sphotography' ); ?></label>
                <p class="sphotography-ai-hint"><?php esc_html_e( '分析当前正文与图片并润色，保持篇幅、不增删内容。应用后将替换正文（可用 Ctrl+Z 撤销）。', 'sphotography' ); ?></p>
                <button type="button" class="button" id="sphotography-ai-polish-btn"><?php esc_html_e( '生成润色', 'sphotography' ); ?></button>
                <div class="sphotography-ai-result" id="sphotography-ai-polish-result" hidden>
                    <div class="sphotography-ai-preview" id="sphotography-ai-polish-preview"></div>
                    <button type="button" class="button button-primary" id="sphotography-ai-apply-btn"><?php esc_html_e( '应用润色', 'sphotography' ); ?></button>
                </div>
            </div>

            <!-- AI 自动标签 -->
            <div class="sphotography-ai-section">
                <label class="sphotography-ai-label"><?php esc_html_e( 'AI 自动标签', 'sphotography' ); ?></label>
                <p class="sphotography-ai-hint"><?php esc_html_e( '根据正文内容建议标签，点击采用（写入文章标签）。不会修改地区标签。', 'sphotography' ); ?></p>
                <button type="button" class="button" id="sphotography-ai-tags-btn"><?php esc_html_e( '建议标签', 'sphotography' ); ?></button>
                <div class="sphotography-ai-tags" id="sphotography-ai-tags-result"></div>
            </div>

            <p class="sphotography-ai-imgnote" id="sphotography-ai-imgnote" hidden></p>
            <div class="sphotography-ai-status" id="sphotography-ai-status" aria-live="polite"></div>
        <?php endif; ?>
    </div>
    <?php
}

// ============================================
// Enqueue meta-box script (post edit screen only, module ready)
// ============================================
function sphotography_ai_enqueue_editor( $hook ) {
    if ( 'post.php' !== $hook && 'post-new.php' !== $hook ) {
        return;
    }
    $screen = get_current_screen();
    if ( ! $screen || 'post' !== $screen->post_type ) {
        return;
    }
    if ( ! sphotography_ai_is_enabled() || ! sphotography_ai_is_ready() ) {
        return;
    }

    wp_enqueue_script(
        'sphotography-ai-metabox',
        get_template_directory_uri() . '/assets/js/ai-metabox.js',
        array( 'jquery' ),
        SPHOTOGRAPHY_VERSION,
        true
    );

    // Meta-box styles — attach to WP admin's always-present "common" handle. The
    // editor has no dark mode, so the box is pinned to light styling even when
    // the global admin dark scheme is active (requirement: no dark/light clash).
    wp_add_inline_style( 'common', sphotography_ai_metabox_css() );

    wp_localize_script( 'sphotography-ai-metabox', 'SphotographyAI', array(
        'ajaxUrl'      => admin_url( 'admin-ajax.php' ),
        'nonce'        => wp_create_nonce( 'sphotography_ai_action' ),
        'imageActive'  => sphotography_ai_image_analysis_active() ? 1 : 0,
        'maxImages'    => SPHOTOGRAPHY_AI_MAX_IMAGES,
        'i18n'         => array(
            'working'     => __( '生成中，请稍候…', 'sphotography' ),
            'tagWorking'  => __( '分析中…', 'sphotography' ),
            'noContent'   => __( '请先在正文中写入文字或插入图片，或填写关键词。', 'sphotography' ),
            'noBody'      => __( '正文内容太少，无法分析标签。', 'sphotography' ),
            'noPolish'    => __( '正文为空，无法润色。', 'sphotography' ),
            'inserted'    => __( '已插入正文末尾。', 'sphotography' ),
            'applied'     => __( '已应用润色（Ctrl+Z 可撤销）。', 'sphotography' ),
            'tagAdded'    => __( '已添加', 'sphotography' ),
            'error'       => __( '出错了：', 'sphotography' ),
            'imgNoteOff'  => __( '检测到 %d 张图片，但图片分析已关闭，本次仅使用文字。', 'sphotography' ),
        ),
    ) );
}
add_action( 'admin_enqueue_scripts', 'sphotography_ai_enqueue_editor' );

/**
 * Editor meta-box CSS. Pinned to light regardless of admin scheme by scoping
 * explicit light colours to #sphotography-ai (the postbox) with high enough
 * specificity to beat the global dark .postbox rules in admin-style.php.
 */
function sphotography_ai_metabox_css() {
    return '
        /* Force the AI box to a light card even under the global dark scheme,
           since the block editor canvas around it has no dark mode. */
        body #sphotography-ai.postbox,
        body.sphotography-admin-global #sphotography-ai.postbox {
            background: #ffffff !important;
            border: 1px solid #dcdcde !important;
            color: #2c3338 !important;
            box-shadow: none !important;
        }
        body #sphotography-ai .postbox-header,
        body #sphotography-ai .hndle,
        body.sphotography-admin-global #sphotography-ai .postbox-header,
        body.sphotography-admin-global #sphotography-ai .hndle {
            background: #ffffff !important;
            color: #1d2327 !important;
            border-bottom: 1px solid #dcdcde !important;
        }
        #sphotography-ai .sphotography-ai-box,
        #sphotography-ai .sphotography-ai-box * { color: #2c3338; }
        #sphotography-ai .sphotography-ai-warning {
            font-size: 12px; line-height: 1.6; color: #8a5a00 !important;
            background: #fff8e5; border: 1px solid #ffe1a8;
            border-radius: 6px; padding: 8px 10px; margin: 0 0 12px;
        }
        #sphotography-ai .sphotography-ai-notready { font-size: 12px; color: #b32d2e !important; }
        #sphotography-ai .sphotography-ai-controls { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
        #sphotography-ai .sphotography-ai-controls select { flex: 1 1 40%; min-width: 90px; }
        #sphotography-ai .sphotography-ai-section { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #eee; }
        #sphotography-ai .sphotography-ai-section:last-of-type { border-bottom: none; }
        #sphotography-ai .sphotography-ai-label { display: block; font-weight: 600; margin-bottom: 6px; color: #1d2327; }
        #sphotography-ai .sphotography-ai-hint { font-size: 11px; color: #757575 !important; margin: 0 0 8px; }
        #sphotography-ai .sphotography-ai-imgnote { font-size: 11px; color: #2271b1 !important; margin: 8px 0 0; }
        #sphotography-ai textarea, #sphotography-ai select {
            width: 100%; background: #fff !important; color: #2c3338 !important;
            border: 1px solid #c3c4c7 !important; border-radius: 4px;
        }
        #sphotography-ai textarea { margin-bottom: 8px; }
        #sphotography-ai .sphotography-ai-result { margin-top: 10px; }
        #sphotography-ai .sphotography-ai-preview {
            max-height: 220px; overflow: auto; white-space: pre-wrap;
            font-size: 12px; line-height: 1.7; background: #f6f7f7 !important;
            border: 1px solid #dcdcde; border-radius: 6px; padding: 10px; margin-bottom: 8px; color: #2c3338 !important;
        }
        #sphotography-ai .sphotography-ai-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        #sphotography-ai .sphotography-ai-chip {
            border: 1px solid #c3c4c7; background: #fff !important; color: #2c3338 !important;
            border-radius: 14px; padding: 3px 10px; font-size: 12px; cursor: pointer;
        }
        #sphotography-ai .sphotography-ai-chip:hover { border-color: #2271b1; color: #2271b1 !important; }
        #sphotography-ai .sphotography-ai-chip.is-added { background: #edfaf1 !important; border-color: #46b450; color: #46b450 !important; cursor: default; }
        #sphotography-ai .sphotography-ai-status { font-size: 12px; margin-top: 8px; min-height: 1em; }
    ';
}

// ============================================
// AJAX: 文章补全 (complete)
// ============================================
function sphotography_ai_ajax_complete() {
    if ( ! check_ajax_referer( 'sphotography_ai_action', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $text     = isset( $_POST['text'] ) ? wp_kses_post( wp_unslash( $_POST['text'] ) ) : '';
    $keywords = isset( $_POST['keywords'] ) ? sanitize_textarea_field( wp_unslash( $_POST['keywords'] ) ) : '';
    $style    = isset( $_POST['style'] ) ? sanitize_key( $_POST['style'] ) : 'normal';
    $length   = isset( $_POST['length'] ) ? sanitize_key( $_POST['length'] ) : 'medium';
    $images   = sphotography_ai_sanitize_images( isset( $_POST['images'] ) ? $_POST['images'] : array() );

    if ( '' === trim( wp_strip_all_tags( $text ) ) && '' === trim( $keywords ) && empty( $images ) ) {
        wp_send_json_error( __( '请先在正文中写入文字或插入图片，或填写关键词。', 'sphotography' ) );
    }

    $result = sphotography_ai_generate( array(
        'task'     => 'complete',
        'text'     => wp_strip_all_tags( $text ),
        'keywords' => $keywords,
        'style'    => $style,
        'length'   => $length,
        'images'   => $images,
    ) );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }

    wp_send_json_success( array( 'html' => sphotography_ai_clean_html( $result ) ) );
}
add_action( 'wp_ajax_sphotography_ai_complete', 'sphotography_ai_ajax_complete' );

// ============================================
// AJAX: 润色 (polish)
// ============================================
function sphotography_ai_ajax_polish() {
    if ( ! check_ajax_referer( 'sphotography_ai_action', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $text   = isset( $_POST['text'] ) ? wp_kses_post( wp_unslash( $_POST['text'] ) ) : '';
    $style  = isset( $_POST['style'] ) ? sanitize_key( $_POST['style'] ) : 'normal';
    $images = sphotography_ai_sanitize_images( isset( $_POST['images'] ) ? $_POST['images'] : array() );

    if ( '' === trim( wp_strip_all_tags( $text ) ) ) {
        wp_send_json_error( __( '正文为空，无法润色。', 'sphotography' ) );
    }

    $result = sphotography_ai_generate( array(
        'task'   => 'polish',
        'text'   => wp_strip_all_tags( $text ),
        'style'  => $style,
        'images' => $images,
    ) );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }

    wp_send_json_success( array( 'html' => sphotography_ai_clean_html( $result ) ) );
}
add_action( 'wp_ajax_sphotography_ai_polish', 'sphotography_ai_ajax_polish' );

/** Sanitize the images array coming from the editor: [{id,url}, ...]. */
function sphotography_ai_sanitize_images( $raw ) {
    if ( ! is_array( $raw ) ) {
        return array();
    }
    $out = array();
    foreach ( $raw as $img ) {
        if ( ! is_array( $img ) ) {
            continue;
        }
        $id  = isset( $img['id'] ) ? absint( $img['id'] ) : 0;
        $url = isset( $img['url'] ) ? esc_url_raw( wp_unslash( $img['url'] ) ) : '';
        if ( $id > 0 || '' !== $url ) {
            $out[] = array( 'id' => $id, 'url' => $url );
        }
        if ( count( $out ) >= SPHOTOGRAPHY_AI_MAX_IMAGES ) {
            break;
        }
    }
    return $out;
}

// ============================================
// AJAX: auto tag suggestions (native post_tag only, text model)
// ============================================
function sphotography_ai_ajax_tags() {
    if ( ! check_ajax_referer( 'sphotography_ai_action', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $content = isset( $_POST['content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['content'] ) ) : '';
    $title   = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
    $content = trim( $content );
    if ( mb_strlen( $content ) < 20 && '' === $title ) {
        wp_send_json_error( __( '正文内容太少，无法分析标签。', 'sphotography' ) );
    }
    $content = mb_substr( $content, 0, 4000 );

    $existing = get_terms( array(
        'taxonomy'   => 'post_tag',
        'hide_empty' => false,
        'number'     => 60,
        'fields'     => 'names',
    ) );
    $existing_list = ( is_array( $existing ) && ! empty( $existing ) ) ? implode( '、', $existing ) : __( '（暂无已有标签）', 'sphotography' );

    $messages = array(
        array( 'role' => 'system', 'content' => __( '你是一个博客标签分类助手。阅读文章后给出 5 到 8 个精炼的中文标签。优先复用站点已有标签，避免近义重复。只输出一个 JSON 数组，例如 ["旅行","京都","秋天"]，不要输出其它任何内容。', 'sphotography' ) ),
        array( 'role' => 'user', 'content' => sprintf( __( "已有标签：%1\$s\n\n文章标题：%2\$s\n\n文章正文：\n%3\$s", 'sphotography' ), $existing_list, $title, $content ) ),
    );

    // Auto-tag is text-only and always uses the primary/text model.
    $result = sphotography_ai_chat( $messages, array( 'temperature' => 0.4, 'max_tokens' => 256 ) );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }

    $tags = sphotography_ai_parse_tag_list( $result );
    if ( empty( $tags ) ) {
        wp_send_json_error( __( '未能解析出标签，请重试。', 'sphotography' ) );
    }

    wp_send_json_success( array( 'tags' => $tags ) );
}
add_action( 'wp_ajax_sphotography_ai_tags', 'sphotography_ai_ajax_tags' );

// ============================================
// AJAX: test connection (settings page) — single tests one, dual tests both
// ============================================
function sphotography_ai_ajax_test() {
    if ( ! check_ajax_referer( 'sphotography_ai_test', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $ping = array( array( 'role' => 'user', 'content' => 'ping' ) );
    $lines = array();

    // Primary / text model.
    $primary = sphotography_ai_chat( $ping, array( 'temperature' => 0, 'max_tokens' => 5, 'timeout' => 30 ) );
    if ( is_wp_error( $primary ) ) {
        wp_send_json_error( sprintf( __( '文案模型：%s', 'sphotography' ), $primary->get_error_message() ) );
    }
    $lines[] = __( '文案模型 ✓', 'sphotography' );

    // Vision model (dual only).
    if ( 'dual' === sphotography_ai_get_model_mode() ) {
        $vision = sphotography_ai_chat( $ping, array(
            'base_url'   => sphotography_ai_get_vision_base_url(),
            'key'        => sphotography_ai_get_vision_key(),
            'model'      => sphotography_ai_get_vision_model(),
            'temperature' => 0,
            'max_tokens' => 5,
            'timeout'    => 30,
        ) );
        if ( is_wp_error( $vision ) ) {
            wp_send_json_error( sprintf( __( '识图模型：%s', 'sphotography' ), $vision->get_error_message() ) );
        }
        $lines[] = __( '识图模型 ✓', 'sphotography' );
    }

    wp_send_json_success( array( 'message' => implode( '　', $lines ) ) );
}
add_action( 'wp_ajax_sphotography_ai_test', 'sphotography_ai_ajax_test' );

/**
 * Pull a clean list of tag strings out of a model reply. Handles a raw JSON
 * array, JSON wrapped in prose/code fences, or a comma/newline separated list.
 */
function sphotography_ai_parse_tag_list( $text ) {
    $text = trim( (string) $text );
    $tags = array();

    if ( preg_match( '/\[.*\]/s', $text, $m ) ) {
        $decoded = json_decode( $m[0], true );
        if ( is_array( $decoded ) ) {
            $tags = $decoded;
        }
    }
    if ( empty( $tags ) ) {
        $text = preg_replace( '/```[a-z]*|```/i', '', $text );
        $tags = preg_split( '/[,，\n、]+/u', $text );
    }

    $clean = array();
    foreach ( (array) $tags as $tag ) {
        $tag = trim( wp_strip_all_tags( (string) $tag ), " \t\n\r\0\x0B\"'[]" );
        if ( '' !== $tag && mb_strlen( $tag ) <= 30 ) {
            $clean[] = $tag;
        }
    }
    return array_slice( array_values( array_unique( $clean ) ), 0, 8 );
}
