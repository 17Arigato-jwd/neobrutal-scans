// ==UserScript==
// @name         DemonicScans/Asurascans Neobrutalism + De-bloat
// @namespace    https://github.com/17Arigato-jwd/neobrutal-scans
// @version      2026-11-01.2
// @description  Neobrutalist skin for DemonicScans and Asura Scans (comic + novel sides): removes ads/popups/account UI/community links, comic<->novel switch, novel reader formatting, adds reader tools (zoom, background, .cbz download) and multi-chapter select + zip download.
// @author       17Arigato-jwd
// @homepageURL  https://github.com/17Arigato-jwd/neobrutal-scans
// @supportURL   https://github.com/17Arigato-jwd/neobrutal-scans/issues
// @updateURL    https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/neobrutal-scans.user.js
// @downloadURL  https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/neobrutal-scans.user.js
// @match        *://*.demonicscans.org/*
// @match        *://asurascans.com/*
// @match        *://*.asurascans.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=asurascans.com
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      demoniclibs.com
// @connect      librarydm.com
// @connect      readermc.org
// @connect      mangafirst.org
// @connect      asurascans.com
// @connect      cdn.asurascans.com
// @connect      *
// ==/UserScript==

(function boot() {
    'use strict';
    // never run inside frames, except our own background reader frame
    if (window.top !== window.self && window.name !== 'md-bg-frame') return;

    // At document-start <html> may not exist yet: wait for it, then run again.
    if (!document.documentElement) {
        const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); boot(); } });
        mo.observe(document, { childList: true });
        return;
    }

    /* ====================================================================
     *  CONFIG
     * ==================================================================== */
    const CONFIG = {
        maxWidth: 1280,        // content column width (px)
        collapseGaps: true,    // hide big empty blocks (dead ad slots etc.)
        arrows: true,          // ‹ › buttons on carousels
        backToTop: true,       // floating ↑ button (the reader has its own in the dock)
        fullTitles: true,      // "Some Long Titl..." -> full title (from the link's title attribute)
        compactViews: true,    // 10392424 -> 10.4M
        heroAutoplay: true, heroSpeed: 22, heroStepMs: 4500,
        hideAccountUi: true,   // series page: hide Bookmark + Rate (both need an account)
        hideSeoBlurb: true,    // series page: hide the "X is a Manga/Manhwa in english language..." boilerplate
        reader: {
            baseWidth: 800,    // px width of a page at 100% zoom
            zoomSteps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2],
            concurrency: 4,    // parallel image downloads for the .cbz
        },
        debug: false,          // log what the layout organiser detects
        topComments: true,         // DemonicScans comments: switch to "Top" automatically
        maxCommentWords: 3,        // hide comments with this many words or fewer
        keepImageComments: false,  // true = keep GIF/image-only comments
        readerDockOnTap: true,     // reader dock stays hidden until you tap the page (comic + novel readers, both sites)
        dockHideOnScroll: true,    // tuck it away again after scrolling down this far
        dockScrollPx: 150,
        readerHeaderAutoHide: true, // header slides away while reading down, returns on scroll up
        themeDefault: 'light'      // 'light' | 'dark' | 'system' : used until you press the switch (then your choice is remembered)
    };

    const FONT_URL =
        'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500..900' +
        '&family=JetBrains+Mono:wght@500;700;800&display=swap';

    /* ====================================================================
     *  POPUNDER KILLER (DemonicScans only)
     *  The site's inline ExoClick code hooks every click: it opens the page you clicked in a
     *  new tab and sends the current tab to the ad. Pin its global to an inert stub, in the PAGE's
     *  JS world (this script is sandboxed because it uses GM_ grants).
     * ==================================================================== */
    if (!/(^|\.)asurascans\.com$/i.test(location.hostname)) {
        try {
            const s = document.createElement('script');
            s.textContent = '(' + function () {
                const noop = function () {};
                const dummy = {
                    version: 12, config: {}, methods: {}, open_count: 0,
                    init: noop, preparePop: noop, addEvent: noop, loadHosted: noop, buildUrl: noop, setAsOpened: noop,
                    shouldShow: function () { return false; }, venorShouldShow: function () { return false; },
                };
                try { Object.defineProperty(window, 'popMagic', { configurable: false, get: function () { return dummy; }, set: noop }); } catch (e) {}
                try { Object.defineProperty(window, 'msgJsPop101', { configurable: false, get: function () { return undefined; }, set: noop }); } catch (e) {}
                // backstop: refuse click-type listeners whose code mentions the ad network
                const BAD = /popMagic|msgJsPop|pemsrv|magsrv|exoclick|exosrv|exdynsrv/i;
                const EV = /^(click|auxclick|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend)$/;
                const ael = EventTarget.prototype.addEventListener;
                EventTarget.prototype.addEventListener = function (type, fn, opts) {
                    try { if (EV.test(type) && typeof fn === 'function' && BAD.test(Function.prototype.toString.call(fn))) return; } catch (e) {}
                    return ael.call(this, type, fn, opts);
                };
            } + ')();';
            document.documentElement.appendChild(s);
            s.remove();
        } catch (e) { /* ignore */ }
    }

    const root = document.documentElement;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const store = {
        get(k, d) { try { const v = localStorage.getItem('md.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('md.' + k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } },
    };

    /* ====================================================================
     *  PAGE TYPE   (set immediately so the CSS can key off it before the DOM exists)
     * ==================================================================== */
    const IS_ASURA = /(^|\.)asurascans\.com$/i.test(location.hostname);
    if (IS_ASURA) root.dataset.mdSite = 'asura';

    // theme (dark / light): set before first paint so there is no flash
    root.dataset.mdTheme = (() => {
        const saved = store.get('theme', null);
        if (saved === 'dark' || saved === 'light') return saved;
        if (CONFIG.themeDefault === 'dark') return 'dark';
        if (CONFIG.themeDefault === 'system') { try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { /* fall through */ } }
        return 'light';
    })();

    function detectMode() {
        const p = location.pathname.toLowerCase();
        if (IS_ASURA) {
            if (/^\/(novels|browse\/novels|bookmarks\/novels)(\/|$)/.test(p)) return 'novels';
            if (/^\/(comics|browse|series-ranking)(\/|$)/.test(p)) return 'comics';
            return root.dataset.contentMode === 'novels' ? 'novels' : 'comics';     // shared pages (ranking, guilds...) follow the site's own mode
        }
        if (/^\/novel\//.test(p) || /nvupdates/.test(p) || (/chaptered\.php$/.test(p) && /[?&]novel=/.test(location.search))) return 'novels';
        return 'comics';
    }
    const isNovelChapter = () => IS_ASURA ? PAGE() === 'nchapter' : /chaptered\.php$/i.test(location.pathname) && /[?&]novel=/.test(location.search);

    function detectPage() {
        const p = location.pathname.toLowerCase();
        if (IS_ASURA) {
            if (/^\/novels\/[^/]+\/chapter\/[^/]+/.test(p)) return 'nchapter';
            if (/^\/novels\/[^/]+\/?$/.test(p)) return 'noverview';
            if (/^\/(novels|browse\/novels)\/?$/.test(p)) return 'nlist';
            if (/^\/comics\/[^/]+\/chapter\/[^/]+/.test(p)) return 'chapter';
            if (/^\/comics\/[^/]+\/?$/.test(p)) return 'overview';
            if (p === '/' || /^\/comics\/?$/.test(p)) return 'list';
            return 'other';
        }
        if (/chaptered\.php$/.test(p)) return 'chapter';
        if (/^\/manga\//.test(p)) return 'overview';
        if (/^\/novel\//.test(p) || /nvupdates/.test(p)) return 'other';
        return 'list';
    }
    const PAGE = () => root.dataset.mdPage || 'list';
    root.dataset.mdPage = detectPage();
    root.dataset.mdMode = detectMode();
    // asurascans.com/ shows whichever side was opened last: the site tags <html data-content-mode>, which can arrive after we start
    if (IS_ASURA) new MutationObserver(() => { const m = detectMode(); if (root.dataset.mdMode !== m) root.dataset.mdMode = m; }).observe(root, { attributes: true, attributeFilter: ['data-content-mode'] });

    function refinePage() {
        let p = PAGE();
        if (IS_ASURA || /^\/novel\//i.test(location.pathname)) return;
        if ($('#manga-info-container')) p = 'overview';
        else if ($('img.imgholder[alt]') || $('.chapter-info .chapters-nav')) p = 'chapter';
        if (p !== PAGE()) root.dataset.mdPage = p;
    }

    /* ====================================================================
     *  STYLES
     * ==================================================================== */
    const OV = 'html[data-md-page="overview"]';
    const CP = 'html[data-md-page="chapter"]';

    /* =====================================================================
       NOVEL MODE + MODE TOGGLE + NOVEL READER   (shared by both sites)
       ===================================================================== */
    const sharedCss = `
        /* ----- novel palette & layout: violet / teal, ruled paper, square cards, shadows fall down-LEFT ----- */
        html[data-md-mode="novels"] {
            --bg: #e8e2fa; --grid: rgba(76,29,149,.075); --yellow: #c4b5fd; --pink: #fda4af; --blue: #7dd3fc; --lime: #5eead4;
            --mint: #e0f2fe; --cream: #f5f0ff; --soft: #ddd6f3; --violet: #4c1d95;
            --r: 3px; --bw: 3px; --sh: -6px 6px 0 var(--bd); --sh-sm: -3px 3px 0 var(--bd); --sh-hover: -8px 8px 0 var(--bd);
        }
        html[data-md-mode="novels"]:not([data-md-nr]) body {
            background:
                repeating-linear-gradient(to bottom, transparent 0 31px, var(--grid) 31px 32px),
                linear-gradient(to right, transparent 0 63px, rgba(244,63,94,.28) 63px 65px, transparent 65px),
                var(--page-bg) !important;
        }
        html[data-md-mode="novels"] :is(h1, h2, h3, h4, .big-fat-titles, .section-title):not(#md-np *) { font-family: 'Lora', Georgia, 'Times New Roman', serif !important; }
        html[data-md-mode="novels"] :is(header.asura-site-header, body > nav) {
            background: var(--yellow) !important; border-bottom: 4px double var(--bd) !important; box-shadow: 0 6px 0 var(--lime) !important;
        }
        html[data-md-mode="novels"] :is(main, body) h2:not(#md-np *):not(#cw-comments *):not(#nx) {
            background: none !important; display: block; text-transform: none !important; letter-spacing: 0;
            border-left: 12px solid var(--bd); padding: 2px 0 2px 12px !important; font-style: italic; font-weight: 800 !important;
        }

        /* ----- locked-chapter countdown + prompt ----- */
        a[data-md-locked] { background: repeating-linear-gradient(135deg, var(--card) 0 10px, var(--soft) 10px 20px) !important; cursor: not-allowed !important; }
        a[data-md-locked] > :is(div.text-right, div[class*="flex-shrink-0"]:not(.md-cd)):last-of-type { display: none !important; }
        a[data-md-locked] .md-cd {
            display: inline-flex; align-items: center; gap: 6px; flex: none; margin-left: 10px; padding: 3px 9px;
            background: var(--yellow, var(--yellow)); color: var(--ink); border: 2px solid var(--bd); border-radius: 999px; box-shadow: 2px 2px 0 var(--bd);
            font: 800 12.5px/1.4 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        a[data-md-locked] .md-cd svg { width: 13px; height: 13px; }
        #md-lock { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 16px; background: rgba(17,17,17,.55); }
        .md-lock-card {
            width: min(380px, 100%); padding: 22px 22px 20px; text-align: center; background: var(--card); color: var(--ink);
            border: 3px solid var(--bd); border-radius: 14px; box-shadow: 7px 7px 0 var(--bd); font: 600 14px/1.4 'DM Sans', sans-serif;
        }
        .md-lock-ic { display: inline-grid; place-items: center; width: 54px; height: 54px; margin-bottom: 8px; background: var(--yellow); border: 3px solid var(--bd); border-radius: 12px; }
        .md-lock-ic svg { width: 28px; height: 28px; }
        .md-lock-card h3 { margin: 0 0 6px; font: 900 20px 'DM Sans', sans-serif; text-transform: uppercase; color: var(--ink) !important; }
        .md-lock-card p { margin: 4px 0; color: var(--muted) !important; }
        .md-lock-t { margin: 8px 0; font: 800 44px/1.1 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; color: var(--ink); }
        .md-lock-card :is(button, a.md-lock-go) {
            display: inline-flex; align-items: center; justify-content: center; min-height: 42px; margin-top: 12px; padding: 0 20px;
            background: var(--lime) !important; color: var(--ink) !important; border: 3px solid var(--bd) !important; border-radius: 10px !important; box-shadow: 3px 3px 0 var(--bd) !important;
            font: 900 14px 'DM Sans', sans-serif !important; text-transform: uppercase; cursor: pointer; text-decoration: none !important;
        }
        .md-lock-card .md-lock-go { margin-right: 8px; background: var(--yellow) !important; }
        /* ----- novel .epub bar ----- */
        #md-epub-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 12px; }
        #md-epub {
            --p: 0%; min-height: 44px; padding: 0 18px !important; background: var(--lime) !important; color: var(--ink) !important;
            border: 3px solid var(--bd) !important; border-radius: 3px !important; box-shadow: -4px 4px 0 var(--bd) !important;
            font: 900 14px 'DM Sans', sans-serif !important; text-transform: uppercase; letter-spacing: .04em; cursor: pointer;
        }
        #md-epub[data-state="busy"] { background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important; }
        #md-epub:disabled { opacity: .5; cursor: not-allowed; }
        .md-epub-note { font: 700 12px 'JetBrains Mono', monospace; color: var(--muted); }
        @media (max-width: 760px) { #md-epub { width: 100%; } }

        /* ----- the big comic <-> novel switch (FAB on phones) ----- */
        #md-mode {
            position: fixed; z-index: 115; left: 18px; bottom: 18px; display: flex; align-items: center; gap: 12px;
            padding: 12px 22px 12px 14px; color: var(--ink) !important; background: var(--yellow); border: 3px solid var(--bd); border-radius: 14px;
            box-shadow: 6px 6px 0 var(--bd); font-family: 'DM Sans', sans-serif; text-transform: uppercase; text-decoration: none !important;
            transition: transform .12s, box-shadow .12s; -webkit-tap-highlight-color: transparent;
        }
        #md-mode[data-to="novels"] { background: var(--novel-ac); }
        #md-mode:hover { transform: translate(3px, 3px); box-shadow: 3px 3px 0 var(--bd); }
        #md-mode:active { transform: translate(6px, 6px); box-shadow: 0 0 0 var(--bd); }
        #md-mode.hide { transform: translateY(calc(100% + 40px)); }
        #md-mode svg { width: 30px; height: 30px; stroke-width: 2.2; flex: none; }
        #md-mode .md-mode-t { display: block; line-height: 1; }
        #md-mode small { display: block; margin-bottom: 4px; font: 700 10.5px 'JetBrains Mono', monospace; letter-spacing: .16em; opacity: .75; }
        #md-mode b { display: block; font-weight: 900; font-size: 26px; letter-spacing: .02em; }
        html:is([data-md-page="chapter"], [data-md-page="nchapter"]) #md-mode { display: none !important; }

        /* ----- novel reader: formatting is driven by CSS variables set from the panel ----- */
        html[data-md-nr][data-md-nr], html[data-md-nr][data-md-nr] body {
            background: var(--nr-bg) !important; background-image: none !important; color: var(--nr-fg) !important;
        }
        html[data-md-nr] [data-md-nanc][data-md-nanc] { background: transparent !important; background-image: none !important; box-shadow: none !important; }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] {
            max-width: min(var(--nr-w), 100%) !important; width: 100% !important; margin-inline: auto !important;
            font-family: var(--nr-ff) !important; font-size: var(--nr-fs) !important; line-height: var(--nr-lh) !important;
            letter-spacing: var(--nr-ls) !important; text-align: var(--nr-ta) !important; color: var(--nr-fg) !important;
            -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default !important;
            background: transparent !important; border: 0 !important; box-shadow: none !important;
            hyphens: auto; -webkit-hyphens: auto; overflow-wrap: anywhere;
        }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] * {
            color: inherit !important; font-family: inherit !important; line-height: inherit !important; letter-spacing: inherit !important;
            -webkit-user-select: text !important; user-select: text !important; text-shadow: none !important;
        }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] :is(p, .md-npara) {
            font-size: inherit !important; margin: 0 0 var(--nr-ps) !important; text-indent: var(--nr-ti); text-align: inherit !important;
        }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] :is(h1, h2, h3) { font-size: 1.15em !important; font-weight: 800 !important; margin: 0 0 .5em !important; text-indent: 0; text-align: left !important; }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] [class*="bg-"], html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] button {
            background: transparent !important; border: 2px solid currentColor !important; border-radius: var(--r) !important; box-shadow: none !important;
        }
        html[data-md-nr] [data-md-ntext][data-md-ntext][data-md-ntext] :is(.h-px, [class*="h-px"]) { background: currentColor !important; opacity: .35; }
        html[data-md-nr][data-md-nsep="off"] [data-md-ntext] [role="separator"] { display: none !important; }
        html[data-md-nr] #comments-section, html[data-md-nr] #cw-comments { text-align: left; }

        /* reading panel */
        #md-np {
            position: fixed; z-index: 125; left: 50%; bottom: 76px; transform: translateX(-50%); display: none;
            width: min(470px, calc(100vw - 20px)); max-height: min(72vh, 600px); overflow: auto; overscroll-behavior: contain;
            padding: 14px 16px 16px; background: var(--card); color: var(--ink); border: 3px solid var(--bd); border-radius: 14px; box-shadow: 6px 6px 0 var(--bd);
            font: 700 13px/1.3 'DM Sans', sans-serif; text-align: left;
        }
        #md-np.open { display: block; }
        #md-np .np-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font: 900 15px 'DM Sans', sans-serif; text-transform: uppercase; letter-spacing: .05em; }
        #md-np .np-r { display: grid; grid-template-columns: 76px 1fr auto; align-items: center; gap: 10px; margin: 12px 0 0; }
        #md-np .np-r > span:first-child { font: 800 11px 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: .08em; }
        #md-np .np-r > :nth-child(2):not(input) { grid-column: 2 / 4; }
        #md-np output { min-width: 46px; text-align: right; font: 800 12px 'JetBrains Mono', monospace; }
        #md-np .np-ch, #md-np .np-sw { display: flex; flex-wrap: wrap; gap: 6px; }
        #md-np button {
            display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 4px 11px !important; margin: 0;
            background: var(--card) !important; color: var(--ink) !important; border: 2px solid var(--bd) !important; border-radius: 8px !important; box-shadow: 2px 2px 0 var(--bd) !important;
            font: 800 12.5px 'DM Sans', sans-serif !important; text-transform: none !important; letter-spacing: 0 !important; cursor: pointer;
        }
        #md-np button[aria-pressed="true"] { background: var(--lime) !important; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important; }
        #md-np button:active { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--bd) !important; }
        #md-np .np-sw button { width: 46px; height: 38px; padding: 0 !important; background: var(--sb) !important; color: var(--sf) !important; font: 800 15px 'Lora', serif !important; }
        #md-np .np-sw button[aria-pressed="true"] { outline: 3px solid var(--ink); outline-offset: 2px; background: var(--sb) !important; }
        #md-np input[type="range"] {
            -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 0; padding: 0 !important; background: transparent !important; border: 0 !important; box-shadow: none !important; accent-color: var(--ink);
        }
        #md-np input[type="range"]::-webkit-slider-runnable-track { height: 8px; background: var(--ink); border-radius: 4px; }
        #md-np input[type="range"]::-moz-range-track { height: 8px; background: var(--ink); border-radius: 4px; }
        #md-np input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -7px; background: var(--yellow); border: 3px solid var(--bd); border-radius: 6px; }
        #md-np input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; background: var(--yellow); border: 3px solid var(--bd); border-radius: 6px; }
        #md-dock [data-act="auto"][data-on="1"] { background: var(--lime) !important; }

        @media (max-width: 760px) {
            #md-mode {
                left: auto; right: 14px; bottom: calc(16px + env(safe-area-inset-bottom)); width: 66px; height: 66px; padding: 0;
                flex-direction: column; justify-content: center; gap: 2px; border-radius: 50%; box-shadow: 4px 4px 0 var(--bd);
            }
            #md-mode svg { width: 26px; height: 26px; }
            #md-mode small { display: none; }
            #md-mode b { font-size: 9.5px; letter-spacing: .06em; }
            #md-top, #scroll-top-btn { bottom: calc(96px + env(safe-area-inset-bottom)) !important; right: 20px !important; }
            #md-np { left: 0; right: 0; bottom: 0; width: 100%; transform: none; max-height: 62vh; border-radius: 16px 16px 0 0; border-inline-width: 0; border-bottom-width: 0; box-shadow: 0 -6px 0 var(--bd); padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
            #md-np .np-r { grid-template-columns: 62px 1fr auto; }
            #md-dock { flex-wrap: nowrap !important; gap: 3px !important; padding: 5px !important; left: 8px !important; right: 8px !important; transform: none !important; max-width: none !important; justify-content: space-between; bottom: calc(8px + env(safe-area-inset-bottom)) !important; }
            #md-dock.hide { transform: translateY(calc(100% + 28px)) !important; }
            #md-dock button { height: 38px !important; min-width: 0 !important; flex: 1 1 0; padding: 0 2px !important; }
            #md-dock .md-sep { display: none !important; }
            #md-dock .md-lbl { display: none !important; }
            #md-dock .md-dl { min-width: 0 !important; }
            #md-dock .md-zoom { font-size: 11px !important; flex: 1.4 1 0 !important; }
            #md-np { bottom: 0; }
            #md-toast { bottom: calc(72px + env(safe-area-inset-bottom)) !important; }
        }
    `;

    const css = `
        :root {
            --ink: #111; --bg: #f5f2ea; --card: #fff; --grid: rgba(0,0,0,.045);
            --yellow: #ffdc58; --pink: #ff6b6b; --blue: #88aaee; --lime: #a3e635; --mint: #e3f6ec; --cream: #fffbeb;
            --muted: #555; --rail: #111; --bd: var(--ink); --card-a: rgba(255,255,255,.97); --ink-bg: var(--ink); --on-ink: #fff; --novel-ac: #b8a4ff; --amber: #92400e; --green: #047857; --hair: rgba(17,17,17,.18); --page-bg: var(--bg);
            --bw: 2px; --r: 10px; --gap: 16px;
            --sh: 4px 4px 0 var(--bd);
            --sh-hover: 6px 6px 0 var(--bd);
            --sh-sm: 2px 2px 0 var(--bd);
            --maxw: ${CONFIG.maxWidth}px;
            --col: min(var(--maxw), calc(100% - 48px));
            --col-r: min(900px, calc(100% - 32px));
            --md-zoom: 1;
            --md-base: ${CONFIG.reader.baseWidth}px;
            color-scheme: light;
        }
        ${CP}[data-md-bg="dark"]  { --page-bg: #262626; --grid: rgba(255,255,255,.05); --rail: #000; }
        ${CP}[data-md-bg="black"] { --page-bg: #000;    --grid: rgba(255,255,255,.03); --rail: #2c2c2c; }

        /* ---------- Base ---------- */
        html {
            background: var(--page-bg) !important;
            scroll-behavior: smooth;
            overflow-x: clip !important;
            overflow-y: auto !important;
        }
        body {
            background:
                linear-gradient(to right, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                var(--page-bg) !important;
            color: var(--ink) !important;
            font-family: 'DM Sans', system-ui, sans-serif !important;
            font-size: 15px !important;
            line-height: 1.45 !important;
            overflow: visible !important;
            -webkit-font-smoothing: antialiased;
        }
        ::selection { background: var(--yellow); color: var(--ink); }
        a { text-decoration: none !important; }
        :focus-visible { outline: 3px solid var(--ink) !important; outline-offset: 2px !important; }

        /* ---------- Kill popups / banners / ad slots / junk ---------- */
        .modal, .modal-backdrop, .popup, .overlay,
        [id*="modal"], [class*="modal"], [id*="popup"], [class*="popup"],
        [href*="veyra" i], [src*="veyra" i],
        div:has(> a[href*="veyra" i]), div:has(> img[src*="veyra" i]),
        ins.adsbygoogle, iframe[src*="ads" i], iframe[src*="doubleclick" i],
        [id^="ad-" i], [id$="-ad" i], [class~="ad"], [class~="ads"], [class*="advert" i], [class*="banner-ad" i],
        [id^="bg-ssp"], #teaser3, #popcont,
        html[data-md-mode="comics"] .main-width:has(> h3.see-more a[href*="nvupdates" i]),
        a[href*="reddit" i], a[href*="toraka" i], a[href*="discord" i], a[href*="announce" i], a[href*="ebook" i],
        a[href*="subscri" i], a[href*="premium" i], a[href*="membership" i], .toraka-badge,
        iframe[src*="discord.com"], div:has(> iframe[src*="discord.com"]),
        [data-md="void"] {
            display: none !important;
        }

        /* ---------- Header ---------- */
        body > nav, body > header, #header, .navbar, #navbar {
            position: sticky !important; top: 0 !important; z-index: 100 !important;
            background: var(--yellow) !important;
            border-bottom: var(--bw) solid var(--bd) !important;
            box-shadow: 0 3px 0 var(--bd) !important;
            color: var(--ink) !important;
            overflow: visible !important;
            padding-block: 8px !important;
        }
        :is(body > nav, body > header, #header, .navbar, #navbar) * { color: var(--ink) !important; }
        body > nav .innav { align-items: center; gap: 12px; }
        body > nav a:has(> img) { display: flex; align-items: center; }
        body > nav img { border: 0 !important; box-shadow: none !important; border-radius: 6px; }

        /* No account UI in the titlebar */
        body > nav a[href*="signin" i],
        body > nav .cursor-pointer:has(> a[href*="signin" i]) { display: none !important; }

        /* The wordmark PNGs are white; turn them black on the light surfaces */
        nav img[src*="title"], #menu img[src*="title"], #footer-container img[src*="title"] {
            filter: brightness(0) !important;
        }

        /* Icons hard-coded white in the markup -> ink, on every light surface */
        :is(nav, #menu, #forced-Search) :is(svg, svg *):is([stroke="#ffffff" i], [stroke="white" i]) {
            stroke: var(--ink) !important;
        }
        :is(nav, #menu, #forced-Search) :is(svg, svg *):is([fill="#ffffff" i], [fill="white" i]) {
            fill: var(--ink) !important;
        }

        /* ---------- Inputs & buttons ---------- */
        input:not([type]), input[type="text"], input[type="search"], input[name*="search" i], .search-input, select {
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font: 600 14px 'DM Sans', sans-serif !important;
            padding: 7px 12px !important;
        }
        input::placeholder { color: var(--muted) !important; opacity: 1; }

        button, .btn, input[type="submit"], a.btn {
            background: var(--lime) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important;
            font-weight: 800 !important; cursor: pointer;
            transition: transform .1s, box-shadow .1s !important;
        }
        button:hover, .btn:hover, input[type="submit"]:hover {
            transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important;
        }
        button:disabled { opacity: .35; cursor: default; transform: none !important; box-shadow: none !important; }

        /* ---------- Search: titlebar bar + button as one joined control ---------- */
        :is(body > nav, #forced-Search) .right-nav-cont {
            display: flex !important; align-items: stretch !important; gap: 0 !important;
            height: 40px !important; top: 0 !important; margin: 0 !important; padding: 0 !important; position: relative;
            background: var(--card) !important; border: var(--bw) solid var(--bd) !important;
            border-radius: 8px !important; box-shadow: var(--sh-sm) !important;
        }
        :is(body > nav, #forced-Search) .right-nav-cont input {
            flex: 1 1 auto; min-width: 0 !important; width: clamp(200px, 30vw, 420px) !important;
            height: 100% !important; box-sizing: border-box; margin: 0 !important; padding: 0 12px !important;
            background: transparent !important; border: 0 !important; border-radius: 6px 0 0 6px !important; box-shadow: none !important;
        }
        :is(body > nav, #forced-Search) .right-nav-cont button {
            flex: 0 0 auto; width: 42px; height: 100% !important; min-width: 42px !important; min-height: 0 !important;
            padding: 0 !important; top: 0 !important; margin: 0 !important;
            border: 0 !important; border-left: var(--bw) solid var(--bd) !important;
            border-radius: 0 6px 6px 0 !important; box-shadow: none !important;
        }
        :is(body > nav, #forced-Search) .right-nav-cont button {
            display: flex !important; align-items: center !important; justify-content: center !important; line-height: 0 !important;
        }
        :is(body > nav, #forced-Search) .right-nav-cont button :is(svg, img, i) {
            position: static !important; inset: auto !important; transform: none !important; margin: 0 !important; float: none !important;
            width: 20px !important; height: 20px !important; display: block !important;
        }
        :is(body > nav, #forced-Search) .right-nav-cont button:hover { transform: none; background: var(--yellow) !important; }

        /* live results (titlebar dropdown + full-screen overlay share one row style) */
        body > nav #resultbox {
            position: absolute !important; top: calc(100% + 12px) !important; right: 0 !important; left: auto !important;
            width: max(100%, min(400px, calc(100vw - 24px))) !important;
            max-height: min(70vh, 560px); overflow-y: auto;
            height: auto !important; padding: 8px !important; margin: 0 !important; gap: 8px; z-index: 300;
            background: var(--bg) !important; border: var(--bw) solid var(--bd) !important;
            border-radius: var(--r) !important; box-shadow: var(--sh) !important;
        }
        #result-box-bg { gap: 8px; }
        :is(#resultbox, #result-box-bg) > * {
            display: flex !important; align-items: center; gap: 10px; flex: none;
            margin: 0 !important; padding: 8px 10px !important;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important; font-weight: 700; line-height: 1.25;
            transition: transform .1s, background .1s;
        }
        :is(#resultbox, #result-box-bg) > :hover { background: var(--yellow) !important; transform: translate(-1px, -1px); }
        :is(#resultbox, #result-box-bg) :is(a, div, p, span, small, li) { background: transparent !important; color: var(--ink) !important; margin: 0; }
        :is(#resultbox, #result-box-bg) :is(small, span:not(:first-child)) { font: 600 11.5px/1.2 'JetBrains Mono', monospace; color: var(--muted) !important; }
        :is(#resultbox, #result-box-bg) img {
            flex: 0 0 44px !important; width: 44px !important; height: 62px !important; object-fit: cover;
            border: var(--bw) solid var(--bd) !important; border-radius: 6px !important; margin: 0 !important;
        }
        #resultbox:empty { display: none !important; }

        /* full-screen overlay (mobile search / magnifier button) */
        #forced-Search {
            position: fixed !important; inset: 0; z-index: 400 !important; overflow-y: auto;
            background: var(--bg) !important; padding: 0 !important;
        }
        #forced-Search .main-bg { background: transparent !important; color: var(--ink) !important; }
        #forced-Search .search-pop {
            position: sticky; top: 0; z-index: 2;
            display: flex !important; align-items: center; justify-content: center; gap: 10px;
            padding: 12px 16px !important;
            background: var(--yellow) !important; border-bottom: var(--bw) solid var(--bd) !important; box-shadow: 0 3px 0 var(--bd);
        }
        #forced-Search .search-bar-cont { flex: 1 1 auto; max-width: 640px; margin: 0 !important; }
        #forced-Search .search-bar-cont input { width: 100%; }
        #forced-Search .search-pop > .md-btn {
            top: 0 !important; width: 40px; height: 40px; padding: 0; flex: none;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            background: var(--card) !important; border: var(--bw) solid var(--bd) !important; border-radius: 8px !important; box-shadow: var(--sh-sm) !important;
        }
        #forced-Search #result-box-bg {
            display: flex; flex-direction: column;
            width: min(720px, calc(100% - 32px)); margin: 20px auto 40px !important; padding: 0 !important;
        }
        #forced-Search #result-box-bg > p { background: transparent !important; border: 0 !important; box-shadow: none !important; font-weight: 600; color: var(--muted) !important; }

        /* ---------- Side menu ---------- */
        #menu {
            background: var(--bg) !important; color: var(--ink) !important;
            border-right: var(--bw) solid var(--bd) !important;
            box-shadow: 4px 0 0 var(--bd) !important;
            z-index: 300 !important; overflow-y: auto;
        }
        #menu > div:first-child { align-items: center; border-bottom: var(--bw) solid var(--bd); padding-bottom: 8px; margin-bottom: 6px; }
        #menu li { list-style: none; }
        #menu a {
            color: var(--ink) !important; font-weight: 700;
            margin: 6px 12px 0 !important;
            border: var(--bw) solid transparent; border-radius: 8px;
            transition: transform .1s, box-shadow .1s, background .1s;
        }
        #menu a:hover, #menu a.selected-menu {
            background: var(--yellow) !important; border-color: var(--bd); box-shadow: var(--sh-sm);
        }
        #menu a:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd); }
        /* trimmed: Game, Bookmarks, Comments, Sign in, Register, Discord, Remove Ads */
        #menu a:is([href*="game_dash"], [href*="bookmarks"], [href*="mycomments"], [href*="signin"],
                   [href*="signup"], [href*="discord"], [href*="premium"]) { display: none !important; }
        /* click anywhere outside to collapse */
        #md-scrim {
            position: fixed; inset: 0; z-index: 250; background: rgba(17,17,17,.4);
            opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        html[data-md-menu="open"] #md-scrim { opacity: 1; pointer-events: auto; cursor: pointer; }

        /* ---------- Page structure: normalise wrappers around sections ---------- */
        [data-mdw] {
            max-width: none !important; width: 100% !important;
            height: auto !important; min-height: 0 !important;
            margin-left: 0 !important; margin-right: 0 !important;
            padding-left: 0 !important; padding-right: 0 !important;
            float: none !important; overflow: visible !important;
            box-sizing: border-box !important;
        }

        /* ---------- Section header ---------- */
        [data-md="head"] {
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
            width: var(--col); margin: 40px auto 12px !important; box-sizing: border-box;
        }
        [data-md="headtext"] {
            margin: 0 auto 0 0 !important; padding: 0 6px !important;
            background: linear-gradient(transparent 62%, var(--yellow) 62%) !important;
            border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
            width: auto !important; display: inline-block !important;
            font: 900 clamp(20px, 2.1vw, 28px)/1.15 'DM Sans', sans-serif !important;
            letter-spacing: .02em !important; text-transform: uppercase !important; color: var(--ink) !important;
        }
        [data-md="headtext"] * {
            background: none !important; border: 0 !important; box-shadow: none !important;
            padding: 0 !important; margin: 0 !important; color: var(--ink) !important;
            font: inherit !important; text-transform: inherit !important; letter-spacing: inherit !important;
        }
        [data-md="more"] {
            background: var(--card) !important; border: var(--bw) solid var(--bd) !important; border-radius: 8px !important;
            box-shadow: var(--sh-sm) !important; padding: 6px 14px !important; margin: 0 !important;
            width: auto !important; position: static !important; float: none !important;
            font: 800 12.5px 'DM Sans', sans-serif !important; letter-spacing: .04em; text-transform: uppercase !important;
            white-space: nowrap; transition: transform .1s, box-shadow .1s;
        }
        [data-md="more"]::after { content: " →"; }
        [data-md="more"]:hover { background: var(--yellow) !important; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important; }
        [data-md="more"], [data-md="more"] * { color: var(--ink) !important; }
        [data-md="more"] * {
            background: none !important; border: 0 !important; box-shadow: none !important;
            padding: 0 !important; margin: 0 !important; font: inherit !important; text-transform: inherit !important;
        }
        /* plain "Latest Updates" block (a .main-width with its own heading, not a carousel) */
        body > :not(nav) .main-width > h1.section-title {
            width: var(--col); margin: 40px auto 12px !important; padding: 0 !important; box-sizing: border-box;
            background: none !important; border: 0 !important; box-shadow: none !important; text-align: left !important;
        }
        body > :not(nav) .main-width > h1.section-title a {
            display: inline-block; padding: 0 6px !important;
            background: linear-gradient(transparent 62%, var(--yellow) 62%) !important; color: var(--ink) !important;
            font: 900 clamp(20px, 2.1vw, 28px)/1.15 'DM Sans', sans-serif !important; text-transform: uppercase !important; text-decoration: none !important;
        }
        .main-width > h3.see-more { display: block !important; position: static !important; float: none !important; left: auto !important; box-sizing: border-box; width: var(--col) !important; max-width: none !important; margin: -8px auto 12px !important; padding: 0 !important; text-align: left !important; background: none !important; }
        .main-width > h3.see-more a {
            display: inline-block; background: var(--card) !important; color: var(--ink) !important; border: var(--bw) solid var(--bd) !important;
            border-radius: 8px; box-shadow: var(--sh-sm); padding: 6px 14px !important;
            font: 800 12.5px 'DM Sans', sans-serif !important; letter-spacing: .04em; text-transform: uppercase !important; text-decoration: none !important;
        }
        [data-md="arrows"] { display: flex; gap: 6px; }
        [data-md="arrows"] button {
            width: 36px; height: 36px; padding: 0 !important; font-size: 20px !important; line-height: 1 !important;
            background: var(--card) !important; text-transform: none !important;
        }
        [data-md="arrows"] button:hover:not(:disabled) { background: var(--yellow) !important; }

        /* ---------- Carousels (Owl is flattened into a native scroller) ---------- */
        .owl-carousel .owl-nav, .owl-carousel .owl-dots, [data-mdc="rail"].cloned { display: none !important; }

        [data-md="rail"] {
            display: flex !important; flex-flow: row nowrap !important; gap: var(--gap) !important;
            width: var(--col) !important; max-width: none !important; margin: 0 auto !important;
            padding: 6px 6px 20px !important; box-sizing: border-box !important;
            height: auto !important; min-height: 0 !important;
            overflow-x: auto !important; overflow-y: hidden !important;
            scroll-snap-type: x proximity; scroll-padding: 6px;
            scrollbar-width: thin; scrollbar-color: var(--ink) transparent;
            transform: none !important; animation: none !important; transition: none !important;
            position: relative !important; left: auto !important; right: auto !important;
        }
        [data-mdc="rail"] {
            flex: 0 0 clamp(150px, 14vw, 196px) !important; width: clamp(150px, 14vw, 196px) !important;
            aspect-ratio: 2 / 3; height: auto !important; margin: 0 !important; padding: 0 !important;
            position: relative !important; overflow: hidden !important; scroll-snap-align: start;
            background: #222 !important; border: var(--bw) solid var(--bd) !important; border-radius: var(--r) !important;
            box-shadow: var(--sh) !important; transform: none !important;
            transition: transform .15s, box-shadow .15s !important;
        }
        [data-mdc="rail"]:hover { transform: translate(-2px, -2px) !important; box-shadow: var(--sh-hover) !important; }
        [data-mdc="rail"] img {
            position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
            object-fit: cover !important; object-position: top center;
            border: 0 !important; border-radius: 0 !important; margin: 0 !important;
        }
        [data-mdc="rail"] .shadowimg { display: none !important; }

        /* Label bar: title (2 lines) + a row of badges, all in normal flow so nothing overlaps */
        [data-md="lblbox"] {
            position: absolute !important; left: 0 !important; right: 0 !important; bottom: 0 !important; top: auto !important;
            width: auto !important; height: auto !important; margin: 0 !important; padding: 8px 10px 9px !important; z-index: 2;
            display: flex !important; flex-flow: row wrap; align-items: center; gap: 6px;
            background: var(--card-a) !important;
            border: 0 !important; border-top: var(--bw) solid var(--bd) !important;
            border-radius: 0 !important; box-shadow: none !important; transform: none !important;
            font: 800 13px/1.25 'DM Sans', sans-serif !important; color: var(--ink) !important;
            text-transform: none !important; text-align: left !important; overflow: hidden !important;
        }
        [data-md="lblbox"] br { display: none; }
        [data-md="lbl"] {
            flex: 1 0 100%; min-width: 0;
            display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            overflow-wrap: anywhere;
            color: var(--ink) !important; font: inherit; text-transform: none !important;
        }
        [data-mdc="rail"] [data-md="sub"],
        [data-mdc="rail"] [data-mdd] {
            display: inline-flex !important; align-items: center; gap: 4px;
            width: auto !important; margin: 0 !important; padding: 1px 7px !important;
            background: var(--yellow) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 6px !important;
            box-shadow: var(--sh-sm) !important;
            font: 700 11px/1.5 'JetBrains Mono', monospace !important;
            text-transform: none !important; white-space: nowrap;
        }
        [data-mdc="rail"] [data-mdd] { background: var(--card) !important; }
        [data-mdc="rail"] [data-mdd][data-new] { background: var(--lime) !important; }

        /* ---------- Latest-updates grid ---------- */
        [data-md="grid"] {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)) !important;
            gap: var(--gap) !important; width: var(--col) !important; max-width: none !important;
            margin: 0 auto !important; padding: 6px !important; box-sizing: border-box !important;
            height: auto !important; float: none !important;
        }
        [data-md="gridrow"] { display: contents !important; }
        [data-mdc="grid"] {
            min-width: 0 !important; width: auto !important; max-width: none !important; height: auto !important;
            margin: 0 !important; padding: 12px !important; float: none !important; box-sizing: border-box !important;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: var(--r) !important;
            box-shadow: var(--sh) !important; transition: transform .15s, box-shadow .15s, background .15s !important;
        }
        [data-mdc="grid"]:hover { transform: translate(-2px, -2px); box-shadow: var(--sh-hover) !important; background: var(--cream) !important; }
        [data-mdc="grid"] div { background: transparent !important; }
        [data-mdc="grid"] [data-mdf] { display: flex !important; gap: 10px !important; align-items: flex-start !important; width: 100% !important; }
        [data-mdc="grid"] [data-mdf] > :last-child { flex: 1 1 0 !important; min-width: 0 !important; }
        [data-mdc="grid"] img {
            flex: 0 0 70px !important; width: 70px !important; height: 100px !important; max-width: none !important;
            object-fit: cover !important; margin: 0 !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 6px !important;
        }
        [data-md="title"] {
            display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden !important;
            overflow-wrap: anywhere;
            margin: 0 0 8px !important; padding: 0 !important; width: auto !important;
            background: none !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
            font: 800 14.5px/1.25 'DM Sans', sans-serif !important; color: var(--ink) !important; text-transform: none !important;
        }
        [data-md="titlebox"] {
            background: none !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
            padding: 0 !important; margin: 0 !important; width: auto !important; display: block !important;
        }
        /* one chapter row: [Chapter N] ........ [date]; wraps instead of overflowing the card */
        [data-md="row"] {
            display: flex !important; flex-wrap: wrap; align-items: center !important; justify-content: space-between !important;
            gap: 4px 8px !important; width: 100% !important; margin: 0 0 6px !important; padding: 0 !important;
            background: none !important; border: 0 !important; box-shadow: none !important;
        }
        [data-md="row"] > * { min-width: 0; }
        [data-mdc="grid"] a[href*="chapter" i]:not([data-mdd]) {
            display: inline-flex !important; align-items: center; margin: 0 !important; white-space: nowrap;
            background: var(--blue) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 6px !important; padding: 2px 8px !important;
            font: 700 12px/1.2 'JetBrains Mono', monospace !important; text-transform: none !important;
            box-shadow: var(--sh-sm) !important; transition: transform .1s, box-shadow .1s, background .1s;
        }
        [data-mdc="grid"] a[href*="chapter" i]:not([data-mdd]):hover {
            background: var(--yellow) !important; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important;
        }
        [data-mdc="grid"] a[href*="chapter" i]:not([data-mdd]):visited { background: var(--soft) !important; }

        /* date: quiet text, or a lime pill when it is today's */
        [data-mdc="grid"] a[data-mdd] {
            margin: 0 !important; padding: 0 !important;
            background: none !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
            font: 600 11px/1.2 'JetBrains Mono', monospace !important; color: var(--muted) !important;
            white-space: nowrap; text-align: right;
        }
        [data-mdc="grid"] a[data-mdd]:hover { text-decoration: underline !important; }
        [data-mdc="grid"] [data-mdd][data-new] {
            background: var(--lime) !important; color: var(--ink) !important; font-weight: 800 !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 999px !important; padding: 1px 8px !important;
        }

        /* ---------- Footer ---------- */
        body > footer, #footer, body > .footer, #footer-container {
            background: var(--yellow) !important; color: var(--ink) !important;
            border-top: var(--bw) solid var(--bd) !important; box-shadow: 0 -3px 0 var(--bd);
            margin-top: 56px !important; padding: 24px !important;
        }
        #footer-container div { color: var(--ink) !important; }
        #footer-container a { color: var(--ink) !important; font-weight: 800; }
        #footer-container a:hover { text-decoration: underline !important; text-underline-offset: 3px; }

        /* ---------- Back to top ---------- */
        #md-top {
            position: fixed; right: 20px; bottom: 20px; z-index: 90; width: 44px; height: 44px; padding: 0 !important;
            font-size: 20px !important; opacity: 0; pointer-events: none; transition: opacity .2s !important;
        }
        #md-top.show { opacity: 1; pointer-events: auto; }

        /* =================================================================
           SERIES (overview) PAGE
           ================================================================= */
        ${OV} #manga-info-container {
            display: grid !important; grid-template-columns: minmax(200px, 280px) minmax(0, 1fr); gap: 20px;
            align-items: start;
            width: var(--col) !important; max-width: none !important; margin: 28px auto 0 !important; padding: 0 !important;
        }
        ${OV} #manga-page {
            float: none !important; width: auto !important; margin: 0 !important;
            position: sticky; top: 84px; display: flex; flex-direction: column; gap: 10px;
        }
        ${OV} #manga-page > .center-align { padding: 0; }
        ${OV} #manga-page img {
            display: block; width: 100% !important; height: auto !important; aspect-ratio: 2 / 3; object-fit: cover;
            border: var(--bw) solid var(--bd) !important; border-radius: var(--r) !important; box-shadow: var(--sh);
            background: var(--soft);
        }
        ${OV} #read-first, ${OV} #bookmark {
            display: block; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; float: none !important; margin: 0 !important; padding: 11px 14px !important; list-style: none;
            border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 14px 'DM Sans', sans-serif; text-transform: uppercase; letter-spacing: .04em; text-align: center;
            color: var(--ink) !important; transition: transform .1s, box-shadow .1s;
        }
        ${OV} #read-first { background: var(--pink) !important; }
        ${OV} #bookmark { background: var(--lime) !important; }
        ${OV} #read-first:hover, ${OV} #bookmark:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd); }
        ${OV} :is(#read-first, #bookmark) li { list-style: none; color: var(--ink) !important; background: transparent !important; padding: 0 !important; margin: 0 !important; }
        ${OV} #bookmark svg { fill: none; stroke: var(--ink) !important; top: 4px !important; }
        ${OV} #R-V-B { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 8px; width: auto !important; margin: 0 !important; }
        ${OV} #R-V-B .RVB {
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
            width: auto !important; float: none !important; margin: 0 !important; padding: 8px 4px !important; min-width: 0;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 13px 'JetBrains Mono', monospace; list-style: none;
        }
        ${OV} #R-V-B .RVB svg { position: static !important; width: 20px; height: 20px; }
        ${OV} #R-V-B .RVB:has(svg[fill="#606EFE"]) { display: none; }  /* bookmark count: account feature */
        ${OV} #R-V-B { grid-template-columns: repeat(2, 1fr); }
        ${OV} #R-V-B .Rate { display: none !important; }
        ${OV} #manga-info-rightColumn {
            float: none !important; width: auto !important; margin: 0 !important; min-width: 0;
            display: flex; flex-direction: column; gap: 20px;
        }
        ${OV} :is(#manga-info-rightColumn > .light-bg, #chapters-container) {
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 12px !important;
            box-shadow: var(--sh) !important; padding: 20px 22px !important; margin: 0 !important;
        }
        ${OV} .big-fat-titles {
            margin: 0 0 10px !important; text-align: left !important; color: var(--ink) !important;
            font: 900 clamp(26px, 3.4vw, 40px)/1.1 'DM Sans', sans-serif !important; letter-spacing: -.01em;
        }
        ${OV} .big-fat-titles::after { content: ""; display: block; width: 64px; height: 8px; margin-top: 10px; background: var(--yellow); border: var(--bw) solid var(--bd); border-radius: 4px; }
        ${OV} .genres-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; text-align: left; }
        ${OV} .genres-list li {
            list-style: none; padding: 2px 12px; background: var(--blue); color: var(--ink) !important;
            border: var(--bw) solid var(--bd); border-radius: 999px; box-shadow: var(--sh-sm);
            font: 700 12px/1.6 'JetBrains Mono', monospace;
        }
        ${OV} .genres-list + br { display: none; }
        ${OV} .white-font { color: var(--ink) !important; font-size: 15.5px; line-height: 1.65; max-width: 80ch; margin-bottom: 18px; }
        ${OV} .md-seo { display: none; }
        ${OV} #manga-info-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
        ${OV} #manga-info-stats > div {
            flex-direction: column !important; gap: 2px; padding: 8px 12px; margin: 0;
            background: var(--cream); border: var(--bw) solid var(--bd); border-radius: 8px;
        }
        ${OV} #manga-info-stats li { list-style: none; width: auto !important; font-weight: 800; color: var(--ink) !important; }
        ${OV} #manga-info-stats li:first-child {
            font: 700 10.5px/1.2 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: .08em; color: var(--muted) !important;
        }
        ${OV} #chapters-container h2 {
            margin: 0 0 14px !important; display: inline-block; padding: 0 6px;
            background: linear-gradient(transparent 62%, var(--yellow) 62%);
            font: 900 clamp(20px, 2.1vw, 26px)/1.2 'DM Sans', sans-serif !important; color: var(--ink) !important; text-transform: uppercase;
        }
        ${OV} #chapters-list {
            height: auto !important; max-height: 620px; overflow-y: auto; padding: 4px 6px 6px 2px !important;
            background: transparent !important; align-content: start; grid-auto-rows: min-content;
            display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 8px 12px;
            scrollbar-width: thin; scrollbar-color: var(--ink) transparent;
        }

        /* ---------- long descriptions ---------- */
        ${OV} .white-font.md-clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 5; line-clamp: 5; overflow: hidden; margin-bottom: 6px; }
        ${OV} .md-more {
            display: inline-block; margin: 0 0 16px; padding: 4px 12px; cursor: pointer;
            background: var(--card) !important; color: var(--ink) !important; border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12px 'DM Sans', sans-serif; letter-spacing: .04em; text-transform: uppercase;
        }
        ${OV} .md-more:hover { background: var(--yellow) !important; }

        /* ---------- chapter select mode ---------- */
        ${OV} #md-sel-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 10px; }
        ${OV} #md-sel-bar button {
            padding: 6px 12px !important; cursor: pointer; background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 12px 'DM Sans', sans-serif; letter-spacing: .04em; text-transform: uppercase; transition: transform .1s, box-shadow .1s;
        }
        ${OV} #md-sel-bar button:hover { background: var(--yellow) !important; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd); }
        ${OV} #md-sel-bar button[aria-pressed="true"] { background: var(--ink-bg) !important; color: var(--on-ink) !important; }
        ${OV} #md-sel-bar .md-sel-dl { background: var(--lime) !important; }
        ${OV} #md-sel-bar .md-sel-dl[data-state="busy"] { --p: 0%; background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important; }
        ${OV} #md-sel-bar .md-sel-dl[data-state="prompt"] { background: var(--yellow) !important; }
        #md-bg { position: fixed; inset: 0; z-index: 2147483000; background: var(--bg); }
        #md-bg-stage { position: absolute; inset: 0; opacity: .9; filter: blur(3px); pointer-events: none; overflow: hidden; }
        #md-bg-stage iframe { width: 100%; height: 100%; border: 0; transform: scale(1.04); }
        #md-bg-card {
            position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(420px, calc(100% - 32px));
            background: var(--card); border: var(--bw) solid var(--bd); border-radius: 12px; box-shadow: var(--sh); padding: 16px;
            display: flex; flex-direction: column; gap: 10px; text-align: center; color: var(--ink); font: 700 14px 'DM Sans', sans-serif;
        }
        #md-bg-card b { font: 900 18px 'DM Sans', sans-serif; text-transform: uppercase; }
        #md-bg-card span { font: 600 12px 'JetBrains Mono', monospace; color: var(--muted); }
        ${OV} #md-sel-bar .md-sel-dl[disabled] { opacity: .5; cursor: not-allowed; }
        ${OV} #md-sel-bar [hidden] { display: none !important; }
        ${OV} #md-sel-bar .md-sel-count { font: 700 12px 'JetBrains Mono', monospace; color: var(--muted); }
        ${OV} #chapters-list[data-md-select] a.chplinks { position: relative; padding-left: 34px !important; cursor: pointer; user-select: none; }
        ${OV} #chapters-list[data-md-select] a.chplinks::before {
            content: ""; position: absolute; left: 10px; top: 50%; width: 14px; height: 14px; margin-top: -7px;
            background: var(--card); border: 2px solid var(--bd); border-radius: 3px; box-sizing: border-box;
        }
        ${OV} #chapters-list[data-md-select] a.chplinks.md-sel { background: var(--yellow) !important; }
        ${OV} #chapters-list[data-md-select] a.chplinks.md-sel::before {
            content: "\\2713"; background: var(--ink-bg); color: var(--on-ink); font: 900 11px/10px sans-serif; text-align: center;
        }
        ${OV} #chapters-list li { list-style: none; margin: 0; padding: 0; border: 0; }
        ${OV} #chapters-list a.chplinks {
            display: flex !important; justify-content: space-between; align-items: center; gap: 10px;
            padding: 7px 12px; background: var(--card); color: var(--ink) !important;
            border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 14px 'DM Sans', sans-serif; text-decoration: none !important;
            transition: transform .1s, box-shadow .1s, background .1s;
        }
        ${OV} #chapters-list a.chplinks span { float: none !important; font: 600 11px 'JetBrains Mono', monospace; color: var(--muted) !important; white-space: nowrap; }
        ${OV} #chapters-list a.chplinks:hover { background: var(--yellow); transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd); }
        ${OV} #chapters-list a.chplinks:visited { background: var(--soft); color: var(--ink) !important; }

        /* =================================================================
           CHAPTER (reader) PAGE
           ================================================================= */
        ${CP} :is(#gotopreader, #info-about-chapter, a[href*="premium.php"]:has(> img), button[onclick*="changeImageDomain"],
                   p:has(> button[onclick*="changeImageDomain"])) { display: none !important; }
        ${CP} .main-width { max-width: none !important; width: 100% !important; margin: 0 !important; }
        ${CP} .main-width > br { display: none; }
        ${CP} #md-top { display: none !important; }
        ${CP} img.imgholder[alt] {
            display: block !important; margin: 0 auto !important;
            width: min(100%, calc(var(--md-base) * var(--md-zoom))) !important; max-width: 100% !important; height: auto !important;
            min-height: 140px; background: var(--soft); color: var(--muted);
            border-inline: var(--bw) solid var(--rail);
        }
        ${CP} .chapter-info {
            width: min(calc(var(--md-base) * max(var(--md-zoom), .75) + 4px), calc(100% - 24px), 1000px);
            margin: 22px auto !important; padding: 14px 16px !important; text-align: center;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd); border-radius: 12px; box-shadow: var(--sh);
        }
        ${CP} .chapter-info h1 { margin: 0; font: 900 clamp(18px, 2.6vw, 24px)/1.2 'DM Sans', sans-serif; }
        ${CP} .chapter-info h1 a {
            color: var(--ink) !important; padding: 0 4px;
            background: linear-gradient(transparent 62%, var(--yellow) 62%);
        }
        ${CP} .chapter-info h1 a:hover { background: var(--yellow); }
        ${CP} .chapter-info h2 {
            display: inline-block; margin: 8px 0 12px; padding: 1px 12px;
            background: var(--blue); color: var(--ink) !important; border: var(--bw) solid var(--bd); border-radius: 999px;
            font: 800 13px/1.6 'JetBrains Mono', monospace; box-shadow: var(--sh-sm);
        }
        ${CP} .chapter-info:not(:has(h1)) { padding-block: 12px !important; }
        ${CP} .chapters-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; }
        ${CP} .chapters-nav select {
            flex: 1 1 150px; max-width: 280px; min-width: 0; height: 40px; margin: 0 !important; font-size: 14px !important;
        }
        ${CP} .chapters-nav a.nextchap { display: none !important; }
        ${CP} .md-nav {
            display: inline-flex !important; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 16px;
            background: var(--lime); color: var(--ink) !important; border: var(--bw) solid var(--bd); border-radius: 8px; box-shadow: var(--sh-sm);
            font: 800 13px 'DM Sans', sans-serif; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
            transition: transform .1s, box-shadow .1s, background .1s;
        }
        ${CP} .md-nav:hover { background: var(--yellow); transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd); }
        ${CP} .md-nav[aria-disabled="true"] { opacity: .35; pointer-events: none; box-shadow: none; }

        /* reader dock */
        #md-dock {
            position: fixed; left: 50%; bottom: 14px; z-index: 120; transform: translateX(-50%);
            display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px;
            max-width: calc(100vw - 20px); padding: 7px;
            background: var(--card); color: var(--ink); border: var(--bw) solid var(--bd); border-radius: 12px; box-shadow: var(--sh);
            transition: transform .25s ease, opacity .25s ease;
        }
        #md-dock.hide { transform: translate(-50%, calc(100% + 28px)); opacity: 0; pointer-events: none; }
        #md-dock button {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            height: 38px; min-width: 38px; padding: 0 9px !important; margin: 0;
            background: var(--card) !important; color: var(--ink) !important; border-radius: 8px !important;
            font: 800 12.5px 'DM Sans', sans-serif !important; text-transform: uppercase; letter-spacing: .03em;
        }
        #md-dock button:hover:not(:disabled) { background: var(--yellow) !important; }
        #md-dock button svg { flex: none; }
        #md-dock .md-sep { width: var(--bw); align-self: stretch; margin: 2px 2px; background: var(--ink); }
        #md-dock .md-zoom { min-width: 54px; font: 800 12px 'JetBrains Mono', monospace !important; letter-spacing: 0; }
        #md-dock .md-dl { --p: 0%; min-width: 86px; }
        #md-dock .md-dl[data-state="busy"] { background: linear-gradient(90deg, var(--lime) var(--p), var(--card) var(--p)) !important; }
        #md-dock .md-dl[data-state="done"] { background: var(--lime) !important; }
        #md-dock .md-dl[data-state="error"] { background: var(--pink) !important; }
        #md-dock [data-act="bg"] svg { transition: transform .25s; }
        html[data-md-bg="dark"] #md-dock [data-act="bg"] svg { transform: rotate(180deg); }
        html[data-md-bg="black"] #md-dock [data-act="bg"] svg { transform: rotate(360deg); }
        #md-toast {
            position: fixed; left: 50%; bottom: 84px; z-index: 130; transform: translateX(-50%);
            max-width: calc(100vw - 24px); padding: 8px 14px; background: var(--ink-bg); color: var(--on-ink);
            border-radius: 8px; font: 700 13px 'DM Sans', sans-serif; opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        #md-toast.show { opacity: 1; }

        /* =================================================================
           COMMENTS WIDGET  (series + chapter pages)
           ================================================================= */
        #discuscontainer {
            max-width: none !important; width: var(--col-r) !important; margin: 0 auto !important; padding: 0 !important;
            border: 0 !important; background: none !important;
        }
        center:has(> #discuscontainer) { display: block !important; margin: 40px 0 !important; text-align: left !important; }
        ${OV} #discuscontainer { width: var(--col) !important; }
        #cw-comments {
            /* the widget redefines --ink etc. on itself (cream text for its dark theme): pin ours back */
            --ink: #111 !important; --muted: #555 !important; --page: #fff !important; --panel: #fff !important;
            --raised: #fff !important; --line: #111 !important; color-scheme: light !important;
            position: relative; margin: 0 !important; padding: 0 !important; overflow: hidden; text-align: left;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 12px !important; box-shadow: var(--sh) !important;
            font: 500 15px/1.5 'DM Sans', sans-serif !important;
        }
        #cw-comments *, #cw-comments *::before, #cw-comments *::after { box-sizing: border-box; }
        #cw-comments [hidden] { display: none !important; }
        #cw-comments :where(div, section, p, span, small, strong, b, h2, h3, label, article, header, footer, form, summary, ul, li, a, time, details) {
            background: transparent !important; background-image: none !important;
            color: inherit !important; -webkit-text-fill-color: currentcolor !important;
            border: 0 !important; box-shadow: none !important; position: static;
            text-transform: none; letter-spacing: normal; opacity: 1;
        }
        #cw-comments :is(.cw-comment, .comment-main, .cw-comment-content, .cw-comment-body)::before,
        #cw-comments :is(.cw-comment, .comment-main, .cw-comment-content, .cw-comment-body)::after { display: none !important; content: none !important; }
        #cw-comments svg.icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #cw-comments svg.icon * { fill: none; stroke: currentColor; }
        #cw-comments a { text-decoration: underline !important; text-underline-offset: 3px; font-weight: 700; }

        /* account UI: composer, sign-in prompt, notifications, personal links, per-comment menu + reply */
        #cw-comments :is(.composer, #cw-composer, #cw-notifications, #cw-viewer-name, .cw-aux, details.cw-menu,
                         .cw-actions, .reactions-band, .reactions, #cw-gif-dialog, dialog#cw-gif-dialog) { display: none !important; }

        #cw-comments .widget-head {
            display: flex !important; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
            padding: 16px 20px !important; background: var(--yellow) !important; border-bottom: var(--bw) solid var(--bd) !important;
        }
        #cw-comments .eyebrow { margin: 0 0 2px; font: 700 10.5px/1.2 'JetBrains Mono', monospace; letter-spacing: .14em; text-transform: uppercase; }
        #cw-comments .title-line { display: flex; align-items: center; gap: 10px; }
        #cw-comments #cw-title { margin: 0; font: 900 clamp(22px, 3vw, 30px)/1.1 'DM Sans', sans-serif !important; text-transform: uppercase; letter-spacing: .01em; }
        #cw-comments .count {
            padding: 0 10px; background: var(--card) !important; border: var(--bw) solid var(--bd) !important; border-radius: 999px;
            font: 800 12px/1.8 'JetBrains Mono', monospace;
        }
        #cw-comments .head-actions { display: flex; gap: 8px; }

        #cw-comments button, #cw-comments summary {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            margin: 0; padding: 5px 12px; cursor: pointer;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 8px !important; box-shadow: var(--sh-sm) !important;
            font: 800 13px/1.3 'DM Sans', sans-serif !important; text-transform: none;
        }
        #cw-comments button:hover:not(:disabled) { background: var(--yellow) !important; }

        #cw-comments .reactions-band {
            display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px !important;
        }
        #cw-comments .reactions-copy strong { display: block; font-weight: 800; font-size: 16px; }
        #cw-comments .reactions-copy small { display: block; color: var(--muted) !important; font-size: 13px; }
        #cw-comments .reactions { display: flex; flex-wrap: wrap; gap: 8px; }
        #cw-comments .reaction { padding: 5px 12px !important; border-radius: 999px !important; }
        #cw-comments .reaction .emoji { font-size: 18px; line-height: 1; }
        #cw-comments .reaction .number { font: 800 12px 'JetBrains Mono', monospace; }
        #cw-comments :is(.reaction, .like-btn)[aria-pressed="true"] { background: var(--lime) !important; }

        #cw-comments .discussion-toolbar {
            display: flex !important; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
            padding: 12px 20px !important; background: var(--cream) !important;
            border-block: var(--bw) solid var(--bd) !important;
        }
        #cw-comments .sort-tabs { display: inline-flex; overflow: hidden; border: var(--bw) solid var(--bd) !important; border-radius: 8px; box-shadow: var(--sh-sm) !important; }
        #cw-comments .sort-tabs button {
            border: 0 !important; border-radius: 0 !important; box-shadow: none !important; height: 34px; padding: 0 16px;
            font: 900 12.5px 'DM Sans', sans-serif !important; text-transform: uppercase; letter-spacing: .05em;
        }
        #cw-comments .sort-tabs button + button { border-left: var(--bw) solid var(--bd) !important; }
        #cw-comments .sort-tabs button[aria-pressed="true"] { background: var(--yellow) !important; }
        #cw-comments .tools-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        #cw-comments label.search { position: relative; display: flex; align-items: center; }
        #cw-comments label.search svg { position: absolute; left: 10px; pointer-events: none; }
        #cw-comments label.search input { width: clamp(150px, 22vw, 230px); height: 36px; padding: 0 12px 0 32px !important; box-shadow: var(--sh-sm) !important; }
        #cw-comments .manual-refresh { width: 36px; height: 36px; padding: 0 !important; }
        #cw-comments #cw-status { margin: 0; padding: 8px 20px 0; min-height: 0; color: var(--muted) !important; font: 600 12px 'JetBrains Mono', monospace; }
        #cw-comments #cw-status:empty { display: none; }

        #cw-comments #cw-list {
            display: flex !important; flex-direction: column !important; gap: 14px;
            width: auto !important; height: auto !important; overflow: visible !important;
            margin: 0 !important; padding: 16px 20px 20px !important; list-style: none;
        }
        #cw-comments .cw-comment {
            display: block !important; width: auto !important; flex: none; padding: 12px 14px !important;
            background: var(--card) !important; border: var(--bw) solid var(--bd) !important; border-radius: 10px !important; box-shadow: var(--sh-sm) !important;
        }
        #cw-comments .comment-main { display: flex !important; align-items: flex-start; gap: 12px; }
        #cw-comments .cw-comment-content { flex: 1 1 auto; min-width: 0; }
        #cw-comments .cw-avatar {
            flex: 0 0 40px; width: 40px; height: 40px; display: grid; place-items: center; object-fit: cover; overflow: hidden;
            background: var(--yellow) !important; border: var(--bw) solid var(--bd) !important; border-radius: 8px; font-weight: 900;
        }
        #cw-comments .cw-comment-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; }
        #cw-comments .author-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
        #cw-comments .cw-name { font-weight: 800; overflow-wrap: anywhere; }
        #cw-comments .badge {
            color: var(--ink) !important; padding: 0 9px; background: var(--yellow) !important; border: var(--bw) solid var(--bd) !important; border-radius: 999px;
            font: 800 10.5px/1.8 'JetBrains Mono', monospace; text-transform: uppercase; white-space: nowrap;
        }
        /* rank gradients: one per demon tier (text stays --ink, borders stay black) */
        #cw-comments .badge.rank-0 { background: linear-gradient(135deg, #fff, #d9d9d9) !important; }
        #cw-comments .badge.rank-1 { background: linear-gradient(135deg, #f4f1e8, #c9c2a8) !important; }
        #cw-comments .badge.rank-2 { background: linear-gradient(135deg, #b8ffe0, #3ddc97) !important; }
        #cw-comments .badge.rank-3 { background: linear-gradient(135deg, #bfe3ff, #3a8dff) !important; }
        #cw-comments .badge.rank-4 { background: linear-gradient(135deg, #e3c9ff, #8a4dff) !important; }
        #cw-comments .badge.rank-5 { background: linear-gradient(135deg, #ffe08a, #ff9f1c) !important; }
        #cw-comments .badge.rank-6 { background: linear-gradient(135deg, #ffb199, #ff4d4d) !important; }
        #cw-comments .badge.rank-7 { background: linear-gradient(135deg, #ff8ad8, #c2185b) !important; }
        #cw-comments .badge.rank-8 { background: linear-gradient(135deg, #ff4d4d 0%, #7a0019 55%, #111 100%) !important; color: #fff !important; }
        #cw-comments .comment-meta { display: flex; align-items: center; gap: 8px; }
        #cw-comments .cw-time { color: var(--muted) !important; font: 600 11px 'JetBrains Mono', monospace; white-space: nowrap; }
        #cw-comments .comment-collapse { width: 26px; height: 26px; padding: 0 !important; border-radius: 6px !important; box-shadow: none !important; }
        #cw-comments .cw-comment-body { margin-top: 6px; }
        #cw-comments .cw-text { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
        #cw-comments .cw-text img { max-width: min(100%, 320px); height: auto; margin-top: 6px; border: var(--bw) solid var(--bd); border-radius: 8px; display: block; }
        #cw-comments .cw-actions { display: flex; gap: 8px; margin-top: 8px; }
        #cw-comments .like-btn { height: 28px; padding: 0 10px !important; border-radius: 999px !important; font: 800 12px 'JetBrains Mono', monospace !important; }
        #cw-comments .cw-replies {
            display: flex; flex-direction: column; gap: 10px; margin: 12px 0 0 6px; padding-left: 14px;
            border-left: 3px solid var(--bd);
        }
        #cw-comments .cw-replies .cw-comment { background: var(--cream) !important; box-shadow: none !important; }
        #cw-comments #cw-more { display: flex; width: calc(100% - 40px); margin: 0 20px 20px; height: 42px; background: var(--lime) !important; text-transform: uppercase; letter-spacing: .05em; }
        #cw-comments .widget-footer {
            margin: 0 !important; padding: 12px 20px !important; background: var(--cream) !important; border-top: var(--bw) solid var(--bd) !important;
        }
        #cw-comments .widget-footer p { margin: 0; color: var(--muted) !important; font: 600 11.5px 'JetBrains Mono', monospace; }
        #cw-comments dialog.cw-dialog {
            width: min(520px, calc(100vw - 32px)); padding: 0; background: var(--card); color: var(--ink);
            border: var(--bw) solid var(--bd); border-radius: 12px; box-shadow: 6px 6px 0 var(--bd); font: 500 14.5px/1.5 'DM Sans', sans-serif;
        }
        #cw-comments dialog.cw-dialog::backdrop { background: rgba(17,17,17,.5); }
        #cw-comments dialog.cw-dialog .dialog-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--yellow); border-bottom: var(--bw) solid var(--bd); }
        #cw-comments dialog.cw-dialog h3 { margin: 0; font-weight: 900; text-transform: uppercase; }
        #cw-comments dialog.cw-dialog #cw-dialog-body { padding: 14px 16px; }

        /* ---------- Small screens ---------- */
        @media (max-width: 760px) {
            ${OV} #manga-info-container { grid-template-columns: 1fr; }
            ${OV} #manga-page { position: static; flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
            ${OV} #manga-page > .center-align { flex: 0 0 38%; max-width: 180px; }
            ${OV} #manga-page > :not(.center-align) { flex: 1 1 52%; }
            ${OV} #R-V-B { flex: 1 1 100% !important; }
            ${OV} :is(#manga-info-rightColumn > .light-bg, #chapters-container) { padding: 16px !important; }
            #cw-comments :is(.widget-head, .reactions-band, .discussion-toolbar) { padding-inline: 14px !important; }
            #cw-comments #cw-list { padding-inline: 12px !important; }
            #cw-comments .tools-right, #cw-comments label.search, #cw-comments label.search input { width: 100%; }
        }
        @media (max-width: 640px) {
            :root { --col: calc(100% - 24px); --gap: 12px; }
            [data-md="grid"] { grid-template-columns: 1fr !important; }
            [data-mdc="rail"] { flex-basis: 130px !important; width: 130px !important; }
            body > nav #demon-title-lg { display: none; }
            body > nav .innav { padding-inline: 10px !important; gap: 8px; }
            :is(body > nav) .right-nav-cont input { width: 100%; }
            body > nav .innav > .flex:last-child { flex: 1 1 auto; min-width: 0; justify-content: flex-end; }
            [data-md="arrows"] { display: none; }
            #md-dock { gap: 4px; padding: 6px; bottom: 10px; }
            #md-dock button { padding: 0 7px !important; }
            #md-dock .md-lbl { display: none; }
            #md-dock .md-dl { min-width: 38px; }
            #md-dock .md-sep { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            html { scroll-behavior: auto; }
            * { transition: none !important; }
        }
    ` + sharedCss;

    /* ====================================================================
     *  ASURA SCANS skin  (Tailwind site: dark utilities are remapped to the neobrutalist palette)
     * ==================================================================== */
    const cssAsura = (() => {
        const cut = (a, b) => { const i = css.indexOf(a), j = css.indexOf(b, i + 1); return i < 0 || j < 0 ? '' : css.slice(i, j); };
        const A = 'html[data-md-site="asura"]';
        const AO = A + '[data-md-page="overview"]', AC = A + '[data-md-page="chapter"]';
        const shared =
            cut(':root {', '/* ---------- Base ---------- */') +
            cut('/* ---------- Back to top ---------- */', '/* =================================================================\n           SERIES') +
            cut('/* ---------- chapter select mode ---------- */', OV + ' #chapters-list li {') +
            cut('/* reader dock */', '/* =================================================================\n           COMMENTS WIDGET');
        return shared + `
        ${A} { --md-base: 720px; --violet: #6d28d9; --soft: #efe9d8; }
        ${AC}:not([data-md-bg]) { --page-bg: #000; }
        ${A} html, html${A.slice(4)} { background: var(--page-bg) !important; scroll-behavior: smooth; }
        ${A} body.min-h-screen, ${A} body {
            background:
                linear-gradient(to right, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                linear-gradient(to bottom, var(--grid) 1px, transparent 1px) 0 0 / 32px 32px,
                var(--page-bg) !important;
            color: var(--ink) !important; font-family: 'DM Sans', system-ui, sans-serif !important;
        }
        ${A} ::selection { background: var(--yellow); color: var(--ink); }
        ${A} a { text-decoration: none !important; }
        ${A} :focus-visible { outline: 3px solid var(--ink) !important; outline-offset: 2px !important; }
        ${A} #md-top { display: none !important; }

        /* --- account / novels / premium / promo clutter --- */
        ${A} :is(
            astro-island[component-url*="UserMenu"], astro-island[component-url*="NotificationBell"], astro-island[component-url*="UpgradeButton"],
            astro-island[component-url*="MobileModeToggle"], astro-island[component-url*="Banner"], astro-island[component-url*="OnboardingModal"],
            astro-island[component-url*="GuildInviteModal"], astro-island[component-url*="RatingButton"], astro-island[component-url*="BookmarkButton"],
            astro-island[component-url*="ReportSeriesDataButton"], astro-island[component-url*="SiteReportButton"],
            a[href^="/register"], a[href^="/login"], a[href*="/bookmarks"], [data-content-bookmarks-link],
            [data-content-mode-link], astro-island[component-url*="Announcement"], astro-island[component-url*="Promo"],
            astro-island[component-url*="Subscri"], astro-island[component-url*="Mythic"],
            a[href*="discord"], a[href*="reddit"], a[href*="toraka"], .toraka-badge, div:has(> .toraka-badge),
            footer div:has(> a[href*="reddit"]), a[href*="announcement" i], a[href*="ebook" i], a[href*="/premium"], a[href*="/subscri"],
            a[href*="/pricing"], a[href*="/upgrade"], a[href*="/membership"], #footer-report-issue,
            div:has(> #comment-composer),
            #comments-section :is(button[title="More"], button[class*="hover:text-[#913FE2]"],
                [id^="comment-"] div[class*="gap-4"][class*="mt-2"][class*="text-xs"])
        ) { display: none !important; }

        /* --- surfaces: dark -> paper / cards --- */
        ${A} :is([class~="bg-black"], [class*="bg-[#13111A]" i]):not(body):not(html) { background: var(--bg) !important; }
        ${A} :is([class*="bg-[#1D1B22]" i], [class*="bg-[#1C1924]" i], [class*="bg-zinc-9"], [class*="bg-zinc-8"], [class*="bg-[#1e1830]" i]):not(.asura-site-header):not([class*="/20"]) {
            background: var(--card) !important; background-image: none !important;
            border: var(--bw) solid var(--bd) !important; border-radius: var(--r) !important; box-shadow: var(--sh-sm) !important;
        }
        ${A} :is(section, article):is([class*="bg-[#1D1B22]" i], [class*="bg-[#1C1924]" i]) { box-shadow: var(--sh) !important; }
        ${A} :is([class*="bg-white/5"], [class*="bg-white/10"], [class*="bg-white/[0"], [class*="bg-zinc-700"], [class*="bg-[#222222]" i]):not(.asura-site-header *) { background: var(--soft) !important; }
        ${A} [class*="bg-[#913FE2]"]:not([class*="bg-[#913FE2]/"]):not(.asura-site-header) {
            background: var(--lime) !important; border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh-sm) !important;
        }
        ${A} [class*="bg-[#913FE2]/"] { background: var(--yellow) !important; }
        ${A} [class*="bg-[linear-gradient"] { background: var(--ink) !important; height: 2px !important; opacity: .15; }
        ${A} [class*="border-white"], ${A} [class*="border-zinc"], ${A} [class*="border-[#312f40]" i] { border-color: var(--bd) !important; }
        ${A} [class*="divide-"] > :not(:first-child) { border-color: var(--hair) !important; }
        ${A} :is(input, textarea, select) {
            background: var(--card) !important; color: var(--ink) !important; border: var(--bw) solid var(--bd) !important; border-radius: 8px !important;
        }
        ${A} ::placeholder { color: var(--muted) !important; opacity: 1; }
        ${A} label input:not([type="checkbox"]):not([type="radio"]) { border: 0 !important; box-shadow: none !important; background: transparent !important; }

        /* --- text --- */
        ${A} :is([class*="text-white"], [class*="text-zinc-"], [class*="text-gray-"], [class*="text-neutral-"], [class*="text-slate-"], [class*="text-[#999]"], [class*="text-[#fff" i]):not(:is([class*="bg-black/"], [class*="from-black"], [class~="bg-[#111]"]) *):not([class*="bg-black/"]) { color: var(--ink) !important; }
        ${A} :is([class*="text-white/"], [class*="text-zinc-4"], [class*="text-zinc-5"], [class*="text-[#999]"]):not(:is([class*="bg-black/"], [class*="from-black"]) *) { color: var(--muted) !important; }
        ${A} :is([class~="text-[#913FE2]"], [class~="text-[#A78BFA]"], [class*="text-violet-"], [class*="text-purple-"]):not(:is([class*="bg-black/"], [class*="from-black"]) *) { color: var(--violet) !important; }
        ${A} [class*="text-emerald-"], ${A} [class*="text-green-"] { color: var(--green) !important; }
        ${A} [class*="bg-clip-text"] { -webkit-text-fill-color: currentcolor !important; background: none !important; color: var(--ink) !important; }
        ${A} :is([class*="bg-black/"], [class*="from-black"]) :is([class*="text-white"], h3, span) { color: #fff !important; }

        /* --- header --- */
        ${A} header.asura-site-header { background: var(--yellow) !important; border-bottom: 3px solid var(--bd) !important; box-shadow: none !important; }
        ${A} header.asura-site-header :is(a, button) { font-weight: 800 !important; }
        ${A} header.asura-site-header nav a:hover, ${A} header.asura-site-header #resources-btn:hover { background: var(--card) !important; box-shadow: var(--sh-sm); }
        ${A} header.asura-site-header astro-island[component-url*="SearchBar"] button {
            background: var(--card) !important; border: var(--bw) solid var(--bd) !important; border-radius: 8px !important; box-shadow: var(--sh-sm) !important;
        }
        ${A} header.asura-site-header kbd { background: var(--soft) !important; color: var(--ink) !important; border: 1px solid var(--bd); }
        ${A} #resources-menu { background: var(--card) !important; border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh) !important; border-radius: 10px !important; }
        ${A} footer > div { background: var(--card) !important; border-top: 3px solid var(--bd) !important; }
        ${A} footer .bg-clip-text { color: var(--ink) !important; }

        /* --- buttons / chips --- */
        ${A} :is(main, footer) a[class*="px-3"][class*="py-1"]:not([class*="bg-"]) { border: 1.5px solid var(--bd); border-radius: 8px; }
        ${A} a[href^="/browse?genres"] { background: var(--blue) !important; color: var(--ink) !important; border: var(--bw) solid var(--bd) !important; border-radius: 999px !important; font-weight: 800 !important; }
        ${A} a:is([data-continue-link], [class*="bg-[#E8E8E8]" i]) { background: var(--pink) !important; color: var(--ink) !important; border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh-sm) !important; font-weight: 800 !important; }
        ${A} :is(h1, h2, h3) { color: var(--ink); }

        /* --- home --- */
        ${A}:is([data-md-page="list"], [data-md-page="nlist"]) main section h2 { background: linear-gradient(transparent 62%, var(--yellow) 62%); display: inline-block; padding: 0 6px; text-transform: uppercase; font-weight: 900 !important; }
        ${A}[data-md-page="list"] .hero-section-embla { background: var(--bg) !important; border-bottom: 3px solid var(--bd); }
        ${A}[data-md-page="list"] .hero-section-embla > img, ${A}[data-md-page="list"] .hero-section-embla > [class*="backdrop-blur"], ${A}[data-md-page="list"] .hero-section-embla > [class*="bg-gradient"] { display: none !important; }
        ${A} .embla-hero__slide a, ${A} .embla-trending__slide a > div:first-child { border: var(--bw) solid var(--bd) !important; border-radius: 10px !important; box-shadow: var(--sh-sm) !important; overflow: hidden; }

        /* --- series page --- */
        ${AO} main > .relative > .absolute { display: none !important; }
        ${AO} #description-text { color: var(--ink) !important; }
        ${AO} [class*="max-h-[500px]"] { max-height: 640px !important; }
        ${AO} a[href*="/chapter/"][class*="group"] { border-bottom: 1.5px solid var(--hair); }
        ${AO} a[href*="/chapter/"][class*="group"]:hover { background: var(--yellow) !important; }
        ${AO} #desktop-cover-container, ${AO} #mobile-cover-container { border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh) !important; border-radius: var(--r) !important; }
        ${AO} a[href*="/chapter/"][class*="group"] { background: var(--card) !important; }
        ${A} [data-md-hide] { display: none !important; }
        ${A} [data-series-download] {
            background: var(--lime) !important; background-image: none !important; color: var(--ink) !important; font-weight: 800 !important;
            border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh-sm) !important;
        }
        ${A} [data-series-download] :is(.absolute, [class*="uppercase"]) { display: none !important; }
        ${A} :is([class*="text-amber-"]):not(:is([class*="bg-black/"], [class*="from-black"]) *) { color: var(--amber) !important; }
        ${A} a[class*="from-amber-400"] { background: var(--cream) !important; background-image: none !important; }

        /* --- remaining dark panels (browse, ranking, guilds, promo cards) --- */
        ${A} :is([class*="bg-[#1f1a2e]" i], [class*="bg-[#1a1721]" i], [class*="bg-[#2b2931]" i], [class*="bg-[#24212B]" i], [class*="bg-[#2a1f3d]" i],
                 [class*="bg-gradient-to-"][class*="from-[#1" i], [class*="bg-gradient-to-"][class*="from-[#2" i], .podium-card, .leaderboard-list):not(.asura-site-header):not([class*="absolute"]):not([class*="inset-0"]) {
            background: var(--card) !important; background-image: none !important;
            border: var(--bw) solid var(--bd) !important; border-radius: var(--r) !important; box-shadow: var(--sh-sm) !important;
        }
        ${A} :is(.leaderboard-list, .podium-card) :is(div, a, span, p, h3)[class*="bg-"]:not([class*="bg-black"]):not([class*="rounded-full"]) { background-color: transparent !important; }
        ${A} [class*="absolute"][class*="inset-0"][class*="bg-gradient"]:is([class*="from-[#1" i], [class*="via-[#1" i], [class*="to-[#13111A" i]) { background: none !important; }
        ${A} .podium-card * { text-shadow: none !important; }
        ${A} .podium-card :is([class*="text-"], span, p, h3) { color: var(--ink); }
        ${A}[data-md-mode="comics"] :is(main, footer) a[href^="/novels/"], ${A}[data-md-mode="comics"] div:has(> a[href^="/novels/"]):not(:has(a[href^="/comics"])):not(:has(img)) { display: none !important; }
        ${A}[data-md-mode="comics"] .mt-4:has(> a.group[href^="/novels/"]) { display: none !important; }
        ${A} .profile-card { background: var(--card) !important; background-image: none !important; border: var(--bw) solid var(--bd) !important; box-shadow: var(--sh) !important; border-radius: 12px !important; }
        ${A} :is(.pc-ornament, .pc-banner-fade) { display: none !important; }
        ${AO} [data-md-select] a[href*="/chapter/"] { position: relative; padding-left: 46px !important; cursor: pointer; user-select: none; }
        ${AO} [data-md-select] a[href*="/chapter/"]::before {
            content: ""; position: absolute; left: 16px; top: 50%; width: 16px; height: 16px; margin-top: -8px; z-index: 1;
            background: var(--card); border: 2px solid var(--bd); border-radius: 3px; box-sizing: border-box;
        }
        ${AO} [data-md-select] a[href*="/chapter/"].md-sel { background: var(--yellow) !important; }
        ${AO} [data-md-select] a[href*="/chapter/"].md-sel::before { content: "\\2713"; background: var(--ink-bg); color: var(--on-ink); font: 900 12px/12px sans-serif; text-align: center; }
        ${AO} #cover-viewer { background: rgba(17,17,17,.9) !important; }

        /* --- reader --- */
        ${AC} .min-h-screen { background: transparent !important; }
        ${AC} div:has(> div[data-page]) {
            max-width: calc(var(--md-base) * var(--md-zoom)) !important; width: 100% !important; margin-inline: auto !important;
            border-inline: var(--bw) solid var(--rail);
        }
        ${AC} [data-page] img { display: block; width: 100%; min-height: 120px; background: var(--soft); }
        ${AC} div.fixed.bottom-0 { display: none !important; }
        ${AC} div.fixed.top-0 { background: var(--card) !important; border-bottom: 3px solid var(--bd) !important; }
        ${AC} #comments-section, ${AC} .max-w-\\[1285px\\] { max-width: min(900px, calc(100% - 24px)) !important; margin-inline: auto !important; }
        ${AC} #md-dock .md-lbl { display: inline; }
        ${A} #md-toast { bottom: 84px; }

        @media (max-width: 760px) {
            ${AC} div:has(> div[data-page]) { max-width: 100% !important; }
            #md-dock { gap: 3px; padding: 5px; bottom: calc(10px + env(safe-area-inset-bottom)); }
            #md-dock button { padding: 0 6px !important; }
            #md-dock .md-lbl { display: none !important; }
        }
        ` + sharedCss;
    })();

    /* ====================================================================
     *  EXTRA CSS (added on top of either skin)
     * ==================================================================== */
    const extraCss = `
        /* DemonicScans home ad banner + ad slots */
        html:not([data-md-site="asura"]) :is(.ds-ad-space, .main-width:has(> .ds-ad-space), ins[class^="eas"], ins[data-zoneid]) { display: none !important; }

        /* header logo lockup: dark pill, round logo badge, white wordmark (DemonicScans) */
        body > nav a[href="/index.php"]:has(> img[src*="title"]) {
            display: flex !important; align-items: center; gap: 10px;
            padding: 4px 16px 4px 4px !important; background: #161616 !important;
            border: 2px solid var(--bd) !important; border-radius: 999px !important; box-shadow: 2px 2px 0 var(--bd) !important;
            transition: transform .1s, box-shadow .1s;
        }
        body > nav a[href="/index.php"]:has(> img[src*="title"]):hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important; }
        body > nav a[href="/index.php"] img[src*="logo"] {
            width: 36px !important; height: 36px !important; padding: 3px; object-fit: contain;
            background: #2a2a2a; border-radius: 50% !important; border: 0 !important; box-shadow: none !important;
        }
        body > nav a[href="/index.php"] img[src*="title"] {
            width: auto !important; height: 22px !important; filter: none !important;
            border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
        }

        /* short comments */
        #cw-comments .cw-comment[data-mdx-hide] { display: none !important; }
        #cw-comments .cw-comment[data-mdx-main] > .comment-main { display: none !important; }

        /* reader: header auto-hide */
        html:is([data-md-page="chapter"], [data-md-page="nchapter"]) :is(body > nav, body > header, header.asura-site-header) { transition: transform .25s ease !important; }
        html:is([data-md-page="chapter"], [data-md-page="nchapter"])[data-md-navhide] :is(body > nav, body > header, header.asura-site-header) {
            transform: translateY(calc(-100% - 8px)) !important;
        }

        /* ===== DARK THEME: deep purple surfaces, light text, black borders + shadows ===== */
        html[data-md-theme="dark"] {
            --ink: #ece8ff; --muted: #a9a0d0; --bd: #000; --rail: #000;
            --bg: #150f26; --page-bg: #150f26; --card: #241b3d; --card-a: rgba(36,27,61,.97); --grid: rgba(255,255,255,.035);
            --yellow: #5a3fc2; --pink: #a3315f; --blue: #33479f; --lime: #1b7f68; --mint: #1d3a45; --cream: #2f2354; --soft: #33295a;
            --violet: #c1b0ff; --ink-bg: #7c5cff; --on-ink: #fff; --novel-ac: #5a3fc2; --amber: #fbbf24; --green: #34d399;
            --hair: rgba(255,255,255,.14);
            color-scheme: dark;
        }
        html[data-md-theme="dark"][data-md-mode="novels"] {
            --bg: #0f1722; --page-bg: #0f1722; --card: #162338; --cream: #1b2b44; --soft: #233450; --grid: rgba(255,255,255,.03);
            --yellow: #3a2f8c; --lime: #17766a; --blue: #1f5c86; --pink: #8f3050; --novel-ac: #3a2f8c;
        }
        html[data-md-theme="dark"][data-md-page="chapter"][data-md-bg="dark"] { --page-bg: #1b1430; --rail: #000; }
        html[data-md-theme="dark"] ::selection { background: #7c5cff; color: #fff; }
        html[data-md-theme="dark"] #cw-comments .cw-comment:is([data-viewer], [data-mine], [data-own], .mine, .own, .is-mine, .is-own, .is-me, .viewer, .md-mine) {
            background: #000 !important; --card: #000 !important; --panel: #000 !important;
        }
        html[data-md-theme="dark"] #cw-comments#cw-comments {
            --ink: #ece8ff !important; --muted: #a9a0d0 !important; --page: #241b3d !important; --panel: #241b3d !important;
            --raised: #2f2354 !important; --line: #000 !important; color-scheme: dark !important;
        }
        /* the wordmark PNG is white: only flip it black on light surfaces */
        html[data-md-theme="dark"] :is(nav, #menu, #footer-container) img[src*="title"] { filter: none !important; }

        /* ===== badges / dates / pills: always one tidy row ===== */
        [data-md="row"] { flex-wrap: nowrap !important; gap: 4px 6px !important; }
        [data-mdc="grid"] { padding: 10px !important; }
        [data-mdc="grid"] [data-mdf] { gap: 9px !important; }
        [data-mdc="grid"] img { flex: 0 0 64px !important; width: 64px !important; height: 92px !important; }
        [data-mdc="grid"] a[href*="chapter" i]:not([data-mdd]) {
            display: inline-block !important; flex: 0 1 auto; min-width: 0; max-width: 100%;
            overflow: hidden; text-overflow: ellipsis; padding: 2px 7px !important; font-size: 11.5px !important;
        }
        [data-mdc="grid"] a[data-mdd] { flex: none; font-size: 10.5px !important; }
        [data-mdc="grid"] [data-mdd][data-new] { padding: 0 7px !important; border-width: 2px !important; line-height: 1.55 !important; }
        html[data-md-site="asura"] a[href^="/browse?genres"] {
            display: inline-block; margin: 0 3px 3px 0; padding: 0 8px !important; line-height: 1.55 !important; font-size: 11px !important;
        }
        html[data-md-site="asura"] .pinned-glow { background: var(--cream) !important; background-image: none !important; box-shadow: none !important; }
        html[data-md-site="asura"] .pinned-glow::before, html[data-md-site="asura"] .pinned-glow::after { display: none !important; }
        html[data-md-site="asura"] a[class*="aspect-[500/680]"] :is(span, h3) { color: #fff !important; -webkit-text-fill-color: #fff !important; }
        html[data-md-site="asura"] a[class*="aspect-[500/680]"] b { color: #c4b5fd !important; }
        html[data-md-site="asura"] header.asura-site-header astro-island[component-url*="SearchBar"] button { height: 40px !important; }

        /* ===== dark mode switch (header, top right) ===== */
        #md-theme {
            position: relative; flex: 0 0 auto; display: inline-flex !important; align-items: center; justify-content: center;
            width: 40px; height: 40px; margin: 0 0 0 10px !important; padding: 0 !important; overflow: hidden;
            background: var(--card) !important; color: var(--ink) !important;
            border: var(--bw) solid var(--bd) !important; border-radius: 50% !important; box-shadow: var(--sh-sm) !important;
            cursor: pointer; transition: transform .1s, box-shadow .1s, background .15s !important;
        }
        #md-theme:hover { background: var(--yellow) !important; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--bd) !important; }
        #md-theme svg { width: 20px; height: 20px; color: var(--ink) !important; }
        #md-theme .md-th-sun svg { color: var(--amber) !important; }
        #md-theme .md-th-moon svg { color: var(--violet) !important; }
        #md-theme :is(.md-th-i, .md-th-knob) { display: grid; place-items: center; }
        #md-theme :is(.md-th-i, .md-th-knob) > span { grid-area: 1 / 1; display: grid; place-items: center; transition: transform .3s ease, opacity .2s ease; }
        #md-theme .md-th-moon { opacity: 0; transform: rotate(-70deg) scale(.4); }
        html[data-md-theme="dark"] #md-theme .md-th-moon { opacity: 1; transform: none; }
        html[data-md-theme="dark"] #md-theme .md-th-sun { opacity: 0; transform: rotate(70deg) scale(.4); }
        #md-theme .md-th-sw { display: none; }
        body > #md-theme { position: fixed; top: 10px; right: 14px; z-index: 101; margin: 0 !important; }   /* only if no header was found */
        @media (max-width: 760px) {
            /* phones: a sliding pill switch instead of the round button */
            #md-theme { width: 58px; height: 32px; margin-left: 8px !important; border-radius: 999px !important; justify-content: flex-start; }
            #md-theme:hover { transform: none; }
            #md-theme .md-th-i { display: none; }
            #md-theme .md-th-sw { display: block; position: relative; width: 100%; height: 100%; background: var(--cream); }
            #md-theme .md-th-knob {
                position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; box-sizing: border-box; border-radius: 50%;
                background: var(--yellow); border: var(--bw) solid var(--bd);
                transition: transform .25s cubic-bezier(.3, 1.4, .5, 1), background .2s;
            }
            html[data-md-theme="dark"] #md-theme .md-th-knob { transform: translateX(26px); background: var(--blue); }
            #md-theme .md-th-knob svg { width: 12px; height: 12px; }
        }
    `;

    function injectStyles() {
        const host = document.head || document.documentElement;
        if (!document.getElementById('md-fonts')) {
            const link = document.createElement('link');
            link.id = 'md-fonts';
            link.rel = 'stylesheet';
            link.href = FONT_URL;
            host.appendChild(link);
        }
        if (!document.getElementById('neobrutalism-demonic-css')) {
            const style = document.createElement('style');
            style.id = 'neobrutalism-demonic-css';
            style.textContent = ((IS_ASURA ? cssAsura : css) + extraCss).replace(/#cw-comments(?![\w-])/g, '#cw-comments#cw-comments');
            host.appendChild(style);
        }
        // stay last in document order so equal-specificity !important rules from the site's sheets lose
        const mine = document.getElementById('neobrutalism-demonic-css');
        if (mine && mine.parentNode && mine.parentNode.lastElementChild !== mine) mine.parentNode.appendChild(mine);
    }

    /* ====================================================================
     *  ANNOYANCE REMOVER  (Veyra banner, 0-Ads popup, announcement bar)
     * ==================================================================== */
    // [pattern, tallest ancestor (px) we are willing to remove]
    const PATTERNS = [
        [/veyra/i, 420],
        [/0 ads sub|no-ads (membership|sub)|zero ads/i, 900],
        [/demonicscans@proton\.me|no-ads sub/i, 90],
    ];

    function nukeAnnoyances() {
        if (!document.body) return;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hits = [];
        while (walker.nextNode()) {
            const text = walker.currentNode.nodeValue;
            if (!text || text.length < 5) continue;
            for (const [re, maxH] of PATTERNS) {
                if (re.test(text)) hits.push([walker.currentNode.parentElement, maxH]);
            }
        }

        for (const [start, maxH] of hits) {
            if (!start || !start.isConnected || start.closest('#cw-comments')) continue;
            let el = start;
            while (el.parentElement && el.parentElement !== document.body && el.parentElement.offsetHeight <= maxH) {
                el = el.parentElement;
            }
            const fixed = el.closest('[style*="fixed"], [class*="modal"], [class*="popup"]');
            (fixed || el).remove();
        }

        if (hits.length) {
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
        }

        // Full-width fixed overlays sitting directly under <body>
        document.querySelectorAll('body > div').forEach(div => {
            if (div.id === 'forced-Search' || div.id === 'menu' || div.id === 'md-dock' || div.id === 'md-scrim' || div.id === 'md-bg' || div.id === 'md-toast') return;
            const s = getComputedStyle(div);
            if (s.position === 'fixed' && +s.zIndex > 999 && div.offsetWidth >= innerWidth * 0.9) div.remove();
        });
    }

    /* ====================================================================
     *  SITE CHROME: sidebar, titlebar, search
     * ==================================================================== */
    const GONE_LINKS = /game_dash|bookmarks\.php|mycomments|signin|signup|discord\.gg|premium\.php/i;
    const menuEl = () => $('#menu');
    const menuOpen = () => { const m = menuEl(); return !!m && m.style.left === '0px'; };
    const closeMenu = () => { const m = menuEl(); if (m) m.style.left = '-280px'; };

    function syncMenuState() {
        const open = menuOpen();
        if (open) root.dataset.mdMenu = 'open'; else delete root.dataset.mdMenu;
    }

    function setupChrome() {
        // sidebar: drop account / game / ad links (CSS hides them instantly, this removes them for good)
        $$('#menu a[href]').forEach(a => { if (GONE_LINKS.test(a.getAttribute('href'))) a.remove(); });
        // titlebar: drop the account icon
        $$('body > nav a[href*="signin" i]').forEach(a => (a.closest('.cursor-pointer') || a).remove());

        if (root.dataset.mdChrome) return;
        const menu = menuEl();
        if (!menu) return;                       // DOM not there yet; try again on the next pass
        root.dataset.mdChrome = '1';

        // dimmed backdrop; any click that is not on the sidebar collapses it
        const scrim = document.createElement('div');
        scrim.id = 'md-scrim';
        document.body.appendChild(scrim);
        new MutationObserver(syncMenuState).observe(menu, { attributes: true, attributeFilter: ['style'] });
        syncMenuState();

        document.addEventListener('click', e => {
            const t = e.target;
            if (menuOpen() && !t.closest('#menu') && !t.closest('[onclick*="pushMenuRight"]')) closeMenu();

            // titlebar dropdown: click elsewhere closes it
            const box = $('#resultbox');
            if (box && !t.closest('body > nav .right-nav-cont')) box.style.display = 'none';
        });

        // magnifier in the titlebar: carry the typed text into the full-screen search
        document.addEventListener('click', e => {
            const btn = e.target.closest('body > nav .right-nav-cont button');
            if (!btn) return;
            const from = $('#header-search-input'), to = $('#search-bar'), box = $('#resultbox');
            if (box) box.style.display = 'none';
            if (from && to && from.value.trim()) {
                to.value = from.value;
                to.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));   // runs the site's inline onkeyup
            }
            setTimeout(() => { const f = $('#search-bar'); if (f && f.offsetParent) f.focus(); }, 60);
        }, true);

        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            closeMenu();
            const box = $('#resultbox'); if (box) box.style.display = 'none';
            const ov = $('#forced-Search'); if (ov && getComputedStyle(ov).display !== 'none') ov.style.display = 'none';
        });
    }

    /* ====================================================================
     *  LAYOUT ORGANISER  (home / list pages only: detects carousels, grids, headings by shape)
     * ==================================================================== */
    const CH = 'a[href*="chapter" i]';
    const META = /^(chapter|ch\.?|chap\.?)\s*[\d.]+|^\d{4}-\d{2}-\d{2}$|^\d+\s*(s|m|h|d|w|mo|y|min|hour|day|week|month|year)s?\s*ago$/i;
    const DATE = /^\d{4}-\d{2}-\d{2}$/;
    const SKIP_TAGS = /^(STYLE|SCRIPT|LINK|TEMPLATE|NOSCRIPT)$/;
    // Things we must never treat as a content track or collapse as an "empty block"
    const UI_ZONES = 'header, nav, footer, #md-top, #md-dock, #menu, #forced-Search, #resultbox, #footer-container, #cw-comments, #manga-info-container, .chapter-info';
    const VOID_SAFE = `${UI_ZONES}, [data-mdc], [data-md="rail"], [data-md="grid"], .shadowimg, .owl-nav, .owl-dots`;

    const pad = n => String(n).padStart(2, '0');
    const NF = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

    // Site dates may be server-time (UTC) while the reader is elsewhere: accept either "today".
    function isFresh(text) {
        const d = new Date();
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return text === local || text === d.toISOString().slice(0, 10);
    }

    const hasContent = el =>
        el.textContent.trim() !== '' ||
        !!el.querySelector('img,iframe,video,canvas,svg,input,button,select,textarea,picture,a');

    function textLeaves(rootEl) {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        const map = new Map();
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            const text = node.nodeValue.trim();
            if (!text || !parent || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName)) continue;
            map.set(parent, (map.get(parent) || '') + ' ' + text);
        }
        return [...map].map(([el, text]) => ({ el, text: text.trim() }));
    }

    // Parents whose children are mostly "things with an image" (covers / cards)
    function findTracks() {
        const set = new Set();
        for (const img of document.images) {
            if (img.closest(UI_ZONES)) continue;
            let node = img, depth = 0;
            while (node.parentElement && node.parentElement !== document.body && depth < 8) {
                const parent = node.parentElement;
                if (parent.children.length >= 3) {
                    const withImg = [...parent.children].filter(c => c.tagName === 'IMG' || c.querySelector('img')).length;
                    if (withImg >= 3 && withImg / parent.children.length >= 0.7) { set.add(parent); break; }
                }
                node = parent; depth++;
            }
        }
        const all = [...set];
        return all.filter(t => !all.some(o => o !== t && t.contains(o)));   // keep deepest only
    }

    /* ---------- card helpers ---------- */

    // Wrap an element's own text nodes in <span data-md="lbl"> so the title can be line-clamped on its own.
    function wrapOwnText(el) {
        const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim());
        if (!nodes.length) return null;
        const span = document.createElement('span');
        span.dataset.md = 'lbl';
        el.insertBefore(span, nodes[0]);
        nodes.forEach(n => span.appendChild(n));
        return span;
    }

    // The site truncates titles server-side ("The Extra's Acade..."); the full one lives in the link's title attribute.
    function restoreFullTitle(el, cell) {
        const raw = el.textContent.trim();
        if (!/(\.{3}|…)$/.test(raw)) return;
        const link = cell.querySelector('a[title]');
        const full = (link && link.getAttribute('title')) || (cell.querySelector('img[alt]') || {}).alt || '';
        const norm = s => s.replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
        const head = norm(raw.replace(/(\.{3}|…)$/, ''));
        if (full && full.length > head.length && norm(full).startsWith(head)) el.textContent = full;
    }

    function compactNumber(el, text) {
        const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
        if (!node) return;
        el.title = Number(text).toLocaleString('en') + ' views';
        node.nodeValue = ' ' + NF.format(Number(text));
    }

    // Mark each "Chapter N .... date" line as one flex row. Chapter + date links share an href,
    // so the row is the lowest ancestor that contains every link pointing at that chapter.
    function tagRows(cell, title) {
        const groups = new Map();
        cell.querySelectorAll(CH).forEach(a => {
            const href = a.getAttribute('href');
            if (!groups.has(href)) groups.set(href, []);
            groups.get(href).push(a);
        });
        groups.forEach(list => {
            let row = list[0].parentElement;
            while (row && row !== cell && !list.every(a => row.contains(a))) row = row.parentElement;
            if (!row || row === cell || row.dataset.md) return;
            if (row.querySelector('img') || (title && row.contains(title))) return;
            row.dataset.md = 'row';
        });
    }

    function tagCell(cell, kind) {
        if (cell.nodeType !== 1 || SKIP_TAGS.test(cell.tagName)) return;
        cell.dataset.mdc = kind;
        if (cell.dataset.mdDone) return;

        const leaves = textLeaves(cell);
        if (!leaves.length && !cell.querySelector('img')) return;
        cell.dataset.mdDone = '1';

        const isCh = el => !!el.closest(CH);
        const titleLeaf = leaves.find(l => !isCh(l.el) && !META.test(l.text) && l.text.length > 1);
        const title = titleLeaf ? titleLeaf.el : null;

        // Make every wrapper between the cell and `el` static, so absolute children anchor to the cell.
        const staticify = el => {
            for (let p = el.parentElement; p && p !== cell; p = p.parentElement)
                p.style.setProperty('position', 'static', 'important');
        };

        if (title) {
            // `top` = outermost ancestor of the title that holds no image and no chapter links
            let top = title;
            for (let p = title.parentElement; p && p !== cell; p = p.parentElement) {
                if (p.querySelector('img') || p.querySelector(CH)) break;
                top = p;
            }

            let label = title;
            if (kind === 'rail') {
                top.dataset.md = 'lblbox';
                if (top === title) label = wrapOwnText(title);
                else title.dataset.md = 'lbl';
                staticify(top);
            } else {
                title.dataset.md = 'title';
                if (top !== title) {
                    for (let p = title.parentElement; p; p = p.parentElement) {
                        p.dataset.md = 'titlebox';
                        if (p === top) break;
                    }
                }
            }
            if (CONFIG.fullTitles && label) restoreFullTitle(label, cell);
        }

        if (kind === 'rail') cell.querySelectorAll('img').forEach(staticify);

        for (const { el, text } of leaves) {
            if (el === title) continue;
            if (DATE.test(text)) {
                el.dataset.mdd = '1';
                if (isFresh(text)) el.dataset.new = '1';
            } else if (kind === 'rail' && !el.dataset.md && !isCh(el)) {
                el.dataset.md = 'sub';
                if (CONFIG.compactViews && /^\d{4,}$/.test(text)) compactNumber(el, text);
            }
        }

        if (kind === 'grid') {
            tagRows(cell, title);
            let f = cell;
            while (f.children.length === 1) f = f.firstElementChild;
            f.dataset.mdf = '1';
        }
    }

    /* ---------- section headings ---------- */

    function findHeading(sec) {
        const ok = p =>
            p.dataset.md !== 'head' && !p.closest('[data-md="head"]') && !p.matches(UI_ZONES) && !p.closest('#forced-Search, #menu, #resultbox, #cw-comments') &&
            !p.querySelector('img') && p.children.length <= 3 &&
            (t => t.length > 0 && t.length <= 40 && !/see\s*more/i.test(t))(p.textContent.trim());
        let n = sec;
        for (let lvl = 0; lvl < 4 && n && n !== document.body; lvl++) {
            let p = n.previousElementSibling, k = 0;
            while (p && k < 3) { if (ok(p)) return p; p = p.previousElementSibling; k++; }
            n = n.parentElement;
        }
        return null;
    }

    function findMore(sec) {
        let n = sec;
        for (let lvl = 0; lvl < 4 && n && n !== document.body; lvl++) {
            let s = n.nextElementSibling, k = 0;
            while (s && k < 3) {
                if (s.matches('[data-md="rail"],[data-md="grid"]') || s.querySelector('[data-md="rail"],[data-md="grid"]')) break;
                if (/^see\s*more$/i.test(s.textContent.trim()) && !s.querySelector('img')) return s;
                s = s.nextElementSibling; k++;
            }
            n = n.parentElement;
        }
        return null;
    }

    function makeArrows(sec) {
        const nav = document.createElement('div');
        nav.dataset.md = 'arrows';
        const [prev, next] = [[-1, '‹', 'Scroll left'], [1, '›', 'Scroll right']].map(([dir, glyph, label]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = glyph;
            b.setAttribute('aria-label', label);
            b.addEventListener('click', () => sec.scrollBy({ left: dir * sec.clientWidth * 0.85, behavior: 'smooth' }));
            nav.appendChild(b);
            return b;
        });
        // grey the arrows out at either end
        const sync = () => {
            prev.disabled = sec.scrollLeft <= 2;
            next.disabled = sec.scrollLeft + sec.clientWidth >= sec.scrollWidth - 2;
        };
        sec.addEventListener('scroll', sync, { passive: true });
        sec.__mdSync = sync;
        return nav;
    }

    function buildHead(sec) {
        if (sec.dataset.mdHead) return;
        const heading = findHeading(sec);
        if (!heading && document.readyState !== 'complete') return;   // retry later
        sec.dataset.mdHead = '1';

        const more = findMore(sec);
        const bar = document.createElement('div');
        bar.dataset.md = 'head';
        const anchor = heading || sec;
        anchor.parentElement.insertBefore(bar, anchor);

        if (heading) { heading.dataset.md = 'headtext'; bar.appendChild(heading); }
        else bar.style.justifyContent = 'flex-end';
        if (more) { more.dataset.md = 'more'; bar.appendChild(more); }
        if (CONFIG.arrows && sec.dataset.md === 'rail') bar.appendChild(makeArrows(sec));
    }

    /* ---------- dead ad slots ---------- */

    function collapseVoids() {
        if (!CONFIG.collapseGaps || document.readyState !== 'complete') return;
        document.querySelectorAll('[data-md="void"]').forEach(v => { if (hasContent(v)) delete v.dataset.md; });
        document.querySelectorAll('body div, body section').forEach(d => {
            if (d.dataset.md || d.closest(VOID_SAFE)) return;
            if (d.offsetHeight < 90 || hasContent(d)) return;
            if (getComputedStyle(d).backgroundImage !== 'none') return;
            d.dataset.md = 'void';
        });
    }

    /* ---------- main pass ---------- */

    let lastSummary = '';
    function organize() {
        // 1. classify tracks
        for (const t of findTracks()) {
            if (t.dataset.md) continue;
            const wide = t.scrollWidth > t.clientWidth + 40 ||
                (t.parentElement && t.parentElement.scrollWidth > t.parentElement.clientWidth + 40);
            t.dataset.md = (t.querySelector(CH) && !wide) ? 'grid' : 'rail';
        }

        // 2. grids made of several row-containers -> parent is the grid, rows dissolve
        document.querySelectorAll('[data-md="grid"],[data-md="gridrow"]').forEach(t => {
            const p = t.parentElement;
            if (!p || p === document.body) return;
            const sibs = [...p.children].filter(c => c.dataset.md === 'grid' || c.dataset.md === 'gridrow');
            if (sibs.length >= 2) {
                p.dataset.md = 'grid';
                sibs.forEach(s => { if (s !== p) s.dataset.md = 'gridrow'; });
            }
        });

        // 3. tag cells, wrappers, headings
        document.querySelectorAll('[data-md="rail"],[data-md="grid"]').forEach(sec => {
            for (let p = sec.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement)
                p.dataset.mdw = '1';
            const kind = sec.dataset.md;
            const cells = kind === 'grid'
                ? [...sec.children].flatMap(c => c.dataset.md === 'gridrow' ? [...c.children] : [c])
                : [...sec.children];
            cells.forEach(c => tagCell(c, kind));
            buildHead(sec);
        });

        collapseVoids();
        document.querySelectorAll('[data-md="rail"]').forEach(r => r.__mdSync && r.__mdSync());

        if (CONFIG.debug) {
            const summary = `rails:${document.querySelectorAll('[data-md="rail"]').length} grids:${document.querySelectorAll('[data-md="grid"]').length}`;
            if (summary !== lastSummary) { lastSummary = summary; console.log('[MD] detected', summary); }
        }
    }

    /* ====================================================================
     *  SERIES (overview) PAGE
     * ==================================================================== */
    // "Latest Novel Updates": heading, "see more" and grid all live in one .main-width block
    function removeNovels() {
        $$('.main-width').forEach(sec => {
            const h = sec.querySelector(':scope > h1.section-title, :scope > .section-title');
            if ((h && /novel/i.test(h.textContent)) || sec.querySelector(':scope > h3.see-more a[href*="nvupdates" i]')) sec.remove();
        });
    }


    /* ---------- hero carousel: slow drift on desktop, one card at a time on touch ---------- */
    function autoplayHero() {
        if (!CONFIG.heroAutoplay) return;
        const rail = document.querySelector('[data-md="rail"]');
        if (!rail || rail.__mdAuto) return;
        rail.__mdAuto = true;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        rail.style.scrollSnapType = 'none';
        const mobile = () => matchMedia('(pointer: coarse), (max-width: 720px)').matches;
        let visible = true, holdUntil = 0, pos = null, dir = 1, last = performance.now(), edgeWait = 0;
        try { new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(rail); } catch (e) { /* always visible */ }
        const hold = ms => { holdUntil = Math.max(holdUntil, performance.now() + ms); };
        rail.addEventListener('touchstart', () => hold(9000), { passive: true });
        rail.addEventListener('touchmove', () => hold(9000), { passive: true });
        rail.addEventListener('wheel', () => hold(3000), { passive: true });
        rail.addEventListener('pointerdown', () => hold(3000), { passive: true });
        rail.addEventListener('focusin', () => hold(6000));
        let over = false;
        rail.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') over = true; });
        rail.addEventListener('pointerleave', () => { over = false; });

        const frame = now => {
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            if (!mobile() && visible && !document.hidden && now >= holdUntil && !over && !rail.matches(':hover')) {
                const max = rail.scrollWidth - rail.clientWidth;
                if (max > 4) {
                    if (pos === null || Math.abs(rail.scrollLeft - pos) > 2) {
                        // somebody else moved it (arrows, drag, wheel): hand over, resume later
                        if (pos !== null) hold(3000);
                        pos = rail.scrollLeft;
                    } else if (edgeWait > 0) {
                        edgeWait -= dt;
                    } else {
                        pos += dir * CONFIG.heroSpeed * dt;
                        if (pos >= max) { pos = max; dir = -1; edgeWait = 2; }
                        else if (pos <= 0) { pos = 0; dir = 1; edgeWait = 2; }
                        rail.scrollLeft = pos;
                    }
                }
            } else pos = null;
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);

        setInterval(() => {
            if (!mobile() || !visible || document.hidden || performance.now() < holdUntil) return;
            const card = rail.firstElementChild;
            const step = card ? card.getBoundingClientRect().width + 12 : rail.clientWidth * 0.6;
            const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
            rail.scrollTo({ left: atEnd ? 0 : rail.scrollLeft + step, behavior: 'smooth' });
        }, CONFIG.heroStepMs);
    }

    /* ---------- long series descriptions ---------- */
    function setupShowMore(box) {
        const d = $('.white-font', box);
        if (!d || d.dataset.mdMore) return;
        d.dataset.mdMore = '1';
        const apply = () => {
            if (d.__mdBtn) return;
            d.classList.add('md-clamp');
            if (d.scrollHeight <= d.clientHeight + 4) { d.classList.remove('md-clamp'); return; }   // short enough
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'md-more'; b.textContent = 'Show more'; b.setAttribute('aria-expanded', 'false');
            b.addEventListener('click', () => {
                const open = d.classList.toggle('md-clamp') === false;
                b.textContent = open ? 'Show less' : 'Show more';
                b.setAttribute('aria-expanded', String(open));
            });
            d.after(b); d.__mdBtn = b;
        };
        apply();
        if (document.readyState !== 'complete') addEventListener('load', apply, { once: true });
        document.fonts && document.fonts.ready && document.fonts.ready.then(() => { if (!d.__mdBtn) apply(); });
    }

    /* ---------- chapter select mode: many chapters -> one .zip of .cbz files ---------- */
    const SEL_DEMONIC = {
        host: () => $('#chapters-list'),
        links: list => $$('a.chplinks', list),
        label: a => {
            const t = [...a.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
            return (t ? t.nodeValue : a.textContent).replace(/\s+/g, ' ').trim();
        },
        series: (doc, box) => ((doc.querySelector('.chapter-info h1 a') || doc.querySelector('.chapter-info h1') || $('h1', box) || {}).textContent || document.title).trim(),
        pages: (doc, url) => [...doc.querySelectorAll('img.imgholder[alt]')]
            .map(i => i.currentSrc || i.getAttribute('src')).filter(u => u && !/\/img\//.test(u)).map(u => new URL(u, url).href),
        framePages: doc => $$('img.imgholder[alt]', doc).filter(i => !/\/img\//.test(i.getAttribute('src') || '')),
    };

    const SEL_ASURA = {
        host: () => $('astro-island[component-url*="ChapterListReact"]'),
        links: host => $$('a[href*="/chapter/"]', host).filter(a => !a.hasAttribute('data-md-locked')),
        label: a => {
            const m = (a.getAttribute('href') || '').match(/\/chapter\/([\d.]+)/);
            return m ? 'Chapter ' + m[1] : a.textContent.replace(/\s+/g, ' ').trim();
        },
        series: doc => String((asuraReaderProps(doc) || {}).seriesName || ($('h1', doc) || {}).textContent || document.title).trim(),
        pages: (doc, url) => {
            const c = asuraChapterContext(doc, url);
            if (c && c.srcs.length) return c.srcs.map(u => new URL(u, url).href);
            return $$('img[data-page-index]', doc).map(i => i.getAttribute('src')).filter(Boolean).map(u => new URL(u, url).href);
        },
        framePages: doc => $$('img[data-page-index]', doc),
    };

    function setupSelect(box, A) {
        A = A || SEL_DEMONIC;
        const list = A.host();
        if (!list || $('#md-sel-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'md-sel-bar';
        bar.innerHTML =
            '<button type="button" data-s="toggle" aria-pressed="false">Select</button>' +
            '<span class="md-sel-tools" hidden style="display:contents">' +
            '<button type="button" data-s="all">Select all</button>' +
            '<button type="button" data-s="inv">Select unselected</button>' +
            '<button type="button" class="md-sel-dl" data-s="dl" disabled>Download .zip</button>' +
            '<button type="button" class="md-sel-pdf" data-s="pdf" disabled>Download .pdf</button>' +
            '<span class="md-sel-count"></span></span>';
        list.parentNode.insertBefore(bar, list);
        const tools = $('.md-sel-tools', bar), count = $('.md-sel-count', bar), dl = $('.md-sel-dl', bar), pdfBtn = $('.md-sel-pdf', bar), tog = $('[data-s="toggle"]', bar);
        const links = () => A.links(list);
        // selection lives in a Set (keyed by href) so it survives the site re-rendering its own list
        const picked = new Set();
        const key = a => a.getAttribute('href');
        const isSel = a => picked.has(key(a));
        const setSel = (a, on) => { if (on) picked.add(key(a)); else picked.delete(key(a)); a.classList.toggle('md-sel', on); };
        const sync = () => links().forEach(a => a.classList.toggle('md-sel', picked.has(key(a))));
        const chosen = () => links().filter(isSel);
        let job = null, lastIdx = -1, lastFail = '', curFmt = 'zip';

        const refresh = () => {
            const n = chosen().length;
            count.textContent = job ? '' : n + ' of ' + links().length + ' selected';
            pdfBtn.disabled = !n || !!job; pdfBtn.textContent = n ? `Download ${n} .pdf` : 'Download .pdf';
            if (!job) { dl.disabled = !n; dl.dataset.state = ''; dl.style.removeProperty('--p'); dl.textContent = n ? `Download ${n} .zip` : 'Download .zip'; }
        };
        const setMode = on => {
            tog.setAttribute('aria-pressed', String(on));
            tog.textContent = on ? 'Done' : 'Select';
            tools.hidden = !on;
            if (on) list.setAttribute('data-md-select', ''); else { list.removeAttribute('data-md-select'); picked.clear(); sync(); }
            refresh();
        };

        bar.addEventListener('click', e => {
            const b = e.target.closest('button[data-s]');
            if (!b || b.disabled && b.dataset.s !== 'dl') return;
            const act = b.dataset.s;
            if (act === 'toggle') { if (job) return;  setMode(!list.hasAttribute('data-md-select')); }
            else if (act === 'all') { links().forEach(a => setSel(a, true)); refresh(); }
            else if (act === 'inv') { links().forEach(a => setSel(a, !isSel(a))); refresh(); }
            else if (act === 'dl') {
                if (job) { job.cancelled = true; job.aborts.forEach(f => f()); }
                else download('zip');
            }
            else if (act === 'pdf') { if (!job) download('pdf'); }

        });

        list.addEventListener('click', e => {
            if (!list.hasAttribute('data-md-select')) return;
            const a = e.target.closest('a');
            if (!a || !links().includes(a)) return;
            e.preventDefault(); e.stopPropagation();
            const all = links(), i = all.indexOf(a);
            if (e.shiftKey && lastIdx >= 0) {
                const [lo, hi] = [Math.min(i, lastIdx), Math.max(i, lastIdx)], on = !isSel(a);
                for (let k = lo; k <= hi; k++) setSel(all[k], on);
            } else setSel(a, !isSel(a));
            lastIdx = i; refresh();
        }, true);

        const linkLabel = A.label;
        const numOf = a => parseFloat((linkLabel(a).match(/\d+(?:\.\d+)?/) || [0])[0]);

        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const seriesOf = doc => A.series(doc, box);
        const pagesOf = (doc, url) => A.pages(doc, url);
        const ctxOf = (a, doc, url, srcs) => {
            const label = linkLabel(a);
            return { series: seriesOf(doc), label, num: (label.match(/\d+(?:\.\d+)?/) || [''])[0], url, srcs, raw: curFmt === 'pdf' };
        };

        // normal route: read the chapter's HTML, then pull the images
        async function chapterCbz(a, ctl, onProg) {
            const url = new URL(a.getAttribute('href'), location.href).href;
            const ac = new AbortController();
            ctl.aborts.add(() => ac.abort());
            const r = await fetch(url, { credentials: 'include', signal: ac.signal });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            ctl.referer = url;
            return buildCbz(ctxOf(a, doc, url, pagesOf(doc, url)), onProg, ctl);
        }

        /* ---- fallback route: open the chapter in a (blurred) background frame running OUR reader, scroll through it
              smoothly page by page so the site's lazy loading fires, and grab each page once it has loaded ---- */
        const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        function smoothScroll(win, to, ctl) {
            return new Promise(res => {
                const from = win.scrollY, dist = to - from;
                if (Math.abs(dist) < 2) return res();
                const ms = Math.min(1400, Math.max(450, Math.abs(dist) * 0.9)), t0 = performance.now();
                const tick = () => {
                    if (ctl.cancelled) return res();
                    const t = Math.min(1, (performance.now() - t0) / ms);
                    win.scrollTo(0, from + dist * easeInOut(t));
                    if (t < 1) setTimeout(tick, 16); else res();
                };
                tick();
            });
        }
        const imgOk = i => i.complete && i.naturalWidth > 0;
        const framePages = doc => A.framePages(doc);

        function openFrame(url, ctl) {
            return new Promise((resolve, reject) => {
                const f = document.createElement('iframe');
                f.name = 'md-bg-frame'; f.src = url; f.setAttribute('aria-hidden', 'true');
                const fail = e => { clearTimeout(to); f.remove(); reject(e); };
                const to = setTimeout(() => fail(new Error('page timeout')), 60000);
                ctl.aborts.add(() => fail(new Error('cancelled')));
                f.addEventListener('load', async () => {
                    const t0 = Date.now();
                    try {
                        while (Date.now() - t0 < 25000 && !ctl.cancelled) {
                            const d = f.contentDocument;
                            if (d && framePages(d).length) break;
                            await sleep(300);
                        }
                    } catch (e) { return fail(new Error('frame blocked')); }
                    clearTimeout(to);
                    if (!framePages(f.contentDocument).length) return fail(new Error('no pages found'));
                    resolve(f);
                });
                $('#md-bg-stage').appendChild(f);
            });
        }

        async function canvasBytes(img) {            // last resort when the request route is refused
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                const blob = await new Promise(r => c.toBlob(r, 'image/png'));
                return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
            } catch (e) { return null; }           // cross-origin images taint the canvas
        }

        async function chapterViaFrame(a, ctl, status, onFrac) {
            const url = new URL(a.getAttribute('href'), location.href).href;
            status('opening page');
            const f = await openFrame(url, ctl);
            try {
                const win = f.contentWindow, doc = f.contentDocument;
                ctl.referer = url;
                const n = framePages(doc).length, datas = new Array(n), srcs = new Array(n), jobs = [];
                for (let i = 0; i < n && !ctl.cancelled; i++) {
                    const img = framePages(doc)[i];
                    if (!img) throw new Error('page list changed');
                    status(`scrolling · page ${i + 1}/${n}`);
                    await smoothScroll(win, Math.max(0, img.getBoundingClientRect().top + win.scrollY - 60), ctl);
                    // wait for this page to load (scrolling to it is what makes the site load it); nudge once if it stalls
                    let t0 = Date.now(), nudged = false;
                    while (!imgOk(img) && !ctl.cancelled) {
                        if (!nudged && Date.now() - t0 > 12000) { nudged = true; try { const u = img.currentSrc || img.src; img.src = ''; img.src = u; } catch (e) { /* ignore */ } t0 = Date.now(); }
                        else if (nudged && Date.now() - t0 > 20000) throw new Error(`page ${i + 1} would not load`);
                        await sleep(200);
                    }
                    srcs[i] = img.currentSrc || img.src;
                    status(`downloading · page ${i + 1}/${n}`);
                    // grab it while the next page is scrolled into view
                    jobs.push((async () => {
                        try { datas[i] = await fetchPage(srcs[i], ctl); }
                        catch (e) { datas[i] = await canvasBytes(img); if (!datas[i]) throw e; }
                        onFrac((i + 1) / n);
                    })());
                    if (jobs.length >= 4) await jobs.shift();
                    await sleep(120);
                }
                await Promise.all(jobs);
                if (ctl.cancelled) throw new Error('cancelled');
                return packCbz(ctxOf(a, doc, url, srcs), datas, srcs);
            } finally { f.remove(); }
        }

        function stage(on) {
            let w = $('#md-bg');
            if (!on) { if (w) w.remove(); return null; }
            if (!w) {
                w = document.createElement('div'); w.id = 'md-bg';
                w.innerHTML = '<div id="md-bg-stage"></div><div id="md-bg-card"><b></b><span></span><button type="button">Cancel</button></div>';
                document.body.appendChild(w);
            }
            return { title: t => { $('b', w).textContent = t; }, text: t => { $('span', w).textContent = t; }, cancel: $('button', w) };
        }

        async function download(fmt = 'zip') {
            const sel = chosen().sort((x, y) => numOf(x) - numOf(y));
            if (!sel.length) return;
            curFmt = fmt;
            const pdfChapters = [];
            const ctl = job = { cancelled: false, aborts: new Set() };
            dl.dataset.state = 'busy';
            const entries = [], failed = [];
            let series = '';
            const total = sel.length;
            const setP = (done, frac, txt) => {
                dl.style.setProperty('--p', Math.round((done + frac) / total * 100) + '%');
                dl.textContent = txt + ' · Cancel';
            };
            const keep = async (a, res) => {
                if (res.raw) {                                   // PDF: turn every page into a JPEG blob right away, then drop the raw bytes
                    const imgs = [];
                    for (let i = 0; i < res.pages.length; i++) { imgs.push(await toJpegPart(res.pages[i])); res.pages[i] = null; }
                    pdfChapters.push({ num: parseFloat(res.num) || 0, label: res.label, imgs });
                    series = series || res.series;
                } else {
                    const buf = await res.blob.arrayBuffer();
                    entries.push({ name: res.filename, data: new Uint8Array(buf) });
                    series = series || res.filename.replace(/ - Chapter .*$/, '');
                }
                setSel(a, false);
            };
            try {
                // ---- phase 1: fast route, 3 tries per chapter ----
                let done = 0;
                for (let i = 0; i < total && !ctl.cancelled; i++) {
                    const prefix = `Ch ${i + 1}/${total}`;
                    setP(done, 0, prefix);
                    let ok = false, why = '';
                    for (let attempt = 1; attempt <= 3 && !ok && !ctl.cancelled; attempt++) {
                        try {
                            await keep(sel[i], await chapterCbz(sel[i], ctl, (n, t) => setP(done, n / t, `${prefix}${attempt > 1 ? ' (retry ' + attempt + ')' : ''} · ${n}/${t}`)));
                            ok = true;
                        } catch (e) {
                            if (ctl.cancelled) break;
                            why = e.message; console.warn('[MD] chapter failed', linkLabel(sel[i]), e);
                            await sleep(1500 * attempt);
                        }
                    }
                    if (ok) { done++; await sleep(400); } else if (!ctl.cancelled) failed.push({ a: sel[i], why });
                }

                // ---- phase 2, automatic: the chapters that failed, opened and scrolled in the background ----
                const still = [];
                if (failed.length && !ctl.cancelled) {
                    const st = stage(true);
                    st.cancel.onclick = () => { ctl.cancelled = true; ctl.aborts.forEach(f => f()); };
                    for (let j = 0; j < failed.length && !ctl.cancelled; j++) {
                        const { a } = failed[j], label = linkLabel(a);
                        const head = `${label} · background ${j + 1}/${failed.length}`;
                        st.title(head);
                        const upd = txt => { st.text(txt); dl.textContent = `${head} · Cancel`; };
                        let ok = false, why = '';
                        for (let attempt = 1; attempt <= 2 && !ok && !ctl.cancelled; attempt++) {
                            try {
                                await keep(a, await chapterViaFrame(a, ctl, upd, fr => dl.style.setProperty('--p', Math.round((done + fr) / total * 100) + '%')));
                                ok = true; done++;
                            } catch (e) { if (ctl.cancelled) break; why = e.message; console.warn('[MD] background route failed', label, e); await sleep(1000); }
                        }
                        if (!ok && !ctl.cancelled) still.push({ a, why });
                    }
                    stage(false);
                }
                if (ctl.cancelled) { toast('Download cancelled'); return; }

                dl.style.setProperty('--p', '100%');
                if (fmt === 'pdf' && pdfChapters.length) {
                    dl.textContent = 'Building PDF…';
                    await sleep(50);
                    pdfChapters.sort((x, y) => x.num - y.num);
                    const pdfName = `${safeName(series || 'Chapters')} - ${pdfChapters.length} chapter${pdfChapters.length > 1 ? 's' : ''}.pdf`;
                    saveBlob(buildPdf(pdfChapters, series || 'Chapters'), pdfName);
                    toast(still.length ? `Saved ${pdfName}; ${still.length} could not be fetched` : 'Saved ' + pdfName, still.length ? 6000 : 3500);
                } else if (fmt === 'zip' && entries.length) {
                    entries.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
                    const zipName = `${series || 'Chapters'} - ${entries.length} chapter${entries.length > 1 ? 's' : ''}.zip`;
                    saveBlob(makeZip(entries), zipName);
                    toast(still.length ? `Saved ${zipName}; ${still.length} could not be fetched` : 'Saved ' + zipName, still.length ? 6000 : 3500);
                } else toast('Download failed: nothing could be fetched', 4500);
                if (still.length) lastFail = 'Not included: ' + still.map(f => linkLabel(f.a) + ' (' + f.why + ')').join('; ') + ' - still selected, press Download to retry';
            } finally {
                stage(false); job = null; refresh();
                if (lastFail) { count.textContent = lastFail; lastFail = ''; }
            }
        }
        bar.__all = () => {
            if (job) return toast('A download is already running');
            const n = links().length;
            if (!n) return toast('No unlocked chapters found');
            if (!confirm(`Download all ${n} unlocked chapters as one .pdf? (large series take a while)`)) return;
            if (!list.hasAttribute('data-md-select')) setMode(true);
            links().forEach(a => setSel(a, true)); refresh(); download('pdf');
        };
        bar.__sync = () => { sync(); refresh(); };
        refresh();
    }

    function setupOverview() {
        const box = $('#manga-info-container');
        if (!box || box.dataset.mdOv) return;
        box.dataset.mdOv = '1';

        if (CONFIG.hideSeoBlurb) {
            const blurb = $('.white-font', box);
            const first = blurb && [...blurb.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
            if (first && /manga|manhwa|manhua|english/i.test(first.nodeValue)) {
                const span = document.createElement('span');
                span.className = 'md-seo';
                blurb.insertBefore(span, first);
                span.appendChild(first);
                // the two <br> that followed the boilerplate
                let n = span.nextSibling, k = 0;
                while (n && k < 2) { const nx = n.nextSibling; if (n.nodeName === 'BR') { n.remove(); k++; } n = nx; }
            }
        }
        // stat rows with nothing in them (e.g. "Alternatives")
        $$('#manga-info-stats > div', box).forEach(row => {
            const val = row.children[1];
            if (!val) return;
            if (!val.textContent.replace(/[\s\u00a0]/g, '')) row.remove();
            else val.textContent = val.textContent.replace(/^[\s\u00a0]+/, '').trim();
        });
        if (CONFIG.hideAccountUi) $$('#bookmark, #rate-container, #rate-active', box).forEach(e => e.remove());
        try { setupShowMore(box); } catch (e) { console.warn('[MD] more', e); }
        try { setupSelect(box, SEL_DEMONIC); } catch (e) { console.warn('[MD] select', e); }
    }

    /* ====================================================================
     *  READER (chapter page)
     * ==================================================================== */
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
        book: SVG('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7.5h7M8 11h5"/>'),
        comic: SVG('<rect x="3" y="3" width="8" height="10"/><rect x="13" y="3" width="8" height="6"/><rect x="13" y="11" width="8" height="10"/><rect x="3" y="15" width="8" height="6"/>'),
        aa: SVG('<path d="M3 19 8.5 5 14 19M5 14.5h7M15.5 19l3.2-8 3.3 8M16.7 16h4"/>'),
        play: SVG('<path d="m7 4 13 8-13 8z" fill="currentColor"/>'),
        list: SVG('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
        lock: SVG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
        pause: SVG('<path d="M8 5v14M16 5v14"/>'),
        sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
        moon: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    };

    const reader = { zoom: 1, bg: 'paper', dock: null, dl: null };
    const BGS = ['paper', 'dark', 'black'];

    // Asura is an Astro site: component data (pages, series, neighbours) sits in the island's `props` attribute
    function astroProps(el) {
        try {
            const dec = v => {
                if (!Array.isArray(v)) return v;
                const [t, x] = v;
                if (t === 1) return x.map(dec);
                if (t === 0 && x && typeof x === 'object' && !Array.isArray(x)) { const o = {}; for (const k in x) o[k] = dec(x[k]); return o; }
                return x;
            };
            const raw = JSON.parse(el.getAttribute('props')), out = {};
            for (const k in raw) out[k] = dec(raw[k]);
            return out;
        } catch (e) { return null; }
    }
    const asuraReaderProps = (doc = document) => {
        const el = doc.querySelector('astro-island[component-url*="ChapterReader"]');
        return el ? astroProps(el) : null;
    };
    function asuraChapterContext(doc = document, url = location.href) {
        const p = asuraReaderProps(doc);
        if (!p) return null;
        const base = '/comics/' + p.seriesSlug + '/chapter/';
        return {
            series: String(p.seriesName || document.title), label: 'Chapter ' + p.chapterNumber, num: String(p.chapterNumber),
            prev: p.prevChapter ? base + p.prevChapter.number : null,
            next: p.nextChapter ? base + p.nextChapter.number : null,
            seriesUrl: '/comics/' + p.seriesSlug, url,
            srcs: (p.pages || []).map(x => x.url).filter(Boolean),
        };
    }

    function chapterContext() {
        if (IS_ASURA) {
            const c = asuraChapterContext();
            if (c && c.srcs.length) return c;
            return { series: document.title, label: '', num: '', prev: null, next: null, seriesUrl: '/', srcs: pageImages().map(i => i.currentSrc || i.src) };
        }
        const sel = $('.chapters-nav select');
        const opts = sel ? [...sel.options] : [];
        const i = Math.max(0, opts.findIndex(o => o.selected));
        const series = ($('.chapter-info h1 a') || $('.chapter-info h1') || {}).textContent || document.title;
        const label = ($('.chapter-info h2') || {}).textContent || (opts[i] ? opts[i].textContent : '');
        const num = ((label.match(/[\d]+(?:\.\d+)?/) || [])[0]) || '';
        return {
            series: series.trim(), label: label.trim(), num,
            prev: opts[i - 1] ? opts[i - 1].value : null,
            next: opts[i + 1] ? opts[i + 1].value : null,
            mangaId: new URLSearchParams(location.search).get('manga'),
        };
    }

    function pageImages() {
        if (IS_ASURA) return $$('img[data-page-index]');
        return $$('img.imgholder[alt]').filter(img => !/\/img\//.test(img.getAttribute('src') || ''));
    }

    function toast(msg, ms = 2200) {
        let t = $('#md-toast');
        if (!t) { t = document.createElement('div'); t.id = 'md-toast'; document.body.appendChild(t); }
        t.textContent = msg; t.classList.add('show');
        clearTimeout(t.__h); t.__h = setTimeout(() => t.classList.remove('show'), ms);
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
    // dark mode never shows a bright "paper" page behind the chapter (the stored choice is left alone)
    function paintBg() {
        let eff = reader.bg;
        if (eff === 'paper' && !IS_ASURA && root.dataset.mdTheme === 'dark') eff = 'dark';
        if (eff === 'paper' && !IS_ASURA) delete root.dataset.mdBg; else root.dataset.mdBg = eff;
    }
    function applyBg(name) {
        reader.bg = BGS.includes(name) ? name : 'paper';
        store.set('bg', reader.bg);
        paintBg();
    }
    function cycleBg() {
        const dark = !IS_ASURA && root.dataset.mdTheme === 'dark';
        const list = dark ? ['dark', 'black'] : BGS;
        const cur = dark && reader.bg === 'paper' ? 'dark' : reader.bg;
        applyBg(list[(list.indexOf(cur) + 1) % list.length]);
        toast('Background: ' + reader.bg);
    }

    // images are served from two mirrors; swap every page to the other one
    const MIRRORS = [['demoniclibs.com', 'librarydm.com'], ['librarydm.com', 'demoniclibs.com']];
    const swapMirror = url => { for (const [a, b] of MIRRORS) if (url.includes(a)) return url.replace(a, b); return url; };
    function switchMirror() {
        pageImages().forEach(img => { img.src = swapMirror(img.src); });
        toast('Switched image mirror');
    }

    /* ---------- .cbz export (ZIP "store", no compression: pages are already compressed) ---------- */

    const CRC_T = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(u8) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function makeZip(entries) {                       // entries: [{ name, data: Uint8Array }]
        const enc = new TextEncoder();
        const d = new Date();
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const parts = [], central = [];
        let offset = 0, cdSize = 0;
        for (const e of entries) {
            const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
            lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
            lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
            parts.push(lh.buffer, name, e.data);

            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
            ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
            ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
            ch.setUint32(42, offset, true);
            central.push(ch.buffer, name);
            offset += 30 + name.length + size;
            cdSize += 46 + name.length;
        }
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
        end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
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
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'webp';
    }

    const getGM = () =>
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
            : (typeof GM !== 'undefined' && GM.xmlHttpRequest ? GM.xmlHttpRequest.bind(GM) : null);

    // GM_xmlhttpRequest is used because the image CDN does not send CORS headers
    function fetchBuf(url, ctl) {
        return new Promise((resolve, reject) => {
            if (ctl.cancelled) return reject(new Error('cancelled'));
            const gm = getGM();
            if (!gm) {
                const ac = new AbortController();
                ctl.aborts.add(() => ac.abort());
                return fetch(url, { credentials: 'omit', signal: ac.signal })
                    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(resolve, reject);
            }
            const h = gm({
                method: 'GET', url, responseType: 'arraybuffer', timeout: 60000,
                headers: { Referer: ctl.referer || location.origin + '/' },
                onload: r => (r.status >= 200 && r.status < 300 && r.response) ? resolve(r.response) : reject(new Error('HTTP ' + r.status)),
                onerror: () => reject(new Error('network error')),
                ontimeout: () => reject(new Error('timeout')),
                onabort: () => reject(new Error('cancelled')),
            });
            ctl.aborts.add(() => { try { h && h.abort && h.abort(); } catch (e) { /* ignore */ } });
        });
    }

    async function fetchPage(url, ctl) {
        const tries = [url, swapMirror(url), url];
        let err;
        for (let i = 0; i < tries.length; i++) {
            try { return new Uint8Array(await fetchBuf(tries[i], ctl)); }
            catch (e) { err = e; if (ctl.cancelled) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
        }
        throw err;
    }

    const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    const safeName = s => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

    /* ---- PDF writer: one page per image, JPEG data embedded as-is, a bookmark per chapter ---- */
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
    async function toJpegPart(u8) {                      // -> { blob, w, h, gray } (blob keeps the bytes off the JS heap)
        const inf = jpegInfo(u8);
        if (inf && (inf.comps === 1 || inf.comps === 3) && inf.w && inf.h) return { blob: new Blob([u8]), w: inf.w, h: inf.h, gray: inf.comps === 1 };
        const bmp = await createImageBitmap(new Blob([u8]));
        const k = Math.min(1, 16000 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
        const W = c.width, H = c.height;                  // (a closed ImageBitmap reports 0x0)
        if (bmp.close) bmp.close();
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
        if (!blob) throw new Error('could not convert a page');
        c.width = c.height = 1;
        return { blob, w: W, h: H, gray: false };
    }
    function buildPdf(chapters, title) {                 // chapters: [{ label, imgs: [{blob,w,h,gray}] }]
        const enc = new TextEncoder(), parts = [], offs = [];
        let off = 0;
        const w = x => { parts.push(x); off += x.size !== undefined ? x.size : x.length; };
        const ws = s => w(enc.encode(s));
        const hex16 = s => { let o = '<FEFF'; for (let i = 0; i < s.length; i++) o += s.charCodeAt(i).toString(16).padStart(4, '0'); return o + '>'; };
        ws('%PDF-1.4\n%âãÏÓ\n');
        let id = 4;                                      // 1 catalog, 2 pages, 3 outline root
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

    async function buildCbz(ctx, onProgress, ctl) {
        const srcs = ctx.srcs || pageImages().map(i => i.currentSrc || i.src);
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

    function packCbz(ctx, out, srcs) {
        if (ctx.raw) return { raw: true, pages: out, srcs, label: ctx.label || 'Chapter ' + ctx.num, num: ctx.num, series: ctx.series };
        const total = srcs.length;
        const width = Math.max(3, String(total).length);
        const entries = out.map((data, i) => ({ name: String(i + 1).padStart(width, '0') + '.' + sniffExt(data, srcs[i]), data }));
        const info =
            '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n' +
            `  <Title>${xmlEsc(ctx.label || 'Chapter ' + ctx.num)}</Title>\n  <Series>${xmlEsc(ctx.series)}</Series>\n` +
            (ctx.num ? `  <Number>${xmlEsc(ctx.num)}</Number>\n` : '') +
            `  <Web>${xmlEsc(ctx.url || location.href)}</Web>\n  <PageCount>${total}</PageCount>\n  <LanguageISO>en</LanguageISO>\n</ComicInfo>\n`;
        entries.push({ name: 'ComicInfo.xml', data: new TextEncoder().encode(info) });

        // "<Series> - Chapter 012.cbz": Mihon reads the chapter number from the name, and zero-padding keeps files sorted
        const [whole, frac] = (ctx.num || '0').split('.');
        const filename = `${safeName(ctx.series)} - Chapter ${whole.padStart(3, '0')}${frac ? '.' + frac : ''}.cbz`;
        return { blob: makeZip(entries), filename };
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
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
        if (reader.job) { reader.job.cancelled = true; reader.job.aborts.forEach(f => f()); return; }   // second click = cancel
        const ctl = reader.job = { cancelled: false, aborts: new Set() };
        const ctx = chapterContext();
        setDl('busy', '0/' + pageImages().length, 0);
        try {
            const { blob, filename } = await buildCbz(ctx, (n, t) => setDl('busy', `${n}/${t}`, Math.round(n / t * 100)), ctl);
            saveBlob(blob, filename);
            setDl('done', 'Saved');
            toast('Saved ' + filename, 3500);
        } catch (e) {
            if (ctl.cancelled) { setDl('idle', 'CBZ'); toast('Download cancelled'); }
            else { setDl('error', 'Retry'); toast('Download failed: ' + e.message, 4500); }
        } finally {
            reader.job = null;
            if (reader.dl && reader.dl.dataset.state === 'done') setTimeout(() => { if (!reader.job) setDl('idle', 'CBZ'); }, 3000);
        }
    }

    /* ---------- prev/next, dock, keys ---------- */

    function navButtons(ctx) {
        $$('.chapters-nav').forEach(nav => {
            if (nav.dataset.mdNav) return;
            const sel = $('select', nav);
            if (!sel) return;
            nav.dataset.mdNav = '1';
            const mk = (cls, label, href) => {
                const a = document.createElement('a');
                a.className = 'md-nav ' + cls;
                a.innerHTML = label;
                if (href) a.href = href; else a.setAttribute('aria-disabled', 'true');
                return a;
            };
            nav.insertBefore(mk('md-prevchap', ICON.prev + '<span>Prev</span>', ctx.prev), sel);
            nav.appendChild(mk('md-nextchap', '<span>Next</span>' + ICON.next, ctx.next));
        });
    }

    function buildDock(ctx) {
        if (reader.dock) return;
        const d = reader.dock = document.createElement('div');
        d.id = 'md-dock';
        const btn = (act, icon, title, label) =>
            `<button type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon}${label ? `<span class="md-lbl">${label}</span>` : ''}</button>`;
        d.innerHTML =
            btn('prev', ICON.prev, 'Previous chapter (←)') + btn('next', ICON.next, 'Next chapter (→)') +
            '<span class="md-sep"></span>' +
            btn('zoom-out', ICON.minus, 'Zoom out (-)') +
            '<button type="button" class="md-zoom" data-act="zoom-reset" title="Reset zoom (0)" aria-label="Reset zoom">100%</button>' +
            btn('zoom-in', ICON.plus, 'Zoom in (+)') +
            '<span class="md-sep"></span>' +
            btn('bg', ICON.bg, 'Background colour (B)') +
            (IS_ASURA ? btn('series', ICON.list, 'Back to the series page') : btn('mirror', ICON.refresh, 'Images not loading? Switch mirror')) +
            '<button type="button" class="md-dl" data-act="download"></button>' +
            btn('top', ICON.up, 'Back to top');
        document.body.appendChild(d);

        reader.dl = $('.md-dl', d);
        setDl('idle', 'CBZ');
        $('[data-act="prev"]', d).disabled = !ctx.prev;
        $('[data-act="next"]', d).disabled = !ctx.next;

        d.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            switch (b.dataset.act) {
                case 'prev': location.href = ctx.prev; break;
                case 'next': location.href = ctx.next; break;
                case 'zoom-out': stepZoom(-1); break;
                case 'zoom-in': stepZoom(1); break;
                case 'zoom-reset': applyZoom(1); break;
                case 'bg': cycleBg(); break;
                case 'mirror': switchMirror(); break;
                case 'series': location.href = ctx.seriesUrl; break;
                case 'download': toggleDownload(); break;
                case 'top': scrollTo({ top: 0, behavior: 'smooth' }); break;
            }
        });

        // hidden until you tap the page (see readerChrome); stays open while a download is running
        readerChrome(d, () => !!reader.job);

        addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const a = document.activeElement;
            if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
            if (e.key === 'ArrowLeft' && ctx.prev) location.href = ctx.prev;       // (DemonicScans already handles →)
            else if (e.key === 'ArrowRight' && IS_ASURA && ctx.next) location.href = ctx.next;
            else if (e.key === '-' || e.key === '_') stepZoom(-1);
            else if (e.key === '+' || e.key === '=') stepZoom(1);
            else if (e.key === '0') applyZoom(1);
            else if (e.key === 'b' || e.key === 'B') cycleBg();
        });
    }

    function setupReader() {
        const ctx = chapterContext();
        if (!reader.init) {
            reader.init = true;
            applyBg(store.get('bg', IS_ASURA ? 'black' : 'paper'));
            applyZoom(store.get('zoom', 1));
        }
        if (!IS_ASURA) navButtons(ctx);
        buildDock(ctx);
    }

    /* ====================================================================
     *  COMIC <-> NOVEL SWITCH
     * ==================================================================== */
    function setupModeToggle() {
        if (!document.body) return;
        const toN = root.dataset.mdMode !== 'novels';
        let b = document.getElementById('md-mode');
        if (!b) { b = document.createElement('a'); b.id = 'md-mode'; document.body.appendChild(b); }
        if (!b.__scroll) {                      // slides away while reading down, like the dock
            b.__scroll = true; let last = scrollY;
            addEventListener('scroll', () => {
                const y = scrollY, dy = y - last;
                if (Math.abs(dy) < 8) return;
                b.classList.toggle('hide', dy > 0 && y > 240);
                last = y;
            }, { passive: true });
        }
        if (b.dataset.to === (toN ? 'novels' : 'comics')) return;
        b.dataset.to = toN ? 'novels' : 'comics';
        b.href = toN ? (IS_ASURA ? '/novels' : '/lastnvupdates.php') : (IS_ASURA ? '/comics' : '/');
        b.title = toN ? 'Switch to the novel site' : 'Back to the comic site';
        b.setAttribute('aria-label', b.title);
        b.innerHTML = (toN ? ICON.book : ICON.comic) +
            `<span class="md-mode-t"><small>${toN ? 'Switch to' : 'Back to'}</small><b>${toN ? 'Novels' : 'Comics'}</b></span>`;
    }

    /* ====================================================================
     *  NOVEL READER  (works on Asura's NovelReader island; falls back to "the biggest block of <p>" elsewhere)
     * ==================================================================== */
    const NR_DEF = { theme: 'paper', font: 'serif', size: 19, lh: 1.8, ps: 0.9, w: 66, ta: 'left', ls: 0, indent: false, sep: false, speed: 60 };
    const NR_THEMES = {
        paper: { bg: '#f7f3e8', fg: '#1c1a17', name: 'Paper' }, white: { bg: '#ffffff', fg: '#111111', name: 'White' },
        sepia: { bg: '#f0e2c4', fg: '#3a2c18', name: 'Sepia' }, mint: { bg: '#dcefe3', fg: '#10281b', name: 'Mint' },
        dusk: { bg: '#2b2a33', fg: '#e4e0d8', name: 'Dusk' }, black: { bg: '#000000', fg: '#c8c8c8', name: 'Black' },
    };
    const NR_FONTS = {
        serif: ["'Lora', Georgia, serif", 'Serif'], sans: ["'DM Sans', system-ui, sans-serif", 'Sans'],
        mono: ["'JetBrains Mono', ui-monospace, monospace", 'Mono'], easy: ["'Atkinson Hyperlegible', 'DM Sans', sans-serif", 'Easy-read'],
    };
    const NR_SLIDERS = [
        ['size', 'Size', 13, 36, 1, v => v + 'px'], ['lh', 'Line gap', 1.2, 2.6, 0.05, v => (+v).toFixed(2)],
        ['ps', 'Paragraphs', 0, 2.2, 0.1, v => (+v).toFixed(1) + 'em'], ['w', 'Width', 36, 120, 2, v => v + 'ch'],
        ['ls', 'Letters', 0, 0.12, 0.01, v => (+v).toFixed(2) + 'em'], ['speed', 'Auto-scroll', 10, 260, 5, v => v + 'px/s'],
    ];
    const nr = { s: null, dock: null, panel: null, ctx: null, auto: false };

    function nrLoad() { nr.s = Object.assign({}, NR_DEF, store.get('nr', {})); if (!NR_THEMES[nr.s.theme]) nr.s.theme = 'paper'; if (!NR_FONTS[nr.s.font]) nr.s.font = 'serif'; }
    function nrApply() {
        const s = nr.s, t = NR_THEMES[s.theme], st = root.style;
        root.dataset.mdNr = '1'; root.dataset.mdNsep = s.sep ? 'on' : 'off'; root.dataset.mdNth = s.theme;
        st.setProperty('--nr-bg', t.bg); st.setProperty('--nr-fg', t.fg); st.setProperty('--nr-ff', NR_FONTS[s.font][0]);
        st.setProperty('--nr-fs', s.size + 'px'); st.setProperty('--nr-lh', s.lh); st.setProperty('--nr-ps', s.ps + 'em');
        st.setProperty('--nr-w', s.w + 'ch'); st.setProperty('--nr-ta', s.ta); st.setProperty('--nr-ls', s.ls + 'em');
        st.setProperty('--nr-ti', s.indent ? '1.6em' : '0');
        nrSyncPanel();
    }
    function nrSet(patch) { Object.assign(nr.s, patch); store.set('nr', nr.s); nrApply(); }

    function findNovelText() {
        const sums = new Map();
        $$('p').forEach(p => {
            if (p.closest('#comments-section, #cw-comments, header, footer, nav, #md-np, #md-dock')) return;
            const el = p.parentElement; sums.set(el, (sums.get(el) || 0) + p.textContent.length);
        });
        let best = null, len = 0;
        sums.forEach((l, el) => { if (l > len) { best = el; len = l; } });
        if (best && len > 300) return best;
        // no <p> markup: descend from <body> into the child that still holds most of the text
        let cur = document.body;
        for (let guard = 0; guard < 25 && cur; guard++) {
            const total = cur.textContent.length;
            const kid = [...cur.children].filter(c => !/^(SCRIPT|STYLE|NAV|HEADER|FOOTER)$/.test(c.tagName) && !c.matches('#comments-section, #cw-comments, #md-np, #md-dock, #md-mode'))
                .sort((a, b) => b.textContent.length - a.textContent.length)[0];
            if (!kid || kid.textContent.length < total * 0.8) break;
            cur = kid;
        }
        return cur && cur !== document.body && cur.textContent.length > 1500 ? cur : null;
    }
    function markNovelText() {
        const el = findNovelText();
        if (!el) return null;
        if (!el.hasAttribute('data-md-ntext')) {
            $$('[data-md-ntext],[data-md-nanc]').forEach(x => { x.removeAttribute('data-md-ntext'); x.removeAttribute('data-md-nanc'); });
            el.setAttribute('data-md-ntext', '');
            for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) a.setAttribute('data-md-nanc', '');
        }
        return el;
    }

    function novelContext() {
        if (IS_ASURA) {
            const el = $('astro-island[component-url*="NovelReader"]'), p = el && astroProps(el);
            if (p && p.novelSlug) {
                const nums = (p.chapters || []).map(c => +c.number).sort((a, b) => a - b), i = nums.indexOf(+p.chapterNumber);
                const base = '/novels/' + p.novelSlug + '/chapter/';
                return {
                    series: String(p.novelTitle || document.title), label: 'Chapter ' + p.chapterNumber, title: p.chapterTitle || '',
                    prev: i > 0 ? base + nums[i - 1] : null, next: i >= 0 && i < nums.length - 1 ? base + nums[i + 1] : null,
                    seriesUrl: '/novels/' + p.novelSlug,
                };
            }
            return { series: document.title, label: '', title: '', prev: null, next: null, seriesUrl: '/novels' };
        }
        const c = chapterContext(), a = $('.chapter-info h1 a');
        return { series: c.series, label: c.label, title: c.label, prev: c.prev, next: c.next, seriesUrl: a ? a.href : '/lastnvupdates.php' };
    }

    function nrDownloadTxt() {
        const el = $('[data-md-ntext]');
        if (!el) return toast('Chapter text not found');
        const paras = $$('p', el).map(p => p.textContent.trim()).filter(Boolean);
        const body = (paras.length ? paras : el.innerText.split(/\n+/)).filter(l => !/^=+$/.test(l)).join('\n\n');
        const c = nr.ctx || novelContext();
        const head = [c.series, c.label + (c.title && !/^Chapter/i.test(c.title) ? ' - ' + c.title : '')].filter(Boolean).join('\n') + '\n\n';
        const name = (c.series + ' - ' + (c.label || 'chapter')).replace(/[\\/:*?"<>|]+/g, '_').trim() + '.txt';
        saveBlob(new Blob([head + body + '\n'], { type: 'text/plain;charset=utf-8' }), name);
        toast('Saved ' + name);
    }

    function nrToggleAuto(on) {
        nr.auto = on === undefined ? !nr.auto : on;
        const b = nr.dock && $('[data-act="auto"]', nr.dock);
        if (b) { b.dataset.on = nr.auto ? '1' : '0'; b.innerHTML = (nr.auto ? ICON.pause : ICON.play) + '<span class="md-lbl">' + (nr.auto ? 'Stop' : 'Scroll') + '</span>'; }
        if (!nr.auto) return;
        let last = performance.now(), acc = 0;
        const tick = t => {
            if (!nr.auto) return;
            acc += nr.s.speed * Math.min(0.1, (t - last) / 1000); last = t;
            const step = Math.floor(acc);
            if (step) { acc -= step; window.scrollBy({ top: step, behavior: 'instant' }); }
            if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return nrToggleAuto(false);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    function nrSyncPanel() {
        const p = nr.panel;
        if (!p) return;
        const s = nr.s;
        $$('[data-np="theme"]', p).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === s.theme)));
        $$('[data-np="font"]', p).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === s.font)));
        $$('[data-np="ta"]', p).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === s.ta)));
        $('[data-np="indent"]', p).setAttribute('aria-pressed', String(s.indent));
        $('[data-np="sep"]', p).setAttribute('aria-pressed', String(s.sep));
        NR_SLIDERS.forEach(([k, , , , , fmt]) => {
            const r = $(`[data-np-r="${k}"]`, p), o = $(`[data-np-o="${k}"]`, p);
            if (r && document.activeElement !== r) r.value = s[k];
            if (o) o.textContent = fmt(s[k]);
        });
    }

    function buildNovelPanel() {
        if (nr.panel) return;
        const p = nr.panel = document.createElement('div');
        p.id = 'md-np';
        p.innerHTML =
            '<div class="np-h"><span>Reading settings</span><button type="button" data-np="close" aria-label="Close">&times;</button></div>' +
            '<div class="np-r"><span>Theme</span><div class="np-sw">' +
            Object.entries(NR_THEMES).map(([k, t]) => `<button type="button" data-np="theme" data-v="${k}" title="${t.name}" style="--sb:${t.bg};--sf:${t.fg}">Aa</button>`).join('') + '</div></div>' +
            '<div class="np-r"><span>Font</span><div class="np-ch">' +
            Object.entries(NR_FONTS).map(([k, f]) => `<button type="button" data-np="font" data-v="${k}" style="font-family:${f[0]} !important">${f[1]}</button>`).join('') + '</div></div>' +
            NR_SLIDERS.map(([k, label, min, max, step]) =>
                `<label class="np-r"><span>${label}</span><input type="range" data-np-r="${k}" min="${min}" max="${max}" step="${step}"><output data-np-o="${k}"></output></label>`).join('') +
            '<div class="np-r"><span>Align</span><div class="np-ch"><button type="button" data-np="ta" data-v="left">Left</button><button type="button" data-np="ta" data-v="justify">Justify</button>' +
            '<button type="button" data-np="indent">Indent</button><button type="button" data-np="sep">Show ===== rule</button></div></div>' +
            '<div class="np-r"><span></span><div class="np-ch"><button type="button" data-np="reset">Reset to defaults</button></div></div>';
        document.body.appendChild(p);
        p.addEventListener('input', e => {
            const r = e.target.closest('[data-np-r]');
            if (r) nrSet({ [r.dataset.npR]: +r.value });
        });
        p.addEventListener('click', e => {
            const b = e.target.closest('[data-np]');
            if (!b) return;
            const v = b.dataset.v;
            switch (b.dataset.np) {
                case 'close': p.classList.remove('open'); break;
                case 'theme': nrSet({ theme: v }); break;
                case 'font': nrSet({ font: v }); break;
                case 'ta': nrSet({ ta: v }); break;
                case 'indent': nrSet({ indent: !nr.s.indent }); break;
                case 'sep': nrSet({ sep: !nr.s.sep }); break;
                case 'reset': nr.s = Object.assign({}, NR_DEF); store.set('nr', nr.s); nrApply(); break;
            }
        });
        document.addEventListener('pointerdown', e => {
            if (p.classList.contains('open') && !e.target.closest('#md-np, #md-dock')) p.classList.remove('open');
        }, true);
    }

    function nrCycleTheme() {
        const keys = Object.keys(NR_THEMES);
        nrSet({ theme: keys[(keys.indexOf(nr.s.theme) + 1) % keys.length] });
        toast('Theme: ' + NR_THEMES[nr.s.theme].name);
    }

    function setupNovelReader() {
        if (!document.body) return;
        const el = markNovelText();
        if (!nr.s) {
            nrLoad();
            const l = document.createElement('link');
            l.id = 'md-fonts-nr'; l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=Atkinson+Hyperlegible:wght@400;700&display=swap';
            (document.head || root).appendChild(l);
        }
        if (!el) return;                       // text not rendered yet; the next pass will retry
        nrApply();
        if (nr.dock) return;
        nr.ctx = novelContext();
        const ctx = nr.ctx;
        buildNovelPanel();
        const d = nr.dock = document.createElement('div');
        d.id = 'md-dock';
        const btn = (act, icon, title, label) => `<button type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon}${label ? `<span class="md-lbl">${label}</span>` : ''}</button>`;
        d.innerHTML =
            btn('prev', ICON.prev, 'Previous chapter (←)') + btn('next', ICON.next, 'Next chapter (→)') + '<span class="md-sep"></span>' +
            btn('smaller', ICON.minus, 'Smaller text ([)') + btn('bigger', ICON.plus, 'Bigger text (])') + btn('panel', ICON.aa, 'Reading settings', 'Aa') +
            btn('theme', ICON.bg, 'Cycle theme (T)') + '<span class="md-sep"></span>' +
            btn('auto', ICON.play, 'Auto-scroll', 'Scroll') + btn('txt', ICON.down, 'Save this chapter as .txt', '.txt') +
            btn('series', ICON.list, 'Back to the series page') + btn('top', ICON.up, 'Back to top');
        document.body.appendChild(d);
        $('[data-act="prev"]', d).disabled = !ctx.prev;
        $('[data-act="next"]', d).disabled = !ctx.next;
        d.addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            switch (b.dataset.act) {
                case 'prev': location.href = ctx.prev; break;
                case 'next': location.href = ctx.next; break;
                case 'smaller': nrSet({ size: Math.max(13, nr.s.size - 1) }); break;
                case 'bigger': nrSet({ size: Math.min(36, nr.s.size + 1) }); break;
                case 'panel': nr.panel.classList.toggle('open'); break;
                case 'theme': nrCycleTheme(); break;
                case 'auto': nrToggleAuto(); break;
                case 'txt': nrDownloadTxt(); break;
                case 'series': location.href = ctx.seriesUrl; break;
                case 'top': scrollTo({ top: 0, behavior: 'smooth' }); break;
            }
        });
        // hidden until you tap the page (see readerChrome); stays open during auto-scroll or while the settings panel is open
        readerChrome(d, () => nr.auto || nr.panel.classList.contains('open'));
        ['wheel', 'touchstart'].forEach(t => addEventListener(t, () => { if (nr.auto) nrToggleAuto(false); }, { passive: true }));
        addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const a = document.activeElement;
            if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
            if (nr.auto && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) nrToggleAuto(false);
            if (e.key === 'ArrowLeft' && ctx.prev) location.href = ctx.prev;
            else if (e.key === 'ArrowRight' && ctx.next) location.href = ctx.next;
            else if (e.key === '[') nrSet({ size: Math.max(13, nr.s.size - 1) });
            else if (e.key === ']') nrSet({ size: Math.min(36, nr.s.size + 1) });
            else if (e.key === 't' || e.key === 'T') nrCycleTheme();
            else if (e.key === 'Escape') nr.panel.classList.remove('open');
        });
        nrToggleAuto(false);
        nrSyncPanel();
    }

    /* ====================================================================
     *  ASURA: early-access countdown on locked chapters, "download all", novel .epub
     * ==================================================================== */
    let LOCKS = {};
    const pad2 = n => String(n).padStart(2, '0');
    const fmtCd = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 3600) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60); };
    const chapNum = a => ((a.getAttribute('href') || '').match(/\/chapter\/([\d.]+)/) || [])[1];

    const lockKey = a => PAGE() === 'overview' ? chapNum(a) : (a.pathname || '').replace(/\/+$/, '');
    const lockCache = new WeakMap();
    function lockMap(host, keyOf) {
        const raw = host.getAttribute('props') || '', hit = lockCache.get(host);
        if (hit && hit.raw === raw) return hit.map;
        const map = {}, p = astroProps(host);
        ((p && p.chapters) || []).forEach(c => { const t = Date.parse(c.early_access_until); if (t > 0) map[keyOf(c)] = t; });
        lockCache.set(host, { raw, map });
        return map;
    }
    function markLocks() {
        if (!IS_ASURA) return;
        const page = PAGE();
        if (page !== 'overview' && page !== 'list') return;
        const hosts = page === 'overview' ? [SEL_ASURA.host()].filter(Boolean) : $$('astro-island[component-url*="LatestUpdates"]');
        const keyOf = page === 'overview' ? c => String(c.number) : c => (c.comic_public_url || '') + '/chapter/' + c.number;
        LOCKS = {};
        hosts.forEach(h => { const m = lockMap(h, keyOf); for (const k in m) if (m[k] > Date.now() + 500) LOCKS[k] = m[k]; });
        hosts.forEach(host => $$('a[href*="/chapter/"]', host).forEach(a => {
            const until = LOCKS[lockKey(a)];
            let cd = a.querySelector(':scope > .md-cd');
            if (until) {
                a.dataset.mdLocked = until;
                if (!cd) { cd = document.createElement('span'); cd.className = 'md-cd'; cd.innerHTML = ICON.lock + '<b></b>'; a.appendChild(cd); }
                $('b', cd).textContent = fmtCd(until - Date.now());
            } else { a.removeAttribute('data-md-locked'); if (cd) cd.remove(); }
        }));
        if (!markLocks.timer) markLocks.timer = setInterval(tickLocks, 1000);
    }
    function tickLocks() {
        $$('a[data-md-locked]').forEach(a => {
            const left = +a.dataset.mdLocked - Date.now();
            if (left <= 0) { a.removeAttribute('data-md-locked'); const cd = a.querySelector(':scope > .md-cd'); if (cd) cd.remove(); delete LOCKS[lockKey(a)]; return; }
            const b = a.querySelector(':scope > .md-cd b'); if (b) b.textContent = fmtCd(left);
        });
        const m = $('#md-lock');
        if (m) {
            const left = +m.dataset.until - Date.now();
            if (left <= 0 && !m.dataset.open) {
                m.dataset.open = '1';
                $('.md-lock-card', m).innerHTML = `<div class="md-lock-ic">${ICON.check}</div><h3>Chapter ${m.dataset.num} is unlocked</h3><a class="md-lock-go" href="${m.dataset.href}">Open chapter</a><button type="button" data-lock="close">Close</button>`;
            } else if (left > 0) $('.md-lock-t', m).textContent = fmtCd(left);
        }
    }
    function showLock(num, until, href) {
        const old = $('#md-lock'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'md-lock'; m.dataset.until = until; m.dataset.num = num; m.dataset.href = href;
        m.innerHTML = `<div class="md-lock-card" role="dialog" aria-modal="true"><div class="md-lock-ic">${ICON.lock}</div><h3>Chapter ${xmlEsc(num)} is locked</h3>` +
            `<p>It opens up for everyone in</p><div class="md-lock-t">${fmtCd(until - Date.now())}</div><p class="md-lock-s">Keep this tab open: the chapter unlocks here by itself.</p><button type="button" data-lock="close">Got it</button></div>`;
        m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-lock="close"]')) m.remove(); });
        document.body.appendChild(m);
    }
    ['click', 'auxclick'].forEach(ev => document.addEventListener(ev, e => {
        if (!IS_ASURA || !e.target.closest) return;
        const pg = PAGE();
        if (pg === 'overview') {
            const dl = e.target.closest('[data-series-download]');
            if (dl) {
                e.preventDefault(); e.stopImmediatePropagation();
                const bar = $('#md-sel-bar'); if (bar && bar.__all) bar.__all();
                return;
            }
        }
        if (pg !== 'overview' && pg !== 'list') return;
        const a = e.target.closest('a[href*="/chapter/"]');
        const until = a && LOCKS[lockKey(a)];
        if (!until || until <= Date.now()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (ev === 'click') showLock(chapNum(a), until, a.href);
    }, true));
    addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('#md-lock'); if (m) m.remove(); } });

    // the site puts the list comma inside each genre pill ("Action, ") - drop it, the pills are separated by spacing
    function tidyBadges() {
        $$('a[href^="/browse?genres"]').forEach(a => {
            const n = a.lastChild;
            if (n && n.nodeType === 3 && /,\s*$/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/,\s*$/, '');
        });
    }
    function tidyDownloadAll() {
        $$('[data-series-download] span.truncate').forEach(s => { if (s.textContent !== 'Read Offline (.pdf)') s.textContent = 'Read Offline (.pdf)'; });
    }

    /* ---- novel .epub (every unlocked chapter) ---- */
    function paraXhtml(html) {
        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        const ps = $$('p', doc).map(p => p.textContent.replace(/\s+/g, ' ').trim()).filter(t => t && !/^=+$/.test(t));
        return ps.map(t => '<p>' + xmlEsc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>') + '</p>').join('\n');
    }
    async function coverJpeg(url, ctl) {
        try {
            const buf = new Uint8Array(await fetchBuf(url, ctl));
            const ext = sniffExt(buf, url);
            if (ext === 'jpg' || ext === 'png') return { data: buf, ext, mime: ext === 'jpg' ? 'image/jpeg' : 'image/png' };
            const bmp = await createImageBitmap(new Blob([buf]));
            const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d').drawImage(bmp, 0, 0);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
            return { data: new Uint8Array(await blob.arrayBuffer()), ext: 'jpg', mime: 'image/jpeg' };
        } catch (e) { console.warn('[MD] cover', e); return null; }
    }
    function makeEpub(meta, chapters, cover) {
        const enc = s => new TextEncoder().encode(s);
        const id = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
        const X = '<?xml version="1.0" encoding="utf-8"?>\n';
        const files = [];
        const add = (name, text) => files.push({ name, data: typeof text === 'string' ? enc(text) : text });
        add('mimetype', 'application/epub+zip');
        add('META-INF/container.xml', X + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
        add('OEBPS/style.css', 'body{font-family:serif;line-height:1.55;margin:0 4%}h1,h2{text-align:center;margin:1.2em 0 .8em}p{margin:0 0 .85em;text-align:left}.t{text-align:center;margin-top:20%}.t img{max-width:80%;max-height:70vh}');
        const xh = (title, body) => X + `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
        add('OEBPS/title.xhtml', xh(meta.title, `<div class="t">${cover ? '<img src="cover.' + cover.ext + '" alt="Cover"/>' : ''}<h1>${xmlEsc(meta.title)}</h1><p style="text-align:center">${xmlEsc(meta.source)}</p></div>`));
        if (cover) add('OEBPS/cover.' + cover.ext, cover.data);
        const items = chapters.map((c, i) => ({ id: 'c' + i, href: 'c' + String(c.num).replace(/\D+/g, '_').padStart(4, '0') + '.xhtml', title: c.title, num: c.num, body: c.body }));
        items.forEach(c => add('OEBPS/' + c.href, xh(c.title, `<h2>${xmlEsc(c.title)}</h2>\n${c.body}`)));
        add('OEBPS/nav.xhtml', X + `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${items.map(c => `<li><a href="${c.href}">${xmlEsc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`);
        add('OEBPS/toc.ncx', X + `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${xmlEsc(meta.title)}</text></docTitle><navMap>${items.map((c, i) => `<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${xmlEsc(c.title)}</text></navLabel><content src="${c.href}"/></navPoint>`).join('')}</navMap></ncx>`);
        add('OEBPS/content.opf', X + `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${xmlEsc(meta.title)}</dc:title><dc:language>en</dc:language><dc:creator>${xmlEsc(meta.source)}</dc:creator>${meta.desc ? `<dc:description>${xmlEsc(meta.desc)}</dc:description>` : ''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover ? '<meta name="cover" content="cover-img"/>' : ''}</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>${cover ? `<item id="cover-img" href="cover.${cover.ext}" media-type="${cover.mime}" properties="cover-image"/>` : ''}${items.map(c => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine toc="ncx"><itemref idref="title"/>${items.map(c => `<itemref idref="${c.id}"/>`).join('')}</spine></package>`);
        const blob = makeZip(files);
        return new Blob([blob], { type: 'application/epub+zip' });
    }

    function setupNovelOverview() {
        const host = $('astro-island[component-url*="NovelChapterList"]');
        if (!host || $('#md-epub-bar')) return;
        const props = astroProps(host) || {};
        const all = (props.chapters || []).slice().sort((a, b) => a.number - b.number);
        const free = all.filter(c => c.free);
        const bar = document.createElement('div');
        bar.id = 'md-epub-bar';
        bar.innerHTML = `<button type="button" id="md-epub"${free.length ? '' : ' disabled'}>Read Offline (.epub)</button><span class="md-epub-note">${free.length} unlocked chapter${free.length === 1 ? '' : 's'}${all.length > free.length ? ' · ' + (all.length - free.length) + ' locked (skipped)' : ''}</span>`;
        host.parentNode.insertBefore(bar, host);
        const btn = $('#md-epub', bar), note = $('.md-epub-note', bar);
        let job = null;
        btn.addEventListener('click', async () => {
            if (job) { job.cancelled = true; job.aborts.forEach(f => f()); return; }
            if (!free.length) return;
            const ctl = job = { cancelled: false, aborts: new Set(), referer: location.href };
            btn.dataset.state = 'busy'; btn.style.setProperty('--p', '0%');
            const title = ($('h1') || {}).textContent ? $('h1').textContent.trim() : (props.novelSlug || 'Novel');
            const done = [], failed = [];
            let k = 0, finished = 0;
            const worker = async () => {
                while (k < free.length && !ctl.cancelled) {
                    const c = free[k++];
                    let ok = false;
                    for (let t = 1; t <= 3 && !ok && !ctl.cancelled; t++) {
                        try {
                            const r = await fetch(`/novels/${props.novelSlug}/chapter/${c.number}`, { credentials: 'include' });
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
                            const isl = doc.querySelector('astro-island[component-url*="NovelReader"]'), p = isl && astroProps(isl);
                            if (!p || p.isLocked) throw new Error('locked');
                            const body = paraXhtml([].concat(p.paragraphs || []).join('\n'));
                            if (!body) throw new Error('empty');
                            done.push({ num: c.number, title: 'Chapter ' + c.number + (c.title ? ' - ' + c.title : ''), body }); ok = true;
                        } catch (e) { if (e.message === 'locked') break; await new Promise(r => setTimeout(r, 800 * t)); }
                    }
                    if (!ok && !ctl.cancelled) failed.push(c.number);
                    finished++;
                    btn.style.setProperty('--p', Math.round(finished / free.length * 100) + '%');
                    btn.textContent = `Chapter ${finished}/${free.length} · Cancel`;
                }
            };
            try {
                note.textContent = '';
                await Promise.all(Array.from({ length: 4 }, worker));
                if (ctl.cancelled) { toast('Download cancelled'); return; }
                if (!done.length) { toast('Nothing could be fetched', 4500); return; }
                btn.textContent = 'Packing…';
                done.sort((a, b) => a.num - b.num);
                const coverUrl = ($('img[src*="/covers/"]') || {}).src || '';
                const cover = coverUrl ? await coverJpeg(coverUrl, ctl) : null;
                const desc = (($('#description-text') || $('meta[name="description"]') || {}).textContent || ($('meta[name="description"]') || {}).content || '').trim();
                const blob = makeEpub({ title, source: 'Asura Scans', desc }, done, cover);
                saveBlob(blob, `${safeName(title)} (${done.length} chapters).epub`);
                toast(failed.length ? `Saved .epub; ${failed.length} chapter(s) failed: ${failed.slice(0, 8).join(', ')}` : 'Saved .epub', failed.length ? 6500 : 3500);
                if (failed.length) note.textContent = 'Failed: chapter ' + failed.join(', ') + ' - press again to retry';
            } catch (e) { console.warn('[MD] epub', e); toast('.epub failed: ' + e.message, 5000); }
            finally { job = null; btn.dataset.state = ''; btn.style.removeProperty('--p'); btn.textContent = 'Read Offline (.epub)'; }
        });
    }

    /* ====================================================================
     *  DEMONICSCANS: comments (Top + hide short), dark circle favicon
     * ==================================================================== */
    let cwSortDone = false, cwSortTries = 0;
    function commentsTweaks() {
        const cw = document.getElementById('cw-comments');
        if (!cw) return;
        if (CONFIG.topComments && !cwSortDone && cw.dataset.ready === '1') {
            const best = cw.querySelector('.sort-tabs button[data-sort="best"]');
            if (best) {
                if (best.getAttribute('aria-pressed') === 'true') cwSortDone = true;
                else if (cwSortTries++ < 6) best.click();
            }
        }
        // hide (never delete) so the widget's paging keeps working; replies are processed before their parents
        const all = [...cw.querySelectorAll('#cw-list .cw-comment')].reverse();
        for (const a of all) {
            const t = a.querySelector(':scope > .comment-main .cw-text');
            if (!t) continue;
            const words = (t.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().split(/\s+/).filter(Boolean).length;
            const spoiler = !!t.querySelector('.cw-spoiler');
            const image = !!t.querySelector('img');
            const short = words <= CONFIG.maxCommentWords && !spoiler && !(CONFIG.keepImageComments && image);
            const liveReplies = [...a.querySelectorAll('.cw-comment')].some(r => !r.hasAttribute('data-mdx-hide'));
            a.removeAttribute('data-mdx-hide');
            a.removeAttribute('data-mdx-main');
            // a short comment with longer replies only loses its own text, the replies stay
            if (short) a.setAttribute(liveReplies ? 'data-mdx-main' : 'data-mdx-hide', '1');
        }
    }

    let faviconDone = false;
    function faviconOnce() {
        if (faviconDone || !document.head) return;
        faviconDone = true;
        const img = new Image();
        img.onload = () => {
            try {
                const S = 128, c = document.createElement('canvas');
                c.width = c.height = S;
                const x = c.getContext('2d');
                x.fillStyle = '#161616';
                x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
                const box = S * 0.68, r = Math.min(box / img.width, box / img.height), w = img.width * r, h = img.height * r;
                x.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
                const url = c.toDataURL('image/png');
                $$('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(l => l.remove());
                ['icon', 'apple-touch-icon'].forEach(rel => {
                    const l = document.createElement('link');
                    l.rel = rel; l.type = 'image/png'; l.href = url;
                    document.head.appendChild(l);
                });
            } catch (e) { faviconDone = false; }
        };
        img.src = '/img/logo.png';
    }

    /* ====================================================================
     *  READER CHROME (both sites, comic + novel readers):
     *  dock hidden until you tap the page; header hides while reading down
     * ==================================================================== */
    const TAP_IGNORE = 'a, button, input, select, textarea, label, summary, details, dialog, iframe, [role="button"], ' +
        '#md-dock, #md-np, #md-mode, #md-toast, #md-lock, #md-scrim, #md-bg, #menu, #forced-Search, ' +
        '#cw-comments, #comments-section, nav, header';

    function headerAutoHide() {
        if (!CONFIG.readerHeaderAutoHide) return;
        let last = scrollY;
        addEventListener('scroll', () => {
            const y = scrollY, dy = y - last;
            if (Math.abs(dy) < 6) return;
            last = y;
            const nav = $('body > nav, body > header, header.asura-site-header');
            const busy = (nav && nav.contains(document.activeElement)) || menuOpen();
            if (busy || y < 80 || dy < 0) delete root.dataset.mdNavhide; else root.dataset.mdNavhide = '1';
        }, { passive: true });
    }

    function readerChrome(dock, busy) {
        const tapMode = CONFIG.readerDockOnTap;
        const isBusy = () => !!(busy && busy());
        const shown = () => !dock.classList.contains('hide');
        let openY = scrollY, last = scrollY;
        const show = on => { dock.classList.toggle('hide', !on); if (on) openY = scrollY; };

        if (tapMode) {
            dock.classList.add('hide');
            document.addEventListener('click', e => {
                if (e.button !== 0) return;
                const t = e.target;
                if (!(t instanceof Element) || t.closest(TAP_IGNORE)) return;
                const sel = getSelection();
                if (sel && !sel.isCollapsed && String(sel).trim()) return;      // selecting text, not tapping
                show(!shown());
            }, true);
            addEventListener('keydown', e => { if (e.key === 'Escape' && shown() && !isBusy()) show(false); });
            if (!store.get('tapHint', false)) {
                store.set('tapHint', true);
                setTimeout(() => toast('Tap the page to show the reader tools', 3500), 900);
            }
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

        if (!readerChrome.nav) { readerChrome.nav = true; headerAutoHide(); }
    }

    /* ====================================================================
     *  DARK MODE SWITCH (header, top right, both sites)
     *  The light skin is inverted with CSS (see extraCss); media are flipped back.
     * ==================================================================== */
    function setTheme(t, save = true) {
        root.dataset.mdTheme = t;
        if (save) store.set('theme', t);
        const b = document.getElementById('md-theme');
        if (b) {
            b.setAttribute('aria-checked', String(t === 'dark'));
            b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            b.setAttribute('aria-label', b.title);
        }
        try { if (reader.init) paintBg(); } catch (e) { /* no reader on this page */ }
    }

    // where the switch lives: far right of the header (DemonicScans: next to the search box, Asura: next to its search button)
    function themeSlot() {
        if (IS_ASURA) {
            const d = $('header.asura-site-header .asura-desktop-block');       // right cluster: [search][switch][bookmarks]...
            if (d && d.parentElement) return { parent: d.parentElement, before: d.nextSibling };
            const s = $('header.asura-site-header astro-island[component-url*="SearchBar"]');
            if (s && s.parentElement) return { parent: s.parentElement, before: s.nextSibling };
            const h = $('header.asura-site-header');
            return h ? { parent: h, before: null } : null;
        }
        const right = $('body > nav .innav > .flex:last-child');
        return right ? { parent: right, before: null } : null;
    }

    function setupThemeToggle() {
        if (!document.body) return;
        let b = document.getElementById('md-theme');
        if (!b) {
            b = document.createElement('button');
            b.id = 'md-theme'; b.type = 'button'; b.setAttribute('role', 'switch');
            const icons = `<span class="md-th-sun">${ICON.sun}</span><span class="md-th-moon">${ICON.moon}</span>`;
            b.innerHTML = `<span class="md-th-i">${icons}</span><span class="md-th-sw"><span class="md-th-knob">${icons}</span></span>`;
            b.addEventListener('click', e => {
                setTheme(root.dataset.mdTheme === 'dark' ? 'light' : 'dark');
                if (e.detail > 0) b.blur();            // mouse/touch: don't keep the header "busy" for the auto-hide
            });
            setTheme(root.dataset.mdTheme, false);
        }
        const slot = themeSlot();
        if (slot) {
            if (b.parentNode !== slot.parent) slot.parent.insertBefore(b, slot.before && slot.before.parentNode === slot.parent ? slot.before : null);
        } else if (!b.isConnected) document.body.appendChild(b);
    }

    /* ====================================================================
     *  EXTRAS
     * ==================================================================== */
    function addExtras() {
        if (CONFIG.backToTop && !document.getElementById('md-top')) {
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

    // "/" focuses the search box
    addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const a = document.activeElement;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
        const input = $('#header-search-input') || $('body > nav input') || $('input[type="search"]');
        if (input) { e.preventDefault(); input.focus(); input.select(); }
    });

    /* ====================================================================
     *  RUN LOOP
     * ==================================================================== */
    injectStyles();

    function runAsura() {
        injectStyles();
        if (!document.body) return;
        root.dataset.mdPage = detectPage();
        try {
            const page = PAGE();
            if (page === 'overview') { markLocks(); tidyDownloadAll(); setupSelect(null, SEL_ASURA); }
            else if (page === 'list') markLocks();
            else if (page === 'noverview') setupNovelOverview();
            else if (page === 'chapter') setupReader();
            else if (page === 'nchapter') setupNovelReader();
            tidyBadges();
            root.dataset.mdMode = detectMode();
            $$('main h2').forEach(h => {      // comic side: novel teaser sections are replaced by the novel switch
                if (root.dataset.mdMode === 'novels') return;
                if (!/^\s*(trending |latest |popular |new )?novels?\b/i.test(h.textContent)) return;
                const t = h.closest('astro-island') || h.closest('section');
                if (t) t.setAttribute('data-md-hide', '');
            });
            setupThemeToggle();
            addExtras(); setupModeToggle();
            const bar = $('#md-sel-bar');
            if (bar && bar.__sync) bar.__sync();
        } catch (e) { console.warn('[MD] asura', e); }
    }

    function run() {
        if (IS_ASURA) return runAsura();
        injectStyles();
        if (!document.body) return;
        refinePage();
        try { nukeAnnoyances(); } catch (e) { console.warn('[MD] nuke', e); }
        try { setupChrome(); } catch (e) { console.warn('[MD] chrome', e); }
        try { setupThemeToggle(); } catch (e) { console.warn('[MD] theme', e); }
        try { commentsTweaks(); faviconOnce(); } catch (e) { console.warn('[MD] extras', e); }
        try {
            const page = PAGE();
            if (page === 'list') { removeNovels(); organize(); autoplayHero(); }
            else if (page === 'overview') setupOverview();
            else if (page === 'chapter') (isNovelChapter() ? setupNovelReader : setupReader)();
            addExtras(); setupModeToggle();
        } catch (e) { console.warn('[MD] page', e); }
    }

    let timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(run, 150);
    }

    addEventListener('DOMContentLoaded', schedule);
    addEventListener('load', schedule);
    new MutationObserver(muts => {
        // ignore our own widgets (progress text updates etc.) so they don't re-trigger a full pass
        if (muts.every(m => { const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; return el && el.closest('#md-dock, #md-toast, #md-scrim, #md-sel-bar'); })) return;
        schedule();
    }).observe(root, { childList: true, subtree: true });
})();