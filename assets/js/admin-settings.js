/**
 * Sphotography admin settings interactions.
 *
 * Kept outside PHP so JavaScript quotes cannot break theme loading.
 */
(function ($) {
    'use strict';

    var config = window.SphotographyAdmin || {};

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
        $('.sphotography-color-picker').wpColorPicker({
            change: function () {
                $('.sphotography-preset-btn').removeClass('active');
            }
        });

        $('.sphotography-preset-btn').on('click', function () {
            var color = $(this).data('color');
            $('.sphotography-color-picker').iris('color', color).val(color);
            $('.sphotography-preset-btn').removeClass('active');
            $(this).addClass('active');
        });

        $('#sphotography-date-format').on('change', function () {
            $('.sphotography-custom-date-field').toggle($(this).val() === 'custom');
        });

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
    });
})(jQuery);
