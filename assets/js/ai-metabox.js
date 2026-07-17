/**
 * Sphotography AI meta box (experimental).
 *
 * Powers the post-editor box: keyword expansion (preview → manual insert) and
 * AI tag suggestions (chips → click to add to the post's tags). All model
 * calls go through admin-ajax; the API key stays server-side.
 */
(function ($) {
    'use strict';

    var cfg = window.SphotographyAI || {};
    var i18n = cfg.i18n || {};

    // --- Editor content bridge (works for both classic + block editor) ---
    function getTitle() {
        try {
            if (window.wp && wp.data && wp.data.select('core/editor')) {
                return wp.data.select('core/editor').getEditedPostAttribute('title') || '';
            }
        } catch (e) {}
        var el = document.getElementById('title');
        return el ? el.value : '';
    }

    function getContent() {
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

    // Append plain text (as paragraphs) to the end of the post body.
    function appendContent(text) {
        var paras = String(text).split(/\n{2,}/).map(function (p) {
            return p.trim();
        }).filter(Boolean);

        try {
            if (window.wp && wp.data && wp.data.select('core/editor') && wp.blocks && wp.blocks.createBlock) {
                var newBlocks = paras.map(function (p) {
                    return wp.blocks.createBlock('core/paragraph', { content: p.replace(/\n/g, '<br>') });
                });
                var existing = wp.data.select('core/block-editor').getBlocks();
                wp.data.dispatch('core/block-editor').insertBlocks(newBlocks, existing.length);
                return true;
            }
        } catch (e) {}

        var html = paras.map(function (p) { return '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>'; }).join('\n');
        if (window.tinymce) {
            var ed = window.tinymce.get('content');
            if (ed && !ed.isHidden()) {
                ed.setContent(ed.getContent() + '\n' + html);
                ed.save();
                return true;
            }
        }
        var ta = document.getElementById('content');
        if (ta) {
            ta.value = ta.value + (ta.value ? '\n\n' : '') + paras.join('\n\n');
            return true;
        }
        return false;
    }

    function addPostTag(tag) {
        // Classic editor: the tags box uses a comma field named tax_input[post_tag].
        var $field = $('#new-tag-post_tag');
        if ($field.length) {
            var $add = $('.tagadd').first();
            $field.val(tag);
            if ($add.length) { $add.trigger('click'); return true; }
        }
        // Block editor: use the data store's flat-term selector.
        try {
            if (window.wp && wp.data && wp.data.dispatch('core/editor')) {
                var sel = wp.data.select('core/editor');
                var current = sel.getEditedPostAttribute('tags') || [];
                var reg = wp.data.select('core');
                // Resolve or create the term id.
                return wp.apiFetch({
                    path: '/wp/v2/tags',
                    method: 'POST',
                    data: { name: tag }
                }).then(function (t) {
                    wp.data.dispatch('core/editor').editPost({ tags: current.concat([t.id]) });
                    return true;
                }).catch(function (err) {
                    // Term likely exists already — look it up.
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

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function setStatus(msg, isError) {
        var $s = $('#sphotography-ai-status');
        $s.text(msg || '').css('color', isError ? '#e05a4d' : '');
    }

    $(function () {
        var $expandBtn = $('#sphotography-ai-expand-btn');
        if (!$expandBtn.length) { return; }

        var lastExpansion = '';

        // ----- Keyword expansion -----
        $expandBtn.on('click', function () {
            var kw = $('#sphotography-ai-keywords').val();
            if (!kw || !kw.trim()) { setStatus(i18n.noContent, true); return; }

            $expandBtn.prop('disabled', true);
            setStatus(i18n.working, false);

            $.post(cfg.ajaxUrl, {
                action: 'sphotography_ai_expand',
                nonce: cfg.nonce,
                keywords: kw,
                title: getTitle()
            }).done(function (res) {
                if (res && res.success) {
                    lastExpansion = res.data.content || '';
                    $('#sphotography-ai-expand-preview').text(lastExpansion);
                    $('#sphotography-ai-expand-result').prop('hidden', false);
                    setStatus('', false);
                } else {
                    setStatus((i18n.error) + ((res && res.data) || ''), true);
                }
            }).fail(function () {
                setStatus(i18n.error + 'request failed', true);
            }).always(function () {
                $expandBtn.prop('disabled', false);
            });
        });

        $('#sphotography-ai-insert-btn').on('click', function () {
            if (lastExpansion && appendContent(lastExpansion)) {
                setStatus(i18n.inserted, false);
            }
        });

        // ----- Auto tags -----
        var $tagsBtn = $('#sphotography-ai-tags-btn');
        $tagsBtn.on('click', function () {
            var body = getContent().replace(/<[^>]+>/g, ' ');
            if (body.replace(/\s+/g, '').length < 20 && !getTitle()) {
                setStatus(i18n.noBody, true);
                return;
            }
            $tagsBtn.prop('disabled', true);
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
                $tagsBtn.prop('disabled', false);
            });
        });

        function renderTagChips(tags) {
            var $wrap = $('#sphotography-ai-tags-result').empty();
            tags.forEach(function (tag) {
                var $chip = $('<button type="button" class="sphotography-ai-chip"></button>').text('+ ' + tag);
                $chip.on('click', function () {
                    var ok = addPostTag(tag);
                    // addPostTag may return a promise (block editor).
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
