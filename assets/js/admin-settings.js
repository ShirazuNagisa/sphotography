/**
 * Sphotography admin settings interactions.
 *
 * Kept outside PHP so JavaScript quotes cannot break theme loading.
 */
(function ($) {
    'use strict';

    var config = window.SphotographyAdmin || {};

    function debounce(fn, delay) {
        var t = null;
        return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, delay); };
    }

    function semverGreater(a, b) {
        var pa = String(a || '').split('.');
        var pb = String(b || '').split('.');
        for (var i = 0; i < 3; i++) {
            var na = parseInt(pa[i], 10) || 0;
            var nb = parseInt(pb[i], 10) || 0;
            if (na > nb) return true;
            if (na < nb) return false;
        }
        return false;
    }

    $(function () {
        // ----- Live map preview (v1.2.6): debounced iframe reload -----
        var $preview = $('#sphotography-map-preview');
        var $frame = $('#sphotography-map-preview-frame');

        function buildPreviewUrl() {
            var base = $preview.data('preview-base');
            var params = {
                sp_primary: $('.sphotography-color-picker').val(),
                sp_night: $('#sphotography-night-mode').val(),
                sp_mapstyle: $('#sphotography-map-style').val(),
                sp_mapurl: $('#sphotography-map-style-custom-url').val(),
                sp_markermode: $('#sphotography-marker-mode').val(),
                sp_cluster: $('#sphotography-cluster-radius').val(),
                sp_goo: $('#sphotography-droplet-goo-strength').val(),
                sp_granularity: $('#sphotography-region-granularity').val(),
                sp_intensity: $('#sphotography-region-intensity').val(),
                sp_cachebust: Date.now()
            };
            var sep = String(base).indexOf('?') >= 0 ? '&' : '?';
            var qs = Object.keys(params).filter(function (k) {
                return params[k] !== undefined && params[k] !== null && params[k] !== '';
            }).map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            }).join('&');
            return base + sep + qs;
        }

        var reloadPreview = debounce(function () {
            if (!$preview.length) { return; }
            $preview.addClass('is-refreshing');
            $frame.attr('src', buildPreviewUrl());
        }, 350);

        if ($preview.length && $frame.length) {
            $frame.on('load', function () { $preview.removeClass('is-refreshing'); });
            // Reload when any map-related control changes.
            $('#sphotography-night-mode, #sphotography-map-style, #sphotography-map-style-custom-url, #sphotography-marker-mode, #sphotography-cluster-radius, #sphotography-droplet-goo-strength, #sphotography-region-granularity, #sphotography-region-intensity')
                .on('change input', reloadPreview);
            // Initial load.
            $preview.addClass('is-refreshing');
            $frame.attr('src', buildPreviewUrl());
        }

        $('.sphotography-color-picker').wpColorPicker({
            change: function () {
                $('.sphotography-preset-btn').removeClass('active');
                reloadPreview();
            }
        });

        $('.sphotography-preset-btn').on('click', function () {
            var color = $(this).data('color');
            $('.sphotography-color-picker').iris('color', color).val(color);
            $('.sphotography-preset-btn').removeClass('active');
            $(this).addClass('active');
            reloadPreview();
        });

        $('#sphotography-date-format').on('change', function () {
            $('.sphotography-custom-date-field').toggle($(this).val() === 'custom');
        });

        $('#sphotography-map-style').on('change', function () {
            $('.sphotography-custom-mapstyle-field').toggle($(this).val() === 'custom');
        });

        // Marker mode (v1.2.6): show only the fields relevant to the chosen
        // mode. Each mode-specific field carries data-sp-mode="a b" listing the
        // modes it applies to.
        var $markerMode = $('#sphotography-marker-mode');
        function applyMarkerMode() {
            var mode = $markerMode.val();
            $('.sp-mode-field').each(function () {
                var modes = String($(this).data('sp-mode') || '').split(/\s+/);
                $(this).toggle(modes.indexOf(mode) !== -1);
            });
        }
        if ($markerMode.length) {
            $markerMode.on('change', applyMarkerMode);
            applyMarkerMode();
        }

        // Rebuild administrative-region index (batched, region mode).
        $('#sphotography-rebuild-geo').on('click', function () {
            var btn = $(this);
            var status = $('#sphotography-rebuild-geo-status');
            if (!config.geoRebuildNonce) { return; }
            btn.prop('disabled', true);

            function runBatch(offset) {
                $.post(config.ajaxUrl, {
                    action: 'sphotography_rebuild_geo_index',
                    nonce: config.geoRebuildNonce,
                    offset: offset
                }).done(function (res) {
                    if (!res || !res.success) {
                        status.text((res && res.data && res.data.message) || '重建失败').css('color', '#e74c3c');
                        btn.prop('disabled', false);
                        return;
                    }
                    var d = res.data;
                    status.text('处理中… ' + d.done + ' / ' + d.total).css('color', '');
                    if (d.finished) {
                        status.text('✓ 完成，已索引 ' + d.total + ' 张照片').css('color', '#2ecc71');
                        btn.prop('disabled', false);
                    } else {
                        runBatch(d.next_offset);
                    }
                }).fail(function () {
                    status.text('✗ 请求失败').css('color', '#e74c3c');
                    btn.prop('disabled', false);
                });
            }
            status.text('开始重建…').css('color', '');
            runBatch(0);
        });

        // Generic slider readouts (v1.2.5): each .sphotography-slider-row pairs
        // a range input with a .sphotography-slider-val; an optional
        // data-suffix on the value element is appended to the number.
        $('.sphotography-slider-row').each(function () {
            var $range = $(this).find('input[type="range"]');
            var $val = $(this).find('.sphotography-slider-val');
            var suffix = $val.data('suffix') || '';
            $range.on('input change', function () {
                $val.text($(this).val() + suffix);
            });
        });

        // Advanced motion block: collapsible reveal.
        $('#sphotography-motion-advanced-toggle').on('click', function () {
            var expanded = $(this).attr('aria-expanded') === 'true';
            $(this).attr('aria-expanded', expanded ? 'false' : 'true');
            $('#sphotography-motion-advanced').prop('hidden', expanded);
        });

        // ----- Right-side index (TOC): smooth scroll + scrollspy -----
        var $tocLinks = $('.sphotography-toc-link');
        if ($tocLinks.length) {
            var sections = [];
            $tocLinks.each(function () {
                var id = $(this).data('target');
                var el = document.getElementById(id);
                if (el) { sections.push({ id: id, el: el }); }
            });

            $tocLinks.on('click', function (e) {
                var id = $(this).data('target');
                var el = document.getElementById(id);
                if (!el) { return; }
                e.preventDefault();
                var top = el.getBoundingClientRect().top + window.pageYOffset - 46;
                window.scrollTo({ top: top, behavior: 'smooth' });
            });

            var setActive = function (id) {
                $tocLinks.removeClass('active');
                $tocLinks.filter('[data-target="' + id + '"]').addClass('active');
            };

            var onScroll = function () {
                var probe = window.pageYOffset + 120;
                var current = sections.length ? sections[0].id : null;
                for (var i = 0; i < sections.length; i++) {
                    if (sections[i].el.offsetTop <= probe) {
                        current = sections[i].id;
                    }
                }
                if (current) { setActive(current); }
            };

            var scrollScheduled = false;
            $(window).on('scroll', function () {
                if (scrollScheduled) { return; }
                scrollScheduled = true;
                window.requestAnimationFrame(function () {
                    scrollScheduled = false;
                    onScroll();
                });
            });
            onScroll();
        }

        $('#sphotography-reset-btn').on('click', function () {
            if (window.confirm(config.resetConfirm || 'Reset all settings?')) {
                $('#sphotography-reset-form').trigger('submit');
            }
        });

        $('#sphotography-check-update').on('click', function () {
            var btn = $(this);
            var result = $('#sphotography-update-result');
            var status = $('#sphotography-version-status');
            btn.prop('disabled', true).text('检查中...');
            result.html('<p style="color:#718096;">正在检查更新...</p>');

            $.ajax({
                url: config.updateUrl,
                type: 'GET',
                dataType: 'json',
                timeout: 15000
            }).done(function (data) {
                var latest = data.version || '';
                var current = config.currentVersion || '';
                var html;
                if (!latest) {
                    html = '<p style="color:#e67e22;">ℹ 无法解析版本信息。</p>';
                    status.text('检查失败').css('color', '#e67e22');
                } else if (semverGreater(latest, current)) {
                    html = '<p style="color:#e67e22;font-weight:600;">★ 发现新版本: v' + latest + '</p>'
                        + '<p style="margin-top:6px;">当前版本: v' + current + '</p>'
                        + '<p style="margin-top:8px;"><a href="' + config.releaseUrl + '" target="_blank" rel="noopener" class="button button-secondary">查看 Release</a></p>';
                    status.text('有新版本: v' + latest).css('color', '#e67e22');
                    if (data.changelog) {
                        html += '<div style="margin-top:10px;padding:10px 14px;background:#f8f9fa;border-radius:8px;font-size:0.8125rem;color:#555;max-height:200px;overflow-y:auto;">'
                            + '<strong>更新说明:</strong><br>' + $('<div>').text(data.changelog).html().replace(/\n/g, '<br>') + '</div>';
                    }
                } else {
                    html = '<p style="color:#2ecc71;font-weight:600;">✓ 当前 v' + current + ' 已是最新版本</p>';
                    status.text('已是最新').css('color', '#2ecc71');
                }
                result.html(html);
            }).fail(function () {
                result.html('<p style="color:#e74c3c;">✗ 无法连接更新服务器，请前往 GitHub Releases 手动查看。</p>');
                status.text('检查失败').css('color', '#e74c3c');
            }).always(function () {
                btn.prop('disabled', false).text('检查更新');
            });
        });

        $('#sphotography-do-update').on('click', function () {
            var btn = $(this);
            var result = $('#sphotography-update-result');
            if (!window.confirm(config.updateConfirm || 'Update the theme from master?')) return;

            btn.prop('disabled', true).text('下载更新中...');
            result.html('<p style="color:#718096;">正在从 master 分支下载更新...</p>');
            $.post(config.ajaxUrl, {
                action: 'sphotography_do_update',
                branch: 'master',
                nonce: config.updateNonce
            }).done(function (response) {
                if (response.success) {
                    result.html('<p style="color:#2ecc71;font-weight:600;">✓ 更新完成！请重新激活主题以确保生效。</p>'
                        + '<p><a href="' + window.location.href + '" class="button button-primary">刷新页面</a></p>');
                } else {
                    result.html('<p style="color:#e74c3c;">✗ 更新失败: ' + $('<div>').text(response.data || '未知错误').html() + '</p>');
                }
            }).fail(function () {
                result.html('<p style="color:#e74c3c;">✗ 请求失败，请查看服务器错误日志</p>');
            }).always(function () {
                btn.prop('disabled', false).text('从 master 分支更新主题');
            });
        });

        // ----- Experimental AI: test connection (v1.2.9) -----
        $('#sphotography-ai-test').on('click', function () {
            var btn = $(this);
            var status = $('#sphotography-ai-test-status');
            btn.prop('disabled', true);
            status.text(config.aiTesting || 'Testing…').css('color', 'var(--sp-text-muted)');
            $.post(config.ajaxUrl, {
                action: 'sphotography_ai_test',
                nonce: config.aiTestNonce
            }).done(function (response) {
                if (response && response.success) {
                    status.text('✓ ' + (config.aiTestOk || 'OK')).css('color', '#2ecc71');
                } else {
                    status.text('✗ ' + (config.aiTestFail || '') + $('<div>').text((response && response.data) || '').html()).css('color', '#e05a4d');
                }
            }).fail(function () {
                status.text('✗ ' + (config.aiTestFail || '') + 'request failed').css('color', '#e05a4d');
            }).always(function () {
                btn.prop('disabled', false);
            });
        });
    });
})(jQuery);
