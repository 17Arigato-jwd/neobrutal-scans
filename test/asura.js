const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'asurascans.user.js'), 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.asura = { buildCbz, headerAutoHide, setTheme, setupNovelOverview, setupSelect };
})();
`);

function element() {
    const attributes = new Map();
    const classes = new Set();
    return {
        dataset: {},
        style: { setProperty() {}, removeProperty() {} },
        handlers: {},
        addEventListener(name, handler) { this.handlers[name] = handler; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        hasAttribute(name) { return attributes.has(name); },
        removeAttribute(name) { attributes.delete(name); },
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
            contains(name) { return classes.has(name); },
        },
        textWrites: 0,
        set textContent(value) { this.text = value; this.textWrites++; },
        get textContent() { return this.text ?? ''; },
    };
}

function island(props) {
    const el = element();
    const encode = value => {
        if (Array.isArray(value)) return [1, value.map(encode)];
        if (value && typeof value === 'object') return [0, entries(value)];
        return [0, value];
    };
    const entries = obj => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, encode(value)]));
    el.setAttribute('props', JSON.stringify(entries(props)));
    return el;
}

function boot({ pathname = '/', storage = new Map(), mode, ...globals } = {}) {
    const root = element();
    if (mode) root.setAttribute('data-content-mode', mode);
    const injected = [];
    root.appendChild = child => injected.push(child);
    const document = {
        readyState: 'loading',
        documentElement: root,
        activeElement: null,
        addEventListener() {},
        getElementById: () => null,
        createElement: element,
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    const window = { addEventListener() {} };
    window.top = window.self = window;
    const handlers = {};
    const context = {
        document,
        window,
        location: { pathname, origin: 'https://asuracomic.net', href: 'https://asuracomic.net' + pathname },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        MutationObserver: class { observe() {} },
        addEventListener: (name, handler) => { handlers[name] = handler; },
        scrollY: 0,
        setTimeout: queueMicrotask,
        clearTimeout() {},
        AbortController,
        URL,
        ...globals,
    };
    vm.runInNewContext(instrumented, context, { filename: 'asurascans.user.js' });
    return { ...context.asura, context, document, handlers, injected, root };
}

test('Asura boots before the site sets a content mode', () => {
    const { root, injected } = boot({ pathname: '/comics/example/chapter/1' });
    assert.equal(root.dataset.mdMode, 'comics');
    assert.equal(injected[0].id, 'neobrutalism-asura-css');
});

test('Asura restores switched and legacy theme preferences', () => {
    const storage = new Map();
    boot({ storage }).setTheme('light');
    assert.equal(boot({ storage }).root.dataset.mdTheme, 'light');
    storage.set('md-theme', 'light');
    assert.equal(boot({ storage }).root.dataset.mdTheme, 'light');
    storage.set('md-theme', 'invalid');
    assert.equal(boot({ storage }).root.dataset.mdTheme, 'dark');
});

test('Asura hides the reader header on downward scroll and respects expanded controls', () => {
    const { context, document, handlers, headerAutoHide, root } = boot();
    let expanded = false;
    document.querySelector = () => ({ contains: () => false, querySelector: () => expanded });
    headerAutoHide();
    context.scrollY = 500;
    handlers.scroll();
    assert.equal(root.dataset.mdNavhide, '1');
    expanded = true;
    context.scrollY = 600;
    handlers.scroll();
    assert.equal(root.dataset.mdNavhide, undefined);
});

function chapterToolbar() {
    const { document, setupSelect } = boot();
    const bar = element(), list = element(), buttons = new Map();
    bar.querySelector = selector => {
        if (!buttons.has(selector)) buttons.set(selector, element());
        return buttons.get(selector);
    };
    document.createElement = () => bar;
    list.parentNode = { insertBefore() {} };
    const links = [1, 2, 3].map(number => {
        const link = element();
        link.setAttribute('href', '/comics/example/chapter/' + number);
        link.closest = () => link;
        return link;
    });
    setupSelect(null, { host: () => list, links: () => links });
    const toggle = { dataset: { s: 'toggle' }, closest() { return this; } };
    bar.handlers.click({ target: toggle });
    const click = (target, shiftKey = false) => {
        list.handlers.click({ target, shiftKey, preventDefault() {}, stopPropagation() {} });
    };
    return { bar, buttons, links, click };
}

test('Asura chapter toolbar leaves text nodes alone during idle refreshes', () => {
    const { bar, buttons } = chapterToolbar();
    const writes = () => [...buttons.values()].map(el => el.textWrites);
    const before = writes();
    bar.__sync();
    bar.__sync();
    assert.deepEqual(writes(), before);
});

test('Asura shift-click uses the current position of the chapter anchor', () => {
    const { click, links } = chapterToolbar();
    const [first, second, third] = links;
    click(third);
    links.splice(0, 1, third, first);
    links.pop();
    click(second, true);
    assert.ok(links.every(link => link.classList.contains('md-sel')));
    links.splice(0, 2);
    click(second, true);
    assert.equal(second.classList.contains('md-sel'), false);
    links.splice(0, 1, first, third);
    click(third, true);
    assert.equal(first.classList.contains('md-sel'), true);
    assert.equal(third.classList.contains('md-sel'), false);
});

test('Asura stops sibling comic requests before reporting the chapter failure', async () => {
    let aborted = false;
    const { buildCbz } = boot({
        GM_xmlhttpRequest(request) {
            if (request.url.endsWith('/failed')) queueMicrotask(() => request.onload({ status: 503 }));
            if (request.url.endsWith('/retry')) {
                queueMicrotask(() => request.onload({ status: 200, response: new Uint8Array([1]).buffer }));
            }
            return { abort() { aborted = true; } };
        },
    });
    const job = { cancelled: false, aborts: new Set() };
    let progress = 0;
    const onProgress = () => { progress++; };
    const urls = ['https://example.test/failed', 'https://example.test/waiting'];
    await assert.rejects(buildCbz({ srcs: urls }, onProgress, job), /HTTP 503/);
    assert.equal(aborted, true);
    assert.equal(progress, 0);
    assert.equal(job.aborts.size, 0);
    assert.equal(job.cancelled, false);

    const retry = await buildCbz({ raw: true, srcs: ['https://example.test/retry'] }, onProgress, job);
    assert.equal(retry.pages[0][0], 1);
    assert.equal(progress, 1);
    assert.equal(job.aborts.size, 0);
});

test('Asura cancels EPUB cover loading without saving an archive', { timeout: 2000 }, async () => {
    const host = island({ novelSlug: 'example', chapters: [{ number: 1, free: true }] });
    const reader = island({ paragraphs: ['<p>Chapter text</p>'] });
    const bar = element(), btn = element(), note = element();
    bar.querySelector = selector => selector === '#md-epub' ? btn : note;
    let coverAborted = false;
    let coverStarted;
    let blobCreated = false;
    const pendingCover = new Promise(resolve => { coverStarted = resolve; });
    const { setupNovelOverview, document } = boot({
        pathname: '/novels/example',
        DOMParser: class {
            parseFromString() {
                return { querySelector: () => reader, querySelectorAll: () => [{ textContent: 'Chapter text' }] };
            }
        },
        fetch: async () => ({ ok: true, text: async () => '' }),
        GM_xmlhttpRequest(request) {
            coverStarted();
            return { abort() { coverAborted = true; request.onabort(); } };
        },
        Blob: class { constructor() { blobCreated = true; } },
        console: { warn() {} },
    });
    host.parentNode = { insertBefore() {} };
    document.body = { appendChild() {} };
    document.createElement = () => bar;
    document.querySelector = selector => {
        if (selector.includes('NovelChapterList')) return host;
        if (selector.includes('/covers/')) return { src: 'https://example.test/covers/example.jpg' };
        return null;
    };
    setupNovelOverview();
    const download = btn.handlers.click();
    await pendingCover;
    await btn.handlers.click();
    await download;
    assert.equal(coverAborted, true);
    assert.equal(blobCreated, false);
    assert.equal(btn.textContent, 'Read Offline (.epub)');
});
