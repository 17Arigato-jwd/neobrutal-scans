// ==UserScript==
// @name         Comix Neobrutalism + De-bloat
// @namespace    https://github.com/17Arigato-jwd/neobrutal-scans
// @version      2026-11-20.1
// @description  A high-contrast Comix skin with a featured carousel, local reading history, reader tools, and CBZ / batch ZIP export.
// @author       17Arigato-jwd
// @homepageURL  https://github.com/17Arigato-jwd/neobrutal-scans
// @supportURL   https://github.com/17Arigato-jwd/neobrutal-scans/issues
// @updateURL    https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js
// @downloadURL  https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js
// @license      MIT
// @match        https://comix.to/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

/*
 * ZIP writer adapted from Neobrutal Scans.
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

function startNeobrutalComix() {
    'use strict';

    const CONFIG = {
        maxWidth: 1360,
        themeDefault: 'system',
        heroAutoplay: true,
        hidePromotions: true,
        historyLimit: 16,
        downloadConcurrency: 4,
        batchLimit: 20,
    };
    const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

    const root = document.documentElement;
    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
    const prefersDark = matchMedia('(prefers-color-scheme: dark)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function readSetting(name, fallback) {
        try {
            return JSON.parse(localStorage.getItem('nb-comix:' + name)) ?? fallback;
        } catch {
            return fallback;
        }
    }

    function writeSetting(name, value) {
        try { localStorage.setItem('nb-comix:' + name, JSON.stringify(value)); } catch {}
    }

    let theme = readSetting('theme', CONFIG.themeDefault);

    function applyTheme() {
        const dark = theme === 'dark' || (theme !== 'light' && prefersDark.matches);
        root.dataset.nbComix = dark ? 'dark' : 'light';
        themeButton.setAttribute('aria-checked', String(dark));
    }

    function element(tag, className = '', text = '') {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function button(label, click, className = 'nb-button') {
        const node = element('button', className, label);
        node.type = 'button';
        node.addEventListener('click', click);
        return node;
    }

    function link(label, href, className) {
        const node = element('a', className, label);
        node.href = href;
        return node;
    }

    function parseUrl(value, base = location.href) {
        if (!value) return null;
        try { return new URL(value, base); } catch { return null; }
    }

    const SERIES_PATH = /^\/title\/[^/]+\/?$/;
    const CHAPTER_PATH = /^(\/title\/[^/]+)\/(\d+)-chapter-([^/]+)\/?$/;
    const READER_PAGES = '.rpage-main .rpage-page[data-page]';
    const PROMOTIONS = [
        '#app-root a:is(.home-banner, .rpage-chap-ending__banner)[rel~="sponsored"]',
        '#app-root .social-share',
        '#app-root .pwa-banner',
    ];

    function route(value, pattern) {
        const url = parseUrl(value);
        return url?.origin === location.origin && pattern.test(url.pathname) ? url : null;
    }

    function imageUrl(value, base = location.href) {
        const url = parseUrl(value, base);
        return url?.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    }

    const themeButton = button('', () => {
        theme = root.dataset.nbComix === 'dark' ? 'light' : 'dark';
        writeSetting('theme', theme);
        applyTheme();
    }, 'nb-theme');
    themeButton.title = 'Toggle Neobrutal Comix dark mode';
    themeButton.setAttribute('role', 'switch');
    themeButton.setAttribute('aria-label', 'Neobrutal Comix dark mode');
    themeButton.append(element('span', 'nb-theme-knob'));
    applyTheme();
    prefersDark.addEventListener('change', applyTheme);

    const css = element('style');
    css.textContent = `
        html[data-nb-comix] {
            --nb-bg:#fff8e9; --nb-bg-rgb:255 248 233;
            --nb-surface:#fffdf6; --nb-surface-rgb:255 253 246;
            --nb-raised:#f5ead4; --nb-raised-rgb:245 234 212;
            --nb-ink:#211827; --nb-ink-rgb:33 24 39;
            --nb-muted:#5d505f; --nb-muted-rgb:93 80 95;
            --nb-line:#261a31; --nb-shadow:#261a31;
            --nb-accent:#813bb5; --nb-accent-rgb:129 59 181;
            --nb-key:#e7cfff; --nb-hit:#d7f984; --nb-grid:#271c3210;
            color-scheme:light !important;
        }
        html[data-nb-comix="dark"] {
            --nb-bg:#17121f; --nb-bg-rgb:23 18 31;
            --nb-surface:#2a2135; --nb-surface-rgb:42 33 53;
            --nb-raised:#392c49; --nb-raised-rgb:57 44 73;
            --nb-ink:#fff6e8; --nb-ink-rgb:255 246 232;
            --nb-muted:#dbcbe1; --nb-muted-rgb:219 203 225;
            --nb-line:#765e91; --nb-shadow:#09070d;
            --nb-accent:#deb7ff; --nb-accent-rgb:222 183 255;
            --nb-key:#533473; --nb-hit:#d7f984; --nb-grid:#f0cbff0c;
            color-scheme:dark !important;
        }
        html[data-nb-comix] {
            --bg:var(--nb-bg) !important; --bg-rgb:var(--nb-bg-rgb) !important;
            --bg-2:var(--nb-raised) !important; --bg-2-rgb:var(--nb-raised-rgb) !important;
            --surface:var(--nb-surface) !important; --surface-rgb:var(--nb-surface-rgb) !important;
            --surface-2:var(--nb-raised) !important; --surface-2-rgb:var(--nb-raised-rgb) !important;
            --surface-3:var(--nb-raised) !important; --surface-3-rgb:var(--nb-raised-rgb) !important;
            --text:var(--nb-ink) !important; --text-rgb:var(--nb-ink-rgb) !important;
            --text-emphasis:var(--nb-ink) !important; --text-emphasis-rgb:var(--nb-ink-rgb) !important;
            --text-2:var(--nb-muted) !important; --text-2-rgb:var(--nb-muted-rgb) !important;
            --text-3:var(--nb-muted) !important; --text-3-rgb:var(--nb-muted-rgb) !important;
            --text-4:var(--nb-muted) !important; --text-4-rgb:var(--nb-muted-rgb) !important;
            --accent:var(--nb-accent) !important; --accent-rgb:var(--nb-accent-rgb) !important;
            --accent-2:var(--nb-accent) !important; --accent-2-rgb:var(--nb-accent-rgb) !important;
            --accent-ink:var(--nb-surface) !important;
            --border:var(--nb-line) !important; --border-2:var(--nb-line) !important;
            --container:${CONFIG.maxWidth}px !important;
            --f-sans:"Poppins", system-ui, sans-serif;
            --nb-mono:"JetBrains Mono", ui-monospace, monospace;
            --nb-outline:2px solid var(--nb-line);
            --nb-hard-shadow:4px 4px 0 var(--nb-shadow);
        }
        html[data-nb-comix] body:not(.rpage-body) {
            background-color:var(--nb-bg);
            background-image:radial-gradient(var(--nb-grid) 1px,transparent 1px);
            background-size:16px 16px;
        }
        ${CONFIG.hidePromotions ? PROMOTIONS.join(',') + '{display:none!important}' : ''}
        html[data-nb-comix] .topnav {
            background:var(--nb-key);
            border-bottom:var(--nb-outline);
            box-shadow:0 3px 0 var(--nb-shadow);
        }
        html[data-nb-comix] .search__form {
            border:var(--nb-outline); border-radius:8px; box-shadow:2px 2px 0 var(--nb-shadow);
        }
        html[data-nb-comix] .topnav .login-btn { white-space:nowrap; }
        html[data-nb-comix] .layout--top .main-col > :not(:first-child) { margin-top:24px; }
        html[data-nb-comix] .section__title, html[data-nb-comix] .mpage__sec-title {
            color:var(--nb-ink); font-family:var(--f-sans); font-weight:900;
            letter-spacing:-.045em; font-size:clamp(1.18rem,2.5vw,1.75rem);
        }
        html[data-nb-comix] .section__title-wrap {
            border-left:5px solid var(--nb-accent); padding-left:10px;
        }
        html[data-nb-comix] :is(.card__poster-wrap .poster,.lrow__poster .poster,.mpage__poster .poster) {
            aspect-ratio:2/3 !important; border:var(--nb-outline);
            border-radius:8px; box-shadow:3px 3px 0 var(--nb-shadow);
        }
        html[data-nb-comix] .card { padding:2px 5px 7px 2px; }
        html[data-nb-comix] .card__title {
            color:var(--nb-ink); font-weight:800; display:-webkit-box;
            -webkit-box-orient:vertical; -webkit-line-clamp:2;
            overflow:hidden; white-space:normal; line-height:1.3; min-height:2.6em;
        }
        html[data-nb-comix] .card__meta { font-family:var(--nb-mono); font-weight:650; }
        html[data-nb-comix] :is(.nav-btn,.filter-action,.npager__num,.mpage__read,.mchap-toolbar .ubtn) {
            border:var(--nb-outline); border-radius:7px; box-shadow:2px 2px 0 var(--nb-shadow);
        }
        html[data-nb-comix] .mpage__read {
            background:var(--nb-hit); color:#24152d;
        }
        html[data-nb-comix] :is(.lrow,.filter-grid,.mpage__hero,.mchap-toolbar,.announce) {
            background:var(--nb-surface); border:var(--nb-outline);
            border-radius:9px; box-shadow:var(--nb-hard-shadow);
        }
        html[data-nb-comix] .lrow { padding:12px; margin-bottom:8px; }
        html[data-nb-comix] .filter-grid { padding:12px; }
        html[data-nb-comix] .mpage__hero { padding:clamp(14px,3vw,30px); margin:6px 5px 24px 0; }
        html[data-nb-comix] .mpage__title { font-weight:900; letter-spacing:-.045em; }
        html[data-nb-comix] .mchap-toolbar { padding:8px; }
        html[data-nb-comix] .mchap-row { border-bottom:1px solid var(--nb-line); }
        html[data-nb-comix] .mchap-item[data-nb-selected] { background:var(--nb-key); }
        html[data-nb-comix] :is(.nb-button,.nb-theme):focus-visible,
        html[data-nb-comix] .nb-hero a:focus-visible, html[data-nb-comix] .nb-history a:focus-visible {
            outline:3px solid var(--nb-accent); outline-offset:3px;
        }

        .nb-button, .nb-theme {
            box-sizing:border-box; border:var(--nb-outline); border-radius:7px;
            box-shadow:2px 2px 0 var(--nb-shadow); cursor:pointer; color:var(--nb-ink);
            background:var(--nb-surface); min-height:36px; font:750 .78rem var(--f-sans);
        }
        .nb-button {
            display:inline-flex; justify-content:center; align-items:center;
            padding:5px 10px; text-decoration:none; line-height:1.2;
        }
        .nb-button:active, .nb-theme:active { transform:translate(2px,2px); box-shadow:none; }
        .nb-button:disabled { opacity:.55; cursor:default; }
        .nb-button-primary { background:var(--nb-hit); color:#211827; }
        .nb-theme { position:relative; width:39px; min-height:24px; padding:0; flex:none; }
        .nb-theme-knob {
            position:absolute; top:3px; left:3px; width:14px; height:14px;
            border:1px solid var(--nb-line); border-radius:50%; background:#ffc25b;
            transition:transform .18s ease,background-color .18s ease;
        }
        .nb-theme[aria-checked="true"] .nb-theme-knob { transform:translateX(15px); background:#d7b7ff; }

        .nb-hero {
            margin:0 6px 0 0; position:relative; isolation:isolate; overflow:hidden;
            display:grid; grid-template-columns:minmax(0,1fr) minmax(112px,32%); align-items:center;
            border:var(--nb-outline); border-radius:12px; background:#322247; color:#fff9ee;
            box-shadow:6px 6px 0 var(--nb-shadow);
        }
        .nb-hero::before, .nb-hero::after {
            content:""; position:absolute; inset:0; pointer-events:none; z-index:-1;
        }
        .nb-hero::before {
            background:var(--nb-hero-image,none) center 42% / cover;
            filter:blur(14px); opacity:.45; transform:scale(1.08);
        }
        .nb-hero::after { background:linear-gradient(97deg,#22142f 3%,#36214bde 62%,#3921514d); }
        .nb-hero-body { min-width:0; padding:clamp(14px,4vw,40px); }
        .nb-hero-title {
            color:inherit; margin:0 0 8px; font-size:clamp(1.35rem,4.1vw,3.6rem);
            font-weight:900; letter-spacing:-.055em; line-height:1.03;
            display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;
            height:2.06em; overflow:hidden; overflow-wrap:anywhere;
        }
        .nb-hero-title a { color:inherit; text-decoration:none; }
        .nb-hero-meta { color:#f4dfeb; font:650 .73rem var(--nb-mono); margin:0 0 14px; min-height:1.2em; }
        .nb-hero-actions { display:flex; flex-wrap:wrap; gap:8px; }
        .nb-hero .nb-button { --nb-line:#170e23; --nb-shadow:#170e23; }
        .nb-hero-art {
            display:block; justify-self:center; width:min(74%,194px); margin-top:12px;
            border:3px solid #140d1e; border-radius:9px; background:#50356b;
            aspect-ratio:2/3; box-shadow:7px 7px 0 #140d1e; transform:rotate(7deg);
            transition:transform .18s ease;
        }
        .nb-hero-art:hover, .nb-hero-art:focus-visible { transform:rotate(3deg); }
        .nb-hero-art img, .nb-history-card img, .nb-thumb img {
            width:100%; height:100%; display:block; object-fit:cover; border-radius:inherit;
        }
        .nb-thumbs { display:flex; gap:8px; overflow-x:auto; padding:4px 3px; margin:12px -3px -3px; }
        .nb-thumb {
            position:relative; flex:0 0 36px; aspect-ratio:2/3; padding:0; overflow:hidden;
            border:2px solid #170e23; border-radius:4px; background:#50356b; cursor:pointer;
        }
        .nb-thumb[aria-pressed="true"] { border-color:#d7f984; }
        .nb-thumb::after {
            content:""; position:absolute; inset:0; background:#d7f98444;
            transform:scaleY(0); transform-origin:top; pointer-events:none;
        }
        .nb-hero[data-playing] .nb-thumb[aria-pressed="true"]::after { animation:nb-fill 5.5s linear forwards; }
        @keyframes nb-fill { to { transform:scaleY(1); } }

        .nb-history { margin:0 5px 0 0; }
        .nb-history-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
        .nb-history-track {
            display:grid; grid-auto-flow:column; grid-auto-columns:minmax(190px,1fr);
            gap:10px; overflow-x:auto; padding:3px 5px 7px 1px;
        }
        .nb-history-card {
            display:grid; grid-template-columns:42px minmax(0,1fr); gap:9px; align-items:center;
            min-width:0; color:var(--nb-ink); background:var(--nb-surface);
            border:var(--nb-outline); border-radius:8px; box-shadow:3px 3px 0 var(--nb-shadow);
            padding:7px; text-decoration:none;
        }
        .nb-history-card img { aspect-ratio:2/3; height:auto; border-radius:4px; }
        .nb-history-cover { background:var(--nb-key); border-radius:4px; aspect-ratio:2/3; }
        .nb-history-title { font-weight:850; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .nb-history-label { display:block; font:650 .72rem var(--nb-mono); color:var(--nb-muted); margin-top:3px; }

        html[data-nb-comix] .rpage { --reader-bg:var(--nb-reader-bg,var(--nb-bg)); }
        html[data-nb-comix] .rpage-main { background:var(--reader-bg); }
        html[data-nb-comix] :is(.rpage-floatctl__btn,.rpage-floatctl__chap,.rpage-zoom,.rpage-chap-ending__nav-btn) {
            border:var(--nb-outline); border-radius:7px;
        }
        .nb-reader {
            position:fixed; z-index:90; left:max(12px,env(safe-area-inset-left));
            bottom:max(12px,env(safe-area-inset-bottom)); max-width:calc(100vw - 26px);
            color:var(--nb-ink); font-family:var(--f-sans);
        }
        .nb-reader-box, .nb-batch {
            background:var(--nb-surface); border:var(--nb-outline);
            border-radius:8px; box-shadow:var(--nb-hard-shadow); padding:9px;
        }
        .nb-reader-box { margin-bottom:8px; max-width:330px; }
        .nb-reader-actions, .nb-batch {
            display:flex; align-items:center; flex-wrap:wrap; gap:7px;
        }
        .nb-reader-box[hidden], .nb-batch [hidden] { display:none !important; }
        .nb-status { font:650 .72rem var(--nb-mono); color:var(--nb-muted); overflow-wrap:anywhere; }
        .nb-reader-box .nb-status { margin:6px 0 0; }
        .nb-batch { margin:0 4px 10px 0; }
        .nb-chapter-check { width:18px; height:18px; margin:0 8px; align-self:center; accent-color:var(--nb-accent); }
        .nb-frame {
            opacity:0; pointer-events:none; position:fixed; z-index:-1;
            inset:0; width:100vw; height:100vh; border:0;
        }
        @media(max-width:680px) {
            .nb-theme { width:34px; }
            .nb-theme[aria-checked="true"] .nb-theme-knob { transform:translateX(10px); }
            .nb-hero { grid-template-columns:minmax(0,1fr) minmax(92px,28%); }
            .nb-hero-title { height:3.09em; -webkit-line-clamp:3; }
            .nb-hero-art { width:83%; transform:rotate(5deg); box-shadow:4px 4px 0 #140d1e; }
            .nb-thumb { flex-basis:30px; }
            .nb-history-track { grid-auto-columns:minmax(150px,43%); }
        }
        @media(max-width:390px) {
            html[data-nb-comix] .topnav .logo { width:6.2rem; }
            html[data-nb-comix] .topnav .login-btn { padding-inline:7px; }
        }
        @media(prefers-reduced-motion:reduce) {
            .nb-hero *, .nb-theme-knob { animation:none !important; transition:none !important; }
        }
    `;
    (document.head || root).append(css);

    let heroState = null;

    function mountHero(column) {
        const cards = $$('.section .card[href]', column);
        const seen = new Set();
        const items = [];
        for (const card of cards) {
            const url = route(card.href, SERIES_PATH);
            const title = $('.card__title', card)?.textContent.trim();
            const img = $('.card__poster-wrap img', card);
            const cover = imageUrl(img?.getAttribute('src')) || imageUrl(img?.currentSrc);
            if (!url || !title || !cover || seen.has(url.pathname)) continue;
            seen.add(url.pathname);
            items.push({ url: url.pathname, title, cover, meta: $('.card__ch', card)?.textContent.trim() || '' });
            if (items.length === 7) break;
        }
        if (!items.length) return;

        const hero = element('section', 'nb-hero');
        hero.setAttribute('aria-label', 'Featured comics');
        const body = element('div', 'nb-hero-body');
        const heading = element('h2', 'nb-hero-title');
        const title = link('', items[0].url);
        heading.append(title);
        const meta = element('p', 'nb-hero-meta');
        const art = link('', items[0].url, 'nb-hero-art');
        const cover = element('img');
        cover.alt = '';
        art.append(cover);
        const actions = element('div', 'nb-hero-actions');
        const details = link('View series', items[0].url, 'nb-button nb-button-primary');
        actions.append(details);
        const thumbs = element('div', 'nb-thumbs');
        let index = 0;
        let timer;
        let automatic = CONFIG.heroAutoplay && !reducedMotion.matches;
        let hover = false;
        const pause = button('', () => {
            automatic = !automatic;
            updatePlayback();
        });

        function updatePlayback() {
            clearTimeout(timer);
            hero.removeAttribute('data-playing');
            pause.textContent = automatic ? 'Pause' : 'Play';
            if (!automatic || hover || hero.contains(document.activeElement) || document.hidden || items.length < 2) return;
            // Restart the thumbnail animation even when resuming the same slide.
            void thumbs.offsetWidth;
            hero.setAttribute('data-playing', '');
            timer = setTimeout(() => select((index + 1) % items.length), 5500);
        }

        function select(next) {
            index = next;
            const item = items[index];
            title.textContent = item.title;
            title.href = art.href = details.href = item.url;
            art.setAttribute('aria-label', item.title);
            cover.src = item.cover;
            meta.textContent = item.meta.replace(/^Ch\.?\s*/i, 'Chapter ');
            hero.style.setProperty('--nb-hero-image', 'url(' + JSON.stringify(item.cover) + ')');
            [...thumbs.children].forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === index)));
            const active = thumbs.children[index];
            if (active) {
                thumbs.scrollTo({
                    left: active.offsetLeft - thumbs.children[0].offsetLeft - (thumbs.clientWidth - active.offsetWidth) / 2,
                    behavior: reducedMotion.matches ? 'instant' : 'smooth',
                });
            }
            updatePlayback();
        }

        if (items.length > 1) {
            actions.append(pause);
            items.forEach((item, i) => {
                const thumb = button('', () => select(i), 'nb-thumb');
                thumb.setAttribute('aria-label', item.title);
                const img = element('img');
                img.src = item.cover;
                img.alt = '';
                thumb.append(img);
                thumbs.append(thumb);
            });
        }
        body.append(heading, meta, actions, thumbs);
        hero.append(body, art);
        column.prepend(hero);
        hero.addEventListener('mouseenter', () => { hover = true; updatePlayback(); });
        hero.addEventListener('mouseleave', () => { hover = false; updatePlayback(); });
        hero.addEventListener('focusin', updatePlayback);
        hero.addEventListener('focusout', () => queueMicrotask(updatePlayback));
        document.addEventListener('visibilitychange', updatePlayback);
        heroState = {
            node: hero,
            dispose() {
                clearTimeout(timer);
                document.removeEventListener('visibilitychange', updatePlayback);
                hero.remove();
            },
        };
        select(0);
    }

    let historyNode;
    let lastTracked;

    function historyItems() {
        const stored = readSetting('history', []);
        if (!Array.isArray(stored)) return [];
        return stored.filter(item => item && typeof item.title === 'string' && route(item.url, CHAPTER_PATH));
    }

    function mountHistory(column) {
        if (historyNode?.isConnected) return;
        const items = historyItems();
        if (!items.length) return;
        const section = element('section', 'nb-history');
        const header = element('div', 'nb-history-heading');
        const track = element('div', 'nb-history-track');
        const clear = button('Clear history', () => {
            if (!confirm('Clear your Neobrutal Comix reading history?')) return;
            writeSetting('history', []);
            section.remove();
        });
        header.append(element('h2', 'section__title', 'Continue reading'), clear);
        items.forEach(item => {
            const page = Number.isInteger(item.page) && item.page > 1 ? item.page : 0;
            const card = link('', item.url + (page ? '#page=' + page : ''), 'nb-history-card');
            const art = element('span', 'nb-history-cover');
            const cover = imageUrl(item.cover);
            if (cover) {
                const img = element('img');
                img.src = cover;
                img.alt = '';
                img.loading = 'lazy';
                art.append(img);
            }
            const copy = element('span');
            copy.append(element('span', 'nb-history-title', item.title),
                element('span', 'nb-history-label', item.label + (page ? ' · Page ' + page : '')));
            card.append(art, copy);
            track.append(card);
        });
        section.append(header, track);
        if (heroState?.node.isConnected) heroState.node.after(section);
        else column.prepend(section);
        historyNode = section;
    }

    let docDataNode;
    let docData;

    function initialData() {
        const node = $('#initial-data');
        if (!node) return null;
        if (node !== docDataNode || !docData) {
            docDataNode = node;
            try { docData = JSON.parse(node.textContent); } catch { docData = null; }
        }
        return docData;
    }

    function chapterContext(url, doc = document) {
        const parsed = route(url, CHAPTER_PATH);
        if (!parsed) return null;
        const [, seriesPath, id, slug] = parsed.pathname.match(CHAPTER_PATH);
        const data = doc === document ? initialData() : null;
        const matchingData = String(data?.read?.chapterId) === id ? data : null;
        const manga = Object.values(matchingData?.queries || {}).find(x => route(x?.url, SERIES_PATH)?.pathname === seriesPath);
        const series = $('.rpage-chap-ending__title', doc)?.textContent.trim() || manga?.title;
        if (!series) return null;
        const number = matchingData?.read?.chapterNumber ?? slug.match(/^\d+(?:\.\d+)?/)?.[0];
        const label = $('.rpage-floatctl__chap .mono', doc)?.textContent.trim();
        return {
            id, seriesPath, series, number, url: parsed.pathname,
            cover: manga?.poster?.medium || $('meta[property="og:image"]', doc)?.content,
            label: label && !label.includes('undefined') ? label.replace(/^Ch\.?\s*/i, 'Chapter ') : 'Chapter ' + (number ?? slug),
        };
    }

    function trackReading(context) {
        const items = historyItems();
        const old = items.find(item => item.seriesPath === context.seriesPath);
        if (lastTracked === context.url && old?.cover) return;
        const page = old?.url === context.url ? old.page : undefined;
        items.unshift({
            url: context.url, title: context.series, seriesPath: context.seriesPath,
            label: context.label, page, cover: imageUrl(context.cover) || imageUrl(old?.cover),
        });
        writeSetting('history', items.filter((item, i) => !i || item.seriesPath !== context.seriesPath).slice(0, CONFIG.historyLimit));
        lastTracked = context.url;
    }

    let progressTimer;

    function scheduleProgress() {
        if (!lastTracked || !CHAPTER_PATH.test(location.pathname) || progressTimer) return;
        progressTimer = setTimeout(() => {
            progressTimer = null;
            if (lastTracked !== location.pathname) return;
            const segment = $('.rpage-progress__seg.is-active');
            const page = Number(segment?.getAttribute('aria-label')?.match(/\d+$/)?.[0]);
            if (!Number.isInteger(page) || page < 1) return;
            const items = historyItems();
            const entry = items.find(item => item.url === lastTracked);
            if (entry && entry.page !== page) {
                entry.page = page;
                writeSetting('history', items);
            }
        }, 250);
    }

    // Store ZIP entries without recompressing already compressed page images.
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

    function xml(value) {
        return String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
    }

    function safeName(value) {
        return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 110).trim().replace(/[. ]+$/, '') || 'Comix';
    }

    function storeDownload(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = link('', objectUrl);
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }

    function gmImage(url, signal) {
        return new Promise((resolve, reject) => {
            signal.throwIfAborted();
            let request;
            const abort = () => {
                request?.abort?.();
                finish(reject, signal.reason);
            };
            const finish = (callback, value) => {
                signal.removeEventListener('abort', abort);
                callback(value);
            };
            request = GM_xmlhttpRequest({
                method: 'GET', url, anonymous: true, responseType: 'arraybuffer', timeout: 20000,
                onload: result => {
                    if (result.status >= 200 && result.status < 300 && result.response) finish(resolve, result.response);
                    else finish(reject, new Error('Image HTTP ' + result.status));
                },
                onerror: () => finish(reject, new Error('The image host could not be reached.')),
                ontimeout: () => finish(reject, new Error('The image request timed out.')),
                onabort: () => finish(reject, signal.reason || new Error('The image request was interrupted.')),
            });
            signal.addEventListener('abort', abort, { once: true });
        });
    }

    async function fetchImage(url, signal) {
        if (new URL(url).origin !== location.origin && typeof GM_xmlhttpRequest === 'function') {
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

        const frame = element('iframe', 'nb-frame');
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

            const reader = await waitFor(() => {
                const current = $('.rpage', doc);
                return current && (readerPages(doc).length || $('.rpage-progress__seg', current)) && current;
            }, signal, 20000, 'Comix did not make any chapter pages available.');
            const vertical = reader.classList.contains('rpage--long-strip');
            const jumps = $$('.rpage-progress__seg', reader);
            const pages = vertical ? stripPages(doc) : null;
            const total = vertical ? pages?.length : jumps.length;
            if (!total) {
                throw new Error('Enable the Comix page progress bar or switch to Top to bottom, then retry.');
            }

            const sources = [];
            for (let index = 0; index < total; index++) {
                signal.throwIfAborted();
                const currentPage = () => vertical ? pages[index] : $(READER_PAGES + '[data-page="' + (index + 1) + '"]', doc);
                const currentSource = () => {
                    const current = currentPage();
                    return current && pageSource(current);
                };
                let src = currentSource();
                if (!src) {
                    feedback('Finding page ' + (index + 1) + ' of ' + total + '…');
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

    async function chapterArchive(context, feedback, controller) {
        const { signal } = controller;
        feedback('Opening ' + context.label + '…');
        const sources = await listPageSources(context, feedback, signal);
        const pages = new Array(sources.length);
        let next = 0;
        let done = 0;
        let size = 0;

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
                feedback('Downloading pages ' + (++done) + '/' + sources.length + '…');
            }
        }

        try {
            await Promise.all(Array.from({ length: Math.min(sources.length, CONFIG.downloadConcurrency) }, worker));
        } catch (error) {
            controller.abort(error);
            throw error;
        }
        signal.throwIfAborted();
        pages.push({
            name: 'ComicInfo.xml',
            data: new TextEncoder().encode(
                '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo>\n' +
                '  <Title>' + xml(context.label) + '</Title>\n  <Series>' + xml(context.series) + '</Series>\n' +
                (context.number == null ? '' : '  <Number>' + xml(context.number) + '</Number>\n') +
                '  <Web>' + xml(location.origin + context.url) + '</Web>\n' +
                '  <PageCount>' + sources.length + '</PageCount>\n</ComicInfo>\n'
            ),
        });
        return { filename: safeName(context.series) + ' - ' + safeName(context.label) + '.cbz', blob: makeZip(pages) };
    }

    let job;
    const CANCELLED = new DOMException('Export cancelled', 'AbortError');

    async function startExport(control, status, idleLabel, exportArchive) {
        if (job) {
            if (job.control === control) job.controller.abort(CANCELLED);
            return;
        }
        const active = { control, controller: new AbortController() };
        job = active;
        control.textContent = 'Cancel export';
        control.disabled = false;
        const report = message => { if (job === active) status.textContent = message; };
        try {
            const result = await exportArchive(report, active.controller);
            active.controller.signal.throwIfAborted();
            storeDownload(result.blob, result.filename);
            report('Download ready.');
        } catch (error) {
            report(error === CANCELLED ? 'Export cancelled.' : (error.message || 'Export failed.'));
        } finally {
            control.textContent = idleLabel;
            if (job === active) job = null;
            schedule();
        }
    }

    let readerTools;
    const backgrounds = { Theme: '', Paper: '#fff7e9', Charcoal: '#25212b', Black: '#000' };

    function applyReaderBackground(select) {
        const background = backgrounds[select.value];
        if (background) root.style.setProperty('--nb-reader-bg', background);
        else root.style.removeProperty('--nb-reader-bg');
    }

    function mountReader(context, reader) {
        if (readerTools?.isConnected) return;
        const tools = element('aside', 'nb-reader');
        tools.setAttribute('aria-label', 'Neobrutal reader tools');
        const panel = element('div', 'nb-reader-box');
        panel.hidden = true;
        panel.id = 'nb-comix-reader-options';
        const toggle = button('Reader tools', () => {
            panel.hidden = !panel.hidden;
            toggle.setAttribute('aria-expanded', String(!panel.hidden));
        });
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', panel.id);
        const actions = element('div', 'nb-reader-actions');
        const status = element('p', 'nb-status');
        status.setAttribute('role', 'status');
        const download = button('Download CBZ', () => {
            const current = chapterContext(location.href) || context;
            startExport(download, status, 'Download CBZ', (report, ctl) => chapterArchive(current, report, ctl));
        }, 'nb-button nb-button-primary');
        const shrink = button('−', () => $('[aria-label="Shrink image"], [aria-label="Zoom out"]', reader)?.click());
        const enlarge = button('+', () => $('[aria-label="Enlarge image"], [aria-label="Zoom in"]', reader)?.click());
        shrink.setAttribute('aria-label', 'Zoom out');
        enlarge.setAttribute('aria-label', 'Zoom in');
        const background = element('select', 'nb-button');
        background.setAttribute('aria-label', 'Reader background');
        Object.keys(backgrounds).forEach(name => background.add(new Option(name, name)));
        const saved = readSetting('reader background', 'Theme');
        background.value = Object.hasOwn(backgrounds, saved) ? saved : 'Theme';
        background.addEventListener('change', () => {
            writeSetting('reader background', background.value);
            applyReaderBackground(background);
        });
        applyReaderBackground(background);
        actions.append(shrink, enlarge, background, download);
        panel.append(actions, status);
        tools.append(panel, toggle);
        tools.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) {
                event.stopPropagation();
                panel.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        });
        reader.append(tools);
        readerTools = tools;
    }

    let selection;

    function mountSelection(chapters) {
        if (selection?.node.isConnected) return;
        const node = element('div', 'nb-batch');
        const selected = new Map();
        const status = element('span', 'nb-status');
        status.setAttribute('role', 'status');
        const count = element('span', 'nb-status');
        const download = button('Download ZIP', () => {
            if (!selected.size) return;
            const series = $('.mpage__title')?.textContent.trim() || 'Comix';
            const chaptersToDownload = [...selected.values()];
            startExport(download, status, 'Download ZIP', async (report, controller) => {
                const usedNames = new Set();
                const entries = [];
                let size = 0;
                for (const [index, item] of chaptersToDownload.entries()) {
                    const context = { ...item, series };
                    const archive = await chapterArchive(context, message => {
                        report((index + 1) + '/' + chaptersToDownload.length + ' · ' + item.label + ' · ' + message);
                    }, controller);
                    size += archive.blob.size;
                    if (size > MAX_ARCHIVE_BYTES) throw new Error('This batch exceeds 512 MB. Select fewer chapters.');
                    const name = usedNames.has(archive.filename) ? archive.filename.replace(/\.cbz$/, ' (' + item.id + ').cbz') : archive.filename;
                    usedNames.add(name);
                    entries.push({ name, data: new Uint8Array(await archive.blob.arrayBuffer()) });
                }
                return { filename: safeName(series) + ' - Chapters.zip', blob: makeZip(entries) };
            });
        }, 'nb-button nb-button-primary');

        function updateCount() {
            count.textContent = selected.size + '/' + CONFIG.batchLimit + ' selected';
            download.disabled = !selected.size && job?.control !== download;
        }

        const mode = button('Select chapters', () => {
            const selecting = !node.hasAttribute('data-selecting');
            node.toggleAttribute('data-selecting', selecting);
            mode.setAttribute('aria-pressed', String(selecting));
            mode.textContent = selecting ? 'Clear selection' : 'Select chapters';
            if (!selecting) {
                if (job?.control === download) job.controller.abort(CANCELLED);
                selected.clear();
                status.textContent = '';
            }
            sync();
        });
        mode.setAttribute('aria-pressed', 'false');

        function sync() {
            const selecting = node.hasAttribute('data-selecting');
            count.hidden = download.hidden = !selecting;
            for (const row of $$('.mchap-row', chapters)) {
                const anchor = $('.mchap-row__primary[href]', row);
                const url = route(anchor?.href, CHAPTER_PATH);
                let check = $('.nb-chapter-check', row);
                if (!selecting || !url) {
                    check?.remove();
                    row.closest('.mchap-item')?.removeAttribute('data-nb-selected');
                    continue;
                }
                const [, , id, slug] = url.pathname.match(CHAPTER_PATH);
                const label = $('.mchap-row__ch', anchor)?.textContent.trim()?.replace(/^Ch\.?\s*/i, 'Chapter ') || 'Chapter ' + slug;
                if (check?.dataset.chapterId !== id) {
                    check?.remove();
                    check = element('input', 'nb-chapter-check');
                    check.type = 'checkbox';
                    check.dataset.chapterId = id;
                    check.setAttribute('aria-label', 'Select ' + label);
                    check.addEventListener('change', () => {
                        if (!check.checked) selected.delete(id);
                        else if (selected.size < CONFIG.batchLimit) {
                            selected.set(id, { id, url: url.pathname, label, number: slug.match(/^\d+(?:\.\d+)?/)?.[0] });
                        } else {
                            status.textContent = 'Select up to ' + CONFIG.batchLimit + ' chapters per ZIP.';
                        }
                        sync();
                    });
                    row.prepend(check);
                }
                check.checked = selected.has(id);
                row.closest('.mchap-item')?.toggleAttribute('data-nb-selected', check.checked);
            }
            updateCount();
        }

        node.append(mode, count, download, status);
        const toolbar = $('.mchap-toolbar', chapters);
        if (toolbar) toolbar.after(node);
        else chapters.prepend(node);
        selection = { node, sync };
        sync();
    }

    let currentPath;
    let scheduled = false;

    function syncPage() {
        scheduled = false;
        const app = $('#app-root');
        if (!app?.firstElementChild) return;
        const path = location.pathname;
        if (path !== currentPath) {
            if (job) job.controller.abort(CANCELLED);
            currentPath = path;
            lastTracked = null;
            if (!CHAPTER_PATH.test(path)) root.style.removeProperty('--nb-reader-bg');
        }
        const nav = $('.topnav__right', app);
        if (nav && themeButton.parentNode !== nav) nav.prepend(themeButton);

        const column = /^\/(?:home\/?)?$/.test(path) && $('main.layout--top .main-col', app);
        if ((!column || !heroState?.node.isConnected) && heroState) {
            heroState.dispose();
            heroState = null;
        }
        if (column) {
            if (!heroState) mountHero(column);
            mountHistory(column);
        }
        const reader = CHAPTER_PATH.test(path) && $('.rpage', app);
        if (reader) {
            const context = chapterContext(location.href);
            if (context) {
                trackReading(context);
                mountReader(context, reader);
            }
        }
        if (reader) scheduleProgress();
        const chapters = SERIES_PATH.test(path) && $('.mpage__chapters', app);
        if (chapters && ($('.mchap-row__primary[href]', chapters) || selection?.node.isConnected)) {
            mountSelection(chapters);
            selection?.sync();
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(syncPage);
    }

    // The site swaps its React views after navigation and lazily supplies reader and chapter content.
    new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.('.nb-hero,.nb-history,.nb-reader,.nb-batch'))) schedule();
    }).observe(root, { childList: true, subtree: true });
    new MutationObserver(records => {
        if (records.some(record => record.target.classList.contains('rpage-progress__seg'))) scheduleProgress();
    }).observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });
    window.addEventListener('popstate', schedule);
    window.addEventListener('pageshow', schedule);
    schedule();
}

if (window.top === window) {
    if (document.documentElement) startNeobrutalComix();
    else new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        startNeobrutalComix();
    }).observe(document, { childList: true });
}
