<?php
/**
 * Sphotography - AI module (experimental)
 *
 * A single, reusable entry point — sphotography_ai_chat() — that every AI
 * feature (now and in the future) routes through. Only OpenAI-compatible
 * chat-completions endpoints are supported (Base URL + API Key + Model),
 * which covers OpenAI, DeepSeek, Moonshot, Zhipu, SiliconFlow, local proxies,
 * etc.
 *
 * Security posture (all three layers):
 *   1. Server-side only — the key never reaches the browser or any frontend/
 *      REST output. Requests are made from PHP via wp_remote_post().
 *   2. The API key is stored in a dedicated, non-autoloaded option (not a
 *      theme_mod, so it never appears in a theme-mod export) and is masked in
 *      the admin UI — the raw value is never rendered back.
 *   3. The key is encrypted at rest with AES-256-CBC using a key derived from
 *      WordPress's AUTH_KEY/AUTH_SALT salts, so a bare DB dump (without
 *      wp-config salts) does not expose it.
 *
 * @package Sphotography
 * @version 1.2.9
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Option holding the encrypted API key. Deliberately NOT a theme_mod so it is
// excluded from theme-mod exports; autoload disabled so it is only read on
// demand (during an AI request or on the settings screen).
if ( ! defined( 'SPHOTOGRAPHY_AI_KEY_OPTION' ) ) {
    define( 'SPHOTOGRAPHY_AI_KEY_OPTION', 'sphotography_ai_api_key_enc' );
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
        // Fallback for installs with default/empty salts.
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
// API key storage helpers
// ============================================

/** Persist a new raw API key (encrypted). Empty string clears it. */
function sphotography_ai_store_key( $raw_key ) {
    $raw_key = trim( (string) $raw_key );
    if ( '' === $raw_key ) {
        delete_option( SPHOTOGRAPHY_AI_KEY_OPTION );
        return;
    }
    update_option( SPHOTOGRAPHY_AI_KEY_OPTION, sphotography_ai_encrypt( $raw_key ), false );
}

/** True when a key is stored (without decrypting it). */
function sphotography_ai_has_key() {
    $stored = get_option( SPHOTOGRAPHY_AI_KEY_OPTION, '' );
    return is_string( $stored ) && '' !== $stored;
}

/** Decrypted API key for server-side use only. Never expose to the client. */
function sphotography_ai_get_key() {
    return sphotography_ai_decrypt( get_option( SPHOTOGRAPHY_AI_KEY_OPTION, '' ) );
}

// ============================================
// Config accessors
// ============================================

function sphotography_ai_is_enabled() {
    return (bool) sphotography_get_mod( 'ai_enabled' );
}

function sphotography_ai_get_base_url() {
    return rtrim( (string) sphotography_get_mod( 'ai_base_url' ), '/' );
}

function sphotography_ai_get_model() {
    return trim( (string) sphotography_get_mod( 'ai_model' ) );
}

/** True when the module is enabled AND fully configured (base/key/model). */
function sphotography_ai_is_ready() {
    return sphotography_ai_is_enabled()
        && '' !== sphotography_ai_get_base_url()
        && '' !== sphotography_ai_get_model()
        && sphotography_ai_has_key();
}

/**
 * Resolve the chat-completions endpoint from a configured base URL. Accepts a
 * bare base ("https://api.openai.com/v1") or a full endpoint already ending in
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
// Reserved AI interface — every AI feature calls this
// ============================================

/**
 * Send a chat-completion request to the configured OpenAI-compatible endpoint.
 *
 * @param array $messages OpenAI-format messages:
 *                        [ ['role'=>'system','content'=>...], ['role'=>'user','content'=>...] ]
 * @param array $args     Optional: model, temperature, max_tokens, timeout,
 *                        response_format.
 * @return string|WP_Error Model text on success, WP_Error on failure.
 */
function sphotography_ai_chat( $messages, $args = array() ) {
    if ( ! sphotography_ai_is_enabled() ) {
        return new WP_Error( 'ai_disabled', __( 'AI 功能未启用。请在「实验性功能」中开启并配置。', 'sphotography' ) );
    }

    $base  = sphotography_ai_get_base_url();
    $key   = sphotography_ai_get_key();
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
    $ready = sphotography_ai_is_ready();
    ?>
    <div class="sphotography-ai-box">
        <p class="sphotography-ai-warning">
            <?php esc_html_e( '实验性功能：AI 生成内容可能不准确或凭空捏造，请务必人工核对。你的文章内容会被发送到你所配置的第三方服务商，并可能产生费用。', 'sphotography' ); ?>
        </p>

        <?php if ( ! $ready ) : ?>
            <p class="sphotography-ai-notready">
                <?php
                printf(
                    /* translators: %s: settings page link */
                    wp_kses( __( 'AI 接口尚未配置完整，请先在 <a href="%s">主题设置 → 实验性功能</a> 中填写 Base URL、API Key 与模型名称。', 'sphotography' ), array( 'a' => array( 'href' => array() ) ) ),
                    esc_url( admin_url( 'admin.php?page=sphotography-settings#sp-mod-experimental' ) )
                );
                ?>
            </p>
        <?php else : ?>
            <?php wp_nonce_field( 'sphotography_ai_action', 'sphotography_ai_nonce' ); ?>

            <div class="sphotography-ai-section">
                <label class="sphotography-ai-label" for="sphotography-ai-keywords"><?php esc_html_e( '根据关键词扩写', 'sphotography' ); ?></label>
                <textarea id="sphotography-ai-keywords" rows="3" placeholder="<?php esc_attr_e( '输入关键词或提纲，如：京都, 秋天, 银杏, 独自旅行', 'sphotography' ); ?>"></textarea>
                <button type="button" class="button" id="sphotography-ai-expand-btn"><?php esc_html_e( '生成正文', 'sphotography' ); ?></button>
                <div class="sphotography-ai-result" id="sphotography-ai-expand-result" hidden>
                    <div class="sphotography-ai-preview" id="sphotography-ai-expand-preview"></div>
                    <button type="button" class="button button-primary" id="sphotography-ai-insert-btn"><?php esc_html_e( '插入正文', 'sphotography' ); ?></button>
                </div>
            </div>

            <div class="sphotography-ai-section">
                <label class="sphotography-ai-label"><?php esc_html_e( 'AI 自动标签', 'sphotography' ); ?></label>
                <p class="sphotography-ai-hint"><?php esc_html_e( '根据正文内容建议标签，点击采用（写入文章标签）。不会修改地区标签。', 'sphotography' ); ?></p>
                <button type="button" class="button" id="sphotography-ai-tags-btn"><?php esc_html_e( '建议标签', 'sphotography' ); ?></button>
                <div class="sphotography-ai-tags" id="sphotography-ai-tags-result"></div>
            </div>

            <div class="sphotography-ai-status" id="sphotography-ai-status" aria-live="polite"></div>
        <?php endif; ?>
    </div>
    <?php
}

// ============================================
// Enqueue meta-box script (post edit screen only, module enabled)
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
    // Meta-box styles — attach to WP admin's always-present "common" handle.
    $ai_css = '
        .sphotography-ai-box .sphotography-ai-warning {
            font-size: 12px; line-height: 1.6; color: #8a5a00;
            background: #fff8e5; border: 1px solid #ffe1a8;
            border-radius: 6px; padding: 8px 10px; margin: 0 0 12px;
        }
        .sphotography-ai-notready { font-size: 12px; color: #b32d2e; }
        .sphotography-ai-section { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #eee; }
        .sphotography-ai-section:last-of-type { border-bottom: none; }
        .sphotography-ai-label { display: block; font-weight: 600; margin-bottom: 6px; }
        .sphotography-ai-hint { font-size: 11px; color: #757575; margin: 0 0 8px; }
        .sphotography-ai-box textarea { width: 100%; margin-bottom: 8px; }
        .sphotography-ai-result { margin-top: 10px; }
        .sphotography-ai-preview {
            max-height: 220px; overflow: auto; white-space: pre-wrap;
            font-size: 12px; line-height: 1.7; background: #f6f7f7;
            border: 1px solid #dcdcde; border-radius: 6px; padding: 10px; margin-bottom: 8px;
        }
        .sphotography-ai-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .sphotography-ai-chip {
            border: 1px solid #c3c4c7; background: #fff; color: #2c3338;
            border-radius: 14px; padding: 3px 10px; font-size: 12px; cursor: pointer;
        }
        .sphotography-ai-chip:hover { border-color: #2271b1; color: #2271b1; }
        .sphotography-ai-chip.is-added { background: #edfaf1; border-color: #46b450; color: #46b450; cursor: default; }
        .sphotography-ai-status { font-size: 12px; margin-top: 8px; min-height: 1em; }
    ';
    wp_add_inline_style( 'common', $ai_css );

    wp_localize_script( 'sphotography-ai-metabox', 'SphotographyAI', array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'sphotography_ai_action' ),
        'i18n'    => array(
            'working'    => __( '生成中，请稍候…', 'sphotography' ),
            'tagWorking' => __( '分析中…', 'sphotography' ),
            'noContent'  => __( '请先填写关键词。', 'sphotography' ),
            'noBody'     => __( '正文内容太少，无法分析标签。', 'sphotography' ),
            'inserted'   => __( '已插入正文末尾。', 'sphotography' ),
            'tagAdded'   => __( '已添加', 'sphotography' ),
            'error'      => __( '出错了：', 'sphotography' ),
        ),
    ) );
}
add_action( 'admin_enqueue_scripts', 'sphotography_ai_enqueue_editor' );

// ============================================
// AJAX: keyword expansion
// ============================================
function sphotography_ai_ajax_expand() {
    if ( ! check_ajax_referer( 'sphotography_ai_action', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $keywords = isset( $_POST['keywords'] ) ? sanitize_textarea_field( wp_unslash( $_POST['keywords'] ) ) : '';
    $title    = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
    if ( '' === trim( $keywords ) ) {
        wp_send_json_error( __( '请先填写关键词。', 'sphotography' ) );
    }

    $user_prompt = '';
    if ( '' !== $title ) {
        $user_prompt .= sprintf( __( "文章标题：%s\n", 'sphotography' ), $title );
    }
    $user_prompt .= sprintf( __( "请根据以下关键词/提纲，扩写成一篇结构完整、语言流畅的博客文章正文（使用简体中文，段落之间用空行分隔，可含小标题，不要包含标题行）：\n\n%s", 'sphotography' ), $keywords );

    $messages = array(
        array( 'role' => 'system', 'content' => __( '你是一位中文博客写作助手，擅长把零散的关键词扩写成自然、真诚、有细节的文章。只输出正文，不要额外解释。', 'sphotography' ) ),
        array( 'role' => 'user', 'content' => $user_prompt ),
    );

    $result = sphotography_ai_chat( $messages, array( 'temperature' => 0.8, 'max_tokens' => 2048 ) );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }

    wp_send_json_success( array( 'content' => $result ) );
}
add_action( 'wp_ajax_sphotography_ai_expand', 'sphotography_ai_ajax_expand' );

// ============================================
// AJAX: auto tag suggestions (native post_tag only)
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
    // Keep the prompt bounded regardless of article length.
    $content = mb_substr( $content, 0, 4000 );

    // Feed existing tags so the model prefers reusing them over near-duplicates.
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
// AJAX: test connection (settings page)
// ============================================
function sphotography_ai_ajax_test() {
    if ( ! check_ajax_referer( 'sphotography_ai_test', 'nonce', false ) ) {
        wp_send_json_error( __( '安全校验失败。', 'sphotography' ) );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( __( '权限不足。', 'sphotography' ) );
    }

    $messages = array(
        array( 'role' => 'user', 'content' => 'ping' ),
    );
    $result = sphotography_ai_chat( $messages, array( 'temperature' => 0, 'max_tokens' => 5, 'timeout' => 30 ) );
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    wp_send_json_success( array( 'reply' => mb_substr( (string) $result, 0, 40 ) ) );
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
