/**
 * Sphotography AI meta box (experimental) — v1.3.0
 *
 * Editor panel actions:
 *   - 文章补全: post text + images (+ optional keywords, style, length) → HTML,
 *     previewed then appended as native blocks.
 *   - 润色: post text + images (+ style) → HTML, previewed then replaces content.
 *   - AI 自动标签: text-only tag suggestions → chips → add to post tags.
 *
 * All model calls go through admin-ajax; keys stay server-side. Images are sent
 * as {id,url} references; PHP reads/downscales/base64s them.
 */
(function ($) {
    'use strict';

    var cfg = window.SphotographyAI || {};
    var i18n = cfg.i18n || {};

    // ---- Editor bridges (block editor + classic) ----
    function hasBlockEditor() {
        return !!(window.wp && wp.data && wp.data.select('core/block-editor'));
    }

    function getTitle() {
        try {
            if (window.wp && wp.data && wp.data.select('core/editor')) {
                return wp.data.select('core/editor').getEditedPostAttribute('title') || '';
            }
        } catch (e) {}
        var el = document.getElementById('title');
        return el ? el.value : '';
    }

    function getContentHtml() {
        try {
            if (window.wp && wp.data && wp.data.select('core/editor')) {
                return wp.data.select('core/editor').getEditedPostAttribute('content') || '';
            }
        } catch (e) {}
        if (window.tinymce) {
            var ed = window.tinymce.get('content');
            if (ed && !ed.isHidden()) { return ed.getContent(); }
        }
        var ta = document.getElementById('content');
        return ta ? ta.value : '';
    }

    function getContentText() {
        var html = getContentHtml();
        var div = document.createElement('div');
        div.innerHTML = html;
        return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
    }

    // Gather images referenced in the post as {id,url}.
    function getImages() {
        var acc = [];
        if (hasBlockEditor()) {
            var walk = function (blocks) {
                (blocks || []).forEach(function (b) {
                    if (b.name === 'core/image') {
                        acc.push({ id: b.attributes.id || 0, url: b.attributes.url || '' });
                    }
                    if (b.innerBlocks && b.innerBlocks.length) { walk(b.innerBlocks); }
                });
            };
            try { walk(wp.data.select('core/block-editor').getBlocks()); } catch (e) {}
        }
        if (!acc.length) {
            // Classic editor / fallback: parse <img> from the content HTML.
            var div = document.createElement('div');
            div.innerHTML = getContentHtml();
            div.querySelectorAll('img').forEach(function (img) {
                var id = 0;
                var m = (img.className || '').match(/wp-image-(\d+)/);
                if (m) { id = parseInt(m[1], 10); }
                acc.push({ id: id, url: img.getAttribute('src') || '' });
            });
        }
        // De-dupe and cap.
        var seen = {}, out = [];
        acc.forEach(function (im) {
            var key = (im.id || 0) + '|' + (im.url || '');
            if (!seen[key] && (im.id || im.url)) { seen[key] = 1; out.push(im); }
        });
        return out.slice(0, cfg.maxImages || 6);
    }

    var TEXT_BLOCKS = ['core/paragraph', 'core/heading', 'core/list', 'core/list-item', 'core/quote', 'core/preformatted', 'core/pullquote'];
    function isTextBlock(name) { return TEXT_BLOCKS.indexOf(name) >= 0; }

    // Insert HTML into the editor. mode: 'append' | 'replace'.
    // For 'replace' (polish) in the block editor, non-text blocks (images,
    // galleries, embeds…) are PRESERVED — only text blocks are rewritten — so
    // polishing never silently deletes the post's media.
    function applyHtml(html, mode) {
        if (hasBlockEditor() && wp.blocks && wp.blocks.rawHandler) {
            var blocks = wp.blocks.rawHandler({ HTML: html });
            if (!blocks || !blocks.length) { return false; }
            var dispatch = wp.data.dispatch('core/block-editor');
            if (mode === 'replace') {
                var existing = wp.data.select('core/block-editor').getBlocks();
                var result = [];
                var inserted = false;
                existing.forEach(function (b) {
                    if (isTextBlock(b.name)) {
                        if (!inserted) { result = result.concat(blocks); inserted = true; }
                        // drop the old text block
                    } else {
                        result.push(b); // keep media / other blocks
                    }
                });
                if (!inserted) { result = result.concat(blocks); }
                dispatch.resetBlocks(result);
            } else {
                var all = wp.data.select('core/block-editor').getBlocks();
                dispatch.insertBlocks(blocks, all.length);
            }
            return true;
        }
        // Classic editor / textarea.
        if (window.tinymce) {
            var ed = window.tinymce.get('content');
            if (ed && !ed.isHidden()) {
                ed.setContent(mode === 'replace' ? html : (ed.getContent() + '\n' + html));
                ed.save();
                return true;
            }
        }
        var ta = document.getElementById('content');
        if (ta) {
            ta.value = mode === 'replace' ? html : (ta.value + (ta.value ? '\n\n' : '') + html);
            return true;
        }
        return false;
    }

    function addPostTag(tag) {
        var $field = $('#new-tag-post_tag');
        if ($field.length) {
            var $add = $('.tagadd').first();
            $field.val(tag);
            if ($add.length) { $add.trigger('click'); return true; }
        }
        try {
            if (window.wp && wp.data && wp.data.dispatch('core/editor')) {
                var current = wp.data.select('core/editor').getEditedPostAttribute('tags') || [];
                return wp.apiFetch({ path: '/wp/v2/tags', method: 'POST', data: { name: tag } })
                    .then(function (t) {
                        wp.data.dispatch('core/editor').editPost({ tags: current.concat([t.id]) });
                        return true;
                    })
                    .catch(function () {
                        return wp.apiFetch({ path: '/wp/v2/tags?search=' + encodeURIComponent(tag) }).then(function (list) {
                            if (list && list.length) {
                                wp.data.dispatch('core/editor').editPost({ tags: current.concat([list[0].id]) });
                                return true;
                            }
                            return false;
                        });
                    });
            }
        } catch (e) {}
        return false;
    }

    function setStatus(msg, isError) {
        $('#sphotography-ai-status').text(msg || '').css('color', isError ? '#e05a4d' : '#757575');
    }

    // Show a note when images exist but analysis is off.
    function refreshImageNote() {
        var $note = $('#sphotography-ai-imgnote');
        if (!$note.length) { return; }
        if (cfg.imageActive) { $note.prop('hidden', true).text(''); return; }
        var n = getImages().length;
        if (n > 0 && i18n.imgNoteOff) {
            $note.prop('hidden', false).text(i18n.imgNoteOff.replace('%d', n));
        } else {
            $note.prop('hidden', true).text('');
        }
    }

    $(function () {
        if (!$('#sphotography-ai-box').length) { return; }

        // Length only affects 补全; make that explicit.
        $('#sphotography-ai-length-hint').prop('hidden', false)
            .text('长度仅影响「文章补全」，润色保持原篇幅。');

        refreshImageNote();

        var lastComplete = '';
        var lastPolish = '';

        // ----- 文章补全 -----
        $('#sphotography-ai-complete-btn').on('click', function () {
            var btn = $(this);
            var kw = $('#sphotography-ai-keywords').val() || '';
            var text = getContentText();
            var images = getImages();
            if (!text && !kw.trim() && !images.length) {
                setStatus(i18n.noContent, true);
                return;
            }
            btn.prop('disabled', true);
            setStatus(i18n.working, false);
            $.post(cfg.ajaxUrl, {
                action: 'sphotography_ai_complete',
                nonce: cfg.nonce,
                text: getContentHtml(),
                keywords: kw,
                style: $('#sphotography-ai-style').val(),
                length: $('#sphotography-ai-length').val(),
                images: images
            }).done(function (res) {
                if (res && res.success) {
                    lastComplete = res.data.html || '';
                    $('#sphotography-ai-complete-preview').text($('<div>').html(lastComplete).text());
                    $('#sphotography-ai-complete-result').prop('hidden', false);
                    setStatus('', false);
                } else {
                    setStatus(i18n.error + ((res && res.data) || ''), true);
                }
            }).fail(function () {
                setStatus(i18n.error + 'request failed', true);
            }).always(function () {
                btn.prop('disabled', false);
            });
        });

        $('#sphotography-ai-insert-btn').on('click', function () {
            if (lastComplete && applyHtml(lastComplete, 'append')) {
                setStatus(i18n.inserted, false);
                $('#sphotography-ai-complete-result').prop('hidden', true);
            }
        });

        // ----- 润色 -----
        $('#sphotography-ai-polish-btn').on('click', function () {
            var btn = $(this);
            var text = getContentText();
            if (!text) { setStatus(i18n.noPolish, true); return; }
            btn.prop('disabled', true);
            setStatus(i18n.working, false);
            $.post(cfg.ajaxUrl, {
                action: 'sphotography_ai_polish',
                nonce: cfg.nonce,
                text: getContentHtml(),
                style: $('#sphotography-ai-style').val(),
                images: getImages()
            }).done(function (res) {
                if (res && res.success) {
                    lastPolish = res.data.html || '';
                    $('#sphotography-ai-polish-preview').text($('<div>').html(lastPolish).text());
                    $('#sphotography-ai-polish-result').prop('hidden', false);
                    setStatus('', false);
                } else {
                    setStatus(i18n.error + ((res && res.data) || ''), true);
                }
            }).fail(function () {
                setStatus(i18n.error + 'request failed', true);
            }).always(function () {
                btn.prop('disabled', false);
            });
        });

        $('#sphotography-ai-apply-btn').on('click', function () {
            if (lastPolish && applyHtml(lastPolish, 'replace')) {
                setStatus(i18n.applied, false);
                $('#sphotography-ai-polish-result').prop('hidden', true);
            }
        });

        // ----- AI 自动标签 -----
        $('#sphotography-ai-tags-btn').on('click', function () {
            var btn = $(this);
            var body = getContentText();
            if (body.length < 20 && !getTitle()) { setStatus(i18n.noBody, true); return; }
            btn.prop('disabled', true);
            setStatus(i18n.tagWorking, false);
            $.post(cfg.ajaxUrl, {
                action: 'sphotography_ai_tags',
                nonce: cfg.nonce,
                content: body,
                title: getTitle()
            }).done(function (res) {
                if (res && res.success && res.data.tags) {
                    renderTagChips(res.data.tags);
                    setStatus('', false);
                } else {
                    setStatus(i18n.error + ((res && res.data) || ''), true);
                }
            }).fail(function () {
                setStatus(i18n.error + 'request failed', true);
            }).always(function () {
                btn.prop('disabled', false);
            });
        });

        function renderTagChips(tags) {
            var $wrap = $('#sphotography-ai-tags-result').empty();
            tags.forEach(function (tag) {
                var $chip = $('<button type="button" class="sphotography-ai-chip"></button>').text('+ ' + tag);
                $chip.on('click', function () {
                    var ok = addPostTag(tag);
                    if (ok && typeof ok.then === 'function') {
                        ok.then(function () { markAdded($chip); });
                    } else if (ok) {
                        markAdded($chip);
                    }
                });
                $wrap.append($chip);
            });
        }

        function markAdded($chip) {
            $chip.addClass('is-added').prop('disabled', true);
            setStatus(i18n.tagAdded, false);
        }
    });
})(jQuery);
