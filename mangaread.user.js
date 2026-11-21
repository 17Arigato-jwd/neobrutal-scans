// ==UserScript==
// @name         MangaRead Neobrutalism + De-bloat
// @namespace    https://github.com/17Arigato-jwd/neobrutal-scans
// @version      2026-11-21.10
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
        if (/^\/(privacy-policy|terms|dmca|contact|about)/i.test(p) || (b && b.classList.contains('page') && !b.classList.contains('home'))) return 'static';
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
        stretch: SVG('<path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4"/>'),
        shrinkW: SVG('<path d="M9 12H3m6 0-3-3m3 3-3 3M15 12h6m-6 0 3-3m-3 3 3 3"/>'),
        scroll: SVG('<polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="none"/>'),
        pause: SVG('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
        expand: SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
        compress: SVG('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
        gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
        bookmark: SVG('<path d="M6 4h12v17l-6-4-6 4V4z"/>'),
        bookmarkFill: SVG('<path d="M6 4h12v17l-6-4-6 4V4z" fill="currentColor"/>'),
        search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
        trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
        sortDesc: SVG('<path d="M11 6h9M11 12h6M11 18h3M5 5v14m0 0-3-3m3 3 3-3"/>'),
        sortAsc: SVG('<path d="M11 6h9M11 12h6M11 18h3M5 19V5m0 0-3 3m3-3 3 3"/>'),
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
            transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
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
            transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
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

        /* ================================================================
         *  v2026-11-21.1: SYNCED CHROME, NO NATIVE READER SCROLLBAR,
         *  CENTERED READER COMMENTS, NEOBRUTAL MODALS, CONTINUE READING,
         *  LIBRARY, FILTERBAR, @better-ui, MOBILE-FIRST
         * ================================================================ */

        /* Hide native browser scrollbar in chapter reader */
        html[data-md-page="chapter"],
        html[data-md-page="chapter"] body {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }
        html[data-md-page="chapter"]::-webkit-scrollbar,
        html[data-md-page="chapter"] body::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
        }

        /* Center comments section in chapter reader */
        html[data-md-page="chapter"] .manga-discussion,
        html[data-md-page="chapter"] .comments-area,
        html[data-md-page="chapter"] #respond.comments-area,
        html[data-md-page="chapter"] #comments,
        html[data-md-page="chapter"] #wpdcom {
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
            max-width: min(860px, calc(100vw - 24px)) !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        html[data-md-page="chapter"] .manga-discussion .row,
        html[data-md-page="chapter"] .c-page-content .row {
            justify-content: center !important;
        }
        html[data-md-page="chapter"] .manga-discussion .col-12,
        html[data-md-page="chapter"] .manga-discussion .main-col {
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
            max-width: min(860px, 100%) !important;
            flex: 0 1 860px !important;
        }

        /* @better-ui: Tactile active press & pure oklch image outlines */
        #md-dock button:active:not(:disabled),
        #md-rbar .md-rb-btn:active,
        #md-rbar .md-rb-chap:active,
        .md-hdr-btn:active,
        .md-lib-save:active,
        .md-cr-rm:active,
        .md-modal button:active:not(:disabled),
        .md-ch-sort-btn:active {
            transform: scale(0.96) !important;
        }
        div.page-item-detail .item-thumb,
        .md-cr-thumb,
        .md-lib-thumb {
            position: relative !important;
        }
        div.page-item-detail .item-thumb::after,
        .md-cr-thumb::after,
        .md-lib-thumb::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.1);
            pointer-events: none;
            z-index: 2;
        }
        html[data-md-theme="dark"] div.page-item-detail .item-thumb::after,
        html[data-md-theme="dark"] .md-cr-thumb::after,
        html[data-md-theme="dark"] .md-lib-thumb::after {
            box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.1);
        }

        /* Header Bookmark + Settings icon buttons */
        .md-hdr-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 36px !important;
            height: 36px !important;
            padding: 0 !important;
            border-radius: 8px !important;
            border: var(--bw, 3px) solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            cursor: pointer !important;
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease !important;
        }
        .md-hdr-btn:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        li.menu-md-act {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            list-style: none !important;
            margin: 0 4px !important;
        }

        /* Synced Reader Top Bar (#md-rbar) + Chapter Pill */
        html[data-md-page="chapter"][data-md-navhide="1"] #md-rbar {
            transform: translateY(calc(-100% - 12px)) !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        #md-rbar {
            transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease !important;
            padding-top: max(8px, env(safe-area-inset-top)) !important;
        }
        #md-rbar .md-rb-chap {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            padding: 3px 10px !important;
            border-radius: 8px !important;
            border: 2px solid var(--bd) !important;
            background: var(--bg) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 11.5px/1.3 'JetBrains Mono', monospace !important;
            cursor: pointer !important;
            max-width: 220px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease !important;
        }
        #md-rbar .md-rb-chap:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }

        /* Reader Dock contextual icon cross-fade & stretch mode */
        #md-dock .md-ic-swap {
            position: relative;
            display: inline-flex;
            width: 18px;
            height: 18px;
            align-items: center;
            justify-content: center;
        }
        #md-dock .md-ic-swap > span {
            position: absolute;
            inset: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.16s ease, transform 0.18s ease, filter 0.16s ease;
        }
        #md-dock .md-ic-swap .ic-b {
            opacity: 0;
            transform: scale(0.82);
            filter: blur(2px);
        }
        #md-dock button.is-on .md-ic-swap .ic-a {
            opacity: 0;
            transform: scale(0.82);
            filter: blur(2px);
        }
        #md-dock button.is-on .md-ic-swap .ic-b {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
        }
        #md-dock button.is-on {
            background: var(--primary) !important;
            color: #ffffff !important;
            border-color: var(--bd) !important;
        }
        html[data-md-page="chapter"][data-md-stretch="1"] .reading-content,
        html[data-md-page="chapter"][data-md-stretch="1"] .reading-content .page-break,
        html[data-md-page="chapter"][data-md-stretch="1"] .reading-content img {
            width: 100% !important;
            max-width: 100% !important;
        }

        /* Dynamic Vertical Progress Rail (#md-progress) */
        #md-progress {
            position: fixed;
            top: 12px;
            bottom: var(--md-prog-bottom, 12px);
            right: 8px;
            width: 6px;
            border-radius: 999px;
            background: rgba(127, 127, 127, 0.25);
            border: 1px solid var(--bd);
            z-index: 99990;
            cursor: pointer;
            transition: opacity 0.2s ease, width 0.15s ease;
            overflow: hidden;
        }
        #md-progress:hover { width: 9px; }
        #md-progress[data-side="left"] { left: 8px; right: auto; }
        #md-progress[data-side="off"] { display: none !important; }
        #md-progress-fill {
            width: 100%;
            height: var(--md-prog-pct, 0%);
            background: var(--primary);
            border-radius: 999px;
            transition: height 0.08s linear;
        }
        :fullscreen #md-progress,
        :-webkit-full-screen #md-progress {
            display: none !important;
        }

        /* Neobrutalist Modal System (Settings, Chapter Switcher, Library, List Picker) */
        .md-modal-backdrop {
            position: fixed;
            inset: 0;
            z-index: 100020;
            background: rgba(0, 0, 0, 0.65);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }
        .md-modal-backdrop.open { display: flex; }
        .md-modal {
            width: min(500px, 100%);
            max-height: min(84vh, 740px);
            display: flex;
            flex-direction: column;
            background: var(--card);
            color: var(--ink);
            border: var(--bw, 3px) solid var(--bd);
            border-radius: var(--r, 10px);
            box-shadow: var(--sh-hover, 6px 6px 0 var(--bd));
            overflow: hidden;
            font-family: 'DM Sans', system-ui, sans-serif;
        }
        .md-modal-hd {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 13px 16px;
            background: var(--bg);
            border-bottom: var(--bw, 3px) solid var(--bd);
        }
        .md-modal-hd h3 {
            margin: 0;
            font: 800 15px/1.2 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--ink);
        }
        .md-modal-close {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            cursor: pointer;
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .md-modal-close:hover {
            background: var(--primary);
            color: #ffffff;
        }
        .md-modal-bd {
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: var(--card);
        }
        .md-set-sec {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .md-set-lbl {
            font: 800 11.5px/1 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
        }
        .md-seg {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
            gap: 8px;
        }
        .md-seg button {
            padding: 9px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 800 13px/1.2 'JetBrains Mono', monospace;
            cursor: pointer;
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .md-seg button:hover {
            transform: translate(-1px, -1px);
            box-shadow: var(--sh);
        }
        .md-seg button.active {
            background: var(--primary);
            color: #ffffff;
            border-color: var(--bd);
            box-shadow: var(--sh-sm);
        }
        .md-range-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            box-shadow: var(--sh-sm);
        }
        .md-range-row input[type="range"] {
            flex: 1;
            accent-color: var(--primary);
        }
        .md-range-val {
            min-width: 68px;
            text-align: right;
            font: 800 12.5px/1 'JetBrains Mono', monospace;
            color: var(--ink);
        }

        /* Chapter Switcher Modal (#md-rchap-modal) */
        .md-search-input {
            width: 100%;
            box-sizing: border-box;
            padding: 9px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 700 16px/1.3 'DM Sans', sans-serif;
        }
        .md-search-input:focus {
            outline: none;
            border-color: var(--primary);
        }
        .md-rchap-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 54vh;
            overflow-y: auto;
            padding: 2px 4px 4px 2px;
        }
        .md-rchap-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink) !important;
            box-shadow: var(--sh-sm);
            text-decoration: none !important;
            font: 800 13px/1.3 'JetBrains Mono', monospace;
            transition: transform 0.14s ease, background-color 0.14s ease, color 0.14s ease;
        }
        .md-rchap-item:hover {
            transform: translate(-1px, -1px);
            box-shadow: var(--sh);
            background: var(--card);
        }
        .md-rchap-item.is-cur {
            background: var(--primary) !important;
            border-color: var(--bd) !important;
            color: #ffffff !important;
            box-shadow: var(--sh-sm) !important;
        }
        .md-rchap-item.is-cur span { color: #ffffff !important; }
        .md-rchap-date {
            font: 700 11px/1 'JetBrains Mono', monospace;
            color: var(--muted);
            flex-shrink: 0;
        }

        /* Continue Reading Shelf (#md-continue-reading) */
        #md-continue-reading {
            max-width: var(--maxw, 1280px);
            margin: 18px auto 22px;
            padding: 0 16px;
            font-family: 'DM Sans', system-ui, sans-serif;
        }
        .md-cr-hd {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }
        .md-cr-title {
            margin: 0;
            font: 800 15px/1.2 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--ink);
        }
        .md-cr-clear {
            padding: 6px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 800 12px/1.2 'JetBrains Mono', monospace;
            cursor: pointer;
        }
        .md-cr-clear:hover {
            background: var(--primary);
            color: #ffffff;
        }
        .md-cr-row {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding: 2px 2px 8px;
            scrollbar-width: thin;
        }
        .md-cr-card {
            position: relative;
            flex: 0 0 156px;
            display: flex;
            flex-direction: column;
            border-radius: var(--r, 10px);
            border: var(--bw, 3px) solid var(--bd);
            background: var(--card);
            box-shadow: var(--sh);
            overflow: hidden;
            text-decoration: none !important;
            color: var(--ink) !important;
            transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .md-cr-card:hover {
            transform: translate(-2px, -2px);
            box-shadow: var(--sh-hover);
        }
        .md-cr-thumb {
            aspect-ratio: 3 / 4;
            width: 100%;
            background: var(--bg);
            overflow: hidden;
        }
        .md-cr-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .md-cr-bar {
            height: 4px;
            background: var(--bg);
            border-top: 2px solid var(--bd);
            border-bottom: 2px solid var(--bd);
        }
        .md-cr-bar > i {
            display: block;
            height: 100%;
            background: var(--primary);
        }
        .md-cr-meta {
            padding: 8px 9px 9px;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .md-cr-name {
            font: 800 12.5px/1.25 'DM Sans', sans-serif;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            color: var(--ink);
        }
        .md-cr-ch {
            font: 800 11px/1.2 'JetBrains Mono', monospace;
            color: var(--primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .md-cr-rm {
            position: absolute;
            top: 6px;
            right: 6px;
            z-index: 4;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 800 14px/1 sans-serif;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .md-cr-rm:hover {
            background: var(--primary);
            color: #ffffff;
        }

        /* Quick-Save + button on catalog covers & Overview Add-to-List button */
        .md-lib-save {
            position: absolute !important;
            top: 6px !important;
            right: 6px !important;
            z-index: 6 !important;
            width: 28px !important;
            height: 28px !important;
            border-radius: 7px !important;
            border: 2px solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            opacity: 0;
            transition: opacity 0.16s ease, transform 0.14s ease, background-color 0.15s ease !important;
        }
        div.page-item-detail:hover .md-lib-save,
        .md-lib-save.is-saved,
        .md-lib-save:focus-visible {
            opacity: 1 !important;
        }
        .md-lib-save.is-saved {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        .md-ov-lib-btn {
            display: inline-flex !important;
            align-items: center !important;
            gap: 7px !important;
            margin-top: 10px !important;
            padding: 9px 14px !important;
            border-radius: 8px !important;
            border: var(--bw, 3px) solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 13px/1 'JetBrains Mono', monospace !important;
            cursor: pointer !important;
        }
        .md-ov-lib-btn.is-saved {
            background: var(--primary) !important;
            color: #ffffff !important;
        }

        /* Library Modal (#md-lib-modal) */
        .md-lib-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .md-lib-tab {
            padding: 7px 11px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 800 12px/1.2 'JetBrains Mono', monospace;
            cursor: pointer;
        }
        .md-lib-tab.active {
            background: var(--primary);
            color: #ffffff;
        }
        .md-lib-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
            gap: 10px;
        }
        .md-lib-item {
            position: relative;
            display: flex;
            flex-direction: column;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            box-shadow: var(--sh-sm);
            overflow: hidden;
            text-decoration: none !important;
            color: var(--ink) !important;
        }
        .md-lib-thumb {
            aspect-ratio: 3 / 4;
            background: var(--card);
            overflow: hidden;
        }
        .md-lib-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .md-lib-info { padding: 7px 8px; font: 800 12px/1.25 'DM Sans', sans-serif; }
        .md-lib-new-row { display: flex; gap: 8px; }
        .md-lib-new-row input { flex: 1; }
        .md-lib-new-row button {
            padding: 0 14px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--primary);
            color: #ffffff;
            box-shadow: var(--sh-sm);
            font: 800 13px/1 'JetBrains Mono', monospace;
            cursor: pointer;
        }
        .md-picker-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            box-shadow: var(--sh-sm);
            cursor: pointer;
            font: 800 13px/1.2 'JetBrains Mono', monospace;
        }

        /* Series Page Chapter Filter & Sort (#md-ch-filterbar) */
        #md-ch-filterbar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px;
            flex-wrap: wrap;
        }
        #md-ch-filterbar input {
            flex: 1 1 200px;
            min-width: 0;
            padding: 8px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 700 16px/1.3 'DM Sans', sans-serif;
        }
        .md-ch-sort-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 9px 12px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: var(--ink);
            font: 800 12.5px/1 'JetBrains Mono', monospace;
            cursor: pointer;
            box-shadow: var(--sh-sm);
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .md-ch-sort-btn:hover {
            background: var(--primary);
            color: #ffffff;
        }
        .md-ch-count {
            font: 800 12px/1 'JetBrains Mono', monospace;
            color: var(--muted);
        }

        /* Mobile-First Optimization */
        @media (hover: none) {
            .md-lib-save { opacity: 0.92 !important; }
        }
        @media (max-width: 768px) {
            html[data-md-page="chapter"] .reading-content,
            html[data-md-page="chapter"] .reading-content .page-break,
            html[data-md-page="chapter"] .reading-content img {
                width: 100vw !important;
                max-width: 100vw !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                border-radius: 0 !important;
            }
            html[data-md-page="chapter"] .read-container,
            html[data-md-page="chapter"] .entry-content,
            html[data-md-page="chapter"] .main-col-inner {
                padding-left: 0 !important;
                padding-right: 0 !important;
            }
            #md-dock {
                max-width: calc(100vw - 16px) !important;
                overflow-x: auto !important;
                flex-wrap: nowrap !important;
                justify-content: flex-start !important;
                bottom: max(10px, env(safe-area-inset-bottom)) !important;
                scrollbar-width: none !important;
            }
            #md-dock::-webkit-scrollbar { display: none; }
            #md-dock button { flex-shrink: 0 !important; min-width: 38px !important; min-height: 38px !important; }
            #md-rbar .md-rb-lbl { display: none !important; }
            #md-rbar .md-rb-chap { max-width: 130px !important; }
            .md-modal-backdrop { align-items: flex-end; padding: 0; }
            .md-modal {
                width: 100%;
                max-height: 86vh;
                border-radius: 14px 14px 0 0;
                border-bottom: none;
                padding-bottom: env(safe-area-inset-bottom);
            }
            .md-cr-card { flex: 0 0 132px; }
        }
        /* ================================================================
         *  v2026-11-21.3 POLISH:
         *  - White-on-white modal/input text fixes (!important)
         *  - Site-wide header & single-row sub-nav layout
         *  - Flattened, readable Total Results bar
         *  - Header-gradient morphing Load More Comments button
         *  - Continue Reading matching Latest Manga Updates + edge fade
         *  - @better-ui Save to List prompt
         *  - True viewport-centered chapter comments + Sort bar
         *  - Privacy Policy / Static page support
         *  - Full-site mobile optimization
         * ================================================================ */

        /* 1. Modal contrast hardening (fix white-on-white & dark-on-dark) */
        .md-modal,
        .md-modal-bd {
            background: var(--card) !important;
            color: var(--ink) !important;
        }
        .md-modal-hd {
            background: var(--bg) !important;
            color: var(--ink) !important;
        }
        .md-modal-hd h3 {
            color: var(--ink) !important;
            background: transparent !important;
        }
        .md-modal-title-wrap {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .md-modal-sub {
            font: 600 12.5px/1.25 'DM Sans', sans-serif !important;
            color: var(--muted) !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 360px;
        }
        .md-modal .md-search-input,
        .md-modal input[type="search"],
        .md-modal input[type="text"] {
            background: var(--bg) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 9px 12px !important;
            font: 700 16px/1.3 'DM Sans', sans-serif !important;
            opacity: 1 !important;
        }
        .md-modal .md-search-input::placeholder,
        .md-modal input[type="search"]::placeholder,
        .md-modal input[type="text"]::placeholder {
            color: var(--muted) !important;
            opacity: 0.85 !important;
        }
        .md-modal .md-set-lbl { color: var(--muted) !important; }
        .md-modal .md-range-val { color: var(--ink) !important; }
        .md-modal .md-seg button {
            background: var(--bg) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
        }
        .md-modal .md-seg button.active {
            background: var(--primary) !important;
            color: #ffffff !important;
            border-color: var(--bd) !important;
        }
        .md-modal .md-modal-close {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            flex-shrink: 0;
        }
        .md-modal .md-modal-close:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }

        /* 2. @better-ui Save to List prompt */
        .md-picker-modal { border-radius: 12px !important; }
        .md-picker-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .md-picker-row {
            position: relative;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            padding: 10px 12px !important;
            border-radius: 8px !important;
            border: 2px solid var(--bd) !important;
            background: var(--bg) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            cursor: pointer !important;
            margin: 0 !important;
            transition: transform 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease !important;
        }
        .md-picker-row:hover {
            transform: translate(-1px, -1px);
            box-shadow: var(--sh) !important;
        }
        .md-picker-row:active { transform: scale(0.98) !important; }
        .md-picker-row.is-checked {
            background: color-mix(in srgb, var(--primary) 16%, var(--bg)) !important;
        }
        .md-picker-left {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }
        .md-picker-box {
            width: 20px;
            height: 20px;
            border-radius: 5px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: background-color 0.14s ease, transform 0.14s ease;
        }
        .md-picker-box svg { width: 13px; height: 13px; stroke-width: 3; }
        .md-picker-row.is-checked .md-picker-box {
            background: var(--primary);
        }
        .md-picker-name {
            font: 800 13.5px/1.2 'DM Sans', sans-serif !important;
            color: var(--ink) !important;
        }
        .md-picker-cnt {
            padding: 2px 8px;
            border-radius: 6px;
            border: 1.5px solid var(--bd);
            background: var(--card);
            color: var(--muted);
            font: 800 11.5px/1.2 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
        }
        .md-picker-cb {
            position: absolute !important;
            opacity: 0 !important;
            width: 1px !important;
            height: 1px !important;
            pointer-events: none !important;
        }

        /* 3. Site-wide Header & Sub-Nav Layout (@design-an-interface + @better-ui) */
        header.site-header .search-navigation__wrap,
        header.site-header .search-navigation {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
        }
        header.site-header .search-navigation .main-menu-search {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            flex-wrap: nowrap !important;
        }
        header.site-header .search-navigation .main-menu-search li.menu-theme {
            order: 99 !important;
        }
        header.site-header .search-navigation .main-menu-search li.menu-md-act {
            order: 50 !important;
            margin: 0 !important;
        }
        header.site-header a.btn-search-adv,
        header.site-header .adv-search-link,
        header.site-header .search-navigation > a,
        header.site-header .search-navigation .adv-search {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 36px !important;
            padding: 0 12px !important;
            border-radius: 8px !important;
            border: var(--bw) solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            text-decoration: none !important;
            white-space: nowrap !important;
            order: 20 !important;
            transition: transform 0.14s ease, background-color 0.14s ease, color 0.14s ease !important;
        }
        header.site-header a.btn-search-adv:hover,
        header.site-header .adv-search-link:hover,
        header.site-header .search-navigation > a:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        header.site-header a.open-search-main-menu {
            width: 36px !important;
            height: 36px !important;
        }
        /* Single-row sub-header nav (no orphan SCHOOL LIFE row) */
        .c-sub-header-nav .sub-nav_content,
        .c-sub-header-nav .sub-nav_list {
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 4px !important;
            overflow-x: auto !important;
            scrollbar-width: none !important;
        }
        .c-sub-header-nav .sub-nav_list::-webkit-scrollbar { display: none; }
        .c-sub-header-nav .sub-nav_list > li {
            flex: 0 0 auto !important;
            white-space: nowrap !important;
        }

        /* 4. Continue Reading matching Latest Manga Updates + Left-to-Right + Edge Fade */
        #md-continue-reading {
            max-width: var(--maxw, 1280px) !important;
            margin: 18px auto 26px !important;
            padding: 0 15px !important;
            box-sizing: border-box !important;
        }
        .md-cr-hd {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            padding: 10px 14px !important;
            margin-bottom: 14px !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
        }
        .md-cr-hd-left {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }
        .md-cr-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: var(--primary);
            color: #ffffff;
            border: 2px solid var(--bd);
            box-shadow: var(--sh-sm);
            flex-shrink: 0;
        }
        .md-cr-badge svg { width: 15px; height: 15px; }
        .md-cr-wrap {
            position: relative;
        }
        .md-cr-wrap[data-fade="r"] .md-cr-row {
            -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 56px), transparent 100%);
            mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 56px), transparent 100%);
        }
        .md-cr-wrap[data-fade="l"] .md-cr-row {
            -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 56px, #000 100%);
            mask-image: linear-gradient(to right, transparent 0%, #000 56px, #000 100%);
        }
        .md-cr-wrap[data-fade="lr"] .md-cr-row {
            -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 56px, #000 calc(100% - 56px), transparent 100%);
            mask-image: linear-gradient(to right, transparent 0%, #000 56px, #000 calc(100% - 56px), transparent 100%);
        }
        .md-cr-row {
            display: flex !important;
            flex-direction: row !important;
            gap: 14px !important;
            overflow-x: auto !important;
            padding: 2px 4px 10px 2px !important;
            scrollbar-width: none !important;
        }
        .md-cr-row::-webkit-scrollbar { display: none; }
        .md-cr-card {
            flex: 0 0 172px !important;
        }
        .md-cr-thumb {
            aspect-ratio: 2 / 3 !important;
        }

        /* 5. Flatten & Fix Total Results Bar (no nested boxes, crisp text) */
        .tab-wrap {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            flex-wrap: wrap !important;
            padding: 10px 14px !important;
            margin-bottom: 18px !important;
            background: var(--card) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
        }
        .tab-wrap .c-blog__heading {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .tab-wrap .c-blog__heading h1,
        .tab-wrap .c-blog__heading h2,
        .tab-wrap .c-blog__heading h3,
        .tab-wrap .c-blog__heading h4,
        .tab-wrap .c-blog__heading .h4 {
            color: var(--ink) !important;
            margin: 0 !important;
            font: 800 13.5px/1.2 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            white-space: nowrap !important;
        }
        .tab-wrap .c-nav-tabs,
        .tab-wrap ul.c-tabs-content {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            gap: 6px !important;
            overflow-x: auto !important;
            scrollbar-width: none !important;
        }
        .tab-wrap .c-nav-tabs::-webkit-scrollbar,
        .tab-wrap ul.c-tabs-content::-webkit-scrollbar { display: none; }
        .tab-wrap .c-nav-tabs > span,
        .tab-wrap .c-nav-tabs .c-tabs-heading {
            display: none !important;
        }
        .tab-wrap .c-tabs-item {
            flex: 0 0 auto !important;
            margin: 0 !important;
        }
        .tab-wrap .c-tabs-item a {
            white-space: nowrap !important;
            color: var(--ink) !important;
            background: var(--bg) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 7px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 6px 11px !important;
            font: 800 12px/1 'JetBrains Mono', monospace !important;
        }
        .tab-wrap .c-tabs-item.active a,
        .tab-wrap .c-tabs-item a:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
            border-color: var(--bd) !important;
        }
        .tab-wrap .c-tabs-item a::after { display: none !important; }

        /* 6. Load More Comments Button -> Header Gradient + In-Place Loading Morph */
        html body #wpdcom .md-cload { display: none !important; }
        html body #wpdcom .wpd-load-more-submit,
        html body #wpdcom .wpd-load-comments {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 10px !important;
            background: var(--header-gradient) !important;
            color: #ffffff !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh) !important;
            padding: 11px 22px !important;
            font: 800 13px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35) !important;
            cursor: pointer !important;
            transition: transform 0.14s ease, box-shadow 0.14s ease, opacity 0.16s ease !important;
        }
        html body #wpdcom .wpd-load-more-submit:hover,
        html body #wpdcom .wpd-load-comments:hover {
            transform: translate(-1px, -1px) !important;
            box-shadow: var(--sh-hover) !important;
        }
        html body #wpdcom .wpd-load-more-submit:active,
        html body #wpdcom .wpd-load-comments:active {
            transform: scale(0.96) !important;
        }
        html body #wpdcom .wpd-load-more-submit.md-lm-loading,
        html body #wpdcom .wpd-load-comments.md-lm-loading {
            opacity: 0.92 !important;
            pointer-events: none !important;
        }
        .md-lm-spin {
            width: 15px;
            height: 15px;
            border: 2.5px solid rgba(255, 255, 255, 0.95);
            border-right-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: mdSpin 0.7s linear infinite;
        }

        /* 7. True Viewport-Centered Comments in Chapter Reader + Comment Sort Bar */
        html[data-md-page="chapter"] .c-page-content .container,
        html[data-md-page="chapter"] .site-content .container,
        html[data-md-page="chapter"] .main-col,
        html[data-md-page="chapter"] .main-col.col-12,
        html[data-md-page="chapter"] .main-col.col-md-8,
        html[data-md-page="chapter"] .main-col.col-sm-8 {
            width: 100% !important;
            max-width: 100% !important;
            flex: 0 0 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
        }
        html[data-md-page="chapter"] .manga-discussion,
        html[data-md-page="chapter"] #respond.comments-area,
        html[data-md-page="chapter"] #comments,
        html[data-md-page="chapter"] #wpdcom {
            width: 100% !important;
            max-width: min(820px, calc(100vw - 24px)) !important;
            margin-left: auto !important;
            margin-right: auto !important;
            float: none !important;
            box-sizing: border-box !important;
        }
        #md-csort-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin: 0 0 14px;
            padding: 8px 10px;
            border-radius: 8px;
            border: 2px solid var(--bd);
            background: var(--bg);
            box-shadow: var(--sh-sm);
        }
        .md-csort-lbl {
            font: 800 11.5px/1 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
            margin-right: 4px;
        }
        #md-csort-bar button {
            padding: 6px 12px;
            border-radius: 7px;
            border: 2px solid var(--bd);
            background: var(--card);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            font: 800 12px/1 'JetBrains Mono', monospace;
            cursor: pointer;
            transition: transform 0.14s ease, background-color 0.14s ease, color 0.14s ease;
        }
        #md-csort-bar button:active { transform: scale(0.96); }
        #md-csort-bar button.active {
            background: var(--primary);
            color: #ffffff;
        }

        /* 8. Privacy Policy & Static Info Pages */
        html[data-md-page="static"] .sidebar-col,
        html[data-md-page="static"] .c-sidebar {
            display: none !important;
        }
        html[data-md-page="static"] .main-col,
        html[data-md-page="static"] .c-page-content .container {
            max-width: 900px !important;
            width: 100% !important;
            flex: 0 0 100% !important;
            margin: 0 auto !important;
            float: none !important;
        }
        html[data-md-page="static"] .entry-content,
        html[data-md-page="static"] .c-blog-post,
        html[data-md-page="static"] article.page {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 28px 32px !important;
            margin: 20px auto 36px !important;
            line-height: 1.7 !important;
            font-family: 'DM Sans', system-ui, sans-serif !important;
        }
        html[data-md-page="static"] .entry-content h1,
        html[data-md-page="static"] .entry-content h2,
        html[data-md-page="static"] .entry-content h3,
        html[data-md-page="static"] .entry-header h1,
        html[data-md-page="static"] .entry-title {
            color: var(--ink) !important;
            font-family: 'JetBrains Mono', monospace !important;
            font-weight: 800 !important;
            margin-top: 22px !important;
            margin-bottom: 10px !important;
        }
        html[data-md-page="static"] .entry-content p,
        html[data-md-page="static"] .entry-content li {
            color: var(--ink) !important;
            font-size: 15px !important;
        }
        html[data-md-page="static"] .entry-content a {
            color: var(--primary) !important;
            font-weight: 700 !important;
            text-decoration: underline !important;
        }

        /* 9. Full-Site Mobile Optimization */
        @media (max-width: 768px) {
            header.site-header .main-navigation_wrap {
                flex-wrap: wrap !important;
                gap: 8px !important;
                padding: 8px 12px !important;
            }
            header.site-header a.btn-search-adv,
            header.site-header .adv-search-link {
                padding: 0 9px !important;
                font-size: 11px !important;
            }
            .tab-wrap {
                flex-direction: column !important;
                align-items: stretch !important;
                gap: 10px !important;
                padding: 10px 12px !important;
            }
            .tab-wrap .c-nav-tabs,
            .tab-wrap ul.c-tabs-content {
                width: 100% !important;
            }
            .md-cr-card { flex: 0 0 142px !important; }
            html[data-md-page="static"] .entry-content,
            html[data-md-page="static"] article.page {
                padding: 18px 16px !important;
                margin: 12px auto 24px !important;
            }
            html[data-md-page="chapter"] #respond.comments-area,
            html[data-md-page="chapter"] #wpdcom {
                max-width: calc(100vw - 16px) !important;
                padding: 12px !important;
            }
        }
        @media (max-width: 640px) {
            .page-listing-item .row,
            .c-tabs-item__content .row {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 10px !important;
                margin: 0 !important;
            }
            .page-listing-item .row > [class*="col-"],
            .c-tabs-item__content .row > [class*="col-"] {
                width: 100% !important;
                max-width: 100% !important;
                padding: 0 !important;
                flex: none !important;
            }
        }
        /* ================================================================
         *  v2026-11-21.4 POLISH:
         *  - Unified single-box chapter comments + themed footer
         *  - Flush-left Continue Reading matching Latest Manga Updates
         *  - Header Browse toggle + single-row sub-nav + Advanced in search
         *  - Full Neobrutalist Advanced Search page
         *  - Dead-center #md-rbar title + hidden redundant chapter heading
         * ================================================================ */

        /* 1. Hide redundant chapter heading above images & truly center #md-rbar */
        html[data-md-page="chapter"] #chapter-heading,
        html[data-md-page="chapter"] .c-blog-post > .entry-header,
        html[data-md-page="chapter"] .entry-header,
        html[data-md-page="chapter"] .comments-area > h4,
        html[data-md-page="chapter"] .manga-discussion > h4 {
            display: none !important;
        }
        #md-rbar {
            display: grid !important;
            grid-template-columns: 1fr auto 1fr !important;
            align-items: center !important;
            gap: 10px !important;
        }
        #md-rbar .md-rb-left {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            justify-self: start !important;
        }
        #md-rbar .md-rb-title {
            justify-self: center !important;
            text-align: center !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            min-width: 0 !important;
        }
        #md-rbar .md-rb-right {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            justify-self: end !important;
        }

        /* 2. Unified single-frame chapter comments + integrated sort bar + themed footer */
        html[data-md-page="chapter"] #respond.comments-area,
        html[data-md-page="chapter"] .comments-area {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 28px auto 36px !important;
        }
        html[data-md-page="chapter"] #wpdcom {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 18px 20px !important;
            margin: 0 auto !important;
        }
        html[data-md-page="chapter"] #wpdcom .wpd-thread-head {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            border-bottom: 2px solid var(--bd) !important;
            padding-bottom: 12px !important;
            margin-bottom: 14px !important;
        }
        html[data-md-page="chapter"] #wpdcom .wpd-thread-info {
            border-bottom: none !important;
            padding-bottom: 0 !important;
            margin: 0 !important;
            color: var(--ink) !important;
            font: 800 13.5px/1.2 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
        }
        html[data-md-page="chapter"] #wpdcom .wpd-thread-info::after {
            display: none !important;
        }
        #md-csort-bar {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        html[data-md-page="chapter"] footer.site-footer,
        html[data-md-page="chapter"] .site-footer,
        html[data-md-page="chapter"] .site-footer .bottom-footer,
        html[data-md-page="chapter"] .bottom-footer {
            background: var(--card) !important;
            color: var(--ink) !important;
            border-top: var(--bw) solid var(--bd) !important;
        }
        html[data-md-page="chapter"] .site-footer a,
        html[data-md-page="chapter"] .bottom-footer a {
            color: var(--ink) !important;
            font-weight: 700 !important;
        }
        html[data-md-page="chapter"] .site-footer p,
        html[data-md-page="chapter"] .bottom-footer p,
        html[data-md-page="chapter"] .site-footer .copyright {
            color: var(--muted) !important;
        }

        /* 3. Flush-left Continue Reading matching Latest Manga Updates */
        #md-continue-reading {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 0 26px !important;
            padding: 0 !important;
        }
        .md-cr-hd {
            position: relative !important;
            overflow: hidden !important;
            padding: 10px 14px !important;
            margin-bottom: 16px !important;
            background: var(--card) !important;
            background-image: repeating-linear-gradient(
                -45deg,
                transparent 0 7px,
                rgba(128, 128, 128, 0.14) 7px 9px
            ) !important;
            background-size: 96px 100% !important;
            background-position: right center !important;
            background-repeat: no-repeat !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
        }
        .md-cr-title {
            font: 800 15px/1.2 'DM Sans', sans-serif !important;
            letter-spacing: 0.03em !important;
        }
        .md-cr-clear {
            position: relative;
            z-index: 2;
        }
        .md-cr-card {
            flex: 0 0 206px !important;
        }

        /* 4. Site-wide Header: hide duplicate HOME/TOP/COMPLETED, add Browse toggle, single-row sub-nav, Advanced inside search */
        header.site-header .main-menu {
            display: none !important;
        }
        .md-subnav-btn {
            width: auto !important;
            padding: 0 12px !important;
            gap: 7px !important;
            margin-left: 14px !important;
            font: 800 12px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
        }
        .md-subnav-btn.is-on {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        html:not([data-md-subnav-open="1"]) header.site-header .c-sub-header-nav {
            display: none !important;
        }
        html[data-md-subnav-open="1"] header.site-header .c-sub-header-nav {
            display: block !important;
        }
        header.site-header .c-sub-header-nav .container,
        header.site-header .c-sub-header-nav .row,
        header.site-header .c-sub-header-nav [class*="col-"],
        header.site-header .c-sub-header-nav .sub-nav_content {
            width: 100% !important;
            max-width: var(--maxw, 1280px) !important;
            flex: 0 0 100% !important;
            float: none !important;
        }
        header.site-header .c-sub-header-nav .sub-nav_list {
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 18px !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10px 0 !important;
        }
        header.site-header .c-sub-header-nav .sub-nav_list > li {
            float: none !important;
            display: inline-flex !important;
            flex: 0 0 auto !important;
            margin: 0 !important;
            white-space: nowrap !important;
        }
        header.site-header .search-main-menu form.manga-search-form {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        header.site-header a.md-adv-in-search {
            flex-shrink: 0 !important;
            height: 38px !important;
            padding: 0 12px !important;
        }

        /* 5. Full Neobrutalist Advanced Search Page Styling */
        .c-search-header__wrapper {
            background: var(--bg) !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            padding: 20px 0 !important;
        }
        .search-advanced-form,
        .search-advance {
            background: var(--card) !important;
            color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important;
            box-shadow: var(--sh) !important;
            padding: 20px 22px !important;
        }
        .search-advance label,
        .search-advanced-form label,
        .search-advance .checkbox-group label,
        .search-advance .form-group > span {
            color: var(--ink) !important;
            font: 700 13px/1.3 'DM Sans', sans-serif !important;
        }
        .search-advance input[type="checkbox"],
        .search-advanced-form input[type="checkbox"] {
            accent-color: var(--primary) !important;
            width: 16px !important;
            height: 16px !important;
            cursor: pointer !important;
        }
        .search-advance input[type="text"],
        .search-advance input[type="search"],
        .search-advance select,
        .search-advanced-form input[type="text"],
        .search-advanced-form select {
            background: var(--bg) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 8px 12px !important;
            font: 700 14px/1.3 'DM Sans', sans-serif !important;
        }
        .search-advance .btn-primary,
        .search-advance input[type="submit"],
        .search-advance button[type="submit"],
        .search-advanced-form .search-submit {
            background: var(--primary) !important;
            color: #ffffff !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 9px 22px !important;
            font: 800 13px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            cursor: pointer !important;
        }
        .search-advance .btn-reset,
        .search-advance input[type="reset"],
        .search-advance button[type="reset"],
        .search-advance a.btn-reset {
            background: var(--bg) !important;
            color: var(--ink) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 9px 18px !important;
            font: 800 13px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            cursor: pointer !important;
        }
        .search-lists .tab-wrap,
        .c-page-content .tab-wrap {
            border: var(--bw) solid var(--bd) !important;
            box-shadow: var(--sh) !important;
        }
        .tab-wrap .c-blog__heading.style-2 {
            background-image: none !important;
        }
        .tab-wrap ul.c-tabs-content li a,
        .tab-wrap .c-nav-tabs li a {
            white-space: nowrap !important;
            color: var(--ink) !important;
            background: var(--bg) !important;
            border: 2px solid var(--bd) !important;
            border-radius: 7px !important;
            box-shadow: var(--sh-sm) !important;
            padding: 6px 11px !important;
            font: 800 12px/1 'JetBrains Mono', monospace !important;
            text-decoration: none !important;
        }
        .tab-wrap ul.c-tabs-content li.active a,
        .tab-wrap .c-nav-tabs li.active a,
        .tab-wrap ul.c-tabs-content li a:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }

        @media (max-width: 768px) {
            .md-cr-card { flex: 0 0 156px !important; }
            .md-subnav-btn span { display: none !important; }
            .md-subnav-btn { width: 32px !important; padding: 0 !important; margin-left: 4px !important; }
        }
        /* ================================================================
         *  v2026-11-21.5 POLISH:
         *  - Sub-nav dropdown clipping fix + header-link Browse button
         *  - Advanced button styled inside collapsible search bar
         *  - Cover quality (object-fit, low-res ambient backdrop, SVG sharpen)
         *  - Length-breaking username & avatar overflow guard
         *  - Heavy mobile optimization (zero header clip, no section overlap)
         * ================================================================ */

        /* 1. Browse button matching old header text links (no heavy box) */
        .md-subnav-btn {
            display: inline-flex !important;
            align-items: center !important;
            gap: 7px !important;
            margin-left: 20px !important;
            padding: 6px 10px !important;
            background: transparent !important;
            color: #ffffff !important;
            border: 2px solid transparent !important;
            border-radius: 8px !important;
            box-shadow: none !important;
            font: 800 13.5px/1 'DM Sans', sans-serif !important;
            letter-spacing: 0.04em !important;
            text-transform: uppercase !important;
            text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25) !important;
            cursor: pointer !important;
            transition: transform 0.14s ease, background-color 0.15s ease, border-color 0.15s ease !important;
        }
        .md-subnav-btn:hover,
        .md-subnav-btn.is-on {
            background: rgba(0, 0, 0, 0.18) !important;
            border-color: rgba(255, 255, 255, 0.45) !important;
        }
        .md-subnav-btn:active { transform: scale(0.96) !important; }
        .md-subnav-btn svg { width: 16px; height: 16px; stroke: currentColor; }

        /* 2. Sub-nav dropdown clipping fix (no peeking line under GENRES) */
        header.site-header .c-sub-header-nav,
        header.site-header .c-sub-header-nav .sub-nav_content,
        header.site-header .c-sub-header-nav .sub-nav_list {
            overflow: visible !important;
        }
        header.site-header .c-sub-header-nav .sub-nav_list li.menu-item-has-children > ul.sub-menu {
            display: none !important;
        }
        header.site-header .c-sub-header-nav .sub-nav_list li.menu-item-has-children:hover > ul.sub-menu,
        header.site-header .c-sub-header-nav .sub-nav_list li.menu-item-has-children:focus-within > ul.sub-menu {
            display: grid !important;
        }

        /* 3. Advanced link inside collapsible search bar */
        .search-main-menu a.md-adv-in-search,
        form.manga-search-form a.md-adv-in-search {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 38px !important;
            padding: 0 14px !important;
            border-radius: 8px !important;
            border: 2px solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            font: 800 12px/1 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            text-decoration: none !important;
            white-space: nowrap !important;
            flex-shrink: 0 !important;
        }
        .search-main-menu a.md-adv-in-search:hover,
        form.manga-search-form a.md-adv-in-search:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }

        /* 4. Crisp Cover Rendering + Low-Res Ambient Backdrop + Light SVG Sharpen */
        div.page-item-detail .item-thumb img,
        .popular-item-wrap .popular-img img,
        .md-cr-thumb img,
        .md-lib-thumb img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            object-position: 50% 18% !important;
        }
        .md-sharpen {
            filter: url(#md-sharpen) contrast(1.03);
        }
        .md-lowres-wrap {
            position: relative !important;
            overflow: hidden !important;
            background: var(--bg) !important;
        }
        .md-lowres-wrap::before {
            content: "";
            position: absolute;
            inset: -14px;
            background-image: var(--md-lowres-bg);
            background-size: cover;
            background-position: center;
            filter: blur(14px) brightness(0.75) saturate(1.1);
            z-index: 0;
            pointer-events: none;
        }
        .md-lowres-wrap img {
            position: relative !important;
            z-index: 1 !important;
            object-fit: contain !important;
            object-position: center !important;
        }

        /* 5. Length-breaking usernames & broken avatar circle guard */
        html body #wpdcom .wpd-avatar {
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            max-width: 44px !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            border: 2px solid var(--bd) !important;
            background: var(--bg) !important;
        }
        html body #wpdcom .wpd-avatar img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border: none !important;
        }
        .md-av-fallback {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: #ffffff;
            font: 800 17px/1 'JetBrains Mono', monospace;
        }
        html body #wpdcom .wpd-comment-header {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 6px 10px !important;
            padding-right: 42px !important;
            min-width: 0 !important;
        }
        html body #wpdcom .wpd-comment-author,
        html body #wpdcom .wpd-comment-author a {
            max-width: min(220px, 52vw) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            display: inline-block !important;
            vertical-align: middle !important;
            overflow-wrap: anywhere !important;
        }

        /* 6. Heavy Mobile Optimization (Zero Clipping, Zero Overlap, Clean 2-Col Grid) */
        @media (max-width: 768px) {
            html, body {
                overflow-x: clip !important;
            }
            header.site-header .main-navigation_wrap {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 6px !important;
                padding: 8px 10px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            header.site-header .wrap_branding {
                min-width: 0 !important;
                flex: 0 1 auto !important;
            }
            header.site-header .wrap_branding img,
            header.site-header .logo img {
                max-width: 132px !important;
                height: auto !important;
            }
            .md-subnav-btn {
                margin-left: 4px !important;
                padding: 5px 7px !important;
                gap: 4px !important;
            }
            header.site-header .search-navigation,
            header.site-header .search-navigation .main-menu-search {
                gap: 6px !important;
                flex-shrink: 0 !important;
                margin-left: auto !important;
            }
            header.site-header a.open-search-main-menu,
            header.site-header .md-hdr-btn {
                width: 32px !important;
                height: 32px !important;
            }
            header.site-header #md-theme {
                transform: scale(0.86) !important;
                transform-origin: right center !important;
            }
            header.site-header .c-sub-header-nav .sub-nav_list {
                overflow-x: auto !important;
                scrollbar-width: none !important;
                padding: 8px 10px !important;
                gap: 14px !important;
            }
            header.site-header .c-sub-header-nav .sub-nav_list::-webkit-scrollbar { display: none; }

            /* Prevent Continue Reading / Latest Manga Updates overlap on mobile */
            #md-continue-reading {
                display: block !important;
                position: relative !important;
                z-index: 2 !important;
                clear: both !important;
                margin: 12px 0 18px !important;
            }
            .page-content-listing,
            .page-listing-item {
                position: relative !important;
                z-index: 1 !important;
                clear: both !important;
                margin-top: 0 !important;
            }
            .md-hero-thumbs {
                padding-left: 4px !important;
                padding-right: 4px !important;
            }
            #md-rbar {
                padding: 8px 10px !important;
                gap: 6px !important;
            }
            #md-rbar .md-rb-title b {
                max-width: 140px !important;
                font-size: 12px !important;
            }
            html body #wpdcom .wpd-comment {
                padding: 12px !important;
            }
            html body #wpdcom .wpd-avatar {
                width: 36px !important;
                height: 36px !important;
                min-width: 36px !important;
                max-width: 36px !important;
            }
            html body #wpdcom .wpd-comment-author,
            html body #wpdcom .wpd-comment-author a {
                max-width: 145px !important;
            }
        }
        /* ================================================================
         *  v2026-11-21.6 MOBILE TOP BAR, SEARCH GEAR, SUB-NAV 3-DOTS,
         *  SEPARATE CONTINUE READING SECTION
         * ================================================================ */

        /* Continue Reading: proper standalone section under Hero & over Latest Manga Updates */
        #md-continue-reading {
            max-width: var(--maxw, 1280px) !important;
            width: calc(100% - 24px) !important;
            margin: 18px auto 22px !important;
            padding: 0 !important;
            display: block !important;
            position: relative !important;
            z-index: 3 !important;
            clear: both !important;
            box-sizing: border-box !important;
        }

        /* Gear icon (Advanced Search) right beside Search button inside collapsible search bar */
        .search-main-menu form.manga-search-form,
        header.site-header form.manga-search-form {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
        }
        a.md-adv-gear {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 40px !important;
            height: 40px !important;
            flex: 0 0 40px !important;
            border-radius: 8px !important;
            border: var(--bw, 3px) solid var(--bd) !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            box-shadow: var(--sh-sm) !important;
            text-decoration: none !important;
            transition: transform 0.14s ease, background-color 0.15s ease, color 0.15s ease !important;
        }
        a.md-adv-gear:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        a.md-adv-gear:active { transform: scale(0.96) !important; }

        /* 3-dots overflow hidden on desktop */
        #md-subnav-more { display: none !important; }

        @media (max-width: 768px) {
            /* Hide useless mobile hamburger menu & desktop Browse button */
            header.site-header .c-togle__menu,
            header.site-header .menu_icon__open,
            header.site-header a.menu_icon__open,
            header.site-header .mobile-icon,
            #md-subnav-toggle {
                display: none !important;
            }

            /* Mobile Top Bar: vertically centered bigger logo + clean right cluster [Search][Library][Toggle] */
            html body header.site-header .c-header__top {
                padding: 0 !important;
            }
            html body header.site-header .c-header__top .container,
            html body header.site-header .c-header__top .row {
                padding-left: 0 !important;
                padding-right: 0 !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
            }
            html body header.site-header .main-navigation_wrap {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                justify-content: space-between !important;
                min-height: 60px !important;
                padding: 8px 12px !important;
                gap: 8px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            html body header.site-header .wrap_branding {
                display: flex !important;
                align-items: center !important;
                margin: 0 !important;
                padding: 0 !important;
                min-width: 0 !important;
                flex: 0 1 auto !important;
            }
            html body header.site-header .wrap_branding a.logo {
                display: inline-flex !important;
                align-items: center !important;
                margin: 0 !important;
                padding: 0 !important;
                line-height: 0 !important;
            }
            html body header.site-header .wrap_branding a.logo img,
            html body header.site-header .wrap_branding img {
                max-height: 40px !important;
                max-width: 175px !important;
                width: auto !important;
                height: auto !important;
                display: block !important;
            }
            html body header.site-header .search-navigation {
                display: flex !important;
                align-items: center !important;
                margin: 0 0 0 auto !important;
                padding: 0 !important;
                flex: 0 0 auto !important;
            }
            html body header.site-header .search-navigation .main-menu-search {
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            html body header.site-header .search-navigation .main-menu-search > li {
                display: inline-flex !important;
                align-items: center !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            html body header.site-header a.open-search-main-menu,
            html body header.site-header .md-hdr-btn {
                width: 34px !important;
                height: 34px !important;
                flex: 0 0 34px !important;
            }
            html body header.site-header #md-theme {
                transform: none !important;
                min-width: 56px !important;
                width: 56px !important;
                height: 32px !important;
                margin: 0 !important;
                position: static !important;
                flex: 0 0 56px !important;
            }

            /* Compressed mobile search bar with gear icon next to Search button */
            html body header.site-header .search-main-menu {
                padding: 8px 10px !important;
            }
            html body header.site-header .search-main-menu form.manga-search-form {
                padding: 4px !important;
                gap: 6px !important;
            }
            html body header.site-header .search-main-menu input.manga-search-field,
            html body header.site-header .search-main-menu input[type="text"] {
                height: 38px !important;
                min-height: 38px !important;
                padding: 6px 10px !important;
                font-size: 16px !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
            }
            html body header.site-header .search-main-menu input[type="submit"],
            html body header.site-header .search-main-menu button[type="submit"] {
                height: 38px !important;
                padding: 0 12px !important;
                font-size: 13px !important;
                flex-shrink: 0 !important;
            }
            a.md-adv-gear {
                width: 38px !important;
                height: 38px !important;
                flex: 0 0 38px !important;
            }

            /* Bigger, taller mobile sub-nav bar + 3-dots dropdown for overflow items */
            html body header.site-header .c-sub-header-nav {
                display: block !important;
                position: relative !important;
                overflow: visible !important;
            }
            html body header.site-header .c-sub-header-nav .sub-nav_list {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 18px !important;
                min-height: 50px !important;
                padding: 6px 14px !important;
                overflow: visible !important;
            }
            html body header.site-header .c-sub-header-nav .sub-nav_list > li > a {
                font-size: 14.5px !important;
                font-weight: 800 !important;
                padding: 10px 4px !important;
                letter-spacing: 0.03em !important;
            }
            html body header.site-header .c-sub-header-nav .sub-nav_list > li.md-sub-overflow {
                display: none !important;
            }
            #md-subnav-more {
                display: inline-flex !important;
                align-items: center !important;
                margin-left: auto !important;
                position: static !important;
            }
            .md-more-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 36px !important;
                height: 36px !important;
                border-radius: 8px !important;
                border: 2px solid transparent !important;
                background: transparent !important;
                color: var(--ink) !important;
                cursor: pointer !important;
                transition: transform 0.14s ease, background-color 0.15s ease !important;
            }
            .md-more-btn:active { transform: scale(0.96) !important; }
            .md-more-btn[aria-expanded="true"] {
                background: var(--bg) !important;
                border-color: var(--bd) !important;
                box-shadow: var(--sh-sm) !important;
            }
            .md-more-menu {
                display: none;
                position: absolute !important;
                top: 100% !important;
                left: 8px !important;
                right: 8px !important;
                z-index: 1005 !important;
                background: var(--card) !important;
                border: var(--bw, 3px) solid var(--bd) !important;
                border-radius: var(--r, 10px) !important;
                box-shadow: var(--sh-hover, 6px 6px 0 var(--bd)) !important;
                padding: 10px !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 8px !important;
            }
            .md-more-menu.open { display: grid !important; }
            .md-more-menu a {
                display: flex !important;
                align-items: center !important;
                padding: 10px 12px !important;
                border-radius: 8px !important;
                border: 2px solid var(--bd) !important;
                background: var(--bg) !important;
                color: var(--ink) !important;
                box-shadow: var(--sh-sm) !important;
                font: 800 13px/1.2 'JetBrains Mono', monospace !important;
                text-transform: uppercase !important;
                text-decoration: none !important;
            }
            .md-more-menu a:active { transform: scale(0.96) !important; }
        }
        /* ================================================================
         *  v2026-11-21.7 ROOT-CAUSE MOBILE FIXES:
         *  - True vertical centering in mobile top bar (zero .main-navigation top padding)
         *  - Zero right-edge clipping of #md-theme (static .search-navigation, strict box-sizing)
         *  - High-specificity mobile sub-nav visibility (beats html:not([data-md-subnav-open="1"]))
         * ================================================================ */
        @media (max-width: 768px) {
            /* Beat desktop html:not([data-md-subnav-open="1"]) specificity so sub-nav is ALWAYS visible on mobile */
            html:not([data-md-subnav-open="1"]) header.site-header .c-sub-header-nav,
            html[data-md-subnav-open="1"] header.site-header .c-sub-header-nav,
            html body header.site-header .c-sub-header-nav {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                overflow: visible !important;
            }

            /* Kill Madara's extra top padding/positioning on .main-navigation & .search-navigation */
            html body header.site-header .c-header__top,
            html body header.site-header .c-header__top .main-navigation,
            html body header.site-header .c-header__top .col-12,
            html body header.site-header .c-header__top [class*="col-"] {
                padding: 0 !important;
                margin: 0 !important;
                min-height: 0 !important;
            }
            html body header.site-header .main-navigation_wrap {
                display: flex !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                justify-content: space-between !important;
                min-height: 60px !important;
                height: 60px !important;
                padding: 0 12px !important;
                margin: 0 !important;
                gap: 8px !important;
                width: 100% !important;
                max-width: 100vw !important;
                box-sizing: border-box !important;
                position: relative !important;
            }
            html body header.site-header .wrap_branding {
                position: static !important;
                display: flex !important;
                align-items: center !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
            }
            html body header.site-header .wrap_branding a.logo {
                display: inline-flex !important;
                align-items: center !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            html body header.site-header .wrap_branding a.logo img,
            html body header.site-header .wrap_branding img {
                max-height: 42px !important;
                height: 36px !important;
                width: auto !important;
                max-width: 185px !important;
                object-fit: contain !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            html body header.site-header .search-navigation,
            html body header.site-header .search-navigation__wrap {
                position: static !important;
                right: auto !important;
                left: auto !important;
                top: auto !important;
                transform: none !important;
                display: inline-flex !important;
                align-items: center !important;
                margin: 0 !important;
                padding: 0 !important;
                flex: 0 0 auto !important;
                width: auto !important;
            }
            html body header.site-header .search-navigation .main-menu-search {
                display: inline-flex !important;
                align-items: center !important;
                gap: 7px !important;
                margin: 0 !important;
                padding: 0 !important;
                position: static !important;
            }
            html body header.site-header #md-theme {
                position: static !important;
                right: auto !important;
                transform: none !important;
                width: 54px !important;
                min-width: 54px !important;
                height: 32px !important;
                min-height: 32px !important;
                margin: 0 !important;
                flex: 0 0 58px !important;
            }
        }
        /* ================================================================
         *  v2026-11-21.8 POLISH:
         *  - Frosted-blur document-start loading screen (#md-loader)
         *  - Aligned search bar + static Search button + visible Gear icon
         *  - Centered dark/light toggle circle (#md-theme)
         *  - Guaranteed visible 3-dots dropdown on mobile sub-nav bar
         * ================================================================ */

        /* 1. Frosted-Blur Loading Curtain (#md-loader) */
        #md-loader {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483640 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: color-mix(in srgb, var(--bg, #f5f2ea) 58%, transparent) !important;
            backdrop-filter: blur(18px) saturate(1.1) !important;
            -webkit-backdrop-filter: blur(18px) saturate(1.1) !important;
            transition: opacity 0.25s ease !important;
            pointer-events: all !important;
        }
        #md-loader.is-done {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        .md-loader-pill {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 12px 20px;
            background: var(--card, #ffffff);
            color: var(--ink, #111111);
            border: 3px solid var(--bd, #111111);
            border-radius: 10px;
            box-shadow: 4px 4px 0 var(--bd, #111111);
            font: 800 13.5px/1 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .md-loader-spin {
            width: 16px;
            height: 16px;
            border: 3px solid var(--bd, #111111);
            border-top-color: var(--primary, #bf5959);
            border-radius: 50%;
            animation: mdSpin 0.65s linear infinite;
        }

        /* 2. Search bar + Search button + Gear icon: force static flex alignment (no overlap) */
        html body header.site-header .search-main-menu form.manga-search-form,
        html body .search-main-menu form.manga-search-form {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 6px !important;
            position: relative !important;
        }
        html body header.site-header .search-main-menu form.manga-search-form input.manga-search-field,
        html body header.site-header .search-main-menu form.manga-search-form input[type="text"] {
            position: static !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
            width: auto !important;
            height: 40px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        html body header.site-header .search-main-menu form.manga-search-form input[type="submit"],
        html body header.site-header .search-main-menu form.manga-search-form button[type="submit"] {
            position: static !important;
            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;
            transform: none !important;
            flex: 0 0 auto !important;
            height: 40px !important;
            line-height: 1 !important;
            margin: 0 !important;
            padding: 0 14px !important;
            box-sizing: border-box !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        html body header.site-header .search-main-menu form.manga-search-form a.md-adv-gear {
            position: static !important;
            flex: 0 0 40px !important;
            width: 40px !important;
            height: 40px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }

        /* 3. Center dark/light toggle circle cleanly inside #md-theme */
        html body header.site-header #md-theme {
            width: 58px !important;
            min-width: 58px !important;
            height: 34px !important;
            min-height: 34px !important;
            padding: 0 !important;
            box-sizing: border-box !important;
        }
        html body header.site-header #md-theme .md-th-sw {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            padding: 0 3px !important;
            box-sizing: border-box !important;
        }
        html body header.site-header #md-theme .md-th-knob {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            margin: 0 !important;
        }

        @media (max-width: 768px) {
            /* Ensure sub-nav_content is a flex row so #md-subnav-more always sits on the right */
            html body header.site-header .c-sub-header-nav .sub-nav_content {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 0 10px !important;
                box-sizing: border-box !important;
                position: relative !important;
            }
            html body header.site-header .c-sub-header-nav .sub-nav_list {
                flex: 1 1 auto !important;
                padding: 6px 4px !important;
                gap: 18px !important;
            }
            html body header.site-header #md-subnav-more {
                display: inline-flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                align-items: center !important;
                flex: 0 0 auto !important;
                margin-left: 8px !important;
            }
        }
        /* ================================================================
         *  v2026-11-21.9 POLISH:
         *  - Compact mobile comments
         *  - 2-row mobile reader bottom dock + cleaner #md-rbar
         *  - Compact Advanced Search cards + mobile sort dropdown
         *  - Series overview sub-nav spacing + full-width Add to List
         *  - Neobrutalist comment spoiler tag revamp
         * ================================================================ */

        /* 1. Neobrutalist Spoiler Tag Revamp (wpDiscuz comments) */
        html body #wpdcom .wpdiscuz-spoiler-wrap,
        html body #wpdcom .wpd-spoiler-wrap {
            border: 2.5px solid var(--bd) !important;
            border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            background: var(--bg) !important;
            margin: 10px 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }
        html body #wpdcom .wpdiscuz-spoiler-title,
        html body #wpdcom .wpd-spoiler-title {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 9px 12px !important;
            margin: 0 !important;
            background: var(--card) !important;
            color: var(--ink) !important;
            border: none !important;
            border-bottom: 2px solid var(--bd) !important;
            font: 800 12.5px/1.2 'JetBrains Mono', monospace !important;
            text-transform: uppercase !important;
            letter-spacing: 0.03em !important;
            cursor: pointer !important;
            transition: background-color 0.14s ease, color 0.14s ease !important;
        }
        html body #wpdcom .wpdiscuz-spoiler-title:hover,
        html body #wpdcom .wpd-spoiler-title:hover {
            background: var(--primary) !important;
            color: #ffffff !important;
        }
        html body #wpdcom .wpdiscuz-spoiler-content,
        html body #wpdcom .wpd-spoiler-content {
            padding: 10px 12px !important;
            margin: 0 !important;
            background: var(--bg) !important;
            color: var(--ink) !important;
            border: none !important;
            font: 600 13.5px/1.55 'DM Sans', sans-serif !important;
            font-style: normal !important;
        }

        /* 2. Full-width Add to List button on series overview */
        #md-ov-lib-btn.md-ov-lib-btn {
            display: flex !important;
            width: 100% !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 11px 16px !important;
            margin-top: 10px !important;
            box-sizing: border-box !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
        }

        /* 3. Desktop: hide mobile sort dropdown */
        .md-sort-select { display: none !important; }

        /* 4. #md-rbar title ellipsis safety */
        #md-rbar .md-rb-title {
            max-width: 100% !important;
            overflow: hidden !important;
        }
        #md-rbar .md-rb-title b {
            display: block !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        @media (max-width: 768px) {
            /* A. Series Overview: prevent fixed/absolute header + sub-nav from overlapping title */
            html[data-md-page="overview"] header.site-header {
                position: relative !important;
                background: var(--header-gradient) !important;
                border-bottom: var(--bw) solid var(--bd) !important;
            }
            html[data-md-page="overview"] .profile-manga {
                padding-top: 16px !important;
            }

            /* B. 2-Row Bottom Dock in Chapter Reader (all controls reachable, no horizontal scroll) */
            html[data-md-page="chapter"] #md-dock {
                display: grid !important;
                grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
                gap: 6px !important;
                width: calc(100vw - 16px) !important;
                max-width: 420px !important;
                padding: 8px !important;
                overflow: visible !important;
                box-sizing: border-box !important;
            }
            html[data-md-page="chapter"] #md-dock .md-sep {
                display: none !important;
            }
            html[data-md-page="chapter"] #md-dock button {
                width: 100% !important;
                min-width: 0 !important;
                height: 38px !important;
                padding: 0 4px !important;
                justify-content: center !important;
            }
            html[data-md-page="chapter"] #md-dock button.md-dl {
                grid-column: span 2 !important;
            }
            html[data-md-page="chapter"] #md-rbar {
                grid-template-columns: auto minmax(0, 1fr) auto !important;
                padding: 8px 10px !important;
                gap: 8px !important;
            }
            html[data-md-page="chapter"] #md-rbar .md-rb-title b {
                max-width: 170px !important;
            }

            /* C. Compact Mobile Comments (eliminate wasted vertical space) */
            html[data-md-page="chapter"] #wpdcom {
                padding: 10px 10px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-thread-head {
                padding-bottom: 8px !important;
                margin-bottom: 10px !important;
                gap: 6px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment {
                padding: 9px 10px !important;
                margin-bottom: 8px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-wrap {
                gap: 8px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-left {
                gap: 5px !important;
                min-width: 42px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-vote {
                padding: 3px 6px !important;
                min-width: 38px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-header {
                gap: 4px 6px !important;
                margin-bottom: 4px !important;
                padding-right: 34px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-text {
                margin: 2px 0 0 !important;
                padding: 0 !important;
                line-height: 1.45 !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-text p {
                margin: 0 0 4px !important;
            }
            html[data-md-page="chapter"] #wpdcom .wpd-comment-footer {
                margin-top: 6px !important;
                padding-top: 4px !important;
            }

            /* D. Advanced Search Space Optimization + Mobile Sort Dropdown */
            .tab-wrap {
                flex-direction: row !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex-wrap: nowrap !important;
                gap: 8px !important;
                padding: 8px 10px !important;
            }
            .tab-wrap ul.c-tabs-content,
            .tab-wrap .c-nav-tabs {
                display: none !important;
            }
            .tab-wrap .md-sort-select {
                display: inline-block !important;
                padding: 7px 10px !important;
                border-radius: 8px !important;
                border: 2px solid var(--bd) !important;
                background: var(--bg) !important;
                color: var(--ink) !important;
                box-shadow: var(--sh-sm) !important;
                font: 800 13px/1.2 'JetBrains Mono', monospace !important;
                max-width: 148px !important;
                flex-shrink: 0 !important;
            }
            /* Compact search result rows on mobile */
            .search-lists .c-tabs-item__content,
            .c-tabs-item__content.row {
                display: flex !important;
                flex-direction: row !important;
                align-items: flex-start !important;
                gap: 10px !important;
                padding: 10px !important;
                margin: 0 0 10px !important;
            }
            .search-lists .c-tabs-item__content .tab-thumb,
            .c-tabs-item__content .col-4,
            .c-tabs-item__content .col-sm-3 {
                flex: 0 0 84px !important;
                width: 84px !important;
                max-width: 84px !important;
                padding: 0 !important;
            }
            .search-lists .c-tabs-item__content .tab-summary,
            .c-tabs-item__content .col-8,
            .c-tabs-item__content .col-sm-9 {
                flex: 1 1 auto !important;
                min-width: 0 !important;
                max-width: none !important;
                padding: 0 !important;
            }
            .c-tabs-item__content .mg_alternative,
            .c-tabs-item__content .mg_author,
            .c-tabs-item__content .mg_artists {
                display: none !important;
            }
            .c-tabs-item__content .post-content_item {
                margin: 2px 0 !important;
                padding: 0 !important;
                display: flex !important;
                gap: 6px !important;
                font-size: 12px !important;
            }
            .c-tabs-item__content .mg_genres .summary-content {
                display: -webkit-box !important;
                -webkit-line-clamp: 1 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
            }
        }
        /* ================================================================
         *  v2026-11-21.10 POLISH:
         *  - Mobile-only dock: hide zoom & stretch, always 100vw chapter strip
         *  - Clean compact Advanced Search cards on mobile
         *  - Spacing between ADD TO LIST and bottom edge of .post-status
         *  - Neobrutalist Custom Video Player controls (with download)
         * ================================================================ */

        /* 1. Breathing space between ADD TO LIST and bottom border of .post-status */
        html[data-md-page="overview"] .summary_content_wrap .post-status,
        html[data-md-page="overview"] .post-status {
            padding-bottom: 16px !important;
        }
        #md-ov-lib-btn.md-ov-lib-btn {
            margin-top: 12px !important;
            margin-bottom: 2px !important;
        }

        /* 2. Custom Neobrutalist Comment Video Player (.md-vid-wrap) */
        .md-vid-wrap {
            position: relative;
            width: 100%;
            max-width: 540px;
            margin: 10px 0;
            background: #0b0b0c;
            border: var(--bw, 3px) solid var(--bd);
            border-radius: var(--r, 10px);
            box-shadow: var(--sh);
            overflow: hidden;
        }
        .md-vid-wrap video {
            display: block !important;
            width: 100% !important;
            max-height: 440px !important;
            object-fit: contain !important;
            background: #0b0b0c !important;
            cursor: pointer !important;
        }
        .md-vid-bar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 10px;
            background: var(--card);
            border-top: 2.5px solid var(--bd);
        }
        .md-vid-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            flex: 0 0 32px;
            border-radius: 7px;
            border: 2px solid var(--bd);
            background: var(--bg);
            color: var(--ink);
            box-shadow: var(--sh-sm);
            cursor: pointer;
            padding: 0;
            transition: transform 0.14s ease, background-color 0.14s ease, color 0.14s ease;
        }
        .md-vid-btn:hover {
            background: var(--primary);
            color: #ffffff;
        }
        .md-vid-btn:active { transform: scale(0.96); }
        .md-vid-btn svg { width: 15px; height: 15px; }
        .md-vid-seek {
            flex: 1 1 auto;
            min-width: 50px;
            accent-color: var(--primary);
            cursor: pointer;
            margin: 0 2px;
        }
        .md-vid-time {
            font: 800 11px/1 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
            color: var(--ink);
            white-space: nowrap;
            flex-shrink: 0;
        }

        @media (max-width: 768px) {
            /* 3. Mobile-only Chapter Reader: remove zoom & stretch from dock, always stretch images to 100vw */
            html[data-md-page="chapter"] .reading-content,
            html[data-md-page="chapter"] .reading-content .page-break,
            html[data-md-page="chapter"] .reading-content img {
                width: 100vw !important;
                max-width: 100vw !important;
                min-width: 100vw !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            html[data-md-page="chapter"] #md-dock [data-act="zoom-out"],
            html[data-md-page="chapter"] #md-dock [data-act="zoom-reset"],
            html[data-md-page="chapter"] #md-dock [data-act="zoom-in"],
            html[data-md-page="chapter"] #md-dock [data-act="stretch"] {
                display: none !important;
            }
            html[data-md-page="chapter"] #md-dock {
                display: grid !important;
                grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
                gap: 6px !important;
                width: calc(100vw - 16px) !important;
                max-width: 380px !important;
                padding: 8px !important;
            }
            html[data-md-page="chapter"] #md-dock button.md-dl {
                grid-column: span 2 !important;
            }

            /* 4. Clean Compact Advanced Search Results Bar & Cards on Mobile */
            .tab-wrap .c-blog__heading {
                border: none !important;
                box-shadow: none !important;
                background: transparent !important;
                background-image: none !important;
                padding: 0 !important;
                min-width: 0 !important;
                overflow: hidden !important;
            }
            .tab-wrap .c-blog__heading h1,
            .tab-wrap .c-blog__heading h2,
            .tab-wrap .c-blog__heading h3,
            .tab-wrap .c-blog__heading h4,
            .tab-wrap .c-blog__heading .h4 {
                font-size: 12.5px !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .search-lists .row.c-tabs-item__content,
            .c-tabs-item__content.row {
                display: grid !important;
                grid-template-columns: 96px minmax(0, 1fr) !important;
                gap: 10px 12px !important;
                align-items: start !important;
                padding: 12px !important;
                margin: 0 0 12px !important;
                background: var(--card) !important;
                border: var(--bw) solid var(--bd) !important;
                border-radius: var(--r) !important;
                box-shadow: var(--sh) !important;
            }
            .c-tabs-item__content > [class*="col-"]:first-child {
                grid-column: 1 !important;
                width: 96px !important;
                max-width: 96px !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .c-tabs-item__content .tab-thumb,
            .c-tabs-item__content .c-image-hover {
                width: 96px !important;
                aspect-ratio: 2 / 3 !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                margin: 0 !important;
            }
            .c-tabs-item__content .tab-thumb img {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
            }
            .c-tabs-item__content > [class*="col-"]:nth-child(2) {
                grid-column: 2 !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .c-tabs-item__content .tab-summary {
                display: flex !important;
                flex-direction: column !important;
                gap: 6px !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .c-tabs-item__content .post-title h3,
            .c-tabs-item__content .post-title h4 {
                margin: 0 !important;
                font: 800 14.5px/1.25 'DM Sans', sans-serif !important;
                display: -webkit-box !important;
                -webkit-line-clamp: 2 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
            }
            .c-tabs-item__content .post-content {
                background: transparent !important;
                border: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 3px !important;
            }
            .c-tabs-item__content .post-content_item.md-search-verbose {
                display: none !important;
            }
            .c-tabs-item__content .post-content_item {
                display: flex !important;
                align-items: baseline !important;
                gap: 6px !important;
                margin: 0 !important;
                padding: 0 !important;
                font-size: 12px !important;
                line-height: 1.3 !important;
            }
            .c-tabs-item__content .post-content_item .summary-heading {
                width: auto !important;
                min-width: 0 !important;
                flex: 0 0 auto !important;
                font-weight: 800 !important;
                color: var(--muted) !important;
            }
            .c-tabs-item__content .post-content_item .summary-content {
                width: auto !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
                padding: 0 !important;
            }
            .c-tabs-item__content .tab-meta {
                grid-column: 1 / -1 !important;
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 6px !important;
                padding-top: 8px !important;
                margin-top: 2px !important;
                border-top: 1.5px dashed var(--bd) !important;
            }
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
        const isBad = s => !s || s.startsWith('data:image/svg') || s.startsWith('data:image/gif;base64,R0lGODlhAQAB') || /placeholder|blank\./i.test(s);
        const cand = [
            img.getAttribute('data-manga-src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-lzl-src'),
            img.getAttribute('data-cfsrc'),
            img.getAttribute('wmu-data-src'),
            img.getAttribute('data-original'),
            img.currentSrc,
            img.getAttribute('src'),
            img.src
        ];
        for (const c of cand) {
            if (!c) continue;
            const s = String(c).trim();
            if (!isBad(s)) return s;
        }
        const ss = (img.getAttribute('srcset') || img.getAttribute('data-srcset') || '').trim();
        if (ss) {
            const parts = ss.split(',').map(p => p.trim().split(/\s+/));
            parts.sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0));
            for (const p of parts) {
                if (p[0] && !isBad(p[0])) return p[0];
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

    const TAP_IGNORE = 'a, button, input, select, textarea, label, summary, details, dialog, iframe, [role="button"], #md-dock, #md-toast, #md-top, #md-rbar, #md-progress, .md-modal-backdrop, header';

    function headerAutoHide() {
        if (!CONFIG.readerHeaderAutoHide) return;
        let last = scrollY;
        addEventListener('scroll', () => {
            if (PAGE() === 'chapter') return;
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
            if (on) {
                delete root.dataset.mdNavhide;
                openY = scrollY;
            } else {
                root.dataset.mdNavhide = '1';
            }
        };

        if (tapMode) {
            dock.classList.add('hide');
            root.dataset.mdNavhide = '1';
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
                const hide = dy > 0 && y > 240 && !nearEnd && !isBusy();
                dock.classList.toggle('hide', hide);
                if (hide) root.dataset.mdNavhide = '1';
                else delete root.dataset.mdNavhide;
            }
        }, { passive: true });

        if (!readerChrome.nav) {
            readerChrome.nav = true;
            headerAutoHide();
        }
    }

    let autoScrollRaf = 0;
    let autoScrollLast = 0;
    let autoScrollCarry = 0;
    let autoScrollSpeed = Number(store.get('autoScrollSpeed', 150)) || 150;
    function setAutoScroll(on) {
        const btn = reader.dock && $('[data-act="autoscroll"]', reader.dock);
        if (!on) {
            if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
            autoScrollRaf = 0;
            autoScrollCarry = 0;
            if (btn) btn.classList.remove('is-on');
            return;
        }
        if (btn) btn.classList.add('is-on');
        autoScrollSpeed = Number(store.get('autoScrollSpeed', autoScrollSpeed)) || 150;
        autoScrollLast = performance.now();
        autoScrollCarry = 0;
        const tick = now => {
            if (!autoScrollRaf) return;
            const dt = Math.min(0.1, Math.max(0, (now - autoScrollLast) / 1000));
            autoScrollLast = now;
            autoScrollCarry += autoScrollSpeed * dt;
            const step = Math.trunc(autoScrollCarry);
            if (step !== 0) {
                window.scrollBy(0, step);
                autoScrollCarry -= step;
            }
            if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
                setAutoScroll(false);
                return;
            }
            autoScrollRaf = requestAnimationFrame(tick);
        };
        autoScrollRaf = requestAnimationFrame(tick);
    }

    function applyStretch(on, persist = true) {
        const val = !!on;
        if (val) root.dataset.mdStretch = '1';
        else delete root.dataset.mdStretch;
        if (persist) store.set('stretch', val);
        const btn = reader.dock && $('[data-act="stretch"]', reader.dock);
        if (btn) btn.classList.toggle('is-on', val);
    }

    function syncFullscreenBtn() {
        const btn = reader.dock && $('[data-act="fullscreen"]', reader.dock);
        if (btn) btn.classList.toggle('is-on', !!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', syncFullscreenBtn);

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || (() => {})).call(document.documentElement);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
        }
    }

    function setupProgressRail() {
        if (PAGE() !== 'chapter' || !document.body) return;
        let rail = document.getElementById('md-progress');
        if (!rail) {
            rail = document.createElement('div');
            rail.id = 'md-progress';
            rail.title = 'Reading progress (click to jump)';
            rail.innerHTML = '<div id="md-progress-fill"></div>';
            document.body.appendChild(rail);
            rail.addEventListener('click', e => {
                const imgs = $$('.reading-content img');
                if (!imgs.length) return;
                const firstTop = imgs[0].getBoundingClientRect().top + scrollY;
                const lastBot = imgs[imgs.length - 1].getBoundingClientRect().bottom + scrollY;
                const rect = rail.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
                const targetY = firstTop + ratio * Math.max(0, lastBot - firstTop - innerHeight);
                window.scrollTo({ top: targetY, behavior: 'smooth' });
            });
            const update = () => {
                const side = store.get('progSide', 'right');
                rail.dataset.side = side;
                if (side === 'off') return;
                const imgs = $$('.reading-content img');
                if (!imgs.length) {
                    rail.style.opacity = '0';
                    return;
                }
                const firstTop = imgs[0].getBoundingClientRect().top + scrollY;
                const lastRect = imgs[imgs.length - 1].getBoundingClientRect();
                const lastBot = lastRect.bottom + scrollY;
                const span = Math.max(1, lastBot - firstTop - innerHeight);
                const pct = Math.max(0, Math.min(100, ((scrollY - firstTop) / span) * 100));
                rail.style.setProperty('--md-prog-pct', pct.toFixed(1) + '%');
                // Clamp bottom edge so rail ends with the last chapter image and never enters comments
                const distFromBottom = Math.max(12, Math.round(innerHeight - lastRect.bottom + 8));
                rail.style.setProperty('--md-prog-bottom', distFromBottom + 'px');
                rail.style.opacity = lastRect.bottom < 48 ? '0' : '1';
                // Update Continue Reading percentage silently
                updateReadingPct(Math.round(pct));
            };
            let raf = 0;
            const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
            addEventListener('scroll', sched, { passive: true });
            addEventListener('resize', sched, { passive: true });
            setTimeout(update, 300);
            rail.__update = update;
        } else if (rail.__update) {
            rail.__update();
        }
    }

    function buildDock(ctx) {
        if (reader.dock) return;
        const d = reader.dock = document.createElement('div');
        d.id = 'md-dock';

        const btn = (act, icon, title, label) =>
            `<button type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon}${label ? `<span class="md-lbl">${label}</span>` : ''}</button>`;
        const swapBtn = (act, icA, icB, title) =>
            `<button type="button" data-act="${act}" title="${title}" aria-label="${title}"><span class="md-ic-swap"><span class="ic-a">${icA}</span><span class="ic-b">${icB}</span></span></button>`;

        d.innerHTML =
            btn('prev', ICON.prev, 'Previous chapter (←)') +
            swapBtn('chapters', ICON.list, ICON.stop, 'Chapter list (C)') +
            btn('next', ICON.next, 'Next chapter (→)') +
            '<span class="md-sep"></span>' +
            btn('zoom-out', ICON.minus, 'Zoom out (-)') +
            '<button type="button" class="md-zoom" data-act="zoom-reset" title="Reset zoom (0)" aria-label="Reset zoom">100%</button>' +
            btn('zoom-in', ICON.plus, 'Zoom in (+)') +
            swapBtn('stretch', ICON.stretch, ICON.shrinkW, 'Stretch to fit width') +
            '<span class="md-sep"></span>' +
            swapBtn('autoscroll', ICON.scroll, ICON.pause, 'Auto-scroll (P)') +
            swapBtn('fullscreen', ICON.expand, ICON.compress, 'Fullscreen (F)') +
            btn('bg', ICON.bg, 'Background colour (B)') +
            '<button type="button" class="md-dl" data-act="download"></button>';

        document.body.appendChild(d);

        reader.dl = $('.md-dl', d);
        setDl('idle', 'CBZ');
        $('[data-act="prev"]', d).disabled = !ctx.prev;
        $('[data-act="next"]', d).disabled = !ctx.next;
        applyStretch(store.get('stretch', false), false);
        syncFullscreenBtn();

        d.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            const cur = chapterContext();
            switch (b.dataset.act) {
                case 'prev': if (cur.prev) location.href = cur.prev; break;
                case 'chapters': toggleChapterModal(); break;
                case 'next': if (cur.next) location.href = cur.next; break;
                case 'zoom-out': stepZoom(-1); break;
                case 'zoom-in': stepZoom(1); break;
                case 'zoom-reset': applyZoom(1); break;
                case 'stretch': applyStretch(root.dataset.mdStretch !== '1'); break;
                case 'autoscroll': setAutoScroll(!autoScrollRaf); break;
                case 'fullscreen': toggleFullscreen(); break;
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
            else if (e.key === 'p' || e.key === 'P') setAutoScroll(!autoScrollRaf);
            else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
            else if (e.key === 'c' || e.key === 'C') toggleChapterModal();
        });
    }

    function syncDockSelect(dock) {
        if (!dock) return;
        const ctx = chapterContext();
        const prevBtn = $('[data-act="prev"]', dock);
        const nextBtn = $('[data-act="next"]', dock);
        if (prevBtn) prevBtn.disabled = !ctx.prev;
        if (nextBtn) nextBtn.disabled = !ctx.next;

        // Chapter selection is handled by #md-rchap-modal (dock list button & top-bar pill)
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
        setupProgressRail();
        recordReadingHistory(ctx);
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
            let actLi = searchUl.querySelector('li.menu-md-act');
            if (!actLi) {
                actLi = document.createElement('li');
                actLi.className = 'menu-md-act';
                const libBtn = document.createElement('button');
                libBtn.id = 'md-lib-btn';
                libBtn.type = 'button';
                libBtn.className = 'md-hdr-btn';
                libBtn.title = 'Library & Lists';
                libBtn.setAttribute('aria-label', 'Open Library');
                libBtn.innerHTML = ICON.bookmark;
                libBtn.addEventListener('click', () => openLibraryModal());

                actLi.append(libBtn);
                searchUl.appendChild(actLi);
            }
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

        // Mobile touch swipe left/right on hero
        let touchX0 = 0, touchY0 = 0;
        hero.addEventListener('touchstart', e => {
            if (!e.touches || !e.touches[0]) return;
            touchX0 = e.touches[0].clientX;
            touchY0 = e.touches[0].clientY;
        }, { passive: true });
        hero.addEventListener('touchend', e => {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            const dx = e.changedTouches[0].clientX - touchX0;
            const dy = e.changedTouches[0].clientY - touchY0;
            if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                showSlide(dx < 0 ? currentSlide + 1 : currentSlide - 1);
            }
        }, { passive: true });

        // Dynamic first-chapter resolution for "Read now" via Madara POST <seriesUrl>/ajax/chapters/
        const handleFirstChapterClick = async e => {
            const link = e.currentTarget;
            const sUrl = link && link.dataset.seriesUrl;
            if (!sUrl) return;
            e.preventDefault();
            const origText = link.classList.contains('md-hero-play') ? link.innerHTML : null;
            if (origText) link.textContent = 'Finding Ch. 1…';
            try {
                const firstUrl = await resolveFirstChapterUrl(sUrl);
                location.href = firstUrl || link.dataset.fallbackUrl || sUrl;
            } catch (_) {
                location.href = link.dataset.fallbackUrl || sUrl;
            } finally {
                if (origText) link.innerHTML = origText;
            }
        };
        const heroPlayBtn = hero.querySelector('.md-hero-play');
        const heroCardBtn = hero.querySelector('.md-hero-card');
        if (heroPlayBtn) heroPlayBtn.addEventListener('click', handleFirstChapterClick);
        if (heroCardBtn) heroCardBtn.addEventListener('click', handleFirstChapterClick);

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
            if (playBtn) {
                playBtn.href = cur.href;
                playBtn.dataset.seriesUrl = cur.href;
                playBtn.dataset.fallbackUrl = cur.chapterHref || cur.href;
            }

            const moreBtn = hero.querySelector('.md-hero-more');
            if (moreBtn) moreBtn.href = cur.href;

            const cardLink = hero.querySelector('.md-hero-card');
            if (cardLink) {
                cardLink.href = cur.href;
                cardLink.dataset.seriesUrl = cur.href;
                cardLink.dataset.fallbackUrl = cur.chapterHref || cur.href;
            }

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
            const b = $('b', t), chBtn = $('.md-rb-chap', t);
            if (b && b.textContent !== ctx.series) b.textContent = ctx.series;
            if (chBtn && chBtn.textContent !== ctx.label) chBtn.textContent = ctx.label;
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
            '<div class="md-rb-left">' +
                '<a class="md-rb-btn" data-k="home" href="/" title="Home">' + ICON.home + '<span class="md-rb-lbl">Home</span></a>' +
                '<a class="md-rb-btn" data-k="series" href="#" title="Series page">' + ICON.list + '<span class="md-rb-lbl">Series</span></a>' +
            '</div>' +
            '<div class="md-rb-title"><b></b><button type="button" class="md-rb-chap" title="Switch chapter"></button></div>' +
            '<div class="md-rb-right">' +
                '<button type="button" class="md-rb-btn" data-k="comments" title="Jump to comments">' + ICON.chat + '<span class="md-rb-lbl">Comments</span><span class="md-rb-count"></span></button>' +
                '<button type="button" class="md-rb-btn" data-k="settings" title="Reader settings">' + ICON.gear + '<span class="md-rb-lbl">Settings</span></button>' +
            '</div>';
        document.body.appendChild(bar);
        $('[data-k="comments"]', bar).addEventListener('click', () => {
            const target = $('#wpdcom') || $('#respond') || $('#comments') || $('.comments-area');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else toast('No comments section on this page');
        });
        $('[data-k="settings"]', bar).addEventListener('click', () => openSettingsModal());
        $('.md-rb-chap', bar).addEventListener('click', () => toggleChapterModal());
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
            // Prevent broken avatar alt text from stretching avatar circle
            const av = own('.wpd-avatar');
            const avImg = av && av.querySelector('img');
            if (av && avImg) {
                const fallbackAvatar = () => {
                    if (av.dataset.mdAvFixed) return;
                    av.dataset.mdAvFixed = '1';
                    const author = (own('.wpd-comment-author')?.textContent || avImg.getAttribute('alt') || '?').trim();
                    const initial = (author.replace(/[^A-Za-z0-9]/g, '')[0] || author[0] || '?').toUpperCase();
                    avImg.style.display = 'none';
                    const sp = document.createElement('span');
                    sp.className = 'md-av-fallback';
                    sp.textContent = initial;
                    av.appendChild(sp);
                };
                if (avImg.complete && avImg.naturalWidth === 0) fallbackAvatar();
                else avImg.addEventListener('error', fallbackAvatar, { once: true });
            }
        });
    }

    function setupCommentLoading() {
        const w = $('#wpdcom');
        if (!w) return;
        const oldInd = w.querySelector(':scope > .md-cload');
        if (oldInd) oldInd.remove();

        const bindLoadMore = () => {
            $$('.wpd-load-more-submit, .wpd-load-comments', w).forEach(btn => {
                if (btn.dataset.mdLmInit) return;
                btn.dataset.mdLmInit = '1';
                btn.dataset.mdOrigLabel = (btn.textContent || 'Load More Comments').trim();
                btn.addEventListener('click', () => {
                    btn.classList.add('md-lm-loading');
                    btn.innerHTML = '<span class="md-lm-spin" aria-hidden="true"></span><span>Loading comments…</span>';
                });
            });
        };
        bindLoadMore();

        if (w.__mdCL) return;
        let wasLoading = false;
        w.__mdCL = setInterval(() => {
            if (!w.isConnected) { clearInterval(w.__mdCL); w.__mdCL = null; return; }
            bindLoadMore();
            const bar = document.getElementById('wpdiscuz-loading-bar') || $('.wpdiscuz-loading-bar');
            let on = false;
            if (bar) {
                const cs = getComputedStyle(bar);
                on = cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.05;
            }
            if (!on) on = !!w.querySelector('.wpd-loading, .wpd_loading');
            if (on !== wasLoading) {
                wasLoading = on;
                $$('.wpd-load-more-submit, .wpd-load-comments', w).forEach(btn => {
                    if (on) {
                        if (!btn.classList.contains('md-lm-loading')) {
                            btn.dataset.mdOrigLabel = btn.dataset.mdOrigLabel || (btn.textContent || 'Load More Comments').trim();
                            btn.classList.add('md-lm-loading');
                            btn.innerHTML = '<span class="md-lm-spin" aria-hidden="true"></span><span>Loading comments…</span>';
                        }
                    } else if (btn.classList.contains('md-lm-loading')) {
                        btn.classList.remove('md-lm-loading');
                        btn.textContent = btn.dataset.mdOrigLabel || 'Load More Comments';
                    }
                });
                if (!on && PAGE() === 'chapter') {
                    try { applyCommentSort(); } catch (_) {}
                }
            }
        }, 220);
    }

    function lazyImages() {
        $$('div.page-item-detail img, .popular-item-wrap img').forEach(i => {
            if (!i.hasAttribute('loading')) i.setAttribute('loading', 'lazy');
            if (!i.hasAttribute('decoding')) i.setAttribute('decoding', 'async');
        });
    }

    let trimTimer = 0;
    function trimHeroGap() {
        // Clear any previously applied trim first so Continue Reading is never overlapped
        $$('[data-md-trim="1"]').forEach(el => {
            el.style.removeProperty('margin-top');
            delete el.dataset.mdTrim;
        });
        const anchor = document.getElementById('md-continue-reading') || document.getElementById('md-hero');
        if (!anchor || innerWidth > 768) return;
        const anchorRect = anchor.getBoundingClientRect();
        if (anchorRect.height <= 0) return;
        const next = [...document.querySelectorAll('.c-blog__heading, .page-content-listing, .page-listing-item')]
            .find(e => !anchor.contains(e) && e.getBoundingClientRect().top >= anchorRect.bottom - 2 && e.getBoundingClientRect().height > 0);
        if (!next) return;
        const gap = next.getBoundingClientRect().top - anchorRect.bottom;
        if (gap > 44 && gap < 180) {
            const mt = parseFloat(getComputedStyle(next).marginTop) || 0;
            next.style.setProperty('margin-top', (mt - (gap - 20)) + 'px', 'important');
            next.dataset.mdTrim = '1';
        }
    }
    window.addEventListener('resize', () => { clearTimeout(trimTimer); trimTimer = setTimeout(trimHeroGap, 200); });

    /* ====================================================================
     *  MADARA AJAX CHAPTER FETCHER & FIRST-CHAPTER RESOLVER
     * ==================================================================== */
    function seriesSlugFromUrl(u) {
        try {
            const p = new URL(u, location.origin).pathname;
            const m = p.match(/\/manga\/([^/]+)/i);
            return m ? m[1].toLowerCase() : p.replace(/^\/+|\/+$/g, '').toLowerCase();
        } catch (_) {
            return String(u || '');
        }
    }

    async function fetchMadaraChapters(seriesUrl) {
        if (!seriesUrl) return [];
        const base = seriesUrl.replace(/\/+$/, '') + '/ajax/chapters/';
        const res = await fetch(base, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!res.ok) return [];
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const list = [];
        doc.querySelectorAll('li.wp-manga-chapter').forEach(li => {
            const a = li.querySelector('a');
            if (!a) return;
            const href = a.getAttribute('href') || a.href;
            const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
            const dateEl = li.querySelector('span.chapter-release-date');
            const date = dateEl ? dateEl.textContent.replace(/\s+/g, ' ').trim() : '';
            if (href && label) list.push({ href, label, date });
        });
        return list;
    }

    async function resolveFirstChapterUrl(seriesUrl) {
        const key = 'md-first-ch:' + seriesSlugFromUrl(seriesUrl);
        try {
            const cached = sessionStorage.getItem(key);
            if (cached) return cached;
        } catch (_) {}
        const list = await fetchMadaraChapters(seriesUrl);
        if (!list.length) return null;
        // Madara returns chapters newest-first; pick the oldest/lowest chapter (supports Ch. 0, Prologue, Ch. 0.1, Ch. 1)
        const first = list[list.length - 1];
        if (first && first.href) {
            try { sessionStorage.setItem(key, first.href); } catch (_) {}
            return first.href;
        }
        return null;
    }

    /* ====================================================================
     *  COVER CACHE, CONTINUE READING SHELF & LOCAL LIBRARY
     * ==================================================================== */
    const DEFAULT_LISTS = ['Currently Reading', 'Plan to Read', 'Completed'];

    function getCoverCache() {
        const c = store.get('covers', {});
        return c && typeof c === 'object' ? c : {};
    }

    function upscaleCoverUrl(url) {
        if (!url || typeof url !== 'string' || url.startsWith('data:')) return url || '';
        return url.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)(?=$|\?)/, '$1');
    }

    function ensureSharpenSvg() {
        if (document.getElementById('md-svg-filters') || !document.body) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'md-svg-filters';
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
        svg.innerHTML = '<defs><filter id="md-sharpen"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.35 0 -0.35 2.4 -0.35 0 -0.35 0"/></filter></defs>';
        document.body.appendChild(svg);
    }

    function evaluateCoverQuality(img) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const box = img.closest('.item-thumb, .popular-img, .md-cr-thumb, .md-lib-thumb, .summary_image');
        if (img.naturalWidth < 180) {
            img.classList.remove('md-sharpen');
            if (box) {
                const src = img.currentSrc || img.src || '';
                box.classList.add('md-lowres-wrap');
                if (src) box.style.setProperty('--md-lowres-bg', 'url("' + src.replace(/"/g, '%22') + '")');
            }
        } else {
            if (box) {
                box.classList.remove('md-lowres-wrap');
                box.style.removeProperty('--md-lowres-bg');
            }
            if (img.naturalWidth < 250) {
                ensureSharpenSvg();
                img.classList.add('md-sharpen');
            } else {
                img.classList.remove('md-sharpen');
            }
        }
    }

    function upgradeCoverImg(img) {
        if (!img || img.dataset.mdCovUp === '1') return;
        const orig = getImgSrc(img);
        if (!orig || orig.startsWith('data:')) return;
        img.dataset.mdCovUp = '1';
        img.removeAttribute('width');
        img.removeAttribute('height');
        const full = upscaleCoverUrl(orig);
        if (full && full !== orig) {
            img.dataset.mdOrigSrc = orig;
            img.removeAttribute('srcset');
            img.removeAttribute('sizes');
            img.addEventListener('error', () => {
                if (img.dataset.mdFallbackDone) return;
                img.dataset.mdFallbackDone = '1';
                img.src = orig;
            }, { once: true });
            img.src = full;
        }
        img.addEventListener('load', () => evaluateCoverQuality(img));
        if (img.complete && img.naturalWidth) evaluateCoverQuality(img);
    }

    function saveCover(slug, url) {
        if (!slug || !url || url.startsWith('data:')) return;
        const clean = upscaleCoverUrl(url);
        const c = getCoverCache();
        if (c[slug] !== clean) {
            c[slug] = clean;
            const keys = Object.keys(c);
            if (keys.length > 240) delete c[keys[0]];
            store.set('covers', c);
        }
        // Upgrade stored library & history cover URLs to un-suffixed full-res
        const lib = getLibrary();
        let libDirty = false;
        Object.keys(lib).forEach(k => {
            (lib[k] || []).forEach(it => {
                if (it && it.slug === slug && it.cover !== clean) {
                    it.cover = clean;
                    libDirty = true;
                }
            });
        });
        if (libDirty) setLibrary(lib);
        const hist = getHistory();
        let histDirty = false;
        hist.forEach(it => {
            if (it && it.slug === slug && it.cover !== clean) {
                it.cover = clean;
                histDirty = true;
            }
        });
        if (histDirty) setHistory(hist);
    }

    function harvestCovers() {
        $$('div.page-item-detail').forEach(card => {
            const a = card.querySelector('.item-thumb a, .post-title a');
            const img = card.querySelector('.item-thumb img, img');
            if (img) upgradeCoverImg(img);
            if (a && img) saveCover(seriesSlugFromUrl(a.href), getImgSrc(img));
        });
        $$('.popular-item-wrap img, .widget-manga-recent img, .md-cr-thumb img, .md-lib-thumb img').forEach(img => {
            upgradeCoverImg(img);
        });
        if (PAGE() === 'overview') {
            const img = $('.summary_image img');
            if (img) {
                upgradeCoverImg(img);
                saveCover(seriesSlugFromUrl(location.href), getImgSrc(img));
            }
        }
    }

    function getHistory() {
        const arr = store.get('history', []);
        return Array.isArray(arr) ? arr : [];
    }

    function setHistory(arr) {
        store.set('history', arr.slice(0, 30));
    }

    function getLibrary() {
        const lib = store.get('library', null);
        if (lib && typeof lib === 'object') {
            DEFAULT_LISTS.forEach(name => { if (!Array.isArray(lib[name])) lib[name] = []; });
            return lib;
        }
        return { 'Currently Reading': [], 'Plan to Read': [], 'Completed': [] };
    }

    function setLibrary(lib) {
        store.set('library', lib);
    }

    function isInAnyList(slug) {
        const lib = getLibrary();
        return Object.values(lib).some(arr => Array.isArray(arr) && arr.some(it => it.slug === slug));
    }

    function upsertInList(listName, item) {
        const lib = getLibrary();
        if (!Array.isArray(lib[listName])) lib[listName] = [];
        lib[listName] = [item, ...lib[listName].filter(x => x.slug !== item.slug)];
        setLibrary(lib);
    }

    function removeFromList(listName, slug) {
        const lib = getLibrary();
        if (!Array.isArray(lib[listName])) return;
        lib[listName] = lib[listName].filter(x => x.slug !== slug);
        setLibrary(lib);
    }

    function recordReadingHistory(ctx) {
        if (!ctx || !ctx.seriesUrl) return;
        const slug = seriesSlugFromUrl(ctx.seriesUrl);
        const covers = getCoverCache();
        const cover = covers[slug] || '';
        const prev = getHistory().find(x => x.slug === slug);
        const entry = {
            slug,
            series: ctx.series,
            seriesUrl: ctx.seriesUrl,
            chapterLabel: ctx.label,
            chapterUrl: location.href,
            cover: cover || (prev && prev.cover) || '',
            pct: prev && prev.chapterUrl === location.href ? (prev.pct || 0) : 0,
            updatedAt: Date.now()
        };
        const next = [entry, ...getHistory().filter(x => x.slug !== slug)];
        setHistory(next);
        // Auto-sync with Currently Reading list
        upsertInList('Currently Reading', {
            slug,
            title: ctx.series,
            url: ctx.seriesUrl,
            cover: entry.cover,
            chapterLabel: ctx.label,
            chapterUrl: location.href,
            addedAt: Date.now()
        });
    }

    let lastPctSave = 0;
    function updateReadingPct(pct) {
        const now = Date.now();
        if (now - lastPctSave < 1200) return;
        lastPctSave = now;
        const hist = getHistory();
        if (!hist.length || hist[0].chapterUrl !== location.href) return;
        hist[0].pct = Math.max(hist[0].pct || 0, pct);
        setHistory(hist);
    }

    function buildContinueReading() {
        const b = document.body;
        const isSearchOrArchive = !!(location.search && /[?&](s|post_type|m_orderby|genre)=/i.test(location.search)) ||
            !!(b && (b.classList.contains('search') || b.classList.contains('search-results') || b.classList.contains('archive')));
        const isHome = PAGE() === 'list' && (location.pathname === '/' || location.pathname === '' || /^\/index\.php$/i.test(location.pathname)) && !isSearchOrArchive;
        const existing = document.getElementById('md-continue-reading');
        if (!isHome) { if (existing) existing.remove(); return; }
        const hist = getHistory();
        if (!hist.length) { if (existing) existing.remove(); return; }

        const covers = getCoverCache();
        const shelf = existing || document.createElement('section');
        shelf.id = 'md-continue-reading';
        const cards = hist.slice(0, 14).map(it => {
            const img = it.cover || covers[it.slug] || '';
            const pct = Math.max(0, Math.min(100, Number(it.pct) || 0));
            return `<div class="md-cr-card" data-slug="${it.slug.replace(/"/g, '&quot;')}">
                <button type="button" class="md-cr-rm" data-rm="${it.slug.replace(/"/g, '&quot;')}" title="Remove from Continue Reading" aria-label="Remove">&times;</button>
                <a href="${it.chapterUrl.replace(/"/g, '&quot;')}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;flex:1">
                    <div class="md-cr-thumb">${img ? `<img src="${img.replace(/"/g, '&quot;')}" alt="" loading="lazy" decoding="async">` : ''}</div>
                    <div class="md-cr-bar"><i style="width:${pct}%"></i></div>
                    <div class="md-cr-meta">
                        <span class="md-cr-name">${toTitleCase(it.series).replace(/</g, '&lt;')}</span>
                        <span class="md-cr-ch">${String(it.chapterLabel || '').replace(/</g, '&lt;')}</span>
                    </div>
                </a>
            </div>`;
        }).join('');

        shelf.innerHTML = `<div class="md-cr-hd">
            <div class="md-cr-hd-left">
                <span class="md-cr-badge" aria-hidden="true">${ICON.bookmarkFill}</span>
                <h3 class="md-cr-title">Continue Reading</h3>
            </div>
            <button type="button" class="md-cr-clear">Clear history</button>
        </div>
        <div class="md-cr-wrap" data-fade="none"><div class="md-cr-row">${cards}</div></div>`;

        if (!existing) {
            const hero = document.getElementById('md-hero');
            if (hero) {
                hero.after(shelf);
            } else {
                const pageContent = $('.c-page-content') || $('.site-content') || document.body;
                pageContent.prepend(shelf);
            }
        }

        const crWrap = $('.md-cr-wrap', shelf);
        const crRow = $('.md-cr-row', shelf);
        if (crWrap && crRow) {
            const syncFade = () => {
                const maxScroll = crRow.scrollWidth - crRow.clientWidth;
                if (maxScroll <= 4) { crWrap.dataset.fade = 'none'; return; }
                const left = crRow.scrollLeft > 8;
                const right = crRow.scrollLeft < maxScroll - 8;
                crWrap.dataset.fade = left && right ? 'lr' : right ? 'r' : left ? 'l' : 'none';
            };
            crRow.addEventListener('scroll', syncFade, { passive: true });
            addEventListener('resize', syncFade, { passive: true });
            requestAnimationFrame(syncFade);
        }

        const clearBtn = $('.md-cr-clear', shelf);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const slugs = getHistory().map(x => x.slug);
                setHistory([]);
                slugs.forEach(s => removeFromList('Currently Reading', s));
                shelf.remove();
                toast('Cleared reading history');
            });
        }
        $$('.md-cr-rm', shelf).forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const slug = btn.dataset.rm;
                setHistory(getHistory().filter(x => x.slug !== slug));
                removeFromList('Currently Reading', slug);
                buildContinueReading();
            });
        });
    }

    /* ====================================================================
     *  CATALOG QUICK-SAVE & OVERVIEW ADD-TO-LIST
     * ==================================================================== */
    function decorateLibraryButtons() {
        $$('div.page-item-detail .item-thumb').forEach(thumb => {
            if (thumb.querySelector('.md-lib-save')) return;
            const card = thumb.closest('div.page-item-detail');
            const a = card && (card.querySelector('.post-title a') || thumb.querySelector('a'));
            if (!a) return;
            const url = a.href;
            const slug = seriesSlugFromUrl(url);
            const title = (a.textContent || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
            const img = thumb.querySelector('img');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'md-lib-save' + (isInAnyList(slug) ? ' is-saved' : '');
            btn.title = 'Save to list';
            btn.setAttribute('aria-label', 'Save ' + title + ' to list');
            btn.innerHTML = isInAnyList(slug) ? ICON.bookmarkFill : ICON.plus;
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openListPicker({ slug, title: toTitleCase(title), url, cover: getImgSrc(img) }, () => {
                    const saved = isInAnyList(slug);
                    btn.classList.toggle('is-saved', saved);
                    btn.innerHTML = saved ? ICON.bookmarkFill : ICON.plus;
                });
            });
            thumb.appendChild(btn);
        });

        if (PAGE() === 'overview' && !document.getElementById('md-ov-lib-btn')) {
            const host = $('.summary_content_wrap .post-status') || $('.summary_content') || $('.post-title');
            if (host) {
                const slug = seriesSlugFromUrl(location.href);
                const title = ($('.post-title h1')?.textContent || document.title.split(' - ')[0] || '').trim();
                const cover = getImgSrc($('.summary_image img'));
                const btn = document.createElement('button');
                btn.id = 'md-ov-lib-btn';
                btn.type = 'button';
                btn.className = 'md-ov-lib-btn';
                const syncOv = () => {
                    const saved = isInAnyList(slug);
                    btn.classList.toggle('is-saved', saved);
                    btn.innerHTML = (saved ? ICON.bookmarkFill : ICON.bookmark) + `<span>${saved ? 'In Library' : 'Add to List'}</span>`;
                };
                syncOv();
                btn.addEventListener('click', () => {
                    openListPicker({ slug, title: toTitleCase(title), url: location.href, cover }, syncOv);
                });
                host.appendChild(btn);
            }
        }
    }

    function openListPicker(item, onChange) {
        let wrap = document.getElementById('md-list-picker');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'md-list-picker';
            wrap.className = 'md-modal-backdrop';
            wrap.addEventListener('click', e => { if (e.target === wrap) wrap.classList.remove('open'); });
            document.body.appendChild(wrap);
        }
        const render = () => {
            const lib = getLibrary();
            const rows = Object.keys(lib).map(name => {
                const has = lib[name].some(x => x.slug === item.slug);
                return `<label class="md-picker-row${has ? ' is-checked' : ''}">
                    <span class="md-picker-left">
                        <span class="md-picker-box" aria-hidden="true">${has ? ICON.check : ''}</span>
                        <span class="md-picker-name">${name.replace(/</g, '&lt;')}</span>
                    </span>
                    <span class="md-picker-cnt">${lib[name].length}</span>
                    <input type="checkbox" class="md-picker-cb" data-list="${name.replace(/"/g, '&quot;')}" ${has ? 'checked' : ''}>
                </label>`;
            }).join('');
            wrap.innerHTML = `<div class="md-modal md-picker-modal" role="dialog" aria-label="Save to list">
                <div class="md-modal-hd">
                    <div class="md-modal-title-wrap">
                        <h3>Save to List</h3>
                        <span class="md-modal-sub" title="${item.title.replace(/"/g, '&quot;')}">${item.title.replace(/</g, '&lt;')}</span>
                    </div>
                    <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
                </div>
                <div class="md-modal-bd">
                    <div class="md-picker-list">${rows}</div>
                    <div class="md-lib-new-row">
                        <input type="text" class="md-search-input" placeholder="New list name…">
                        <button type="button">Add</button>
                    </div>
                </div>
            </div>`;
            $('.md-modal-close', wrap).addEventListener('click', () => wrap.classList.remove('open'));
            $$('input.md-picker-cb', wrap).forEach(cb => {
                cb.addEventListener('change', () => {
                    const ln = cb.dataset.list;
                    if (cb.checked) upsertInList(ln, { ...item, addedAt: Date.now() });
                    else removeFromList(ln, item.slug);
                    if (onChange) onChange();
                    render();
                });
            });
            const inp = $('.md-lib-new-row input', wrap);
            const addBtn = $('.md-lib-new-row button', wrap);
            addBtn.addEventListener('click', () => {
                const name = inp.value.trim();
                if (!name) return;
                upsertInList(name, { ...item, addedAt: Date.now() });
                if (onChange) onChange();
                render();
            });
        };
        render();
        wrap.classList.add('open');
    }

    function openLibraryModal() {
        let wrap = document.getElementById('md-lib-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'md-lib-modal';
            wrap.className = 'md-modal-backdrop';
            wrap.addEventListener('click', e => { if (e.target === wrap) wrap.classList.remove('open'); });
            document.body.appendChild(wrap);
        }
        let activeTab = 'Currently Reading';
        const render = () => {
            const lib = getLibrary();
            const names = Object.keys(lib);
            if (!lib[activeTab]) activeTab = names[0] || 'Currently Reading';
            const covers = getCoverCache();
            const items = lib[activeTab] || [];
            const tabsHtml = names.map(n => `<button type="button" class="md-lib-tab${n === activeTab ? ' active' : ''}" data-tab="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')} (${lib[n].length})</button>`).join('');
            const gridHtml = items.length ? items.map(it => {
                const img = it.cover || covers[it.slug] || '';
                const href = it.chapterUrl || it.url || '#';
                return `<div class="md-lib-item">
                    <button type="button" class="md-cr-rm" data-rm="${it.slug.replace(/"/g, '&quot;')}" title="Remove from list">&times;</button>
                    <a href="${href.replace(/"/g, '&quot;')}" style="text-decoration:none;color:inherit">
                        <div class="md-lib-thumb">${img ? `<img src="${img.replace(/"/g, '&quot;')}" alt="" loading="lazy">` : ''}</div>
                        <div class="md-lib-info">${(it.title || it.slug).replace(/</g, '&lt;')}</div>
                    </a>
                </div>`;
            }).join('') : '<p style="opacity:.7;margin:12px 0;font-size:13px">No series in this list yet.</p>';

            wrap.innerHTML = `<div class="md-modal" role="dialog" aria-label="Library">
                <div class="md-modal-hd">
                    <h3>Library</h3>
                    <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
                </div>
                <div class="md-modal-bd">
                    <div class="md-lib-tabs">${tabsHtml}</div>
                    <div class="md-lib-grid">${gridHtml}</div>
                    <div class="md-lib-new-row">
                        <input type="text" class="md-search-input" placeholder="Create custom list…">
                        <button type="button">Create</button>
                    </div>
                </div>
            </div>`;
            $('.md-modal-close', wrap).addEventListener('click', () => wrap.classList.remove('open'));
            $$('.md-lib-tab', wrap).forEach(t => t.addEventListener('click', () => { activeTab = t.dataset.tab; render(); }));
            $$('.md-cr-rm', wrap).forEach(b => b.addEventListener('click', () => { removeFromList(activeTab, b.dataset.rm); render(); }));
            const inp = $('.md-lib-new-row input', wrap);
            $('.md-lib-new-row button', wrap).addEventListener('click', () => {
                const name = inp.value.trim();
                if (!name) return;
                const l = getLibrary();
                if (!l[name]) l[name] = [];
                setLibrary(l);
                activeTab = name;
                render();
            });
        };
        render();
        wrap.classList.add('open');
    }

    /* ====================================================================
     *  READER CHAPTER LIST QUICK-SWITCHER (#md-rchap-modal)
     * ==================================================================== */
    let cachedReaderChapters = null;

    async function getReaderChapterList() {
        const ctx = chapterContext();
        const sel = $('select.single-chapter-select');
        if (sel && sel.options.length > 1) {
            return [...sel.options].map(opt => {
                let href = opt.dataset.redirect || opt.value || '';
                if (href && !/^https?:\/\//i.test(href) && ctx.seriesUrl) {
                    try { href = new URL(href, ctx.seriesUrl).href; } catch (_) {}
                }
                return { href, label: opt.textContent.trim(), date: '', current: opt.selected };
            });
        }
        if (cachedReaderChapters) return cachedReaderChapters;
        const list = await fetchMadaraChapters(ctx.seriesUrl);
        cachedReaderChapters = list.map(ch => ({
            ...ch,
            current: location.href.replace(/\/+$/, '') === ch.href.replace(/\/+$/, '')
        }));
        return cachedReaderChapters;
    }

    async function toggleChapterModal() {
        let wrap = document.getElementById('md-rchap-modal');
        const dockBtn = reader.dock && $('[data-act="chapters"]', reader.dock);
        if (wrap && wrap.classList.contains('open')) {
            wrap.classList.remove('open');
            if (dockBtn) dockBtn.classList.remove('is-on');
            return;
        }
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'md-rchap-modal';
            wrap.className = 'md-modal-backdrop';
            wrap.addEventListener('click', e => {
                if (e.target === wrap) {
                    wrap.classList.remove('open');
                    if (dockBtn) dockBtn.classList.remove('is-on');
                }
            });
            document.body.appendChild(wrap);
        }
        wrap.innerHTML = `<div class="md-modal" role="dialog" aria-label="Chapters">
            <div class="md-modal-hd">
                <h3>Chapters</h3>
                <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
            </div>
            <div class="md-modal-bd">
                <input type="search" class="md-search-input" placeholder="Filter chapters…">
                <div class="md-rchap-list"><p style="opacity:.7;font-size:13px">Loading chapters…</p></div>
            </div>
        </div>`;
        wrap.classList.add('open');
        if (dockBtn) dockBtn.classList.add('is-on');
        $('.md-modal-close', wrap).addEventListener('click', () => {
            wrap.classList.remove('open');
            if (dockBtn) dockBtn.classList.remove('is-on');
        });

        const chapters = await getReaderChapterList();
        const listEl = $('.md-rchap-list', wrap);
        const inp = $('.md-search-input', wrap);
        const render = q => {
            const needle = (q || '').trim().toLowerCase();
            const filtered = needle ? chapters.filter(c => c.label.toLowerCase().includes(needle)) : chapters;
            listEl.innerHTML = filtered.length ? filtered.map(c =>
                `<a class="md-rchap-item${c.current ? ' is-cur' : ''}" href="${c.href.replace(/"/g, '&quot;')}">
                    <span>${c.label.replace(/</g, '&lt;')}</span>
                    ${c.date ? `<span class="md-rchap-date">${c.date.replace(/</g, '&lt;')}</span>` : ''}
                </a>`
            ).join('') : '<p style="opacity:.7;font-size:13px">No matching chapters.</p>';
        };
        render('');
        inp.addEventListener('input', () => render(inp.value));
        const curEl = $('.md-rchap-item.is-cur', listEl);
        if (curEl) curEl.scrollIntoView({ block: 'center' });
    }

    /* ====================================================================
     *  SETTINGS MODAL (#md-settings-modal)
     * ==================================================================== */
    function openSettingsModal() {
        let wrap = document.getElementById('md-settings-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'md-settings-modal';
            wrap.className = 'md-modal-backdrop';
            wrap.addEventListener('click', e => { if (e.target === wrap) wrap.classList.remove('open'); });
            document.body.appendChild(wrap);
        }
        const render = () => {
            const curTheme = root.dataset.mdTheme || 'dark';
            const speed = Number(store.get('autoScrollSpeed', 150)) || 150;
            const progSide = store.get('progSide', 'right');

            wrap.innerHTML = `<div class="md-modal" role="dialog" aria-label="Settings">
                <div class="md-modal-hd">
                    <h3>Settings</h3>
                    <button type="button" class="md-modal-close" aria-label="Close">${ICON.stop}</button>
                </div>
                <div class="md-modal-bd">
                    <div class="md-set-sec">
                        <span class="md-set-lbl">Theme</span>
                        <div class="md-seg" data-g="theme">
                            <button type="button" data-v="light" class="${curTheme === 'light' ? 'active' : ''}">Light</button>
                            <button type="button" data-v="dark" class="${curTheme === 'dark' ? 'active' : ''}">Dark</button>
                        </div>
                    </div>
                    <div class="md-set-sec">
                        <span class="md-set-lbl">Auto-Scroll Speed</span>
                        <div class="md-range-row">
                            <input type="range" id="md-set-speed" min="60" max="400" step="10" value="${speed}">
                            <span class="md-range-val" id="md-set-speed-val">${speed} px/s</span>
                        </div>
                    </div>
                    <div class="md-set-sec">
                        <span class="md-set-lbl">Progress Rail</span>
                        <div class="md-seg" data-g="prog">
                            <button type="button" data-v="left" class="${progSide === 'left' ? 'active' : ''}">Left</button>
                            <button type="button" data-v="right" class="${progSide === 'right' ? 'active' : ''}">Right</button>
                            <button type="button" data-v="off" class="${progSide === 'off' ? 'active' : ''}">Off</button>
                        </div>
                    </div>
                </div>
            </div>`;

            $('.md-modal-close', wrap).addEventListener('click', () => wrap.classList.remove('open'));
            $$('[data-g="theme"] button', wrap).forEach(b => b.addEventListener('click', () => {
                setTheme(b.dataset.v);
                render();
            }));
            const spInp = $('#md-set-speed', wrap);
            const spVal = $('#md-set-speed-val', wrap);
            const syncSpeed = () => {
                const v = Math.max(60, Math.min(400, Number(spInp.value) || 150));
                autoScrollSpeed = v;
                store.set('autoScrollSpeed', v);
                spVal.textContent = v + ' px/s';
            };
            spInp.addEventListener('input', syncSpeed);
            spInp.addEventListener('change', syncSpeed);
            $$('[data-g="prog"] button', wrap).forEach(b => b.addEventListener('click', () => {
                store.set('progSide', b.dataset.v);
                const rail = document.getElementById('md-progress');
                if (rail && rail.__update) rail.__update();
                render();
            }));
        };
        render();
        wrap.classList.add('open');
    }

    /* ====================================================================
     *  SERIES PAGE CHAPTER FILTER & SORT (#md-ch-filterbar)
     * ==================================================================== */
    function setupChapterFilterBar() {
        if (PAGE() !== 'overview') return;
        const ul = $('ul.main.version-chap');
        if (!ul || document.getElementById('md-ch-filterbar')) return;

        const bar = document.createElement('div');
        bar.id = 'md-ch-filterbar';
        let asc = false;
        bar.innerHTML = `<input type="search" placeholder="Search chapters…" aria-label="Search chapters">
            <button type="button" class="md-ch-sort-btn">${ICON.sortDesc}<span>Ch. Highest</span></button>
            <span class="md-ch-count"></span>`;
        ul.parentNode.insertBefore(bar, ul);

        const inp = $('input', bar);
        const sortBtn = $('.md-ch-sort-btn', bar);
        const countEl = $('.md-ch-count', bar);

        const parseNum = li => {
            const t = (li.querySelector('a')?.textContent || '');
            const m = t.match(/(\d+(?:\.\d+)?)/);
            return m ? parseFloat(m[1]) : -1;
        };

        const applyFilter = () => {
            const q = inp.value.trim().toLowerCase();
            const items = [...ul.querySelectorAll(':scope > li.wp-manga-chapter')];
            let vis = 0;
            items.forEach(li => {
                const ok = !q || (li.textContent || '').toLowerCase().includes(q);
                li.style.display = ok ? '' : 'none';
                if (ok) vis++;
            });
            countEl.textContent = `${vis} / ${items.length}`;
        };

        inp.addEventListener('input', applyFilter);
        sortBtn.addEventListener('click', () => {
            asc = !asc;
            const items = [...ul.querySelectorAll(':scope > li.wp-manga-chapter')];
            items.sort((a, b) => asc ? parseNum(a) - parseNum(b) : parseNum(b) - parseNum(a));
            items.forEach(li => ul.appendChild(li));
            sortBtn.innerHTML = (asc ? ICON.sortAsc : ICON.sortDesc) + `<span>${asc ? 'Ch. Lowest' : 'Ch. Highest'}</span>`;
        });
        applyFilter();
    }

    /* ====================================================================
     *  CHAPTER READER COMMENT SORTING (TOP / NEWEST / OLDEST)
     * ==================================================================== */
    let currentCommentSort = 'top';

    function parseCommentScore(el) {
        const v = el.querySelector('.wpd-vote-result');
        if (!v) return 0;
        const n = parseInt((v.textContent || '').replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
    }

    function parseCommentId(el) {
        if (!el) return 0;
        const idAttr = el.id || el.getAttribute('data-comment-id') || '';
        const m1 = idAttr.match(/(?:wpd-comm-|comment-)(\d+)/i);
        if (m1) return parseInt(m1[1], 10);
        const inner = el.querySelector('[id*="wpd-comm-"], [id*="comment-"], a[href*="#comment-"]');
        if (inner) {
            const s = (inner.id || inner.getAttribute('href') || '');
            const m2 = s.match(/(?:wpd-comm-|comment-)(\d+)/i);
            if (m2) return parseInt(m2[1], 10);
        }
        return 0;
    }

    function parseCommentAgeSec(el) {
        const d = el.querySelector('.wpd-comment-date');
        if (!d) return Number.MAX_SAFE_INTEGER;
        const title = (d.getAttribute('title') || '').trim();
        if (title) {
            const ts = Date.parse(title);
            if (!Number.isNaN(ts)) return Math.max(0, (Date.now() - ts) / 1000);
        }
        const txt = (d.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (/just\s*now|moment/.test(txt)) return 1;
        const m = txt.match(/(\d+)\s*(sec|second|min|minute|hour|hr|day|week|wk|month|mo|year|yr)/);
        if (m) {
            const val = parseInt(m[1], 10);
            const u = m[2];
            const mult = u.startsWith('sec') ? 1
                : u.startsWith('min') ? 60
                : (u.startsWith('hour') || u.startsWith('hr')) ? 3600
                : u.startsWith('day') ? 86400
                : (u.startsWith('week') || u.startsWith('wk')) ? 604800
                : (u.startsWith('month') || u.startsWith('mo')) ? 2592000
                : 31536000;
            return val * mult;
        }
        const ts2 = Date.parse(txt);
        if (!Number.isNaN(ts2)) return Math.max(0, (Date.now() - ts2) / 1000);
        return Number.MAX_SAFE_INTEGER;
    }

    function compareCommentTime(a, b, newestFirst) {
        const idA = parseCommentId(a);
        const idB = parseCommentId(b);
        if (idA && idB && idA !== idB) {
            return newestFirst ? (idB - idA) : (idA - idB);
        }
        const ageA = parseCommentAgeSec(a);
        const ageB = parseCommentAgeSec(b);
        return newestFirst ? (ageA - ageB) : (ageB - ageA);
    }

    function applyCommentSort(mode) {
        if (mode) currentCommentSort = mode;
        const list = $('#wpdcom .wpd-thread-list');
        if (!list) return;
        const items = [...list.children].filter(el => el.classList && el.classList.contains('wpd-comment'));
        if (items.length > 1) {
            items.sort((a, b) => {
                if (currentCommentSort === 'top') {
                    const diff = parseCommentScore(b) - parseCommentScore(a);
                    if (diff !== 0) return diff;
                    return compareCommentTime(a, b, true);
                }
                return compareCommentTime(a, b, currentCommentSort === 'newest');
            });
            items.forEach(el => list.appendChild(el));
        }
        const bar = document.getElementById('md-csort-bar');
        if (bar) {
            $$('button[data-sort]', bar).forEach(b => b.classList.toggle('active', b.dataset.sort === currentCommentSort));
        }
    }

    function setupCommentSortBar() {
        if (PAGE() !== 'chapter') return;
        // Remove redundant 'Comments for chapter "..."' headings above the comments card
        $$('h1,h2,h3,h4,h5,h6,.c-blog__heading,.comments-title').forEach(h => {
            if (/^\s*comments\s+for\s+chapter/i.test(h.textContent || '')) {
                h.style.setProperty('display', 'none', 'important');
            }
        });
        const w = $('#wpdcom');
        const list = w && w.querySelector('.wpd-thread-list');
        if (!w || !list) return;
        let bar = document.getElementById('md-csort-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'md-csort-bar';
            bar.innerHTML = `<button type="button" data-sort="top" class="active">Top</button>
                <button type="button" data-sort="newest">Newest</button>
                <button type="button" data-sort="oldest">Oldest</button>`;
            const head = w.querySelector('.wpd-thread-head');
            if (head) head.appendChild(bar);
            else list.parentNode.insertBefore(bar, list);
            bar.addEventListener('click', e => {
                const b = e.target.closest('button[data-sort]');
                if (!b) return;
                applyCommentSort(b.dataset.sort);
            });
            applyCommentSort('top');
        }
    }

    /* ====================================================================
     *  SITE-WIDE HEADER SUB-NAV TOGGLE & ADVANCED SEARCH RELOCATION
     * ==================================================================== */
    function setupHeaderControls() {
        if (PAGE() === 'chapter') return;
        const hdr = $('header.site-header');
        if (!hdr) return;

        // 1. Sub-nav bar toggle button (replaces duplicate HOME/TOP/COMPLETED links)
        const subNav = $('.c-sub-header-nav', hdr);
        if (subNav) {
            if (!root.dataset.mdSubnavInit) {
                root.dataset.mdSubnavInit = '1';
                if (store.get('subnavOpen', false)) root.dataset.mdSubnavOpen = '1';
                else delete root.dataset.mdSubnavOpen;
            }
            if (!document.getElementById('md-subnav-toggle')) {
                const logoWrap = $('.wrap_branding', hdr) || $('.c-header__top .main-navigation_wrap > a', hdr) || $('.main-navigation_wrap', hdr);
                if (logoWrap) {
                    const btn = document.createElement('button');
                    btn.id = 'md-subnav-toggle';
                    btn.type = 'button';
                    btn.className = 'md-subnav-btn';
                    const syncBtn = () => {
                        const open = root.dataset.mdSubnavOpen === '1';
                        btn.setAttribute('aria-expanded', String(open));
                        btn.classList.toggle('is-on', open);
                        btn.title = open ? 'Hide browse bar' : 'Show browse bar';
                        btn.innerHTML = ICON.list + '<span>Browse</span>';
                    };
                    syncBtn();
                    btn.addEventListener('click', () => {
                        const next = root.dataset.mdSubnavOpen !== '1';
                        if (next) root.dataset.mdSubnavOpen = '1';
                        else delete root.dataset.mdSubnavOpen;
                        store.set('subnavOpen', next);
                        syncBtn();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                    if (logoWrap.classList.contains('wrap_branding')) logoWrap.after(btn);
                    else logoWrap.prepend(btn);
                }
            }
        }

        // 2. Move/inject Advanced gear icon button right next to Search submit inside the collapsible search bar
        const moveAdv = () => {
            const advLinks = $$('header.site-header a, .search-navigation a').filter(a =>
                !a.closest('.search-main-menu, form.manga-search-form') &&
                (/^\s*advanced\s*$/i.test(a.textContent || '') || a.matches('.btn-search-adv, .adv-search-link, .adv-search'))
            );
            const advHref = (advLinks[0] && advLinks[0].href) || '/?s=&post_type=wp-manga';
            advLinks.forEach(a => {
                const parentLi = a.closest('li');
                a.remove();
                if (parentLi && parentLi.children.length === 0 && !parentLi.textContent.trim()) parentLi.remove();
            });
            const searchHost = $('.search-main-menu form.manga-search-form')
                || $('.search-main-menu form')
                || $('header.site-header form.manga-search-form');
            if (searchHost && !searchHost.querySelector('.md-adv-gear')) {
                const gear = document.createElement('a');
                gear.className = 'md-adv-gear';
                gear.href = advHref;
                gear.title = 'Advanced Search';
                gear.setAttribute('aria-label', 'Advanced Search');
                gear.innerHTML = ICON.gear;
                searchHost.appendChild(gear);
            }
        };
        moveAdv();
        const openSearchBtn = $('a.open-search-main-menu', hdr);
        if (openSearchBtn && !openSearchBtn.dataset.mdAdvHook) {
            openSearchBtn.dataset.mdAdvHook = '1';
            openSearchBtn.addEventListener('click', () => setTimeout(moveAdv, 60));
        }

        // 3. Mobile sub-nav 3-dots dropdown containing remaining options (like Genres dropdown)
        const subWrap = $('.c-sub-header-nav .sub-nav_content', hdr) || $('.c-sub-header-nav', hdr);
        const subList = $('.c-sub-header-nav .sub-nav_list', hdr) || $('.c-sub-header-nav ul', hdr);
        if (subWrap && subList && !document.getElementById('md-subnav-more')) {
            const items = [...subList.children].filter(el => el.tagName === 'LI' && !el.classList.contains('md-more-li'));
            const extraItems = items.slice(3);
            extraItems.forEach(li => li.classList.add('md-sub-overflow'));

            const moreWrap = document.createElement('div');
            moreWrap.id = 'md-subnav-more';
            moreWrap.className = 'md-more-wrap';

            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'md-more-btn';
            moreBtn.setAttribute('aria-expanded', 'false');
            moreBtn.setAttribute('aria-label', 'More categories');
            moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/></svg>';

            const menu = document.createElement('div');
            menu.id = 'md-subnav-more-menu';
            menu.className = 'md-more-menu';

            const links = extraItems.length
                ? extraItems.map(li => li.querySelector('a')).filter(Boolean)
                : $$('.c-sub-header-nav a', hdr).slice(3);
            links.forEach(a => {
                if (a.closest('ul.sub-menu')) return;
                const clone = document.createElement('a');
                clone.href = a.href;
                clone.textContent = a.textContent.trim();
                if (clone.textContent) menu.appendChild(clone);
            });

            if (menu.children.length > 0) {
                moreBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const open = menu.classList.toggle('open');
                    moreBtn.setAttribute('aria-expanded', String(open));
                });
                document.addEventListener('click', e => {
                    if (!moreWrap.contains(e.target) && menu.classList.contains('open')) {
                        menu.classList.remove('open');
                        moreBtn.setAttribute('aria-expanded', 'false');
                    }
                });
                moreWrap.append(moreBtn, menu);
                subWrap.appendChild(moreWrap);
            }
        }
    }

    /* ====================================================================
     *  CUSTOM NEOBRUTALIST VIDEO PLAYER CONTROLS (WITH DOWNLOAD)
     * ==================================================================== */
    const ICON_VOL = SVG('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9.5 9.5 0 0 1 0 14"/>');
    const ICON_MUTE = SVG('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>');

    function fmtVidTime(s) {
        if (!Number.isFinite(s) || s < 0) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function downloadVideoUrl(url) {
        if (!url) return;
        const fname = safeName((url.split('/').pop() || 'video.mp4').split('?')[0]) || 'video.mp4';
        toast('Downloading video…');
        const gmReq = (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest) || (typeof GM !== 'undefined' && GM.xmlHttpRequest);
        if (gmReq) {
            gmReq({
                method: 'GET',
                url,
                responseType: 'blob',
                onload: res => {
                    if (res.status >= 200 && res.status < 300 && res.response) {
                        saveBlob(res.response, fname);
                        toast('Saved ' + fname);
                    } else {
                        window.open(url, '_blank', 'noopener');
                    }
                },
                onerror: () => window.open(url, '_blank', 'noopener')
            });
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = fname;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    }

    function setupCommentVideos() {
        $$('#wpdcom video').forEach(vid => {
            if (vid.dataset.mdVidInit) return;
            vid.dataset.mdVidInit = '1';
            vid.removeAttribute('controls');
            vid.controls = false;
            vid.playsInline = true;

            const wrap = document.createElement('div');
            wrap.className = 'md-vid-wrap';
            vid.parentNode.insertBefore(wrap, vid);
            wrap.appendChild(vid);

            const bar = document.createElement('div');
            bar.className = 'md-vid-bar';
            bar.innerHTML = `<button type="button" class="md-vid-btn md-vid-play" aria-label="Play or pause">${ICON.scroll}</button>
                <input type="range" class="md-vid-seek" min="0" max="1000" value="0" aria-label="Seek">
                <span class="md-vid-time">0:00 / 0:00</span>
                <button type="button" class="md-vid-btn md-vid-mute" aria-label="Mute or unmute">${ICON_VOL}</button>
                <button type="button" class="md-vid-btn md-vid-dl" title="Download video" aria-label="Download video">${ICON.down}</button>
                <button type="button" class="md-vid-btn md-vid-fs" title="Fullscreen" aria-label="Fullscreen">${ICON.expand}</button>`;
            wrap.appendChild(bar);

            const playBtn = $('.md-vid-play', bar);
            const seek = $('.md-vid-seek', bar);
            const timeEl = $('.md-vid-time', bar);
            const muteBtn = $('.md-vid-mute', bar);
            const dlBtn = $('.md-vid-dl', bar);
            const fsBtn = $('.md-vid-fs', bar);

            const syncPlay = () => { playBtn.innerHTML = vid.paused ? ICON.scroll : ICON.pause; };
            const syncMute = () => { muteBtn.innerHTML = (vid.muted || vid.volume === 0) ? ICON_MUTE : ICON_VOL; };
            const syncTime = () => {
                const dur = Number.isFinite(vid.duration) ? vid.duration : 0;
                const cur = vid.currentTime || 0;
                if (dur > 0) seek.value = String(Math.round((cur / dur) * 1000));
                timeEl.textContent = fmtVidTime(cur) + ' / ' + fmtVidTime(dur);
            };

            const togglePlay = () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
            vid.addEventListener('click', togglePlay);
            playBtn.addEventListener('click', togglePlay);
            vid.addEventListener('play', syncPlay);
            vid.addEventListener('pause', syncPlay);
            vid.addEventListener('timeupdate', syncTime);
            vid.addEventListener('loadedmetadata', syncTime);
            vid.addEventListener('volumechange', syncMute);

            seek.addEventListener('input', () => {
                if (Number.isFinite(vid.duration) && vid.duration > 0) {
                    vid.currentTime = (Number(seek.value) / 1000) * vid.duration;
                }
            });
            muteBtn.addEventListener('click', () => { vid.muted = !vid.muted; syncMute(); });
            dlBtn.addEventListener('click', () => {
                const src = vid.currentSrc || vid.getAttribute('src') || (vid.querySelector('source')?.src) || '';
                downloadVideoUrl(src);
            });
            fsBtn.addEventListener('click', () => {
                if (document.fullscreenElement === wrap) (document.exitFullscreen || (() => {})).call(document);
                else (wrap.requestFullscreen || vid.webkitEnterFullscreen || (() => {})).call(wrap.requestFullscreen ? wrap : vid);
            });
            syncPlay();
            syncMute();
            syncTime();
        });
    }

    function tagVerboseSearchMeta() {
        $$('.c-tabs-item__content .post-content_item').forEach(row => {
            if (row.dataset.mdMetaTagged) return;
            row.dataset.mdMetaTagged = '1';
            const heading = (row.querySelector('.summary-heading')?.textContent || '').trim().toLowerCase();
            if (/alternative|author|artist/.test(heading)) row.classList.add('md-search-verbose');
        });
    }

    function setupSortDropdown() {
        const wrap = $('.tab-wrap');
        if (!wrap || wrap.querySelector('.md-sort-select')) return;
        const links = $$('ul.c-tabs-content li a, .c-nav-tabs li a', wrap);
        if (links.length < 2) return;
        const sel = document.createElement('select');
        sel.className = 'md-sort-select';
        sel.setAttribute('aria-label', 'Sort results');
        links.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.href;
            opt.textContent = a.textContent.replace(/\s+/g, ' ').trim();
            if (a.closest('li')?.classList.contains('active') || a.classList.contains('active')) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
            if (sel.value) location.href = sel.value;
        });
        wrap.appendChild(sel);
    }

    /* ====================================================================
     *  DOCUMENT-START BLUR LOADING CURTAIN (#md-loader)
     * ==================================================================== */
    function initLoadingCurtain() {
        if (document.readyState === 'complete') return;
        if (document.getElementById('md-loader')) return;
        const el = document.createElement('div');
        el.id = 'md-loader';
        el.setAttribute('aria-busy', 'true');
        el.innerHTML = '<div class="md-loader-pill"><span class="md-loader-spin" aria-hidden="true"></span><span>Loading…</span></div>';
        (document.documentElement || document.body).appendChild(el);
        const dismiss = () => {
            if (!el.isConnected || el.dataset.mdDone) return;
            el.dataset.mdDone = '1';
            el.classList.add('is-done');
            setTimeout(() => { if (el.isConnected) el.remove(); }, 280);
        };
        window.addEventListener('load', () => setTimeout(dismiss, 140), { once: true });
        setTimeout(dismiss, 2400);
    }

    /* ====================================================================
     *  RUN LOOP & LIFECYCLE
     * ==================================================================== */
    injectStyles();
    try { initLoadingCurtain(); } catch (_) {}

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
            try { harvestCovers(); } catch (_) {}
            const page = PAGE();
            if (page === 'list') {
                buildHero();
                try { buildContinueReading(); decorateLibraryButtons(); } catch (_) {}
            } else if (page === 'overview') {
                setupSelect(null, SEL_MANGAREAD);
                try { setupCoverBackdrop(); setupChapterFilterBar(); decorateLibraryButtons(); } catch (_) {}
            } else if (page === 'chapter') {
                setupReader();
                buildReaderBar();
                removeRelated();
                try { setupCommentSortBar(); } catch (_) {}
            }
            setupThemeToggle();
            try { setupHeaderControls(); setupSortDropdown(); setupCommentVideos(); tagVerboseSearchMeta(); } catch (_) {}
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
            return el && el.closest('#md-dock, #md-toast, #md-top, #md-sel-bar, #md-hero, #md-continue-reading, #md-progress, #md-ch-filterbar, .md-modal-backdrop');
        })) return;
        schedule();
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();