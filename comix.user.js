// ==UserScript==
// @name         Comix Neobrutalism + De-bloat
// @namespace    https://github.com/17Arigato-jwd/neobrutal-scans
// @version      2026-11-21.18
// @description  Neobrutalist skin and debloater for Comix (comix.to): themed dialogs & drawers, animated reader tools + working stretch-to-width, single scrollable full-series chapter list with scanlation-group dropdowns & full-series Select All, read-only comment scores without thread lines, hidden home announcements, and PC hero hover tilt.
// @author       17Arigato-jwd
// @homepageURL  https://github.com/17Arigato-jwd/neobrutal-scans
// @supportURL   https://github.com/17Arigato-jwd/neobrutal-scans/issues
// @updateURL    https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js
// @downloadURL  https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js
// @license      MIT
// @match        https://comix.to/*
// @match        https://*.comix.to/*
// @match        https://comix.ws/*
// @match        https://*.comix.ws/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=comix.to
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      comix.to
// @connect      comix.ws
// @connect      *
// ==/UserScript==

/*
 * Neobrutal Scans — Comix Dedicated Edition
 * Copyright (c) 2026 Varchas Mishra (17Arigato-jwd)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function boot() {
    'use strict';
    if (window.top !== window.self) return;

    /* ====================================================================
     *  LAYER 0: POPUP / AD-GLOBAL NEUTRALIZATION
     * ==================================================================== */
    function neutralizePopups() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const origOpen = typeof win.open === 'function' ? win.open.bind(win) : null;
        const safeOpen = function (url, target, features) {
            if (!url) return null;
            try {
                const u = new URL(String(url), location.href);
                if (u.origin === location.origin) {
                    return origOpen ? origOpen(u.href, target, features) : null;
                }
            } catch (_) {}
            return null;
        };
        try { win.open = safeOpen; } catch (_) {}
        try { window.open = safeOpen; } catch (_) {}
    }
    neutralizePopups();

    const sniffedChapterApi = { templateUrl: null, byHid: new Map() };
    const sniffedCommentCounts = new Map();
    function extractApiChapterItems(json) {
        if (!json || typeof json !== 'object') return [];
        const r = json.result || json.data || json;
        if (Array.isArray(r)) return r;
        if (Array.isArray(r.items)) return r.items;
        if (Array.isArray(r.chapters)) return r.chapters;
        if (Array.isArray(r.list)) return r.list;
        return [];
    }
    (function installChapterApiSniffer() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const origFetch = typeof win.fetch === 'function' ? win.fetch.bind(win) : null;
        if (!origFetch || win.__mdComixFetchHooked) return;
        win.__mdComixFetchHooked = true;
        try {
            win.fetch = function (input, init) {
                const p = origFetch(input, init);
                try {
                    const reqUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                    if (reqUrl) {
                        const u = new URL(reqUrl, location.href);
                        if (u.origin === location.origin && /chapter/i.test(u.pathname)) {
                            const hidFromUrl = (u.pathname.match(/\/(?:manga|title|comic|series)\/([^/]+)\/chapters/i)?.[1])
                                || (location.pathname.match(/^\/title\/([a-z0-9]+)(?:-|$)/i)?.[1]);
                            if (hidFromUrl) {
                                p.then(res => res && res.ok && res.clone().json().then(json => {
                                    if (extractApiChapterItems(json).length) {
                                        sniffedChapterApi.templateUrl = u.pathname + u.search;
                                        sniffedChapterApi.byHid.set(hidFromUrl, { url: u.href, json });
                                    }
                                }).catch(() => {})).catch(() => {});
                            }
                        } else if (u.origin === location.origin && /comment/i.test(u.pathname)) {
                            const curPath = location.pathname;
                            p.then(res => res && res.ok && res.clone().json().then(json => {
                                const total = json?.result?.pagination?.total ?? json?.pagination?.total ?? json?.total ?? json?.count ?? json?.data?.total;
                                if (typeof total === 'number' && total >= 0) {
                                    sniffedCommentCounts.set(curPath, total);
                                    try { if (reader.rbar) syncReaderBars(chapterContext()); } catch (_) {}
                                }
                            }).catch(() => {})).catch(() => {});
                        }
                    }
                } catch (_) {}
                return p;
            };
        } catch (_) {}
    })();

    /* ====================================================================
     *  CONFIG & STATE INITIALIZATION
     * ==================================================================== */
    const CONFIG = {
        maxWidth: 1280,
        backToTop: true,
        heroAutoplay: true,
        heroMaxSlides: 10,
        hidePromotions: true,
        hideAuthUI: true,
        hideUserCollections: true,
        hideHomeAnnouncements: true,
        historyLimit: 16,
        themeDefault: 'main',
        reader: {
            baseWidth: 800,
            zoomSteps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2],
            concurrency: 4,
        },
        batchLimit: 500,
        readerDockOnTap: true,
        dockHideOnScroll: true,
        dockScrollPx: 150,
        readerHeaderAutoHide: true,
    };

    const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
    const SERIES_PATH = /^\/title\/[^/]+\/?$/;
    const CHAPTER_PATH = /^(\/title\/[^/]+)\/(\d+)-chapter-([^/]+)\/?$/;
    const USER_PATH = /^\/u\/[^/]+/i;
    const READER_PAGES = '.rpage-main .rpage-page[data-page]';
    const PROMOTIONS = [
        '#app-root a:is(.home-banner, .rpage-chap-ending__banner)[rel~="sponsored"]',
        '#app-root .social-share',
        '#app-root .pwa-banner',
        '#app-root .pwa-banner-group',
        'iframe[src*="doubleclick" i]',
        'iframe[src*="googlesyndication" i]',
        'iframe[src*="a-ads.com" i]',
        'ins.adsbygoogle',
        '[id^="div-gpt-ad"]',
    ];
    const AUTH_SELECTORS = [
        '.topnav .login-btn',
        'a[href^="/login"]',
        'a[href^="/signin"]',
        'a[href^="/register"]',
        'a[href^="/signup"]',
        '.mpage__follow',
        '.mpage__follow-btn',
        '.mpage__collect',
        '.mpage__collect-btn',
        '.mpage__rate',
        '.mpage__rate-stack',
        '.mpage__rate-strip',
        '.mpage__rate-trigger',
        '.mstars',
        '.mchap-bookmark',
        '.mchap-row__likes',
        '.mrec-vote',
        '.cm-item--editor',
        '.cm-widget__announcement',
        '.cm-item__ctrl--like',
        '.cm-item__ctrl--dislike',
        '.cm-item__ctrl--reply',
        '.cm-item__ctrl--menu',
        '.cm-item__menu',
        '.rpage-chap-ending__like',
        '.rpage-cmpanel__like',
        '.rpage-cmpanel__like-attribution',
        '.rpage-cmpanel__follow',
        '[data-md-auth-hide="1"]',
    ];
    const UI_ZONES = '#md-hero, #md-continue-reading, #md-rbar, #md-dock, #md-sel-bar, #md-all-chaps, #md-lib-btn, #md-lib-modal, #md-list-picker, #md-series-save, #md-toast, #md-top';
    const TAP_IGNORE = 'a, button, input, select, textarea, label, summary, details, dialog, iframe, [role="button"], [role="dialog"], [aria-modal="true"], #md-rbar, #md-dock, #md-toast, #md-top, .topnav, .rpage-cmpanel, .settings-dialog';

    const root = document.documentElement;
    root.dataset.mdSite = 'comix';

    const prefersDark = matchMedia('(prefers-color-scheme: dark)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    const store = {
        get: (k, def) => {
            try {
                let v = localStorage.getItem('md-comix-' + k);
                if (v === null) v = localStorage.getItem('nb-comix:' + k);
                if (v === null) return def;
                try { return JSON.parse(v); } catch (_) { return v; }
            } catch (_) {
                return def;
            }
        },
        set: (k, v) => {
            try { localStorage.setItem('md-comix-' + k, JSON.stringify(v)); } catch (_) {}
        },
    };

    const initialNativeTheme = (root.getAttribute('data-theme') || '').toLowerCase();
    const savedTheme = (() => {
        if (initialNativeTheme === 'custom') return 'custom';
        if (initialNativeTheme === 'light') return 'light';
        if (initialNativeTheme === 'dark') return 'dark';
        if (initialNativeTheme === 'main') return 'main';
        const t = store.get('theme', CONFIG.themeDefault);
        if (t === 'main' || t === 'light' || t === 'dark' || t === 'custom') return t;
        return 'main';
    })();
    root.dataset.mdTheme = savedTheme;
    root.dataset.mdTone = root.getAttribute('data-tone') === 'light' ? 'light' : 'dark';

    function detectPage(path = location.pathname) {
        if (CHAPTER_PATH.test(path)) return 'chapter';
        if (SERIES_PATH.test(path)) return 'overview';
        if (USER_PATH.test(path)) return 'user';
        if (/^\/community(?:\/|$)/i.test(path)) return 'community';
        if (/^\/(?:home\/?)?$/.test(path) || /^\/(browser|browse|filter|latest|popular|genre|search|groups|collections|uploaders)/i.test(path)) return 'list';
        return 'other';
    }
    root.dataset.mdPage = detectPage();

    /* ====================================================================
     *  UTILITIES & UNIFIED SVG ICON SET (2.2px stroke, currentColor)
     * ==================================================================== */
    const SVG = body => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICON = {
        prev: SVG('<path d="m15 18-6-6 6-6"/>'),
        next: SVG('<path d="m9 18 6-6-6-6"/>'),
        minus: SVG('<path d="M5 12h14"/>'),
        plus: SVG('<path d="M12 5v14M5 12h14"/>'),
        bg: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
        down: SVG('<path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/>'),
        up: SVG('<path d="M12 19V5m0 0-6 6m6-6 6 6"/>'),
        check: SVG('<path d="m5 12 5 5 9-10"/>'),
        stop: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
        play: SVG('<polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none"/>'),
        info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
        eye: SVG('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
        home: SVG('<path d="M3 11 12 3l9 8M5 9.5V20h5v-6h4v6h5V9.5"/>'),
        book: SVG('<path d="M2 4.5h7.5a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2zM22 4.5h-7.5a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z"/>'),
        list: SVG('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
        chat: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>'),
        gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
        expand: SVG('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
        stretch: SVG('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
        scroll: SVG('<polygon points="7 5 19 12 7 19 7 5"/>'),
        pause: SVG('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'),
        compress: SVG('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'),
        shrinkW: SVG('<path d="M3 12h6m-3-3 3 3-3 3M21 12h-6m3-3-3 3 3 3"/>'),
        bookmark: SVG('<path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1z"/>'),
        trash: SVG('<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>'),
        reload: SVG('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>'),
        swapIcon: (a, b) => `<span class="md-iswap"><span class="md-i md-i-a">${a}</span><span class="md-i md-i-b">${b}</span></span>`,
    };

    function fmtRelTime(ts) {
        if (!ts) return '';
        if (typeof ts === 'string' && !/^\d+$/.test(ts) && isNaN(Date.parse(ts))) return ts.trim();
        const ms = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : (/^\d+$/.test(ts) ? (Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts)) : Date.parse(ts));
        if (!ms || isNaN(ms)) return '';
        const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
        if (diff < 60) return 'now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
        if (diff < 31536000) return Math.floor(diff / 2592000) + 'mo ago';
        return Math.floor(diff / 31536000) + 'y ago';
    }

    function parseCompactInt(raw) {
        const s = String(raw || '').replace(/,/g, '').trim().toLowerCase();
        if (!s) return 0;
        const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([km])?$/);
        if (!m) return parseInt(s, 10) || 0;
        let n = parseFloat(m[1]);
        if (m[2] === 'k') n *= 1000;
        else if (m[2] === 'm') n *= 1000000;
        return Math.round(n);
    }

    function toTitleCase(str) {
        if (!str) return '';
        const cleaned = str.replace(/\s+/g, ' ').trim();
        if (/[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned)) return cleaned;
        const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'near', 'nor', 'of', 'on', 'onto', 'or', 'the', 'to', 'with']);
        return cleaned.toLowerCase().split(' ').map((w, i, arr) => {
            if (!w) return '';
            if (i === 0 || i === arr.length - 1 || !MINOR.has(w)) {
                return w.replace(/^\p{L}/u, c => c.toUpperCase());
            }
            return w;
        }).join(' ');
    }

    function parseUrl(value, base = location.href) {
        if (!value) return null;
        try { return new URL(value, base); } catch (_) { return null; }
    }

    function route(value, pattern) {
        const url = parseUrl(value);
        return url?.origin === location.origin && pattern.test(url.pathname) ? url : null;
    }

    function imageUrl(value, base = location.href) {
        const url = parseUrl(value, base);
        return url?.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    }

    function xmlEsc(value) {
        return String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    }

    function safeName(value) {
        return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').slice(0, 110).trim().replace(/[. ]+$/, '') || 'Comix';
    }

    function fmtChapter(raw) {
        if (!raw) return '';
        const m = String(raw).match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
        if (m) return 'Latest: Ch.\u00a0' + m[1];
        return 'Latest: ' + String(raw).trim();
    }

    function toast(msg, ms = 2200) {
        if (!document.body) return;
        let t = $('#md-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'md-toast';
            t.setAttribute('role', 'status');
            t.setAttribute('aria-live', 'polite');
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t.__h);
        t.__h = setTimeout(() => t.classList.remove('show'), ms);
    }

    /* ====================================================================
     *  COMIX SETTINGS THEME SYNC (Main / Dark / Light / Custom)
     * ==================================================================== */
    let syncingTheme = false;

    function setTheme(t, persist = true) {
        const val = (t === 'main' || t === 'light' || t === 'dark' || t === 'custom') ? t : 'main';
        syncingTheme = true;
        try {
            root.dataset.mdTheme = val;
            root.dataset.mdTone = root.getAttribute('data-tone') === 'light' ? 'light' : 'dark';
            if (persist) store.set('theme', val);
            try { if (reader.init) paintBg(); } catch (_) {}
        } finally {
            queueMicrotask(() => { syncingTheme = false; });
        }
    }

    function setupNativeThemeSync() {
        const syncFromHtml = () => {
            if (syncingTheme) return;
            const dt = (root.getAttribute('data-theme') || '').toLowerCase();
            const tone = (root.getAttribute('data-tone') || '').toLowerCase();
            root.dataset.mdTone = tone === 'light' ? 'light' : 'dark';
            if (dt === 'custom') setTheme('custom', true);
            else if (dt === 'light') setTheme('light', true);
            else if (dt === 'dark') setTheme('dark', true);
            else if (dt === 'main') setTheme('main', true);
        };

        new MutationObserver(syncFromHtml).observe(root, {
            attributes: true,
            attributeFilter: ['data-theme', 'data-tone'],
        });

        document.addEventListener('click', e => {
            const btn = e.target instanceof Element ? e.target.closest('.settings-seg__btn, .settings-custom__preset, .settings-custom__reset, .settings-dialog__reset') : null;
            if (!btn) return;
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (btn.classList.contains('settings-custom__preset') || txt === 'custom') {
                setTimeout(() => setTheme('custom', true), 0);
            } else if (txt === 'light') {
                setTimeout(() => setTheme('light', true), 0);
            } else if (txt === 'dark') {
                setTimeout(() => setTheme('dark', true), 0);
            } else if (txt === 'main') {
                setTimeout(() => setTheme('main', true), 0);
            } else {
                setTimeout(syncFromHtml, 20);
            }
        }, true);

        document.addEventListener('input', e => {
            if (e.target instanceof Element && e.target.closest('.settings-custom')) {
                setTheme('custom', true);
            }
        }, true);
    }
    setupNativeThemeSync();

    /* ====================================================================
     *  LAYER 1: NEOBRUTAL SCANS DESIGN SYSTEM CSS
     * ==================================================================== */
    const cssComix = `
        /* ===== SHARED STRUCTURAL TOKENS ===== */
        html[data-md-site="comix"][data-md-site="comix"] {
            --bw: 2.5px;
            --r: 10px;
            --container: ${CONFIG.maxWidth}px !important;
            --f-sans: 'DM Sans', system-ui, -apple-system, sans-serif !important;
            --f-mono: 'JetBrains Mono', ui-monospace, monospace;
            --md-zoom: 1;
            --md-base: ${CONFIG.reader.baseWidth}px;
        }

        /* ===== MAIN THEME: CRIMSON NEOBRUTAL (#1c1416, #ead7da, #e5484d) ===== */
        html[data-md-site="comix"][data-md-site="comix"][data-md-theme="main"] {
            --bg: #1c1416 !important;
            --bg-rgb: 28 20 22 !important;
            --page-bg: #1c1416;
            --card: #281e21;
            --surface: #281e21 !important;
            --surface-rgb: 40 30 33 !important;
            --bg-2: #35282c !important;
            --bg-2-rgb: 53 40 44 !important;
            --surface-2: #35282c !important;
            --surface-2-rgb: 53 40 44 !important;
            --surface-3: #402f34 !important;
            --surface-3-rgb: 64 47 52 !important;
            --ink: #ead7da;
            --text: #ead7da !important;
            --text-rgb: 234 215 218 !important;
            --text-emphasis: #ead7da !important;
            --text-emphasis-rgb: 234 215 218 !important;
            --muted: #b59da1;
            --text-2: #b59da1 !important;
            --text-2-rgb: 181 157 161 !important;
            --text-3: #b59da1 !important;
            --text-3-rgb: 181 157 161 !important;
            --text-4: #b59da1 !important;
            --text-4-rgb: 181 157 161 !important;
            --bd: #000000;
            --border: #000000 !important;
            --border-2: #000000 !important;
            --sh: 4px 4px 0 #000000;
            --sh-hover: 6px 6px 0 #000000;
            --sh-sm: 2px 2px 0 #000000;
            --yellow: #e5484d;
            --pink: #ff4d6d;
            --blue: #d9465f;
            --lime: #e5484d;
            --mint: #3a2328;
            --cream: #3b2b30;
            --soft: #35282c;
            --violet: #f06e72;
            --accent: #e5484d !important;
            --accent-rgb: 229 72 77 !important;
            --accent-2: #c9373d !important;
            --accent-2-rgb: 201 55 61 !important;
            --accent-ink: #ffffff !important;
            --ink-bg: #e5484d;
            --on-ink: #ffffff;
            --grid: rgba(234, 215, 218, 0.04);
            --img-outline: oklch(1 0 0 / 0.1);
            --header-bg: linear-gradient(135deg, #2d1e22 0%, #1c1416 100%);
            color-scheme: dark !important;
        }
        /* Hide Crimson from Custom presets since it is now the Main theme */
        html[data-md-site="comix"] .settings-custom__preset[title="Crimson"],
        html[data-md-site="comix"] .settings-custom__preset[aria-label="Crimson preset"] {
            display: none !important;
        }

        /* ===== NEOBRUTAL LIGHT PALETTE ===== */
        html[data-md-site="comix"][data-md-site="comix"][data-md-theme="light"] {
            --bg: #f5f2ea !important;
            --bg-rgb: 245 242 234 !important;
            --page-bg: #f5f2ea;
            --card: #ffffff;
            --surface: #ffffff !important;
            --surface-rgb: 255 255 255 !important;
            --bg-2: #efe9d8 !important;
            --bg-2-rgb: 239 233 216 !important;
            --surface-2: #efe9d8 !important;
            --surface-2-rgb: 239 233 216 !important;
            --surface-3: #fffbeb !important;
            --surface-3-rgb: 255 251 235 !important;
            --ink: #111111;
            --text: #111111 !important;
            --text-rgb: 17 17 17 !important;
            --text-emphasis: #111111 !important;
            --text-emphasis-rgb: 17 17 17 !important;
            --muted: #555555;
            --text-2: #555555 !important;
            --text-2-rgb: 85 85 85 !important;
            --text-3: #555555 !important;
            --text-3-rgb: 85 85 85 !important;
            --text-4: #555555 !important;
            --text-4-rgb: 85 85 85 !important;
            --bd: #111111;
            --border: #111111 !important;
            --border-2: #111111 !important;
            --sh: 4px 4px 0 #111111;
            --sh-hover: 6px 6px 0 #111111;
            --sh-sm: 2px 2px 0 #111111;
            --yellow: #ffdc58;
            --pink: #ff6b6b;
            --blue: #88aaee;
            --lime: #a3e635;
            --mint: #e3f6ec;
            --cream: #fffbeb;
            --soft: #efe9d8;
            --violet: #6d28d9;
            --accent: #6d28d9 !important;
            --accent-rgb: 109 40 217 !important;
            --accent-2: #ffdc58 !important;
            --accent-2-rgb: 255 220 88 !important;
            --accent-ink: #ffffff !important;
            --ink-bg: #111111;
            --on-ink: #ffffff;
            --grid: rgba(0, 0, 0, 0.045);
            --img-outline: oklch(0 0 0 / 0.1);
            --header-bg: #ffdc58;
            color-scheme: light !important;
        }

        /* ===== NEOBRUTAL DARK PALETTE ===== */
        html[data-md-site="comix"][data-md-site="comix"][data-md-theme="dark"] {
            --bg: #150f26 !important;
            --bg-rgb: 21 15 38 !important;
            --page-bg: #150f26;
            --card: #241b3d;
            --surface: #241b3d !important;
            --surface-rgb: 36 27 61 !important;
            --bg-2: #33295a !important;
            --bg-2-rgb: 51 41 90 !important;
            --surface-2: #33295a !important;
            --surface-2-rgb: 51 41 90 !important;
            --surface-3: #2f2354 !important;
            --surface-3-rgb: 47 35 84 !important;
            --ink: #ece8ff;
            --text: #ece8ff !important;
            --text-rgb: 236 232 255 !important;
            --text-emphasis: #ece8ff !important;
            --text-emphasis-rgb: 236 232 255 !important;
            --muted: #a9a0d0;
            --text-2: #a9a0d0 !important;
            --text-2-rgb: 169 160 208 !important;
            --text-3: #a9a0d0 !important;
            --text-3-rgb: 169 160 208 !important;
            --text-4: #a9a0d0 !important;
            --text-4-rgb: 169 160 208 !important;
            --bd: #000000;
            --border: #000000 !important;
            --border-2: #000000 !important;
            --sh: 4px 4px 0 #000000;
            --sh-hover: 6px 6px 0 #000000;
            --sh-sm: 2px 2px 0 #000000;
            --yellow: #5a3fc2;
            --pink: #a3315f;
            --blue: #33479f;
            --lime: #1b7f68;
            --mint: #1d3a45;
            --cream: #2f2354;
            --soft: #33295a;
            --violet: #c1b0ff;
            --accent: #c1b0ff !important;
            --accent-rgb: 193 176 255 !important;
            --accent-2: #5a3fc2 !important;
            --accent-2-rgb: 90 63 194 !important;
            --accent-ink: #150f26 !important;
            --ink-bg: #7c5cff;
            --on-ink: #ffffff;
            --grid: rgba(255, 255, 255, 0.035);
            --img-outline: oklch(1 0 0 / 0.1);
            --header-bg: linear-gradient(135deg, #5a3fc2 0%, #3b267d 100%);
            color-scheme: dark !important;
        }

        /* ===== COMIX CUSTOM SETTINGS THEME ===== */
        html[data-md-site="comix"][data-md-site="comix"][data-md-theme="custom"] {
            --page-bg: var(--bg);
            --card: var(--surface);
            --soft: var(--surface-2);
            --cream: var(--surface-3);
            --ink: var(--text-emphasis, var(--text));
            --muted: var(--text-2);
            --bd: #000000;
            --border: #000000 !important;
            --border-2: #000000 !important;
            --sh: 4px 4px 0 #000000;
            --sh-hover: 6px 6px 0 #000000;
            --sh-sm: 2px 2px 0 #000000;
            --yellow: var(--accent);
            --violet: var(--accent);
            --lime: var(--accent);
            --pink: #e11d48;
            --blue: var(--accent-2, var(--accent));
            --ink-bg: var(--accent);
            --on-ink: var(--accent-ink, #111111);
            --grid: rgba(255, 255, 255, 0.04);
            --img-outline: oklch(1 0 0 / 0.1);
            --header-bg: var(--surface-2);
        }
        html[data-md-site="comix"][data-md-site="comix"][data-md-theme="custom"][data-md-tone="light"] {
            --bd: #111111;
            --border: #111111 !important;
            --border-2: #111111 !important;
            --sh: 4px 4px 0 #111111;
            --sh-hover: 6px 6px 0 #111111;
            --sh-sm: 2px 2px 0 #111111;
            --grid: rgba(0, 0, 0, 0.045);
            --img-outline: oklch(0 0 0 / 0.1);
        }

        /* ===== LAYER 1 DE-BLOAT & USER COLLECTIONS REMOVAL ===== */
        ${CONFIG.hidePromotions ? PROMOTIONS.join(', ') + ' { display: none !important; visibility: hidden !important; height: 0 !important; pointer-events: none !important; }' : ''}
        ${CONFIG.hideUserCollections ? 'html[data-md-site="comix"] section.section:has(.hcoll-swiper), html[data-md-site="comix"] section.section:has(.hcoll-section__more) { display: none !important; }' : ''}
        ${CONFIG.hideHomeAnnouncements ? 'html[data-md-site="comix"][data-md-page="list"] :is(aside.announce, .announce, .announce--accent) { display: none !important; }' : ''}

        /* ===== BASE, TYPOGRAPHY & CANVAS ===== */
        html[data-md-site="comix"] {
            background: var(--page-bg) !important;
            scroll-behavior: smooth;
        }
        html[data-md-site="comix"] body:not(.rpage-body) {
            background:
                linear-gradient(to right, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                var(--page-bg) !important;
            color: var(--ink) !important;
            font-family: var(--f-sans) !important;
        }
        html[data-md-site="comix"] a,
        html[data-md-site="comix"] a:hover,
        html[data-md-site="comix"] a:visited {
            text-decoration: none !important;
        }
        html[data-md-site="comix"] :is(h1, h2, h3) {
            text-wrap: balance;
        }
        html[data-md-site="comix"] ::selection {
            background: var(--yellow);
            color: var(--on-ink);
        }
        html[data-md-site="comix"] :focus-visible {
            outline: 3px solid var(--ink) !important;
            outline-offset: 2px !important;
        }

        /* ===== HEADER & NAVIGATION (Single-row, never wraps, never un-hides .search-toggle) ===== */
        html[data-md-site="comix"][data-md-site="comix"] header.topnav {
            background: var(--header-bg) !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            box-shadow: 0 4px 0 var(--bd) !important;
        }
        html[data-md-site="comix"] header.topnav .topnav__inner {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex-wrap: nowrap !important;
            gap: 12px !important;
            background: transparent !important;
            min-height: 58px !important;
        }
        html[data-md-site="comix"] header.topnav .logo {
            flex: 0 0 auto !important;
        }
        html[data-md-site="comix"] header.topnav .search {
            flex: 1 1 320px !important;
            max-width: 540px !important;
            min-width: 0 !important;
            margin-inline: auto !important;
        }
        html[data-md-site="comix"] header.topnav .topnav__right {
            display: flex !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            flex: 0 0 auto !important;
            gap: 8px !important;
            margin-left: 0 !important;
        }
        /* Do NOT override display on .icon-btn so Comix's responsive .search-toggle stays hidden on desktop */
        html[data-md-site="comix"] header.topnav .icon-btn:not(.search-toggle) {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        html[data-md-site="comix"] header.topnav .icon-btn {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
            min-height: 36px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] header.topnav .icon-btn:hover {
            background: var(--cream) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"] header.topnav .icon-btn:active {
            transform: scale(0.96) !important;
        }
        html[data-md-site="comix"] .search__form {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: box-shadow .15s ease-out, transform .15s ease-out !important;
        }
        html[data-md-site="comix"] .search__form:focus-within {
            box-shadow: var(--sh) !important;
            transform: translate(-1px, -1px);
        }
        html[data-md-site="comix"] .search__browse {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            font-family: var(--f-sans) !important;
            font-weight: 800 !important;
            text-decoration: none !important;
        }
        /* Hide site topnav on chapter pages since #md-rbar provides the dedicated reader top bar */
        html[data-md-site="comix"][data-md-page="chapter"] header.topnav {
            display: none !important;
        }

        /* ===== UNIVERSAL THEMED DIALOGS, READER SETTINGS, CHAPTER LIST & DRAWERS ===== */
        @keyframes mdDialogIn {
            from { opacity: 0; transform: translateY(10px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mdDialogOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to   { opacity: 0; transform: translateY(8px) scale(0.97); }
        }
        @keyframes mdDrawerIn {
            from { opacity: 0; transform: translateX(28px); }
            to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes mdDrawerOut {
            from { opacity: 1; transform: translateX(0); }
            to   { opacity: 0; transform: translateX(28px); }
        }
        /* Case A: [role="dialog"] is a full-screen backdrop wrapping a single panel child (e.g. Chapters modal) */
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):not(.settings-dialog):not(.md-own-dialog):not(#md-toast):not(:has(iframe[src*="cloudflare"])):not(:has(> :nth-child(2))) {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
            box-sizing: border-box !important;
            background: rgba(0, 0, 0, 0.62) !important;
            backdrop-filter: blur(3px) !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            max-height: none !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):not(.settings-dialog):not(.md-own-dialog):not(#md-toast):not(:has(iframe[src*="cloudflare"])):not(:has(> :nth-child(2))) > :only-child,
        /* Case B: [role="dialog"] IS the card panel itself with header + body children (e.g. Reader Settings modal) */
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):not(.settings-dialog):not(.md-own-dialog):not(#md-toast):not(:has(iframe[src*="cloudflare"])):has(> :nth-child(2)),
        html[data-md-site="comix"] dialog[open]:not(:has(iframe[src*="cloudflare"])) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 16px !important;
            box-shadow: 7px 7px 0 var(--bd) !important;
            font-family: var(--f-sans) !important;
            max-height: min(86dvh, 740px) !important;
            max-width: min(540px, calc(100vw - 32px)) !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            animation: mdDialogIn .2s cubic-bezier(0.2, 0, 0, 1) both;
        }
        /* Clean divider between Reader Settings header & body (no nested floating boxes) */
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):not(.settings-dialog):not(.md-own-dialog):has(> :nth-child(2)) > :first-child {
            border-bottom: 2px solid var(--bd) !important;
            background: var(--soft) !important;
        }
        html[data-md-site="comix"] .settings-dialog__panel {
            animation: mdDialogIn .2s cubic-bezier(0.2, 0, 0, 1) both;
        }
        html[data-md-site="comix"] .md-closing {
            animation: mdDialogOut .15s cubic-bezier(0.4, 0, 1, 1) forwards !important;
            pointer-events: none !important;
        }
        html[data-md-site="comix"] .rpage-cmpanel.md-closing {
            animation: mdDrawerOut .16s cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"], dialog[open]) :is(h1, h2, h3, h4, label, strong) {
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"], dialog[open]) :is(p, small, .muted, [class*="hint" i], [class*="desc" i], [class*="sub" i]) {
            color: var(--muted) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) button:not(.settings-custom__preset):not(.md-no-style) {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
            font-weight: 700 !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) button:not(.settings-custom__preset):not(.md-no-style):hover:not(:disabled) {
            background: var(--cream) !important;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) button:not(.settings-custom__preset):not(.md-no-style):active:not(:disabled) {
            transform: scale(0.96) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) :is(button:not(.settings-custom__preset), a, li, [role="option"], [role="radio"]):is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-active, .is-on, .is-current, .active) {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
            border-color: var(--bd) !important;
            font-weight: 900 !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) :is(button:not(.settings-custom__preset), a, li, [role="option"], [role="radio"]):is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-active, .is-on, .is-current, .active) {
            color: #111111 !important;
        }
        /* Force all nested text/spans/icons inside active chapter rows & active dialog buttons to inherit contrast color */
        html[data-md-site="comix"] :is([role="dialog"]:not(.md-own-dialog), [aria-modal="true"]:not(.md-own-dialog), dialog[open]) :is(button:not(.settings-custom__preset), a, li, [role="option"], [role="radio"]):is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .is-active, .is-on, .is-current, .active) * {
            color: inherit !important;
        }
        /* Keep preset color circles showing their diagonal 2-color split; use a crisp ring for active state */
        html[data-md-site="comix"] .settings-custom__preset[aria-pressed="true"] {
            box-shadow: 0 0 0 2.5px var(--card), 0 0 0 5px var(--yellow) !important;
            transform: scale(1.06);
        }
        html[data-md-site="comix"] .md-custom-swatch {
            border: 2px dashed var(--muted) !important;
            position: relative;
        }
        html[data-md-site="comix"] .md-custom-swatch[data-active="1"] {
            border-style: solid !important;
            border-color: var(--bd) !important;
            box-shadow: 0 0 0 2.5px var(--card), 0 0 0 5px var(--yellow) !important;
            transform: scale(1.06);
        }
        /* Clean Neobrutalist framing for Cloudflare Turnstile verification prompt (never obscures iframe) */
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):has(iframe[src*="cloudflare"]) {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
            background: rgba(0, 0, 0, 0.72) !important;
            backdrop-filter: blur(5px) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):has(iframe[src*="cloudflare"]) > :not(:empty):not([class*="backdrop" i]):not([class*="overlay" i]):not([class*="scrim" i]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 16px !important;
            box-shadow: 8px 8px 0 var(--bd) !important;
            padding: 20px 22px !important;
            max-width: min(410px, calc(100vw - 32px)) !important;
            font-family: var(--f-sans) !important;
            animation: mdDialogIn .2s cubic-bezier(0.2, 0, 0, 1) both;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):has(iframe[src*="cloudflare"]) > :not(:empty):not([class*="backdrop" i]) > div:not(:has(button[aria-label*="close" i])) {
            background: var(--soft) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 10px !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):has(iframe[src*="cloudflare"]) :is(h1, h2, h3, strong) {
            color: var(--ink) !important;
            font-weight: 900 !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"]):has(iframe[src*="cloudflare"]) p {
            color: var(--muted) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"], dialog[open]) input[type="range"] {
            accent-color: var(--yellow) !important;
        }
        html[data-md-site="comix"] :is([role="dialog"], [aria-modal="true"], dialog[open]) :is(input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), select) {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            font-family: var(--f-sans) !important;
        }
        /* ===== SETTINGS DIALOG (Viewport-clamped, never cropped, scrollable body) & DROPDOWNS ===== */
        html[data-md-site="comix"] .settings-dialog {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] .settings-dialog__panel {
            max-height: min(88dvh, 740px) !important;
            width: min(460px, calc(100vw - 32px)) !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            margin: 0 auto !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 14px !important;
            box-shadow: 6px 6px 0 var(--bd) !important;
        }
        html[data-md-site="comix"] .settings-dialog__head {
            flex: 0 0 auto !important;
            border-bottom: 2px solid var(--bd) !important;
        }
        html[data-md-site="comix"] .settings-dialog__body {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
        }
        html[data-md-site="comix"] .settings-dialog__foot {
            flex: 0 0 auto !important;
            border-top: 2px solid var(--bd) !important;
        }
        html[data-md-site="comix"] :is([data-md-dropdown="1"], [role="menu"], [role="listbox"]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 14px !important;
            box-shadow: 6px 6px 0 var(--bd) !important;
        }
        html[data-md-site="comix"] :is([data-md-dropdown="1"], [role="menu"], [role="listbox"]) :is(a, button) {
            color: var(--ink) !important;
            border-radius: 8px !important;
            font-family: var(--f-sans) !important;
            font-weight: 700 !important;
            transition: background-color .12s ease-out !important;
        }
        html[data-md-site="comix"] :is([data-md-dropdown="1"], [role="menu"], [role="listbox"]) :is(a, button):hover {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-site="comix"] .settings-dialog__title {
            font-family: var(--f-sans) !important;
            font-weight: 900 !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] .settings-dialog__close {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html[data-md-site="comix"] :is(.settings-seg__btn, .settings-custom__reset, .settings-dialog__reset, .settings-dialog__save, .settings-advanced-row, .settings-radio__row) {
            border: 2px solid var(--bd) !important;
            border-radius: 9px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
            font-weight: 700 !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] .settings-seg__btn[aria-pressed="true"],
        html[data-md-site="comix"] .settings-dialog__save {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
            font-weight: 900 !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] .settings-seg__btn[aria-pressed="true"],
        html[data-md-site="comix"][data-md-theme="light"] .settings-dialog__save {
            color: #111111 !important;
        }
        html[data-md-site="comix"] .settings-custom {
            background: var(--soft) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 10px !important;
        }
        html[data-md-site="comix"] .settings-color__hex,
        html[data-md-site="comix"] .settings-color__swatch {
            border: 2px solid var(--bd) !important;
            border-radius: 7px !important;
        }
        html[data-md-site="comix"] :is(.settings-seg__btn, .settings-dialog__save, .settings-dialog__reset, .settings-custom__reset):active {
            transform: scale(0.96) !important;
        }

        /* ===== MINIMIZED / COLLAPSED SECTIONS & COVER + BUTTON ===== */
        html[data-md-site="comix"] :is(.mpage__details-shell-toggle, .mpage__side button[aria-expanded="false"], .side-col button[aria-expanded="false"], [class*="shell-toggle" i], [class*="collapse-bar" i], [class*="minimized" i]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
            font-weight: 800 !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] :is(.mpage__details-shell-toggle, .mpage__side button[aria-expanded="false"], .side-col button[aria-expanded="false"], [class*="shell-toggle" i], [class*="collapse-bar" i], [class*="minimized" i]):hover {
            background: var(--cream) !important;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"] :is(.mpage__details-shell-toggle, .mpage__side button[aria-expanded="false"], .side-col button[aria-expanded="false"], [class*="shell-toggle" i], [class*="collapse-bar" i], [class*="minimized" i]):active {
            transform: scale(0.96) !important;
        }
        html[data-md-site="comix"] .mpage__side section:has(> button[aria-expanded="false"]),
        html[data-md-site="comix"] .mpage__side aside:has(> button[aria-expanded="false"]) {
            background: transparent !important;
        }
        html[data-md-site="comix"] :is(.card__action--menu, button[aria-label="Add to library"]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 999px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .12s ease-out, background-color .14s ease-out, box-shadow .12s ease-out !important;
        }
        html[data-md-site="comix"] :is(.card__action--menu, button[aria-label="Add to library"]):hover {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
            transform: scale(1.06);
        }
        html[data-md-site="comix"][data-md-theme="light"] :is(.card__action--menu, button[aria-label="Add to library"]):hover {
            color: #111111 !important;
        }
        html[data-md-site="comix"] :is(.card__action--menu, button[aria-label="Add to library"])[data-md-saved="1"] {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] :is(.card__action--menu, button[aria-label="Add to library"])[data-md-saved="1"] {
            color: #111111 !important;
        }

        /* ===== LOCAL LIBRARY OVERLAY (#md-lib-modal) & SAVE PICKER (#md-list-picker) ===== */
        #md-lib-modal, #md-list-picker {
            position: fixed; inset: 0; z-index: 220;
            display: flex; align-items: center; justify-content: center;
            padding: 16px; box-sizing: border-box;
            background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px);
        }
        #md-lib-modal.md-closing .md-lib-panel,
        #md-list-picker.md-closing .md-pick-panel {
            animation: mdDialogOut .15s ease-out forwards;
        }
        #md-lib-modal .md-lib-panel {
            width: min(960px, calc(100vw - 32px)); max-height: min(88dvh, 800px);
            display: flex; flex-direction: column; overflow: hidden;
            background: var(--card); color: var(--ink);
            border: var(--bw) solid var(--bd); border-radius: 16px; box-shadow: 8px 8px 0 var(--bd);
            font-family: var(--f-sans); animation: mdDialogIn .2s cubic-bezier(0.2, 0, 0, 1) both;
        }
        #md-list-picker .md-pick-panel {
            width: min(430px, calc(100vw - 32px)); max-height: min(84dvh, 620px);
            display: flex; flex-direction: column; overflow: hidden;
            background: var(--card); color: var(--ink);
            border: var(--bw) solid var(--bd); border-radius: 16px; box-shadow: 7px 7px 0 var(--bd);
            font-family: var(--f-sans); animation: mdDialogIn .18s cubic-bezier(0.2, 0, 0, 1) both;
        }
        .md-modal-head {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px 18px; border-bottom: 2px solid var(--bd); background: var(--soft);
        }
        .md-modal-head h2 { margin: 0; font: 900 18px/1.2 var(--f-sans); text-transform: uppercase; letter-spacing: .02em; color: var(--ink); }
        .md-modal-close {
            width: 34px; height: 34px; display: inline-grid; place-items: center;
            background: var(--card); color: var(--ink); border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm); cursor: pointer;
            transition: transform .12s ease-out, background-color .14s ease-out;
        }
        .md-modal-close:hover { background: var(--pink); color: #ffffff; }
        .md-modal-close:active { transform: scale(0.96); }
        .md-lib-tabs {
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
            padding: 12px 18px; border-bottom: 2px solid var(--bd); background: var(--card);
        }
        .md-lib-tab {
            display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
            background: var(--soft); color: var(--ink); border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12.5px/1 var(--f-sans); cursor: pointer;
            transition: transform .12s ease-out, background-color .14s ease-out, box-shadow .12s ease-out;
        }
        .md-lib-tab:hover { background: var(--cream); transform: translate(-1px, -1px); box-shadow: var(--sh); }
        .md-lib-tab.is-active { background: var(--yellow); color: var(--on-ink); }
        html[data-md-theme="light"] .md-lib-tab.is-active { color: #111111; }
        .md-lib-tab .md-tab-cnt { font: 800 11px/1 var(--f-mono); opacity: 0.85; }
        .md-lib-newform {
            display: flex; align-items: center; gap: 8px; margin-left: auto;
        }
        .md-lib-input {
            height: 34px; padding: 0 10px; background: var(--soft); color: var(--ink);
            border: 2px solid var(--bd); border-radius: 8px; font: 700 13px var(--f-sans); outline: none;
        }
        .md-lib-btn {
            height: 34px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px;
            background: var(--yellow); color: var(--on-ink); border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12px/1 var(--f-sans); text-transform: uppercase; cursor: pointer;
            transition: transform .12s ease-out, box-shadow .12s ease-out;
        }
        html[data-md-theme="light"] .md-lib-btn { color: #111111; }
        .md-lib-btn:hover { transform: translate(-1px, -1px); box-shadow: var(--sh); }
        .md-lib-btn:active { transform: scale(0.96); }
        .md-lib-btn--danger { background: var(--card); color: var(--ink); }
        .md-lib-btn--danger:hover { background: var(--pink); color: #ffffff; }
        .md-lib-body {
            flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px;
        }
        .md-lib-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px;
        }
        .md-lib-card {
            position: relative; display: flex; flex-direction: column;
            background: var(--soft); color: var(--ink); border: var(--bw) solid var(--bd);
            border-radius: 10px; box-shadow: var(--sh-sm); overflow: hidden;
            transition: transform .14s ease-out, box-shadow .14s ease-out;
        }
        .md-lib-card:hover { transform: translate(-2px, -2px); box-shadow: var(--sh); }
        .md-lib-poster { display: block; width: 100%; aspect-ratio: 2 / 3; background: var(--card); border-bottom: 2px solid var(--bd); overflow: hidden; }
        .md-lib-poster img { width: 100%; height: 100%; object-fit: cover; display: block; outline: 1px solid var(--img-outline); outline-offset: -1px; }
        .md-lib-card-body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; }
        .md-lib-card-title { font: 800 12.5px/1.3 var(--f-sans); color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .md-lib-card-rm {
            position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; display: grid; place-items: center;
            background: rgba(17, 17, 17, 0.8); color: #ffffff; border: 2px solid #000000; border-radius: 6px; cursor: pointer;
            opacity: 0; transition: opacity .14s ease-out, background-color .14s ease-out;
        }
        .md-lib-card:hover .md-lib-card-rm, .md-lib-card-rm:focus-visible { opacity: 1; }
        .md-lib-card-rm:hover { background: var(--pink); }
        .md-lib-empty { padding: 40px 20px; text-align: center; font: 700 14px/1.5 var(--f-sans); color: var(--muted); }

        .md-pick-series { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 2px solid var(--bd); background: var(--card); }
        .md-pick-thumb { width: 46px; height: 68px; border: 2px solid var(--bd); border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--soft); outline: 1px solid var(--img-outline); outline-offset: -1px; }
        .md-pick-meta { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .md-pick-title { font: 900 14.5px/1.3 var(--f-sans); color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .md-pick-sub { font: 700 11.5px/1.2 var(--f-mono); color: var(--muted); }
        .md-pick-lists { flex: 1 1 auto; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 9px; background: var(--card); }
        .md-pick-row {
            display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; box-sizing: border-box;
            padding: 11px 14px; background: var(--soft); color: var(--ink);
            border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm); cursor: pointer;
            font: 800 13.5px/1.2 var(--f-sans); transition: transform .12s ease-out, background-color .14s ease-out, box-shadow .12s ease-out;
        }
        .md-pick-row:active { transform: scale(0.96); }
        .md-pick-row-badge { font: 800 11.5px/1 var(--f-mono); font-variant-numeric: tabular-nums; padding: 3px 8px; border-radius: 999px; background: var(--card); color: var(--ink); border: 1.5px solid var(--bd); }
        .md-pick-row:hover { background: var(--cream); transform: translate(-1px, -1px); }
        .md-pick-row[data-in="1"] { background: var(--yellow); color: var(--on-ink); }
        html[data-md-theme="light"] .md-pick-row[data-in="1"] { color: #111111; }
        .md-pick-foot { display: flex; gap: 8px; padding: 12px 16px; border-top: 2px solid var(--bd); background: var(--soft); }
        .md-pick-foot .md-lib-input { flex: 1 1 auto; min-width: 0; }
        #md-series-save {
            display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px;
            background: var(--card); color: var(--ink); border: var(--bw) solid var(--bd);
            border-radius: 8px; box-shadow: var(--sh-sm); font: 800 12.5px/1 var(--f-sans);
            text-transform: uppercase; letter-spacing: .03em; cursor: pointer; margin-left: 8px;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-series-save:hover { background: var(--yellow); color: var(--on-ink); transform: translate(-1px, -1px); box-shadow: var(--sh); }
        html[data-md-theme="light"] #md-series-save:hover { color: #111111; }
        #md-series-save[data-md-saved="1"] { background: var(--yellow); color: var(--on-ink); }
        html[data-md-theme="light"] #md-series-save[data-md-saved="1"] { color: #111111; }
        #md-series-save:active { transform: scale(0.96); }

        /* ===== MAIN COLUMN HEADINGS, CARDS & FOOTER ===== */
        html[data-md-site="comix"] .layout--top .main-col > :not(:first-child) {
            margin-top: 28px;
        }
        html[data-md-site="comix"] .section__title,
        html[data-md-site="comix"] .mpage__sec-title {
            color: var(--ink) !important;
            font-family: var(--f-sans) !important;
            font-weight: 900 !important;
            text-transform: uppercase;
            letter-spacing: .015em;
            font-size: clamp(1.1rem, 2.1vw, 1.45rem);
        }
        html[data-md-site="comix"] .section__title-wrap {
            background: linear-gradient(transparent 62%, var(--yellow) 62%);
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 0 6px;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .section__title-wrap {
            background: linear-gradient(transparent 66%, rgba(124, 92, 255, 0.38) 66%);
        }
        html[data-md-site="comix"] :is(.card__poster-wrap .poster, .lrow__poster .poster, .mpage__poster .poster) {
            aspect-ratio: 2 / 3 !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            overflow: hidden !important;
            background: var(--soft) !important;
            transition: box-shadow .15s ease-out !important;
        }
        html[data-md-site="comix"] :is(.card__poster-wrap .poster img, .lrow__poster .poster img, .mpage__poster .poster img) {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            outline: 1px solid var(--img-outline);
            outline-offset: -1px;
        }
        html[data-md-site="comix"] .card {
            padding: 4px 6px 8px 2px;
        }
        html[data-md-site="comix"] .card:hover .card__poster-wrap .poster {
            box-shadow: var(--sh-hover) !important;
        }
        html[data-md-site="comix"] .card__title {
            color: var(--ink) !important;
            font-family: var(--f-sans) !important;
            font-weight: 800 !important;
            display: -webkit-box !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 2 !important;
            overflow: hidden !important;
            white-space: normal !important;
            line-height: 1.35 !important;
            min-height: 2.7em !important;
            max-height: 2.7em !important;
            margin-top: 8px;
        }
        html[data-md-site="comix"] .card__meta,
        html[data-md-site="comix"] .card__ch {
            font-family: var(--f-mono) !important;
            font-weight: 700 !important;
            font-size: 11.5px !important;
        }
        html[data-md-site="comix"] :is(.nav-btn, .filter-action, .npager__num, .npager__nav, .mpage__read, .mchap-toolbar .ubtn, .view-more, .see-all, .cm-foot__btn, .useg__btn) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
            font-weight: 800 !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] :is(.nav-btn, .filter-action, .npager__num, .npager__nav, .mpage__read, .mchap-toolbar .ubtn, .view-more, .see-all, .cm-foot__btn, .useg__btn):hover {
            background: var(--yellow) !important;
            color: #111111 !important;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"][data-md-theme="dark"] :is(.nav-btn, .filter-action, .npager__num, .npager__nav, .mpage__read, .mchap-toolbar .ubtn, .view-more, .see-all, .cm-foot__btn, .useg__btn):hover {
            color: #ffffff !important;
        }
        html[data-md-site="comix"] :is(.nav-btn, .filter-action, .npager__num, .npager__nav, .mpage__read, .mchap-toolbar .ubtn, .view-more, .see-all, .cm-foot__btn, .useg__btn):active {
            transform: scale(0.96) !important;
        }
        html[data-md-site="comix"] .useg__btn.is-on {
            background: var(--yellow) !important;
            color: #111111 !important;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .useg__btn.is-on {
            color: #ffffff !important;
        }
        html[data-md-site="comix"] .mpage__read {
            background: var(--lime) !important;
            color: #111111 !important;
            text-transform: uppercase;
            letter-spacing: .03em;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .mpage__read {
            color: #ffffff !important;
        }
        html[data-md-site="comix"] :is(.lrow, .filter-grid, .mpage__hero, .mchap-toolbar, .announce) {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"] .lrow { padding: 12px; margin-bottom: 10px; }
        html[data-md-site="comix"] .filter-grid { padding: 14px; }
        /* ===== SITE-WIDE AUDIT COVERAGE (Buttons, Inputs, Dropdowns, Browse/Filter, Community, Groups, Collections) ===== */
        html[data-md-site="comix"] :is(.btn, .ubtn, .filter-btn, .pager__btn, .cm-item__viewmore, .settings-color__auto):not(.md-no-style) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
            font-weight: 800 !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] :is(.btn, .ubtn, .filter-btn, .pager__btn, .cm-item__viewmore, .settings-color__auto):not(.md-no-style):hover:not(:disabled) {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] :is(.btn, .ubtn, .filter-btn, .pager__btn, .cm-item__viewmore, .settings-color__auto):not(.md-no-style):hover:not(:disabled) {
            color: #111111 !important;
        }
        html[data-md-site="comix"] :is(.btn, .ubtn, .filter-btn, .pager__btn, .cm-item__viewmore, .settings-color__auto):not(.md-no-style):active:not(:disabled) {
            transform: scale(0.96) !important;
        }
        html[data-md-site="comix"] :is(.btn--primary, .pager__btn.is-active, .pager__btn[aria-current="page"], header.topnav .icon-btn--active) {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
            font-weight: 900 !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] :is(.btn--primary, .pager__btn.is-active, .pager__btn[aria-current="page"], header.topnav .icon-btn--active) {
            color: #111111 !important;
        }
        html[data-md-site="comix"] :is(.input, .input--area, main .filter-bar input, main .search-bar input, main .cpost-search input) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: var(--f-sans) !important;
        }
        html[data-md-site="comix"] :is(.input, .input--area):focus {
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"] :is(.nav-menu, .fdrop__menu, .fdrop__panel, .fdrop__list, .fdrop > [class*="menu" i], .fdrop > [class*="panel" i]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: 5px 5px 0 var(--bd) !important;
            animation: mdDialogIn .15s cubic-bezier(0.2, 0, 0, 1) both;
        }
        html[data-md-site="comix"] :is(.nav-menu, .fdrop__menu, .fdrop__panel, .fdrop__list) :is(a, button) {
            color: var(--ink) !important;
            border-radius: 7px !important;
            font-weight: 700 !important;
            transition: background-color .12s ease-out !important;
        }
        html[data-md-site="comix"] :is(.nav-menu, .fdrop__menu, .fdrop__panel, .fdrop__list) :is(a, button):hover {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-site="comix"][data-md-theme="light"] :is(.nav-menu, .fdrop__menu, .fdrop__panel, .fdrop__list) :is(a, button):hover {
            color: #111111 !important;
        }
        /* Series "Featured in collections" cards (.mcoll-item) */
        html[data-md-site="comix"] .mpage__side ol.mcoll-list,
        html[data-md-site="comix"] .mpage__side ul.mcoll-list {
            display: flex !important; flex-direction: column !important; gap: 10px !important; margin: 0 !important; padding: 0 !important; list-style: none !important;
        }
        html[data-md-site="comix"] .mpage__side li.mcoll-item {
            display: flex !important; align-items: center !important; gap: 10px !important; padding: 8px !important;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 10px !important; box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] .mpage__side li.mcoll-item:hover {
            transform: translate(-1px, -1px) !important; box-shadow: var(--sh) !important; background: var(--cream) !important;
        }
        /* Community posts, Groups, Uploaders & Collections cards */
        html[data-md-site="comix"] :is(.cpost, .cpost-card, .cpost-item, .cpost-detail, .group-card, .gcard, .uploader-card, .coll-card, .hcoll-card) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] :is(.cpost, .cpost-card, .cpost-item, .group-card, .gcard, .uploader-card, .coll-card, .hcoll-card):hover {
            transform: translate(-1px, -1px);
            box-shadow: var(--sh-hover) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] :is(.cpost-cat, .cpost-tag, .mpage__chip--tracker) {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 999px !important;
            font-family: var(--f-mono) !important;
            font-weight: 800 !important;
        }
        html[data-md-site="comix"] .useg {
            display: inline-flex !important;
            gap: 6px !important;
            background: transparent !important;
            border: 0 !important;
            padding: 0 !important;
        }

        html[data-md-site="comix"] .footer {
            background: var(--card) !important;
            color: var(--ink) !important;
            border-top: var(--bw) solid var(--bd) !important;
        }

        /* ===== COMMUNITY PAGE & SUB-PAGES OPTIMIZATION (/community*) ===== */
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-head="1"] {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 14px !important;
            box-shadow: var(--sh) !important;
            padding: 18px 22px !important;
            margin: 12px 0 18px !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-tabs="1"] {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 8px !important;
            margin: 0 0 18px !important;
            padding: 0 !important;
            border-bottom: 0 !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-tabs="1"] :is(a, button) {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 7px 14px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12.5px/1 var(--f-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: .03em !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-tabs="1"] :is(a, button):hover {
            background: var(--cream) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-tabs="1"] :is(a, button):is(.is-active, .active, [aria-selected="true"], [aria-current="page"], [aria-pressed="true"]) {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-site="comix"][data-md-theme="light"][data-md-page="community"] [data-md-comm-tabs="1"] :is(a, button):is(.is-active, .active, [aria-selected="true"], [aria-current="page"], [aria-pressed="true"]) {
            color: #111111 !important;
        }
        /* Single clean Neobrutalist surface per Community post card — ZERO nested box-in-box borders */
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-card="1"] {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
            padding: 14px 16px !important;
            margin-bottom: 12px !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-card="1"]:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh-hover) !important;
            background: var(--cream) !important;
        }
        /* Keep all inner elements inside a Community card flat & clean (no redundant inner borders/shadows) */
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-card="1"] :is(div, section, header, footer, p, span):not(.cpost-cat):not(.cpost-tag):not(.uavatar) {
            box-shadow: none !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-card="1"] .uavatar {
            border: 2px solid var(--bd) !important;
            border-radius: 50% !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"][data-md-page="community"] [data-md-comm-card="1"] img {
            outline: 1px solid var(--img-outline);
            outline-offset: -1px;
        }

        /* ===== USER PROFILE PAGE OPTIMIZATION (/u/<id>) ===== */
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-hero="1"] {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 14px !important;
            box-shadow: var(--sh) !important;
            padding: 20px 22px !important;
            margin: 12px 0 18px !important;
        }
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-hero="1"] .uavatar,
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-hero="1"] img {
            border: var(--bw) solid var(--bd) !important;
            border-radius: 50% !important;
            box-shadow: var(--sh-sm) !important;
        }
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-tabs="1"] {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            border-bottom: 0 !important;
            margin: 0 0 20px !important;
            padding: 0 !important;
        }
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-tabs="1"] :is(a, button) {
            display: inline-flex !important;
            align-items: center !important;
            padding: 7px 14px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12.5px/1 var(--f-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: .03em !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-tabs="1"] :is(a, button):hover {
            background: var(--cream) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
        }
        html[data-md-site="comix"][data-md-page="user"] [data-md-user-tabs="1"] :is(a, button):is(.is-active, .active, [aria-selected="true"], [aria-current="page"]) {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-site="comix"][data-md-theme="light"][data-md-page="user"] [data-md-user-tabs="1"] :is(a, button):is(.is-active, .active, [aria-selected="true"], [aria-current="page"]) {
            color: #111111 !important;
        }

        /* ===== EXACT SIDEBAR WIDGETS ===== */
        html[data-md-site="comix"] .side-col {
            display: flex !important;
            flex-direction: column !important;
            gap: 24px !important;
        }
        html[data-md-site="comix"] .side-col .panel__tabs-inline {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
            flex-wrap: wrap !important;
        }
        html[data-md-site="comix"] .side-col .panel__tab-sep {
            display: none !important;
        }
        html[data-md-site="comix"] .side-col .panel__tab-inline {
            display: inline-flex !important;
            align-items: center !important;
            padding: 5px 11px !important;
            background: var(--card) !important;
            color: var(--muted) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 900 12.5px/1.2 var(--f-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: .02em !important;
            cursor: pointer;
            transition: background-color .14s ease-out, transform .12s ease-out !important;
        }
        html[data-md-site="comix"] .side-col .panel__tab-inline.is-active {
            background: var(--yellow) !important;
            color: #111111 !important;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .side-col .panel__tab-inline.is-active {
            color: #ffffff !important;
        }
        html[data-md-site="comix"] .side-col .panel__foot {
            margin-top: 10px !important;
        }
        html[data-md-site="comix"] .side-col .panel__foot .view-more {
            width: 100% !important;
            justify-content: center !important;
            padding: 8px 12px !important;
        }

        html[data-md-site="comix"] ol.side-list {
            display: flex !important;
            flex-direction: column !important;
            gap: 9px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] li.side-item {
            display: flex !important;
            align-items: center !important;
            gap: 11px !important;
            padding: 8px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] li.side-item:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] li.side-item .side-item__poster {
            flex: 0 0 46px !important;
            width: 46px !important;
            display: block !important;
        }
        html[data-md-site="comix"] li.side-item .poster--sm {
            width: 46px !important;
            height: 69px !important;
            aspect-ratio: 2 / 3 !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            box-shadow: none !important;
        }
        html[data-md-site="comix"] li.side-item .poster--sm img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            outline: 1px solid var(--img-outline);
            outline-offset: -1px;
        }
        html[data-md-site="comix"] li.side-item .side-item__body {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 3px !important;
        }
        html[data-md-site="comix"] li.side-item .side-item__kicker {
            font: 700 10px/1.1 var(--f-mono) !important;
            text-transform: uppercase !important;
            color: var(--muted) !important;
        }
        html[data-md-site="comix"] li.side-item .side-item__title {
            font: 800 13px/1.3 var(--f-sans) !important;
            color: var(--ink) !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] li.side-item .side-item__meta {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            font: 700 11px/1.2 var(--f-mono) !important;
            color: var(--muted) !important;
        }

        html[data-md-site="comix"] ol.top-uploaders {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] li.top-uploader {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 8px 10px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] li.top-uploader:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] .top-uploader__rank {
            display: inline-grid !important;
            place-items: center !important;
            width: 26px !important;
            height: 26px !important;
            flex: 0 0 26px !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            background: var(--soft) !important;
            color: var(--ink) !important;
            font: 800 12px/1 var(--f-mono) !important;
            font-variant-numeric: tabular-nums !important;
        }
        html[data-md-site="comix"] li.top-uploader--rank1 .top-uploader__rank { background: #ffdc58 !important; color: #111111 !important; }
        html[data-md-site="comix"] li.top-uploader--rank2 .top-uploader__rank { background: #e2e8f0 !important; color: #111111 !important; }
        html[data-md-site="comix"] li.top-uploader--rank3 .top-uploader__rank { background: #fdba74 !important; color: #111111 !important; }
        html[data-md-site="comix"] .top-uploader__avatar .uavatar {
            border: 2px solid var(--bd) !important;
            border-radius: 50% !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] .top-uploader__user {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font: 800 13px/1.2 var(--f-sans) !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] .top-uploader__count {
            font: 700 11.5px/1 var(--f-mono) !important;
            font-variant-numeric: tabular-nums !important;
            color: var(--muted) !important;
            white-space: nowrap !important;
        }

        html[data-md-site="comix"] ul.latest-posts {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] li.latest-post {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            padding: 12px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] li.latest-post:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] .latest-post__cat .cpost-cat {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            padding: 2px 8px !important;
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 999px !important;
            font: 800 10.5px/1.2 var(--f-mono) !important;
            text-transform: uppercase !important;
        }
        html[data-md-site="comix"] .latest-post__title {
            font: 800 13.5px/1.3 var(--f-sans) !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] .latest-post__excerpt {
            margin: 0 !important;
            font: 500 12.5px/1.45 var(--f-sans) !important;
            color: var(--muted) !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] .latest-post__foot {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 8px !important;
            margin-top: 2px !important;
            font: 700 11px/1.2 var(--f-mono) !important;
            color: var(--muted) !important;
        }

        html[data-md-site="comix"] ul.comments {
            display: flex !important;
            flex-direction: column !important;
            gap: 9px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        html[data-md-site="comix"] ul.comments > li.comment {
            padding: 10px 12px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] ul.comments > li.comment:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] ul.comments .poster--xs {
            border: 2px solid var(--bd) !important;
            border-radius: 5px !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] ul.comments .comment__title {
            font: 800 12.5px/1.3 var(--f-sans) !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] ul.comments .comment__content {
            font: 500 12.5px/1.4 var(--f-sans) !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] ul.comments .comment__foot {
            font: 700 11px/1.2 var(--f-mono) !important;
            color: var(--muted) !important;
        }

        /* ===== SERIES & USER COMMENTS (.cm-widget) ===== */
        html[data-md-site="comix"] .cm-widget {
            margin-top: 28px !important;
        }
        html[data-md-site="comix"] .cm-widget__head {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
            margin-bottom: 14px !important;
        }
        html[data-md-site="comix"] .cm-widget__title {
            font: 900 1.25rem/1.2 var(--f-sans) !important;
            text-transform: uppercase !important;
            color: var(--ink) !important;
            background: linear-gradient(transparent 62%, var(--yellow) 62%);
            padding: 0 6px;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .cm-widget__title {
            background: linear-gradient(transparent 66%, rgba(124, 92, 255, 0.38) 66%);
        }
        html[data-md-site="comix"] .cm-widget__sort {
            display: inline-flex !important;
            gap: 6px !important;
        }
        html[data-md-site="comix"] :is(.cm-item, .cm-item--has-replies, .cm-item__main, .cm-item__detail, .cm-item__replies, .cm-item__avatar)::before,
        html[data-md-site="comix"] :is(.cm-item, .cm-item--has-replies, .cm-item__main, .cm-item__detail, .cm-item__replies, .cm-item__avatar)::after {
            display: none !important;
            content: none !important;
            border: 0 !important;
            background: none !important;
        }
        html[data-md-site="comix"] :is(.cm-item__main, .cm-item__detail, .cm-item__replies, .cm-item__avatar) {
            border-left: 0 !important;
            box-shadow: none !important;
        }
        html[data-md-site="comix"] ul.cm-item__replies {
            border-left: 0 !important;
            padding-left: 14px !important;
            margin-left: 0 !important;
            margin-top: 8px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] .cm-item__ctrls {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-top: 8px !important;
        }
        html[data-md-site="comix"] .md-cm-score {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            padding: 3px 9px !important;
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 999px !important;
            font: 800 11.5px/1.1 var(--f-mono) !important;
            font-variant-numeric: tabular-nums !important;
            pointer-events: none !important;
            user-select: none !important;
        }
        html[data-md-site="comix"] .md-cm-score[data-sign="pos"] { background: var(--cream) !important; }
        html[data-md-site="comix"] .md-cm-score[data-sign="neg"] { opacity: 0.78; }
        html[data-md-site="comix"] ul.cm-items {
            display: flex !important;
            flex-direction: column !important;
            gap: 12px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] ul.cm-items > li.cm-item {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
            padding: 14px 16px !important;
            margin: 0 !important;
        }
        html[data-md-site="comix"] li.cm-item li.cm-item {
            background: var(--soft) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 9px !important;
            box-shadow: none !important;
            padding: 10px 12px !important;
            margin-top: 8px !important;
        }
        html[data-md-site="comix"] .cm-item__avatar .uavatar {
            border: 2px solid var(--bd) !important;
            border-radius: 50% !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] .cm-item__user a {
            font: 800 13.5px/1.2 var(--f-sans) !important;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] .cm-item__time {
            font: 700 11px/1.2 var(--f-mono) !important;
            color: var(--muted) !important;
        }
        html[data-md-site="comix"] .cm-item__content {
            color: var(--ink) !important;
            font: 500 14px/1.55 var(--f-sans) !important;
            margin-top: 6px !important;
            max-width: 72ch;
            text-wrap: pretty;
        }
        html[data-md-site="comix"] .cm-item__content img.rich-img {
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            margin-top: 8px !important;
            max-width: min(100%, 420px) !important;
        }
        html[data-md-site="comix"] .cm-item__collapser {
            display: inline-grid !important;
            place-items: center !important;
            width: 24px !important;
            height: 24px !important;
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 6px !important;
            cursor: pointer !important;
        }
        html[data-md-site="comix"] .cm-foot { margin-top: 14px !important; }
        html[data-md-site="comix"] .cm-foot__btn { width: 100% !important; padding: 10px 16px !important; }

        /* ===== SERIES OVERVIEW HERO, BADGES, SIDEBAR & CHAPTERS ===== */
        html[data-md-site="comix"] .mpage__hero {
            position: relative;
            overflow: hidden;
            isolation: isolate;
            padding: clamp(18px, 3vw, 32px);
            margin: 6px 4px 24px 0;
        }
        html[data-md-site="comix"] .mpage__hero > .md-profile-bg {
            position: absolute;
            inset: -24px;
            z-index: -1;
            background-size: cover;
            background-position: center 25%;
            filter: blur(26px) saturate(1.4);
            opacity: 0.16;
            pointer-events: none;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .mpage__hero > .md-profile-bg {
            opacity: 0.24;
            filter: blur(24px) brightness(0.45) saturate(1.3);
        }
        html[data-md-site="comix"] .mpage__title {
            font-family: var(--f-sans) !important;
            font-weight: 900 !important;
            letter-spacing: -0.025em;
            color: var(--ink) !important;
        }
        html[data-md-site="comix"] :is(.mpage__badge, .mpage__chip) {
            background: var(--soft) !important;
            color: var(--ink) !important;
            border: 1.5px solid var(--bd) !important;
            border-radius: 999px !important;
            font-family: var(--f-mono) !important;
            font-weight: 700 !important;
        }
        html[data-md-site="comix"] .mpage__side ol.mrec-list {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        html[data-md-site="comix"] .mpage__side li.mrec-item {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 8px !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-site="comix"] .mpage__side li.mrec-item:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
            background: var(--cream) !important;
        }
        html[data-md-site="comix"] .mpage__side :is(.mcoll-item__poster, .mrec-item__poster) {
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            flex-shrink: 0 !important;
        }
        html[data-md-site="comix"] .mpage__chapters[data-md-unified="1"] :is(.mchap-toolbar, .mchap-list, .mchap-foot) {
            display: none !important;
        }
        #md-all-chaps {
            background: var(--card); color: var(--ink); border: var(--bw) solid var(--bd);
            border-radius: 14px; box-shadow: var(--sh); overflow: hidden; margin: 8px 4px 16px 0;
        }
        #md-all-chaps .md-ch-head {
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
            padding: 10px 12px; background: var(--soft); border-bottom: 2px solid var(--bd);
        }
        #md-all-chaps .md-ch-search {
            flex: 1 1 180px; min-width: 140px; height: 36px; padding: 0 11px;
            background: var(--card); color: var(--ink); border: 2px solid var(--bd);
            border-radius: 8px; font: 700 13px var(--f-sans); box-shadow: var(--sh-sm); outline: none;
        }
        #md-all-chaps .md-ch-sort {
            height: 36px; padding: 0 12px; background: var(--card); color: var(--ink);
            border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12px var(--f-sans); text-transform: uppercase; letter-spacing: .03em; cursor: pointer;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-all-chaps .md-ch-sort:hover { background: var(--yellow); color: #111111; transform: translate(-1px, -1px); box-shadow: var(--sh); }
        html[data-md-theme="dark"] #md-all-chaps .md-ch-sort:hover { color: #ffffff; }
        #md-all-chaps .md-ch-sort:active { transform: scale(0.96); }
        #md-all-chaps .md-ch-reload {
            width: 36px; height: 36px; padding: 0; display: inline-grid; place-items: center;
            background: var(--card); color: var(--ink); border: 2px solid var(--bd); border-radius: 8px;
            box-shadow: var(--sh-sm); cursor: pointer; flex: 0 0 auto;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-all-chaps .md-ch-reload:hover { background: var(--yellow); color: var(--on-ink); transform: translate(-1px, -1px); box-shadow: var(--sh); }
        html[data-md-theme="light"] #md-all-chaps .md-ch-reload:hover { color: #111111; }
        #md-all-chaps .md-ch-reload:active { transform: scale(0.96); }
        #md-all-chaps .md-ch-reload.is-spinning svg { animation: mdSpin .75s linear infinite; }
        #md-all-chaps .md-ch-badge {
            padding: 4px 10px; background: var(--card); color: var(--muted); border: 1.5px solid var(--bd);
            border-radius: 999px; font: 800 11.5px/1 var(--f-mono); font-variant-numeric: tabular-nums; margin-left: auto;
        }
        #md-all-chaps .md-ch-scroll {
            max-height: min(620px, 68vh); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
        }
        #md-all-chaps .md-ch-row {
            display: flex; align-items: center; gap: 10px; padding: 10px 14px;
            border-bottom: 1.5px solid rgba(17, 17, 17, 0.14); background: var(--card);
            transition: background-color .12s ease-out;
        }
        html[data-md-theme="dark"] #md-all-chaps .md-ch-row { border-bottom-color: rgba(255, 255, 255, 0.09); }
        #md-all-chaps .md-ch-row:last-child { border-bottom: 0; }
        #md-all-chaps .md-ch-row:hover { background: var(--cream); }
        #md-all-chaps .md-ch-row[data-md-sel="1"] { background: var(--yellow); }
        html[data-md-theme="dark"] #md-all-chaps .md-ch-row[data-md-sel="1"] { background: rgba(124, 92, 255, 0.34); }
        #md-all-chaps .md-ch-link {
            flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: 8px; color: var(--ink); overflow: hidden;
        }
        #md-all-chaps .md-ch-num { flex: 0 0 auto; font: 900 13.5px/1.2 var(--f-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
        #md-all-chaps .md-ch-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 13px/1.3 var(--f-sans); color: var(--muted); }
        #md-all-chaps .md-ch-meta { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
        #md-all-chaps .md-group-pill {
            padding: 3px 9px; background: var(--soft); color: var(--ink); border: 1.5px solid var(--bd);
            border-radius: 999px; font: 700 11px/1.2 var(--f-mono); max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #md-all-chaps .md-group-sel {
            height: 28px; max-width: 190px; padding: 0 8px; background: var(--soft); color: var(--ink);
            border: 2px solid var(--bd); border-radius: 7px; box-shadow: var(--sh-sm); font: 800 11.5px var(--f-mono); cursor: pointer;
        }
        #md-all-chaps .md-ch-time { min-width: 56px; text-align: right; font: 700 11px/1 var(--f-mono); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
        #md-all-chaps .md-ch-empty { padding: 24px 16px; text-align: center; font: 700 13px var(--f-mono); color: var(--muted); }
        @keyframes mdSpin { to { transform: rotate(360deg); } }
        #md-all-chaps .md-ch-loader {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            padding: 12px 14px; background: var(--soft); color: var(--ink);
            border-top: 2px solid var(--bd); font: 800 12px/1.2 var(--f-mono);
        }
        #md-all-chaps .md-ch-loader[hidden] { display: none !important; }
        #md-all-chaps .md-ch-spinner {
            width: 15px; height: 15px; border: 2.5px solid var(--bd);
            border-top-color: var(--yellow); border-radius: 50%;
            animation: mdSpin .75s linear infinite; flex-shrink: 0;
        }
        #md-all-chaps .md-ch-morebar {
            display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
            padding: 10px 14px; background: var(--soft); border-top: 2px solid var(--bd);
        }
        #md-all-chaps .md-ch-morebar[hidden] { display: none !important; }
        #md-all-chaps .md-ch-morebtn {
            height: 34px; padding: 0 14px; background: var(--card); color: var(--ink);
            border: 2px solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12px var(--f-sans); text-transform: uppercase; letter-spacing: .03em; cursor: pointer;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-all-chaps .md-ch-morebtn:hover { background: var(--yellow); color: var(--on-ink); transform: translate(-1px, -1px); box-shadow: var(--sh); }
        html[data-md-theme="light"] #md-all-chaps .md-ch-morebtn:hover { color: #111111; }
        #md-all-chaps .md-ch-morebtn:active { transform: scale(0.96); }
        html[data-md-site="comix"] .mchap-toolbar { padding: 10px; border-radius: 14px !important; }
        html[data-md-site="comix"] .mchap-list {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
            overflow: hidden !important;
        }
        html[data-md-site="comix"] .mchap-row {
            border-bottom: 1.5px solid rgba(17, 17, 17, 0.14);
            transition: background-color .12s ease-out;
        }
        html[data-md-site="comix"][data-md-theme="dark"] .mchap-row {
            border-bottom-color: rgba(255, 255, 255, 0.1);
        }
        html[data-md-site="comix"] .mchap-row:hover { background: var(--cream) !important; }
        html[data-md-site="comix"] .mchap-item[data-md-sel] .mchap-row,
        html[data-md-site="comix"] .mchap-item[data-md-sel] { background: var(--yellow) !important; }
        html[data-md-site="comix"][data-md-theme="dark"] .mchap-item[data-md-sel] .mchap-row,
        html[data-md-site="comix"][data-md-theme="dark"] .mchap-item[data-md-sel] { background: rgba(124, 92, 255, 0.35) !important; }

        /* ===== NETFLIX-STYLE HERO CAROUSEL (#md-hero) ===== */
        #md-hero {
            position: relative;
            width: 100%;
            margin: 4px 0 24px;
            min-height: clamp(360px, 34vw, 460px);
            display: flex;
            align-items: center;
            justify-content: space-between;
            overflow: hidden;
            border: var(--bw) solid var(--bd);
            border-radius: 14px;
            box-shadow: 6px 6px 0 var(--bd);
            background: #ffffff;
            box-sizing: border-box;
            padding: clamp(22px, 3.8vw, 42px);
            gap: 24px;
            isolation: isolate;
        }
        #md-hero .md-hero-bg {
            position: absolute;
            inset: -20px;
            background-size: cover;
            background-position: center 25%;
            filter: blur(22px) saturate(1.6) brightness(0.8);
            opacity: 0.85;
            transform: scale(1.08);
            pointer-events: none;
            z-index: -2;
            transition: opacity .32s ease-out;
        }
        #md-hero::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            background:
                linear-gradient(to top, rgba(255,255,255,.72) 0%, rgba(255,255,255,.15) 52%, transparent 100%),
                linear-gradient(to right, rgba(255,255,255,.84) 0%, rgba(255,255,255,.28) 58%, transparent 100%);
            pointer-events: none;
        }
        #md-hero .md-hero-body {
            position: relative !important;
            z-index: 2 !important;
            max-width: min(580px, calc(100% - 390px)) !important;
            color: var(--ink) !important;
            flex: 1 1 auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-end !important;
            min-height: 310px !important;
        }
        #md-hero .md-hero-tag {
            display: inline-block !important;
            align-self: flex-start !important;
            padding: 5px 12px !important;
            margin-bottom: 12px !important;
            background: var(--yellow) !important;
            color: #111111 !important;
            border: 2px solid #000000 !important;
            border-radius: 7px !important;
            font: 800 11px/1 var(--f-mono) !important;
            text-transform: uppercase !important;
            letter-spacing: .08em !important;
            box-shadow: 3px 3px 0 #000000 !important;
        }
        #md-hero .md-hero-title {
            margin: 0 0 10px !important;
            padding: 0 !important;
            color: var(--ink) !important;
            font: 900 clamp(22px, 3vw, 36px)/1.2 var(--f-sans) !important;
            text-transform: none !important;
            letter-spacing: -0.02em !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            min-height: 2.4em !important;
            max-height: 2.4em !important;
            transition: opacity .22s ease-out, transform .22s ease-out !important;
        }
        #md-hero .md-hero-meta {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            margin: 0 0 16px !important;
            min-height: 28px !important;
            font: 700 12px/1 var(--f-mono) !important;
        }
        #md-hero .md-hero-views {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            padding: 4px 10px !important;
            background: rgba(255, 255, 255, 0.88) !important;
            border: 1.5px solid rgba(0, 0, 0, 0.3) !important;
            border-radius: 999px !important;
            color: #111111 !important;
            font-size: 11.5px !important;
            box-shadow: 1.5px 1.5px 0 rgba(0, 0, 0, 0.14) !important;
            backdrop-filter: blur(6px) !important;
        }
        #md-hero .md-hero-views svg { width: 13px !important; height: 13px !important; flex-shrink: 0 !important; }
        #md-hero .md-hero-chapter {
            display: inline-flex !important;
            align-items: center !important;
            padding: 4px 10px !important;
            background: var(--lime) !important;
            color: #111111 !important;
            border: 1.5px solid #000000 !important;
            border-radius: 999px !important;
            font-size: 11.5px !important;
            font-weight: 800 !important;
            box-shadow: 1.5px 1.5px 0 #000000 !important;
        }
        #md-hero .md-hero-cta {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            flex-wrap: wrap !important;
            margin-bottom: 20px !important;
            position: relative !important;
            z-index: 5 !important;
        }
        #md-hero .md-hero-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            padding: 10px 22px !important;
            min-height: 42px !important;
            box-sizing: border-box !important;
            border: var(--bw) solid #000000 !important;
            border-radius: var(--r) !important;
            box-shadow: 3px 3px 0 #000000 !important;
            font: 900 13.5px/1 var(--f-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: .03em !important;
            text-decoration: none !important;
            cursor: pointer !important;
            transition: transform .14s ease-out, box-shadow .14s ease-out, background-color .14s ease-out !important;
        }
        #md-hero .md-hero-btn svg { width: 15px !important; height: 15px !important; flex-shrink: 0 !important; }
        #md-hero .md-hero-play svg { transform: translateX(1px); }
        #md-hero .md-hero-play { background: var(--yellow) !important; color: #111111 !important; }
        #md-hero .md-hero-more { background: #ffffff !important; color: #111111 !important; }
        #md-hero .md-hero-btn:hover { transform: translate(-2px, -2px) !important; box-shadow: 5px 5px 0 #000000 !important; }
        #md-hero .md-hero-btn:active { transform: scale(0.96) !important; box-shadow: 1px 1px 0 #000000 !important; }
        #md-hero .md-hero-thumbs {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 0 0 -18px !important;
            padding: 4px 28px 8px 24px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            scrollbar-width: none !important;
            -webkit-overflow-scrolling: touch !important;
            max-width: calc(100% + 18px) !important;
            position: relative !important;
            z-index: 4 !important;
            mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 24px), transparent 100%);
            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 24px), transparent 100%);
        }
        #md-hero .md-hero-thumbs::-webkit-scrollbar { display: none !important; }
        #md-hero .md-hero-thumb {
            position: relative !important;
            flex: 0 0 46px !important;
            width: 46px !important;
            height: 68px !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            border: 2px solid #000000 !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            cursor: pointer !important;
            background: #111111 !important;
            box-shadow: 2px 2px 0 #000000 !important;
            opacity: 0.65 !important;
            transition: transform .18s ease-out, opacity .18s ease-out, border-color .18s ease-out, box-shadow .18s ease-out !important;
        }
        #md-hero .md-hero-thumb:hover { opacity: 0.95 !important; transform: translateY(-2px) !important; box-shadow: 3px 3px 0 #000000 !important; }
        #md-hero .md-hero-thumb:active { transform: scale(0.96) !important; }
        #md-hero .md-hero-thumb.is-active {
            opacity: 1 !important;
            border-color: var(--violet) !important;
            transform: translateY(-3px) scale(1.05) !important;
            box-shadow: 0 0 0 2px var(--violet), 3px 3px 0 #000000 !important;
        }
        #md-hero .md-hero-thumb img {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            pointer-events: none !important;
            outline: 1px solid var(--img-outline);
            outline-offset: -1px;
        }
        #md-hero .md-thumb-fill {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: 0%;
            background: linear-gradient(to bottom, rgba(109, 40, 217, 0.52) 0%, rgba(255, 220, 88, 0.28) 100%) !important;
            border-bottom: 2.5px solid var(--violet) !important;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45) !important;
            pointer-events: none !important;
            z-index: 2 !important;
            opacity: 0;
            transition: opacity .15s ease-out;
        }
        #md-hero .md-hero-thumb.is-active .md-thumb-fill {
            opacity: 1 !important;
            animation: mdProgressFall 5.5s linear forwards;
        }
        @keyframes mdProgressFall { 0% { height: 0%; } 100% { height: 100%; } }
        #md-hero .md-hero-card {
            --mdc-w: 280px;
            position: absolute;
            z-index: 3;
            right: 92px;
            bottom: -68px;
            width: var(--mdc-w);
            height: calc(var(--mdc-w) * 1.5);
            display: block;
            text-decoration: none !important;
            -webkit-tap-highlight-color: transparent;
        }
        #md-hero .md-hero-card-art {
            position: absolute;
            inset: 0;
            display: block;
            box-sizing: border-box;
            border: var(--bw) solid #000000;
            border-radius: 14px;
            overflow: hidden;
            background: #111111;
            box-shadow: 10px 10px 0 #000000;
            transform: rotate(6.5deg);
            transform-origin: bottom center;
            transition: transform .24s cubic-bezier(0.2, 0, 0, 1), box-shadow .22s ease-out;
            pointer-events: none;
        }
        @media (hover: hover) and (pointer: fine) {
            #md-hero .md-hero-card:hover .md-hero-card-art {
                transform: rotate(3.2deg) translateY(-6px) scale(1.015);
                box-shadow: 14px 14px 0 #000000;
            }
        }
        #md-hero .md-hero-card::after { content: ""; position: absolute; inset: -16px -64px -16px -16px; z-index: 10; }
        #md-hero .md-hero-card img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            outline: 1px solid var(--img-outline);
            outline-offset: -1px;
            transition: opacity .22s ease-out;
        }
        html[data-md-theme="main"] #md-hero,
        html[data-md-theme="dark"] #md-hero,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero { background: #140e10 !important; }
        html[data-md-theme="main"] #md-hero .md-hero-bg,
        html[data-md-theme="dark"] #md-hero .md-hero-bg,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero .md-hero-bg { filter: blur(16px) brightness(0.32) saturate(1.2) !important; opacity: 1 !important; }
        html[data-md-theme="main"] #md-hero::after,
        html[data-md-theme="dark"] #md-hero::after,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero::after {
            background:
                linear-gradient(to top, rgba(0, 0, 0, .78) 0%, rgba(0, 0, 0, .24) 60%, transparent 100%),
                linear-gradient(to right, rgba(0, 0, 0, .86) 0%, rgba(0, 0, 0, .42) 55%, transparent 100%) !important;
        }
        html[data-md-theme="main"] #md-hero .md-hero-body,
        html[data-md-theme="main"] #md-hero .md-hero-title,
        html[data-md-theme="dark"] #md-hero .md-hero-body,
        html[data-md-theme="dark"] #md-hero .md-hero-title,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero .md-hero-body,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero .md-hero-title { color: #ffffff !important; }
        html[data-md-theme="main"] #md-hero .md-hero-title,
        html[data-md-theme="dark"] #md-hero .md-hero-title,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero .md-hero-title { text-shadow: 2px 2px 0 #000000 !important; }
        html[data-md-theme="main"] #md-hero .md-hero-views,
        html[data-md-theme="dark"] #md-hero .md-hero-views,
        html[data-md-theme="custom"][data-md-tone="dark"] #md-hero .md-hero-views {
            background: rgba(0, 0, 0, 0.58) !important;
            border-color: rgba(255, 255, 255, 0.32) !important;
            color: #ffffff !important;
            box-shadow: none !important;
        }
        html[data-md-theme="main"] #md-hero .md-hero-tag,
        html[data-md-theme="main"] #md-hero .md-hero-chapter,
        html[data-md-theme="main"] #md-hero .md-hero-play,
        html[data-md-theme="dark"] #md-hero .md-hero-tag,
        html[data-md-theme="dark"] #md-hero .md-hero-chapter,
        html[data-md-theme="dark"] #md-hero .md-hero-play { color: #ffffff !important; }
        html[data-md-theme="main"] :is(.mpage__read, .useg__btn.is-on, .side-col .panel__tab-inline.is-active, #md-continue-reading .md-cr-btn, #md-continue-reading .md-cr-page, #md-top, #md-sel-bar .md-sel-dl, #md-rbar .md-rb-title b) { color: #ffffff !important; }
        html[data-md-theme="main"] :is(.nav-btn, .filter-action, .npager__num, .npager__nav, .mpage__read, .mchap-toolbar .ubtn, .view-more, .see-all, .cm-foot__btn, .useg__btn, #md-rbar .md-rb-btn, #md-dock button, #md-sel-bar button, #md-all-chaps .md-ch-sort):hover { color: #ffffff !important; }
        html[data-md-theme="main"] #md-all-chaps .md-ch-row[data-md-sel="1"] { background: rgba(229, 72, 77, 0.28); }

        /* ===== CONTINUE READING SHELF (#md-continue-reading) ===== */
        #md-continue-reading { display: block !important; width: 100% !important; margin: 0 0 24px !important; box-sizing: border-box !important; }
        #md-continue-reading .md-cr-head { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 12px !important; margin-bottom: 12px !important; }
        #md-continue-reading .md-cr-clear {
            padding: 6px 12px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 11.5px/1 var(--f-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: .04em !important;
            cursor: pointer !important;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        #md-continue-reading .md-cr-clear:hover { background: var(--pink) !important; color: #ffffff !important; transform: translate(-1px, -1px); box-shadow: var(--sh) !important; }
        #md-continue-reading .md-cr-clear:active { transform: scale(0.96); }
        #md-continue-reading .md-cr-track { display: flex !important; flex-direction: row !important; gap: 16px !important; overflow-x: auto !important; padding: 4px 6px 14px 2px !important; scroll-behavior: smooth !important; scrollbar-width: thin !important; }
        #md-continue-reading .md-cr-card {
            position: relative !important;
            flex: 0 0 clamp(165px, 16vw, 200px) !important;
            width: clamp(165px, 16vw, 200px) !important;
            display: flex !important;
            flex-direction: column !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
            overflow: hidden !important;
            transition: transform .15s ease-out, box-shadow .15s ease-out, background-color .15s ease-out !important;
        }
        #md-continue-reading .md-cr-card:hover { transform: translate(-2px, -2px) !important; box-shadow: var(--sh-hover) !important; background: var(--cream) !important; }
        #md-continue-reading .md-cr-remove {
            position: absolute !important; top: 8px !important; right: 8px !important; z-index: 4 !important;
            width: 26px !important; height: 26px !important; padding: 0 !important; display: grid !important; place-items: center !important;
            background: rgba(17, 17, 17, 0.78) !important; color: #ffffff !important; border: 2px solid #000000 !important; border-radius: 6px !important;
            cursor: pointer !important; opacity: 0; transition: opacity .14s ease-out, transform .12s ease-out, background-color .14s ease-out !important;
        }
        #md-continue-reading .md-cr-card:hover .md-cr-remove, #md-continue-reading .md-cr-remove:focus-visible { opacity: 1; }
        #md-continue-reading .md-cr-remove:hover { background: var(--pink) !important; }
        #md-continue-reading .md-cr-remove:active { transform: scale(0.96); }
        #md-continue-reading .md-cr-remove svg { width: 13px !important; height: 13px !important; }
        #md-continue-reading .md-cr-thumb-wrap { position: relative !important; width: 100% !important; aspect-ratio: 2 / 3 !important; overflow: hidden !important; background: var(--soft) !important; border-bottom: var(--bw) solid var(--bd) !important; }
        #md-continue-reading .md-cr-thumb-link { display: block !important; width: 100% !important; height: 100% !important; }
        #md-continue-reading .md-cr-img { width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important; outline: 1px solid var(--img-outline); outline-offset: -1px; }
        #md-continue-reading .md-cr-progress { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; height: 7px !important; background: rgba(0, 0, 0, 0.52) !important; z-index: 2 !important; }
        #md-continue-reading .md-cr-bar { height: 100% !important; background: var(--lime) !important; transition: width .28s ease-out !important; }
        #md-continue-reading .md-cr-body { padding: 10px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; flex: 1 1 auto !important; }
        #md-continue-reading .md-cr-title { margin: 0 !important; font: 800 13px/1.3 var(--f-sans) !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; min-height: 2.6em !important; color: var(--ink) !important; }
        #md-continue-reading .md-cr-title a { color: inherit !important; }
        #md-continue-reading .md-cr-badges { display: flex !important; flex-wrap: wrap !important; gap: 5px !important; }
        #md-continue-reading .md-cr-badge { font: 700 10.5px/1.2 var(--f-mono) !important; padding: 2px 7px !important; border-radius: 999px !important; border: 1.5px solid var(--bd) !important; white-space: nowrap !important; }
        #md-continue-reading .md-cr-last { background: var(--soft) !important; color: var(--ink) !important; }
        #md-continue-reading .md-cr-page { background: var(--yellow) !important; color: #111111 !important; font-weight: 800 !important; }
        html[data-md-theme="dark"] #md-continue-reading .md-cr-page { color: #ffffff !important; }
        #md-continue-reading .md-cr-btn {
            margin-top: auto !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;
            padding: 7px 10px !important; background: var(--yellow) !important; color: #111111 !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 6px !important; box-shadow: 2px 2px 0 var(--bd) !important;
            font: 800 11.5px/1.2 var(--f-sans) !important; text-transform: uppercase !important; letter-spacing: .03em !important;
            cursor: pointer !important; transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out !important;
        }
        html[data-md-theme="dark"] #md-continue-reading .md-cr-btn { color: #ffffff !important; }
        #md-continue-reading .md-cr-btn:hover { background: var(--lime) !important; color: #111111 !important; transform: translate(1px, 1px) !important; box-shadow: 1px 1px 0 var(--bd) !important; }
        #md-continue-reading .md-cr-btn:active { transform: scale(0.96) !important; }

        /* ===== READER CANVAS, UNIFIED TOP BAR (#md-rbar) & BOTTOM DOCK (#md-dock) ===== */
        html[data-md-site="comix"][data-md-page="chapter"][data-md-bg="paper"] { --nb-reader-bg: #f5f2ea; }
        html[data-md-site="comix"][data-md-page="chapter"][data-md-bg="dark"] { --nb-reader-bg: #150f26; }
        html[data-md-site="comix"][data-md-page="chapter"][data-md-bg="black"] { --nb-reader-bg: #000000; }
        html[data-md-site="comix"] .rpage { --reader-bg: var(--nb-reader-bg, var(--page-bg)); }
        html[data-md-site="comix"] .rpage-main { background: var(--reader-bg) !important; }
        html[data-md-site="comix"] .rpage--long-strip .rpage-main { padding-top: 64px !important; }
        html[data-md-site="comix"][data-md-page="chapter"] .rpage--long-strip .rpage-page[data-page] {
            max-width: calc(var(--md-base) * var(--md-zoom)) !important;
            width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            transition: max-width .22s cubic-bezier(0.2, 0, 0, 1);
        }
        html[data-md-site="comix"][data-md-page="chapter"][data-md-stretch="1"] .rpage--long-strip .rpage-page[data-page],
        html[data-md-site="comix"][data-md-page="chapter"][data-md-stretch="1"] .rpage--long-strip .rpage-main__inner {
            max-width: 100vw !important;
            width: 100% !important;
        }
        html[data-md-site="comix"][data-md-page="chapter"] .rpage--long-strip .rpage-page__img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
        }
        /* Hide Comix's native cluttered floating strips off-screen while keeping their React buttons clickable */
        html[data-md-site="comix"][data-md-page="chapter"] :is(.rpage-floatctl, .rpage-bottombar) {
            position: fixed !important;
            left: -9999px !important;
            top: -9999px !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        /* Keep closed comments panel completely off-screen (fixes vertical black line covering right side) */
        html[data-md-site="comix"] .rpage-cmpanel[aria-hidden="true"] {
            display: none !important;
            border-left: 0 !important;
            box-shadow: none !important;
            animation: none !important;
            pointer-events: none !important;
        }
        html[data-md-site="comix"] .rpage-cmpanel:not([aria-hidden="true"]) {
            background: var(--card) !important;
            color: var(--ink) !important;
            border-left: var(--bw) solid var(--bd) !important;
            box-shadow: -6px 0 0 var(--bd) !important;
            animation: mdDrawerIn .22s cubic-bezier(0.2, 0, 0, 1) both;
        }
        /* Support BOTH Left and Right vertical progress rails cleanly */
        html[data-md-site="comix"][data-md-page="chapter"] .rpage--long-strip .rpage-progress--right {
            position: fixed !important;
            left: calc(50% + min(calc(50vw - 14px), calc((var(--md-base) * var(--md-zoom)) / 2 + 10px))) !important;
            right: auto !important;
            top: 64px !important;
            bottom: var(--md-prog-bottom, 18px) !important;
            width: 6px !important;
            z-index: 90 !important;
            border-radius: 999px !important;
            transition: left .22s cubic-bezier(0.2, 0, 0, 1), opacity .14s ease-out !important;
        }
        html[data-md-site="comix"][data-md-page="chapter"] .rpage--long-strip .rpage-progress--left {
            position: fixed !important;
            right: calc(50% + min(calc(50vw - 14px), calc((var(--md-base) * var(--md-zoom)) / 2 + 10px))) !important;
            left: auto !important;
            top: 64px !important;
            bottom: var(--md-prog-bottom, 18px) !important;
            width: 6px !important;
            z-index: 90 !important;
            border-radius: 999px !important;
            transition: right .22s cubic-bezier(0.2, 0, 0, 1), opacity .14s ease-out !important;
        }
        html[data-md-site="comix"][data-md-page="chapter"][data-md-stretch="1"] .rpage--long-strip .rpage-progress--right {
            left: auto !important;
            right: 6px !important;
        }
        html[data-md-site="comix"][data-md-page="chapter"][data-md-stretch="1"] .rpage--long-strip .rpage-progress--left {
            right: auto !important;
            left: 6px !important;
        }
        html[data-md-site="comix"]:fullscreen .rpage-progress,
        html[data-md-site="comix"][data-md-fs="1"] .rpage-progress {
            display: none !important;
            opacity: 0 !important;
        }
        /* Fade out vertical progress rail once user scrolls past manga images into chapter-ending / comments */
        html[data-md-site="comix"][data-md-page="chapter"][data-md-past-images="1"] .rpage-progress:is(.rpage-progress--left, .rpage-progress--right) {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        html[data-md-site="comix"] .rpage-chap-ending__head {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh) !important;
        }
        /* Fix RTL/LTR horizontal paged mode: make chapter-ending + comments occupy a full centered 100vw slide so adjacent manga pages never bleed in */
        html[data-md-site="comix"][data-md-page="chapter"] .rpage:not(.rpage--long-strip) .rpage-chap-ending {
            flex: 0 0 100vw !important;
            min-width: 100vw !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 100dvh !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            box-sizing: border-box !important;
            padding: 72px clamp(16px, 5vw, 64px) 96px !important;
            margin: 0 !important;
            scroll-snap-align: start !important;
        }
        html[data-md-site="comix"][data-md-page="chapter"] .rpage:not(.rpage--long-strip) .rpage-chap-ending > * {
            max-width: 780px !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }
        .md-iswap { position: relative; display: inline-grid; place-items: center; width: 18px; height: 18px; }
        .md-iswap .md-i {
            grid-area: 1 / 1; display: inline-flex; align-items: center; justify-content: center;
            transition: transform .22s cubic-bezier(0.2, 0, 0, 1), opacity .2s ease-out, filter .2s ease-out;
        }
        .md-iswap .md-i-a { opacity: 1; transform: scale(1); filter: blur(0px); }
        .md-iswap .md-i-b { opacity: 0; transform: scale(0.25); filter: blur(4px); }
        button[aria-pressed="true"] .md-iswap .md-i-a { opacity: 0; transform: scale(0.25); filter: blur(4px); }
        button[aria-pressed="true"] .md-iswap .md-i-b { opacity: 1; transform: scale(1); filter: blur(0px); }
        #md-dock [data-act="stretch"][aria-pressed="true"] .md-iswap { transform: scaleX(1.14); transition: transform .2s cubic-bezier(0.2, 0, 0, 1); }
        html[data-md-site="comix"] .rpage-chap-ending__nav-btn {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
        }

        /* Top Reader Bar (#md-rbar — mirrors MangaRead / Asura / DemonicScans) */
        #md-rbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 120;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            background: var(--header-bg);
            color: var(--ink);
            border-bottom: var(--bw) solid var(--bd);
            box-shadow: 0 4px 0 var(--bd);
            box-sizing: border-box;
            transition: transform .22s ease-out, opacity .2s ease-out;
        }
        html[data-md-page="chapter"][data-md-navhide] #md-rbar {
            transform: translateY(calc(-100% - 8px));
            opacity: 0;
            pointer-events: none;
        }
        #md-rbar .md-rb-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 36px;
            min-width: 36px;
            padding: 0 11px;
            background: var(--card);
            color: var(--ink);
            border: var(--bw) solid var(--bd);
            border-radius: 8px;
            box-shadow: var(--sh-sm);
            font: 800 12px/1 var(--f-sans);
            text-transform: uppercase;
            letter-spacing: .03em;
            cursor: pointer;
            flex: 0 0 auto;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-rbar .md-rb-btn:hover {
            background: var(--yellow);
            color: #111111;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh);
        }
        html[data-md-theme="dark"] #md-rbar .md-rb-btn:hover { color: #ffffff; }
        #md-rbar .md-rb-btn:active { transform: scale(0.96); }
        #md-rbar .md-rb-btn[aria-pressed="true"] { background: var(--yellow); color: var(--on-ink); }
        html[data-md-theme="light"] #md-rbar .md-rb-btn[aria-pressed="true"] { color: #111111; }
        #md-rbar .md-rb-count {
            padding: 2px 6px;
            border-radius: 999px;
            background: var(--soft);
            color: var(--ink);
            border: 1.5px solid var(--bd);
            font: 800 10.5px/1 var(--f-mono);
            font-variant-numeric: tabular-nums;
        }
        #md-rbar .md-rb-count:empty { display: none; }
        #md-rbar .md-rb-title {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            overflow: hidden;
        }
        #md-rbar .md-rb-title b {
            font: 900 14.5px/1.2 var(--f-sans);
            color: var(--ink);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        html[data-md-theme="dark"] #md-rbar .md-rb-title b { color: #ffffff; }
        #md-rbar .md-rb-chap {
            flex: 0 0 auto;
            padding: 4px 10px;
            background: var(--card);
            color: var(--ink);
            border: 2px solid var(--bd);
            border-radius: 999px;
            box-shadow: var(--sh-sm);
            font: 800 11.5px/1 var(--f-mono);
            cursor: pointer;
            transition: transform .12s ease-out, background-color .14s ease-out;
        }
        #md-rbar .md-rb-chap:hover { background: var(--cream); }
        #md-rbar .md-rb-chap:active { transform: scale(0.96); }

        /* Bottom Reader Dock (#md-dock — Concentric: 14px outer = 8px inner + 6px pad) */
        #md-dock {
            position: fixed;
            left: 50%;
            bottom: max(14px, env(safe-area-inset-bottom));
            z-index: 120;
            transform: translateX(-50%) translateY(0);
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            gap: 6px;
            max-width: calc(100vw - 20px);
            padding: 6px;
            background: var(--card);
            color: var(--ink);
            border: var(--bw) solid var(--bd);
            border-radius: 14px;
            box-shadow: var(--sh);
            transition: transform .2s ease-out, opacity .18s ease-out;
        }
        #md-dock.hide {
            transform: translateX(-50%) translateY(14px);
            opacity: 0;
            pointer-events: none;
        }
        #md-dock button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 38px;
            min-width: 38px;
            padding: 0 9px !important;
            margin: 0;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px var(--f-sans) !important;
            text-transform: uppercase;
            letter-spacing: .03em;
            cursor: pointer;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-dock button:hover:not(:disabled) {
            background: var(--yellow) !important;
            color: #111111 !important;
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0 var(--bd) !important;
        }
        html[data-md-theme="dark"] #md-dock button:hover:not(:disabled) { color: #ffffff !important; }
        #md-dock button:active:not(:disabled) { transform: scale(0.96); }
        #md-dock button[aria-pressed="true"] {
            background: var(--yellow) !important;
            color: var(--on-ink) !important;
        }
        html[data-md-theme="light"] #md-dock button[aria-pressed="true"] { color: #111111 !important; }
        #md-dock button:disabled { opacity: 0.4; cursor: not-allowed; }
        #md-dock .md-sep { width: 2px; height: 24px; background: var(--bd); margin: 0 2px; }
        #md-dock .md-zoom { min-width: 56px; font: 800 12px var(--f-mono) !important; font-variant-numeric: tabular-nums; }
        #md-dock .md-dl { --p: 0%; min-width: 88px; }
        #md-dock .md-dl[data-state="busy"] { background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important; }
        #md-dock .md-dl[data-state="done"] { background: var(--lime) !important; color: #111111 !important; }
        #md-dock .md-dl[data-state="error"] { background: var(--pink) !important; color: #ffffff !important; }
        #md-dock [data-act="bg"] svg { transition: transform .24s ease-out; }
        html[data-md-bg="paper"] #md-dock [data-act="bg"] svg { transform: rotate(90deg); }
        html[data-md-bg="dark"] #md-dock [data-act="bg"] svg { transform: rotate(180deg); }
        html[data-md-bg="black"] #md-dock [data-act="bg"] svg { transform: rotate(270deg); }

        /* ===== CHAPTER SELECT BAR (#md-sel-bar) — Concentric: 14px outer = 6px inner + 8px pad ===== */
        #md-sel-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            margin: 10px 4px 12px 0;
            padding: 8px;
            background: var(--card);
            border: var(--bw) solid var(--bd);
            border-radius: 14px;
            box-shadow: var(--sh);
        }
        #md-sel-bar button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 36px;
            padding: 6px 12px !important;
            cursor: pointer;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px var(--f-sans) !important;
            letter-spacing: .04em;
            text-transform: uppercase;
            transition: transform .12s ease-out, box-shadow .12s ease-out, background-color .14s ease-out;
        }
        #md-sel-bar button:hover:not(:disabled) {
            background: var(--yellow) !important;
            color: #111111 !important;
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0 var(--bd) !important;
        }
        html[data-md-theme="dark"] #md-sel-bar button:hover:not(:disabled) { color: #ffffff !important; }
        #md-sel-bar button:active:not(:disabled) { transform: scale(0.96); }
        #md-sel-bar button:disabled { opacity: 0.45; cursor: not-allowed; }
        #md-sel-bar button[aria-pressed="true"] { background: var(--ink-bg) !important; color: var(--on-ink) !important; }
        #md-sel-bar .md-sel-dl { --p: 0%; background: var(--lime) !important; color: #111111 !important; }
        html[data-md-theme="dark"] #md-sel-bar .md-sel-dl { color: #ffffff !important; }
        #md-sel-bar .md-sel-dl[data-state="busy"] {
            background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important;
            color: var(--ink) !important;
        }
        #md-sel-bar .md-sel-count,
        #md-sel-bar .md-sel-status {
            font: 800 12px var(--f-mono);
            font-variant-numeric: tabular-nums;
            color: var(--muted);
            padding: 0 4px;
        }
        #md-sel-bar [hidden] { display: none !important; }
        .md-ck {
            width: 18px !important;
            height: 18px !important;
            margin: 0 10px 0 6px !important;
            align-self: center !important;
            accent-color: var(--ink-bg) !important;
            cursor: pointer !important;
            flex: 0 0 auto !important;
        }

        /* ===== BACK TO TOP (#md-top) & TOAST (#md-toast) ===== */
        #md-top {
            position: fixed;
            z-index: 95;
            right: 24px;
            bottom: 24px;
            width: 46px;
            height: 46px;
            padding: 0;
            background: var(--yellow) !important;
            color: #111111 !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 999px !important;
            box-shadow: var(--sh) !important;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transform: translateY(10px);
            transition: opacity .18s ease-out, transform .18s ease-out, background-color .14s ease-out, box-shadow .14s ease-out;
        }
        html[data-md-theme="dark"] #md-top { color: #ffffff !important; }
        #md-top.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
        #md-top:hover { background: var(--card) !important; color: var(--ink) !important; transform: translate(-1px, -1px); box-shadow: var(--sh-hover) !important; }
        #md-top:active { transform: scale(0.96); }
        html[data-md-page="chapter"] #md-top { display: none !important; }

        #md-toast {
            position: fixed;
            left: 50%;
            bottom: 78px;
            z-index: 130;
            transform: translateX(-50%) translateY(8px);
            max-width: calc(100vw - 24px);
            padding: 8px 14px;
            background: var(--ink-bg);
            color: var(--on-ink);
            border: 2px solid var(--bd);
            border-radius: 8px;
            box-shadow: var(--sh-sm);
            font: 700 13px var(--f-sans);
            opacity: 0;
            pointer-events: none;
            transition: opacity .18s ease-out, transform .18s ease-out;
        }
        #md-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        .nb-frame { opacity: 0; pointer-events: none; position: fixed; z-index: -1; inset: 0; width: 100vw; height: 100vh; border: 0; }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 1180px) {
            #md-hero .md-hero-card { right: clamp(20px, 4vw, 68px); --mdc-w: clamp(210px, 23vw, 260px); bottom: -58px; }
            #md-hero .md-hero-body { max-width: min(540px, 56%) !important; }
        }
        @media (max-width: 768px) {
            #md-hero {
                padding: 16px 14px 14px !important;
                min-height: clamp(320px, 84vw, 390px) !important;
                flex-direction: column !important;
                align-items: stretch !important;
                justify-content: flex-start !important;
                gap: 10px !important;
            }
            #md-hero .md-hero-body { max-width: 100% !important; min-height: 0 !important; justify-content: flex-start !important; }
            #md-hero .md-hero-card { --mdc-w: clamp(118px, 36vw, 165px); bottom: -36px !important; right: clamp(16px, 5vw, 28px) !important; }
            #md-hero .md-hero-card-art { border-radius: 12px !important; box-shadow: 6px 6px 0 #000000 !important; transform: rotate(3.5deg) !important; }
            #md-hero .md-hero-meta, #md-hero .md-hero-cta { max-width: calc(100% - clamp(142px, 42vw, 190px)) !important; }
            #md-hero .md-hero-cta { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 14px !important; }
            #md-hero .md-hero-btn { width: 100% !important; max-width: 170px !important; padding: 9px 14px !important; font-size: 12.5px !important; }
            #md-hero .md-hero-thumbs { margin-top: auto !important; max-width: calc(100% - clamp(142px, 42vw, 190px) + 18px) !important; gap: 7px !important; }
            #md-hero .md-hero-thumb { flex: 0 0 38px !important; width: 38px !important; height: 56px !important; }
            #md-rbar { padding: 6px 10px; gap: 6px; }
            #md-rbar .md-rb-lbl { display: none; }
            #md-rbar .md-rb-btn { padding: 0 8px; }
            #md-dock { gap: 4px; padding: 5px; }
            #md-dock button { padding: 0 7px !important; height: 36px; min-width: 36px; }
            #md-dock .md-lbl { display: none !important; }
        }
        @media (max-width: 420px) {
            html[data-md-site="comix"] header.topnav .logo { width: 6.2rem; }
        }
        @media (prefers-reduced-motion: reduce) {
            html[data-md-site="comix"] *, #md-hero * { animation: none !important; transition: none !important; }
        }

        /* ===== FINAL HIGH-SPECIFICITY AUTH DE-BLOAT ===== */
        ${CONFIG.hideAuthUI ? `html[data-md-site="comix"][data-md-site="comix"] :is(${AUTH_SELECTORS.join(', ')}) { display: none !important; }` : ''}
    `;

    function injectStyles() {
        if (!document.getElementById('md-fonts')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'md-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500..900&family=JetBrains+Mono:wght@500;700;800&display=swap';
            (document.head || root).appendChild(fontLink);
        }
        let style = document.getElementById('neobrutalism-comix-css');
        if (!style) {
            style = document.createElement('style');
            style.id = 'neobrutalism-comix-css';
            style.textContent = cssComix;
            (document.head || root).appendChild(style);
        }
        if (style.parentNode && style.parentNode.lastElementChild !== style) {
            style.parentNode.appendChild(style);
        }
    }
    injectStyles();

    /* ====================================================================
     *  DOM DE-BLOAT, DROPDOWN & USER PROFILE TAGGING
     * ==================================================================== */
    const AUTH_EXACT_RE = /^(log\s*in|login|sign\s*in|sign\s*up|register|follow|following|unfollow|add\s+to\s+collection|add\s+to\s+list|bookmark|reply|post\s+comment|add\s+comment|new\s+post|create\s+post)$/i;

    function purgeAuthUI(app) {
        if (!CONFIG.hideAuthUI) return;
        for (const el of $$('button, a, [role="button"]', app)) {
            if (el.closest(UI_ZONES) || el.dataset.mdAuthHide === '1') continue;
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
            if (AUTH_EXACT_RE.test(txt) || AUTH_EXACT_RE.test(aria)) {
                el.dataset.mdAuthHide = '1';
            }
        }
    }

    function renderCommentScores(app) {
        for (const ctrls of $$('.cm-item__ctrls', app)) {
            const likeEl = $('.cm-item__ctrl--like', ctrls);
            const dislikeEl = $('.cm-item__ctrl--dislike', ctrls);
            if (!likeEl && !dislikeEl) continue;
            const likes = parseCompactInt(likeEl?.textContent);
            const dislikes = parseCompactInt(dislikeEl?.textContent);
            const score = likes - dislikes;
            const label = score > 0 ? `+${score}` : String(score);
            let pill = $('.md-cm-score', ctrls);
            if (!pill) {
                pill = document.createElement('span');
                pill.className = 'md-cm-score';
                ctrls.prepend(pill);
            }
            if (pill.dataset.score !== label) {
                pill.dataset.score = label;
                pill.dataset.sign = score > 0 ? 'pos' : score < 0 ? 'neg' : 'zero';
                pill.setAttribute('aria-label', 'Score: ' + label);
                pill.textContent = (score >= 0 ? '▲ ' : '▼ ') + label;
            }
        }
    }

    (function installDialogCloseAnimator() {
        document.addEventListener('click', e => {
            if (reducedMotion.matches || e.__mdAnimatedClose) return;
            const target = e.target instanceof Element ? e.target : null;
            if (!target || target.closest(UI_ZONES)) return;
            const closeBtn = target.closest('[role="dialog"] [aria-label*="close" i], [role="dialog"] [class*="close" i], .rpage-cmpanel__close, .settings-dialog__close');
            if (!closeBtn) return;
            const panel = closeBtn.closest('.settings-dialog__panel, .rpage-cmpanel, [role="dialog"], [aria-modal="true"]');
            if (!panel || panel.classList.contains('md-closing')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            panel.classList.add('md-closing');
            setTimeout(() => {
                const synthetic = new MouseEvent('click', { bubbles: true, cancelable: true });
                synthetic.__mdAnimatedClose = true;
                closeBtn.dispatchEvent(synthetic);
            }, 150);
        }, true);
    })();

    // 4 fixed extra presets + 20th dynamic saved-custom circle = 20 circles (2 clean rows of 10)
    const EXTRA_PRESETS = [
        { name: 'Cyberpunk', bg: '#0f1021', text: '#e6e8ff', accent: '#ff2a85' },
        { name: 'Matcha', bg: '#162019', text: '#e3f0e5', accent: '#84cc16' },
        { name: 'Amber Noir', bg: '#181410', text: '#f2e8dc', accent: '#f59e0b' },
        { name: 'Sakura Light', bg: '#fdf2f5', text: '#2b1720', accent: '#db2777' },
    ];

    function setReactInputValue(input, value) {
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyCustomPaletteToInputs(panel, colors) {
        if (!panel || !colors) return;
        const hexInputs = $$('.settings-color__hex', panel);
        const colorInputs = $$('input[type="color"]', panel);
        const vals = [colors.bg, colors.text, colors.accent];
        vals.forEach((v, i) => {
            if (!v) return;
            if (hexInputs[i]) setReactInputValue(hexInputs[i], v);
            if (colorInputs[i]) setReactInputValue(colorInputs[i], v);
        });
        // Also sync CSS vars directly so the preview updates immediately even if React defers one tick
        if (colors.bg) root.style.setProperty('--bg', colors.bg);
        if (colors.text) { root.style.setProperty('--text', colors.text); root.style.setProperty('--text-emphasis', colors.text); }
        if (colors.accent) root.style.setProperty('--accent', colors.accent);
        setTheme('custom', true);
    }

    function enhanceSettingsPresets() {
        const panel = $('.settings-custom');
        if (!panel) return;
        const firstPreset = $('.settings-custom__preset', panel);
        const grid = firstPreset?.parentElement;
        if (!grid || grid.dataset.mdExtraPresets === '1') return;
        grid.dataset.mdExtraPresets = '1';

        const extraBtns = [];
        for (const p of EXTRA_PRESETS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'settings-custom__preset md-extra-preset';
            btn.title = p.name;
            btn.setAttribute('aria-label', p.name + ' preset');
            btn.setAttribute('aria-pressed', 'false');
            btn.style.background = `linear-gradient(135deg, ${p.bg} 50%, ${p.accent} 50%)`;
            btn.addEventListener('click', () => {
                applyCustomPaletteToInputs(panel, p);
                $$('.settings-custom__preset', grid).forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
                customSwatch.dataset.active = '0';
                customSwatch.setAttribute('aria-pressed', 'false');
            });
            grid.appendChild(btn);
            extraBtns.push(btn);
        }

        // 20th circle: dynamically reflects & saves the user's own custom colors in localStorage (never overwritten by preset themes)
        const savedCustom = store.get('saved-custom', { bg: '#0e1726', text: '#e2eefc', accent: '#38bdf8' });
        const customSwatch = document.createElement('button');
        customSwatch.type = 'button';
        customSwatch.className = 'settings-custom__preset md-custom-swatch';
        customSwatch.title = 'Your Saved Custom Theme';
        customSwatch.setAttribute('aria-label', 'Saved custom theme');
        customSwatch.setAttribute('aria-pressed', 'false');
        customSwatch.dataset.active = '0';
        customSwatch.style.background = `linear-gradient(135deg, ${savedCustom.bg} 50%, ${savedCustom.accent} 50%)`;
        customSwatch.addEventListener('click', () => {
            const cur = store.get('saved-custom', savedCustom);
            applyCustomPaletteToInputs(panel, cur);
            $$('.settings-custom__preset', grid).forEach(b => b.setAttribute('aria-pressed', 'false'));
            customSwatch.dataset.active = '1';
            customSwatch.setAttribute('aria-pressed', 'true');
        });
        grid.appendChild(customSwatch);

        const saveManualCustom = () => {
            const hexInputs = $$('.settings-color__hex', panel);
            const colorInputs = $$('input[type="color"]', panel);
            const bg = (hexInputs[0]?.value || colorInputs[0]?.value || '').trim();
            const text = (hexInputs[1]?.value || colorInputs[1]?.value || '').trim();
            const accent = (hexInputs[2]?.value || colorInputs[2]?.value || '').trim();
            if (/^#[0-9a-f]{3,8}$/i.test(bg) && /^#[0-9a-f]{3,8}$/i.test(accent)) {
                const payload = { bg, text: /^#[0-9a-f]{3,8}$/i.test(text) ? text : '#ffffff', accent };
                store.set('saved-custom', payload);
                customSwatch.style.background = `linear-gradient(135deg, ${bg} 50%, ${accent} 50%)`;
                $$('.settings-custom__preset', grid).forEach(b => b.setAttribute('aria-pressed', 'false'));
                customSwatch.dataset.active = '1';
                customSwatch.setAttribute('aria-pressed', 'true');
            }
        };

        // Clicking any native preset clears extra presets + deactivates the 20th circle WITHOUT changing its saved custom split colors
        grid.addEventListener('click', e => {
            const clicked = e.target instanceof Element ? e.target.closest('.settings-custom__preset') : null;
            if (!clicked || clicked.classList.contains('md-extra-preset') || clicked === customSwatch) return;
            extraBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
            customSwatch.dataset.active = '0';
            customSwatch.setAttribute('aria-pressed', 'false');
        }, true);

        // Only direct user edits in the Background / Text / Accent pickers update & save the 20th circle
        panel.addEventListener('input', e => {
            if (e.isTrusted && e.target instanceof Element && e.target.closest('.settings-color__hex, input[type="color"]')) {
                saveManualCustom();
            }
        });
    }

    function tagDropdowns(app) {
        const browseWrap = $('.topnav .browse', app);
        if (browseWrap) {
            for (const child of browseWrap.children) {
                if (child.tagName !== 'BUTTON' && child.querySelector('a[href]')) {
                    child.dataset.mdDropdown = '1';
                }
            }
        }
    }

    function tagCommunityPage(app) {
        if (detectPage() !== 'community') return;
        const main = $('main', app) || app;
        const h1 = $('h1', main);
        if (h1 && !h1.closest('[data-md-comm-head="1"]')) {
            const headBox = h1.closest('header, section, [class*="head" i], [class*="hero" i]') || h1.parentElement;
            if (headBox && headBox !== main && !headBox.closest(UI_ZONES) && !headBox.closest('.cm-widget')) {
                headBox.dataset.mdCommHead = '1';
            }
        }
        for (const nav of $$('nav, [role="tablist"], [class*="tabs" i], [class*="cats" i], [class*="filter" i]', main)) {
            if (nav.closest(UI_ZONES) || nav.closest('.cm-widget') || nav.dataset.mdCommTabs === '1') continue;
            const items = $$(':scope > a, :scope > button', nav);
            if (items.length >= 3 && !nav.classList.contains('npager')) {
                nav.dataset.mdCommTabs = '1';
            }
        }
        for (const postLink of $$('a[href^="/community/post/"]', main)) {
            if (postLink.closest(UI_ZONES) || postLink.closest('.cm-widget')) continue;
            const card = postLink.closest('li, article');
            if (card && card !== main && !card.dataset.mdCommCard && !card.parentElement?.closest('[data-md-comm-card="1"]')) {
                card.dataset.mdCommCard = '1';
            }
        }
    }

    function tagUserProfile(app) {
        if (detectPage() !== 'user') return;
        const main = $('main', app) || app;
        // Tag profile header card (contains the user's h1 + avatar/joined text)
        const h1 = $('h1', main);
        if (h1 && !h1.closest('[data-md-user-hero="1"]')) {
            const heroBox = h1.closest('header, section, [class*="head" i], [class*="hero" i], [class*="profile" i]') || h1.parentElement?.parentElement;
            if (heroBox && heroBox !== main && !heroBox.closest(UI_ZONES)) {
                heroBox.dataset.mdUserHero = '1';
            }
        }
        // Tag profile navigation tab bar (Wall / Collections / Recent reads / Comments / Posts / Followers / Stats)
        for (const nav of $$('nav, [role="tablist"], div', main)) {
            if (nav.closest(UI_ZONES) || nav.dataset.mdUserTabs === '1') continue;
            const items = $$(':scope > a, :scope > button', nav);
            if (items.length >= 4 && items.some(x => /^wall$/i.test(x.textContent.trim())) && items.some(x => /^comments$/i.test(x.textContent.trim()))) {
                nav.dataset.mdUserTabs = '1';
                break;
            }
        }
    }

    /* ====================================================================
     *  NETFLIX-STYLE FEATURED HERO CAROUSEL (#md-hero)
     * ==================================================================== */
    let heroState = null;
    const firstChPending = new Map();

    async function resolveFirstChapterUrl(seriesPath) {
        if (!seriesPath) return null;
        try {
            const cached = sessionStorage.getItem('md-comix-firstch:' + seriesPath);
            if (cached) return cached;
        } catch (_) {}
        if (firstChPending.has(seriesPath)) return firstChPending.get(seriesPath);

        const job = (async () => {
            try {
                const res = await fetch(seriesPath, { credentials: 'same-origin' });
                if (!res.ok) return null;
                const html = await res.text();
                // 1. Comix embeds exact detail.firstChapterUrl (handles Ch. 0, Prologue, Ch. 0.1, Ch. 1, etc.) inside #initial-data
                const initMatch = html.match(/<script[^>]*id=["']initial-data["'][^>]*>([\s\S]*?)<\/script>/i);
                if (initMatch) {
                    try {
                        const data = JSON.parse(initMatch[1]);
                        for (const val of Object.values(data?.queries || {})) {
                            if (val && typeof val === 'object' && typeof val.firstChapterUrl === 'string' && val.firstChapterUrl) {
                                const u = route(val.firstChapterUrl, CHAPTER_PATH);
                                if (u) {
                                    try { sessionStorage.setItem('md-comix-firstch:' + seriesPath, u.pathname); } catch (_) {}
                                    return u.pathname;
                                }
                            }
                        }
                    } catch (_) {}
                }
                // 2. Fallback: parse DOM links and pick the lowest numeric chapter (including 0, 0.1, etc.)
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const candidates = [];
                for (const a of $$('a[href*="-chapter-"]', doc)) {
                    const u = route(a.getAttribute('href'), CHAPTER_PATH);
                    if (!u || !u.pathname.startsWith(seriesPath + '/')) continue;
                    const m = u.pathname.match(/-chapter-(\d+(?:\.\d+)?)/i);
                    const num = m ? parseFloat(m[1]) : Infinity;
                    candidates.push({ url: u.pathname, num });
                }
                if (candidates.length) {
                    candidates.sort((a, b) => a.num - b.num);
                    const best = candidates[0].url;
                    try { sessionStorage.setItem('md-comix-firstch:' + seriesPath, best); } catch (_) {}
                    return best;
                }
            } catch (_) {}
            return null;
        })().finally(() => firstChPending.delete(seriesPath));

        firstChPending.set(seriesPath, job);
        return job;
    }

    function mountHero(column) {
        const cards = $$('.section .card[href]', column);
        const seen = new Set();
        const items = [];
        for (const card of cards) {
            const url = route(card.href, SERIES_PATH);
            const rawTitle = $('.card__title', card)?.textContent.trim();
            const img = $('.card__poster-wrap img', card);
            const cover = imageUrl(img?.currentSrc || img?.getAttribute('src'));
            if (!url || !rawTitle || !cover || seen.has(url.pathname)) continue;
            seen.add(url.pathname);
            const ch = $('.card__ch', card)?.textContent.trim() || '';
            const metaText = $('.card__meta', card)?.textContent.trim() || '';
            const views = metaText && metaText !== ch ? metaText.replace(ch, '').trim() : '';
            items.push({ url: url.pathname, title: toTitleCase(rawTitle), cover, chapter: ch, views });
            if (items.length === CONFIG.heroMaxSlides) break;
        }
        if (!items.length) return;

        const hero = document.createElement('section');
        hero.id = 'md-hero';
        hero.setAttribute('aria-label', 'Featured series');
        hero.innerHTML = `
            <div class="md-hero-bg"></div>
            <div class="md-hero-body">
                <span class="md-hero-tag">Featured on Comix</span>
                <h2 class="md-hero-title"></h2>
                <div class="md-hero-meta">
                    <span class="md-hero-views">${ICON.eye}<span class="md-hero-views-text"></span></span>
                    <span class="md-hero-chapter"></span>
                </div>
                <div class="md-hero-cta">
                    <a class="md-hero-btn md-hero-play">${ICON.play}<span>Read now</span></a>
                    <a class="md-hero-btn md-hero-more">${ICON.info}<span>More info</span></a>
                </div>
                <div class="md-hero-thumbs" role="tablist" aria-label="Featured series"></div>
            </div>
            <a class="md-hero-card" title="View series">
                <span class="md-hero-card-art"><img alt=""></span>
            </a>
        `;

        const thumbsContainer = $('.md-hero-thumbs', hero);
        let currentSlide = 0;
        let slideTimer = null;

        function setProgressRate(rate) {
            const activeFill = $('.md-hero-thumb.is-active .md-thumb-fill', hero);
            if (!activeFill || typeof activeFill.getAnimations !== 'function') return;
            activeFill.getAnimations().forEach(anim => { try { anim.playbackRate = rate; } catch (_) {} });
        }

        function restartTimer() {
            clearTimeout(slideTimer);
            if (!CONFIG.heroAutoplay || reducedMotion.matches || items.length <= 1) return;
            if (hero.matches(':hover') || document.hidden) return;
            let delay = 5800;
            const activeFill = $('.md-hero-thumb.is-active .md-thumb-fill', hero);
            if (activeFill && typeof activeFill.getAnimations === 'function') {
                const anims = activeFill.getAnimations();
                const a = anims.find(an => an.animationName === 'mdProgressFall') || anims[0];
                if (a && typeof a.currentTime === 'number') {
                    if (a.currentTime >= 5500) delay = 50;
                    else {
                        const rem = 5500 - a.currentTime;
                        if (rem > 0 && rem <= 5500) delay = rem + 300;
                    }
                }
            }
            slideTimer = setTimeout(() => {
                if (!hero.matches(':hover') && !document.hidden) showSlide((currentSlide + 1) % items.length);
            }, delay);
        }

        function showSlide(idx) {
            currentSlide = (idx + items.length) % items.length;
            const cur = items[currentSlide];
            const bg = $('.md-hero-bg', hero);
            if (bg) {
                bg.style.opacity = '0.18';
                setTimeout(() => { bg.style.backgroundImage = 'url(' + JSON.stringify(cur.cover) + ')'; bg.style.opacity = ''; }, 120);
            }
            const titleEl = $('.md-hero-title', hero);
            if (titleEl) {
                titleEl.style.opacity = '0.2';
                titleEl.style.transform = 'translateY(2px)';
                setTimeout(() => { titleEl.textContent = cur.title; titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)'; }, 100);
            }
            const viewsEl = $('.md-hero-views', hero);
            const viewsText = $('.md-hero-views-text', hero);
            if (viewsEl && viewsText) {
                if (cur.views) { viewsText.textContent = cur.views; viewsEl.style.display = 'inline-flex'; }
                else viewsEl.style.display = 'none';
            }
            const chapEl = $('.md-hero-chapter', hero);
            if (chapEl) {
                if (cur.chapter) { chapEl.textContent = fmtChapter(cur.chapter); chapEl.style.display = 'inline-flex'; }
                else chapEl.style.display = 'none';
            }
            const playBtn = $('.md-hero-play', hero);
            const moreBtn = $('.md-hero-more', hero);
            const cardLink = $('.md-hero-card', hero);
            if (playBtn) {
                let cachedFirst = null;
                try { cachedFirst = sessionStorage.getItem('md-comix-firstch:' + cur.url); } catch (_) {}
                playBtn.href = cachedFirst || cur.url;
                playBtn.dataset.seriesUrl = cur.url;
            }
            if (moreBtn) moreBtn.href = cur.url;
            if (cardLink) { cardLink.href = cur.url; cardLink.setAttribute('aria-label', cur.title); }
            const cardImg = $('.md-hero-card img', hero);
            if (cardImg) {
                cardImg.style.opacity = '0.35';
                setTimeout(() => { cardImg.src = cur.cover; cardImg.alt = cur.title; cardImg.style.opacity = '1'; }, 120);
            }
            $$('.md-hero-thumb', thumbsContainer).forEach((th, i) => {
                const f = $('.md-thumb-fill', th);
                const active = i === currentSlide;
                th.classList.toggle('is-active', active);
                th.setAttribute('aria-selected', String(active));
                if (active) {
                    if (f) {
                        f.style.animation = 'none';
                        void f.offsetWidth;
                        f.style.animation = '';
                        if (hero.matches(':hover') || !CONFIG.heroAutoplay || reducedMotion.matches) {
                            requestAnimationFrame(() => setProgressRate(hero.matches(':hover') ? 0.1 : 0));
                        }
                    }
                    const left = th.offsetLeft - (thumbsContainer.clientWidth - th.offsetWidth) / 2;
                    thumbsContainer.scrollTo({ left: Math.max(0, left), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
                } else if (f) {
                    f.style.animation = 'none';
                }
            });
            restartTimer();
        }

        items.forEach((item, idx) => {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = 'md-hero-thumb';
            thumb.setAttribute('role', 'tab');
            thumb.setAttribute('aria-label', item.title);
            thumb.title = item.title;
            const img = document.createElement('img');
            img.src = item.cover;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            const fill = document.createElement('div');
            fill.className = 'md-thumb-fill';
            thumb.append(img, fill);
            thumb.addEventListener('click', e => { e.preventDefault(); showSlide(idx); });
            fill.addEventListener('animationend', e => {
                if (e.animationName === 'mdProgressFall' && thumb.classList.contains('is-active') && !hero.matches(':hover')) {
                    showSlide((currentSlide + 1) % items.length);
                }
            });
            thumbsContainer.appendChild(thumb);
        });

        thumbsContainer.addEventListener('wheel', e => {
            if (e.deltaY !== 0 && !e.deltaX) { e.preventDefault(); thumbsContainer.scrollLeft += e.deltaY; }
        }, { passive: false });

        const onEnter = () => { clearTimeout(slideTimer); setProgressRate(0.1); };
        const onLeave = () => { setProgressRate(1.0); restartTimer(); };
        const onVis = () => {
            if (document.hidden) { clearTimeout(slideTimer); setProgressRate(0); }
            else { setProgressRate(hero.matches(':hover') ? 0.1 : 1.0); restartTimer(); }
        };

        const heroPlayBtn = $('.md-hero-play', hero);
        if (heroPlayBtn) {
            heroPlayBtn.addEventListener('mouseenter', () => {
                const sp = heroPlayBtn.dataset.seriesUrl;
                if (sp) resolveFirstChapterUrl(sp).then(firstUrl => {
                    if (firstUrl && heroPlayBtn.dataset.seriesUrl === sp) heroPlayBtn.href = firstUrl;
                });
            });
            heroPlayBtn.addEventListener('click', async e => {
                const sp = heroPlayBtn.dataset.seriesUrl;
                if (!sp) return;
                if (CHAPTER_PATH.test(new URL(heroPlayBtn.href, location.origin).pathname)) return;
                e.preventDefault();
                const lbl = $('span', heroPlayBtn);
                const origTxt = lbl?.textContent || 'Read now';
                if (lbl) lbl.textContent = 'Opening…';
                const firstUrl = await resolveFirstChapterUrl(sp);
                if (lbl) lbl.textContent = origTxt;
                location.href = firstUrl || sp;
            });
        }
        hero.addEventListener('mouseenter', onEnter);
        hero.addEventListener('mouseleave', onLeave);
        document.addEventListener('visibilitychange', onVis);

        column.prepend(hero);
        heroState = {
            node: hero,
            dispose() {
                clearTimeout(slideTimer);
                document.removeEventListener('visibilitychange', onVis);
                hero.remove();
            },
        };
        showSlide(0);
    }

    /* ====================================================================
     *  COVER CACHE (Fixes missing Continue Reading & Library thumbnails)
     * ==================================================================== */
    function getCoverMap() {
        const m = store.get('covers', {});
        return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    }

    function saveCoverToCache(seriesPath, url) {
        const clean = imageUrl(url);
        if (!seriesPath || !clean) return;
        const map = getCoverMap();
        if (map[seriesPath] === clean) return;
        map[seriesPath] = clean;
        const keys = Object.keys(map);
        if (keys.length > 400) delete map[keys[0]];
        store.set('covers', map);
    }

    function getCachedCover(seriesPath) {
        if (!seriesPath) return '';
        return imageUrl(getCoverMap()[seriesPath] || '');
    }

    function imgSrcOf(img) {
        if (!img) return '';
        return imageUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'));
    }

    function harvestCovers(app) {
        for (const a of $$('.card[href], .lrow a[href], .side-item a[href]', app)) {
            const u = route(a.href, SERIES_PATH);
            if (!u) continue;
            const host = a.closest('.card, .lrow, .side-item') || a;
            const img = $('img', host);
            const src = imgSrcOf(img);
            if (src) saveCoverToCache(u.pathname, src);
        }
        if (detectPage() === 'overview') {
            const img = $('.mpage__poster img', app);
            const src = imgSrcOf(img);
            if (src) saveCoverToCache(location.pathname, src);
        }
    }

    const coverFetchPending = new Set();
    async function backfillSeriesCover(seriesPath) {
        if (!seriesPath || coverFetchPending.has(seriesPath)) return '';
        const cached = getCachedCover(seriesPath);
        if (cached) return cached;
        coverFetchPending.add(seriesPath);
        try {
            const res = await fetch(seriesPath, { credentials: 'same-origin' });
            if (!res.ok) return '';
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const img = $('.mpage__poster img', doc);
            const found = imageUrl(img?.getAttribute('src') || $('meta[property="og:image"]', doc)?.content, location.origin);
            if (found) {
                saveCoverToCache(seriesPath, found);
                return found;
            }
        } catch (_) {}
        finally { coverFetchPending.delete(seriesPath); }
        return '';
    }

    /* ====================================================================
     *  LOCAL LIBRARY & CUSTOM LISTS (Top Bar Button + Cover '+' Interceptor)
     * ==================================================================== */
    const DEFAULT_LISTS = [
        { id: 'reading', name: 'Currently Reading', items: [] },
        { id: 'plan', name: 'Plan to Read', items: [] },
        { id: 'completed', name: 'Completed', items: [] },
    ];

    function getLibrary() {
        const data = store.get('lists', null);
        if (data && Array.isArray(data.lists) && data.lists.length) {
            const r = data.lists.find(l => l.id === 'reading');
            if (r && r.name === 'Reading') { r.name = 'Currently Reading'; store.set('lists', data); }
            return data;
        }
        const init = { lists: DEFAULT_LISTS.map(l => ({ ...l, items: [] })) };
        store.set('lists', init);
        return init;
    }

    function upsertCurrentlyReading(series) {
        if (!series?.path) return;
        const lib = getLibrary();
        let list = lib.lists.find(l => l.id === 'reading');
        if (!list) {
            list = { id: 'reading', name: 'Currently Reading', items: [] };
            lib.lists.unshift(list);
        }
        const existing = list.items.find(it => it.path === series.path);
        const cover = imageUrl(series.cover) || existing?.cover || getCachedCover(series.path);
        list.items = list.items.filter(it => it.path !== series.path);
        list.items.unshift({
            path: series.path,
            title: toTitleCase(series.title || existing?.title || 'Series'),
            cover,
            addedAt: Date.now(),
        });
        saveLibrary(lib);
    }

    function removeFromCurrentlyReading(seriesPath) {
        if (!seriesPath) return;
        const lib = getLibrary();
        const list = lib.lists.find(l => l.id === 'reading');
        if (!list) return;
        const before = list.items.length;
        list.items = list.items.filter(it => it.path !== seriesPath);
        if (list.items.length !== before) saveLibrary(lib);
    }

    function saveLibrary(data) {
        store.set('lists', data);
        syncSavedBadges();
    }

    function isSeriesSaved(seriesPath) {
        if (!seriesPath) return false;
        return getLibrary().lists.some(l => l.items.some(it => it.path === seriesPath));
    }

    function toggleSeriesInList(listId, series) {
        const lib = getLibrary();
        const list = lib.lists.find(l => l.id === listId);
        if (!list) return false;
        const idx = list.items.findIndex(it => it.path === series.path);
        let added = false;
        if (idx >= 0) {
            list.items.splice(idx, 1);
        } else {
            list.items.unshift({
                path: series.path,
                title: toTitleCase(series.title),
                cover: imageUrl(series.cover) || getCachedCover(series.path),
                addedAt: Date.now(),
            });
            added = true;
        }
        saveLibrary(lib);
        return added;
    }

    function createCustomList(name) {
        const clean = String(name || '').trim().slice(0, 40);
        if (!clean) return null;
        const lib = getLibrary();
        const existing = lib.lists.find(l => l.name.toLowerCase() === clean.toLowerCase());
        if (existing) return existing;
        const nl = { id: 'list_' + Date.now().toString(36), name: clean, items: [] };
        lib.lists.push(nl);
        saveLibrary(lib);
        return nl;
    }

    function deleteCustomList(listId) {
        const lib = getLibrary();
        if (lib.lists.length <= 1) { toast('Keep at least one list'); return; }
        lib.lists = lib.lists.filter(l => l.id !== listId);
        saveLibrary(lib);
    }

    function syncSavedBadges() {
        for (const btn of $$('.card__action--menu, button[aria-label="Add to library"]')) {
            const host = btn.closest('.card, .lrow, .side-item');
            const a = host && (host.matches('a[href]') ? host : $('a[href*="/title/"]', host));
            const u = a && route(a.href, SERIES_PATH);
            if (!u) continue;
            const saved = isSeriesSaved(u.pathname);
            btn.dataset.mdSaved = saved ? '1' : '0';
            btn.title = saved ? 'Saved in Library (click to manage lists)' : 'Save to local list';
        }
        const serBtn = $('#md-series-save');
        if (serBtn && SERIES_PATH.test(location.pathname)) {
            const saved = isSeriesSaved(location.pathname);
            serBtn.dataset.mdSaved = saved ? '1' : '0';
            serBtn.innerHTML = `${saved ? ICON.check : ICON.plus}<span>${saved ? 'In Library' : 'Add to List'}</span>`;
        }
    }

    function openListPicker(series) {
        $('#md-list-picker')?.remove();
        const cover = imageUrl(series.cover) || getCachedCover(series.path);
        if (cover) saveCoverToCache(series.path, cover);

        const overlay = document.createElement('div');
        overlay.id = 'md-list-picker';
        overlay.innerHTML = `
            <div class="md-pick-panel md-own-dialog" role="dialog" aria-label="Save to local list">
                <div class="md-modal-head">
                    <h2>Save to List</h2>
                    <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
                </div>
                <div class="md-pick-series">
                    ${cover ? `<img class="md-pick-thumb" src="${cover}" alt="">` : '<div class="md-pick-thumb"></div>'}
                    <div class="md-pick-meta">
                        <div class="md-pick-title"></div>
                        <div class="md-pick-sub">Stored locally in your browser</div>
                    </div>
                </div>
                <div class="md-pick-lists"></div>
                <form class="md-pick-foot">
                    <input type="text" class="md-lib-input" placeholder="New list name…" maxlength="40" aria-label="New list name">
                    <button type="submit" class="md-lib-btn">${ICON.plus}<span>Create</span></button>
                </form>
            </div>
        `;
        $('.md-pick-title', overlay).textContent = toTitleCase(series.title);
        const listWrap = $('.md-pick-lists', overlay);

        function renderLists() {
            const lib = getLibrary();
            listWrap.textContent = '';
            for (const l of lib.lists) {
                const inList = l.items.some(it => it.path === series.path);
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'md-pick-row';
                row.dataset.in = inList ? '1' : '0';
                row.innerHTML = `<span></span><span class="md-pick-row-badge">${inList ? '✓ Saved' : '+ Add'}</span>`;
                row.firstElementChild.textContent = `${l.name} (${l.items.length})`;
                row.addEventListener('click', () => {
                    const added = toggleSeriesInList(l.id, { ...series, cover });
                    toast(added ? `Added to ${l.name}` : `Removed from ${l.name}`, 1600);
                    renderLists();
                });
                listWrap.appendChild(row);
            }
        }

        const onKey = e => { if (e.key === 'Escape') close(); };
        const close = () => {
            document.removeEventListener('keydown', onKey);
            if (reducedMotion.matches) { overlay.remove(); return; }
            overlay.classList.add('md-closing');
            setTimeout(() => overlay.remove(), 150);
        };
        document.addEventListener('keydown', onKey);
        $('.md-modal-close', overlay).addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        $('.md-pick-foot', overlay).addEventListener('submit', e => {
            e.preventDefault();
            const inp = $('.md-lib-input', overlay);
            const nl = createCustomList(inp.value);
            if (!nl) return;
            toggleSeriesInList(nl.id, { ...series, cover });
            inp.value = '';
            toast(`Created "${nl.name}" & saved series`, 1800);
            renderLists();
        });

        renderLists();
        document.body.appendChild(overlay);
    }

    function openLibraryModal() {
        $('#md-lib-modal')?.remove();
        let activeListId = '__all__';

        const overlay = document.createElement('div');
        overlay.id = 'md-lib-modal';
        overlay.innerHTML = `
            <div class="md-lib-panel md-own-dialog" role="dialog" aria-label="My Local Library">
                <div class="md-modal-head">
                    <h2>My Library</h2>
                    <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
                </div>
                <div class="md-lib-tabs"></div>
                <div class="md-lib-body"></div>
            </div>
        `;
        const tabsEl = $('.md-lib-tabs', overlay);
        const bodyEl = $('.md-lib-body', overlay);

        function renderLibrary() {
            const lib = getLibrary();
            const allMap = new Map();
            lib.lists.forEach(l => l.items.forEach(it => { if (!allMap.has(it.path)) allMap.set(it.path, it); }));

            tabsEl.textContent = '';
            const makeTab = (id, label, count) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'md-lib-tab' + (activeListId === id ? ' is-active' : '');
                b.innerHTML = `<span></span><span class="md-tab-cnt">${count}</span>`;
                b.firstElementChild.textContent = label;
                b.addEventListener('click', () => { activeListId = id; renderLibrary(); });
                tabsEl.appendChild(b);
            };
            makeTab('__all__', 'All Saved', allMap.size);
            lib.lists.forEach(l => makeTab(l.id, l.name, l.items.length));

            const form = document.createElement('form');
            form.className = 'md-lib-newform';
            form.innerHTML = `<input type="text" class="md-lib-input" placeholder="New list…" maxlength="40"><button type="submit" class="md-lib-btn">${ICON.plus}<span>Add List</span></button>`;
            form.addEventListener('submit', e => {
                e.preventDefault();
                const inp = $('input', form);
                const nl = createCustomList(inp.value);
                if (!nl) return;
                activeListId = nl.id;
                renderLibrary();
                toast(`Created list "${nl.name}"`, 1600);
            });
            tabsEl.appendChild(form);

            bodyEl.textContent = '';
            const activeList = lib.lists.find(l => l.id === activeListId);
            if (activeList && lib.lists.length > 1) {
                const topRow = document.createElement('div');
                topRow.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:12px;';
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'md-lib-btn md-lib-btn--danger';
                delBtn.innerHTML = `${ICON.trash}<span>Delete "${activeList.name}"</span>`;
                delBtn.addEventListener('click', () => {
                    deleteCustomList(activeList.id);
                    activeListId = '__all__';
                    renderLibrary();
                    toast('List deleted', 1500);
                });
                topRow.appendChild(delBtn);
                bodyEl.appendChild(topRow);
            }

            const items = activeList ? activeList.items : [...allMap.values()];
            if (!items.length) {
                const empty = document.createElement('div');
                empty.className = 'md-lib-empty';
                empty.textContent = 'No series saved here yet. Hover any cover and click the + button (or use "Add to List" on a series page) to save it locally.';
                bodyEl.appendChild(empty);
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'md-lib-grid';
            for (const it of items) {
                const card = document.createElement('article');
                card.className = 'md-lib-card';
                const cover = imageUrl(it.cover) || getCachedCover(it.path);
                const poster = document.createElement('a');
                poster.className = 'md-lib-poster';
                poster.href = it.path;
                if (cover) {
                    const img = document.createElement('img');
                    img.src = cover;
                    img.alt = it.title;
                    img.loading = 'lazy';
                    poster.appendChild(img);
                } else {
                    backfillSeriesCover(it.path).then(found => {
                        if (!found || !poster.isConnected) return;
                        const img = document.createElement('img');
                        img.src = found;
                        img.alt = it.title;
                        poster.appendChild(img);
                    });
                }
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'md-lib-card-rm';
                rm.title = activeList ? `Remove from ${activeList.name}` : 'Manage lists';
                rm.innerHTML = activeList ? ICON.stop : ICON.plus;
                rm.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeList) {
                        toggleSeriesInList(activeList.id, it);
                        renderLibrary();
                        toast(`Removed from ${activeList.name}`, 1500);
                    } else {
                        openListPicker(it);
                    }
                });
                const body = document.createElement('div');
                body.className = 'md-lib-card-body';
                const titleLink = document.createElement('a');
                titleLink.className = 'md-lib-card-title';
                titleLink.href = it.path;
                titleLink.textContent = toTitleCase(it.title);
                body.appendChild(titleLink);
                card.append(rm, poster, body);
                grid.appendChild(card);
            }
            bodyEl.appendChild(grid);
        }

        const onKey = e => { if (e.key === 'Escape') close(); };
        const close = () => {
            document.removeEventListener('keydown', onKey);
            if (reducedMotion.matches) { overlay.remove(); return; }
            overlay.classList.add('md-closing');
            setTimeout(() => overlay.remove(), 150);
        };
        document.addEventListener('keydown', onKey);
        $('.md-modal-close', overlay).addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        renderLibrary();
        document.body.appendChild(overlay);
    }

    function mountLibraryTopBtn(app) {
        const right = $('header.topnav .topnav__right', app);
        if (!right || $('#md-lib-btn', right)) return;
        const btn = document.createElement('button');
        btn.id = 'md-lib-btn';
        btn.type = 'button';
        btn.className = 'icon-btn';
        btn.title = 'My Local Library & Lists';
        btn.setAttribute('aria-label', 'My Local Library');
        btn.innerHTML = ICON.bookmark;
        btn.addEventListener('click', () => openLibraryModal());
        const settings = $('.settings', right);
        if (settings) settings.before(btn);
        else right.prepend(btn);
    }

    function mountSeriesSaveBtn(app) {
        if (detectPage() !== 'overview') return;
        const readBtn = $('.mpage__read', app);
        if (!readBtn || $('#md-series-save', app)) return;
        const btn = document.createElement('button');
        btn.id = 'md-series-save';
        btn.type = 'button';
        btn.addEventListener('click', () => {
            const title = $('.mpage__title', app)?.textContent.trim() || document.title;
            const img = $('.mpage__poster img', app);
            const cover = imageUrl(img?.currentSrc || img?.getAttribute('src')) || getCachedCover(location.pathname);
            openListPicker({ path: location.pathname, title, cover });
        });
        readBtn.after(btn);
        syncSavedBadges();
    }

    // Intercept Comix's cover '+' ("Add to library") button so it opens our local list picker instead of login
    document.addEventListener('click', e => {
        const target = e.target instanceof Element ? e.target : null;
        if (!target || target.closest(UI_ZONES)) return;
        const plusBtn = target.closest('.card__action--menu, button[aria-label="Add to library"], button[title="Add to library"]');
        if (!plusBtn) return;
        const host = plusBtn.closest('.card, .lrow, .side-item');
        if (!host) return;
        const link = host.matches('a[href]') ? host : $('a[href*="/title/"]', host);
        const u = link && route(link.href, SERIES_PATH);
        if (!u) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const title = ($('.card__title, .lrow__title, .side-item__title, h3, h2', host)?.textContent || link.getAttribute('title') || link.textContent || 'Series').trim();
        const img = $('img', host);
        const cover = imageUrl(img?.currentSrc || img?.getAttribute('src')) || getCachedCover(u.pathname);
        openListPicker({ path: u.pathname, title, cover });
    }, true);

    /* ====================================================================
     *  CONTINUE READING SHELF (#md-continue-reading)
     * ==================================================================== */
    let historyNode = null;
    let lastTracked = null;
    let clearArmed = false;

    function historyItems() {
        const stored = store.get('history', []);
        if (!Array.isArray(stored)) return [];
        return stored.filter(item => item && typeof item.title === 'string' && route(item.url, CHAPTER_PATH));
    }

    function saveHistory(items) { store.set('history', items.slice(0, CONFIG.historyLimit)); }

    function mountHistory(column) {
        if (historyNode?.isConnected) return;
        const items = historyItems();
        if (!items.length) return;

        const sec = document.createElement('section');
        sec.id = 'md-continue-reading';
        sec.setAttribute('aria-label', 'Continue reading');

        const head = document.createElement('div');
        head.className = 'md-cr-head';
        const headingWrap = document.createElement('div');
        headingWrap.className = 'section__title-wrap';
        const h2 = document.createElement('h2');
        h2.className = 'section__title';
        h2.textContent = 'Continue Reading';
        headingWrap.appendChild(h2);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'md-cr-clear';
        clearBtn.textContent = 'Clear history';
        clearBtn.addEventListener('click', () => {
            if (!clearArmed) {
                clearArmed = true;
                clearBtn.textContent = 'Click again to confirm';
                setTimeout(() => { clearArmed = false; if (clearBtn.isConnected) clearBtn.textContent = 'Clear history'; }, 3000);
                return;
            }
            clearArmed = false;
            historyItems().forEach(x => removeFromCurrentlyReading(x.seriesPath));
            saveHistory([]);
            sec.remove();
            historyNode = null;
            toast('Reading history cleared');
        });
        head.append(headingWrap, clearBtn);

        const track = document.createElement('div');
        track.className = 'md-cr-track';

        items.forEach(item => {
            const page = Number.isInteger(item.page) && item.page > 0 ? item.page : 0;
            const totalPages = Number.isInteger(item.totalPages) && item.totalPages > 0 ? item.totalPages : 0;
            const pct = page && totalPages ? Math.min(100, Math.round((page / totalPages) * 100)) : (page > 1 ? 35 : 10);
            const resumeHref = item.url + (page > 1 ? '#page=' + page : '');
            const displayTitle = toTitleCase(item.title);
            const cover = imageUrl(item.cover) || getCachedCover(item.seriesPath);

            const card = document.createElement('article');
            card.className = 'md-cr-card';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'md-cr-remove';
            removeBtn.title = 'Remove from history';
            removeBtn.setAttribute('aria-label', 'Remove ' + displayTitle + ' from history');
            removeBtn.innerHTML = ICON.stop;
            removeBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                saveHistory(historyItems().filter(x => x.seriesPath !== item.seriesPath));
                removeFromCurrentlyReading(item.seriesPath);
                card.remove();
                if (!track.children.length) { sec.remove(); historyNode = null; }
                toast('Removed from Continue Reading');
            });

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'md-cr-thumb-wrap';
            const thumbLink = document.createElement('a');
            thumbLink.href = resumeHref;
            thumbLink.className = 'md-cr-thumb-link';
            thumbLink.title = displayTitle;
            if (cover) {
                const img = document.createElement('img');
                img.src = cover;
                img.alt = displayTitle;
                img.loading = 'lazy';
                img.decoding = 'async';
                img.className = 'md-cr-img';
                thumbLink.appendChild(img);
            } else if (item.seriesPath) {
                backfillSeriesCover(item.seriesPath).then(found => {
                    if (!found) return;
                    const hist = historyItems();
                    const match = hist.find(x => x.seriesPath === item.seriesPath);
                    if (match && !match.cover) { match.cover = found; saveHistory(hist); }
                    if (thumbLink.isConnected && !$('img', thumbLink)) {
                        const img = document.createElement('img');
                        img.src = found;
                        img.alt = displayTitle;
                        img.loading = 'lazy';
                        img.decoding = 'async';
                        img.className = 'md-cr-img';
                        thumbLink.appendChild(img);
                    }
                });
            }
            const progress = document.createElement('div');
            progress.className = 'md-cr-progress';
            const bar = document.createElement('div');
            bar.className = 'md-cr-bar';
            bar.style.width = pct + '%';
            progress.appendChild(bar);
            thumbWrap.append(thumbLink, progress);

            const body = document.createElement('div');
            body.className = 'md-cr-body';
            const h3 = document.createElement('h3');
            h3.className = 'md-cr-title';
            const titleLink = document.createElement('a');
            titleLink.href = item.seriesPath || resumeHref;
            titleLink.textContent = displayTitle;
            h3.appendChild(titleLink);

            const badges = document.createElement('div');
            badges.className = 'md-cr-badges';
            const chBadge = document.createElement('span');
            chBadge.className = 'md-cr-badge md-cr-last';
            chBadge.textContent = (item.label || 'Chapter').replace(/^Chapter\s+/i, 'Ch. ');
            badges.appendChild(chBadge);
            if (page > 0) {
                const pgBadge = document.createElement('span');
                pgBadge.className = 'md-cr-badge md-cr-page';
                pgBadge.textContent = totalPages ? `P.${page}/${totalPages}` : `P.${page}`;
                badges.appendChild(pgBadge);
            }

            const cta = document.createElement('a');
            cta.href = resumeHref;
            cta.className = 'md-cr-btn';
            cta.textContent = 'Continue Reading';

            body.append(h3, badges, cta);
            card.append(removeBtn, thumbWrap, body);
            track.appendChild(card);
        });

        sec.append(head, track);
        if (heroState?.node.isConnected) heroState.node.after(sec);
        else column.prepend(sec);
        historyNode = sec;
    }

    /* ====================================================================
     *  COMIX DATA & CHAPTER CONTEXT
     * ==================================================================== */
    let docDataNode = null;
    let docData = null;

    function initialData() {
        const node = $('#initial-data');
        if (!node) return null;
        if (node !== docDataNode || !docData) {
            docDataNode = node;
            try { docData = JSON.parse(node.textContent); } catch (_) { docData = null; }
        }
        return docData;
    }

    function chapterContext(url = location.href, doc = document) {
        const parsed = route(url, CHAPTER_PATH);
        if (!parsed) return null;
        const [, seriesPath, id, slug] = parsed.pathname.match(CHAPTER_PATH);
        const data = doc === document ? initialData() : null;
        const matchingData = String(data?.read?.chapterId) === id ? data : null;
        const manga = Object.values(matchingData?.queries || {}).find(x => route(x?.url, SERIES_PATH)?.pathname === seriesPath);
        const series = $('.rpage-chap-ending__title', doc)?.textContent.trim() || manga?.title;
        if (!series) return null;
        const number = matchingData?.read?.chapterNumber ?? slug.match(/^\d+(?:\.\d+)?/)?.[0];
        const chapPill = $('.rpage-floatctl__chap', doc)?.textContent.replace(/\s+/g, ' ').trim();
        const label = $('.rpage-floatctl__chap .mono', doc)?.textContent.trim();
        return {
            id,
            seriesPath,
            series,
            number,
            url: parsed.pathname,
            chapPill: chapPill || ('Ch.' + (number ?? slug)),
            cover: manga?.poster?.medium || $('meta[property="og:image"]', doc)?.content,
            label: label && !label.includes('undefined') ? label.replace(/^Ch\.?\s*/i, 'Chapter ') : 'Chapter ' + (number ?? slug),
        };
    }

    function trackReading(context) {
        const items = historyItems();
        const old = items.find(item => item.seriesPath === context.seriesPath);
        if (lastTracked === context.url && old?.cover) return;
        const page = old?.url === context.url ? old.page : 1;
        const totalPages = $$('.rpage-progress__seg').length || readerPages(document).length || old?.totalPages || 0;
        items.unshift({
            url: context.url,
            title: context.series,
            seriesPath: context.seriesPath,
            label: context.label,
            page,
            totalPages,
            cover: imageUrl(context.cover) || imageUrl(old?.cover) || getCachedCover(context.seriesPath),
        });
        const deduped = items.filter((item, i) => !i || item.seriesPath !== context.seriesPath);
        saveHistory(deduped);
        upsertCurrentlyReading({ path: context.seriesPath, title: context.series, cover: deduped[0]?.cover });
        lastTracked = context.url;
    }

    let progressTimer = null;

    function scheduleProgress() {
        if (!lastTracked || !CHAPTER_PATH.test(location.pathname) || progressTimer) return;
        progressTimer = setTimeout(() => {
            progressTimer = null;
            if (lastTracked !== location.pathname) return;
            const segs = $$('.rpage-progress__seg');
            const segment = $('.rpage-progress__seg.is-active');
            const page = Number(segment?.getAttribute('aria-label')?.match(/\d+$/)?.[0]);
            const totalPages = segs.length || readerPages(document).length;
            if (!Number.isInteger(page) || page < 1) return;
            const items = historyItems();
            const entry = items.find(item => item.url === lastTracked);
            if (entry && (entry.page !== page || (totalPages && entry.totalPages !== totalPages))) {
                entry.page = page;
                if (totalPages) entry.totalPages = totalPages;
                saveHistory(items);
            }
        }, 250);
    }

    /* ====================================================================
     *  OFFLINE ARCHIVE ENGINE (ZIP STORE, CBZ + ComicInfo.xml, PDF WRITER)
     * ==================================================================== */
    const CRC_T = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(u8) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function makeZip(entries) {
        const enc = new TextEncoder();
        const d = new Date();
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const parts = [], central = [];
        let offset = 0, cdSize = 0;
        for (const e of entries) {
            const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true);
            lh.setUint16(4, 20, true);
            lh.setUint16(6, 0x0800, true);
            lh.setUint16(8, 0, true);
            lh.setUint16(10, time, true);
            lh.setUint16(12, date, true);
            lh.setUint32(14, crc, true);
            lh.setUint32(18, size, true);
            lh.setUint32(22, size, true);
            lh.setUint16(26, name.length, true);
            lh.setUint16(28, 0, true);
            parts.push(lh.buffer, name, e.data);

            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true);
            ch.setUint16(4, 20, true);
            ch.setUint16(6, 20, true);
            ch.setUint16(8, 0x0800, true);
            ch.setUint16(10, 0, true);
            ch.setUint16(12, time, true);
            ch.setUint16(14, date, true);
            ch.setUint32(16, crc, true);
            ch.setUint32(20, size, true);
            ch.setUint32(24, size, true);
            ch.setUint16(28, name.length, true);
            ch.setUint32(42, offset, true);
            central.push(ch.buffer, name);
            offset += 30 + name.length + size;
            cdSize += 46 + name.length;
        }
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, entries.length, true);
        end.setUint16(10, entries.length, true);
        end.setUint32(12, cdSize, true);
        end.setUint32(16, offset, true);
        return new Blob([...parts, ...central, end.buffer], { type: 'application/octet-stream' });
    }

    function imageExtension(bytes) {
        const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
        if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
        if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
        if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
        if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
        if (ascii(4, 8) === 'ftyp' && /^(avif|avis)$/.test(ascii(8, 12))) return 'avif';
        throw new Error('The server did not return a supported comic image.');
    }

    function jpegInfo(u8) {
        if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
        let i = 2;
        while (i + 9 < u8.length) {
            if (u8[i] !== 0xFF) return null;
            while (u8[i] === 0xFF) i++;
            const m = u8[i++];
            if (m === 0xD9 || m === 0xDA) return null;
            const len = (u8[i] << 8) | u8[i + 1];
            if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
                const h = (u8[i + 3] << 8) | u8[i + 4], w = (u8[i + 5] << 8) | u8[i + 6], c = u8[i + 7];
                if (c === 1 || c === 3) return { w, h, gray: c === 1 };
                return null;
            }
            i += len;
        }
        return null;
    }

    async function toJpegPart(u8) {
        const info = jpegInfo(u8);
        if (info) return { blob: new Blob([u8]), ...info };
        const bmp = await createImageBitmap(new Blob([u8]));
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(bmp, 0, 0);
        bmp.close();
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
        return { blob, w: c.width, h: c.height, gray: false };
    }

    function buildPdf(chapters, title) {
        const enc = new TextEncoder();
        const esc = s => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '?');
        const parts = [], offs = [0];
        let pos = 0;
        const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += (b.byteLength ?? b.size); };
        const obj = (n, body, stream) => {
            offs[n] = pos;
            put(n + ' 0 obj\n' + body + (stream ? '\nstream\n' : '\nendobj\n'));
            if (stream) { put(stream); put('\nendstream\nendobj\n'); }
        };
        put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
        const pages = [], marks = [];
        let id = 4;
        for (const ch of chapters) {
            const first = id;
            for (const im of ch.imgs) { const pId = id++, cId = id++, iId = id++; pages.push({ pId, cId, iId, im }); }
            if (ch.imgs.length) marks.push({ title: ch.label, page: first });
        }
        const outBase = id, outId = marks.length ? outBase : 0;
        obj(1, `<< /Type /Catalog /Pages 2 0 R${outId ? ` /Outlines ${outId} 0 R /PageMode /UseOutlines` : ''} >>`);
        obj(2, `<< /Type /Pages /Kids [${pages.map(p => p.pId + ' 0 R').join(' ')}] /Count ${pages.length} >>`);
        obj(3, `<< /Title (${esc(title)}) /Creator (Neobrutal Comix) >>`);
        for (const { pId, cId, iId, im } of pages) {
            const w = +(im.w * 0.75).toFixed(2), h = +(im.h * 0.75).toFixed(2);
            const cs = `q ${w} 0 0 ${h} 0 0 cm /Im Do Q`;
            obj(pId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im ${iId} 0 R >> >> /Contents ${cId} 0 R >>`);
            obj(cId, `<< /Length ${cs.length} >>`, cs);
            obj(iId, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /Device${im.gray ? 'Gray' : 'RGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.blob.size} >>`, im.blob);
        }
        if (outId) {
            obj(outId, `<< /Type /Outlines /First ${outBase + 1} 0 R /Last ${outBase + marks.length} 0 R /Count ${marks.length} >>`);
            marks.forEach((m, i) => {
                const n = outBase + 1 + i;
                const prev = i ? ` /Prev ${n - 1} 0 R` : '';
                const next = i + 1 < marks.length ? ` /Next ${n + 1} 0 R` : '';
                obj(n, `<< /Title (${esc(m.title)}) /Parent ${outId} 0 R${prev}${next} /Dest [${m.page} 0 R /Fit] >>`);
            });
        }
        const xPos = pos;
        put(`xref\n0 ${offs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
        put(`trailer\n<< /Size ${offs.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xPos}\n%%EOF`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    function storeDownload(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }

    const gmReq = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : null);

    function gmImage(url, signal) {
        return new Promise((resolve, reject) => {
            signal.throwIfAborted();
            let request;
            const abort = () => { request?.abort?.(); finish(reject, signal.reason); };
            const finish = (cb, value) => { signal.removeEventListener('abort', abort); cb(value); };
            request = gmReq({
                method: 'GET', url, anonymous: true, responseType: 'arraybuffer', timeout: 20000,
                onload: res => {
                    if (res.status >= 200 && res.status < 300 && res.response) finish(resolve, res.response);
                    else finish(reject, new Error('Image HTTP ' + res.status));
                },
                onerror: () => finish(reject, new Error('The image host could not be reached.')),
                ontimeout: () => finish(reject, new Error('The image request timed out.')),
                onabort: () => finish(reject, signal.reason || new Error('The image request was interrupted.')),
            });
            signal.addEventListener('abort', abort, { once: true });
        });
    }

    async function fetchImage(url, signal) {
        if (new URL(url).origin !== location.origin && gmReq) {
            return new Uint8Array(await gmImage(url, signal));
        }
        const res = await fetch(url, {
            credentials: 'omit', referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        });
        if (!res.ok) throw new Error('Image HTTP ' + res.status);
        return new Uint8Array(await res.arrayBuffer());
    }

    function readerPages(doc) {
        return $$(READER_PAGES, doc)
            .filter(page => Number(page.dataset.page) > 0)
            .sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page));
    }

    function pageSource(page) {
        const img = $('.rpage-page__img', page);
        return imageUrl(img?.currentSrc || img?.getAttribute('src'), page.ownerDocument.URL);
    }

    async function waitFor(check, signal, timeout, message) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            signal.throwIfAborted();
            const result = check();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        signal.throwIfAborted();
        throw new Error(message);
    }

    function stripPages(doc) {
        const pages = readerPages(doc);
        return pages.length && pages.every((page, i) => Number(page.dataset.page) === i + 1) ? pages : null;
    }

    async function listPageSources(context, feedback, signal) {
        if (location.pathname === context.url && $('.rpage--long-strip')) {
            const pages = stripPages(document);
            const current = pages?.map(pageSource);
            if (current?.every(Boolean)) return current;
        }
        const frame = document.createElement('iframe');
        frame.className = 'nb-frame';
        frame.title = 'Comix chapter export';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        frame.src = context.url + '#page=1';
        document.body.append(frame);
        try {
            let finished = false;
            loaded.then(() => { finished = true; });
            await waitFor(() => finished, signal, 20000, 'Comix did not open the chapter.');
            const doc = frame.contentDocument;
            if (!doc || route(doc.URL, CHAPTER_PATH)?.pathname !== context.url) {
                throw new Error('Comix could not load this chapter for export.');
            }
            const readerEl = await waitFor(() => {
                const current = $('.rpage', doc);
                return current && (readerPages(doc).length || $('.rpage-progress__seg', current)) && current;
            }, signal, 20000, 'Comix did not make any chapter pages available.');
            const vertical = readerEl.classList.contains('rpage--long-strip');
            const jumps = $$('.rpage-progress__seg', readerEl);
            const pages = vertical ? stripPages(doc) : null;
            const total = vertical ? pages?.length : jumps.length;
            if (!total) throw new Error('Enable the Comix page progress bar or switch to Top to bottom, then retry.');

            const sources = [];
            for (let index = 0; index < total; index++) {
                signal.throwIfAborted();
                const currentPage = () => vertical ? pages[index] : $(READER_PAGES + '[data-page="' + (index + 1) + '"]', doc);
                const currentSource = () => { const current = currentPage(); return current && pageSource(current); };
                let src = currentSource();
                if (!src) {
                    feedback('Finding page ' + (index + 1) + '/' + total + '…', Math.round((index / total) * 20));
                    if (jumps[index]) jumps[index].click();
                    else pages[index].scrollIntoView({ block: 'start', behavior: 'instant' });
                    src = await waitFor(currentSource, signal, 8000, 'Comix did not load page ' + (index + 1) + '.');
                }
                sources.push(src);
            }
            return sources;
        } finally {
            frame.remove();
        }
    }

    async function downloadChapterBytes(context, feedback, controller) {
        const { signal } = controller;
        feedback('Opening ' + context.label + '…', 5);
        const sources = await listPageSources(context, feedback, signal);
        const pages = new Array(sources.length);
        let next = 0, done = 0, size = 0;
        async function worker() {
            while (next < sources.length) {
                signal.throwIfAborted();
                const index = next++;
                try {
                    const data = await fetchImage(sources[index], signal);
                    size += data.length;
                    if (size > MAX_ARCHIVE_BYTES) throw new Error('This chapter exceeds the 512 MB export limit.');
                    const extension = imageExtension(data);
                    pages[index] = { name: String(index + 1).padStart(3, '0') + '.' + extension, data };
                } catch (error) {
                    signal.throwIfAborted();
                    throw new Error('Page ' + (index + 1) + ': ' + error.message);
                }
                done++;
                feedback(done + '/' + sources.length, 20 + Math.round((done / sources.length) * 80));
            }
        }
        try {
            await Promise.all(Array.from({ length: Math.min(sources.length, CONFIG.reader.concurrency) }, worker));
        } catch (error) {
            controller.abort(error);
            throw error;
        }
        signal.throwIfAborted();
        return pages;
    }

    async function chapterArchive(context, feedback, controller) {
        const pages = await downloadChapterBytes(context, feedback, controller);
        const entries = [...pages, {
            name: 'ComicInfo.xml',
            data: new TextEncoder().encode(
                '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo>\n' +
                '  <Title>' + xmlEsc(context.label) + '</Title>\n' +
                '  <Series>' + xmlEsc(context.series) + '</Series>\n' +
                (context.number == null ? '' : '  <Number>' + xmlEsc(context.number) + '</Number>\n') +
                '  <Web>' + xmlEsc(location.origin + context.url) + '</Web>\n' +
                '  <PageCount>' + pages.length + '</PageCount>\n</ComicInfo>\n'
            ),
        }];
        return { filename: safeName(context.series) + ' - ' + safeName(context.label) + '.cbz', blob: makeZip(entries) };
    }

    /* ====================================================================
     *  UNIFIED TOP BAR (#md-rbar) + BOTTOM DOCK (#md-dock) WITH BUILT-IN TOOLS
     * ==================================================================== */
    const CANCELLED = new DOMException('Export cancelled', 'AbortError');
    const BG_MODES = ['theme', 'paper', 'dark', 'black'];
    const BG_LABELS = { theme: 'Theme', paper: 'Paper', dark: 'Dark', black: 'Black' };

    const reader = {
        init: false,
        rbar: null,
        dock: null,
        dl: null,
        zoom: 1,
        bg: 'theme',
        stretch: false,
        autoscroll: false,
        job: null,
        chromeBound: false,
        keysBound: false,
    };

    const nativeBtn = sel => $(sel);

    function applyStretch(on, silent = true) {
        reader.stretch = !!on;
        if (reader.stretch) root.dataset.mdStretch = '1';
        else delete root.dataset.mdStretch;
        store.set('stretch', reader.stretch);
        const b = reader.dock && $('[data-act="stretch"]', reader.dock);
        if (b) b.setAttribute('aria-pressed', String(reader.stretch));
        if (!silent) toast(reader.stretch ? 'Stretched to fit width' : 'Standard page width', 1400);
    }

    function applyZoom(z) {
        const steps = CONFIG.reader.zoomSteps;
        const clamped = Math.max(steps[0], Math.min(steps[steps.length - 1], Number(z) || 1));
        reader.zoom = clamped;
        root.style.setProperty('--md-zoom', String(clamped));
        store.set('zoom', clamped);
        const zBtn = reader.dock && $('.md-zoom', reader.dock);
        if (zBtn) zBtn.textContent = Math.round(clamped * 100) + '%';
    }

    function stepZoom(dir) {
        if (reader.stretch) applyStretch(false, true);
        const steps = CONFIG.reader.zoomSteps;
        let best = 0, minDiff = Infinity;
        steps.forEach((s, i) => { const d = Math.abs(s - reader.zoom); if (d < minDiff) { minDiff = d; best = i; } });
        const nextIdx = Math.max(0, Math.min(steps.length - 1, best + dir));
        applyZoom(steps[nextIdx]);
        toast('Zoom: ' + Math.round(steps[nextIdx] * 100) + '%', 1200);
    }

    function paintBg() {
        if (detectPage() !== 'chapter') {
            delete root.dataset.mdBg;
            root.style.removeProperty('--nb-reader-bg');
            return;
        }
        if (reader.bg === 'theme') {
            delete root.dataset.mdBg;
            root.style.removeProperty('--nb-reader-bg');
        } else {
            root.dataset.mdBg = reader.bg;
        }
    }

    function applyBg(name) {
        reader.bg = BG_MODES.includes(name) ? name : 'theme';
        store.set('bg', reader.bg);
        paintBg();
    }

    function cycleBg() {
        const idx = BG_MODES.indexOf(reader.bg);
        const next = BG_MODES[(idx + 1) % BG_MODES.length];
        applyBg(next);
        toast('Reader background: ' + BG_LABELS[next], 1400);
    }

    function setDl(state, label, pct = 0) {
        if (!reader.dl) return;
        reader.dl.dataset.state = state;
        reader.dl.style.setProperty('--p', Math.max(0, Math.min(100, pct)) + '%');
        const icon = state === 'busy' ? ICON.stop : state === 'done' ? ICON.check : ICON.down;
        reader.dl.innerHTML = `${icon}<span class="md-lbl">${label}</span>`;
    }

    async function toggleDownload() {
        if (reader.job) { reader.job.abort(CANCELLED); return; }
        const ctx = chapterContext();
        if (!ctx) { toast('Chapter info not ready yet'); return; }
        const ctl = new AbortController();
        reader.job = ctl;
        setDl('busy', '0%', 2);
        try {
            const result = await chapterArchive(ctx, (msg, pct) => {
                if (reader.job === ctl) setDl('busy', msg, pct || 10);
            }, ctl);
            ctl.signal.throwIfAborted();
            storeDownload(result.blob, result.filename);
            setDl('done', 'Saved', 100);
            toast('Downloaded ' + result.filename, 2600);
            setTimeout(() => { if (!reader.job) setDl('idle', 'CBZ', 0); }, 2500);
        } catch (err) {
            if (err === CANCELLED) { setDl('idle', 'CBZ', 0); toast('Export cancelled'); }
            else { setDl('error', 'Error', 0); toast(err.message || 'Export failed', 3200); setTimeout(() => { if (!reader.job) setDl('idle', 'CBZ', 0); }, 3000); }
        } finally {
            if (reader.job === ctl) reader.job = null;
        }
    }

    function bindReaderChrome() {
        if (reader.chromeBound) return;
        reader.chromeBound = true;
        let last = scrollY, openY = scrollY;

        const showDock = on => {
            if (!reader.dock) return;
            reader.dock.classList.toggle('hide', !on);
            if (on) {
                openY = scrollY;
                delete root.dataset.mdNavhide;
            } else {
                root.dataset.mdNavhide = '1';
            }
        };

        if (CONFIG.readerDockOnTap) {
            document.addEventListener('click', e => {
                if (detectPage() !== 'chapter' || !reader.dock || e.button !== 0) return;
                const t = e.target;
                if (!(t instanceof Element) || t.closest(TAP_IGNORE)) return;
                const sel = getSelection();
                if (sel && !sel.isCollapsed && String(sel).trim()) return;
                if (!$('.rpage--long-strip') && (e.clientX < innerWidth * 0.3 || e.clientX > innerWidth * 0.7)) return;
                showDock(reader.dock.classList.contains('hide'));
            }, true);
            addEventListener('keydown', e => {
                if (e.key === 'Escape' && reader.dock && !reader.dock.classList.contains('hide') && !reader.job) showDock(false);
            });
        }

        document.addEventListener('fullscreenchange', () => {
            const isFs = !!document.fullscreenElement;
            if (isFs) root.dataset.mdFs = '1';
            else delete root.dataset.mdFs;
            const fsBtn = reader.dock && $('[data-act="fullscreen"]', reader.dock);
            if (fsBtn) fsBtn.setAttribute('aria-pressed', String(isFs));
        });

        let progRaf = 0;
        const syncProgressBounds = () => {
            progRaf = 0;
            if (detectPage() !== 'chapter' || !$('.rpage--long-strip')) {
                delete root.dataset.mdPastImages;
        root.style.removeProperty('--md-prog-bottom');
                root.style.removeProperty('--md-prog-bottom');
                return;
            }
            const pages = $$('.rpage-page[data-page]');
            const lastPage = pages.length ? pages[pages.length - 1] : null;
            const ending = $('.rpage-chap-ending');
            let cutoffY = Infinity;
            if (lastPage) cutoffY = Math.min(cutoffY, lastPage.getBoundingClientRect().bottom);
            if (ending) cutoffY = Math.min(cutoffY, ending.getBoundingClientRect().top - 12);
            if (!isFinite(cutoffY)) {
                delete root.dataset.mdPastImages;
                root.style.setProperty('--md-prog-bottom', '18px');
                return;
            }
            if (cutoffY <= 84) {
                root.dataset.mdPastImages = '1';
            } else {
                delete root.dataset.mdPastImages;
                const bottomPx = Math.max(18, Math.round(innerHeight - cutoffY));
                root.style.setProperty('--md-prog-bottom', bottomPx + 'px');
            }
        };
        const scheduleProgBounds = () => { if (!progRaf) progRaf = requestAnimationFrame(syncProgressBounds); };
        // Capture phase catches scroll on window, document, .rpage, AND .rpage-main!
        document.addEventListener('scroll', scheduleProgBounds, { passive: true, capture: true });
        addEventListener('resize', scheduleProgBounds, { passive: true });
        scheduleProgBounds();

        addEventListener('scroll', () => {
            if (detectPage() !== 'chapter') return;
            scheduleProgBounds();
            const y = scrollY, dy = y - last;
            if (Math.abs(dy) < 8) return;
            last = y;
            if (reader.dock && !reader.job) {
                const busy = reader.rbar && reader.rbar.contains(document.activeElement);
                if (CONFIG.readerDockOnTap) {
                    if (!busy && CONFIG.dockHideOnScroll && !reader.dock.classList.contains('hide') && dy > 0 && y - openY > CONFIG.dockScrollPx) {
                        showDock(false);
                    }
                } else {
                    const nearEnd = innerHeight + y >= root.scrollHeight - 320;
                    showDock(!(dy > 0 && y > 240 && !nearEnd));
                }
            }
        }, { passive: true });
    }

    function bindReaderKeys() {
        if (reader.keysBound) return;
        reader.keysBound = true;
        addEventListener('keydown', e => {
            if (detectPage() !== 'chapter' || e.ctrlKey || e.metaKey || e.altKey) return;
            const a = document.activeElement;
            if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
            const isStrip = !!$('.rpage--long-strip');
            if (isStrip && e.key === 'ArrowLeft') nativeBtn('.rpage-floatctl button[aria-label="Previous chapter"]')?.click();
            else if (isStrip && e.key === 'ArrowRight') nativeBtn('.rpage-floatctl button[aria-label="Next chapter"]')?.click();
            else if (e.key === '-' || e.key === '_') stepZoom(-1);
            else if (e.key === '+' || e.key === '=') stepZoom(1);
            else if (e.key === '0') { applyZoom(1); toast('Zoom: 100%', 1200); }
            else if (e.key === 'b' || e.key === 'B') cycleBg();
        });
    }

    function getReaderCommentCount() {
        for (const el of $$('.rpage .cm-widget__title, .rpage-cmpanel .cm-widget__title, .cm-widget__title')) {
            const m = (el.textContent || '').match(/(\d[\d,]*)/);
            if (m) return m[1];
        }
        const btnTxt = nativeBtn('.rpage-floatctl button[aria-label*="comments" i]')?.textContent?.trim() || '';
        const m2 = btnTxt.match(/(\d[\d,]*)/);
        if (m2) return m2[1];
        const sniffed = sniffedCommentCounts.get(location.pathname);
        if (typeof sniffed === 'number') return String(sniffed);
        const data = initialData();
        const cnt = data?.read?.comments_count ?? data?.read?.comment_count;
        if (typeof cnt === 'number') return String(cnt);
        return '';
    }

    function isCommentsOpen() {
        const panel = $('.rpage-cmpanel');
        return !!(panel && panel.getAttribute('aria-hidden') !== 'true');
    }

    function syncReaderBars(context) {
        if (reader.rbar) {
            if (context) {
                const ser = $('[data-k="series"]', reader.rbar);
                if (ser && context.seriesPath) ser.href = context.seriesPath;
                const titleB = $('.md-rb-title b', reader.rbar);
                if (titleB) titleB.textContent = toTitleCase(context.series);
                const chapBtn = $('.md-rb-chap', reader.rbar);
                if (chapBtn) chapBtn.textContent = context.chapPill;
            }
            const cmBtn = $('[data-act="comments"]', reader.rbar);
            if (cmBtn) {
                cmBtn.setAttribute('aria-pressed', String(isCommentsOpen()));
                const cntEl = $('.md-rb-count', cmBtn);
                if (cntEl) cntEl.textContent = getReaderCommentCount();
            }
        }
        if (reader.dock) {
            const nPrev = nativeBtn('.rpage-floatctl button[aria-label="Previous chapter"]');
            const nNext = nativeBtn('.rpage-floatctl button[aria-label="Next chapter"]');
            const nAuto = nativeBtn('.rpage-floatctl button[aria-label*="auto-scroll" i]');
            const prevBtn = $('[data-act="prev"]', reader.dock);
            const nextBtn = $('[data-act="next"]', reader.dock);
            const chapBtn = $('[data-act="chapters"]', reader.dock);
            const stretchBtn = $('[data-act="stretch"]', reader.dock);
            const autoBtn = $('[data-act="autoscroll"]', reader.dock);
            const fsBtn = $('[data-act="fullscreen"]', reader.dock);
            const chapOpen = !!$('[role="dialog"]:not(.settings-dialog) a[href*="-chapter-"], [aria-modal="true"]:not(.settings-dialog) a[href*="-chapter-"]');
            if (prevBtn) prevBtn.disabled = !nPrev || nPrev.disabled;
            if (nextBtn) nextBtn.disabled = !nNext || nNext.disabled;
            if (chapBtn) chapBtn.setAttribute('aria-pressed', String(chapOpen));
            if (stretchBtn) stretchBtn.setAttribute('aria-pressed', String(reader.stretch));
            if (fsBtn) fsBtn.setAttribute('aria-pressed', String(!!document.fullscreenElement));
            if (autoBtn && nAuto) {
                const lbl = (nAuto.getAttribute('aria-label') || '').toLowerCase();
                const isRunning = /stop|pause/.test(lbl) || nAuto.getAttribute('aria-pressed') === 'true' || nAuto.classList.contains('is-active');
                reader.autoscroll = isRunning;
                autoBtn.setAttribute('aria-pressed', String(isRunning));
            }
        }
    }

    function mountReader(context) {
        if (!reader.init) {
            reader.init = true;
            applyBg(store.get('bg', 'theme'));
            applyZoom(store.get('zoom', 1));
            applyStretch(store.get('stretch', false), true);
            bindReaderChrome();
            bindReaderKeys();
        }
        // 1. Top Reader Bar (#md-rbar)
        if (!reader.rbar || !reader.rbar.isConnected) {
            const bar = document.createElement('div');
            bar.id = 'md-rbar';
            bar.setAttribute('role', 'banner');
            bar.innerHTML =
                `<a class="md-rb-btn" data-k="home" href="/" title="Home">${ICON.home}<span class="md-rb-lbl">Home</span></a>` +
                `<a class="md-rb-btn" data-k="series" href="${context.seriesPath || '/'}" title="Series page">${ICON.book}<span class="md-rb-lbl">Series</span></a>` +
                `<div class="md-rb-title"><b></b><button type="button" class="md-rb-chap" data-act="chapters" title="Chapter list"></button></div>` +
                `<button type="button" class="md-rb-btn" data-act="comments" title="Comments (M)" aria-pressed="false">${ICON.chat}<span class="md-rb-lbl">Comments</span><span class="md-rb-count"></span></button>` +
                `<button type="button" class="md-rb-btn" data-act="settings" title="Reader settings">${ICON.gear}<span class="md-rb-lbl">Settings</span></button>`;
            bar.addEventListener('click', e => {
                const b = e.target.closest('button[data-act]');
                if (!b) return;
                switch (b.dataset.act) {
                    case 'chapters': nativeBtn('.rpage-floatctl .rpage-floatctl__chap, .rpage-floatctl button[aria-label="Chapter list"]')?.click(); break;
                    case 'comments': {
                        const bottomCm = $('.rpage-main .cm-widget, .rpage > .cm-widget, .rpage-chap-ending ~ .cm-widget') || $$('.cm-widget').find(w => !w.closest('.rpage-cmpanel'));
                        const nearBottom = (innerHeight + scrollY >= root.scrollHeight - Math.max(1400, innerHeight * 1.4))
                            || (bottomCm && bottomCm.getBoundingClientRect().top < innerHeight * 1.6);
                        if (isCommentsOpen()) {
                            const closeBtn = $('.rpage-cmpanel__close');
                            if (closeBtn) closeBtn.click();
                            else nativeBtn('.rpage-floatctl button[aria-label*="comments" i]')?.click();
                        } else if (nearBottom && bottomCm) {
                            bottomCm.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
                        } else {
                            nativeBtn('.rpage-floatctl button[aria-label*="comments" i]')?.click();
                        }
                        setTimeout(() => syncReaderBars(context), 180);
                        break;
                    }
                    case 'settings': nativeBtn('.rpage-floatctl button[aria-label="Settings"]')?.click(); break;
                }
            });
            document.body.appendChild(bar);
            reader.rbar = bar;
        }
        // 2. Bottom Reader Dock (#md-dock) incorporating Comix's native tools
        if (!reader.dock || !reader.dock.isConnected) {
            const d = document.createElement('div');
            d.id = 'md-dock';
            d.setAttribute('role', 'toolbar');
            d.setAttribute('aria-label', 'Reader controls');
            if (CONFIG.readerDockOnTap) { d.classList.add('hide'); root.dataset.mdNavhide = '1'; }

            const btn = (act, icon, title, label) =>
                `<button type="button" data-act="${act}" title="${title}" aria-label="${title}" aria-pressed="false">${icon}${label ? `<span class="md-lbl">${label}</span>` : ''}</button>`;

            d.innerHTML =
                btn('prev', ICON.prev, 'Previous chapter (←)') +
                btn('chapters', ICON.swapIcon(ICON.list, ICON.stop), 'Chapter list') +
                btn('next', ICON.next, 'Next chapter (→)') +
                '<span class="md-sep" aria-hidden="true"></span>' +
                btn('zoom-out', ICON.minus, 'Zoom out (-)') +
                `<button type="button" class="md-zoom" data-act="zoom-reset" title="Reset zoom (0)" aria-label="Reset zoom">${Math.round(reader.zoom * 100)}%</button>` +
                btn('zoom-in', ICON.plus, 'Zoom in (+)') +
                '<span class="md-sep" aria-hidden="true"></span>' +
                btn('stretch', ICON.swapIcon(ICON.stretch, ICON.shrinkW), 'Stretch to fit width') +
                btn('autoscroll', ICON.swapIcon(ICON.scroll, ICON.pause), 'Auto-scroll (P)') +
                btn('fullscreen', ICON.swapIcon(ICON.expand, ICON.compress), 'Fullscreen (F)') +
                btn('bg', ICON.bg, 'Background colour (B)') +
                '<button type="button" class="md-dl" data-act="download" title="Download chapter as CBZ"></button>';

            document.body.appendChild(d);
            reader.dock = d;
            reader.dl = $('.md-dl', d);
            setDl('idle', 'CBZ', 0);

            d.addEventListener('click', e => {
                const b = e.target.closest('button[data-act]');
                if (!b || b.disabled) return;
                switch (b.dataset.act) {
                    case 'prev': nativeBtn('.rpage-floatctl button[aria-label="Previous chapter"]')?.click(); break;
                    case 'chapters': {
                        nativeBtn('.rpage-floatctl .rpage-floatctl__chap, .rpage-floatctl button[aria-label="Chapter list"]')?.click();
                        setTimeout(() => syncReaderBars(context), 60);
                        break;
                    }
                    case 'next': nativeBtn('.rpage-floatctl button[aria-label="Next chapter"]')?.click(); break;
                    case 'zoom-out': stepZoom(-1); break;
                    case 'zoom-in': stepZoom(1); break;
                    case 'zoom-reset': applyStretch(false, true); applyZoom(1); toast('Zoom: 100%', 1200); break;
                    case 'stretch': {
                        const nextStretch = !reader.stretch;
                        applyStretch(nextStretch, false);
                        const ns = nativeBtn('.rpage-bottombar button[aria-label="Stretch to fit width"]');
                        if (ns && (ns.getAttribute('aria-pressed') === 'true') !== nextStretch) ns.click();
                        break;
                    }
                    case 'autoscroll': {
                        const na = nativeBtn('.rpage-floatctl button[aria-label*="auto-scroll" i]');
                        if (na) na.click();
                        reader.autoscroll = !reader.autoscroll;
                        b.setAttribute('aria-pressed', String(reader.autoscroll));
                        setTimeout(() => syncReaderBars(context), 80);
                        break;
                    }
                    case 'fullscreen': {
                        const nf = nativeBtn('.rpage-floatctl .rpage-floatctl__btn--fs, .rpage-floatctl button[aria-label*="fullscreen" i]');
                        if (nf) nf.click();
                        else if (!document.fullscreenElement) root.requestFullscreen?.();
                        else document.exitFullscreen?.();
                        setTimeout(() => syncReaderBars(context), 80);
                        break;
                    }
                    case 'bg': cycleBg(); break;
                    case 'download': toggleDownload(); break;
                }
            });
        }
        syncReaderBars(context);
        paintBg();
    }

    function unmountReader() {
        if (reader.job) reader.job.abort(CANCELLED);
        if (reader.rbar?.isConnected) reader.rbar.remove();
        if (reader.dock?.isConnected) reader.dock.remove();
        reader.rbar = null;
        reader.dock = null;
        reader.dl = null;
        delete root.dataset.mdBg;
        delete root.dataset.mdNavhide;
        delete root.dataset.mdStretch;
        delete root.dataset.mdPastImages;
        root.style.removeProperty('--nb-reader-bg');
    }

    /* ====================================================================
     *  SERIES PAGE BACKDROP & DEDUPLICATED MULTI-CHAPTER BATCH DOWNLOADER
     * ==================================================================== */
    function setupCoverBackdrop(app) {
        const hero = $('.mpage__hero', app);
        if (!hero || $('.md-profile-bg', hero)) return;
        const img = $('.mpage__poster img', hero);
        const src = imageUrl(img?.currentSrc || img?.getAttribute('src'));
        if (!src) return;
        const bg = document.createElement('div');
        bg.className = 'md-profile-bg';
        bg.style.backgroundImage = 'url(' + JSON.stringify(src) + ')';
        hero.prepend(bg);
    }

    function extractSeriesHid(seriesPath) {
        const data = initialData();
        if (data?.queries) {
            for (const val of Object.values(data.queries)) {
                if (val && typeof val === 'object' && val.hid && route(val.url, SERIES_PATH)?.pathname === seriesPath) {
                    return String(val.hid);
                }
            }
        }
        const m = seriesPath.match(/^\/title\/([a-z0-9]+)(?:-|$)/i);
        return m ? m[1] : null;
    }

    function normalizeApiChapter(item, seriesPath) {
        const id = String(item.chapter_id ?? item.id ?? item.hid ?? '');
        if (!id) return null;
        const numRaw = item.number ?? item.chap ?? item.chapter;
        const numStr = numRaw !== null && numRaw !== undefined && String(numRaw).trim() !== '' ? String(Number(numRaw)) : null;
        const slugNum = numStr !== null ? numStr : '0';
        const url = item.url && route(item.url, CHAPTER_PATH)
            ? route(item.url, CHAPTER_PATH).pathname
            : `${seriesPath}/${id}-chapter-${slugNum}`;
        const group = item.scanlation_group?.name || item.group_name || item.scanlation_group_name || item.group?.name || item.uploader?.username || 'Unknown Group';
        const title = (item.name || item.title || '').trim();
        const time = fmtRelTime(item.created_at || item.updated_at || item.published_at || '');
        const label = numStr !== null ? `Chapter ${numStr}` : (title || `Chapter ${id}`);
        const key = numStr !== null ? ('ch:' + numStr) : ('id:' + id);
        return { id, url, number: numStr, sortNum: numStr !== null ? Number(numStr) : -1, title, group: String(group).trim() || 'Unknown Group', time, label, key };
    }

    function scrapeDomChapters(chaptersSection) {
        const out = [];
        for (const row of $$('.mchap-row', chaptersSection)) {
            const anchor = $('.mchap-row__primary[href]', row);
            const url = route(anchor?.href, CHAPTER_PATH);
            if (!url) continue;
            const [, , id, slug] = url.pathname.match(CHAPTER_PATH);
            const rawCh = $('.mchap-row__ch', anchor)?.textContent.trim() || '';
            const numMatch = rawCh.match(/(\d+(?:\.\d+)?)/) || slug.match(/^(\d+(?:\.\d+)?)/);
            const numStr = numMatch ? String(Number(numMatch[1])) : null;
            const title = $('.mchap-row__title', anchor)?.textContent.trim() || '';
            const group = $('.mchap-row__group', row)?.textContent.trim() || $('a[href^="/groups/"]', row)?.textContent.trim() || $('.mchap-row__uploader', row)?.textContent.trim() || $('a[href^="/u/"]', row)?.textContent.trim() || 'Unknown Group';
            const time = $('.mchap-row__time', row)?.textContent.trim() || '';
            const label = numStr !== null ? `Chapter ${numStr}` : (rawCh || `Chapter ${slug}`);
            const key = numStr !== null ? ('ch:' + numStr) : ('id:' + id);
            out.push({ id, url: url.pathname, number: numStr, sortNum: numStr !== null ? Number(numStr) : -1, title, group, time, label, key });
        }
        return out;
    }

    function groupChaptersByNumber(rawList) {
        const map = new Map();
        const seenIds = new Set();
        for (const item of rawList) {
            if (!item || seenIds.has(item.id)) continue;
            seenIds.add(item.id);
            let entry = map.get(item.key);
            if (!entry) {
                entry = { key: item.key, number: item.number, sortNum: item.sortNum, label: item.label, activeIdx: 0, releases: [] };
                map.set(item.key, entry);
            }
            entry.releases.push(item);
        }
        for (const entry of map.values()) {
            entry.releases.sort((a, b) => a.group.localeCompare(b.group, undefined, { sensitivity: 'base' }));
        }
        return [...map.values()].sort((a, b) => b.sortNum - a.sortNum);
    }

    const CHAP_CACHE_TTL = 15 * 60 * 1000;

    function isTurnstileVisible() {
        return !!($('iframe[src*="challenges.cloudflare.com"]') || $$('[role="dialog"], [aria-modal="true"]').some(d => /verify you.?re human/i.test(d.textContent || '')));
    }

    function readChapCache(seriesPath) {
        try {
            const raw = sessionStorage.getItem('md-comix-chaps-v3:' + seriesPath);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
            if (Date.now() - (parsed.ts || 0) > CHAP_CACHE_TTL) return null;
            return parsed;
        } catch (_) { return null; }
    }

    function writeChapCache(seriesPath, items, complete) {
        try {
            sessionStorage.setItem('md-comix-chaps-v3:' + seriesPath, JSON.stringify({ ts: Date.now(), complete: !!complete, items }));
        } catch (_) {}
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function waitForTurnstileClear(maxWaitMs = 90000) {
        if (!isTurnstileVisible()) return true;
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            await sleep(450);
            if (!isTurnstileVisible()) {
                await sleep(500);
                return true;
            }
        }
        return false;
    }

    let seriesState = null;
    let batchJob = null;

    function mountSeriesChapters(chaptersSection, seriesPath) {
        if (seriesState && seriesState.path === seriesPath && seriesState.box.isConnected) return;
        if (seriesState?.box.isConnected) seriesState.box.remove();
        if (seriesState?.bar.isConnected) seriesState.bar.remove();

        const selected = new Map();
        let groups = groupChaptersByNumber(scrapeDomChapters(chaptersSection));
        let sortDesc = true;
        let filterQuery = '';
        let lastClickedIndex = -1;
        let loadingAll = true;

        const bar = document.createElement('div');
        bar.id = 'md-sel-bar';

        const modeBtn = document.createElement('button');
        modeBtn.type = 'button';
        modeBtn.textContent = 'Select chapters';
        modeBtn.setAttribute('aria-pressed', 'false');

        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.textContent = 'Select All';
        allBtn.title = 'Select all chapters across the entire series (no duplicates)';
        allBtn.hidden = true;

        const zipBtn = document.createElement('button');
        zipBtn.type = 'button';
        zipBtn.className = 'md-sel-dl';
        zipBtn.innerHTML = `${ICON.down}<span>Download ZIP</span>`;
        zipBtn.hidden = true;

        const pdfBtn = document.createElement('button');
        pdfBtn.type = 'button';
        pdfBtn.className = 'md-sel-dl';
        pdfBtn.innerHTML = `${ICON.down}<span>Download PDF</span>`;
        pdfBtn.hidden = true;

        const countEl = document.createElement('span');
        countEl.className = 'md-sel-count';
        countEl.hidden = true;

        const statusEl = document.createElement('span');
        statusEl.className = 'md-sel-status';
        statusEl.setAttribute('role', 'status');

        bar.append(modeBtn, allBtn, zipBtn, pdfBtn, countEl, statusEl);

        const box = document.createElement('div');
        box.id = 'md-all-chaps';

        const head = document.createElement('div');
        head.className = 'md-ch-head';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'md-ch-search';
        searchInput.placeholder = 'Filter chapter # or title…';
        searchInput.setAttribute('aria-label', 'Filter chapters');

        const sortBtn = document.createElement('button');
        sortBtn.type = 'button';
        sortBtn.className = 'md-ch-sort';
        sortBtn.textContent = 'Ch. Highest ↓';

        const reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'md-ch-reload';
        reloadBtn.title = 'Reload chapters (check for new or missing chapters)';
        reloadBtn.setAttribute('aria-label', 'Reload chapters');
        reloadBtn.innerHTML = ICON.reload;

        const totalBadge = document.createElement('span');
        totalBadge.className = 'md-ch-badge';
        totalBadge.textContent = groups.length + ' chapters';

        head.append(searchInput, sortBtn, reloadBtn, totalBadge);

        const scrollWrap = document.createElement('div');
        scrollWrap.className = 'md-ch-scroll';

        const loaderEl = document.createElement('div');
        loaderEl.className = 'md-ch-loader';
        loaderEl.hidden = true;
        loaderEl.innerHTML = '<span class="md-ch-spinner" aria-hidden="true"></span><span class="md-ch-loader-txt">Loading chapters…</span>';

        const moreBar = document.createElement('div');
        moreBar.className = 'md-ch-morebar';
        moreBar.hidden = true;
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'md-ch-morebtn';
        loadMoreBtn.textContent = 'Load next page';
        const loadAllBtn = document.createElement('button');
        loadAllBtn.type = 'button';
        loadAllBtn.className = 'md-ch-morebtn';
        loadAllBtn.textContent = 'Load all chapters';
        moreBar.append(loadMoreBtn, loadAllBtn);

        box.append(head, scrollWrap, loaderEl, moreBar);

        function visibleGroups() {
            const q = filterQuery.trim().toLowerCase();
            let list = groups.slice().sort((a, b) => sortDesc ? (b.sortNum - a.sortNum) : (a.sortNum - b.sortNum));
            if (q) {
                list = list.filter(g => {
                    const rel = g.releases[g.activeIdx] || g.releases[0];
                    return (g.label + ' ' + (rel?.title || '') + ' ' + g.releases.map(r => r.group).join(' ')).toLowerCase().includes(q);
                });
            }
            return list;
        }

        function updateUi() {
            const selecting = bar.hasAttribute('data-selecting');
            allBtn.hidden = zipBtn.hidden = pdfBtn.hidden = countEl.hidden = !selecting;
            countEl.textContent = selected.size + ' selected';
            allBtn.textContent = selected.size > 0 ? 'Clear All' : 'Select All';
            const busy = !!batchJob;
            zipBtn.disabled = (!selected.size && (!busy || batchJob.fmt !== 'zip')) || (busy && batchJob.fmt !== 'zip');
            pdfBtn.disabled = (!selected.size && (!busy || batchJob.fmt !== 'pdf')) || (busy && batchJob.fmt !== 'pdf');
            totalBadge.textContent = loadingAll ? `${groups.length} chapters…` : `${groups.length} chapters`;
        }

        function renderRows() {
            const selecting = bar.hasAttribute('data-selecting');
            const list = visibleGroups();
            scrollWrap.textContent = '';

            if (!list.length) {
                const empty = document.createElement('div');
                empty.className = 'md-ch-empty';
                empty.textContent = filterQuery ? 'No chapters match your filter.' : 'Loading chapters…';
                scrollWrap.appendChild(empty);
                updateUi();
                return;
            }

            const frag = document.createDocumentFragment();
            list.forEach((g, idx) => {
                const rel = g.releases[g.activeIdx] || g.releases[0];
                const isSel = selected.has(g.key);

                const row = document.createElement('div');
                row.className = 'md-ch-row';
                row.dataset.key = g.key;
                if (isSel) row.dataset.mdSel = '1';

                if (selecting) {
                    const ck = document.createElement('input');
                    ck.type = 'checkbox';
                    ck.className = 'md-ck';
                    ck.checked = isSel;
                    ck.setAttribute('aria-label', 'Select ' + g.label);
                    ck.addEventListener('click', e => { e.stopPropagation(); toggleGroup(list, idx, e.shiftKey); });
                    row.appendChild(ck);
                }

                const link = document.createElement('a');
                link.className = 'md-ch-link';
                link.href = rel.url;
                const numSpan = document.createElement('span');
                numSpan.className = 'md-ch-num';
                numSpan.textContent = g.number !== null ? `Ch. ${g.number}` : g.label;
                link.appendChild(numSpan);
                if (rel.title) {
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'md-ch-title';
                    titleSpan.textContent = rel.title;
                    link.appendChild(titleSpan);
                }
                row.appendChild(link);

                const meta = document.createElement('div');
                meta.className = 'md-ch-meta';

                const timeSpan = document.createElement('span');
                timeSpan.className = 'md-ch-time';
                timeSpan.textContent = rel.time;

                if (g.releases.length > 1) {
                    const sel = document.createElement('select');
                    sel.className = 'md-group-sel';
                    sel.setAttribute('aria-label', 'Scanlation group for ' + g.label);
                    g.releases.forEach((r, rIdx) => {
                        const opt = document.createElement('option');
                        opt.value = String(rIdx);
                        opt.textContent = r.group;
                        if (rIdx === g.activeIdx) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    sel.addEventListener('click', e => e.stopPropagation());
                    sel.addEventListener('change', e => {
                        e.stopPropagation();
                        g.activeIdx = Number(sel.value) || 0;
                        const activeRel = g.releases[g.activeIdx] || g.releases[0];
                        link.href = activeRel.url;
                        timeSpan.textContent = activeRel.time;
                        if (selected.has(g.key)) selected.set(g.key, activeRel);
                    });
                    meta.appendChild(sel);
                } else {
                    const pill = document.createElement('span');
                    pill.className = 'md-group-pill';
                    pill.textContent = rel.group;
                    pill.title = rel.group;
                    meta.appendChild(pill);
                }

                meta.appendChild(timeSpan);
                row.appendChild(meta);

                row.addEventListener('click', e => {
                    if (!bar.hasAttribute('data-selecting')) return;
                    if (e.target.closest('select, .md-ck')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    toggleGroup(list, idx, e.shiftKey);
                });

                frag.appendChild(row);
            });

            scrollWrap.appendChild(frag);
            updateUi();
        }

        function toggleGroup(list, idx, shiftKey) {
            const g = list[idx];
            if (!g) return;
            const targetState = !selected.has(g.key);

            if (shiftKey && lastClickedIndex >= 0 && lastClickedIndex < list.length) {
                const start = Math.min(lastClickedIndex, idx);
                const end = Math.max(lastClickedIndex, idx);
                for (let i = start; i <= end; i++) {
                    const item = list[i];
                    const rel = item.releases[item.activeIdx] || item.releases[0];
                    if (targetState) {
                        if (selected.size < CONFIG.batchLimit) selected.set(item.key, rel);
                    } else {
                        selected.delete(item.key);
                    }
                }
            } else {
                const rel = g.releases[g.activeIdx] || g.releases[0];
                if (targetState) {
                    if (selected.size < CONFIG.batchLimit) selected.set(g.key, rel);
                    else { statusEl.textContent = 'Select up to ' + CONFIG.batchLimit + ' chapters per export.'; toast(statusEl.textContent); }
                } else {
                    selected.delete(g.key);
                }
            }
            lastClickedIndex = idx;
            renderRows();
        }

        async function runBatch(fmt, btn) {
            if (batchJob) {
                if (batchJob.fmt === fmt) batchJob.ctl.abort(CANCELLED);
                return;
            }
            if (!selected.size) return;
            const series = $('.mpage__title')?.textContent.trim() || 'Comix';
            const list = [...selected.values()].sort((a, b) => a.sortNum - b.sortNum);
            const ctl = new AbortController();
            batchJob = { fmt, ctl };
            btn.dataset.state = 'busy';
            btn.style.setProperty('--p', '2%');
            btn.innerHTML = `${ICON.stop}<span>Cancel</span>`;
            updateUi();

            try {
                if (fmt === 'zip') {
                    const usedNames = new Set();
                    const entries = [];
                    let size = 0;
                    for (const [i, item] of list.entries()) {
                        const ctx = { ...item, series };
                        const archive = await chapterArchive(ctx, (msg, p) => {
                            const overall = Math.round(((i + (p || 0) / 100) / list.length) * 100);
                            btn.style.setProperty('--p', overall + '%');
                            statusEl.textContent = `${i + 1}/${list.length} · ${item.label} · ${msg}`;
                        }, ctl);
                        size += archive.blob.size;
                        if (size > MAX_ARCHIVE_BYTES) throw new Error('Batch exceeds 512 MB. Select fewer chapters.');
                        const name = usedNames.has(archive.filename)
                            ? archive.filename.replace(/\.cbz$/, ' (' + item.id + ').cbz')
                            : archive.filename;
                        usedNames.add(name);
                        entries.push({ name, data: new Uint8Array(await archive.blob.arrayBuffer()) });
                    }
                    const filename = safeName(series) + ' - Chapters.zip';
                    storeDownload(makeZip(entries), filename);
                    statusEl.textContent = 'ZIP ready.';
                    toast('Downloaded ' + filename, 2800);
                } else {
                    const pdfChapters = [];
                    for (const [i, item] of list.entries()) {
                        const ctx = { ...item, series };
                        const pages = await downloadChapterBytes(ctx, (msg, p) => {
                            const overall = Math.round(((i + (p || 0) / 100) / list.length) * 100);
                            btn.style.setProperty('--p', overall + '%');
                            statusEl.textContent = `${i + 1}/${list.length} · ${item.label} · ${msg}`;
                        }, ctl);
                        const imgs = [];
                        for (const p of pages) {
                            ctl.signal.throwIfAborted();
                            imgs.push(await toJpegPart(p.data));
                        }
                        pdfChapters.push({ label: item.label, imgs });
                    }
                    const filename = safeName(series) + ' - Chapters.pdf';
                    storeDownload(buildPdf(pdfChapters, series), filename);
                    statusEl.textContent = 'PDF ready.';
                    toast('Downloaded ' + filename, 2800);
                }
            } catch (err) {
                statusEl.textContent = err === CANCELLED ? 'Export cancelled.' : (err.message || 'Export failed.');
                toast(statusEl.textContent, 2600);
            } finally {
                delete btn.dataset.state;
                btn.style.removeProperty('--p');
                btn.innerHTML = `${ICON.down}<span>Download ${fmt.toUpperCase()}</span>`;
                if (batchJob?.ctl === ctl) batchJob = null;
                updateUi();
            }
        }

        modeBtn.addEventListener('click', () => {
            const selecting = !bar.hasAttribute('data-selecting');
            bar.toggleAttribute('data-selecting', selecting);
            modeBtn.setAttribute('aria-pressed', String(selecting));
            modeBtn.textContent = selecting ? 'Done selecting' : 'Select chapters';
            if (!selecting) {
                if (batchJob) batchJob.ctl.abort(CANCELLED);
                selected.clear();
                lastClickedIndex = -1;
                statusEl.textContent = '';
            }
            renderRows();
        });

        allBtn.addEventListener('click', () => {
            if (selected.size > 0) {
                selected.clear();
                statusEl.textContent = '';
            } else {
                const list = visibleGroups();
                for (const g of list) {
                    if (selected.size >= CONFIG.batchLimit) break;
                    selected.set(g.key, g.releases[g.activeIdx] || g.releases[0]);
                }
                const msg = `Selected all ${selected.size} unique chapters`;
                statusEl.textContent = msg;
                toast(msg, 2200);
            }
            renderRows();
        });

        searchInput.addEventListener('input', () => {
            filterQuery = searchInput.value;
            renderRows();
        });

        sortBtn.addEventListener('click', () => {
            sortDesc = !sortDesc;
            sortBtn.textContent = sortDesc ? 'Ch. Highest ↓' : 'Ch. Lowest ↑';
            renderRows();
        });

        zipBtn.addEventListener('click', () => runBatch('zip', zipBtn));
        pdfBtn.addEventListener('click', () => runBatch('pdf', pdfBtn));

        chaptersSection.dataset.mdUnified = '1';
        const secHead = $('.mpage__sec-head', chaptersSection);
        if (secHead) secHead.after(bar, box);
        else chaptersSection.prepend(bar, box);

        seriesState = { path: seriesPath, bar, box };
        renderRows();

        const setLoader = (show, msg) => {
            loaderEl.hidden = !show;
            const t = $('.md-ch-loader-txt', loaderEl);
            if (t && msg) t.textContent = msg;
        };

        let collectedRaw = [...scrapeDomChapters(chaptersSection)];
        let isComplete = false;
        let isCrawling = false;
        let stickyTotal = 0;

        function uniqueRawCount() {
            const ids = new Set();
            for (const x of collectedRaw) if (x?.id) ids.add(x.id);
            return ids.size;
        }

        function getPagerMeta() {
            const footTxt = $('.mchap-foot', chaptersSection)?.textContent || '';
            const totalMatch = footTxt.match(/of\s+([\d,]+)\s+items/i);
            const parsedTotal = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;
            if (parsedTotal > stickyTotal) stickyTotal = parsedTotal;
            const totalItems = parsedTotal || stickyTotal;
            const estPages = totalItems > 0 ? Math.ceil(totalItems / 20) : 0;
            const activeEl = $('nav.npager .npager__num.is-active, nav.npager [aria-current="page"]', chaptersSection);
            const curPage = Number(activeEl?.textContent?.trim() || '1') || 1;
            let nextBtn = $('nav.npager button[aria-label="Next page"]', chaptersSection);
            if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
                // Fallback to numbered (curPage + 1) button inside nav.npager
                nextBtn = $$('nav.npager button, nav.npager a', chaptersSection).find(el =>
                    !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
                    /^\d{1,4}$/.test((el.textContent || '').trim()) &&
                    Number((el.textContent || '').trim()) === curPage + 1
                ) || null;
            }
            const hasNext = !!(nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true');
            return { totalItems, estPages, curPage, nextBtn, hasNext };
        }

        function refreshMoreBar(pausedForChallenge = false) {
            const { totalItems, estPages, curPage, hasNext } = getPagerMeta();
            const moreRemaining = !isComplete && (hasNext || (totalItems > 0 && collectedRaw.length < totalItems));
            if (!moreRemaining || isCrawling) {
                moreBar.hidden = true;
                return;
            }
            moreBar.hidden = false;
            const remPages = estPages > curPage ? (estPages - curPage) : 0;
            loadMoreBtn.textContent = pausedForChallenge
                ? `Resume (page ${curPage + 1}${estPages ? '/' + estPages : ''})`
                : `Load next 5 pages`;
            loadAllBtn.hidden = false;
            loadAllBtn.textContent = remPages ? `Load all remaining (${remPages} pages)` : 'Load all chapters';
        }

        function restoreCleanUrl() {
            try {
                const u = new URL(location.href);
                if (u.searchParams.has('page')) {
                    u.searchParams.delete('page');
                    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
                }
            } catch (_) {}
        }

        async function waitForDomPageChange(prevSig, timeoutMs = 8000) {
            return new Promise(resolve => {
                let done = false;
                const finish = val => { if (!done) { done = true; obs.disconnect(); clearTimeout(tm); resolve(val); } };
                const check = () => {
                    if (isTurnstileVisible()) { finish('blocked'); return; }
                    const sig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                    if (sig && sig !== prevSig) finish('ok');
                };
                const obs = new MutationObserver(check);
                obs.observe(document.body || chaptersSection, { childList: true, subtree: true, attributes: true });
                const tm = setTimeout(() => finish('timeout'), timeoutMs);
                check();
            });
        }

        async function stepHiddenPages(maxSteps = 5) {
            if (isCrawling || isComplete) return;
            isCrawling = true;
            loadingAll = true;
            moreBar.hidden = true;
            let blocked = false;
            let steps = 0;

            try {
                // If user landed on ?page=N (N>1), jump back to page 1 first so we never miss recent chapters
                const initMeta = getPagerMeta();
                if (initMeta.curPage > 1 && collectedRaw.length <= 20) {
                    const p1 = $$('nav.npager .npager__num', chaptersSection).find(b => b.textContent.trim() === '1');
                    if (p1) {
                        const prevSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                        setLoader(true, 'Returning to page 1…');
                        p1.click();
                        const st = await waitForDomPageChange(prevSig);
                        if (st === 'ok') {
                            collectedRaw = [...scrapeDomChapters(chaptersSection)];
                            groups = groupChaptersByNumber(collectedRaw);
                            renderRows();
                        }
                    }
                }

                while (steps < maxSteps) {
                    if (seriesState?.path !== seriesPath || !box.isConnected) return;

                    if (isTurnstileVisible()) {
                        const { curPage, estPages } = getPagerMeta();
                        setLoader(true, `Waiting for Cloudflare check… (page ${curPage}${estPages ? '/' + estPages : ''})`);
                        const cleared = await waitForTurnstileClear(90000);
                        if (!cleared || seriesState?.path !== seriesPath || !box.isConnected) { blocked = true; break; }
                    }

                    const { estPages, curPage, nextBtn, hasNext } = getPagerMeta();
                    if (!hasNext || !nextBtn) {
                        isComplete = true;
                        break;
                    }

                    const prevSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                    setLoader(true, estPages ? `Loading chapters (page ${curPage + 1} / ${estPages})…` : `Loading page ${curPage + 1}…`);
                    nextBtn.click();

                    let st = await waitForDomPageChange(prevSig, 6000);
                    // Retry clicking up to 2 extra times on slow settles (matching harvest_chapters.js)
                    for (let retry = 0; retry < 2 && st === 'timeout'; retry++) {
                        if (seriesState?.path !== seriesPath || !box.isConnected) break;
                        const metaRetry = getPagerMeta();
                        if (!metaRetry.hasNext || !metaRetry.nextBtn) break;
                        metaRetry.nextBtn.click();
                        st = await waitForDomPageChange(prevSig, 6000);
                    }
                    if (st === 'blocked') {
                        setLoader(true, `Waiting for Cloudflare check… (page ${curPage + 1}${estPages ? '/' + estPages : ''})`);
                        const cleared = await waitForTurnstileClear(90000);
                        if (!cleared || seriesState?.path !== seriesPath || !box.isConnected) { blocked = true; break; }
                        const nowSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                        if (!nowSig || nowSig === prevSig) {
                            const metaAfter = getPagerMeta();
                            if (metaAfter.hasNext && metaAfter.nextBtn) {
                                metaAfter.nextBtn.click();
                                st = await waitForDomPageChange(prevSig, 7000);
                            }
                        } else {
                            st = 'ok';
                        }
                    }

                    if (st !== 'ok' || seriesState?.path !== seriesPath || !box.isConnected) {
                        if (st === 'blocked') blocked = true;
                        break;
                    }

                    const pageRows = scrapeDomChapters(chaptersSection);
                    if (!pageRows.length) break;
                    collectedRaw.push(...pageRows);
                    groups = groupChaptersByNumber(collectedRaw);
                    renderRows();
                    steps++;

                    if (steps < maxSteps) await sleep(720);
                }

                // Bottom-up ascending flip: ONLY run when descending pagination ACTUALLY reached the last page (!finalMeta.hasNext)
                // and lowest chapter is still > 1 (never on a partial batch or mid-series timeout, which would leave gaps!).
                const finalMeta = getPagerMeta();
                const reachedEnd = !finalMeta.hasNext;
                const loadedNums = collectedRaw.map(x => x.sortNum).filter(n => n > 0);
                const minLoaded = loadedNums.length ? Math.min(...loadedNums) : 0;
                if (reachedEnd && !blocked && minLoaded > 1) {
                    const sortToggle = $('.mchap-toolbar__sort button[title*="Sort by chapter" i]', chaptersSection);
                    if (sortToggle) {
                        const prevSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                        setLoader(true, `Fetching earliest chapters (Ch. 1–${Math.floor(minLoaded)})…`);
                        sortToggle.click();
                        let flipSt = await waitForDomPageChange(prevSig, 8000);
                        if (flipSt === 'blocked') {
                            const cleared = await waitForTurnstileClear(90000);
                            if (cleared) flipSt = 'ok';
                        }
                        if (flipSt === 'ok' && seriesState?.path === seriesPath && box.isConnected) {
                            const ascPage1 = scrapeDomChapters(chaptersSection);
                            collectedRaw.push(...ascPage1);
                            groups = groupChaptersByNumber(collectedRaw);
                            renderRows();
                            // If Ch. 1..minLoaded spans 2-3 ascending pages, grab up to 3 more pages until we bridge minLoaded
                            for (let ap = 0; ap < 3; ap++) {
                                const maxAsc = Math.max(...ascPage1.map(x => x.sortNum).filter(n => n >= 0), 0);
                                const curMin = Math.min(...collectedRaw.map(x => x.sortNum).filter(n => n > 0), 9999);
                                if (curMin <= 1 && maxAsc >= minLoaded) break;
                                const nb = $('nav.npager button[aria-label="Next page"]', chaptersSection);
                                if (!nb || nb.disabled) break;
                                const pSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                                await sleep(700);
                                nb.click();
                                const nst = await waitForDomPageChange(pSig, 8000);
                                if (nst !== 'ok') break;
                                const extra = scrapeDomChapters(chaptersSection);
                                if (!extra.length) break;
                                collectedRaw.push(...extra);
                                groups = groupChaptersByNumber(collectedRaw);
                                renderRows();
                                if (Math.max(...extra.map(x => x.sortNum).filter(n => n >= 0), 0) >= minLoaded) break;
                            }
                            // Flip native sort back to descending cleanly
                            await sleep(500);
                            sortToggle.click();
                        }
                    }
                }

                const afterMeta = getPagerMeta();
                const haveAllItems = !afterMeta.totalItems || uniqueRawCount() >= afterMeta.totalItems;
                if (!afterMeta.hasNext && reachedEnd && !blocked && haveAllItems) {
                    isComplete = true;
                }
                if (isComplete || collectedRaw.length >= 20) {
                    writeChapCache(seriesPath, collectedRaw, isComplete);
                }
                if (isComplete) {
                    const p1 = $$('nav.npager .npager__num', chaptersSection).find(b => b.textContent.trim() === '1');
                    if (p1 && !p1.classList.contains('is-active')) p1.click();
                    restoreCleanUrl();
                }
            } finally {
                isCrawling = false;
                loadingAll = false;
                reloadBtn.classList.remove('is-spinning');
                setLoader(false);
                renderRows();
                refreshMoreBar(blocked);
                if (blocked) toast('Paused for Cloudflare verification — click Resume after verifying.', 3200);
            }
        }

        loadMoreBtn.addEventListener('click', () => stepHiddenPages(5));
        loadAllBtn.addEventListener('click', () => stepHiddenPages(Infinity));
        reloadBtn.addEventListener('click', async () => {
            if (isCrawling) return;
            try { sessionStorage.removeItem('md-comix-chaps-v3:' + seriesPath); } catch (_) {}
            reloadBtn.classList.add('is-spinning');
            isComplete = false;
            const p1 = $$('nav.npager .npager__num', chaptersSection).find(b => b.textContent.trim() === '1');
            if (p1 && !p1.classList.contains('is-active')) {
                const prevSig = $$('.mchap-row__primary[href]', chaptersSection).map(a => a.getAttribute('href')).join('|');
                p1.click();
                await waitForDomPageChange(prevSig, 6000);
            }
            collectedRaw = [...scrapeDomChapters(chaptersSection)];
            groups = groupChaptersByNumber(collectedRaw);
            renderRows();
            toast('Reloading chapters…', 1500);
            stepHiddenPages(Infinity);
        });

        scrollWrap.addEventListener('scroll', () => {
            if (isComplete || isCrawling || isTurnstileVisible()) return;
            if (scrollWrap.scrollTop + scrollWrap.clientHeight >= scrollWrap.scrollHeight - 80) {
                stepHiddenPages(2);
            }
        }, { passive: true });

        restoreCleanUrl();

        const cachedData = readChapCache(seriesPath);
        if (cachedData && cachedData.complete && cachedData.items.length >= 20) {
            collectedRaw = cachedData.items;
            isComplete = true;
            loadingAll = false;
            groups = groupChaptersByNumber(collectedRaw);
            renderRows();
            refreshMoreBar(false);
        } else {
            // Auto-load first 6 extra pages gently (7 pages = ~140 rows, zero Turnstile risk), then let user scroll or click Load All
            stepHiddenPages(6);
        }
    }

    /* ====================================================================
     *  EXTRAS: BACK TO TOP, SEARCH SHORTCUT (/), LAZY IMAGES
     * ==================================================================== */
    function addExtras() {
        if (CONFIG.backToTop && document.body && !document.getElementById('md-top')) {
            const b = document.createElement('button');
            b.id = 'md-top';
            b.type = 'button';
            b.innerHTML = ICON.up;
            b.title = 'Back to top';
            b.setAttribute('aria-label', 'Back to top');
            b.addEventListener('click', () => scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' }));
            document.body.appendChild(b);
            addEventListener('scroll', () => b.classList.toggle('show', scrollY > 700), { passive: true });
        }
    }

    addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
        const input = $('.search__form input[type="search"], .search__form input[type="text"], .search__form input');
        if (input) { e.preventDefault(); input.focus(); input.select(); }
    });

    function optimizeImages(scope) {
        $$('.card__poster-wrap img, .lrow__poster img', scope).forEach(img => {
            if (!img.getAttribute('loading')) img.loading = 'lazy';
            if (!img.getAttribute('decoding')) img.decoding = 'async';
        });
    }

    /* ====================================================================
     *  MAIN SPA SYNC LOOP
     * ==================================================================== */
    let currentPath = null;
    let scheduled = false;

    function syncPage() {
        scheduled = false;
        injectStyles();
        const app = $('#app-root');
        if (!app?.firstElementChild) return;

        const path = location.pathname;
        const page = detectPage(path);
        root.dataset.mdPage = page;

        if (path !== currentPath) {
            if (batchJob) batchJob.ctl.abort(CANCELLED);
            if (page !== 'chapter') unmountReader();
            if (page !== 'overview') seriesState = null;
            currentPath = path;
            lastTracked = null;
        }

        tagDropdowns(app);
        enhanceSettingsPresets();
        harvestCovers(app);
        mountLibraryTopBtn(app);
        syncSavedBadges();
        tagUserProfile(app);
        tagCommunityPage(app);
        purgeAuthUI(app);
        renderCommentScores(app);
        addExtras();
        optimizeImages(app);

        const isHome = /^\/(?:home\/?)?$/.test(path);
        const column = isHome && $('main.layout--top .main-col', app);
        if ((!column || !heroState?.node.isConnected) && heroState) {
            heroState.dispose();
            heroState = null;
        }
        if (!column && historyNode?.isConnected) {
            historyNode.remove();
            historyNode = null;
        }
        if (column) {
            if (!heroState) mountHero(column);
            mountHistory(column);
        }

        if (page === 'overview') {
            setupCoverBackdrop(app);
            mountSeriesSaveBtn(app);
            const chapters = $('.mpage__chapters', app);
            if (chapters && ($('.mchap-row__primary[href]', chapters) || $('#md-all-chaps', chapters))) {
                mountSeriesChapters(chapters, path);
            }
        }

        if (page === 'chapter') {
            const readerEl = $('.rpage', app);
            if (readerEl) {
                const ctx = chapterContext(location.href);
                if (ctx) {
                    trackReading(ctx);
                    mountReader(ctx);
                }
                scheduleProgress();
            }
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(syncPage);
    }

    new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.(UI_ZONES))) schedule();
    }).observe(root, { childList: true, subtree: true });

    new MutationObserver(records => {
        if (records.some(r => r.target.classList?.contains('rpage-progress__seg'))) scheduleProgress();
    }).observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });

    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule);
    schedule();
})();