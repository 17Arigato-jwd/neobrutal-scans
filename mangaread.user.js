// ==UserScript==
// @name         MangaRead Neobrutalism + De-bloat
// @namespace    https://github.com/17Arigato-jwd/neobrutal-scans
// @version      2026-11-20.3
// @description  Neobrutalist skin and debloater for MangaRead: removes invasive ads, popunders, and trackers, restyles catalog and overview with bold high-contrast design, and adds reader dock with zoom controls, background switcher, and offline .cbz / batch zip download.
// @author       17Arigato-jwd
// @homepageURL  https://github.com/17Arigato-jwd/neobrutal-scans
// @supportURL   https://github.com/17Arigato-jwd/neobrutal-scans/issues
// @updateURL    https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js
// @downloadURL  https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js
// @match        *://mangaread.org/*
// @match        *://*.mangaread.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mangaread.org
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      mangaread.org
// @connect      *
// ==/UserScript==
(function boot() {
    'use strict';
    // Never run inside third-party iframes; permit our background harvester frame
    if (window.top !== window.self && window.name !== 'md-bg-frame') return;

    // At document-start <html> may not exist yet: wait for it
    if (!document.documentElement) {
        const mo = new MutationObserver(() => {
            if (document.documentElement) {
                mo.disconnect();
                boot();
            }
        });
        mo.observe(document, { childList: true });
        return;
    }

    /* ====================================================================
     *  LAYER 2: GLOBAL API NEUTRALIZATION & AD STUBBING
     * ==================================================================== */
    function neutralizeGlobals() {
        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

            // 1. Defeat PubAdX & Adcash Syndication
            win.__pubadxTagInit = true;
            win.aclib = {
                runInPagePush: () => {},
                runBanner: () => {},
                runPop: () => {}
            };

            // 2. Defeat Onclicka Popunder Engine
            win.a3klsam = { init: () => {} };

            // 3. Defeat Yandex RTB & Metrika Tracking
            try {
                Object.defineProperty(win, 'yaContextCb', {
                    value: { push: () => {} },
                    writable: false,
                    configurable: false
                });
            } catch (_) {
                win.yaContextCb = { push: () => {} };
            }
            win.ym = () => {};

            // 4. Defeat Google Publisher Tag (GPT) & Google Tag Manager
            win.googletag = {
                cmd: [],
                pubads: () => ({
                    enableSingleRequest: () => {},
                    setTargeting: () => {},
                    collapseEmptyDivs: () => {},
                    addEventListener: () => {},
                    refresh: () => {}
                }),
                enableServices: () => {},
                display: () => {},
                defineSlot: () => ({ addService: () => ({}) })
            };
            win.gtag = () => {};
            win.dataLayer = [];

            // 5. Defeat WordPress Ad Inserter Anti-Adblock & Click Trackers
            win.ai_adb_process_blocks = () => {};
            win.ai_install_click_trackers = () => {};
            win.ai_process_impressions = () => {};
            win.ai_insert = () => {};

            // 6. Override window.open to block popups/popunders while preserving same-tab navigation
            const blockOpen = function(url, target, features) {
                if (target === '_self') {
                    if (url) location.href = url;
                    return win;
                }
                console.warn('[Neobrutalism] Blocked popup/popunder:', url);
                return null;
            };
            win.open = blockOpen;
            window.open = function(url, target, features) {
                return blockOpen(url, target, features);
            };

            // 7. Defeat Reader Membership Promo & Pre-empt Dialog
            try {
                if (typeof document !== 'undefined') {
                    document.cookie = 'reader_membership_seen=1; path=/; max-age=31536000; SameSite=Lax';
                }
                if (win.localStorage) {
                    win.localStorage.setItem('demonicscans:reader-membership:last-shown', String(Date.now()));
                }
            } catch (_) {}

            const patchDialog = (targetWin) => {
                if (!targetWin || typeof targetWin.HTMLDialogElement === 'undefined') return;
                const proto = targetWin.HTMLDialogElement.prototype;
                if (!proto || !proto.showModal || proto.showModal.__mdPatched) return;
                const origShowModal = proto.showModal;
                const patchedShowModal = function() {
                    const isPromo = this.id === 'subpanel' ||
                        this.classList.contains('reader-membership-promo') ||
                        (this.matches && this.matches('#subpanel, .reader-membership-promo, dialog.reader-membership-promo, [class*="membership" i]'));
                    if (isPromo) {
                        if (this.open && typeof this.close === 'function') {
                            try { this.close(); } catch (_) {}
                        }
                        try { this.remove(); } catch (_) {}
                        if (typeof document !== 'undefined' && document.documentElement) {
                            document.documentElement.classList.remove('reader-membership-open');
                            document.documentElement.style.overflow = 'auto';
                        }
                        return;
                    }
                    return origShowModal.apply(this, arguments);
                };
                patchedShowModal.__mdPatched = true;
                try {
                    proto.showModal = patchedShowModal;
                } catch (_) {}
            };
            patchDialog(win);
            if (win !== window) patchDialog(window);

            // Mirror stubs to sandbox window if running in userscript manager sandbox
            if (win !== window) {
                try {
                    window.__pubadxTagInit = true;
                    window.aclib = win.aclib;
                    window.a3klsam = win.a3klsam;
                    window.yaContextCb = win.yaContextCb;
                    window.ym = win.ym;
                    window.googletag = win.googletag;
                    window.gtag = win.gtag;
                    window.dataLayer = win.dataLayer;
                    window.ai_adb_process_blocks = win.ai_adb_process_blocks;
                    window.ai_install_click_trackers = win.ai_install_click_trackers;
                    window.ai_process_impressions = win.ai_process_impressions;
                    window.ai_insert = win.ai_insert;
                } catch (_) {}
            }
        } catch (e) {
            console.warn('[MD] neutralizeGlobals error:', e);
        }
    }
    neutralizeGlobals();

    /* ====================================================================
     *  CONFIG & STATE INITIALIZATION
     * ==================================================================== */
    const CONFIG = {
        maxWidth: 1280,
        collapseGaps: true,
        backToTop: true,
        compactViews: true,
        reader: {
            baseWidth: 800,
            zoomSteps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2],
            concurrency: 4,
        },
        readerDockOnTap: true,
        readerHeaderAutoHide: true,
        dockHideOnScroll: true,
        dockScrollPx: 150,
        themeDefault: 'dark',
    };

    const root = document.documentElement;
    root.dataset.mdSite = 'mangaread';

    const store = {
        get: (k, def) => {
            try {
                const v = localStorage.getItem('md-' + k);
                if (v === null) return def;
                try {
                    return JSON.parse(v);
                } catch (_) {
                    return v;
                }
            } catch (_) {
                return def;
            }
        },
        set: (k, v) => {
            try {
                localStorage.setItem('md-' + k, JSON.stringify(v));
            } catch (_) {}
        }
    };

    const savedTheme = (() => {
        try {
            const t = store.get('theme', CONFIG.themeDefault || 'dark');
            if (t === 'light' || t === 'dark') return t;
        } catch (_) {}
        return CONFIG.themeDefault || 'dark';
    })();
    root.dataset.mdTheme = savedTheme;

    function setTheme(t, persist = true) {
        const val = t === 'light' ? 'light' : 'dark';
        root.dataset.mdTheme = val;
        if (persist) store.set('theme', val);
        const b = document.getElementById('md-theme');
        if (b) {
            b.setAttribute('aria-checked', String(val === 'dark'));
            b.setAttribute('title', val === 'dark' ? 'Theme: Dark (click for Light)' : 'Theme: Light (click for Dark)');
        }
        try {
            if (reader.init) paintBg();
        } catch (_) {}
    }

    function toTitleCase(s) {
        if (!s) return '';
        if (/[a-z]/.test(s) && /[A-Z]/.test(s)) return s;
        const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'near', 'nor', 'of', 'on', 'onto', 'or', 'the', 'to', 'with']);
        return s.toLowerCase().split(/\s+/).map((w, i, arr) => {
            if (!w) return '';
            if (i === 0 || i === arr.length - 1 || !MINOR.has(w)) {
                return w.charAt(0).toUpperCase() + w.slice(1);
            }
            return w;
        }).join(' ');
    }

    function detectPage() {
        const p = location.pathname;
        const s = location.search;
        if (p.includes('/chat-mangaread') || p.includes('/chat/')) {
            try { window.location.replace('/'); } catch (_) {}
            return 'redirect';
        }
        const b = typeof document !== 'undefined' ? document.body : null;
        if (b) {
            if (b.classList.contains('reading-manga')) return 'chapter';
            if (b.classList.contains('single-wp-manga') && !b.classList.contains('reading-manga')) return 'overview';
            if (b.classList.contains('home') || b.classList.contains('archive') || b.classList.contains('search') || b.classList.contains('post-type-archive-wp-manga')) return 'list';
        }
        if (/^\/manga\/page\/\d+/i.test(p) || /^\/page\/\d+/i.test(p) || /^\/genres\//i.test(p) || /^\/manga\/?$/i.test(p) || p === '/' || (s && s.includes('s='))) return 'list';
        if (/^\/manga\/[^/]+\/[^/]+\/?$/i.test(p)) return 'chapter';
        if (/^\/manga\/[^/]+\/?$/i.test(p)) return 'overview';
        return 'other';
    }
    const PAGE = () => root.dataset.mdPage || detectPage();

    /* ====================================================================
     *  DOM HELPERS & UTILITIES
     * ==================================================================== */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

    const SVG = body => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICON = {
        prev: SVG('<path d="m15 18-6-6 6-6"/>'),
        next: SVG('<path d="m9 18 6-6-6-6"/>'),
        minus: SVG('<path d="M5 12h14"/>'),
        plus: SVG('<path d="M12 5v14M5 12h14"/>'),
        bg: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
        down: SVG('<path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/>'),
        up: SVG('<path d="M12 19V5m0 0-6 6m6-6 6 6"/>'),
        refresh: SVG('<path d="M20 11a8 8 0 1 0-1.5 5.5M20 4v7h-7"/>'),
        check: SVG('<path d="m5 12 5 5 9-10"/>'),
        stop: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
        list: SVG('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
        sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
        moon: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
        home: SVG('<path d="M3 11 12 3l9 8M5 9.5V20h5v-6h4v6h5V9.5"/>'),
        chat: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>'),
    };

    function toast(msg, ms = 2200) {
        let t = $('#md-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'md-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t.__h);
        t.__h = setTimeout(() => t.classList.remove('show'), ms);
    }

    /* ====================================================================
     *  LAYER 1: DECLARATIVE CSS & NEOBRUTALISM DESIGN SYSTEM
     * ==================================================================== */
    const cssMangaRead = `
        /* ===== GOOGLE FONTS & RESET ===== */
        :root {
            --bg: #f5f2ea;
            --page-bg: var(--bg);
            --card: #ffffff;
            --ink: #111111;
            --muted: #555555;
            --bd: var(--ink);
            --bw: 3px;
            --r: 10px;
            --sh: 4px 4px 0 var(--bd);
            --sh-hover: 6px 6px 0 var(--bd);
            --sh-sm: 2px 2px 0 var(--bd);
            --yellow: linear-gradient(to right, #bf5959 20%, #d39d6d);
            --primary: #bf5959;
            --primary-gradient: linear-gradient(to right, #bf5959 20%, #d39d6d);
            --header-gradient: linear-gradient(135deg, #ff5252 0%, #fed053 100%);
            --lime: #a3e635;
            --pink: #ff6b6b;
            --blue: #88aaee;
            --mint: #e3f6ec;
            --cream: #fffbeb;
            --soft: #ede8dc;
            --violet: #6d28d9;
            --ink-bg: #111111;
            --on-ink: #ffffff;
            --grid: rgba(0, 0, 0, 0.04);
            color-scheme: light;
        }

        html[data-md-theme="dark"] {
            --bg: #150f26;
            --page-bg: #150f26;
            --card: #241b3d;
            --ink: #ece8ff;
            --muted: #a9a0d0;
            --bd: #000000;
            --bw: 3px;
            --r: 10px;
            --sh: 4px 4px 0 #000000;
            --sh-hover: 6px 6px 0 #000000;
            --sh-sm: 2px 2px 0 #000000;
            --yellow: #5a3fc2;
            --primary: #5a3fc2;
            --primary-gradient: linear-gradient(to right, #5a3fc2, #33295a);
            --header-gradient: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f97316 100%);
            --pink: #a3315f;
            --blue: #33479f;
            --lime: #1b7f68;
            --mint: #1d3a45;
            --cream: #2f2354;
            --soft: #33295a;
            --violet: #c1b0ff;
            --ink-bg: #7c5cff;
            --on-ink: #ffffff;
            --grid: rgba(255, 255, 255, 0.035);
            color-scheme: dark;
        }

        /* ===== LAYER 1 DE-BLOAT CSS: ZERO-FOUC SUPPRESSION ===== */
        html.reader-membership-open,
        html.reader-membership-open body {
            overflow: auto !important;
        }
        .ad, .c-ads, .custom-code, .body-top-ads, .body-bottom-ads,
        .code-block, div[class*="code-block"],
        .widget_custom_html, .textwidget.custom-html-widget,
        #custom_html-3, #custom_html-4, #custom_html-5, #block-3,
        ins.pubadx-slot, ins[data-zoneid],
        [class*="bg-ssp-"], [class*="pax3v3c-"], [class*="bg-container-"],
        .pubadx-adcash-sticky, .pubadx-adcash-sticky-close, #pubadx-sticky-close-kf,
        iframe[data-aa], iframe[src*="a-ads.com"], iframe[src*="acceptable.a-ads.com"],
        div[data-type="_mgwidget"], [id*="mgwidget"],
        div[class*="onclicka"], [data-admpid],
        iframe[src*="doubleclick" i], iframe[src*="googlesyndication" i], iframe[src*="adservice" i],
        ins.adsbygoogle, [id^="div-gpt-ad"],
        div[id^="yandex_rtb"], [id^="ya_"],
        .the_champ_sharing_container, .the_champ_horizontal_sharing,
        .the_champ_vertical_sharing, .the_champ_bottom_sharing,
        .the_champ_outer_login_container, .the_champ_login_container,
        .theChampTCBackground, .heateor_ss_standard_follow_icons_container,
        .heateor_ss_mobile_footer, div[class*="the_champ"],
        #wp-bug-reporter, .modal-bug-report, div:has(> #sendBugReport),
        .cf-turnstile, [id^="cf-turnstile"], .cf-turnstile-br,
        #TB_overlay, #TB_window, #TB_load,
        dialog.reader-membership-promo, dialog.reader-membership-promo::backdrop,
        #subpanel, #subpanel::backdrop, dialog[id="subpanel"], dialog[id="subpanel"]::backdrop,
        dialog:not(.cw-dialog):not(#md-comments-dialog):has(.reader-membership-close),
        dialog:not(.cw-dialog):not(#md-comments-dialog):has(.reader-membership-subscribe),
        dialog:not(.cw-dialog):not(#md-comments-dialog):has(a[href*="paypal"]),
        .payment-widget, .payment-icons, .payment-text, .payment-options, .payment-button,
        #popcont, #teaser3,
        #wpd-bubble-wrapper,
        #menu-item-107397, #nav-menu-item-107397,
        li:has(> a[href*="chat-mangaread"]), li:has(> a[href*="/chat"]),
        a[href*="chat-mangaread"], a[href*="/chat/"],
        .chat-container, #chat, #cbox,
        iframe[src*="chat"], iframe[src*="minnit"], iframe[src*="cbox"], iframe[src*="rumbletalk"],
        .c-modal_item, .c-modal_sign-in, .c-modal_sign-up,
        #form-login, #form-sign-up,
        #wpdcom .wpd-form-wrap, #wpdcom .wpd-auth, #wpdcom .wpd-reply-button,
        .go-to-top,
        [data-md-hero-source="1"], #manga-popular-slider-8[data-md-hero-source="1"], .popular-slider[data-md-hero-source="1"],
        [data-md="void"] {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            pointer-events: none !important;
        }

        /* Base surfaces & Neobrutalist typography */
        html, html[data-md-site="mangaread"] {
            background: var(--page-bg) !important;
            scroll-behavior: smooth;
        }
        body {
            background:
                linear-gradient(to right, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                var(--page-bg) !important;
            color: var(--ink) !important;
            font-family: 'DM Sans', system-ui, sans-serif !important;
        }
        a { text-decoration: none !important; color: inherit; }
        ::selection { background: var(--primary) !important; color: #ffffff !important; }
        html[data-md-theme="dark"] ::selection { background: var(--yellow) !important; color: #ffffff !important; }
        :focus-visible { outline: 3px solid var(--ink) !important; outline-offset: 2px !important; }

        /* ===== SITE HEADER & NAVIGATION RESTYLE ===== */
        header.site-header {
            background: var(--header-gradient) !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            box-shadow: var(--sh) !important;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        /* Neutralize Leaking Madara Blue Gradients in Navigation & Header Bars */
        .site-header .main-navigation.style-1,
        .site-header .main-navigation,
        .site-header .c-header__top,
        .site-header .c-header__top .main-navigation,
        .site-header-inner,
        .site-header .c-sub-nav {
            background: transparent !important;
            background-image: none !important;
            box-shadow: none !important;
            border: none !important;
        }
        header.site-header .c-header__top {
            padding: 8px 0;
        }
        .wrap_branding a.logo {
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            font-size: 24px !important;
            color: #ffffff !important;
            letter-spacing: -0.03em;
        }
        .main-navigation ul.navbar-nav li a {
            color: #ffffff !important;
            font-weight: 800 !important;
            font-size: 14px !important;
            text-transform: uppercase !important;
            padding: 6px 12px !important;
            border-radius: 6px;
            transition: background .12s ease;
        }
        .main-navigation ul.navbar-nav li a:hover {
            background: rgba(255, 255, 255, 0.25) !important;
        }

        /* ===== TOP SUB-HEADER NAV & NEOBRUTALIST GENRE POPUP ===== */
        .c-sub-header-nav {
            background: var(--card) !important;
            border-top: 1.5px solid var(--bd) !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            position: relative !important;
            transition: none !important;
        }
        .site-header.sticky .c-sub-header-nav {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            transform: none !important;
        }
        .sub-nav_list li a {
            color: var(--ink) !important;
            font-weight: 800 !important;
            font-size: 13px !important;
            text-transform: uppercase !important;
            transition: color .12s ease !important;
        }
        .sub-nav_list li a:hover {
            color: var(--primary) !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children {
            position: relative !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu {
            position: absolute !important;
            top: 100% !important;
            left: 0 !important;
            z-index: 1000 !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 12px !important;
            display: none;
            grid-template-columns: repeat(4, minmax(110px, 1fr)) !important;
            gap: 6px 12px !important;
            width: max-content !important;
            max-width: 620px !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
            list-style: none !important;
            margin: 0 !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children:hover ul.sub-menu,
        .site-header .sub-nav_list li.menu-item-has-children:focus-within ul.sub-menu {
            display: grid !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu li {
            list-style: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu li a {
            display: block !important;
            padding: 6px 10px !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            color: var(--ink) !important;
            border-radius: 6px !important;
            white-space: nowrap !important;
            transition: background .12s ease, color .12s ease !important;
        }
        .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu li a:hover {
            background: var(--yellow) !important;
            color: #ffffff !important;
        }
        html[data-md-theme="dark"] .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu li a:hover {
            background: var(--yellow) !important;
            color: #000000 !important;
        }

        /* Search button, input & forms */
        .search-navigation .main-menu-search {
            display: inline-flex !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        .main-menu-search li.menu-theme {
            display: inline-flex !important;
            align-items: center !important;
            margin: 0 !important;
            padding: 0 !important;
            list-style: none !important;
        }
        .main-navigation_wrap {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
        }
        a.open-search-main-menu {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 34px !important;
            height: 34px !important;
            background: var(--lime) !important;
            color: #000000 !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            cursor: pointer !important;
            transition: transform .1s, box-shadow .1s !important;
        }
        a.open-search-main-menu:hover {
            transform: translate(1px, 1px) !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
        }
        a.open-search-main-menu i {
            color: #000000 !important;
            font-size: 18px !important;
        }
        .search-main-menu {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 12px !important;
        }
        .search-main-menu form,
        form#blog-post-search {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        form#blog-post-search input[name="s"],
        .search-main-menu input[name="s"],
        form.manga-search-form input[name="s"],
        .search-main-menu input[type="text"] {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 8px 12px !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 600 !important;
        }
        form#blog-post-search input[type="submit"],
        .search-main-menu input[type="submit"],
        form.manga-search-form input[type="submit"] {
            background: var(--lime) !important;
            color: #000000 !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 800 !important;
            cursor: pointer !important;
            padding: 8px 16px !important;
            transition: transform .1s, box-shadow .1s !important;
        }
        form#blog-post-search input[type="submit"]:hover,
        .search-main-menu input[type="submit"]:hover,
        form.manga-search-form input[type="submit"]:hover {
            transform: translate(1px, 1px) !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
        }

        /* ===== MANGA CARDS & CATALOG GRID ===== */
        /* Standardized Series Grid Geometry Across All Grid Pages & Lists */
        .page-listing-item .row > [class*="col-"],
        .page-content-listing .page-listing-item,
        .row.c-tabs-item__content .col-6 {
            display: flex !important;
            flex-direction: column !important;
        }

        div.page-item-detail.manga {
            display: flex !important;
            flex-direction: row !important;
            height: 100% !important;
            min-height: 185px !important;
            box-sizing: border-box !important;
            gap: 12px !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh-sm) !important;
            padding: 12px !important;
            margin-bottom: 16px !important;
            transition: transform .15s ease, box-shadow .15s ease !important;
        }
        div.row.c-tabs-item__content {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh-sm) !important;
            padding: 12px !important;
            margin-bottom: 16px !important;
            transition: transform .15s ease, box-shadow .15s ease !important;
            height: 100% !important;
        }
        div.page-item-detail.manga:hover,
        div.row.c-tabs-item__content:hover {
            transform: translate(-2px, -2px) !important;
            box-shadow: var(--sh-hover) !important;
        }

        /* Strict 2:3 Cover Aspect Ratio & Thumbnails */
        div.page-item-detail.manga .item-thumb {
            flex: 0 0 100px !important;
            width: 100px !important;
            height: 150px !important;
            aspect-ratio: 2 / 3 !important;
            overflow: hidden !important;
            float: none !important;
        }
        div.item-thumb,
        div.item-thumb a,
        div.item-thumb a img,
        div.tab-thumb a img,
        div.slider__thumb a img,
        .popular-img img {
            aspect-ratio: 2 / 3 !important;
            object-fit: cover !important;
            width: 100% !important;
        }
        div.item-thumb a img,
        div.tab-thumb a img,
        div.slider__thumb a img {
            height: 100% !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
        }

        /* Summary Container: Flex Column with Auto Margins */
        div.page-item-detail.manga .item-summary {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
            height: 100% !important;
            float: none !important;
            margin-left: 0 !important;
        }

        /* Standardized 2-Line Clamped Series Titles with Fixed Slot Height */
        div.page-item-detail.manga .post-title,
        .widget-title {
            margin: 0 !important;
        }
        div.page-item-detail.manga .post-title h3,
        div.page-item-detail.manga .post-title h4,
        div.page-item-detail.manga .post-title h5,
        div.page-item-detail.manga .post-title a,
        .widget-title a {
            min-height: 2.8em !important;
            max-height: 2.8em !important;
            line-height: 1.4 !important;
            display: -webkit-box !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 2 !important;
            overflow: hidden !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 800 !important;
            color: var(--ink) !important;
            margin: 0 !important;
        }

        div.page-item-detail.manga .meta-item.rating {
            margin: 4px 0 !important;
            height: 20px !important;
            overflow: hidden !important;
        }

        /* Standardized Chapter Pill / Meta Slots */
        div.page-item-detail.manga .list-chapter {
            margin-top: auto !important;
            min-height: 72px !important;
            max-height: 72px !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-end !important;
            gap: 4px !important;
            overflow: hidden !important;
        }
        div.page-item-detail.manga .chapter-item {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 6px !important;
            height: 32px !important;
            min-height: 32px !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        div.page-item-detail.manga .chapter-item .post-on {
            white-space: nowrap !important;
            font-size: 11px !important;
            flex: 0 0 auto !important;
        }

        div.post-total-rating span.score,
        span.post-on.font-meta,
        li.wp-manga-chapter a {
            display: inline-block;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 12px !important;
            font-weight: 700 !important;
        }

        /* Strip Ugly Grey/White Background on Parent Chapter Container */
        .popular-slider .slider__container .slider__item .slider__content .slider__content_item .chapter-item .chapter,
        body.page .c-page-content .c-page .c-page__content .page-content-listing .page-listing-item .page-item-detail .item-summary .list-chapter .chapter-item .chapter,
        .chapter-item .chapter,
        span.chapter,
        span.chapter.font-meta {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /* Style Chapter Anchor Tags Across All Views (Home, Listing, Search, Detail) */
        .chapter-item .chapter a,
        span.chapter a,
        span.chapter.font-meta a,
        span.chapter a.btn-link,
        .list-chapter .chapter-item a {
            display: inline-block !important;
            padding: 3px 8px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm, 2px 2px 0 var(--bd)) !important;
            text-decoration: none !important;
            transition: all 0.15s ease !important;
            margin: 2px 0 !important;
        }
        .chapter-item .chapter a:hover,
        span.chapter a:hover,
        span.chapter.font-meta a:hover,
        span.chapter a.btn-link:hover,
        .list-chapter .chapter-item a:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
            border-color: var(--bd) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh, 3px 3px 0 var(--bd)) !important;
        }

        /* ===== OVERVIEW & DETAIL PAGE ===== */
        /* Clean Neobrutalist Breadcrumbs - Asura Parity */
        .c-breadcrumb-wrapper,
        .c-breadcrumb-wrapper .c-breadcrumb {
            background: transparent !important;
            background-image: none !important;
            border: none !important;
            box-shadow: none !important;
        }
        ol.breadcrumb {
            background: var(--card) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 8px 16px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 12px !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            align-items: center !important;
        }
        ol.breadcrumb li a {
            color: var(--ink) !important;
            font-weight: 700 !important;
        }
        ol.breadcrumb li.active {
            color: var(--muted) !important;
        }

        div.tab-summary {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 24px !important;
        }
        div.summary_image {
            flex: 0 0 auto !important;
        }
        div.summary_content_wrap {
            flex: 1 1 320px !important;
        }
        div.profile-manga {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 24px !important;
            margin-top: 16px !important;
        }
        div.summary_image a img {
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            max-width: 260px !important;
            height: auto !important;
        }
        div.post-title h1 {
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            color: var(--ink) !important;
            margin-bottom: 12px !important;
        }
        div.summary_content .post-content_item {
            display: flex !important;
            align-items: baseline !important;
            gap: 12px !important;
            margin-bottom: 8px !important;
            color: var(--ink) !important;
        }
        div.summary_content .post-content_item .summary-heading {
            width: auto !important;
            min-width: 100px !important;
            flex-shrink: 0 !important;
        }
        div.summary_content .post-content_item .summary-content {
            width: auto !important;
            flex: 1 1 auto !important;
        }
        div.summary_content .post-content_item .summary-heading h5 {
            font-weight: 800 !important;
            color: var(--muted) !important;
            text-transform: uppercase !important;
            font-size: 11px !important;
        }
        /* Metadata Tag High Contrast in Light & Dark Modes */
        div.summary_content .post-content_item .summary-content a,
        .genres-content a,
        .author-content a,
        .artist-content a {
            background: var(--yellow) !important;
            color: #000000 !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 6px !important;
            padding: 3px 8px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            box-shadow: var(--sh-sm) !important;
            display: inline-block !important;
            margin: 2px 3px 2px 0 !important;
            text-decoration: none !important;
        }
        html[data-md-theme="dark"] div.summary_content .post-content_item .summary-content a,
        html[data-md-theme="dark"] .genres-content a,
        html[data-md-theme="dark"] .author-content a,
        html[data-md-theme="dark"] .artist-content a {
            background: #6d28d9 !important;
            color: #ffffff !important;
        }
        /* Action buttons: Read First / Read Last */
        #btn-read-first,
        #btn-read-last,
        #init-links a.c-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 10px 22px !important;
            background: var(--primary) !important;
            color: #ffffff !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            font-weight: 800 !important;
            font-family: 'Space Grotesk', 'DM Sans', sans-serif !important;
            font-size: 13.5px !important;
            text-transform: uppercase !important;
            margin-right: 12px !important;
            margin-top: 10px !important;
            cursor: pointer !important;
            transition: transform .12s ease, box-shadow .12s ease !important;
        }
        #btn-read-first:hover,
        #btn-read-last:hover,
        #init-links a.c-btn:hover {
            transform: translate(-2px, -2px) !important;
            box-shadow: var(--sh-hover) !important;
        }
        /* Section Heading Icon Fix (Remove Leaking Blue) */
        .c-blog__heading.style-2 i,
        .c-blog__heading.style-2 i::before,
        .c-blog__heading.style-2 i:after {
            background: var(--primary) !important;
            background-image: none !important;
            color: #ffffff !important;
            border-radius: 4px !important;
        }

        /* Monospace Chapter Release Dates */
        span.chapter-release-date,
        span.chapter-release-date i {
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 11px !important;
            font-style: normal !important;
            color: var(--muted) !important;
            font-variant-numeric: tabular-nums !important;
        }

        /* Reverse Order Button */
        a.btn-reverse-order {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 4px 10px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            cursor: pointer !important;
        }
        a.btn-reverse-order:hover {
            background: var(--yellow) !important;
            color: #000000 !important;
        }

        /* Neobrutalist Bookmark Button */
        .add-bookmark,
        .action_detail .btn-bookmark,
        .btn-bookmark {
            background: var(--pink, #ff6b6b) !important;
            color: #ffffff !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            box-shadow: var(--sh-sm) !important;
            border-radius: 8px !important;
            padding: 6px 14px !important;
            font-weight: 700 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            cursor: pointer !important;
            margin-top: 8px !important;
            text-decoration: none !important;
        }
        .add-bookmark a,
        .btn-bookmark a {
            color: #ffffff !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
        }
        .add-bookmark .action_detail {
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 11px !important;
            color: #ffffff !important;
        }
        .add-bookmark:hover,
        .btn-bookmark:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh) !important;
        }

        /* Order By Tabs (.c-nav-tabs, ul.c-tabs-content) */
        .c-nav-tabs,
        ul.c-tabs-content {
            background: var(--card) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 6px !important;
            display: flex !important;
            gap: 8px !important;
            list-style: none !important;
        }
        .c-tabs-item a {
            color: var(--muted) !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            padding: 6px 12px !important;
            border-radius: 6px !important;
            display: inline-block !important;
            transition: all 0.15s ease !important;
        }
        .c-tabs-item.active a,
        .c-tabs-item a:hover {
            background: var(--yellow) !important;
            color: #000000 !important;
            border: var(--bw, 2px) solid var(--bd) !important;
        }
        html[data-md-theme="dark"] .c-tabs-item.active a {
            background: var(--violet, #a855f7) !important;
            color: #ffffff !important;
        }

        /* Archive Page Title Fix (Dark Mode #333 fix) */
        .entry-title h1,
        .entry-header .entry-title,
        .c-page__content h1 {
            color: var(--ink) !important;
        }

        /* Sidebar Widget Headings & View More Buttons */
        .widget .widget-heading,
        .widget .c-blog__heading {
            background: var(--card) !important;
            background-image: none !important;
            border-bottom: var(--bw, 2px) solid var(--bd) !important;
            color: var(--ink) !important;
        }
        .widget-heading h5,
        .c-blog__heading h5 {
            color: var(--ink) !important;
        }
        .widget-view-more,
        .widget-view-more a,
        .widget.c-popular .widget-view-more {
            background: var(--primary) !important;
            background-image: none !important;
            color: #ffffff !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 4px 12px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 11px !important;
            font-weight: 700 !important;
        }

        /* Badges (Hot, New, Complete) */
        .manga-title-badges.hot,
        .manga-title-badges.new,
        .manga-title-badges.custom {
            border: var(--bw, 1.5px) solid var(--bd) !important;
            box-shadow: 2px 2px 0 var(--bd) !important;
            border-radius: 4px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            font-size: 10px !important;
        }

        /* Advanced Search Toggle & Inputs */
        .btn-search-adv {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 6px 14px !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 12px !important;
            font-weight: 700 !important;
        }
        .search-advanced-form {
            background: var(--card) !important;
            border: var(--bw, 2px) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh) !important;
            padding: 16px !important;
        }

        /* Footer Neobrutalist Styling */
        .site-footer,
        .bottom-footer {
            background: var(--card) !important;
            border-top: var(--bw, 3px) solid var(--bd) !important;
            color: var(--muted) !important;
            box-shadow: 0 -4px 0 var(--bd) !important;
        }
        div.description-summary div.summary__content {
            color: var(--ink) !important;
            line-height: 1.7 !important;
            font-size: 14.5px !important;
        }

        /* Chapter list unclipped & styled */
        div.listing-chapters_wrap,
        div.listing-chapters_wrap.show-more {
            max-height: none !important;
        }
        div.c-chapter-readmore {
            display: none !important;
        }
        .listing-chapters_wrap:not([data-md-select]) .md-ck {
            display: none !important;
        }
        [data-md-select] ul.main.version-chap li.wp-manga-chapter {
            cursor: pointer !important;
            user-select: none !important;
        }
        ul.main.version-chap {
            list-style: none !important;
            padding: 0 !important;
            margin: 16px 0 !important;
        }
        ul.main.version-chap li.wp-manga-chapter {
            background: var(--card) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            padding: 8px 14px !important;
            margin-bottom: 6px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            transition: background .12s ease !important;
        }
        ul.main.version-chap li.wp-manga-chapter[data-md-sel],
        ul.main.version-chap li.wp-manga-chapter:has(a[data-md-sel]) {
            background: var(--yellow) !important;
            border-color: var(--bd) !important;
        }
        ul.main.version-chap li.wp-manga-chapter:hover {
            background: var(--yellow) !important;
        }
        ul.main.version-chap li.wp-manga-chapter:hover a {
            color: #ffffff !important;
        }
        html[data-md-theme="dark"] ul.main.version-chap li.wp-manga-chapter:hover a {
            color: #000000 !important;
        }
        ul.main.version-chap li.wp-manga-chapter a {
            color: var(--ink) !important;
            font-size: 13.5px !important;
        }

        /* Show more buttons as Neobrutalist pills */
        .btn.btn-link.content-readmore {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-weight: 800 !important;
            padding: 6px 14px !important;
            cursor: pointer;
        }

        /* ===== READER & CHAPTER SANITIZATION ===== */
        .reading-content {
            max-width: calc(var(--md-zoom, 1) * 800px) !important;
            margin: 0 auto !important;
            padding: 0 !important;
            transition: max-width .18s ease;
        }
        .reading-content .page-break {
            padding: 0 !important;
            margin: 0 auto !important;
            border: none !important;
            line-height: 0 !important;
        }
        .reading-content img.wp-manga-chapter-img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
        }

        /* Reader Backgrounds */
        html[data-md-site="mangaread"][data-md-page="chapter"][data-md-bg="paper"] { --page-bg: #f5f2ea; }
        html[data-md-site="mangaread"][data-md-page="chapter"][data-md-bg="dark"] { --page-bg: #150f26; }
        html[data-md-site="mangaread"][data-md-page="chapter"][data-md-bg="black"] { --page-bg: #000000; }

        /* Reader Header Auto-Hide */
        html[data-md-page="chapter"] header.site-header {
            transition: transform .25s ease !important;
        }
        html[data-md-page="chapter"][data-md-navhide] header.site-header {
            transform: translateY(calc(-100% - 8px)) !important;
        }

        /* Native header reader bars hidden in favor of #md-dock */
        #manga-reading-nav-head, #manga-reading-nav-foot {
            display: none !important;
        }

        /* ===== READER DOCK (#md-dock) ===== */
        #md-dock {
            position: fixed;
            left: 50%;
            bottom: 14px;
            z-index: 120;
            transform: translateX(-50%);
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            gap: 6px;
            max-width: calc(100vw - 20px);
            padding: 7px;
            background: var(--card);
            color: var(--ink);
            border: var(--bw) solid var(--bd);
            border-radius: 12px;
            box-shadow: var(--sh);
            transition: transform .25s ease, opacity .25s ease;
        }
        #md-dock.hide {
            transform: translate(-50%, calc(100% + 28px));
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
            font: 800 12px 'DM Sans', sans-serif !important;
            text-transform: uppercase;
            letter-spacing: .03em;
            cursor: pointer;
            transition: transform .1s, background .15s;
        }
        #md-dock button:hover:not(:disabled) {
            background: var(--yellow) !important;
            transform: translate(1px, 1px);
        }
        #md-dock button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        #md-dock .md-sep {
            width: 2px;
            height: 24px;
            background: var(--bd);
            margin: 0 2px;
        }
        #md-dock .md-zoom {
            min-width: 54px;
            font: 800 12px 'JetBrains Mono', monospace !important;
        }
        #md-dock .md-dl {
            --p: 0%;
            min-width: 86px;
        }
        #md-dock .md-dl[data-state="busy"] {
            background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important;
        }
        #md-dock .md-dl[data-state="done"] {
            background: var(--lime) !important;
        }
        #md-dock .md-dl[data-state="error"] {
            background: var(--pink) !important;
        }
        #md-dock .md-chap {
            max-width: 170px;
            min-width: 0;
            height: 38px;
            padding: 0 8px;
            font: 700 12px 'DM Sans', sans-serif;
            color: var(--ink);
            background: var(--card);
            border: var(--bw) solid var(--bd);
            border-radius: 8px;
            box-shadow: var(--sh-sm);
            cursor: pointer;
        }
        #md-dock [data-act="bg"] svg { transition: transform .25s; }
        html[data-md-bg="dark"] #md-dock [data-act="bg"] svg { transform: rotate(180deg); }
        html[data-md-bg="black"] #md-dock [data-act="bg"] svg { transform: rotate(360deg); }

        /* ===== CHAPTER SELECT BAR (#md-sel-bar) ===== */
        #md-sel-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            margin: 0 0 14px;
            padding: 10px;
            background: var(--card);
            border: var(--bw) solid var(--bd);
            border-radius: 10px;
            box-shadow: var(--sh-sm);
        }
        #md-sel-bar button {
            padding: 6px 12px !important;
            cursor: pointer;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px 'DM Sans', sans-serif !important;
            letter-spacing: .04em;
            text-transform: uppercase;
            transition: transform .1s, background .15s;
        }
        #md-sel-bar button:hover {
            background: var(--yellow) !important;
            transform: translate(1px, 1px);
        }
        #md-sel-bar button[aria-pressed="true"] {
            background: var(--ink-bg) !important;
            color: var(--on-ink) !important;
        }
        #md-sel-bar .md-sel-dl {
            background: var(--lime) !important;
            color: #000000 !important;
        }
        #md-sel-bar .md-sel-dl[data-state="busy"] {
            --p: 0%;
            background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important;
        }
        #md-sel-bar .md-sel-count {
            font: 800 12px 'JetBrains Mono', monospace;
            color: var(--muted);
            padding: 0 4px;
        }
        .md-ck {
            margin-right: 8px !important;
            width: 18px !important;
            height: 18px !important;
            accent-color: #000 !important;
            cursor: pointer !important;
        }

        /* ===== THEME TOGGLE BUTTON (#md-theme) ===== */
        #md-theme {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            width: 60px !important;
            height: 34px !important;
            min-width: 60px !important;
            min-height: 34px !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 999px !important;
            box-shadow: var(--sh-sm) !important;
            cursor: pointer !important;
            position: relative !important;
            overflow: hidden !important;
            transition: transform .1s, box-shadow .1s, background .15s !important;
        }
        #md-theme:hover {
            transform: translate(1px, 1px) !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
        }
        #md-theme .md-th-i {
            display: none !important;
        }
        #md-theme .md-th-sw {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
            background: var(--cream) !important;
        }
        #md-theme .md-th-knob {
            position: absolute !important;
            top: 3px !important;
            left: 3px !important;
            width: 24px !important;
            height: 24px !important;
            box-sizing: border-box !important;
            border-radius: 50% !important;
            background: var(--yellow) !important;
            border: 2px solid var(--bd) !important;
            display: grid !important;
            place-items: center !important;
            transition: transform .25s cubic-bezier(.3, 1.4, .5, 1), background .2s !important;
        }
        #md-theme .md-th-knob > span {
            grid-area: 1 / 1 !important;
            display: grid !important;
            place-items: center !important;
            transition: transform .3s ease, opacity .2s ease !important;
        }
        #md-theme .md-th-knob svg {
            width: 14px !important;
            height: 14px !important;
            display: block !important;
        }
        #md-theme .md-th-sun svg { color: #000000 !important; }
        #md-theme .md-th-moon svg { color: var(--violet) !important; }
        #md-theme .md-th-moon { opacity: 0; transform: rotate(-70deg) scale(.4); }
        html[data-md-theme="dark"] #md-theme .md-th-sw {
            background: #1b1430 !important;
        }
        html[data-md-theme="dark"] #md-theme .md-th-knob {
            transform: translateX(26px) !important;
            background: var(--blue) !important;
        }
        html[data-md-theme="dark"] #md-theme .md-th-moon { opacity: 1; transform: none; }
        html[data-md-theme="dark"] #md-theme .md-th-sun { opacity: 0; transform: rotate(70deg) scale(.4); }

        /* ===== WPDISCUZ COMMENTS (DYNAMIC THEME SWITCHING) ===== */
        /* Fallback: #respond.comments-area, #wpdcom { background: #000000 !important; } */
        /* #wpdcom .wpd-comment { background: #0a0a0a !important; } */
        /* #wpdcom .wpd-reply { background: #141414 !important; } */
        #respond.comments-area,
        #wpdcom {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 16px !important;
            color: var(--ink) !important;
            margin-top: 20px !important;
        }
        #wpdcom .wpd-thread-heading {
            color: var(--ink) !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            border-bottom: 2px solid var(--bd) !important;
        }
        #wpdcom .wpd-comment {
            background: var(--cream) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            margin-bottom: 12px !important;
            padding: 12px !important;
        }
        #wpdcom .wpd-reply,
        #wpdcom .wpd-comment.wpd_comment_level-2,
        #wpdcom .wpd-comment.wpd_comment_level-3 {
            background: var(--card) !important;
            border-left: 3px solid #bf5959 !important;
        }
        #wpdcom .wpd-comment-author,
        #wpdcom .wpd-comment-author a {
            color: #bf5959 !important;
            font-weight: 800 !important;
            font-family: 'DM Sans', sans-serif !important;
        }
        #wpdcom .wpd-comment-text {
            color: var(--ink) !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
        }
        #wpdcom textarea.wc_comment {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            padding: 10px !important;
        }
        #wpdcom input[type="submit"],
        #wpdcom .wc_comm_submit {
            background: var(--yellow) !important;
            color: #ffffff !important;
            border: 2px solid #000000 !important;
            border-radius: 6px !important;
            font-weight: 800 !important;
            cursor: pointer !important;
        }
        #wpdcom img.wmu-attached-image {
            max-width: 100% !important;
            height: auto !important;
            border-radius: 6px !important;
            border: 2px solid var(--bd) !important;
            margin-top: 6px !important;
        }

        /* Dark mode comments */
        html[data-md-theme="dark"] #respond.comments-area,
        html[data-md-theme="dark"] #wpdcom {
            background: #000000 !important;
            color: #ffffff !important;
        }
        html[data-md-theme="dark"] #wpdcom .wpd-thread-heading {
            color: #ffffff !important;
            border-bottom: 2px solid #333333 !important;
        }
        html[data-md-theme="dark"] #wpdcom .wpd-comment {
            background: #0a0a0a !important;
            color: #ffffff !important;
            border-color: #333333 !important;
        }
        html[data-md-theme="dark"] #wpdcom .wpd-reply,
        html[data-md-theme="dark"] #wpdcom .wpd-comment.wpd_comment_level-2,
        html[data-md-theme="dark"] #wpdcom .wpd-comment.wpd_comment_level-3 {
            background: #141414 !important;
            border-left: 3px solid var(--yellow) !important;
        }
        html[data-md-theme="dark"] #wpdcom .wpd-comment-author,
        html[data-md-theme="dark"] #wpdcom .wpd-comment-author a {
            color: var(--yellow) !important;
        }
        html[data-md-theme="dark"] #wpdcom .wpd-comment-text {
            color: #eeeeee !important;
        }
        html[data-md-theme="dark"] #wpdcom textarea.wc_comment {
            background: #111111 !important;
            color: #ffffff !important;
            border: 2px solid #444444 !important;
        }
        html[data-md-theme="dark"] #wpdcom input[type="submit"],
        html[data-md-theme="dark"] #wpdcom .wc_comm_submit {
            background: var(--yellow) !important;
            color: #000000 !important;
        }

        /* ===== SIDEBAR & POPULAR WIDGETS ===== */
        .c-sidebar .widget,
        div.widget-manga-recent {
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 16px !important;
            margin-bottom: 20px !important;
        }
        .c-sidebar .widget-heading,
        .widget-manga-recent h5.heading {
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            font-size: 18px !important;
            color: var(--ink) !important;
            text-transform: uppercase !important;
            margin-bottom: 14px !important;
            border-bottom: 2px solid var(--bd) !important;
            padding-bottom: 6px !important;
        }
        .popular-item-wrap {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 8px 0 !important;
            border-bottom: 1px solid var(--bd) !important;
            height: 100% !important;
        }
        .popular-item-wrap:last-child {
            border-bottom: none !important;
        }
        .popular-img.widget-thumbnail a img {
            aspect-ratio: 2 / 3 !important;
            object-fit: cover !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            width: 55px !important;
            height: auto !important;
        }
        .popular-content h5.widget-title a {
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 800 !important;
            color: var(--ink) !important;
            font-size: 13.5px !important;
            min-height: 2.8em !important;
            max-height: 2.8em !important;
            line-height: 1.4 !important;
            display: -webkit-box !important;
            -webkit-box-orient: vertical !important;
            -webkit-line-clamp: 2 !important;
            overflow: hidden !important;
        }

        /* ===== AJAX LOAD MORE PAGINATION ===== */
        nav.navigation-ajax a.load-ajax {
            display: block !important;
            max-width: 280px !important;
            margin: 24px auto !important;
            padding: 12px 24px !important;
            background: var(--yellow) !important;
            color: #ffffff !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            font-size: 14px !important;
            letter-spacing: 0.05em !important;
            text-transform: uppercase !important;
            text-align: center !important;
            cursor: pointer !important;
            transition: transform .12s ease, box-shadow .12s ease, background .12s ease !important;
        }
        nav.navigation-ajax a.load-ajax:hover {
            background: var(--card) !important;
            color: var(--ink) !important;
            transform: translate(-2px, -2px) !important;
            box-shadow: var(--sh-hover) !important;
        }
        html[data-md-theme="dark"] nav.navigation-ajax a.load-ajax {
            color: #000000 !important;
        }

        /* ===== MOBILE MENU OFF-CANVAS ===== */
        .mobile-menu.off-canvas {
            background: var(--card) !important;
            border-right: var(--bw) solid var(--bd) !important;
            color: var(--ink) !important;
        }
        .mobile-menu.off-canvas a {
            color: var(--ink) !important;
        }
        .mobile-menu.off-canvas .close-nav button {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
        }

        /* ===== BACK TO TOP & TOAST NOTIFICATION ===== */
        #md-top {
            position: fixed;
            z-index: 95;
            right: 28px;
            bottom: 28px;
            width: 46px;
            height: 46px;
            padding: 0;
            background: var(--yellow) !important;
            color: #ffffff !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 999px !important;
            box-shadow: var(--sh) !important;
            font: 900 20px/1 system-ui, sans-serif !important;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transform: translateY(10px);
            transition: opacity .18s ease, transform .18s ease, background .1s, box-shadow .1s;
        }
        #md-top.show {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }
        #md-top:hover {
            background: var(--card) !important;
            color: var(--ink) !important;
            transform: translate(-1px, -1px);
            box-shadow: var(--sh-hover) !important;
        }
        html[data-md-theme="dark"] #md-top {
            color: #000000 !important;
        }

        #md-toast {
            position: fixed;
            left: 50%;
            bottom: 84px;
            z-index: 130;
            transform: translateX(-50%);
            max-width: calc(100vw - 24px);
            padding: 8px 14px;
            background: var(--ink-bg);
            color: var(--on-ink);
            border-radius: 8px;
            box-shadow: var(--sh-sm);
            font: 700 13px 'DM Sans', sans-serif;
            opacity: 0;
            pointer-events: none;
            transition: opacity .2s;
        }
        #md-toast.show { opacity: 1; }

        /* ===== NETFLIX-STYLE HERO CAROUSEL (#md-hero) ===== */
        #md-hero {
            position: relative;
            width: var(--col, min(1200px, 94vw));
            margin: 18px auto 20px;
            min-height: clamp(380px, 38vw, 500px);
            display: flex;
            align-items: center;
            justify-content: space-between;
            overflow: hidden;
            border: var(--bw) solid var(--bd);
            border-radius: var(--r);
            box-shadow: var(--sh);
            background: #ffffff;
            box-sizing: border-box;
            padding: clamp(24px, 4vw, 44px);
            gap: 24px;
        }
        #md-hero .md-hero-bg {
            position: absolute;
            inset: -20px;
            background-size: cover;
            background-position: center 25%;
            filter: blur(22px) saturate(1.7) brightness(0.78);
            opacity: 0.88;
            transform: scale(1.08);
            pointer-events: none;
            transition: opacity .35s ease;
        }
        #md-hero::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(to top, rgba(255,255,255,.65) 0%, rgba(255,255,255,.1) 50%, transparent 100%),
                        linear-gradient(to right, rgba(255,255,255,.78) 0%, rgba(255,255,255,.18) 55%, transparent 100%);
            pointer-events: none;
        }
        #md-hero .md-hero-body {
            position: relative !important;
            z-index: 2 !important;
            max-width: min(580px, calc(100% - 470px)) !important;
            color: var(--ink, #111) !important;
            flex: 1 1 auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-end !important;
            min-height: 320px !important;
        }
        #md-hero .md-hero-tag {
            display: inline-block !important;
            align-self: flex-start !important;
            padding: 4px 12px !important;
            margin-bottom: 12px !important;
            background: linear-gradient(to right, #bf5959 20%, #d39d6d) !important;
            color: #ffffff !important;
            border: 2px solid #000 !important;
            border-radius: 7px !important;
            font: 800 11px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            letter-spacing: .08em !important;
            box-shadow: 3px 3px 0 #000 !important;
        }
        #md-hero .md-hero-title {
            margin: 0 0 10px !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            color: var(--ink, #111) !important;
            font: 900 clamp(20px, 3.2vw, 36px)/1.2 'DM Sans', sans-serif !important;
            text-transform: none !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            min-height: 2.4em !important;
            max-height: 2.4em !important;
            transition: opacity .25s ease, transform .25s ease !important;
        }
        #md-hero .md-hero-meta {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin: 0 0 16px !important;
            min-height: 26px !important;
            font: 700 12px/1 'JetBrains Mono', monospace !important;
            color: var(--ink, #111) !important;
        }
        #md-hero .md-hero-views {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            padding: 4px 10px !important;
            background: rgba(255, 255, 255, 0.85) !important;
            border: 1.5px solid rgba(0, 0, 0, 0.25) !important;
            border-radius: 999px !important;
            color: #000 !important;
            font-size: 11.5px !important;
            box-shadow: 1.5px 1.5px 0 rgba(0,0,0,0.12) !important;
            backdrop-filter: blur(6px) !important;
        }
        #md-hero .md-hero-views svg {
            flex-shrink: 0 !important;
            display: inline-block !important;
        }
        #md-hero .md-hero-chapter {
            display: inline-flex !important;
            align-items: center !important;
            padding: 4px 10px !important;
            background: linear-gradient(to right, #bf5959 20%, #d39d6d) !important;
            color: #ffffff !important;
            border: 1.5px solid #000 !important;
            border-radius: 999px !important;
            font-size: 11.5px !important;
            font-weight: 800 !important;
            box-shadow: 1.5px 1.5px 0 #000 !important;
        }
        #md-hero .md-hero-cta {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            flex-wrap: wrap !important;
            margin-bottom: 22px !important;
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
            border: var(--bw) solid #000 !important;
            border-radius: var(--r) !important;
            box-shadow: 3px 3px 0 #000 !important;
            font: 900 14px/1 'DM Sans', sans-serif !important;
            text-transform: uppercase !important;
            text-decoration: none !important;
            cursor: pointer !important;
            position: relative !important;
            z-index: 5 !important;
            transition: transform .15s ease, box-shadow .15s ease !important;
        }
        #md-hero .md-hero-play {
            background: linear-gradient(to right, #bf5959 20%, #d39d6d) !important;
            color: #ffffff !important;
        }
        #md-hero .md-hero-more {
            background: #fff !important;
            color: #000 !important;
        }
        #md-hero .md-hero-btn:hover {
            transform: translate(-2px, -2px) !important;
            box-shadow: 5px 5px 0 #000 !important;
        }

        /* Series thumbnail carousel below buttons with falling progress bar */
        #md-hero .md-hero-thumbs {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 0 0 -18px !important;
            padding: 4px 28px 8px 24px !important; /* left padding holds the 20px edge fade, so the first thumb is never masked */
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
            min-width: 46px !important;
            max-width: 46px !important;
            height: 68px !important;
            min-height: 68px !important;
            max-height: 68px !important;
            aspect-ratio: 2 / 3 !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            outline: none !important;
            border: 2px solid #000 !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            cursor: pointer !important;
            background: #111 !important;
            box-shadow: 2px 2px 0 #000 !important;
            opacity: 0.65 !important;
            transition: transform .2s ease, opacity .2s ease, border-color .2s ease, box-shadow .2s ease !important;
        }
        #md-hero .md-hero-thumb:hover {
            opacity: 0.95 !important;
            transform: translateY(-2px) !important;
            box-shadow: 3px 3px 0 #000 !important;
        }
        #md-hero .md-hero-thumb.is-active {
            opacity: 1 !important;
            border-color: #bf5959 !important;
            transform: translateY(-3px) scale(1.05) !important;
            box-shadow: 0 0 0 2px #bf5959, 3px 3px 0 #000 !important;
        }
        #md-hero .md-hero-thumb img {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            pointer-events: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        #md-hero .md-thumb-fill {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: 0%;
            background: linear-gradient(to bottom, rgba(191, 89, 89, 0.5) 0%, rgba(211, 157, 109, 0.22) 100%) !important;
            border-bottom: 2.5px solid #bf5959 !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5) !important;
            pointer-events: none !important;
            z-index: 2 !important;
            opacity: 0;
            transition: opacity .15s ease;
        }
        #md-hero .md-hero-thumb.is-active .md-thumb-fill {
            opacity: 1 !important;
            animation: mdProgressFall 5.5s linear forwards;
        }
        @keyframes mdProgressFall {
            0% { height: 0%; }
            100% { height: 100%; }
        }

        /* Tilted book card on the right, scaled up and clipped under the hero bottom edge.
           .md-hero-card is a STATIC hit box that is never transformed. The tilt and the hover lift live on
           the inner .md-hero-card-art, so moving the art on hover can't move the thing the pointer is
           testing (that feedback loop made the hover flicker at the card's edge). The art also clips its
           image (overflow hidden + radius), so the cover is rounded like its border. */
        #md-hero .md-hero-card {
            --mdc-w: 320px;
            position: absolute;
            z-index: 3;
            right: 150px;
            bottom: -75px;
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
            border: var(--bw) solid #000;
            border-radius: 14px;
            overflow: hidden;
            background: #111;
            box-shadow: 10px 10px 0 #000;
            transform: rotate(6.5deg);
            transform-origin: bottom center;
            transition: transform .22s ease-out, box-shadow .22s ease;
            pointer-events: none;
        }
        #md-hero .md-hero-card:hover .md-hero-card-art {
            transform: rotate(5deg) translateY(-6px) scale(1.01);
            box-shadow: 14px 14px 0 #000;
        }
        /* static bridge: keeps the tilted art that pokes out past the right/top of the hit box clickable */
        #md-hero .md-hero-card::after {
            content: "";
            position: absolute;
            inset: -16px -64px -16px -16px;
            z-index: 10;
        }
        #md-hero .md-hero-card img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            border-radius: 0;
            transition: opacity .25s ease;
        }

        @media (max-width: 1240px) {
            #md-hero .md-hero-card {
                right: clamp(24px, 5vw, 100px);
                --mdc-w: clamp(240px, 24vw, 300px);
                bottom: -65px;
            }
            #md-hero .md-hero-body { max-width: min(560px, 56%); }
        }
        @media (max-width: 768px) {
            #md-hero {
                width: calc(100% - 20px) !important;
                margin: 12px auto 16px !important;
                padding: 16px 14px 14px !important;
                min-height: clamp(340px, 88vw, 400px) !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                justify-content: flex-start !important;
                gap: 10px !important;
            }
            #md-hero .md-hero-body {
                flex: 1 1 auto !important;
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                max-width: 100% !important;
                min-height: 0 !important;
                height: 100% !important;
                justify-content: flex-start !important;
            }
            #md-hero .md-hero-card {
                --mdc-w: clamp(120px, 38vw, 175px);
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: absolute !important;
                top: auto !important;
                bottom: -40px !important;
                right: clamp(22px, 6vw, 32px) !important;
                width: var(--mdc-w) !important;
                height: calc(var(--mdc-w) * 1.5) !important;
                z-index: 3 !important;
                pointer-events: auto !important;
            }
            #md-hero .md-hero-card-art {
                border-radius: 12px !important;
                box-shadow: 6px 6px 0 #000 !important;
                transform: rotate(3.5deg) !important;
            }
            #md-hero .md-hero-card:hover .md-hero-card-art {
                transform: rotate(2.5deg) translateY(-4px) scale(1.01) !important;
                box-shadow: 8px 8px 0 #000 !important;
            }
            #md-hero .md-hero-tag {
                display: inline-block !important;
                align-self: flex-start !important;
                padding: 4px 12px !important;
                font-size: 10.5px !important;
                margin-bottom: clamp(10px, 2.5vw, 15px) !important;
            }
            #md-hero .md-hero-title {
                font-size: clamp(20px, 6vw, 26px) !important;
                font-weight: 900 !important;
                line-height: 1.2 !important;
                letter-spacing: -0.01em !important;
                width: 100% !important;
                max-width: calc(100% - 10px) !important;
                min-height: 2.4em !important;
                max-height: 2.4em !important;
                margin-bottom: clamp(10px, 2.5vw, 16px) !important;
                position: relative !important;
                z-index: 4 !important;
                text-shadow: 0 1px 3px rgba(255,255,255,0.85);
            }
            #md-hero .md-hero-meta {
                display: flex !important;
                flex-wrap: nowrap !important;
                gap: 7px !important;
                margin-bottom: clamp(12px, 3vw, 18px) !important;
                max-width: calc(100% - clamp(155px, 44vw, 200px)) !important;
            }
            #md-hero .md-hero-views, #md-hero .md-hero-chapter {
                white-space: nowrap !important;
                font-size: 10.5px !important;
                font-weight: 800 !important;
                padding: 4px 9px !important;
            }
            #md-hero .md-hero-cta {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 8px !important;
                max-width: calc(100% - clamp(155px, 44vw, 200px)) !important;
                margin-bottom: clamp(16px, 4vw, 24px) !important;
            }
            #md-hero .md-hero-btn {
                white-space: nowrap !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                min-width: 130px !important;
                max-width: 175px !important;
                min-height: 40px !important;
                padding: 10px 18px !important;
                font-size: 12.5px !important;
                font-weight: 900 !important;
                box-shadow: 2.5px 2.5px 0 #000 !important;
            }
            #md-hero .md-hero-thumbs {
                margin-top: auto !important;
                margin-bottom: 0 !important;
                margin-left: -20px !important;
                width: calc(100% + 20px) !important;
                max-width: calc(100% - clamp(155px, 44vw, 200px) + 20px) !important;
                gap: 7px !important;
                padding: 4px 24px 2px 20px !important;
                mask-image: linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 20px), transparent 100%) !important;
                -webkit-mask-image: linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 20px), transparent 100%) !important;
            }
            #md-hero .md-hero-thumb {
                flex: 0 0 38px !important;
                width: 38px !important;
                min-width: 38px !important;
                max-width: 38px !important;
                height: 56px !important;
                min-height: 56px !important;
                max-height: 56px !important;
            }
        }

        /* Dark mode hero styles */
        html[data-md-theme="dark"] #md-hero {
            background: #0b0813 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-bg {
            filter: blur(16px) brightness(0.32) saturate(1.2) !important;
            opacity: 1 !important;
        }
        html[data-md-theme="dark"] #md-hero::after {
            background: linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,.2) 60%, transparent 100%),
                        linear-gradient(to right, rgba(0,0,0,.85) 0%, rgba(0,0,0,.4) 55%, transparent 100%) !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-body {
            color: #fff !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-title {
            color: #fff !important;
            text-shadow: 2px 2px 0 #000 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-meta {
            color: #fff !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-views {
            background: rgba(0, 0, 0, 0.55) !important;
            border-color: rgba(255, 255, 255, 0.35) !important;
            color: #fff !important;
            box-shadow: none !important;
        }
        html[data-md-theme="dark"] #md-hero .md-thumb-fill {
            background: linear-gradient(to bottom, rgba(193, 176, 255, 0.5) 0%, rgba(124, 92, 255, 0.2) 100%) !important;
            border-bottom-color: var(--violet) !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-thumb.is-active {
            border-color: var(--violet) !important;
            box-shadow: 0 0 0 2px var(--violet), 3px 3px 0 #000 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-play {
            background: var(--yellow) !important;
            color: #000 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-more {
            background: #fff !important;
            color: #000 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-tag {
            background: var(--yellow) !important;
            color: #000 !important;
        }
        html[data-md-theme="dark"] #md-hero .md-hero-chapter {
            background: var(--yellow) !important;
            color: #000 !important;
        }

        /* =====================================================================
           SERIES / OVERVIEW PAGE REFRESH
           Scoped to html[data-md-page="overview"]: out-ranks the site's own CSS and the generic rules above,
           and never touches the home, list or reader pages.
           ===================================================================== */

        /* -- clearfix / decorative pseudo-elements would turn into stray flex / grid items -- */
        html[data-md-page="overview"] div.tab-summary::before,
        html[data-md-page="overview"] div.tab-summary::after,
        html[data-md-page="overview"] div.summary_content_wrap::before,
        html[data-md-page="overview"] div.summary_content_wrap::after,
        html[data-md-page="overview"] div.summary_content::before,
        html[data-md-page="overview"] div.summary_content::after,
        html[data-md-page="overview"] div.summary_content .post-content_item::before,
        html[data-md-page="overview"] div.summary_content .post-content_item::after,
        html[data-md-page="overview"] div.summary_image a::before,
        html[data-md-page="overview"] div.summary_image a::after,
        html[data-md-page="overview"] .manga-action::before,
        html[data-md-page="overview"] .manga-action::after,
        html[data-md-page="overview"] .c-blog__heading::before,
        html[data-md-page="overview"] .c-blog__heading::after,
        html[data-md-page="overview"] .listing-chapters_wrap::before,
        html[data-md-page="overview"] .listing-chapters_wrap::after,
        html[data-md-page="overview"] .description-summary .summary__content::after,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter::before,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter::after,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter a::before,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter a::after,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter .chapter-release-date::before,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter .chapter-release-date::after,
        html[data-md-page="overview"] .c-sidebar .widget-heading::before,
        html[data-md-page="overview"] .c-sidebar .widget-heading::after,
        html[data-md-page="overview"] .c-sidebar .widget .c-blog__heading::after,
        html[data-md-page="overview"] .popular-item-wrap::before,
        html[data-md-page="overview"] .popular-item-wrap::after,
        html[data-md-page="overview"] .popular-content .chapter-item::before,
        html[data-md-page="overview"] .popular-content .chapter-item::after {
            content: none !important;
            display: none !important;
        }

        /* -- breadcrumb: one light pill, not a full-width framed bar -- */
        html[data-md-page="overview"] ol.breadcrumb {
            display: inline-flex !important;
            width: auto !important;
            max-width: 100% !important;
            margin: 0 0 18px !important;
            padding: 6px 14px !important;
            border-width: 2px !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
        }

        /* -- header band: flat full-width strip, content on a clean 2-column grid -- */
        html[data-md-page="overview"] div.profile-manga {
            background: var(--card) !important;
            background-image: none !important;
            border-width: var(--bw) 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 12px 0 30px !important;
            padding: 26px 0 30px !important;
            min-height: 0 !important;
            height: auto !important;
        }
        html[data-md-page="overview"] div.profile-manga::before,
        html[data-md-page="overview"] div.profile-manga::after {
            content: none !important;
            display: none !important;
        }
        html[data-md-page="overview"] div.profile-manga .post-title h1 {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            margin: 0 0 22px !important;
            font-size: clamp(24px, 3.4vw, 36px) !important;
            line-height: 1.15 !important;
            letter-spacing: -0.01em !important;
        }
        html[data-md-page="overview"] div.profile-manga .post-title h1 .manga-title-badges {
            position: static !important;
            flex: 0 0 auto !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] div.tab-summary {
            display: grid !important;
            grid-template-columns: minmax(170px, 250px) minmax(0, 1fr) !important;
            gap: 14px 34px !important;
            align-items: start !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_image {
            float: none !important;
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            height: auto !important;
        }
        html[data-md-page="overview"] div.summary_image a {
            display: block !important;
            float: none !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            line-height: 0 !important;
        }
        html[data-md-page="overview"] div.summary_image a img {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            aspect-ratio: 2 / 3 !important;
            object-fit: cover !important;
            margin: 0 !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            background: var(--soft) !important;
        }
        html[data-md-page="overview"] div.summary_content_wrap {
            float: none !important;
            width: auto !important;
            max-width: none !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: flex-start !important;
            align-content: flex-start !important;
            gap: 16px 30px !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content > .post-content {
            float: none !important;
            flex: 2 1 340px !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content > .post-status {
            float: none !important;
            flex: 1 1 230px !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 6px 16px !important;
            background: var(--soft) !important;
            border: 2px solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh-sm) !important;
        }
        html[data-md-page="overview"] div.summary_content > .manga-action,
        html[data-md-page="overview"] div.summary_content > #init-links,
        html[data-md-page="overview"] div.summary_content > .nav-links {
            float: none !important;
            flex: 1 1 100% !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content .post-rating {
            float: none !important;
            margin: 0 0 8px !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content .post-content_item {
            display: grid !important;
            grid-template-columns: 108px minmax(0, 1fr) !important;
            gap: 4px 12px !important;
            align-items: center !important;
            float: none !important;
            width: auto !important;
            margin: 0 !important;
            padding: 9px 0 !important;
            border-bottom: 2px dotted rgba(128, 128, 128, 0.35) !important;
            overflow: visible !important;
        }
        html[data-md-page="overview"] div.summary_content .post-content_item:last-child {
            border-bottom: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content > .post-status .post-content_item {
            grid-template-columns: 74px minmax(0, 1fr) !important;
        }
        html[data-md-page="overview"] div.summary_content .post-content_item .summary-heading,
        html[data-md-page="overview"] div.summary_content .post-content_item .summary-content {
            float: none !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] div.summary_content .post-content_item .summary-heading h5 {
            margin: 0 !important;
            letter-spacing: 0.08em !important;
            line-height: 1.2 !important;
        }
        html[data-md-page="overview"] div.summary_content .post-content_item .summary-content {
            color: var(--ink) !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            line-height: 1.35 !important;
        }
        /* tag lists: pills only, no stray commas */
        html[data-md-page="overview"] .genres-content,
        html[data-md-page="overview"] .author-content,
        html[data-md-page="overview"] .artist-content {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 0 !important;
        }
        html[data-md-page="overview"] .genres-content a,
        html[data-md-page="overview"] .author-content a,
        html[data-md-page="overview"] .artist-content a {
            margin: 0 !important;
            font-size: 11px !important;
        }
        /* comments + bookmark + read buttons: one tidy row */
        html[data-md-page="overview"] .manga-action {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: stretch !important;
            gap: 12px !important;
        }
        html[data-md-page="overview"] .manga-action .count-comment,
        html[data-md-page="overview"] .manga-action .add-bookmark {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            float: none !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] .manga-action .add-bookmark {
            padding: 8px 14px !important;
        }
        html[data-md-page="overview"] div.summary_content #init-links {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
        }
        html[data-md-page="overview"] div.summary_content #init-links a,
        html[data-md-page="overview"] #btn-read-first,
        html[data-md-page="overview"] #btn-read-last {
            margin: 0 !important;
        }

        /* -- section headings: icon tile + title, no leftover decoration -- */
        html[data-md-page="overview"] .c-blog__heading {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
            margin: 30px 0 14px !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        html[data-md-page="overview"] .c-blog__heading h1,
        html[data-md-page="overview"] .c-blog__heading h2,
        html[data-md-page="overview"] .c-blog__heading h3,
        html[data-md-page="overview"] .c-blog__heading h4,
        html[data-md-page="overview"] .c-blog__heading h5 {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            font-size: 20px !important;
            letter-spacing: 0.02em !important;
            text-transform: uppercase !important;
            color: var(--ink) !important;
        }
        html[data-md-page="overview"] .c-blog__heading h1 i,
        html[data-md-page="overview"] .c-blog__heading h2 i,
        html[data-md-page="overview"] .c-blog__heading h3 i,
        html[data-md-page="overview"] .c-blog__heading h4 i,
        html[data-md-page="overview"] .c-blog__heading h5 i {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
            width: 34px !important;
            height: 34px !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 16px !important;
            line-height: 1 !important;
            background: var(--primary) !important;
            color: #ffffff !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html[data-md-page="overview"] .c-blog__heading h1 i::before,
        html[data-md-page="overview"] .c-blog__heading h2 i::before,
        html[data-md-page="overview"] .c-blog__heading h3 i::before,
        html[data-md-page="overview"] .c-blog__heading h4 i::before,
        html[data-md-page="overview"] .c-blog__heading h5 i::before {
            background: none !important;
            color: #ffffff !important;
            line-height: 1 !important;
        }
        html[data-md-page="overview"] .c-blog__heading h1 i::after,
        html[data-md-page="overview"] .c-blog__heading h2 i::after,
        html[data-md-page="overview"] .c-blog__heading h3 i::after,
        html[data-md-page="overview"] .c-blog__heading h4 i::after,
        html[data-md-page="overview"] .c-blog__heading h5 i::after {
            display: none !important;
            content: none !important;
        }

        /* -- summary: a readable card -- */
        html[data-md-page="overview"] .description-summary {
            position: relative !important;
            background: var(--card) !important;
            border: 2px solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh-sm) !important;
            padding: 18px 22px 16px !important;
            margin: 0 0 8px !important;
        }
        html[data-md-page="overview"] .description-summary .summary__content {
            max-width: 78ch !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] .description-summary .summary__content p {
            text-align: left !important;
            margin: 0 0 0.85em !important;
            line-height: 1.7 !important;
        }
        html[data-md-page="overview"] .description-summary .summary__content p:first-child {
            font-weight: 800 !important;
        }
        html[data-md-page="overview"] .description-summary .c-content-readmore,
        html[data-md-page="overview"] .description-summary .c-chapter-readmore {
            display: flex !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 22px 0 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            background: linear-gradient(to bottom, transparent, var(--card) 70%) !important;
        }
        html[data-md-page="overview"] .description-summary .btn.btn-link.content-readmore {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            margin: 0 !important;
            text-decoration: none !important;
        }

        /* -- chapter list: compact single-line rows in a scroll box, no leader line, no fade-cut -- */
        html[data-md-page="overview"] a.btn-reverse-order,
        html[data-md-page="overview"] .c-blog__heading .btn-reverse-order {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: auto !important;
            height: auto !important;
            min-width: 0 !important;
            margin: 0 0 0 auto !important;
            padding: 6px 10px !important;
            line-height: 1 !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order i,
        html[data-md-page="overview"] .c-blog__heading .btn-reverse-order i {
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            color: var(--ink) !important;
            font-size: 17px !important;
            line-height: 1 !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order i::before {
            background: none !important;
            color: var(--ink) !important;
        }
        html[data-md-page="overview"] #md-sel-bar {
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 0 12px !important;
        }
        html[data-md-page="overview"] .page-content-listing.single-page,
        html[data-md-page="overview"] div.listing-chapters_wrap,
        html[data-md-page="overview"] div.listing-chapters_wrap.show-more {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] ul.main.version-chap {
            max-height: min(62vh, 580px) !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            margin: 0 0 8px !important;
            padding: 2px 10px 6px 2px !important;
            scrollbar-width: thin !important;
            scrollbar-color: var(--bd) transparent !important;
            overscroll-behavior: contain !important;
        }
        html[data-md-page="overview"] ul.main.version-chap::-webkit-scrollbar {
            width: 10px !important;
        }
        html[data-md-page="overview"] ul.main.version-chap::-webkit-scrollbar-track {
            background: var(--soft) !important;
            border-radius: 6px !important;
        }
        html[data-md-page="overview"] ul.main.version-chap::-webkit-scrollbar-thumb {
            background: var(--bd) !important;
            border-radius: 6px !important;
            border: 2px solid var(--soft) !important;
        }
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 14px !important;
            float: none !important;
            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 0 8px !important;
            padding: 10px 14px !important;
            line-height: 1.3 !important;
            background: var(--card) !important;
            background-image: none !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .1s ease, box-shadow .1s ease, background .12s ease !important;
        }
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: 3px 3px 0 var(--bd) !important;
        }
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter a {
            display: block !important;
            flex: 1 1 auto !important;
            float: none !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 800 !important;
            font-size: 14px !important;
            line-height: 1.3 !important;
            text-decoration: none !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter .chapter-release-date,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter span.chapter-release-date i {
            position: static !important;
            float: none !important;
            flex: 0 0 auto !important;
            margin: 0 !important;
            padding: 0 !important;
            white-space: nowrap !important;
            line-height: 1.3 !important;
        }

        /* -- comments: one frame, readable cards -- */
        html[data-md-page="overview"] #respond.comments-area {
            padding: 20px 22px 8px !important;
            margin-top: 30px !important;
            background: var(--card) !important;
        }
        html[data-md-page="overview"] #respond.comments-area #wpdcom,
        html[data-md-page="overview"] .comments-area #wpdcom {
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-form,
        html[data-md-page="overview"] #wpdcom .wpd-form-wrap,
        html[data-md-page="overview"] #wpdcom .wpd-main-form-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-thread-head {
            margin: 0 0 16px !important;
            padding: 0 !important;
            border-bottom: 3px solid var(--bd) !important;
            background: none !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-thread-info {
            display: inline-block !important;
            margin: 0 !important;
            padding: 0 0 10px !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 900 !important;
            font-size: 15px !important;
            letter-spacing: 0.06em !important;
            color: var(--ink) !important;
            border-bottom: 5px solid var(--primary) !important;
            margin-bottom: -3px !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment {
            background: var(--cream) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
            margin: 0 0 14px !important;
            padding: 14px 16px !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment .wpd-comment {
            box-shadow: none !important;
            margin: 12px 0 0 !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment-wrap {
            padding: 0 !important;
            margin: 0 !important;
            background: none !important;
            border: 0 !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-avatar img,
        html[data-md-page="overview"] #wpdcom img.avatar {
            width: 44px !important;
            height: 44px !important;
            border: 2px solid var(--bd) !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            box-shadow: none !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment-date {
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 11px !important;
            color: var(--muted) !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment-text {
            margin: 6px 0 8px !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-comment-footer,
        html[data-md-page="overview"] #wpdcom .wpd-comment-footer .wpd-vote,
        html[data-md-page="overview"] #wpdcom .wpd-toggle {
            color: var(--muted) !important;
            font-size: 12px !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-toggle,
        html[data-md-page="overview"] #wpdcom .wpd-toggle-parent {
            font-weight: 700 !important;
        }
        html[data-md-page="overview"] #wpdcom .wpd-vote-up,
        html[data-md-page="overview"] #wpdcom .wpd-vote-down,
        html[data-md-page="overview"] #wpdcom .wpd-vote-result {
            color: var(--muted) !important;
        }

        /* -- sidebar: single frame, tidy rows -- */
        html[data-md-page="overview"] .c-sidebar .widget .widget-manga-recent,
        html[data-md-page="overview"] .c-sidebar .widget .widget-content,
        html[data-md-page="overview"] .c-sidebar .widget .c-widget-wrap {
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] .c-sidebar .widget {
            padding: 18px 18px 16px !important;
        }
        html[data-md-page="overview"] .c-sidebar .widget-heading,
        html[data-md-page="overview"] .widget-manga-recent h5.heading {
            margin: 0 0 6px !important;
            padding: 0 0 10px !important;
            font-size: 17px !important;
            letter-spacing: 0.04em !important;
            border-bottom: 3px solid var(--bd) !important;
            background: none !important;
        }
        html[data-md-page="overview"] .popular-item-wrap {
            display: grid !important;
            grid-template-columns: 56px minmax(0, 1fr) !important;
            gap: 4px 12px !important;
            align-items: start !important;
            height: auto !important;
            padding: 12px 0 !important;
            margin: 0 !important;
            border-bottom: 2px dotted rgba(128, 128, 128, 0.4) !important;
        }
        html[data-md-page="overview"] .popular-item-wrap:last-child {
            border-bottom: 0 !important;
        }
        html[data-md-page="overview"] .popular-item-wrap .popular-img,
        html[data-md-page="overview"] .popular-item-wrap .popular-content {
            float: none !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            min-width: 0 !important;
        }
        html[data-md-page="overview"] .popular-img.widget-thumbnail a img {
            display: block !important;
            width: 56px !important;
            height: auto !important;
        }
        html[data-md-page="overview"] .popular-content h5.widget-title {
            margin: 0 0 4px !important;
        }
        html[data-md-page="overview"] .popular-content h5.widget-title a {
            min-height: 0 !important;
            max-height: 2.8em !important;
            font-size: 13px !important;
            text-decoration: none !important;
        }
        html[data-md-page="overview"] .popular-content .list-chapter {
            margin: 0 !important;
            padding: 0 !important;
        }
        html[data-md-page="overview"] .popular-content .chapter-item {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 4px 8px !important;
            margin: 5px 0 0 !important;
            padding: 0 !important;
            border: 0 !important;
            float: none !important;
            width: auto !important;
        }
        html[data-md-page="overview"] .popular-content .chapter-item .chapter,
        html[data-md-page="overview"] .popular-content .chapter-item span.chapter {
            display: inline-flex !important;
            float: none !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        html[data-md-page="overview"] .popular-content .chapter-item .chapter a {
            display: inline-block !important;
            padding: 2px 8px !important;
            background: var(--cream) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
            font: 700 11px 'JetBrains Mono', monospace !important;
            text-decoration: none !important;
            white-space: nowrap !important;
        }
        html[data-md-page="overview"] .popular-content .chapter-item .post-on,
        html[data-md-page="overview"] .popular-content .chapter-item .post-on i {
            float: none !important;
            margin: 0 !important;
            padding: 0 !important;
            font: 600 11px 'JetBrains Mono', monospace !important;
            font-style: normal !important;
            color: var(--muted) !important;
            white-space: nowrap !important;
        }
        html[data-md-page="overview"] .c-sidebar .widget-view-more,
        html[data-md-page="overview"] .c-sidebar .widget-view-more a {
            display: block !important;
            text-align: center !important;
            text-decoration: none !important;
        }
        html[data-md-page="overview"] .c-sidebar .widget-view-more {
            margin-top: 12px !important;
        }

        html[data-md-page="overview"] a.btn-reverse-order i::before,
        html[data-md-page="overview"] a.btn-reverse-order i::after,
        html[data-md-page="overview"] a.btn-reverse-order::before,
        html[data-md-page="overview"] a.btn-reverse-order::after {
            border: 0 !important;
            width: auto !important;
            height: auto !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order i::after {
            content: none !important;
            display: none !important;
        }
        html[data-md-page="overview"] .manga-action .add-bookmark a,
        html[data-md-page="overview"] .manga-action .btn-bookmark {
            border: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            color: inherit !important;
        }

        /* -- small screens -- */
        @media (max-width: 760px) {
            html[data-md-page="overview"] div.profile-manga {
                padding: 18px 0 22px !important;
            }
            html[data-md-page="overview"] div.tab-summary {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 20px !important;
                justify-items: stretch !important;
            }
            html[data-md-page="overview"] div.summary_image {
                width: min(56%, 220px) !important;
                margin: 0 auto !important;
            }
            html[data-md-page="overview"] div.summary_content > .post-content,
            html[data-md-page="overview"] div.summary_content > .post-status {
                flex: 1 1 100% !important;
            }
            html[data-md-page="overview"] div.summary_content .post-content_item {
                grid-template-columns: 92px minmax(0, 1fr) !important;
            }
            html[data-md-page="overview"] .description-summary {
                padding: 14px 16px 12px !important;
            }
            html[data-md-page="overview"] ul.main.version-chap {
                max-height: min(58vh, 480px) !important;
            }
            html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter {
                padding: 9px 12px !important;
                gap: 10px !important;
            }
            html[data-md-page="overview"] #respond.comments-area {
                padding: 16px 14px 6px !important;
            }
        }

        /* =====================================================================
           ROUND 2 FIXES
           ===================================================================== */

        /* -- chapter rows on the series page: hover keeps text readable in both themes -- */
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover {
            background: var(--yellow) !important;
        }
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover a,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover .chapter-release-date,
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover .chapter-release-date i,
        html[data-md-theme="dark"][data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter:hover a {
            color: #000000 !important;
            opacity: 1 !important;
            visibility: visible !important;
        }
        /* long titles: ellipsis on the title only, the date never shrinks */
        html[data-md-page="overview"] ul.main.version-chap li.wp-manga-chapter a {
            max-width: 100% !important;
        }

        /* -- reverse-order button: one clean square with a single glyph -- */
        html[data-md-page="overview"] a.btn-reverse-order,
        html[data-md-page="overview"] .c-blog__heading .btn-reverse-order {
            position: relative !important;
            flex: 0 0 auto !important;
            width: 40px !important;
            height: 40px !important;
            padding: 0 !important;
            font-size: 0 !important;
            line-height: 0 !important;
            background: var(--card) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            transition: transform .1s ease, box-shadow .1s ease, background .12s ease !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order > *,
        html[data-md-page="overview"] a.btn-reverse-order i {
            display: none !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order::before {
            content: "\\21C5" !important;
            display: flex !important;
            position: absolute !important;
            inset: 0 !important;
            width: auto !important;
            height: auto !important;
            align-items: center !important;
            justify-content: center !important;
            font: 900 22px/1 'DM Sans', sans-serif !important;
            color: var(--ink) !important;
            border: 0 !important;
            background: none !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order::after {
            content: none !important;
            display: none !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order:hover {
            background: var(--yellow) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: 3px 3px 0 var(--bd) !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order:hover::before {
            color: #000 !important;
        }
        html[data-md-page="overview"] a.btn-reverse-order:active {
            transform: translate(1px, 1px) !important;
            box-shadow: 0 0 0 var(--bd) !important;
        }

        /* -- status / comments / bookmark: one tidy stacked list -- */
        html[data-md-page="overview"] .manga-action {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            width: 100% !important;
            margin: 10px 0 8px !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        html[data-md-page="overview"] .manga-action .count-comment,
        html[data-md-page="overview"] .manga-action .add-bookmark {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            float: none !important;
            margin: 0 !important;
            padding: 9px 14px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-family: 'DM Sans', sans-serif !important;
            font-weight: 800 !important;
            font-size: 13px !important;
            line-height: 1.25 !important;
            text-align: left !important;
            transition: transform .1s ease, box-shadow .1s ease, background .12s ease !important;
        }
        html[data-md-page="overview"] .manga-action .add-bookmark:hover,
        html[data-md-page="overview"] .manga-action .count-comment:hover {
            background: var(--yellow) !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: 3px 3px 0 var(--bd) !important;
        }
        html[data-md-page="overview"] .manga-action .add-bookmark:hover *,
        html[data-md-page="overview"] .manga-action .count-comment:hover * {
            color: #000 !important;
        }
        html[data-md-page="overview"] .manga-action .action_icon,
        html[data-md-page="overview"] .manga-action .action_icon a {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
            width: 30px !important;
            height: 30px !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            color: var(--primary) !important;
        }
        html[data-md-page="overview"] .manga-action .action_icon i,
        html[data-md-page="overview"] .manga-action .action_icon svg,
        html[data-md-page="overview"] .manga-action .action_icon img {
            font-size: 24px !important;
            width: 24px !important;
            height: 24px !important;
            color: var(--primary) !important;
        }
        html[data-md-page="overview"] .manga-action .action_detail,
        html[data-md-page="overview"] .manga-action .action_detail span,
        html[data-md-page="overview"] .manga-action .add-bookmark a,
        html[data-md-page="overview"] .manga-action .count-comment a {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            font-family: 'DM Sans', sans-serif !important;
            font-size: 13px !important;
            font-weight: 800 !important;
            letter-spacing: 0 !important;
            text-align: left !important;
            color: var(--ink) !important;
            text-decoration: none !important;
        }
        html[data-md-page="overview"] .manga-action .add-bookmark .action_icon a {
            flex: 0 0 auto !important;
        }

        /* -- chapter pills on cards: one line, ellipsis, never clip the frame -- */
        html body div.page-item-detail .list-chapter .chapter-item,
        html body .popular-content .chapter-item {
            overflow: hidden !important;
            min-width: 0 !important;
            padding: 0 3px 3px 0 !important;
        }
        html body div.page-item-detail .list-chapter .chapter-item span.chapter,
        html body div.page-item-detail .list-chapter .chapter-item .chapter {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            max-width: 100% !important;
            overflow: visible !important;
            display: block !important;
        }
        html body div.page-item-detail .list-chapter .chapter-item .chapter a,
        html body .popular-content .chapter-item .chapter a {
            display: block !important;
            box-sizing: border-box !important;
            max-width: 100% !important;
            width: max-content !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            line-height: 1.35 !important;
            height: auto !important;
            margin: 0 !important;
        }
        html body div.page-item-detail.manga .chapter-item {
            height: auto !important;
            min-height: 30px !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            row-gap: 2px !important;
        }
        html body div.page-item-detail .list-chapter .chapter-item span.chapter,
        html body div.page-item-detail .list-chapter .chapter-item .chapter {
            flex: 1 1 auto !important;
            min-width: 88px !important;
        }
        html body div.page-item-detail.manga .list-chapter {
            max-height: none !important;
            min-height: 72px !important;
            overflow: visible !important;
        }

        /* -- popular manga leaderboard (home + any other page) -- */
        html body .widget.c-popular,
        html body .c-sidebar .widget.c-popular {
            padding: 18px 18px 16px !important;
            counter-reset: mdpop !important;
        }
        html body .widget.c-popular .widget-heading,
        html body .widget.c-popular h5.heading {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 0 6px !important;
            padding: 0 0 12px !important;
            border-bottom: 3px solid var(--bd) !important;
            font-size: 17px !important;
            letter-spacing: 0.04em !important;
            background: none !important;
        }
        html body .widget.c-popular .widget-heading::before,
        html body .widget.c-popular h5.heading::before {
            content: "\\2605" !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 30px !important;
            height: 30px !important;
            background: var(--yellow) !important;
            color: #000 !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-size: 15px !important;
            line-height: 1 !important;
        }
        html body .widget.c-popular .widget-heading::after,
        html body .widget.c-popular h5.heading::after {
            content: none !important;
            display: none !important;
        }
        html body .widget.c-popular .popular-item-wrap {
            position: relative !important;
            counter-increment: mdpop !important;
            display: grid !important;
            grid-template-columns: 56px minmax(0, 1fr) !important;
            gap: 4px 14px !important;
            align-items: start !important;
            height: auto !important;
            padding: 13px 0 !important;
            margin: 0 !important;
            border-bottom: 2px dotted rgba(128, 128, 128, 0.4) !important;
        }
        html body .widget.c-popular .popular-item-wrap:last-child {
            border-bottom: 0 !important;
        }
        html body .widget.c-popular .popular-item-wrap::before {
            content: counter(mdpop) !important;
            display: flex !important;
            position: absolute !important;
            z-index: 2 !important;
            left: -6px !important;
            top: 7px !important;
            width: 24px !important;
            height: 24px !important;
            align-items: center !important;
            justify-content: center !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 7px !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
            font: 900 12px/1 'JetBrains Mono', monospace !important;
        }
        html body .widget.c-popular .popular-item-wrap:nth-of-type(1)::before {
            background: var(--yellow) !important;
            color: #000 !important;
        }
        html body .widget.c-popular .popular-item-wrap:nth-of-type(2)::before {
            background: var(--blue, #5bc0de) !important;
            color: #000 !important;
        }
        html body .widget.c-popular .popular-item-wrap:nth-of-type(3)::before {
            background: var(--pink, #ff6b6b) !important;
            color: #000 !important;
        }
        html body .widget.c-popular .popular-item-wrap::after {
            content: none !important;
            display: none !important;
        }
        html body .widget.c-popular .popular-img,
        html body .widget.c-popular .popular-content {
            float: none !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html body .widget.c-popular .popular-img.widget-thumbnail a img {
            display: block !important;
            width: 56px !important;
            height: auto !important;
        }
        html body .widget.c-popular .popular-content h5.widget-title {
            margin: 2px 0 4px !important;
        }
        html body .widget.c-popular .popular-content h5.widget-title a {
            min-height: 0 !important;
            max-height: 2.8em !important;
            font-size: 13.5px !important;
            text-decoration: none !important;
        }
        html body .popular-content .chapter-item {
            display: flex !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            gap: 8px !important;
            float: none !important;
            width: auto !important;
            margin: 4px 0 0 !important;
        }
        html body .popular-content .chapter-item .chapter {
            display: block !important;
            flex: 0 1 auto !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        html body .popular-content .chapter-item .chapter a {
            padding: 2px 8px !important;
            font-size: 11px !important;
        }
        html body .popular-content .chapter-item .post-on {
            flex: 0 0 auto !important;
            margin: 0 !important;
            padding: 0 !important;
            white-space: nowrap !important;
            font: 600 11px 'JetBrains Mono', monospace !important;
            color: var(--muted) !important;
        }

        /* -- Load More: lift on hover, press on click, striped + spinner while loading -- */
        nav.navigation-ajax a.load-ajax {
            position: relative !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 10px !important;
            max-width: 300px !important;
            color: #000 !important;
            background: var(--yellow) !important;
            transition: transform .16s cubic-bezier(.3, 1.6, .5, 1), box-shadow .16s ease, background .16s ease !important;
        }
        nav.navigation-ajax a.load-ajax::after {
            content: "\\2193" !important;
            display: inline-block !important;
            font-size: 18px !important;
            line-height: 1 !important;
            animation: mdBob 1.4s ease-in-out infinite !important;
        }
        nav.navigation-ajax a.load-ajax::before {
            content: "" !important;
            position: absolute !important;
            top: 0 !important;
            bottom: 0 !important;
            left: -60% !important;
            width: 40% !important;
            background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .55), transparent) !important;
            transform: skewX(-18deg) !important;
            transition: none !important;
            pointer-events: none !important;
        }
        nav.navigation-ajax a.load-ajax:hover::before {
            animation: mdShine .75s ease-out !important;
        }
        nav.navigation-ajax a.load-ajax:hover {
            background: var(--yellow) !important;
            color: #000 !important;
            transform: translate(-3px, -3px) !important;
            box-shadow: 7px 7px 0 var(--bd) !important;
        }
        nav.navigation-ajax a.load-ajax:hover::after {
            animation-duration: .7s !important;
        }
        nav.navigation-ajax a.load-ajax:active {
            transform: translate(3px, 3px) !important;
            box-shadow: 0 0 0 var(--bd) !important;
        }
        nav.navigation-ajax a.load-ajax.md-loading {
            pointer-events: none !important;
            background-image: repeating-linear-gradient(45deg, rgba(0, 0, 0, .12) 0 12px, transparent 12px 24px) !important;
            background-size: 34px 34px !important;
            animation: mdStripes .8s linear infinite !important;
            transform: translate(3px, 3px) !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
        }
        nav.navigation-ajax a.load-ajax.md-loading::after {
            content: "" !important;
            width: 16px !important;
            height: 16px !important;
            border: 3px solid #000 !important;
            border-right-color: transparent !important;
            border-radius: 50% !important;
            animation: mdSpin .7s linear infinite !important;
        }
        @keyframes mdBob { 0%, 100% { transform: translateY(-2px); } 50% { transform: translateY(3px); } }
        @keyframes mdShine { from { left: -60%; } to { left: 130%; } }
        @keyframes mdStripes { from { background-position: 0 0; } to { background-position: 34px 0; } }
        @keyframes mdSpin { to { transform: rotate(360deg); } }
        /* freshly loaded cards pop in one after another */
        .md-pop-in {
            animation: mdPopIn .45s cubic-bezier(.2, .9, .3, 1.2) both !important;
            animation-delay: calc(var(--md-i, 0) * 55ms) !important;
        }
        @keyframes mdPopIn {
            from { opacity: 0; transform: translateY(22px) scale(.96); }
            to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            nav.navigation-ajax a.load-ajax, nav.navigation-ajax a.load-ajax::before, nav.navigation-ajax a.load-ajax::after, .md-pop-in { animation: none !important; transition: none !important; }
        }

        /* -- series header: blurred cover backdrop (same idea as the home hero) -- */
        html[data-md-page="overview"] div.profile-manga {
            position: relative !important;
            overflow: hidden !important;
            isolation: isolate !important;
        }
        html[data-md-page="overview"] div.profile-manga > .md-profile-bg {
            position: absolute !important;
            inset: -30px !important;
            z-index: -2 !important;
            background-size: cover !important;
            background-position: center 25% !important;
            filter: blur(24px) saturate(1.7) brightness(.8) !important;
            opacity: .85 !important;
            transform: scale(1.1) !important;
            pointer-events: none !important;
        }
        html[data-md-page="overview"] div.profile-manga > .md-profile-bg::after {
            content: none !important;
        }
        html[data-md-page="overview"] div.profile-manga::before {
            content: "" !important;
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            z-index: -1 !important;
            pointer-events: none !important;
            background: linear-gradient(to top, rgba(255,255,255,.65) 0%, rgba(255,255,255,.12) 55%, transparent 100%),
                        linear-gradient(to right, rgba(255,255,255,.78) 0%, rgba(255,255,255,.2) 60%, transparent 100%) !important;
        }
        html[data-md-theme="dark"][data-md-page="overview"] div.profile-manga {
            background: #0b0813 !important;
        }
        html[data-md-theme="dark"][data-md-page="overview"] div.profile-manga > .md-profile-bg {
            filter: blur(18px) brightness(.34) saturate(1.2) !important;
            opacity: 1 !important;
        }
        html[data-md-theme="dark"][data-md-page="overview"] div.profile-manga::before {
            background: linear-gradient(to top, rgba(0,0,0,.7) 0%, rgba(0,0,0,.2) 60%, transparent 100%),
                        linear-gradient(to right, rgba(0,0,0,.8) 0%, rgba(0,0,0,.35) 60%, transparent 100%) !important;
        }

        /* =====================================================================
           ROUND 3
           ===================================================================== */

        /* -- links should never be underlined in cards, buttons and the leaderboard -- */
        html body div.page-item-detail *,
        html body .popular-item-wrap *,
        html body #init-links a,
        html body a.c-btn,
        html body .manga-action *,
        html body ul.main.version-chap li.wp-manga-chapter * {
            text-decoration: none !important;
        }

        /* -- READ FIRST / READ LAST: sized, padded, never clipped -- */
        html[data-md-page="overview"] div.tab-summary,
        html[data-md-page="overview"] div.summary_content_wrap,
        html[data-md-page="overview"] div.summary_content {
            overflow: visible !important;
        }
        html[data-md-page="overview"] div.summary_content #init-links {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 14px !important;
            padding: 2px 8px 8px 2px !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
        }
        html[data-md-page="overview"] div.summary_content #init-links a,
        html[data-md-page="overview"] #btn-read-first,
        html[data-md-page="overview"] #btn-read-last {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
            box-sizing: border-box !important;
            width: auto !important;
            height: auto !important;
            min-height: 44px !important;
            margin: 0 !important;
            padding: 11px 22px !important;
            line-height: 1.2 !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-decoration: none !important;
            text-overflow: clip !important;
        }

        /* -- COMMENTS: no voting, a plain score, tidy reply toggle, collapsible -- */
        html body #wpdcom .wpd-avatar img,
        html body #wpdcom img.avatar {
            width: 44px !important;
            height: 44px !important;
            max-width: 44px !important;
            border: 2px solid var(--bd) !important;
            border-radius: 50% !important;
            object-fit: cover !important;
        }
        html body #wpdcom .wpd-vote-up,
        html body #wpdcom .wpd-vote-down,
        html body #wpdcom .wpd-vote .wpd-vote-up,
        html body #wpdcom .wpd-vote .wpd-vote-down {
            display: none !important;
        }
        html body #wpdcom .wpd-vote {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            pointer-events: none !important;
            margin: 0 !important;
        }
        html body #wpdcom .wpd-vote-result {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 3px 10px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 999px !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
            font: 800 12px 'JetBrains Mono', monospace !important;
        }
        html body #wpdcom .wpd-vote-result::before {
            content: "Score" !important;
            font: 700 10px 'DM Sans', sans-serif !important;
            letter-spacing: .08em !important;
            text-transform: uppercase !important;
            color: var(--muted) !important;
        }
        html body #wpdcom .wpd-comment-footer {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            margin-top: 8px !important;
        }
        html body #wpdcom .wpd-comment-footer .wpd-space {
            flex: 1 1 auto !important;
        }
        html body #wpdcom .wpd-toggle {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-left: auto !important;
            padding: 5px 12px !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px 'DM Sans', sans-serif !important;
            cursor: pointer !important;
            transition: transform .1s ease, box-shadow .1s ease, background .12s ease !important;
        }
        html body #wpdcom .wpd-toggle:hover {
            background: var(--yellow) !important;
            color: #000 !important;
            transform: translate(-1px, -1px) !important;
            box-shadow: 3px 3px 0 var(--bd) !important;
        }
        html body #wpdcom .wpd-toggle * {
            color: inherit !important;
            font-weight: 800 !important;
        }
        html body #wpdcom .wpd-toggle i,
        html body #wpdcom .wpd-toggle svg {
            transition: transform .2s ease !important;
        }
        html body #wpdcom .wpd-toggle.wpd-hide-replies i,
        html body #wpdcom .wpd-toggle.wpd_clicked i,
        html body #wpdcom .wpd-toggle[aria-expanded="true"] i {
            transform: rotate(180deg) !important;
        }
        html body #wpdcom .wpd-comment-header {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 4px 10px !important;
        }
        html body #wpdcom .md-col {
            order: 99 !important;
            margin-left: auto !important;
            width: 28px !important;
            height: 28px !important;
            padding: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 7px !important;
            box-shadow: 1px 1px 0 var(--bd) !important;
            font: 900 15px/1 'JetBrains Mono', monospace !important;
            cursor: pointer !important;
            transition: transform .1s ease, background .12s ease !important;
        }
        html body #wpdcom .md-col:hover {
            background: var(--yellow) !important;
            color: #000 !important;
        }
        html body #wpdcom .wpd-comment[data-md-collapsed] .wpd-comment {
            display: none !important;
        }
        html body #wpdcom .wpd-comment[data-md-collapsed] > .wpd-comment-wrap .wpd-comment-text,
        html body #wpdcom .wpd-comment[data-md-collapsed] > .wpd-comment-wrap .wpd-comment-footer,
        html body #wpdcom .wpd-comment[data-md-collapsed] > .wpd-comment-wrap .wpd-comment-text + *,
        html body #wpdcom .wpd-comment[data-md-collapsed] > .wpd-comment-wrap .wpd-comment-left .wpd-comment-label {
            display: none !important;
        }
        html body #wpdcom .wpd-comment[data-md-collapsed] > .wpd-comment-wrap {
            opacity: .75 !important;
        }

        /* -- LEADERBOARD: one frame, one heading, one rule -- */
        html body .widget.c-popular .widget-heading::before,
        html body .widget.c-popular h5.heading::before,
        html body .widget.c-popular .widget-heading::after,
        html body .widget.c-popular h5.heading::after {
            content: none !important;
            display: none !important;
        }
        html body .widget.c-popular div:not(.popular-item-wrap):not(.popular-item-wrap *):not([class*="heading"]):not([class*="heading"] *):not([class*="view-more"]):not([class*="view-more"] *) {
            border: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, .heading, h1, h2, h3, h4, h5):not(.popular-item-wrap *) {
            border: 0 !important;
            box-shadow: none !important;
            background: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, .heading):not(.popular-item-wrap *):not(:is(.widget-heading, .c-blog__heading, .heading) :is(.widget-heading, .c-blog__heading, .heading)) {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            margin: 0 0 4px !important;
            padding: 0 0 12px !important;
            border-bottom: 3px solid var(--bd) !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, .heading) :is(h1, h2, h3, h4, h5):not(.popular-item-wrap *) {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            font: 900 17px 'DM Sans', sans-serif !important;
            letter-spacing: .04em !important;
            text-transform: uppercase !important;
            color: var(--ink) !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, h1, h2, h3, h4, h5):not(.popular-item-wrap *) i {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
            width: 30px !important;
            height: 30px !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 15px !important;
            line-height: 1 !important;
            background: var(--primary) !important;
            color: #fff !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, h1, h2, h3, h4, h5) i::before {
            background: none !important;
            color: #fff !important;
        }
        html body .widget.c-popular :is(.widget-heading, .c-blog__heading, h1, h2, h3, h4, h5) i::after {
            content: none !important;
            display: none !important;
        }

        /* -- SERIES CARDS: poster layout. cover first (biggest), then title, rating, chapters -- */
        div.row:has(> [class*="col-"] > div.page-item-detail),
        .page-listing-item > .row {
            display: contents !important;
        }
        div.row:has(> [class*="col-"] > div.page-item-detail)::before,
        div.row:has(> [class*="col-"] > div.page-item-detail)::after,
        .page-listing-item > .row::before,
        .page-listing-item > .row::after {
            content: none !important;
            display: none !important;
        }
        div.row:has(> [class*="col-"] > div.page-item-detail) > [class*="col-"],
        .page-listing-item > .row > [class*="col-"] {
            width: auto !important;
            max-width: none !important;
            min-width: 0 !important;
            flex: none !important;
            float: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            flex-direction: column !important;
        }
        html body div.page-item-detail.manga {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
            height: 100% !important;
            min-height: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            border-radius: 14px !important;
        }
        html body div.page-item-detail.manga .item-thumb {
            position: relative !important;
            flex: 0 0 auto !important;
            width: 100% !important;
            height: auto !important;
            aspect-ratio: 2 / 3 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            background: var(--soft) !important;
        }
        html body div.page-item-detail.manga .item-thumb a {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
        }
        html body div.page-item-detail.manga .item-thumb a img,
        html body div.page-item-detail.manga .item-thumb img {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            object-fit: cover !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            transition: transform .35s ease !important;
        }
        html body div.page-item-detail.manga:hover .item-thumb img {
            transform: scale(1.05) !important;
        }
        html body div.page-item-detail.manga .manga-title-badges,
        html body div.page-item-detail.manga .badge-pos,
        html body div.page-item-detail.manga span[class*="badge"] {
            position: absolute !important;
            z-index: 3 !important;
            top: 10px !important;
            left: 10px !important;
            right: auto !important;
            bottom: auto !important;
            margin: 0 !important;
        }
        html body div.page-item-detail.manga .item-summary {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 1 auto !important;
            gap: 6px !important;
            height: auto !important;
            min-width: 0 !important;
            padding: 12px 14px 14px !important;
            margin: 0 !important;
            float: none !important;
        }
        html body div.page-item-detail.manga .post-title,
        html body div.page-item-detail.manga .post-title h3,
        html body div.page-item-detail.manga .post-title h4,
        html body div.page-item-detail.manga .post-title h5 {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            max-height: none !important;
        }
        html body div.page-item-detail.manga .post-title a {
            min-height: 2.7em !important;
            max-height: 2.7em !important;
            font-size: 15px !important;
            line-height: 1.35 !important;
        }
        html body div.page-item-detail.manga .meta-item.rating {
            display: flex !important;
            align-items: center !important;
            height: 20px !important;
            margin: 0 !important;
        }
        html body div.page-item-detail.manga .list-chapter {
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            gap: 6px !important;
            margin-top: auto !important;
            padding-top: 6px !important;
            min-height: 70px !important;
            max-height: none !important;
            overflow: visible !important;
            border-top: 2px dotted rgba(128, 128, 128, .4) !important;
        }
        html body div.page-item-detail.manga .list-chapter .chapter-item {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 8px !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
        }
        html body div.page-item-detail.manga .list-chapter .chapter-item span.chapter,
        html body div.page-item-detail.manga .list-chapter .chapter-item .chapter {
            display: block !important;
            flex: none !important;
            min-width: 0 !important;
            max-width: 100% !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        html body div.page-item-detail.manga .list-chapter .chapter-item .chapter a {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            padding: 4px 9px !important;
            margin: 0 !important;
            font-size: 11.5px !important;
            line-height: 1.35 !important;
        }
        html body div.page-item-detail.manga .list-chapter .chapter-item .post-on,
        html body div.page-item-detail.manga .list-chapter .chapter-item span.post-on {
            flex: none !important;
            max-width: 96px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font: 600 10.5px 'JetBrains Mono', monospace !important;
            color: var(--muted) !important;
            text-align: right !important;
        }
        @media (max-width: 600px) {
            div.row:has(> [class*="col-"] > div.page-item-detail),
            .page-listing-item > .row {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 16px 12px !important;
            }
            html body div.page-item-detail.manga .item-summary {
                padding: 10px 10px 12px !important;
            }
            html body div.page-item-detail.manga .post-title a {
                font-size: 13.5px !important;
            }
            html body div.page-item-detail.manga .list-chapter .chapter-item {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 2px !important;
            }
            html body div.page-item-detail.manga .list-chapter .chapter-item .post-on {
                text-align: left !important;
                max-width: none !important;
            }
        }

        /* -- READER: backgrounds that really switch, top bar, no related block -- */
        html[data-md-page="chapter"] body,
        html[data-md-page="chapter"] body.reading-manga {
            background:
                linear-gradient(to right, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                var(--page-bg) !important;
            padding-top: 72px !important;
        }
        html[data-md-page="chapter"] body :is(.wrap, .body-wrap, .site-content, #content, #primary, .site-main, .c-page-content, .c-page, .content-area, .main-col, .main-col-inner, .entry-content, .entry-content_wrap, .c-blog-post, .reading-content, .page-break, .read-container, .reading-content-wrap, .c-page__content) {
            background-color: transparent !important;
            background-image: none !important;
        }
        html[data-md-page="chapter"] header.site-header {
            display: none !important;
        }
        html[data-md-page="chapter"] #md-top,
        html[data-md-page="chapter"] .related-manga,
        html[data-md-page="chapter"] .manga-related,
        html[data-md-page="chapter"] #related-manga {
            display: none !important;
        }
        html[data-md-page="chapter"] #wpdcom,
        html[data-md-page="chapter"] #respond,
        html[data-md-page="chapter"] #comments {
            scroll-margin-top: 84px;
        }
        #md-rbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 90;
            display: flex;
            align-items: center;
            gap: 10px;
            box-sizing: border-box;
            padding: 10px 16px;
            background: var(--card);
            border-bottom: var(--bw) solid var(--bd);
            box-shadow: 0 4px 0 var(--bd);
            transition: transform .25s ease;
        }
        html[data-md-navhide] #md-rbar {
            transform: translateY(calc(-100% - 8px));
        }
        #md-rbar .md-rb-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex: 0 0 auto;
            height: 38px;
            padding: 0 12px;
            box-sizing: border-box;
            background: var(--card);
            color: var(--ink);
            border: var(--bw) solid var(--bd);
            border-radius: 8px;
            box-shadow: var(--sh-sm);
            font: 800 12px 'DM Sans', sans-serif;
            letter-spacing: .04em;
            text-transform: uppercase;
            text-decoration: none;
            cursor: pointer;
            transition: transform .1s ease, box-shadow .1s ease, background .12s ease;
        }
        #md-rbar .md-rb-btn:hover {
            background: var(--yellow);
            color: #000;
            transform: translate(-1px, -1px);
            box-shadow: 3px 3px 0 var(--bd);
        }
        #md-rbar .md-rb-btn svg {
            width: 18px;
            height: 18px;
        }
        #md-rbar .md-rb-title {
            flex: 1 1 auto;
            min-width: 0;
            text-align: center;
            line-height: 1.2;
            cursor: default;
        }
        #md-rbar .md-rb-title b {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font: 900 14px 'DM Sans', sans-serif;
            color: var(--ink);
        }
        #md-rbar .md-rb-title span {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font: 700 11px 'JetBrains Mono', monospace;
            color: var(--muted);
        }
        #md-rbar .md-rb-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 22px;
            height: 22px;
            padding: 0 6px;
            box-sizing: border-box;
            background: var(--ink-bg);
            color: var(--on-ink);
            border-radius: 999px;
            font: 800 11px 'JetBrains Mono', monospace;
        }
        #md-rbar .md-rb-count:empty {
            display: none;
        }
        #md-rbar .md-rb-theme {
            display: inline-flex;
            flex: 0 0 auto;
        }
        @media (max-width: 680px) {
            #md-rbar { gap: 8px; padding: 8px 10px; }
            #md-rbar .md-rb-lbl { display: none; }
            #md-rbar .md-rb-btn { padding: 0 10px; }
            #md-rbar .md-rb-title b { font-size: 12.5px; }
            html[data-md-page="chapter"] body { padding-top: 64px !important; }
        }

        /* =====================================================================
           ROUND 4
           ===================================================================== */

        /* -- section headings: drawn glyph (icon font is often missing), one tile style everywhere -- */
        html body [data-md-g="bolt"] { --md-g: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 2 4 14h6l-1 8 9-12h-6z'/%3E%3C/svg%3E"); }
        html body [data-md-g="star"] { --md-g: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.3 5.9 20.9l1.5-6.8L2.2 9.5l6.9-.7z'/%3E%3C/svg%3E"); }
        html body [data-md-g="doc"] { --md-g: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2.5h8.5L19 7v14.5H6zM14 2.5V7.5h5M9 13h7M9 17h7'/%3E%3C/svg%3E"); }
        html body [data-md-g="list"] { --md-g: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' stroke-width='3'/%3E%3C/svg%3E"); }
        html body [data-md-g="chat"] { --md-g: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z'/%3E%3C/svg%3E"); }
        html body [data-md-g][data-md-g] i:not(a *):not(button *) {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
            width: 36px !important;
            height: 36px !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 0 !important;
            line-height: 1 !important;
            background: var(--primary) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 9px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html body [data-md-g][data-md-g] i:not(a *):not(button *)::before {
            content: "" !important;
            display: block !important;
            width: 20px !important;
            height: 20px !important;
            background: #ffffff !important;
            -webkit-mask: var(--md-g) center / contain no-repeat !important;
            mask: var(--md-g) center / contain no-repeat !important;
        }
        html body [data-md-g][data-md-g] i:not(a *):not(button *)::after {
            content: none !important;
            display: none !important;
        }
        html[data-md-page="list"] .c-blog__heading {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            gap: 14px !important;
            margin: 6px 0 22px !important;
            padding: 12px 18px !important;
            overflow: hidden !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 12px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html[data-md-page="list"] .c-blog__heading::after {
            content: "" !important;
            display: block !important;
            position: absolute !important;
            right: 0 !important;
            top: 0 !important;
            bottom: 0 !important;
            width: 110px !important;
            background: repeating-linear-gradient(135deg, var(--bd) 0 3px, transparent 3px 11px) !important;
            opacity: .16 !important;
            pointer-events: none !important;
        }
        html[data-md-page="list"] .c-blog__heading :is(h1, h2, h3, h4, h5) {
            display: flex !important;
            align-items: center !important;
            gap: 14px !important;
            margin: 0 !important;
            padding: 0 !important;
            background: none !important;
            border: 0 !important;
            box-shadow: none !important;
            font: 900 20px/1.2 'DM Sans', sans-serif !important;
            letter-spacing: .03em !important;
            text-transform: uppercase !important;
            color: var(--ink) !important;
        }

        /* -- home grid: three columns on desktop -- */
        @media (min-width: 900px) {
            html body.home div.row:has(> [class*="col-"] > div.page-item-detail),
            html body.home .page-listing-item > .row {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 26px 22px !important;
            }
        }

        /* -- COMMENTS: type, layout, report button -- */
        html body #wpdcom {
            font-family: 'DM Sans', system-ui, sans-serif !important;
        }
        html body #wpdcom .wpd-comment {
            padding: 16px 18px !important;
        }
        html body #wpdcom .wpd-comment-wrap {
            display: flex !important;
            align-items: flex-start !important;
            gap: 14px !important;
        }
        html body #wpdcom .wpd-comment-left {
            flex: 0 0 64px !important;
            width: 64px !important;
            float: none !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 6px !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html body #wpdcom .wpd-comment-right {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            float: none !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html body #wpdcom .wpd-comment-label,
        html body #wpdcom .wpd-comment-left .wpd-comment-label {
            max-width: 72px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            padding: 2px 6px !important;
            border: 2px solid var(--bd) !important;
            border-radius: 6px !important;
            font: 800 9.5px/1.3 'DM Sans', sans-serif !important;
            letter-spacing: .03em !important;
            text-transform: uppercase !important;
            color: #fff !important;
        }
        html body #wpdcom .wpd-comment-label * {
            font: inherit !important;
            color: inherit !important;
            padding: 0 !important;
        }
        html body #wpdcom .wpd-comment-author,
        html body #wpdcom .wpd-comment-author a {
            font: 800 15px/1.2 'DM Sans', sans-serif !important;
            letter-spacing: 0 !important;
            color: var(--primary) !important;
            text-decoration: none !important;
        }
        html body #wpdcom .wpd-comment-date {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            font: 600 11.5px 'JetBrains Mono', monospace !important;
            color: var(--muted) !important;
        }
        html body #wpdcom .wpd-comment-text,
        html body #wpdcom .wpd-comment-text p {
            font: 500 15px/1.65 'DM Sans', sans-serif !important;
            color: var(--ink) !important;
            letter-spacing: 0 !important;
        }
        html body #wpdcom .wpd-comment-text {
            margin: 8px 0 10px !important;
            padding: 0 !important;
            border: 0 !important;
            word-break: break-word !important;
        }
        html body #wpdcom .wpd-comment-text p {
            margin: 0 0 .6em !important;
        }
        html body #wpdcom .wpd-comment-text a {
            color: var(--primary) !important;
            font-weight: 700 !important;
            text-decoration: underline !important;
        }
        html body #wpdcom .wpd-comment-text img,
        html body #wpdcom .wpd-comment-text video {
            display: block !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: 380px !important;
            margin: 10px 0 4px !important;
            border: 2px solid var(--bd) !important;
            border-radius: 10px !important;
            box-shadow: var(--sh-sm) !important;
        }
        html body #wpdcom .wpd-comment-text hr,
        html body #wpdcom .wpd-comment-wrap hr {
            display: none !important;
        }
        html body #wpdcom .wpd-reply-to,
        html body #wpdcom .wpd-reply-to-text {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            margin: 4px 0 2px !important;
            padding: 0 0 0 8px !important;
            border-left: 3px solid var(--bd) !important;
            font: 600 12px 'DM Sans', sans-serif !important;
            font-style: normal !important;
            color: var(--muted) !important;
        }
        html body #wpdcom .wpd-reply-to a {
            color: var(--primary) !important;
            font-weight: 800 !important;
            text-decoration: none !important;
        }
        html body #wpdcom .wpd-comment-footer {
            padding-top: 10px !important;
            margin-top: 8px !important;
            border-top: 2px dotted rgba(128, 128, 128, .35) !important;
        }
        html body #wpdcom .wpd-comment .wpd-comment {
            margin: 14px 0 0 !important;
            padding: 14px 16px !important;
            background: var(--card) !important;
            border: 2px solid var(--bd) !important;
            border-left: 6px solid var(--primary) !important;
            border-radius: 10px !important;
            box-shadow: none !important;
        }
        html body #wpdcom .wpd-toggle,
        html body #wpdcom .wpd-toggle * {
            color: var(--ink) !important;
            opacity: 1 !important;
        }
        html body #wpdcom .wpd-toggle:hover,
        html body #wpdcom .wpd-toggle:hover * {
            color: #000 !important;
        }
        html body #wpdcom [class*="wpd-report"],
        html body #wpdcom [class*="wpd-comment-report"],
        html body #wpdcom .wpd-comment-right [class*="report"] {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
            min-width: 28px !important;
            height: 28px !important;
            padding: 0 8px !important;
            margin: 0 !important;
            background: transparent !important;
            color: var(--muted) !important;
            border: 2px solid transparent !important;
            border-radius: 7px !important;
            box-shadow: none !important;
            font: 700 11px 'DM Sans', sans-serif !important;
            cursor: pointer !important;
            transition: background .12s ease, color .12s ease, border-color .12s ease !important;
        }
        html body #wpdcom [class*="wpd-report"]:hover,
        html body #wpdcom [class*="wpd-comment-report"]:hover,
        html body #wpdcom .wpd-comment-right [class*="report"]:hover {
            background: var(--pink) !important;
            color: #000 !important;
            border-color: var(--bd) !important;
        }
        html body #wpdcom .md-col {
            width: 30px !important;
            height: 30px !important;
            font: 900 16px/1 'DM Sans', sans-serif !important;
        }

        /* -- COMMENTS loading: own indicator instead of the corner bar -- */
        html body #wpdiscuz-loading-bar,
        html body .wpdiscuz-loading-bar {
            visibility: hidden !important;
            pointer-events: none !important;
        }
        html body #wpdcom .md-cload {
            display: none;
            position: sticky;
            bottom: 18px;
            z-index: 6;
            width: max-content;
            max-width: 100%;
            align-items: center;
            gap: 10px;
            margin: 14px auto 0;
            padding: 9px 18px;
            background-color: var(--card);
            background-image: repeating-linear-gradient(45deg, rgba(128, 128, 128, .16) 0 10px, transparent 10px 20px);
            background-size: 28px 28px;
            border: 3px solid var(--bd);
            border-radius: 999px;
            box-shadow: var(--sh);
            color: var(--ink);
            font: 800 12px 'DM Sans', sans-serif;
            letter-spacing: .08em;
            text-transform: uppercase;
            animation: mdCStripes .8s linear infinite;
        }
        html body #wpdcom .md-cload::before {
            content: "";
            width: 16px;
            height: 16px;
            border: 3px solid var(--bd);
            border-right-color: transparent;
            border-radius: 50%;
            animation: mdSpin .7s linear infinite;
        }
        html body #wpdcom[data-md-cload] .md-cload {
            display: flex;
        }
        html body #wpdcom[data-md-cload] .wpd-comment {
            animation: mdCPulse .9s ease-in-out infinite alternate;
        }
        @keyframes mdCStripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
        @keyframes mdCPulse { from { opacity: 1; } to { opacity: .55; } }

        /* -- mobile + touch optimisation -- */
        @media (max-width: 760px) {
            :root { --sh: 3px 3px 0 var(--bd); --sh-hover: 4px 4px 0 var(--bd); }
            html body div.page-item-detail.manga {
                content-visibility: auto;
                contain-intrinsic-size: auto 330px;
            }
            #md-hero .md-hero-bg {
                inset: 0 !important;
                transform: none !important;
                filter: blur(10px) saturate(1.4) brightness(.8) !important;
            }
            html[data-md-theme="dark"] #md-hero .md-hero-bg {
                filter: blur(8px) brightness(.34) saturate(1.2) !important;
            }
            html[data-md-page="overview"] div.profile-manga > .md-profile-bg {
                inset: 0 !important;
                transform: none !important;
                filter: blur(12px) saturate(1.4) brightness(.8) !important;
            }
            html[data-md-theme="dark"][data-md-page="overview"] div.profile-manga > .md-profile-bg {
                filter: blur(10px) brightness(.34) saturate(1.2) !important;
            }
            html[data-md-page="list"] .c-blog__heading {
                padding: 10px 12px !important;
                margin: 4px 0 16px !important;
            }
            html[data-md-page="list"] .c-blog__heading :is(h1, h2, h3, h4, h5) {
                font-size: 16px !important;
            }
            html body [data-md-g][data-md-g] i:not(a *):not(button *) {
                width: 32px !important;
                height: 32px !important;
            }
            html body #wpdcom .wpd-comment {
                padding: 12px 12px !important;
            }
            html body #wpdcom .wpd-comment-wrap {
                gap: 10px !important;
            }
            html body #wpdcom .wpd-comment-left {
                flex-basis: 48px !important;
                width: 48px !important;
            }
            html body #wpdcom .wpd-avatar img,
            html body #wpdcom img.avatar {
                width: 40px !important;
                height: 40px !important;
                max-width: 40px !important;
            }
            html body #wpdcom .wpd-comment-label {
                max-width: 52px !important;
                font-size: 8.5px !important;
            }
            html body #wpdcom .wpd-comment .wpd-comment {
                padding: 10px 10px !important;
            }
            html body #wpdcom .wpd-comment-text,
            html body #wpdcom .wpd-comment-text p {
                font-size: 14.5px !important;
            }
        }
        @media (hover: none) {
            html body div.page-item-detail.manga:hover,
            html body div.row.c-tabs-item__content:hover,
            ul.main.version-chap li.wp-manga-chapter:hover {
                transform: none !important;
            }
            html body div.page-item-detail.manga:hover .item-thumb img {
                transform: none !important;
            }
            html body div.page-item-detail.manga,
            html body div.page-item-detail.manga .item-thumb img {
                transition: none !important;
            }
        }

        /* =====================================================================
           ROUND 5
           ===================================================================== */

        /* -- listing grid lives on the container that holds ALL rows (3 columns on the home page) -- */
        html body div:has(> div.page-listing-item > div.row > [class*="col-"] > div.page-item-detail),
        html body div:not(.page-listing-item):has(> div.row > [class*="col-"] > div.page-item-detail),
        html body div.page-content-listing:has(div.page-item-detail) {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)) !important;
            gap: 22px 18px !important;
            align-items: stretch !important;
            padding: 6px 4px 10px 0 !important;
        }
        html body div.page-listing-item,
        html body div.page-content-listing div.page-listing-item,
        html body div.page-listing-item > div.row,
        html body div.page-listing-item > div.row:has(> [class*="col-"] > div.page-item-detail),
        html body div.page-content-listing:has(div.page-item-detail) div.row:has(> [class*="col-"] > div.page-item-detail) {
            display: contents !important;
        }
        html body div.page-listing-item::before,
        html body div.page-listing-item::after,
        html body div.page-listing-item > div.row::before,
        html body div.page-listing-item > div.row::after {
            content: none !important;
            display: none !important;
        }
        @media (min-width: 900px) {
            html body.home div:has(> div.page-listing-item > div.row > [class*="col-"] > div.page-item-detail),
            html body.home div:not(.page-listing-item):has(> div.row > [class*="col-"] > div.page-item-detail),
            html body.home div.page-content-listing:has(div.page-item-detail) {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 26px 22px !important;
            }
        }
        @media (max-width: 600px) {
            html body div:has(> div.page-listing-item > div.row > [class*="col-"] > div.page-item-detail),
            html body div:not(.page-listing-item):has(> div.row > [class*="col-"] > div.page-item-detail),
            html body div.page-content-listing:has(div.page-item-detail) {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 14px 10px !important;
                padding: 2px 0 6px !important;
            }
        }

        /* -- COMMENTS round 5: score under avatar, tags beside the name, no "reply to", report flag -- */
        html body #wpdcom [class*="wpd-reply-to"] {
            display: none !important;
        }
        html body #wpdcom .wpd-comment-left .wpd-vote {
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
            margin: 2px 0 0 !important;
        }
        html body #wpdcom .wpd-comment-left .wpd-vote-result {
            flex-direction: column !important;
            justify-content: center !important;
            gap: 1px !important;
            width: 100% !important;
            min-width: 46px !important;
            box-sizing: border-box !important;
            padding: 3px 4px 4px !important;
            border-radius: 9px !important;
            font: 800 14px/1.1 'JetBrains Mono', monospace !important;
            text-align: center !important;
        }
        html body #wpdcom .wpd-comment-left .wpd-vote-result::before {
            font-size: 8px !important;
            letter-spacing: .12em !important;
        }
        html body #wpdcom .wpd-comment-header .wpd-comment-label {
            display: inline-flex !important;
            align-items: center !important;
            order: 0 !important;
            max-width: 160px !important;
            padding: 2px 8px !important;
            margin: 0 !important;
            border-radius: 999px !important;
            font: 800 10px/1.3 'DM Sans', sans-serif !important;
            letter-spacing: .04em !important;
        }
        html body #wpdcom i.fa-flag,
        html body #wpdcom .fa-flag {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 30px !important;
            height: 30px !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 13px !important;
            color: var(--muted) !important;
            border: 2px solid transparent !important;
            border-radius: 7px !important;
            cursor: pointer !important;
            transition: background .12s ease, color .12s ease, border-color .12s ease !important;
        }
        html body #wpdcom i.fa-flag:hover,
        html body #wpdcom .fa-flag:hover {
            background: var(--pink) !important;
            color: #000 !important;
            border-color: var(--bd) !important;
        }
        html body #wpdcom .wpd-comment-header {
            align-items: center !important;
        }

        /* -- SITE HEADER: fluid sizes, no underlines, tidy search/toggle/advanced -- */
        html body header.site-header a {
            text-decoration: none !important;
        }
        html body header.site-header .c-header__top {
            padding: 6px 0 !important;
        }
        html body header.site-header .wrap_branding a.logo img,
        html body header.site-header .wrap_branding img {
            width: auto !important;
            height: auto !important;
            max-height: clamp(32px, 4.2vw, 54px) !important;
            max-width: 100% !important;
        }
        html body .main-navigation ul.navbar-nav li a {
            font-size: clamp(12px, 1.05vw, 14px) !important;
            padding: 6px clamp(6px, .9vw, 12px) !important;
            white-space: nowrap !important;
        }
        html body .search-navigation {
            display: flex !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            gap: 10px !important;
        }
        html body .search-navigation a[href*="advanced"],
        html body .search-navigation a.btn-search-adv,
        html body header.site-header a.btn-search-adv {
            display: inline-flex !important;
            align-items: center !important;
            position: static !important;
            margin: 0 !important;
            padding: 3px 10px !important;
            white-space: nowrap !important;
            color: #fff !important;
            background: rgba(255, 255, 255, .18) !important;
            border: 2px solid rgba(255, 255, 255, .75) !important;
            border-radius: 999px !important;
            box-shadow: none !important;
            font: 800 11px 'DM Sans', sans-serif !important;
            letter-spacing: .04em !important;
            text-transform: uppercase !important;
        }
        html body .c-sub-header-nav .sub-nav_list {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 0 4px !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        html body .c-sub-header-nav .sub-nav_list > li > a {
            display: block !important;
            padding: 9px clamp(8px, 1vw, 14px) !important;
            font-size: clamp(11.5px, 1vw, 13px) !important;
            white-space: nowrap !important;
        }

        @media (max-width: 760px) {
            html body header.site-header .c-header__top {
                padding: 4px 0 !important;
            }
            html body header.site-header .wrap_branding a.logo img,
            html body header.site-header .wrap_branding img {
                max-height: 34px !important;
            }
            html body .search-navigation {
                gap: 8px !important;
            }
            html body .search-navigation a[href*="advanced"],
            html body .search-navigation a.btn-search-adv,
            html body header.site-header a.btn-search-adv {
                display: none !important;
            }
            html body #md-theme {
                min-width: 56px !important;
                min-height: 32px !important;
                flex: 0 0 auto !important;
            }
            html body a.open-search-main-menu {
                flex: 0 0 auto !important;
            }
            html body .c-sub-header-nav .sub-nav_list {
                flex-wrap: nowrap !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                scrollbar-width: none !important;
                -webkit-overflow-scrolling: touch !important;
            }
            html body .c-sub-header-nav .sub-nav_list::-webkit-scrollbar {
                display: none !important;
            }
            html body .c-sub-header-nav .sub-nav_list > li > a {
                padding: 8px 10px !important;
                font-size: 12px !important;
            }
            html body .site-header .sub-nav_list li.menu-item-has-children {
                position: static !important;
            }
            html body .site-header .sub-nav_list li.menu-item-has-children ul.sub-menu {
                left: 8px !important;
                right: 8px !important;
                width: auto !important;
                max-width: none !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                max-height: 60vh !important;
            }
        }

        /* -- MOBILE: series overview -- */
        @media (max-width: 760px) {
            html[data-md-page="overview"] header.site-header {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                background: transparent !important;
                background-image: none !important;
                border: 0 !important;
                box-shadow: none !important;
            }
            html[data-md-page="overview"] .c-sub-header-nav {
                display: none !important;
            }
            html[data-md-page="overview"] header.site-header .wrap_branding img {
                filter: drop-shadow(0 2px 0 rgba(0, 0, 0, .45)) !important;
            }
            html[data-md-page="overview"] div.profile-manga {
                margin: 0 0 14px !important;
                padding: 64px 0 16px !important;
                border-top-width: 0 !important;
            }
            html[data-md-page="overview"] div.profile-manga::before {
                background: linear-gradient(to bottom, rgba(0, 0, 0, .5) 0, rgba(0, 0, 0, 0) 100px),
                            linear-gradient(to bottom, rgba(255, 255, 255, .55), rgba(255, 255, 255, .72)) !important;
            }
            html[data-md-theme="dark"][data-md-page="overview"] div.profile-manga::before {
                background: linear-gradient(to bottom, rgba(0, 0, 0, .55) 0, rgba(0, 0, 0, 0) 100px),
                            linear-gradient(to bottom, rgba(0, 0, 0, .45), rgba(0, 0, 0, .62)) !important;
            }
            html[data-md-page="overview"] ol.breadcrumb {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 0 12px !important;
                padding: 5px 10px !important;
                overflow: hidden !important;
                font: 700 11px 'JetBrains Mono', monospace !important;
                border-radius: 8px !important;
            }
            html[data-md-page="overview"] ol.breadcrumb > li {
                flex: 0 0 auto !important;
                max-width: 32% !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
                padding: 0 !important;
            }
            html[data-md-page="overview"] ol.breadcrumb > li:last-child {
                flex: 1 1 auto !important;
                min-width: 0 !important;
                max-width: none !important;
            }
            html[data-md-page="overview"] ol.breadcrumb > li + li::before {
                content: "\\203A" !important;
                display: inline !important;
                padding: 0 6px !important;
                color: var(--muted) !important;
            }
            html[data-md-page="overview"] ol.breadcrumb a {
                text-decoration: none !important;
            }
            html[data-md-page="overview"] div.profile-manga .post-title h1 {
                margin: 0 0 12px !important;
                font-size: 21px !important;
                gap: 8px !important;
            }
            html[data-md-page="overview"] div.tab-summary {
                display: grid !important;
                grid-template-columns: 112px minmax(0, 1fr) !important;
                gap: 12px 14px !important;
                justify-items: stretch !important;
                align-items: start !important;
            }
            html[data-md-page="overview"] div.summary_image {
                grid-column: 1 !important;
                grid-row: 1 / span 2 !important;
                width: auto !important;
                max-width: none !important;
                margin: 0 !important;
            }
            html[data-md-page="overview"] div.summary_content_wrap,
            html[data-md-page="overview"] div.summary_content {
                display: contents !important;
            }
            html[data-md-page="overview"] div.summary_content .post-rating {
                grid-column: 2 !important;
                grid-row: 1 !important;
                display: inline-flex !important;
                align-items: center !important;
                align-self: start !important;
                justify-self: start !important;
                gap: 8px !important;
                margin: 0 !important;
                padding: 5px 10px !important;
                background: var(--card) !important;
                border: 2px solid var(--bd) !important;
                border-radius: 10px !important;
                box-shadow: var(--sh-sm) !important;
            }
            html[data-md-page="overview"] div.summary_content .post-rating * {
                margin: 0 !important;
            }
            html[data-md-page="overview"] div.summary_content > .post-content {
                grid-column: 2 !important;
                grid-row: 2 !important;
                flex: none !important;
                min-width: 0 !important;
            }
            html[data-md-page="overview"] div.summary_content > .post-status {
                grid-column: 1 / -1 !important;
                grid-row: 3 !important;
                flex: none !important;
                padding: 2px 12px !important;
            }
            html[data-md-page="overview"] div.summary_content .post-content_item {
                grid-template-columns: 68px minmax(0, 1fr) !important;
                gap: 2px 8px !important;
                padding: 6px 0 !important;
            }
            html[data-md-page="overview"] div.summary_content > .post-status .post-content_item {
                grid-template-columns: 72px minmax(0, 1fr) !important;
            }
            html[data-md-page="overview"] div.summary_content .post-content_item .summary-content {
                font-size: 13px !important;
            }
            html[data-md-page="overview"] .manga-action {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 8px !important;
                margin: 6px 0 8px !important;
            }
            html[data-md-page="overview"] .manga-action .count-comment,
            html[data-md-page="overview"] .manga-action .add-bookmark {
                padding: 8px 10px !important;
                gap: 8px !important;
                font-size: 12px !important;
            }
            html[data-md-page="overview"] .manga-action .action_detail,
            html[data-md-page="overview"] .manga-action .action_detail span {
                font-size: 12px !important;
                line-height: 1.2 !important;
            }
            html[data-md-page="overview"] .manga-action .action_icon,
            html[data-md-page="overview"] .manga-action .action_icon a {
                width: 24px !important;
                height: 24px !important;
            }
            html[data-md-page="overview"] div.summary_content > #init-links {
                grid-column: 1 / -1 !important;
                grid-row: 4 !important;
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 10px !important;
                padding: 0 6px 6px 0 !important;
            }
            html[data-md-page="overview"] div.summary_content #init-links a,
            html[data-md-page="overview"] #btn-read-first,
            html[data-md-page="overview"] #btn-read-last {
                width: 100% !important;
                padding: 11px 8px !important;
                font-size: 13px !important;
            }
            html[data-md-page="overview"] .c-blog__heading {
                margin: 18px 0 10px !important;
            }
            html[data-md-page="overview"] .c-blog__heading :is(h1, h2, h3, h4, h5) {
                font-size: 17px !important;
            }
            html[data-md-page="overview"] .description-summary {
                padding: 12px 14px 10px !important;
                margin: 0 0 4px !important;
            }
            html[data-md-page="overview"] #md-sel-bar {
                margin: 0 0 8px !important;
            }
            html[data-md-page="overview"] .c-sidebar .widget {
                padding: 14px 14px 12px !important;
            }
        }

        /* -- MOBILE: cards, list pages, comments -- */
        @media (max-width: 760px) {
            html body .c-page-content,
            html body .c-page-content .container,
            html body .c-page,
            html body .main-col,
            html body .main-col-inner {
                padding-top: 0 !important;
                margin-top: 0 !important;
            }
            html body #md-hero {
                margin: 10px auto 14px !important;
            }
            html[data-md-page="list"] .c-blog__heading {
                margin: 0 0 12px !important;
            }
            html body div.page-item-detail.manga .item-summary {
                gap: 4px !important;
                padding: 9px 9px 10px !important;
            }
            html body div.page-item-detail.manga .post-title a {
                min-height: 2.6em !important;
                max-height: 2.6em !important;
                font-size: 13px !important;
            }
            html body div.page-item-detail.manga .list-chapter {
                min-height: 0 !important;
                gap: 5px !important;
            }
            html body div.page-item-detail.manga .list-chapter .chapter-item {
                grid-template-columns: minmax(0, 1fr) !important;
                justify-items: stretch !important;
                gap: 2px !important;
            }
            html body div.page-item-detail.manga .list-chapter .chapter-item .chapter a {
                text-align: center !important;
                padding: 4px 6px !important;
            }
            html body div.page-item-detail.manga .list-chapter .chapter-item .post-on,
            html body div.page-item-detail.manga .list-chapter .chapter-item span.post-on {
                max-width: none !important;
                width: 100% !important;
                text-align: center !important;
                font-size: 10.5px !important;
            }
            html body #respond.comments-area {
                padding: 10px 10px 4px !important;
                margin-top: 16px !important;
            }
            html body #wpdcom .wpd-thread-head {
                margin: 0 0 10px !important;
            }
            html body #wpdcom .wpd-thread-info {
                padding-bottom: 6px !important;
                font-size: 13px !important;
            }
            html body #wpdcom .wpd-thread-list,
            html body #wpdcom .wpd-thread-wrapper {
                margin: 0 !important;
                padding: 0 !important;
            }
            html body #wpdcom .wpd-comment {
                margin: 0 0 10px !important;
                padding: 10px !important;
            }
            html body #wpdcom .wpd-comment-wrap {
                display: grid !important;
                grid-template-columns: 46px minmax(0, 1fr) !important;
                gap: 2px 10px !important;
            }
            html body #wpdcom .wpd-comment-left {
                grid-column: 1 !important;
                grid-row: 1 / span 2 !important;
                flex: none !important;
                width: auto !important;
            }
            html body #wpdcom .wpd-comment-right {
                display: contents !important;
            }
            html body #wpdcom .wpd-comment-header {
                grid-column: 2 !important;
                grid-row: 1 !important;
                gap: 2px 8px !important;
            }
            html body #wpdcom .wpd-comment-right > :not(.wpd-comment-header) {
                grid-column: 1 / -1 !important;
            }
            html body #wpdcom .wpd-comment-text {
                margin: 6px 0 4px !important;
            }
            html body #wpdcom .wpd-comment-footer {
                margin-top: 2px !important;
                padding-top: 8px !important;
            }
            html body #wpdcom .wpd-comment .wpd-comment {
                margin: 8px 0 0 !important;
                padding: 9px 9px !important;
                border-left-width: 5px !important;
            }
            html body #wpdcom .wpd-toggle {
                padding: 4px 10px !important;
            }
            html body #wpdcom .md-col,
            html body #wpdcom i.fa-flag {
                width: 28px !important;
                height: 28px !important;
            }
        }

        /* -- comments: flag + collapse pinned top right, so the header never wraps around them -- */
        html body #wpdcom .wpd-comment-right {
            position: relative !important;
        }
        html body #wpdcom .wpd-comment-header {
            position: relative !important;
            padding-right: 72px !important;
            min-height: 30px !important;
        }
        html body #wpdcom .md-col {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            margin: 0 !important;
        }
        html body #wpdcom .md-flag {
            position: absolute !important;
            top: 0 !important;
            right: 36px !important;
            margin: 0 !important;
        }
        html[data-md-page="overview"] .post-rating,
        html[data-md-page="overview"] .post-rating .score,
        html[data-md-page="overview"] .post-total-rating .score {
            color: var(--ink) !important;
        }
    `;

    function injectStyles() {
        if (!document.getElementById('md-fonts')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'md-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500..900&family=JetBrains+Mono:wght@500;700;800&display=swap';
            (document.head || root).appendChild(fontLink);
        }

        let style = document.getElementById('neobrutalism-mangaread-css');
        if (!style) {
            style = document.createElement('style');
            style.id = 'neobrutalism-mangaread-css';
            style.textContent = cssMangaRead;
            (document.head || root).appendChild(style);
        }
        if (style.parentNode && style.parentNode.lastElementChild !== style) {
            style.parentNode.appendChild(style);
        }
    }

    /* ====================================================================
     *  LAYER 3: MUTATIONOBSERVER & ACTIVE AD CONTAINER PURGING
     * ==================================================================== */
    const PURGE_SELECTORS = [
        '.ad', '.c-ads', '.body-top-ads', '.body-bottom-ads',
        '.code-block', 'div[class*="code-block"]', 'ins.pubadx-slot', '[class*="bg-ssp-"]',
        '[class*="pax3v3c-"]', '[class*="bg-container-"]',
        'iframe[data-aa]', 'iframe[src*="a-ads.com"]',
        'iframe[src*="doubleclick" i]', 'iframe[src*="googlesyndication" i]', 'iframe[src*="adservice" i]',
        'ins.adsbygoogle', '[id^="div-gpt-ad"]',
        'div[id^="yandex_rtb"]', '[id^="ya_"]',
        '.pubadx-adcash-sticky', '#custom_html-3', '#custom_html-4',
        '#custom_html-5', '#block-3', '.the_champ_sharing_container',
        '.the_champ_outer_login_container', '#wp-bug-reporter', '.modal-bug-report',
        '.c-modal_item', '.c-modal_sign-in', '.c-modal_sign-up',
        '#form-login', '#form-sign-up',
        '#wpdcom .wpd-form-wrap', '#wpdcom .wpd-auth', '#wpdcom .wpd-reply-button',
        '#menu-item-107397', '#nav-menu-item-107397',
        'li:has(> a[href*="chat-mangaread"])', 'li:has(> a[href*="/chat"])',
        'a[href*="chat-mangaread"]', 'a[href*="/chat/"]',
        '.chat-container', '#chat', '#cbox',
        'iframe[src*="chat"]', 'iframe[src*="minnit"]', 'iframe[src*="cbox"]', 'iframe[src*="rumbletalk"]',
        '.go-to-top',
        '#subpanel', 'dialog.reader-membership-promo', '#popcont', '.payment-widget',
        'script[data-reader-ad-src]', 'script[data-reader-ad-inline]'
    ].join(', ');

    function purgeAdContainers(rootEl = document) {
        if (!rootEl || !rootEl.querySelectorAll) return;
        try {
            if (document.documentElement && document.documentElement.classList.contains('reader-membership-open')) {
                document.documentElement.classList.remove('reader-membership-open');
                document.documentElement.style.overflow = 'auto';
            }
            rootEl.querySelectorAll(PURGE_SELECTORS).forEach(el => el.remove());
            rootEl.querySelectorAll('a[href*="chat-mangaread"], a[href*="/chat/"]').forEach(a => {
                const li = a.closest('li');
                if (li) li.remove();
                else a.remove();
            });
            if (document.body) {
                // Kill native auto-scroll on reading content click
                if (document.body.classList.contains('click-to-scroll')) {
                    document.body.classList.remove('click-to-scroll');
                }
                // Purge high z-index overlay traps
                document.querySelectorAll('body > div').forEach(div => {
                    if (div.id && div.id.startsWith('md-')) return;
                    if (div.classList.contains('site-wrap') || div.classList.contains('site-content') ||
                        div.classList.contains('site-header') || div.classList.contains('wrap')) return;
                    const style = getComputedStyle(div);
                    if (style.position === 'fixed' && +style.zIndex >= 999 && div.offsetWidth >= window.innerWidth * 0.85) {
                        div.remove();
                    }
                });
                if (document.body.style.overflow === 'hidden') document.body.style.overflow = 'auto';
                if (document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = 'auto';
            }
        } catch (e) {
            console.warn('[MD] purgeAdContainers error:', e);
        }
    }

    /* ====================================================================
     *  LAYER 4: READER CONTENT SANITIZER
     * ==================================================================== */
    function sanitizeReaderContent() {
        const rc = $('.reading-content');
        if (!rc) return;
        Array.from(rc.children).forEach(child => {
            if (!child.classList.contains('page-break') && child.id !== 'wp-manga-current-chap') {
                child.remove();
            }
        });
        rc.querySelectorAll('.page-break').forEach(pb => {
            Array.from(pb.children).forEach(node => {
                if (node.tagName !== 'IMG') node.remove();
            });
        });
    }

    function fixCommentImages() {
        $$('#wpdcom img[wmu-data-src], #comments img[wmu-data-src]').forEach(img => {
            const realSrc = img.getAttribute('wmu-data-src');
            if (realSrc && (!img.src || img.src.startsWith('data:image'))) {
                img.src = realSrc;
            }
        });
        $$('#wpdcom .wpd-comment-text, #comments .wpd-comment-text').forEach(t => {
            if (t.dataset.mdMediaChecked) return;
            t.dataset.mdMediaChecked = '1';
            const links = $$('a', t);
            if (links.length === 1 && !t.querySelector('img')) {
                const href = links[0].getAttribute('href') || links[0].textContent.trim();
                if (/\.(gif|jpe?g|png|webp)(\?.*)?$/i.test(href) || /(media\.giphy\.com|c\.tenor\.com|i\.imgur\.com)/i.test(href)) {
                    const im = document.createElement('img');
                    im.src = href;
                    im.style.maxWidth = '100%';
                    im.style.maxHeight = '320px';
                    im.style.display = 'block';
                    im.style.borderRadius = '6px';
                    im.style.marginTop = '6px';
                    im.style.border = '2px solid var(--bd)';
                    t.appendChild(im);
                }
            }
        });
    }

    function cleanCardTitles() {
        $$('.post-title h3 a, .post-title h4 a, .post-title h1, h5.widget-title a').forEach(a => {
            const raw = a.textContent.trim();
            if (raw && raw === raw.toUpperCase() && raw.length > 3) {
                a.textContent = toTitleCase(raw);
            }
        });
    }

    function getImgSrc(img) {
        if (!img) return '';
        const cand = [
            img.getAttribute('data-src'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-original'),
            img.getAttribute('wmu-data-src'),
            img.getAttribute('src'),
            img.currentSrc,
            img.src
        ];
        for (const c of cand) {
            if (!c) continue;
            const s = String(c).trim();
            if (s && !s.startsWith('data:image/svg') && !s.startsWith('data:image/gif;base64,R0lGODlhAQAB')) {
                return s;
            }
        }
        return (img.getAttribute('src') || img.src || '').trim();
    }

    /* ====================================================================
     *  SITE ADAPTER: SEL_MANGAREAD
     * ==================================================================== */
    const SEL_MANGAREAD = {
        host: () => $('.listing-chapters_wrap') || $('.page-content-listing.single-page') || $('.listing-chapters_wrap.show-more'),
        links: host => $$('ul.main.version-chap li.wp-manga-chapter a', host || document),
        label: a => a.textContent.replace(/\s+/g, ' ').trim(),
        series: (doc, box) => {
            const h = $('.post-title h1', doc) || $('h1.entry-title', doc) || $('h1', doc);
            return (h ? h.textContent : document.title).replace(/\s+/g, ' ').trim();
        },
        pages: (doc, url) => {
            const imgs = $$('.reading-content img.wp-manga-chapter-img', doc);
            if (imgs.length) {
                return imgs.map(getImgSrc)
                    .filter(Boolean)
                    .map(u => new URL(u, url || location.href).href);
            }
            return [];
        },
        framePages: doc => $$('.reading-content img.wp-manga-chapter-img', doc),
    };

    /* ====================================================================
     *  PKZIP & CRC32 ARCHIVE CREATION (Pure JS)
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

    function sniffExt(u8, url) {
        const s = (i, n) => String.fromCharCode(...u8.subarray(i, i + n));
        if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'webp';
        if (u8[0] === 0xFF && u8[1] === 0xD8) return 'jpg';
        if (u8[0] === 0x89 && s(1, 3) === 'PNG') return 'png';
        if (s(0, 3) === 'GIF') return 'gif';
        if (s(4, 8) === 'ftypavif') return 'avif';
        const m = url.split('?')[0].match(/\.(webp|jpe?g|png|gif|avif)$/i);
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    }

    const getGM = () =>
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
            : (typeof GM !== 'undefined' && GM.xmlHttpRequest ? GM.xmlHttpRequest.bind(GM) : null);

    function fetchBuf(url, ctl) {
        return new Promise((resolve, reject) => {
            if (ctl && ctl.cancelled) return reject(new Error('cancelled'));
            const gm = getGM();
            if (!gm) {
                const ac = new AbortController();
                if (ctl) ctl.aborts.add(() => ac.abort());
                return fetch(url, { credentials: 'omit', signal: ac.signal })
                    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
                    .then(resolve, reject);
            }
            const h = gm({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { Referer: (ctl && ctl.referer) || location.origin + '/' },
                onload: r => (r.status >= 200 && r.status < 300 && r.response) ? resolve(r.response) : reject(new Error('HTTP ' + r.status)),
                onerror: () => reject(new Error('network error')),
                ontimeout: () => reject(new Error('timeout')),
                onabort: () => reject(new Error('cancelled')),
            });
            if (ctl) ctl.aborts.add(() => { try { h && h.abort && h.abort(); } catch (_) {} });
        });
    }

    async function fetchPage(url, ctl) {
        let err;
        for (let i = 0; i < 3; i++) {
            try {
                return new Uint8Array(await fetchBuf(url, ctl));
            } catch (e) {
                err = e;
                if (ctl && ctl.cancelled) throw e;
                await sleep(400 * (i + 1));
            }
        }
        throw err;
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function packCbz(ctx, out, srcs) {
        if (ctx.raw) return { raw: true, pages: out, srcs, label: ctx.label || 'Chapter ' + ctx.num, num: ctx.num, series: ctx.series };
        const total = srcs.length;
        const width = Math.max(3, String(total).length);
        const entries = out.map((data, i) => ({
            name: String(i + 1).padStart(width, '0') + '.' + sniffExt(data, srcs[i]),
            data
        }));
        const info =
            '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n' +
            `  <Title>${xmlEsc(ctx.label || 'Chapter ' + ctx.num)}</Title>\n  <Series>${xmlEsc(ctx.series)}</Series>\n` +
            (ctx.num ? `  <Number>${xmlEsc(ctx.num)}</Number>\n` : '') +
            `  <Web>${xmlEsc(ctx.url || location.href)}</Web>\n  <PageCount>${total}</PageCount>\n  <LanguageISO>en</LanguageISO>\n</ComicInfo>\n`;
        entries.push({ name: 'ComicInfo.xml', data: new TextEncoder().encode(info) });

        let filename;
        if (ctx.num) {
            const [whole, frac] = ctx.num.split('.');
            filename = `${safeName(ctx.series)} - Chapter ${whole.padStart(3, '0')}${frac ? '.' + frac : ''}.cbz`;
        } else {
            filename = `${safeName(ctx.series)} - ${safeName(ctx.label || 'Chapter')}.cbz`;
        }
        return { blob: makeZip(entries), filename };
    }

    async function buildCbz(ctx, onProgress, ctl) {
        const srcs = ctx.srcs || pageImages();
        if (!srcs.length) throw new Error('no pages found');
        const total = srcs.length, out = new Array(total);
        let next = 0, done = 0;
        const worker = async () => {
            while (next < total && !ctl.cancelled) {
                const i = next++;
                out[i] = await fetchPage(srcs[i], ctl);
                onProgress(++done, total);
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONFIG.reader.concurrency, total) }, worker));
        if (ctl.cancelled) throw new Error('cancelled');
        return packCbz(ctx, out, srcs);
    }

    /* PDF creation helper */
    function jpegInfo(u8) {
        if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
        let i = 2;
        while (i + 9 < u8.length) {
            if (u8[i] !== 0xFF) { i++; continue; }
            const m = u8[i + 1];
            if (m === 0xFF) { i++; continue; }
            if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
            if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
                return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
            i += 2 + ((u8[i + 2] << 8) | u8[i + 3]);
        }
        return null;
    }
    async function toJpegPart(u8) {
        const inf = jpegInfo(u8);
        if (inf && (inf.comps === 1 || inf.comps === 3) && inf.w && inf.h) return { blob: new Blob([u8]), w: inf.w, h: inf.h, gray: inf.comps === 1 };
        const bmp = await createImageBitmap(new Blob([u8]));
        const k = Math.min(1, 16000 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(bmp, 0, 0, c.width, c.height);
        const W = c.width, H = c.height;
        if (bmp.close) bmp.close();
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
        if (!blob) throw new Error('could not convert a page');
        c.width = c.height = 1;
        return { blob, w: W, h: H, gray: false };
    }
    function buildPdf(chapters, title) {
        const enc = new TextEncoder(), parts = [], offs = [];
        let off = 0;
        const w = x => { parts.push(x); off += x.size !== undefined ? x.size : x.length; };
        const ws = s => w(enc.encode(s));
        const hex16 = s => { let o = '<FEFF'; for (let i = 0; i < s.length; i++) o += s.charCodeAt(i).toString(16).padStart(4, '0'); return o + '>'; };
        ws('%PDF-1.4\n%âãÏÓ\n');
        let id = 4;
        const kids = [], marks = [];
        for (const ch of chapters) {
            let first = null;
            for (const im of ch.imgs) {
                let W = im.w * 0.75, H = im.h * 0.75;
                const k = Math.min(1, 14400 / Math.max(W, H)); W = +(W * k).toFixed(2); H = +(H * k).toFixed(2);
                const iid = id++, cid = id++, pid = id++;
                offs[iid] = off;
                ws(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.gray ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.blob.size} >>\nstream\n`);
                w(im.blob); ws('\nendstream\nendobj\n');
                const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
                offs[cid] = off; ws(`${cid} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
                offs[pid] = off; ws(`${pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`);
                kids.push(pid); if (first === null) first = pid;
            }
            if (first !== null) marks.push({ title: ch.label, page: first, id: id++ });
        }
        marks.forEach((m, i) => {
            offs[m.id] = off;
            ws(`${m.id} 0 obj\n<< /Title ${hex16(m.title)} /Parent 3 0 R${i ? ` /Prev ${marks[i - 1].id} 0 R` : ''}${i < marks.length - 1 ? ` /Next ${marks[i + 1].id} 0 R` : ''} /Dest [${m.page} 0 R /Fit] >>\nendobj\n`);
        });
        offs[3] = off;
        ws(marks.length ? `3 0 obj\n<< /Type /Outlines /First ${marks[0].id} 0 R /Last ${marks[marks.length - 1].id} 0 R /Count ${marks.length} >>\nendobj\n` : '3 0 obj\n<< /Type /Outlines /Count 0 >>\nendobj\n');
        offs[2] = off; ws(`2 0 obj\n<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>\nendobj\n`);
        offs[1] = off; ws('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R /PageMode /UseOutlines >>\nendobj\n');
        const info = id++;
        offs[info] = off; ws(`${info} 0 obj\n<< /Title ${hex16(title)} /Producer (Neobrutalism userscript) >>\nendobj\n`);
        const xref = off;
        ws(`xref\n0 ${id}\n0000000000 65535 f \n`);
        for (let n = 1; n < id; n++) ws(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
        ws(`trailer\n<< /Size ${id} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    /* ====================================================================
     *  MULTI-CHAPTER SELECT & BATCH DOWNLOADER
     * ==================================================================== */
    function setupSelect(box, A = SEL_MANGAREAD) {
        const list = A.host();
        if (!list || $('#md-sel-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'md-sel-bar';
        bar.innerHTML =
            '<button type="button" data-s="toggle" aria-pressed="false">Select</button>' +
            '<span class="md-sel-tools" hidden style="display:contents">' +
            '<button type="button" data-s="all">Select all</button>' +
            '<button type="button" data-s="inv">Select unselected</button>' +
            '<button type="button" class="md-sel-dl" data-s="dl-zip">Download .zip</button>' +
            '<button type="button" class="md-sel-dl" data-s="dl-pdf">Download .pdf</button>' +
            '<span class="md-sel-count"></span>' +
            '</span>';

        list.parentNode.insertBefore(bar, list);

        const tools = $('.md-sel-tools', bar);
        const toggleBtn = $('[data-s="toggle"]', bar);
        const countSpan = $('.md-sel-count', bar);
        let curJob = null;
        let lastIdx = -1;

        const links = () => A.links(list);
        const chosen = () => links().filter(a => a.hasAttribute('data-md-sel'));

        function setMode(active) {
            list.toggleAttribute('data-md-select', active);
            toggleBtn.setAttribute('aria-pressed', String(active));
            toggleBtn.textContent = active ? 'Done' : 'Select';
            tools.hidden = !active;
            if (!active) {
                links().forEach(a => setSel(a, false));
                refresh();
            }
        }

        function setSel(a, on) {
            if (on) a.setAttribute('data-md-sel', '1');
            else a.removeAttribute('data-md-sel');
            const li = a.closest('li.wp-manga-chapter') || a.parentElement;
            if (li) {
                if (on) li.setAttribute('data-md-sel', '1');
                else li.removeAttribute('data-md-sel');
            }
            let ck = li ? li.querySelector('.md-ck') : (a.parentElement ? a.parentElement.querySelector('.md-ck') : null);
            if (ck) ck.checked = on;
        }

        function refresh() {
            const sel = chosen();
            countSpan.textContent = sel.length ? `${sel.length} selected` : '';
        }

        function syncCheckboxes() {
            links().forEach((a, idx) => {
                let ck = a.parentElement.querySelector('.md-ck');
                if (!ck) {
                    ck = document.createElement('input');
                    ck.type = 'checkbox';
                    ck.className = 'md-ck';
                    a.parentElement.insertBefore(ck, a);
                    ck.addEventListener('click', e => {
                        e.stopPropagation();
                        if (e.shiftKey && lastIdx >= 0) {
                            const all = links();
                            const [lo, hi] = [Math.min(lastIdx, idx), Math.max(lastIdx, idx)];
                            for (let i = lo; i <= hi; i++) setSel(all[i], ck.checked);
                        } else {
                            setSel(a, ck.checked);
                        }
                        lastIdx = idx;
                        refresh();
                    });
                }
                ck.checked = a.hasAttribute('data-md-sel');
            });
        }

        list.addEventListener('click', e => {
            if (!list.hasAttribute('data-md-select')) return;
            const a = e.target.closest('a');
            if (!a || !links().includes(a)) return;
            e.preventDefault();
            e.stopPropagation();
            const all = links(), idx = all.indexOf(a);
            if (e.shiftKey && lastIdx >= 0) {
                const [lo, hi] = [Math.min(lastIdx, idx), Math.max(lastIdx, idx)];
                const state = !a.hasAttribute('data-md-sel');
                for (let i = lo; i <= hi; i++) setSel(all[i], state);
            } else {
                setSel(a, !a.hasAttribute('data-md-sel'));
            }
            lastIdx = idx;
            refresh();
        });

        async function fetchChapterPages(a, ctl) {
            const href = a.getAttribute('href');
            const url = new URL(href, location.href).href;
            const res = await fetchBuf(url, ctl);
            const html = new TextDecoder('utf-8').decode(res);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const srcs = A.pages(doc, url);
            if (!srcs.length) throw new Error('no images found');
            const lbl = A.label(a);
            const num = ((lbl.match(/[\d]+(?:\.\d+)?/) || [])[0]) || '';
            const ser = A.series(doc, list);
            return { srcs, label: lbl, num, series: ser, url };
        }

        async function downloadBatch(fmt = 'zip') {
            const sel = chosen();
            if (!sel.length) return toast('No chapters selected');
            if (curJob) {
                curJob.cancelled = true;
                curJob.aborts.forEach(f => f());
                return;
            }

            const ctl = curJob = { cancelled: false, aborts: new Set() };
            const dlBtn = $(`[data-s="dl-${fmt}"]`, bar);
            dlBtn.dataset.state = 'busy';

            const total = sel.length;
            const entries = [], pdfChapters = [];
            let seriesTitle = '';

            try {
                for (let i = 0; i < total && !ctl.cancelled; i++) {
                    const a = sel[i];
                    dlBtn.style.setProperty('--p', Math.round((i / total) * 100) + '%');
                    dlBtn.textContent = `Ch ${i + 1}/${total} · Cancel`;

                    let chapData = null;
                    try {
                        chapData = await fetchChapterPages(a, ctl);
                        seriesTitle = seriesTitle || chapData.series;
                        const out = [];
                        for (let j = 0; j < chapData.srcs.length && !ctl.cancelled; j++) {
                            out.push(await fetchPage(chapData.srcs[j], ctl));
                        }

                        if (fmt === 'pdf') {
                            const imgs = [];
                            for (let k = 0; k < out.length; k++) {
                                imgs.push(await toJpegPart(out[k]));
                            }
                            pdfChapters.push({ label: chapData.label, imgs });
                        } else {
                            const cbzRes = packCbz(chapData, out, chapData.srcs);
                            const buf = await cbzRes.blob.arrayBuffer();
                            entries.push({ name: cbzRes.filename, data: new Uint8Array(buf) });
                        }
                        setSel(a, false);
                        refresh();
                    } catch (e) {
                        console.warn('[MD] batch download error on chapter:', A.label(a), e);
                    }
                }

                if (ctl.cancelled) return toast('Download cancelled');

                dlBtn.style.setProperty('--p', '100%');
                if (fmt === 'pdf' && pdfChapters.length) {
                    const pdfBlob = buildPdf(pdfChapters, seriesTitle || 'Chapters');
                    saveBlob(pdfBlob, `${safeName(seriesTitle || 'Chapters')} - ${pdfChapters.length} chapters.pdf`);
                    toast('Saved PDF archive', 3500);
                } else if (fmt === 'zip' && entries.length) {
                    const zipBlob = makeZip(entries);
                    saveBlob(zipBlob, `${safeName(seriesTitle || 'Chapters')} - ${entries.length} chapters.zip`);
                    toast('Saved ZIP archive', 3500);
                } else {
                    toast('Download failed', 4000);
                }
            } finally {
                curJob = null;
                dlBtn.removeAttribute('data-state');
                dlBtn.textContent = fmt === 'pdf' ? 'Download .pdf' : 'Download .zip';
                refresh();
            }
        }

        bar.addEventListener('click', e => {
            const b = e.target.closest('button[data-s]');
            if (!b) return;
            switch (b.dataset.s) {
                case 'toggle': setMode(!list.hasAttribute('data-md-select')); break;
                case 'all': links().forEach(a => setSel(a, true)); refresh(); break;
                case 'inv': links().forEach(a => setSel(a, !a.hasAttribute('data-md-sel'))); refresh(); break;
                case 'dl-zip': downloadBatch('zip'); break;
                case 'dl-pdf': downloadBatch('pdf'); break;
            }
        });

        syncCheckboxes();
        bar.__sync = () => { syncCheckboxes(); refresh(); };
    }

    /* ====================================================================
     *  READER CHROME & DOCK ENGINE
     * ==================================================================== */
    const reader = { zoom: 1, bg: 'paper', dock: null, dl: null, init: false, job: null };
    const BGS = ['paper', 'dark', 'black'];

    function pageImages() {
        return $$('.reading-content img.wp-manga-chapter-img')
            .map(i => (i.getAttribute('src') || i.currentSrc || i.src || '').trim())
            .filter(Boolean);
    }

    function applyZoom(z) {
        const steps = CONFIG.reader.zoomSteps;
        reader.zoom = Math.min(steps[steps.length - 1], Math.max(steps[0], z));
        root.style.setProperty('--md-zoom', reader.zoom);
        store.set('zoom', reader.zoom);
        const lbl = $('#md-dock .md-zoom');
        if (lbl) lbl.textContent = Math.round(reader.zoom * 100) + '%';
    }

    function stepZoom(dir) {
        const steps = CONFIG.reader.zoomSteps;
        let i = steps.findIndex(s => Math.abs(s - reader.zoom) < 0.001);
        if (i < 0) i = steps.reduce((b, s, k) => Math.abs(s - reader.zoom) < Math.abs(steps[b] - reader.zoom) ? k : b, 0);
        applyZoom(steps[Math.min(steps.length - 1, Math.max(0, i + dir))]);
    }

    function paintBg() {
        let eff = reader.bg;
        if (eff === 'paper' && root.dataset.mdTheme === 'dark') eff = 'dark';
        root.dataset.mdBg = eff;
    }

    function applyBg(name) {
        reader.bg = BGS.includes(name) ? name : 'paper';
        store.set('bg', reader.bg);
        paintBg();
    }

    function cycleBg() {
        const dark = root.dataset.mdTheme === 'dark';
        const list = dark ? ['dark', 'black'] : BGS;
        const cur = dark && reader.bg === 'paper' ? 'dark' : reader.bg;
        applyBg(list[(list.indexOf(cur) + 1) % list.length]);
        toast('Background: ' + reader.bg);
    }

    function chapterContext(doc = document, url = location.href) {
        const imgs = $$('.reading-content img.wp-manga-chapter-img', doc);
        const srcs = imgs.map(i => (i.getAttribute('src') || i.currentSrc || i.src || '').trim()).filter(Boolean);

        const sel = $('select.single-chapter-select', doc);
        const opts = sel ? [...sel.options] : [];
        const curIdx = sel ? Math.max(0, opts.findIndex(o => o.selected)) : -1;

        const crumbSeries = $('div.c-breadcrumb ol.breadcrumb li:nth-child(2) a', doc);
        const titleEl = crumbSeries || $('.post-title h1', doc) || $('.entry-title', doc);
        let series = titleEl ? titleEl.textContent.trim() : document.title.split(' - ')[0].trim();

        let label = '';
        if (sel && opts[curIdx]) {
            label = opts[curIdx].textContent.trim();
        } else {
            const breadChap = $('div.c-breadcrumb ol.breadcrumb li.active', doc);
            label = breadChap ? breadChap.textContent.trim() : '';
        }
        const num = ((label.match(/[\d]+(?:\.\d+)?/) || [])[0]) || '';

        const prevA = $('div.nav-previous a.btn.prev_page', doc) || $('a.prev_page', doc);
        const nextA = $('div.nav-next a.btn.next_page', doc) || $('a.next_page', doc);
        const prev = prevA ? prevA.href : null;
        const next = nextA ? nextA.href : null;
        const seriesUrl = crumbSeries ? crumbSeries.href : (location.pathname.replace(/\/[^/]+\/?$/, '/') || '/');

        return {
            series,
            label: label || (num ? 'Chapter ' + num : 'Chapter'),
            num,
            prev,
            next,
            seriesUrl,
            url,
            srcs
        };
    }

    function setDl(state, label, pct) {
        const b = reader.dl;
        if (!b) return;
        b.dataset.state = state;
        b.style.setProperty('--p', (pct || 0) + '%');
        const icon = state === 'busy' ? ICON.stop : state === 'done' ? ICON.check : state === 'error' ? ICON.refresh : ICON.down;
        b.innerHTML = `${icon}<span class="md-lbl">${label}</span>`;
        b.title = state === 'busy' ? 'Click to cancel' : 'Download this chapter as .cbz (Mihon compatible)';
    }

    async function toggleDownload() {
        if (reader.job) {
            reader.job.cancelled = true;
            reader.job.aborts.forEach(f => f());
            return;
        }
        const ctl = reader.job = { cancelled: false, aborts: new Set() };
        const ctx = chapterContext();
        setDl('busy', '0/' + ctx.srcs.length, 0);
        try {
            const { blob, filename } = await buildCbz(ctx, (n, t) => setDl('busy', `${n}/${t}`, Math.round(n / t * 100)), ctl);
            saveBlob(blob, filename);
            setDl('done', 'Saved');
            toast('Saved ' + filename, 3500);
        } catch (e) {
            if (ctl.cancelled) {
                setDl('idle', 'CBZ');
                toast('Download cancelled');
            } else {
                setDl('error', 'Retry');
                toast('Download failed: ' + e.message, 4500);
            }
        } finally {
            reader.job = null;
            if (reader.dl && reader.dl.dataset.state === 'done') {
                setTimeout(() => { if (!reader.job) setDl('idle', 'CBZ'); }, 3000);
            }
        }
    }

    const TAP_IGNORE = 'a, button, input, select, textarea, label, summary, details, dialog, iframe, [role="button"], #md-dock, #md-toast, #md-top, #md-rbar, header';

    function headerAutoHide() {
        if (!CONFIG.readerHeaderAutoHide) return;
        let last = scrollY;
        addEventListener('scroll', () => {
            const y = scrollY, dy = y - last;
            if (Math.abs(dy) < 8) return;
            last = y;
            const hdr = $('header.site-header');
            const busy = hdr && hdr.contains(document.activeElement);
            if (busy || y < 80 || dy < 0) delete root.dataset.mdNavhide;
            else root.dataset.mdNavhide = '1';
        }, { passive: true });
    }

    function readerChrome(dock, isBusyFn) {
        const tapMode = CONFIG.readerDockOnTap;
        const isBusy = () => !!(isBusyFn && isBusyFn());
        const shown = () => !dock.classList.contains('hide');
        let openY = scrollY, last = scrollY;
        const show = on => {
            dock.classList.toggle('hide', !on);
            document.documentElement.classList.toggle('md-chrome-on', on);
            if (on) openY = scrollY;
        };

        if (tapMode) {
            dock.classList.add('hide');
            document.addEventListener('click', e => {
                if (e.button !== 0) return;
                const t = e.target;
                if (!(t instanceof Element) || t.closest(TAP_IGNORE)) return;
                const sel = getSelection();
                if (sel && !sel.isCollapsed && String(sel).trim()) return;
                show(!shown());
            }, true);
            addEventListener('keydown', e => {
                if (e.key === 'Escape' && shown() && !isBusy()) show(false);
            });
        }

        addEventListener('scroll', () => {
            const y = scrollY, dy = y - last;
            if (Math.abs(dy) < 8) return;
            last = y;
            if (tapMode) {
                if (CONFIG.dockHideOnScroll && shown() && dy > 0 && y - openY > CONFIG.dockScrollPx && !isBusy()) show(false);
            } else {
                const nearEnd = innerHeight + y >= document.documentElement.scrollHeight - 320;
                dock.classList.toggle('hide', dy > 0 && y > 240 && !nearEnd && !isBusy());
            }
        }, { passive: true });

        if (!readerChrome.nav) {
            readerChrome.nav = true;
            headerAutoHide();
        }
    }

    function buildDock(ctx) {
        if (reader.dock) return;
        const d = reader.dock = document.createElement('div');
        d.id = 'md-dock';

        const btn = (act, icon, title, label) =>
            `<button type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon}${label ? `<span class="md-lbl">${label}</span>` : ''}</button>`;

        d.innerHTML =
            btn('prev', ICON.prev, 'Previous chapter (←)') +
            btn('next', ICON.next, 'Next chapter (→)') +
            '<span class="md-sep"></span>' +
            btn('zoom-out', ICON.minus, 'Zoom out (-)') +
            '<button type="button" class="md-zoom" data-act="zoom-reset" title="Reset zoom (0)" aria-label="Reset zoom">100%</button>' +
            btn('zoom-in', ICON.plus, 'Zoom in (+)') +
            '<span class="md-sep"></span>' +
            btn('bg', ICON.bg, 'Background colour (B)') +
            '<button type="button" class="md-dl" data-act="download"></button>';

        document.body.appendChild(d);

        reader.dl = $('.md-dl', d);
        setDl('idle', 'CBZ');
        $('[data-act="prev"]', d).disabled = !ctx.prev;
        $('[data-act="next"]', d).disabled = !ctx.next;

        d.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            const cur = chapterContext();
            switch (b.dataset.act) {
                case 'prev': if (cur.prev) location.href = cur.prev; break;
                case 'next': if (cur.next) location.href = cur.next; break;
                case 'zoom-out': stepZoom(-1); break;
                case 'zoom-in': stepZoom(1); break;
                case 'zoom-reset': applyZoom(1); break;
                case 'bg': cycleBg(); break;
                case 'download': toggleDownload(); break;
            }
        });

        readerChrome(d, () => !!reader.job);

        addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const a = document.activeElement;
            if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
            const cur = chapterContext();
            if (e.key === 'ArrowLeft' && cur.prev) location.href = cur.prev;
            else if (e.key === 'ArrowRight' && cur.next) location.href = cur.next;
            else if (e.key === '-' || e.key === '_') stepZoom(-1);
            else if (e.key === '+' || e.key === '=') stepZoom(1);
            else if (e.key === '0') applyZoom(1);
            else if (e.key === 'b' || e.key === 'B') cycleBg();
        });
    }

    function syncDockSelect(dock) {
        if (!dock) return;
        const ctx = chapterContext();
        const prevBtn = $('[data-act="prev"]', dock);
        const nextBtn = $('[data-act="next"]', dock);
        if (prevBtn) prevBtn.disabled = !ctx.prev;
        if (nextBtn) nextBtn.disabled = !ctx.next;

        const srcSel = $('select.single-chapter-select');
        if (!srcSel || srcSel.options.length <= 1) return;
        let cs = $('.md-chap', dock);
        if (!cs) {
            cs = document.createElement('select');
            cs.className = 'md-chap';
            cs.title = 'Jump to chapter';
            cs.setAttribute('aria-label', 'Jump to chapter');
            cs.addEventListener('change', () => {
                if (cs.value) location.href = cs.value;
            });
            const nextEl = $('[data-act="next"]', dock);
            if (nextEl) nextEl.after(cs);
            else dock.appendChild(cs);
        }
        if (cs.options.length !== srcSel.options.length) {
            cs.innerHTML = '';
            for (const opt of srcSel.options) {
                const o = document.createElement('option');
                let val = opt.dataset.redirect || opt.value;
                if (val && !/^https?:\/\//i.test(val) && ctx.seriesUrl) {
                    try { val = new URL(val, ctx.seriesUrl).href; } catch (e) {}
                }
                o.value = val;
                o.textContent = opt.textContent.trim();
                if (opt.selected) o.selected = true;
                cs.appendChild(o);
            }
        } else if (srcSel.selectedIndex >= 0 && cs.selectedIndex !== srcSel.selectedIndex) {
            cs.selectedIndex = srcSel.selectedIndex;
        }
    }

    function setupReader() {
        if (location.search.includes('style=paged') || (document.body && document.body.classList.contains('manga-reading-paged-style'))) {
            const u = new URL(location.href);
            if (u.searchParams.get('style') === 'paged') {
                u.searchParams.delete('style');
                location.replace(u.href);
                return;
            }
        }
        const ctx = chapterContext();
        if (!reader.init) {
            reader.init = true;
            applyBg(store.get('bg', 'paper'));
            applyZoom(store.get('zoom', 1));
        }
        buildDock(ctx);
        syncDockSelect(reader.dock);
        sanitizeReaderContent();
    }

    /* ====================================================================
     *  THEME SWITCHER
     * ==================================================================== */
    function setupThemeToggle() {
        if (!document.body) return;
        let b = document.getElementById('md-theme');
        if (!b) {
            b = document.createElement('button');
            b.id = 'md-theme';
            b.type = 'button';
            b.setAttribute('role', 'switch');
            const icons = `<span class="md-th-sun">${ICON.sun}</span><span class="md-th-moon">${ICON.moon}</span>`;
            b.innerHTML = `<span class="md-th-i">${icons}</span><span class="md-th-sw"><span class="md-th-knob">${icons}</span></span>`;
            b.addEventListener('click', e => {
                setTheme(root.dataset.mdTheme === 'dark' ? 'light' : 'dark');
                if (e.detail > 0) b.blur();
            });
            setTheme(root.dataset.mdTheme, false);
        }

        const rbSlot = document.querySelector('#md-rbar .md-rb-theme');
        if (rbSlot) {
            if (b.parentNode !== rbSlot) rbSlot.appendChild(b);
            return;
        }

        const searchUl = $('header.site-header ul.main-menu-search') || $('.search-navigation .main-menu-search');
        if (searchUl) {
            let li = searchUl.querySelector('li.menu-theme');
            if (!li) {
                li = document.createElement('li');
                li.className = 'menu-theme';
                searchUl.appendChild(li);
            }
            if (b.parentNode !== li) {
                li.appendChild(b);
            }
        } else {
            const hdr = $('header.site-header .c-header__top') || $('header.site-header') || document.body;
            if (hdr && b.parentNode !== hdr) {
                hdr.appendChild(b);
            }
        }
    }

    /* ====================================================================
     *  EXTRAS (Back to Top & Search Focus)
     * ==================================================================== */
    function addExtras() {
        if (CONFIG.backToTop && PAGE() !== 'chapter' && !document.getElementById('md-top')) {
            const b = document.createElement('button');
            b.id = 'md-top';
            b.type = 'button';
            b.textContent = '↑';
            b.setAttribute('aria-label', 'Back to top');
            b.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
            document.body.appendChild(b);
            addEventListener('scroll', () => b.classList.toggle('show', scrollY > 800), { passive: true });
        }
    }

    addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
        const input = $('form#blog-post-search input[name="s"]') || $('input[name="s"]');
        if (input) {
            e.preventDefault();
            input.focus();
            input.select();
        }
    });

    /* ====================================================================
     *  NETFLIX-STYLE HERO CAROUSEL (#md-hero)
     * ==================================================================== */
    function buildHero() {
        const isHome = PAGE() === 'list' && (location.pathname === '/' || location.pathname === '' || /^\/(index\.php)?$/i.test(location.pathname));
        if (!isHome) return;

        const carousel = document.querySelector('#manga-popular-slider-8, .popular-slider, .widget-manga-popular-slider');
        if (!carousel) return;

        const slideNodes = carousel.querySelectorAll('.slider__item');
        if (!slideNodes || slideNodes.length === 0) return;

        const seen = new Set();
        const items = [];

        function upscaleSrc(url) {
            if (!url) return '';
            return url.replace(/-\d+x\d+(\.\w+)$/i, '$1');
        }

        for (const node of slideNodes) {
            const aTitle = node.querySelector('.post-title h4 a, .post-title a');
            const aThumb = node.querySelector('.slider__thumb a');
            const aLink = aTitle || aThumb;
            if (!aLink) continue;

            const href = aLink.href || aLink.getAttribute('href');
            if (!href || seen.has(href)) continue;

            const img = node.querySelector('.slider__thumb img, img');
            let src = '';
            if (img) {
                const srcset = img.getAttribute('srcset') || '';
                if (srcset) {
                    const parts = srcset.split(',').map(s => s.trim().split(/\s+/));
                    parts.sort((a, b) => {
                        const wa = parseInt(a[1]) || 0;
                        const wb = parseInt(b[1]) || 0;
                        return wb - wa;
                    });
                    if (parts[0] && parts[0][0]) src = parts[0][0];
                }
                if (!src) {
                    src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
                }
                src = upscaleSrc(src);
            }
            if (!src || src.startsWith('data:image/svg') || /placeholder|blank/i.test(src)) continue;

            let title = aTitle?.textContent?.trim() || aThumb?.getAttribute('title') || img?.getAttribute('alt') || '';
            title = title.replace(/\s+/g, ' ').trim();
            if (!title) continue;

            const chapLink = node.querySelector('.chapter-item span.chapter:first-child a, .chapter-item a');
            const chapter = chapLink?.textContent?.trim() || '';
            const chapterHref = chapLink?.href || chapLink?.getAttribute('href') || href;

            const dateSpan = node.querySelector('.post-on span');
            const views = dateSpan?.textContent?.trim() || '';

            const badgeEl = node.querySelector('.manga-title-badges');
            const badge = badgeEl?.textContent?.trim() || '';

            seen.add(href);
            items.push({ href, chapterHref, src, title, chapter, views, badge });
        }

        if (items.length === 0) return;

        const existingHero = document.querySelector('#md-hero');
        if (existingHero) {
            const currentThumbsCount = existingHero.querySelectorAll('.md-hero-thumb').length;
            if (currentThumbsCount >= items.length && items.length > 1) {
                return;
            }
            existingHero.remove();
        }

        const hero = document.createElement('section');
        hero.id = 'md-hero';
        hero.innerHTML = `
            <div class="md-hero-bg"></div>
            <div class="md-hero-body">
                <span class="md-hero-tag">Popular Manga</span>
                <h2 class="md-hero-title"></h2>
                <div class="md-hero-meta">
                    <span class="md-hero-views"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span class="md-hero-views-text"></span></span>
                    <span class="md-hero-chapter"></span>
                </div>
                <div class="md-hero-cta">
                    <a class="md-hero-btn md-hero-play">&#9654; Read now</a>
                    <a class="md-hero-btn md-hero-more">More info</a>
                </div>
                <div class="md-hero-thumbs" role="tablist" aria-label="Popular manga series"></div>
            </div>
            <a class="md-hero-card" title="Read now">
                <span class="md-hero-card-art"><img alt="Book cover"></span>
            </a>
        `;

        const thumbsContainer = hero.querySelector('.md-hero-thumbs');
        let currentSlide = 0;
        let slideTimer = null;

        function setProgressRate(rate) {
            const activeFill = hero.querySelector('.md-hero-thumb.is-active .md-thumb-fill');
            if (!activeFill || typeof activeFill.getAnimations !== 'function') return;
            activeFill.getAnimations().forEach(anim => {
                try { anim.playbackRate = rate; } catch (_) {}
            });
        }

        function restartTimer() {
            clearTimeout(slideTimer);
            if (items.length <= 1) return;
            if (hero.matches(':hover')) return;
            let delay = 5800;
            const activeFill = hero.querySelector('.md-hero-thumb.is-active .md-thumb-fill');
            if (activeFill && typeof activeFill.getAnimations === 'function') {
                const anims = activeFill.getAnimations();
                const a = anims.find(an => an.animationName === 'mdProgressFall') || anims[0];
                if (a && typeof a.currentTime === 'number') {
                    if (a.currentTime >= 5500) {
                        delay = 50;
                    } else {
                        const rem = 5500 - a.currentTime;
                        if (rem > 0 && rem <= 5500) delay = rem + 300;
                    }
                }
            }
            slideTimer = setTimeout(() => {
                if (!hero.matches(':hover')) {
                    showSlide((currentSlide + 1) % items.length);
                }
            }, delay);
        }

        items.forEach((item, idx) => {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = 'md-hero-thumb';
            const displayTitle = toTitleCase(item.title);
            thumb.setAttribute('aria-label', displayTitle || ('Series ' + (idx + 1)));
            thumb.setAttribute('title', displayTitle);
            thumb.innerHTML = `
                <img src="${item.src.replace(/"/g, '%22')}" alt="${displayTitle.replace(/"/g, '&quot;')}" loading="lazy" decoding="async">
                <div class="md-thumb-fill"></div>
            `;
            thumb.addEventListener('click', (e) => {
                e.preventDefault();
                showSlide(idx);
            });
            const fill = thumb.querySelector('.md-thumb-fill');
            fill.addEventListener('animationend', (e) => {
                if (e.animationName === 'mdProgressFall' && thumb.classList.contains('is-active')) {
                    showSlide((currentSlide + 1) % items.length);
                }
            });
            thumbsContainer.appendChild(thumb);
        });

        thumbsContainer.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && !e.deltaX) {
                e.preventDefault();
                thumbsContainer.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        hero.addEventListener('mouseenter', () => {
            clearTimeout(slideTimer);
            setProgressRate(0.1);
        });
        hero.addEventListener('mouseleave', () => {
            setProgressRate(1.0);
            restartTimer();
        });

        function showSlide(idx) {
            currentSlide = (idx + items.length) % items.length;
            const cur = items[currentSlide];

            const bg = hero.querySelector('.md-hero-bg');
            if (bg) {
                bg.style.opacity = '0.15';
                setTimeout(() => {
                    bg.style.backgroundImage = 'url("' + cur.src.replace(/"/g, '%22') + '")';
                    bg.style.opacity = '';
                }, 140);
            }

            const titleEl = hero.querySelector('.md-hero-title');
            if (titleEl) {
                titleEl.style.opacity = '0.2';
                titleEl.style.transform = 'translateY(2px)';
                setTimeout(() => {
                    titleEl.textContent = toTitleCase(cur.title);
                    titleEl.style.opacity = '1';
                    titleEl.style.transform = 'translateY(0)';
                }, 120);
            }

            const tagEl = hero.querySelector('.md-hero-tag');
            if (tagEl) {
                tagEl.textContent = cur.badge ? (cur.badge + ' • Popular Manga') : 'Popular Manga';
            }

            const viewsEl = hero.querySelector('.md-hero-views');
            const viewsText = hero.querySelector('.md-hero-views-text');
            if (viewsEl && viewsText) {
                if (cur.views) {
                    viewsText.textContent = cur.views;
                    viewsEl.style.display = 'inline-flex';
                } else {
                    viewsEl.style.display = 'none';
                }
            }

            const chapEl = hero.querySelector('.md-hero-chapter');
            if (chapEl) {
                function fmtChapter(raw) {
                    if (!raw) return '';
                    const m = raw.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
                    if (m) return 'Latest: Ch.\u00a0' + m[1];
                    return 'Latest: ' + raw;
                }
                if (cur.chapter) {
                    chapEl.textContent = fmtChapter(cur.chapter);
                    chapEl.style.display = 'inline-flex';
                } else {
                    chapEl.style.display = 'none';
                }
            }

            const playBtn = hero.querySelector('.md-hero-play');
            if (playBtn) playBtn.href = cur.chapterHref || cur.href;

            const moreBtn = hero.querySelector('.md-hero-more');
            if (moreBtn) moreBtn.href = cur.href;

            const cardLink = hero.querySelector('.md-hero-card');
            if (cardLink) cardLink.href = cur.chapterHref || cur.href;

            const cardImg = hero.querySelector('.md-hero-card img');
            if (cardImg) {
                cardImg.style.opacity = '0.35';
                setTimeout(() => {
                    cardImg.src = cur.src;
                    cardImg.alt = toTitleCase(cur.title);
                    cardImg.style.opacity = '1';
                }, 140);
            }

            const allThumbs = thumbsContainer.querySelectorAll('.md-hero-thumb');
            allThumbs.forEach((th, i) => {
                const f = th.querySelector('.md-thumb-fill');
                if (i === currentSlide) {
                    th.classList.add('is-active');
                    if (f) {
                        f.style.animation = 'none';
                        void f.offsetWidth;
                        f.style.animation = '';
                        if (hero.matches(':hover')) {
                            requestAnimationFrame(() => setProgressRate(0.1));
                        }
                    }
                    // centre the selected thumb in the strip (offsetLeft is already relative to the strip)
                    const left = th.offsetLeft - (thumbsContainer.clientWidth - th.offsetWidth) / 2;
                    thumbsContainer.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
                } else {
                    th.classList.remove('is-active');
                    if (f) f.style.animation = 'none';
                }
            });

            restartTimer();
        }

        showSlide(0);

        const parentWidget = carousel.closest('#manga-popular-slider-8, .widget-manga-popular-slider') || carousel;
        parentWidget.before(hero);

        carousel.setAttribute('data-md-hero-source', '1');
        carousel.style.setProperty('display', 'none', 'important');
        if (parentWidget !== carousel) {
            parentWidget.setAttribute('data-md-hero-source', '1');
            parentWidget.style.setProperty('display', 'none', 'important');
        }
    }

    /* ====================================================================
     *  SERIES HEADER BACKDROP + LOAD-MORE FEEDBACK
     * ==================================================================== */
    function setupCoverBackdrop() {
        const band = document.querySelector('div.profile-manga');
        if (!band) return;
        const img = band.querySelector('div.summary_image img');
        if (!img) return;
        const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        if (!src || src.startsWith('data:image/gif')) return;
        let bg = band.querySelector(':scope > .md-profile-bg');
        if (!bg) {
            bg = document.createElement('div');
            bg.className = 'md-profile-bg';
            band.insertBefore(bg, band.firstChild);
        }
        if (bg.dataset.src !== src) {
            bg.dataset.src = src;
            bg.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
        }
    }

    let loadMoreWired = false;
    function setupLoadMore() {
        if (loadMoreWired) return;
        loadMoreWired = true;
        const cardSel = 'div.page-item-detail, .popular-item-wrap';
        document.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('nav.navigation-ajax a.load-ajax');
            if (!a) return;
            a.classList.add('md-loading');
            const known = new Set(document.querySelectorAll(cardSel));
            const finish = () => { a.classList.remove('md-loading'); mo.disconnect(); clearTimeout(t); };
            const mo = new MutationObserver(() => {
                const fresh = [...document.querySelectorAll(cardSel)].filter(n => !known.has(n));
                if (!fresh.length) return;
                fresh.forEach((n, i) => {
                    n.style.setProperty('--md-i', String(Math.min(i, 12)));
                    n.classList.add('md-pop-in');
                    setTimeout(() => n.classList.remove('md-pop-in'), 1600);
                });
                finish();
            });
            mo.observe(document.body, { childList: true, subtree: true });
            const t = setTimeout(finish, 12000);
        }, true);
    }

    /* ====================================================================
     *  READER TOP BAR, RELATED-BLOCK REMOVAL, COMMENT COLLAPSE
     * ==================================================================== */
    function commentCount() {
        for (const sel of ['#wpdcom .wpd-thread-info', '.wpd-thread-info', '#comments .comments-title', '.comments-title']) {
            const el = $(sel);
            if (!el) continue;
            const attr = el.getAttribute('data-comments-count');
            if (attr && /\d/.test(attr)) return parseInt(attr.replace(/\D/g, ''), 10);
            const m = (el.textContent || '').replace(/,/g, '').match(/\d+/);
            if (m) return parseInt(m[0], 10);
        }
        return null;
    }

    function syncReaderBar() {
        const bar = document.getElementById('md-rbar');
        if (!bar) return;
        const ctx = chapterContext();
        const home = $('[data-k="home"]', bar);
        const ser = $('[data-k="series"]', bar);
        if (ser && ctx.seriesUrl && ser.getAttribute('href') !== ctx.seriesUrl) ser.setAttribute('href', ctx.seriesUrl);
        if (home && !home.getAttribute('href')) home.setAttribute('href', '/');
        const t = $('.md-rb-title', bar);
        if (t) {
            const b = $('b', t), sp = $('span', t);
            if (b && b.textContent !== ctx.series) b.textContent = ctx.series;
            if (sp && sp.textContent !== ctx.label) sp.textContent = ctx.label;
        }
        const n = commentCount();
        const c = $('.md-rb-count', bar);
        const txt = n == null ? '' : (n > 999 ? Math.round(n / 100) / 10 + 'K' : String(n));
        if (c && c.textContent !== txt) c.textContent = txt;
    }

    function buildReaderBar() {
        if (document.getElementById('md-rbar') || !document.body) { syncReaderBar(); return; }
        const bar = document.createElement('div');
        bar.id = 'md-rbar';
        bar.innerHTML =
            '<a class="md-rb-btn" data-k="home" href="/" title="Home">' + ICON.home + '<span class="md-rb-lbl">Home</span></a>' +
            '<a class="md-rb-btn" data-k="series" href="#" title="Series page">' + ICON.list + '<span class="md-rb-lbl">Series</span></a>' +
            '<div class="md-rb-title"><b></b><span></span></div>' +
            '<button type="button" class="md-rb-btn" data-k="comments" title="Jump to comments">' + ICON.chat + '<span class="md-rb-lbl">Comments</span><span class="md-rb-count"></span></button>' +
            '<span class="md-rb-theme"></span>';
        document.body.appendChild(bar);
        $('[data-k="comments"]', bar).addEventListener('click', () => {
            const target = $('#wpdcom') || $('#respond') || $('#comments') || $('.comments-area');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else toast('No comments section on this page');
        });
        syncReaderBar();
    }

    function removeRelated() {
        $$('h1,h2,h3,h4,h5,h6,.c-blog__heading,.widget-heading').forEach(h => {
            const txt = (h.textContent || '').trim();
            if (txt.length > 60 || !/you\s+may\s+also\s+like/i.test(txt)) return;
            const keep = '#wpdcom, #respond, #comments, .reading-content, #md-rbar, #md-dock';
            const box = h.closest('.related-manga, .manga-related, [class*="related"], .c-blog-post, section, .widget');
            if (box && !box.querySelector(keep) && !box.matches(keep)) { box.remove(); return; }
            const wrap = h.closest('.c-blog__heading') || h;
            const nx = wrap.nextElementSibling;
            if (nx && !nx.querySelector(keep) && !nx.matches(keep)) nx.remove();
            wrap.remove();
        });
    }

    function setupCommentCollapse() {
        $$('#wpdcom .wpd-comment').forEach(c => {
            if (c.dataset.mdColInit) return;
            const head = $('.wpd-comment-header', c);
            if (!head || head.closest('.wpd-comment') !== c) return;
            c.dataset.mdColInit = '1';
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'md-col';
            b.title = 'Collapse comment';
            b.setAttribute('aria-expanded', 'true');
            b.textContent = '\u2212';
            b.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const closed = c.hasAttribute('data-md-collapsed');
                if (closed) c.removeAttribute('data-md-collapsed'); else c.setAttribute('data-md-collapsed', '1');
                b.setAttribute('aria-expanded', closed ? 'true' : 'false');
                b.title = closed ? 'Collapse comment' : 'Expand comment';
                b.textContent = closed ? '\u2212' : '+';
            });
            head.appendChild(b);
        });
    }

    /* ====================================================================
     *  HEADING GLYPHS, COMMENT LOADING INDICATOR, IMAGE LAZINESS
     * ==================================================================== */
    function tagHeadings() {
        $$('.c-blog__heading:not([data-md-g]), .widget-heading:not([data-md-g])').forEach(h => {
            if (!h.querySelector('i')) return;
            const t = (h.textContent || '').toLowerCase();
            let g = 'star';
            if (/summary|about|descr|synops/.test(t)) g = 'doc';
            else if (/comment|discuss/.test(t)) g = 'chat';
            else if (/chapter/.test(t)) g = 'list';
            else if (/updat|latest|release|recent/.test(t)) g = 'bolt';
            h.setAttribute('data-md-g', g);
        });
    }

    function restructureComments() {
        $$('#wpdcom .wpd-comment').forEach(c => {
            if (c.dataset.mdRs) return;
            const own = sel => [...c.querySelectorAll(sel)].find(e => e.closest('.wpd-comment') === c);
            const left = own('.wpd-comment-left');
            const head = own('.wpd-comment-header');
            if (!left || !head) return;
            c.dataset.mdRs = '1';
            const vote = own('.wpd-vote');
            if (vote && !left.contains(vote)) left.appendChild(vote);
            const label = own('.wpd-comment-label');
            if (label && !head.contains(label)) {
                const au = head.querySelector('.wpd-comment-author');
                if (au) au.after(label); else head.prepend(label);
            }
            const flag = own('.fa-flag');
            if (flag) {
                const unit = flag.parentElement && flag.parentElement !== head &&
                    !flag.parentElement.matches('.wpd-comment, .wpd-comment-wrap, .wpd-comment-right, .wpd-comment-left, .wpd-comment-footer, .wpd-comment-text')
                    ? flag.parentElement : flag;
                if (!head.contains(unit)) head.appendChild(unit);
                unit.classList.add('md-flag');
                const col = head.querySelector('.md-col');
                if (col) head.appendChild(col);
            }
        });
    }

    function setupCommentLoading() {
        const w = $('#wpdcom');
        if (!w) return;
        let ind = w.querySelector(':scope > .md-cload');
        if (!ind) {
            ind = document.createElement('div');
            ind.className = 'md-cload';
            ind.textContent = 'Loading comments';
            w.appendChild(ind);
        }
        if (w.__mdCL) return;
        w.__mdCL = setInterval(() => {
            if (!w.isConnected) { clearInterval(w.__mdCL); w.__mdCL = null; return; }
            if (ind.parentNode !== w) w.appendChild(ind);
            const bar = document.getElementById('wpdiscuz-loading-bar') || $('.wpdiscuz-loading-bar');
            let on = false;
            if (bar) {
                const cs = getComputedStyle(bar);
                on = cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
            }
            if (!on) on = !!w.querySelector('.wpd-loading, .wpd_loading');
            if (on !== w.hasAttribute('data-md-cload')) {
                if (on) w.setAttribute('data-md-cload', '1'); else w.removeAttribute('data-md-cload');
            }
        }, 250);
    }

    function lazyImages() {
        $$('div.page-item-detail img, .popular-item-wrap img').forEach(i => {
            if (!i.hasAttribute('loading')) i.setAttribute('loading', 'lazy');
            if (!i.hasAttribute('decoding')) i.setAttribute('decoding', 'async');
        });
    }

    let trimTimer = 0;
    function trimHeroGap() {
        const hero = document.getElementById('md-hero');
        if (!hero) return;
        const next = [...document.querySelectorAll('.c-blog__heading, .page-content-listing, .page-listing-item')]
            .find(e => e.getBoundingClientRect().top >= hero.getBoundingClientRect().bottom - 2 && e.getBoundingClientRect().height > 0);
        if (!next) return;
        if (next.dataset.mdTrim) { next.style.removeProperty('margin-top'); delete next.dataset.mdTrim; }
        if (innerWidth > 768) return;
        const gap = next.getBoundingClientRect().top - hero.getBoundingClientRect().bottom;
        if (gap > 44) {
            const mt = parseFloat(getComputedStyle(next).marginTop) || 0;
            next.style.setProperty('margin-top', (mt - (gap - 26)) + 'px', 'important');
            next.dataset.mdTrim = '1';
        }
    }
    window.addEventListener('resize', () => { clearTimeout(trimTimer); trimTimer = setTimeout(trimHeroGap, 200); });

    /* ====================================================================
     *  RUN LOOP & LIFECYCLE
     * ==================================================================== */
    injectStyles();

    function run() {
        injectStyles();
        if (!document.body) return;
        root.dataset.mdPage = detectPage();
        try {
            purgeAdContainers();
            cleanCardTitles();
            fixCommentImages();
            try { restructureComments(); setupCommentCollapse(); setupCommentLoading(); tagHeadings(); lazyImages(); clearTimeout(trimTimer); trimTimer = setTimeout(trimHeroGap, 350); } catch (_) {}
            try { setupLoadMore(); } catch (_) {}
            const page = PAGE();
            if (page === 'list') {
                buildHero();
            } else if (page === 'overview') {
                setupSelect(null, SEL_MANGAREAD);
                try { setupCoverBackdrop(); } catch (_) {}
            } else if (page === 'chapter') {
                setupReader();
                buildReaderBar();
                removeRelated();
            }
            setupThemeToggle();
            addExtras();
            const bar = $('#md-sel-bar');
            if (bar && bar.__sync) bar.__sync();
        } catch (e) {
            console.warn('[MD] run loop error:', e);
        }
    }

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(run, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
    window.addEventListener('load', run, { once: true });

    new MutationObserver(muts => {
        // Skip mutations caused solely by our own UI widgets
        if (muts.every(m => {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            return el && el.closest('#md-dock, #md-toast, #md-top, #md-sel-bar, #md-hero');
        })) return;
        schedule();
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();
