/**
 * Common utilities shared across all dashboard pages.
 * Usage: <script src="/static/js/common.js"></script>
 */
(function() {
    'use strict';

    var API_BASE = '';

    function escHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escAttr(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setTxt(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text == null ? '' : String(text);
    }

    function authFetch(url, opts) {
        opts = opts || {};
        var headers = opts.headers || {};
        var token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        opts.headers = headers;
        return fetch(url, opts).then(function(resp) {
            if (resp.status === 401) {
                window.location.href = API_BASE + '/login';
                return Promise.reject(new Error('Unauthorized'));
            }
            if (!resp.ok) {
                return resp.json().catch(function() { return { message: 'HTTP ' + resp.status }; })
                    .then(function(body) {
                        toast(body.message || 'Request failed (' + resp.status + ')', 'error');
                        return Promise.reject(new Error(body.message || resp.status));
                    });
            }
            return resp.json();
        });
    }

    function toast(msg, type) {
        type = type || 'info';
        var container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        var t = document.createElement('div');
        t.className = 'toast ' + type;

        // SVG icons (Lucide style, 16x16)
        var iconSvgs = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        t.innerHTML = (iconSvgs[type] || '') + Common.escHtml(msg);
        container.appendChild(t);
        setTimeout(function() {
            t.style.opacity = '0';
            t.style.transform = 'translateX(40px)';
            t.style.transition = 'all .3s';
            setTimeout(function() { t.remove(); }, 300);
        }, 3500);
    }

    // 节流错误 toast — 防止轮询失败时弹出大量重复 toast
    var _errorToastCount = 0;
    var _errorToastTimer = null;
    function throttledErrorToast(msg) {
        _errorToastCount++;
        if (_errorToastCount <= 2) {
            toast(msg, 'error');
        } else if (_errorToastCount === 3) {
            toast('连接异常，正在自动重试...', 'error');
        }
        clearTimeout(_errorToastTimer);
        _errorToastTimer = setTimeout(function() { _errorToastCount = 0; }, 30000);
    }

    function openModal(title, bodyEl, footerEl) {
        var overlay = document.getElementById('modalOverlay');
        if (!overlay) return;
        setTxt('modalTitle', title);
        var body = document.getElementById('modalBody');
        if (body) { body.innerHTML = ''; if (bodyEl) body.appendChild(bodyEl); }
        var footer = document.getElementById('modalFooter');
        if (footer) { footer.innerHTML = ''; if (footerEl) footer.appendChild(footerEl); }
        overlay.classList.add('show');
        setTimeout(function() {
            var focusable = overlay.querySelector('input, button, select, textarea, [tabindex]');
            if (focusable) focusable.focus();
        }, 50);
    }

    function closeModal() {
        var overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    function onEvent(id, event, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }

    function initTheme() {
        var saved = localStorage.getItem('theme');
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    function themeToggle() {
        var current = document.documentElement.getAttribute('data-theme');
        if (current === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    }

    function startClock(id) {
        var el = document.getElementById(id);
        if (!el) return;
        function update() {
            var now = new Date();
            var h = String(now.getHours()).padStart(2, '0');
            var m = String(now.getMinutes()).padStart(2, '0');
            var s = String(now.getSeconds()).padStart(2, '0');
            el.textContent = h + ':' + m + ':' + s;
        }
        update();
        setInterval(update, 1000);
    }

    // Sidebar toggle for responsive
    function initSidebarToggle() {
        var btn = document.querySelector('.sidebar-toggle');
        var sidebar = document.querySelector('.sidebar');
        if (btn && sidebar) {
            btn.addEventListener('click', function() {
                sidebar.classList.toggle('open');
            });
        }
    }

    // 从 API 加载当前用户信息并更新侧边栏
    async function loadUserInfo() {
        try {
            var user = await authFetch(API_BASE + '/api/me');
            var avatarEl = document.getElementById('userAvatarInitial');
            var nameEl = document.getElementById('userName');
            if (avatarEl) avatarEl.textContent = (user.name || user.username || '?').charAt(0);
            if (nameEl) nameEl.textContent = user.name || user.username;
        } catch (e) { /* 静默 */ }
    }

    // Export to window.Common
    window.Common = {
        API_BASE: API_BASE,
        escHtml: escHtml,
        escAttr: escAttr,
        setTxt: setTxt,
        authFetch: authFetch,
        toast: toast,
        throttledErrorToast: throttledErrorToast,
        openModal: openModal,
        closeModal: closeModal,
        onEvent: onEvent,
        initTheme: initTheme,
        themeToggle: themeToggle,
        startClock: startClock,
        initSidebarToggle: initSidebarToggle,
        loadUserInfo: loadUserInfo
    };

    // Auto-init theme on load
    initTheme();
    // Auto-load user info when token exists
    if (sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')) {
        loadUserInfo();
    }
})();
