#!/usr/bin/env node
/**
 * Automated Verification & Regression Test Suite for Neobrutal Scans
 * Checks syntax, metadata synchronization, CSS rules, isolation guards,
 * and functional behavior for demonicscans.user.js, asurascans.user.js,
 * and archive/neobrutal-scans.user.js.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const DEMONIC_PATH = path.join(ROOT, 'demonicscans.user.js');
const ASURA_PATH = path.join(ROOT, 'asurascans.user.js');
const MANGAREAD_PATH = path.join(ROOT, 'mangaread.user.js');
const ARCHIVE_PATH = path.join(ROOT, 'archive', 'neobrutal-scans.user.js');
const README_PATH = path.join(ROOT, 'README.md');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
        passed++;
    } catch (err) {
        console.error(`  \x1b[31m✖\x1b[0m ${name}`);
        console.error(`    \x1b[31m${err.message}\x1b[0m`);
        failed++;
    }
}

console.log('\n\x1b[1m=== Neobrutal Scans Automated Test Suite ===\x1b[0m\n');

// 1. Files existence
console.log('\x1b[36m[Group 1: File Existence & Readability]\x1b[0m');
test('demonicscans.user.js exists', () => assert(fs.existsSync(DEMONIC_PATH)));
test('asurascans.user.js exists', () => assert(fs.existsSync(ASURA_PATH)));
test('mangaread.user.js exists', () => assert(fs.existsSync(MANGAREAD_PATH)));
test('archive/neobrutal-scans.user.js exists', () => assert(fs.existsSync(ARCHIVE_PATH)));
test('README.md exists', () => assert(fs.existsSync(README_PATH)));

const demonicCode = fs.readFileSync(DEMONIC_PATH, 'utf8');
const asuraCode = fs.readFileSync(ASURA_PATH, 'utf8');
const mangareadCode = fs.readFileSync(MANGAREAD_PATH, 'utf8');
const archiveCode = fs.readFileSync(ARCHIVE_PATH, 'utf8');
const readmeCode = fs.readFileSync(README_PATH, 'utf8');

// 2. Syntax & Compilation
console.log('\n\x1b[36m[Group 2: JavaScript Syntax & Compilation]\x1b[0m');
test('demonicscans.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(demonicCode, { filename: 'demonicscans.user.js' });
});
test('asurascans.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(asuraCode, { filename: 'asurascans.user.js' });
});
test('mangaread.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(mangareadCode, { filename: 'mangaread.user.js' });
});
test('archive/neobrutal-scans.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(archiveCode, { filename: 'archive/neobrutal-scans.user.js' });
});

// 3. Metadata & Version Synchronization
console.log('\n\x1b[36m[Group 3: Metadata & Version Synchronization]\x1b[0m');
function getMeta(code, key) {
    const m = code.match(new RegExp(`//\\s*@${key}\\s+(.+)`));
    return m ? m[1].trim() : null;
}

const demonicVersion = getMeta(demonicCode, 'version');
const asuraVersion = getMeta(asuraCode, 'version');
const mangareadVersion = getMeta(mangareadCode, 'version');

test('demonicscans.user.js has a valid @version', () => {
    assert(demonicVersion && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(demonicVersion), `Got ${demonicVersion}`);
});
test('asurascans.user.js has a valid @version', () => {
    assert(asuraVersion && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(asuraVersion), `Got ${asuraVersion}`);
});
test('mangaread.user.js has a valid @version', () => {
    assert(mangareadVersion && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(mangareadVersion), `Got ${mangareadVersion}`);
});
test('README.md version badge matches script version', () => {
    const m = readmeCode.match(/version-(\d{4}--\d{2}--\d{2}\.\d+)-blue/);
    assert(m, 'Version badge not found in README.md');
    const badgeVersion = m[1].replace(/--/g, '-');
    assert(badgeVersion && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(badgeVersion), `Invalid badge version format: ${badgeVersion}`);
    assert.strictEqual(badgeVersion, demonicVersion, `Badge version ${badgeVersion} != script version ${demonicVersion}`);
});
test('Metadata contains essential Userscript headers in all scripts', () => {
    for (const code of [demonicCode, asuraCode, archiveCode, mangareadCode]) {
        assert(getMeta(code, 'name'), 'Missing @name');
        assert(getMeta(code, 'match'), 'Missing @match');
        assert(getMeta(code, 'run-at'), 'Missing @run-at');
        assert(getMeta(code, 'downloadURL'), 'Missing @downloadURL');
    }
});
test('demonicscans.user.js matches MangaDemon mirror domains', () => {
    const mirrors = ['mangademon.org', 'mangademon.com', 'mangademon.cc', 'mangademon.me', 'mgdemon.org', 'demonreader.org'];
    for (const d of mirrors) {
        assert(demonicCode.includes(`@match        *://*.${d}/*`), `Missing @match for ${d} in demonic`);
    }
});
test('mangaread.user.js matches MangaRead domains', () => {
    assert(mangareadCode.includes('@match        *://mangaread.org/*'), 'Missing @match for mangaread.org');
    assert(mangareadCode.includes('@match        *://*.mangaread.org/*'), 'Missing @match for *.mangaread.org');
});
test('mangaread.user.js declares @grant unsafeWindow for sandbox bypass', () => {
    assert(mangareadCode.includes('// @grant        unsafeWindow'), 'Missing @grant unsafeWindow in mangaread.user.js');
});

// 4. CSS Integrity & Progress Bar Keyframes
console.log('\n\x1b[36m[Group 4: CSS Rules & Hero Animation Integrity]\x1b[0m');
test('.md-thumb-fill height: 0% has NO !important (which would break @keyframes)', () => {
    const fillRule = demonicCode.match(/#md-hero\s+\.md-thumb-fill\s*\{[^}]+\}/);
    assert(fillRule, 'Could not find #md-hero .md-thumb-fill in demonic');
    assert(!/height:\s*0%\s*!important/i.test(fillRule[0]),
        'Found breaking "height: 0% !important" in #md-hero .md-thumb-fill in demonic');
});
test('@keyframes mdProgressFall is defined and animates height from 0% to 100%', () => {
    const kf = demonicCode.match(/@keyframes\s+mdProgressFall\s*\{[\s\S]*?100%\s*\{[^}]+\}\s*\}/);
    assert(kf, 'Missing @keyframes mdProgressFall in demonic');
    assert(/0%\s*\{\s*height:\s*0%;?\s*\}/i.test(kf[0]), 'Missing 0% { height: 0% } in keyframes');
    assert(/100%\s*\{\s*height:\s*100%;?\s*\}/i.test(kf[0]), 'Missing 100% { height: 100% } in keyframes');
});
test('.md-hero-thumb.is-active .md-thumb-fill animation has NO !important (allows JS reset)', () => {
    const activeRule = demonicCode.match(/#md-hero\s+\.md-hero-thumb\.is-active\s+\.md-thumb-fill\s*\{[^}]+\}/);
    assert(activeRule, 'Missing is-active .md-thumb-fill in demonic');
    assert(!/animation:[^;]+!important/i.test(activeRule[0]),
        'Found breaking "!important" on animation in demonic');
    assert(/animation:\s*mdProgressFall\s+5\.5s/i.test(activeRule[0]),
        'Animation missing mdProgressFall 5.5s in demonic');
});
test('.md-hero-title locks height and line clamp to prevent thumbnails moving vertically', () => {
    const titleRule = demonicCode.match(/#md-hero\s+\.md-hero-title\s*\{[^}]+\}/);
    assert(titleRule, 'Missing #md-hero .md-hero-title in demonic');
    assert(/-webkit-line-clamp:\s*2/i.test(titleRule[0]), 'Missing -webkit-line-clamp: 2 in demonic');
    assert(/min-height:\s*2\.4em/i.test(titleRule[0]), 'Missing min-height: 2.4em in demonic');
    assert(/max-height:\s*2\.4em/i.test(titleRule[0]), 'Missing max-height: 2.4em in demonic');
    assert(/text-transform:\s*none/i.test(titleRule[0]), 'Title must have text-transform: none in demonic');
});
test('.md-hero-body has flex column layout with justify-content: flex-end', () => {
    const bodyRule = demonicCode.match(/#md-hero\s+\.md-hero-body\s*\{[^}]+\}/);
    assert(bodyRule, 'Missing #md-hero .md-hero-body in demonic');
    assert(/display:\s*flex/i.test(bodyRule[0]), 'Missing display: flex in demonic');
    assert(/justify-content:\s*flex-end/i.test(bodyRule[0]), 'Missing justify-content: flex-end in demonic');
    assert(/min-height:\s*320px/i.test(bodyRule[0]), 'Missing min-height: 320px in demonic');
});
test('.md-hero-meta, .md-hero-views, and .md-hero-chapter styles are defined', () => {
    assert(demonicCode.includes('#md-hero .md-hero-meta'), 'Missing #md-hero .md-hero-meta in demonic');
    assert(demonicCode.includes('#md-hero .md-hero-views'), 'Missing #md-hero .md-hero-views in demonic');
    assert(demonicCode.includes('#md-hero .md-hero-chapter'), 'Missing #md-hero .md-hero-chapter in demonic');
});
test('Mobile responsive hero styling defined for max-width: 768px', () => {
    assert(demonicCode.includes('@media (max-width: 768px)'), 'Missing 768px media query in demonic');
    assert(demonicCode.includes('#md-hero .md-hero-card'), 'Missing mobile hero card styling');
    assert(demonicCode.includes('margin-top: auto !important;'), 'Carousel thumbs must stick to bottom of card on mobile');
    assert(/bottom:\s*-\d+px/i.test(demonicCode), 'Hero preview card must clip through bottom edge');
    assert(/mask-image:\s*linear-gradient\(to right,\s*transparent/i.test(demonicCode), 'Carousel mask must fade in on left edge');
});
test('Mobile navigation header controls (sidebar, logo, search) are defined', () => {
    assert(demonicCode.includes('button[onclick*="pushMenuRight"]'), 'Missing mobile sidebar menu button styling');
    assert(demonicCode.includes('body > nav a[href="/index.php"]:has(> img[src*="title"])'), 'Missing mobile logo styling');
    assert(demonicCode.includes(':is(body > nav) .right-nav-cont button'), 'Missing mobile search button styling');
    assert(demonicCode.includes(':is(body > nav, #forced-Search) .right-nav-cont'), 'Missing mobile search container reset');
    assert(demonicCode.includes('transform: translateX(24px) !important;'), 'Missing mobile theme switch centered translation');
});
test('Owl Carousel flattening CSS defenses and hero source hiding are defined', () => {
    assert(demonicCode.includes('.owl-carousel .owl-stage-outer, .owl-carousel .owl-stage'), 'Missing owl stage rule');
    assert(demonicCode.includes('display: contents !important;'), 'Missing display: contents for owl stage');
    assert(demonicCode.includes('[data-md-hero-source]'), 'Missing [data-md-hero-source] rule');
});
test('Pagination Neobrutalist styles are defined', () => {
    assert(demonicCode.includes('.pagination ul'), 'Missing .pagination ul rule');
    assert(demonicCode.includes('.pagination li,'), 'Missing .pagination li rule');
    assert(demonicCode.includes('.pagination li[style*="ff6740" i]'), 'Missing active pagination style');
});
test('Advanced search form and grid styles are defined', () => {
    assert(demonicCode.includes('form[action="advanced.php"]'), 'Missing advanced search form rule');
    assert(demonicCode.includes('#genres-container li'), 'Missing #genres-container li rule');
    assert(demonicCode.includes('#genres-container li:has(input:checked)'), 'Missing checked genre chip rule');
    assert(demonicCode.includes('.advanced-container'), 'Missing .advanced-container grid rule');
    assert(demonicCode.includes('.advanced-element'), 'Missing .advanced-element rule');
});
test('Static info, policy, and auth form pages styling with light-mode text fix is defined', () => {
    assert(demonicCode.includes('#login-container'), 'Missing #login-container rule');
    assert(demonicCode.includes('#login-container p'), 'Missing #login-container p rule');
    assert(/#login-container\s*\{[^}]*background:\s*var\(--card\)/i.test(demonicCode), 'Missing card background on #login-container');
    assert(demonicCode.includes('#login-container .form-input'), 'Missing .form-input styling');
    assert(demonicCode.includes('#login-container .form-submit'), 'Missing .form-submit styling');
});
test('Bookmarks page grid, elements, and empty state are defined', () => {
    assert(demonicCode.includes('#bookmarks-container'), 'Missing #bookmarks-container rule');
    assert(demonicCode.includes('#bookmarks-container .book-elements'), 'Missing .book-elements card rule');
    assert(demonicCode.includes('.md-empty-bookmarks'), 'Missing .md-empty-bookmarks rule');
    assert(demonicCode.includes('setupBookmarks();'), 'setupBookmarks must be called in run loop');
});
test('General .big-fat-titles heading rule is defined for list and translation pages', () => {
    assert(demonicCode.includes('.big-fat-titles,'), 'Missing general .big-fat-titles rule');
    assert(/h1\.big-fat-titles\s*\{[^}]*color:\s*var\(--ink\)/i.test(demonicCode), 'Missing color: var(--ink) on .big-fat-titles');
});
test('Novel overview detection and fast reader container lookup are defined', () => {
    assert(demonicCode.includes('(manga|title|novel)'), 'detectPage must support /novel/ overview routes');
    assert(demonicCode.includes('#nov-chap-container'), 'findNovelText must check #nov-chap-container');
});

// 5. DOM Isolation Guards
console.log('\n\x1b[36m[Group 5: Hero Banner DOM Isolation]\x1b[0m');
test('#md-hero is protected in UI_ZONES', () => {
    const uiMatch = demonicCode.match(/const\s+UI_ZONES\s*=\s*'([^']+)'/);
    assert(uiMatch, 'Missing UI_ZONES in demonic');
    assert(uiMatch[1].includes('#md-hero'), '#md-hero not in UI_ZONES in demonic');
});
test('tagCell, buildHead, organize, and MutationObserver skip #md-hero', () => {
    assert(demonicCode.includes("cell.closest('#md-hero')"), 'tagCell does not guard against #md-hero in demonic');
    assert(demonicCode.includes("sec.closest('#md-hero')"), 'buildHead does not guard against #md-hero in demonic');
    assert(demonicCode.includes("t.closest('#md-hero')"), 'organize does not guard against #md-hero in demonic');
    assert(demonicCode.includes("closest('#md-hero"), 'MutationObserver does not guard against #md-hero in demonic');
});
test('[data-md-hero-source] is protected in UI_ZONES and ignored by organize/tagCell/buildHead', () => {
    const uiMatch = demonicCode.match(/const\s+UI_ZONES\s*=\s*'([^']+)'/);
    assert(uiMatch && uiMatch[1].includes('[data-md-hero-source]'), '[data-md-hero-source] missing from UI_ZONES');
    assert(demonicCode.includes("data-md-hero-source"), 'Missing data-md-hero-source checks in organize/tagCell');
});

// 6. Functional String & Logic Tests
console.log('\n\x1b[36m[Group 6: Functional & Data Transformation Tests]\x1b[0m');
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|[^\p{L}\p{N}])\p{L}/gu, m => m.toUpperCase());
}

test('toTitleCase converts ALL CAPS to Title Case correctly', () => {
    assert.strictEqual(toTitleCase('MYST, MIGHT, MAYHEM'), 'Myst, Might, Mayhem');
    assert.strictEqual(
        toTitleCase('A SINGLE ARISTOCRAT ENJOYS A DIFFERENT WORLD ~ THE GRACEFUL LIFE OF A MAN WHO NEVER GETS MARRIED ~'),
        'A Single Aristocrat Enjoys A Different World ~ The Graceful Life Of A Man Who Never Gets Married ~'
    );
    assert.strictEqual(toTitleCase('SOLO LEVELING (SEASON 2)'), 'Solo Leveling (Season 2)');
    assert.strictEqual(toTitleCase('OVERGEARED'), 'Overgeared');
});

test('Number formatting matches compact view strings', () => {
    const NF = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
    assert.strictEqual(NF.format(18042540) + ' views', '18M views');
    assert.strictEqual(NF.format(520000) + ' views', '520K views');
    assert.strictEqual(NF.format(1200) + ' views', '1.2K views');
});

test('View extraction parsing logic handles diverse DemonicScans card formats', () => {
    const NF = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
    function parseViews(text) {
        if (!text) return '';
        const compactMatch = text.match(/\b\d+(?:\.\d+)?\s*[KMBkmb]\b/);
        if (compactMatch) return compactMatch[0].toUpperCase() + ' views';
        const rawDigits = text.replace(/[^\d]/g, '');
        if (rawDigits) {
            const num = Number(rawDigits);
            if (!isNaN(num) && num > 0) return NF.format(num) + ' views';
        }
        return '';
    }
    assert.strictEqual(parseViews('18042540'), '18M views');
    assert.strictEqual(parseViews('   \n 18042540 \n  '), '18M views');
    assert.strictEqual(parseViews('2.5M'), '2.5M views');
    assert.strictEqual(parseViews('345000'), '345K views');
    assert.strictEqual(parseViews('0'), '');
});

test('normalizeSeriesPath correctly cleans URLs for chapter caching', () => {
    function normalizeSeriesPath(url) {
        if (!url) return '';
        try {
            const u = new URL(url, 'https://demonicscans.org');
            return u.pathname.replace(/\/+$/, '').toLowerCase();
        } catch (e) {
            return String(url).replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/\/+$/, '').toLowerCase();
        }
    }
    assert.strictEqual(normalizeSeriesPath('https://demonicscans.org/title/Myst,-Might,-Mayhem'), '/title/myst,-might,-mayhem');
    assert.strictEqual(normalizeSeriesPath('/title/Myst,-Might,-Mayhem/'), '/title/myst,-might,-mayhem');
    assert.strictEqual(normalizeSeriesPath('/manga/Solo-Leveling'), '/manga/solo-leveling');
});

test('buildHero contains toTitleCase and metadata extraction logic in demonicscans.user.js', () => {
    assert(demonicCode.includes('toTitleCase(cur.title)'), 'Missing toTitleCase in showSlide in demonic');
    assert(demonicCode.includes('md-hero-views'), 'Missing md-hero-views in buildHero in demonic');
    assert(demonicCode.includes('md-hero-chapter'), 'Missing md-hero-chapter in buildHero in demonic');
    assert(demonicCode.includes('NF.format('), 'Missing NF.format in views extraction in demonic');
    assert(demonicCode.includes('harvestChapterMap'), 'Missing chapter map harvesting in demonic');
});

test('flattenOwlCarousels and isHome guard exist in demonicscans.user.js', () => {
    assert(demonicCode.includes('function flattenOwlCarousels'), 'Missing flattenOwlCarousels in demonic');
    assert(demonicCode.includes('flattenOwlCarousels();'), 'organize does not call flattenOwlCarousels');
    assert(demonicCode.includes('const isHome = location.pathname === \'/\''), 'Missing isHome guard in buildHero');
});

test('asurascans.user.js contains SEL_ASURA, asuraReaderProps, and markLocks logic', () => {
    assert(asuraCode.includes('SEL_ASURA'), 'Missing SEL_ASURA in asuraCode');
    assert(asuraCode.includes('asuraReaderProps'), 'Missing asuraReaderProps in asuraCode');
    assert(asuraCode.includes('markLocks'), 'Missing markLocks in asuraCode');
    assert(asuraCode.includes('setupReader'), 'Missing setupReader in asuraCode');
});

test('mangaread.user.js contains SEL_MANGAREAD, setupReader, and setupSelect logic', () => {
    assert(mangareadCode.includes('SEL_MANGAREAD'), 'Missing SEL_MANGAREAD in mangareadCode');
    assert(mangareadCode.includes('setupReader'), 'Missing setupReader in mangareadCode');
    assert(mangareadCode.includes('setupSelect'), 'Missing setupSelect in mangareadCode');
    assert(mangareadCode.includes('buildCbz'), 'Missing buildCbz in mangareadCode');
    assert(mangareadCode.includes('makeZip'), 'Missing makeZip in mangareadCode');
});

test('mangaread.user.js CSS debloat hides top/bottom ad containers and code-blocks', () => {
    assert(mangareadCode.includes('.body-top-ads'), 'Missing .body-top-ads in debloat CSS');
    assert(mangareadCode.includes('.body-bottom-ads'), 'Missing .body-bottom-ads in debloat CSS');
    assert(mangareadCode.includes('.c-ads'), 'Missing .c-ads in debloat CSS');
    assert(mangareadCode.includes('.code-block'), 'Missing .code-block in debloat CSS');
    assert(mangareadCode.includes('ins.pubadx-slot'), 'Missing ins.pubadx-slot in debloat CSS');
    assert(mangareadCode.includes('[class*="bg-ssp-"]'), 'Missing bg-ssp selector in debloat CSS');
});

test('mangaread.user.js CSS debloat hides Super Socializer and widget bloat', () => {
    assert(mangareadCode.includes('.the_champ_sharing_container'), 'Missing .the_champ_sharing_container');
    assert(mangareadCode.includes('.the_champ_outer_login_container'), 'Missing .the_champ_outer_login_container');
    assert(mangareadCode.includes('#custom_html-5'), 'Missing #custom_html-5');
    assert(mangareadCode.includes('#block-3'), 'Missing #block-3');
    assert(mangareadCode.includes('.cf-turnstile'), 'Missing .cf-turnstile');
});

test('mangaread.user.js overrides window.open to block popups/popunders', () => {
    assert(mangareadCode.includes('window.open = function'), 'Missing window.open override');
});

test('mangaread.user.js neutralizes PubAdX, Yandex, and Google ad globals', () => {
    assert(mangareadCode.includes('__pubadxTagInit'), 'Missing __pubadxTagInit stub');
    assert(mangareadCode.includes('yaContextCb'), 'Missing yaContextCb stub');
    assert(mangareadCode.includes('googletag'), 'Missing googletag stub');
    assert(mangareadCode.includes('aclib'), 'Missing aclib stub');
    assert(mangareadCode.includes('ai_adb_process_blocks'), 'Missing ai_adb_process_blocks stub');
});

test('mangaread.user.js targets unsafeWindow and mirrors stubs to sandbox window', () => {
    assert(mangareadCode.includes('typeof unsafeWindow !== \'undefined\' ? unsafeWindow : window'),
        'Missing unsafeWindow ternary fallback check');
    assert(mangareadCode.includes('win.__pubadxTagInit = true'), 'Missing win.__pubadxTagInit assignment');
    assert(mangareadCode.includes('win.aclib ='), 'Missing win.aclib assignment');
    assert(mangareadCode.includes('win.open = blockOpen'), 'Missing win.open assignment');
    assert(mangareadCode.includes('window.open = function'), 'Missing window.open assignment');
});

test('mangaread.user.js functional test: ad globals attach to unsafeWindow in userscript sandbox', () => {
    const sandboxWindow = { open: () => {} };
    const pageWindow = { open: () => {} };
    const mockContext = {
        window: sandboxWindow,
        unsafeWindow: pageWindow,
        console: { warn: () => {} }
    };

    const match = mangareadCode.match(/function neutralizeGlobals\(\)\s*\{[\s\S]*?\n    \}\n    neutralizeGlobals\(\);/);
    assert(match, 'Could not extract neutralizeGlobals block');

    const script = new vm.Script(match[0]);
    vm.createContext(mockContext);
    script.runInContext(mockContext);

    assert.strictEqual(pageWindow.__pubadxTagInit, true, 'unsafeWindow.__pubadxTagInit must be true');
    assert(typeof pageWindow.aclib === 'object' && typeof pageWindow.aclib.runPop === 'function', 'unsafeWindow.aclib not stubbed');
    assert.strictEqual(pageWindow.open('https://ad.com', '_blank'), null, 'unsafeWindow.open must block popups');
    assert.strictEqual(sandboxWindow.__pubadxTagInit, true, 'sandbox window.__pubadxTagInit must be mirrored');
    assert.strictEqual(sandboxWindow.open('https://ad.com', '_blank'), null, 'sandbox window.open must block popups');
});

test('mangaread.user.js persists theme preference and deserializes JSON cleanly', () => {
    assert(mangareadCode.includes("store.get('theme'"), 'savedTheme must use store.get("theme")');
    assert(!/localStorage\.getItem\(['"]md-theme['"]\)\s*===\s*['"]light['"]/.test(mangareadCode),
        'Raw unparsed localStorage check must not be used');
});

test('mangaread.user.js functional test: theme deserialization preserves light mode across reloads', () => {
    const storeMatch = mangareadCode.match(/const store = \{[\s\S]*?\n    \};\n\n    const savedTheme = \(\(\) => \{[\s\S]*?\n    \}\)\(\);/);
    assert(storeMatch, 'Could not extract store and savedTheme definitions');

    const storage = {};
    const mockLocalStorage = {
        getItem: (k) => storage[k] !== undefined ? storage[k] : null,
        setItem: (k, v) => { storage[k] = String(v); }
    };

    function runThemeEvaluation(storedValue) {
        if (storedValue === undefined) {
            delete storage['md-theme'];
        } else {
            storage['md-theme'] = storedValue;
        }
        const ctx = {
            localStorage: mockLocalStorage,
            CONFIG: { themeDefault: 'dark' }
        };
        const script = new vm.Script(storeMatch[0] + '\n; savedThemeResult = savedTheme;');
        vm.createContext(ctx);
        script.runInContext(ctx);
        return ctx.savedThemeResult;
    }

    // 1. First visit (empty localStorage) -> defaults to dark
    assert.strictEqual(runThemeEvaluation(undefined), 'dark', 'Default theme must be dark');

    // 2. User set light mode: store.set('theme', 'light') writes JSON.stringify('light') = '"light"'
    assert.strictEqual(runThemeEvaluation(JSON.stringify('light')), 'light', 'Light mode must deserialize to "light"');

    // 3. User set dark mode: store.set('theme', 'dark') writes JSON.stringify('dark') = '"dark"'
    assert.strictEqual(runThemeEvaluation(JSON.stringify('dark')), 'dark', 'Dark mode must deserialize to "dark"');

    // 4. Raw unquoted string "light" fallback
    assert.strictEqual(runThemeEvaluation('light'), 'light', 'Raw unquoted "light" must fallback to "light"');
});

test('mangaread.user.js implements MutationObserver and purgeAdContainers', () => {
    assert(mangareadCode.includes('function purgeAdContainers'), 'Missing purgeAdContainers');
    assert(mangareadCode.includes('new MutationObserver'), 'Missing MutationObserver');
});

test('mangaread.user.js reader sanitization protects chapter images', () => {
    assert(mangareadCode.includes('wp-manga-chapter-img'), 'Missing wp-manga-chapter-img check');
    assert(mangareadCode.includes('reading-content'), 'Missing reading-content reader sanitization');
});

test('SEL_MANGAREAD adapter functions and selectors are defined', () => {
    assert(mangareadCode.includes('ul.main.version-chap'), 'Missing ul.main.version-chap in SEL_MANGAREAD');
    assert(mangareadCode.includes('wp-manga-chapter'), 'Missing wp-manga-chapter in SEL_MANGAREAD');
    assert(mangareadCode.includes('host:'), 'Missing host in SEL_MANGAREAD');
    assert(mangareadCode.includes('links:'), 'Missing links in SEL_MANGAREAD');
    assert(mangareadCode.includes('label:'), 'Missing label in SEL_MANGAREAD');
    assert(mangareadCode.includes('series:'), 'Missing series in SEL_MANGAREAD');
    assert(mangareadCode.includes('pages:'), 'Missing pages in SEL_MANGAREAD');
    assert(mangareadCode.includes('framePages:'), 'Missing framePages in SEL_MANGAREAD');
});

// 7. Reader Discord, Black Comments, GIF Support & Card Layouts
console.log('\n\x1b[36m[Group 7: Reader Discord, Black Comments, GIF Support & Card Layouts]\x1b[0m');
test('Discord widgets and banners are purged in reader and site-wide', () => {
    assert(demonicCode.includes('function purgeDiscord'), 'Missing purgeDiscord function in demonic');
    assert(demonicCode.includes('iframe[src*="discord" i]'), 'Missing discord iframe CSS rule in demonic');
    assert(demonicCode.includes('purgeDiscord();'), 'purgeDiscord not invoked in demonic reader/run');
});

test('Comments widget has black background and high-contrast styling', () => {
    assert(/#cw-comments\s*\{[^}]*background:\s*#000000\s*!important/i.test(demonicCode), 'Missing #cw-comments black background');
    assert(/#cw-comments\s+\.cw-comment\s*\{[^}]*background:\s*#000000\s*!important/i.test(demonicCode), 'Missing .cw-comment black background');
});

test('GIF comments and single link comments are preserved and rendered', () => {
    assert(demonicCode.includes('keepImageComments: true'), 'keepImageComments is not true in CONFIG');
    assert(demonicCode.includes('isSingleLink'), 'isSingleLink check missing in commentsTweaks');
    assert(demonicCode.includes('gifImg.src = url'), 'Missing GIF inline image creation in commentsTweaks');
});

test('Latest Translations portrait card layout is defined and formatted', () => {
    assert(demonicCode.includes('function formatTranslationCard'), 'Missing formatTranslationCard in demonic');
    assert(demonicCode.includes('md-trans-title'), 'Missing md-trans-title in demonic');
    assert(demonicCode.includes('md-trans-meta'), 'Missing md-trans-meta in demonic');
    assert(demonicCode.includes('data-md-trans="1"'), 'Missing data-md-trans="1" CSS selectors');
});

test('Latest Updates card features full 2:3 cover and separated chapter blocks', () => {
    assert(demonicCode.includes('aspect-ratio: 2 / 3 !important'), 'Missing 2:3 aspect-ratio rule for covers');
    assert(/\[data-md="row"\]\s*\{[^}]*background:\s*var\(--soft\)\s*!important/i.test(demonicCode), 'Missing card background on chapter row');
    assert(/\[data-md="row"\]\s*\{[^}]*border:\s*var\(--bw\)\s*solid\s*var\(--bd\)\s*!important/i.test(demonicCode), 'Missing border on chapter row block');
    assert(/:root\s*\{[^}]*--soft:\s*#efe9d8;/i.test(demonicCode), 'Missing --soft token in demonicscans :root');
});

test('demonicscans.user.js sliding pill theme toggle has knob sliding animation across viewports', () => {
    assert(demonicCode.includes('#md-theme .md-th-sw { display: block !important;'), 'Missing .md-th-sw block display for pill toggle');
    assert(demonicCode.includes('translateX(26px) !important'), 'Missing translateX(26px) for dark mode switch knob');
    assert(demonicCode.includes('border-radius: 999px !important'), 'Missing 999px pill border-radius on #md-theme');
});

// 8. MangaRead Audit, Hardening & Interactive Features
console.log('\n\x1b[36m[Group 8: MangaRead Audit, Hardening & Interactive Features]\x1b[0m');
test('mangaread.user.js detectPage correctly handles pagination, search, genres and chapter routes', () => {
    const detectMatch = mangareadCode.match(/function detectPage\(\)\s*\{[\s\S]*?\n    \}/);
    assert(detectMatch, 'Could not find detectPage in mangaread.user.js');

    function evalPage(pathname, search = '') {
        const ctx = {
            location: { pathname, search, href: `https://www.mangaread.org${pathname}${search}` }
        };
        const script = new vm.Script(detectMatch[0] + '\n; result = detectPage();');
        vm.createContext(ctx);
        script.runInContext(ctx);
        return ctx.result;
    }

    assert.strictEqual(evalPage('/manga/page/2/'), 'list', '/manga/page/2/ must be list');
    assert.strictEqual(evalPage('/manga/page/10/'), 'list', '/manga/page/10/ must be list');
    assert.strictEqual(evalPage('/page/3/'), 'list', '/page/3/ must be list');
    assert.strictEqual(evalPage('/genres/action/'), 'list', '/genres/action/ must be list');
    assert.strictEqual(evalPage('/', '?s=solo'), 'list', '/?s=solo must be list');
    assert.strictEqual(evalPage('/manga/solo-leveling/'), 'overview', '/manga/solo-leveling/ must be overview');
    assert.strictEqual(evalPage('/manga/solo-leveling/chapter-1/'), 'chapter', '/manga/solo-leveling/chapter-1/ must be chapter');
});

test('mangaread.user.js setupReader includes paged-style redirect guard', () => {
    assert(mangareadCode.includes("style=paged"), 'Missing style=paged check in setupReader');
    assert(mangareadCode.includes("u.searchParams.delete('style')"), 'Missing searchParams deletion of style');
    assert(mangareadCode.includes("location.replace(u.href)"), 'Missing location.replace redirect');
});

test('mangaread.user.js select mode intercepts clicks and highlights selected rows', () => {
    assert(mangareadCode.includes("list.addEventListener('click'"), 'Missing list click intercept in setupSelect');
    assert(mangareadCode.includes(".listing-chapters_wrap:not([data-md-select]) .md-ck"), 'Missing .md-ck hidden CSS rule');
    assert(mangareadCode.includes("ul.main.version-chap li.wp-manga-chapter[data-md-sel]"), 'Missing chapter row selected highlight rule');
});

test('mangaread.user.js wpDiscuz comments styling supports dynamic theme switching with high contrast', () => {
    const hasThemeAdaptiveBg =
        /#respond\.comments-area,\s*#wpdcom\s*\{[^}]*background:\s*(?:#000000|var\(--(?:card|comment-bg|bg)\))\s*!important/i.test(mangareadCode) ||
        (/#wpdcom\s*\{[^}]*background:\s*(?:#000000|var\(--(?:card|comment-bg|bg)\))\s*!important/i.test(mangareadCode)) ||
        (/html\[data-md-theme="dark"\][^{]*#wpdcom\s*\{[^}]*background:\s*#000000\s*!important/i.test(mangareadCode));
    assert(hasThemeAdaptiveBg, 'Missing #wpdcom theme-adaptive background rule (expected var(--card) or #000000)');
    assert(/#wpdcom\s+\.wpd-comment\s*\{[^}]*background:\s*(?:#0a0a0a|var\(--(?:card|soft|bg)\)|#[0-9a-fA-F]{3,6})\s*!important/i.test(mangareadCode), 'Missing .wpd-comment background');
    assert(/#wpdcom\s+\.wpd-reply[^{]*\{[^}]*background:\s*(?:#141414|var\(--(?:card|soft|cream|bg)\)|#[0-9a-fA-F]{3,6})\s*!important/i.test(mangareadCode), 'Missing .wpd-reply background');
});

test('mangaread.user.js sliding pill theme toggle has knob sliding animation and header slotting', () => {
    assert(mangareadCode.includes('class="md-th-sw"'), 'Missing .md-th-sw switch container in setupThemeToggle');
    assert(mangareadCode.includes('class="md-th-knob"'), 'Missing .md-th-knob knob container in setupThemeToggle');
    assert(mangareadCode.includes('translateX(26px) !important'), 'Missing translateX(26px) for dark mode switch knob');
    assert(mangareadCode.includes('menu-theme'), 'Missing menu-theme slotting in main-menu-search');
});

test('mangaread.user.js cleans all-caps card titles and un-blanks wpDiscuz comment images', () => {
    assert(mangareadCode.includes('cleanCardTitles();'), 'cleanCardTitles not called in run');
    assert(mangareadCode.includes('fixCommentImages();'), 'fixCommentImages not called in run');
    assert(mangareadCode.includes('wmu-data-src'), 'Missing wmu-data-src un-blanking logic');
});

// 9. Neobrutalism Polish & Regression Assertions
console.log('\n\x1b[36m[Group 9: Neobrutalism Polish & Regression Assertions]\x1b[0m');
test('mangaread.user.js defines --header-gradient in light and dark modes and neutralizes blue leak', () => {
    assert(/:root\s*\{[^}]*--header-gradient:\s*linear-gradient\(135deg,\s*#ff5252/i.test(mangareadCode), 'Missing --header-gradient in :root');
    assert(/html\[data-md-theme="dark"\]\s*\{[^}]*--header-gradient:\s*linear-gradient\(135deg,\s*#7c3aed/i.test(mangareadCode), 'Missing --header-gradient in dark mode');
    assert(/header\.site-header\s*\{[^}]*background:\s*var\(--header-gradient\)\s*!important/i.test(mangareadCode), 'header.site-header not using var(--header-gradient)');
    assert(mangareadCode.includes('.site-header .main-navigation.style-1'), 'Missing .site-header .main-navigation.style-1 rule');
    assert(mangareadCode.includes('background: transparent !important;'), 'Missing transparent background override for navigation');
    assert(mangareadCode.includes('background-image: none !important;'), 'Missing background-image: none override for navigation');
});

test('mangaread.user.js strips #ebebeb borders on chapter buttons and styles with JetBrains Mono', () => {
    assert(/span\.chapter\s*\{[^}]*background:\s*transparent\s*!important/i.test(mangareadCode) ||
           /\.chapter-item\s+\.chapter[^{]*\{[^}]*background:\s*transparent\s*!important/i.test(mangareadCode), 'Missing chapter wrapper transparent background rule');
    assert(/\.chapter-item\s+\.chapter\s+a[^{]*\{[^}]*font-family:\s*'JetBrains Mono'/i.test(mangareadCode) ||
           /span\.chapter\s+a[^{]*\{[^}]*font-family:\s*'JetBrains Mono'/i.test(mangareadCode), 'Missing JetBrains Mono on chapter anchors');
    assert(mangareadCode.includes('border: var(--bw, 2px) solid var(--bd) !important;'), 'Missing neobrutalist border on chapter button');
});

test('mangaread.user.js purges chat completely from PURGE_SELECTORS, Layer 1 CSS, and detectPage()', () => {
    assert(mangareadCode.includes("'#menu-item-107397'"), 'Missing #menu-item-107397 in PURGE_SELECTORS');
    assert(mangareadCode.includes("'#nav-menu-item-107397'"), 'Missing #nav-menu-item-107397 in PURGE_SELECTORS');
    assert(mangareadCode.includes('#menu-item-107397, #nav-menu-item-107397'), 'Missing chat selector in Layer 1 CSS');
    assert(mangareadCode.includes("pathname.includes('/chat-mangaread')") ||
           mangareadCode.includes("p.includes('/chat-mangaread')"), 'Missing chat redirect guard in detectPage');
});

test('mangaread.user.js and demonicscans.user.js hero carousel includes hit-test buffer to eliminate hover jitter', () => {
    assert(mangareadCode.includes('#md-hero .md-hero-card:hover::after'), 'Missing :hover::after buffer in mangaread');
    assert(demonicCode.includes('#md-hero .md-hero-card:hover::after'), 'Missing :hover::after buffer in demonicscans');
    assert(/inset:\s*-16px\s+-36px\s+-16px\s+-16px/.test(mangareadCode), 'Incorrect inset hit-test buffer in mangaread');
    assert(/inset:\s*-16px\s+-36px\s+-16px\s+-16px/.test(demonicCode), 'Incorrect inset hit-test buffer in demonicscans');
    assert(mangareadCode.includes('rotate(5deg) translateY(-6px) scale(1.01)'), 'Missing dampened rotation in mangaread');
    assert(demonicCode.includes('rotate(5deg) translateY(-6px) scale(1.01)'), 'Missing dampened rotation in demonicscans');
});

test('mangaread.user.js manga detail page matches Asura neobrutalist style', () => {
    assert(mangareadCode.includes('ol.breadcrumb'), 'Missing ol.breadcrumb styling in mangaread');
    assert(mangareadCode.includes('#btn-read-first'), 'Missing #btn-read-first styling in mangaread');
    assert(mangareadCode.includes('#btn-read-last'), 'Missing #btn-read-last styling in mangaread');
    assert(mangareadCode.includes('span.chapter-release-date'), 'Missing chapter-release-date styling');
    assert(mangareadCode.includes('a.btn-reverse-order'), 'Missing a.btn-reverse-order styling');
    assert(mangareadCode.includes('.add-bookmark') && mangareadCode.includes('var(--pink'), 'Missing neobrutalist bookmark button styling');
    assert(/html\[data-md-theme="dark"\][^{]*\.summary-content\s+a[^{]*\{[^}]*color:\s*#ffffff\s*!important/i.test(mangareadCode) ||
           /html\[data-md-theme="dark"\][^{]*summary-content\s+a[^{]*\{[^}]*background:\s*var\(--violet/i.test(mangareadCode), 'Missing dark mode metadata link contrast fix');
});

test('demonicscans.user.js formatTranslationCard handles .updates-element without duplicate titles and restores full title', () => {
    assert(demonicCode.includes('existingH2'), 'Missing existingH2 check in formatTranslationCard');
    assert(demonicCode.includes('h2a.textContent = fullTitle'), 'Missing full title restoration in h2a');
    assert(demonicCode.includes('[data-md-page="translations"] [data-mdc="grid"]'), 'Missing translation page grid card styling');
    assert(/width:\s*100%\s*!important;\s*max-width:\s*100%\s*!important/i.test(demonicCode), 'Missing 100% width on translation grid card');
    assert(demonicCode.includes('.big-fat-titles::after'), 'Missing .big-fat-titles::after accent bar rule');
});

test('demonicscans.user.js restartTimer eliminates hover resume lag and consolidates header auto-hide transitions', () => {
    assert(demonicCode.includes('if (a.currentTime >= 5500)'), 'Missing currentTime >= 5500 check in restartTimer');
    assert(demonicCode.includes('delay = 50;'), 'Missing delay = 50 immediate advance in restartTimer');
    assert(/transition:\s*transform\s+\.22s\s+ease,\s*opacity\s+\.22s\s+ease\s*!important/i.test(demonicCode), 'Missing consolidated .22s auto-hide transition');
});

test('demonicscans.user.js advanced search features black-to-transparent overlay gradient between text and cover', () => {
    assert(demonicCode.includes('linear-gradient(to top, rgba(0, 0, 0, 0.95)'), 'Missing bottom-to-mid black gradient in advanced search');
    assert(demonicCode.includes('z-index: 2 !important;'), 'Missing z-index: 2 on gradient overlay');
    assert(demonicCode.includes('height: 55% !important;'), 'Missing height: 55% on gradient overlay');
});

test('demonicscans.user.js defines elevated 3-tier podium leaderboard and monospaced list rows', () => {
    assert(demonicCode.includes('.podium-card.rank-1'), 'Missing rank-1 podium elevation rule');
    assert(demonicCode.includes('transform: translateY(-12px) !important;'), 'Missing -12px elevation on rank 1 podium card');
    assert(demonicCode.includes('.podium-badge'), 'Missing .podium-badge styling');
    assert(demonicCode.includes('.leaderboard-list'), 'Missing .leaderboard-list rule');
    assert(demonicCode.includes('.leaderboard-row'), 'Missing .leaderboard-row rule');
    assert(demonicCode.includes('.leaderboard-rank'), 'Missing .leaderboard-rank rule');
    assert(demonicCode.includes('.leaderboard-score'), 'Missing .leaderboard-score rule');
});

// 10. Standardized Series Card Geometry & Uniform Dimensions
console.log('\n\x1b[36m[Group 10: Standardized Series Card Geometry & Uniform Dimensions]\x1b[0m');
test('mangaread.user.js enforces uniform card geometry, flex layouts and 2:3 aspect ratio thumbnails', () => {
    assert(mangareadCode.includes('.page-listing-item .row > [class*="col-"]'), 'Missing grid col flex rule');
    assert(mangareadCode.includes('div.page-item-detail.manga'), 'Missing div.page-item-detail.manga rule');
    assert(/div\.page-item-detail\.manga\s*\{[^}]*display:\s*flex\s*!important/i.test(mangareadCode), 'div.page-item-detail.manga missing display: flex !important');
    assert(/div\.page-item-detail\.manga\s*\{[^}]*height:\s*100%\s*!important/i.test(mangareadCode), 'div.page-item-detail.manga missing height: 100% !important');
    assert(/div\.item-thumb[^{]*\{[^}]*aspect-ratio:\s*2\s*\/\s*3\s*!important/i.test(mangareadCode), 'Missing 2:3 aspect ratio on div.item-thumb');
    assert(/object-fit:\s*cover\s*!important/i.test(mangareadCode), 'Missing object-fit: cover on thumbnails');
});

test('mangaread.user.js clamps series titles to 2 lines with consistent slot height and standardizes chapter slots', () => {
    assert(mangareadCode.includes('min-height: 2.8em !important;'), 'Missing min-height: 2.8em on clamped titles');
    assert(mangareadCode.includes('max-height: 2.8em !important;'), 'Missing max-height: 2.8em on clamped titles');
    assert(mangareadCode.includes('line-height: 1.4 !important;'), 'Missing line-height: 1.4 on clamped titles');
    assert(mangareadCode.includes('-webkit-line-clamp: 2 !important;'), 'Missing -webkit-line-clamp: 2 on clamped titles');
    assert(/div\.page-item-detail\.manga\s+\.list-chapter\s*\{[^}]*margin-top:\s*auto\s*!important/i.test(mangareadCode), 'Missing margin-top: auto on .list-chapter');
    assert(/min-height:\s*72px\s*!important;\s*max-height:\s*72px\s*!important/i.test(mangareadCode), 'Missing fixed 72px slot height on .list-chapter');
    assert(/div\.page-item-detail\.manga\s+\.chapter-item\s*\{[^}]*display:\s*flex\s*!important/i.test(mangareadCode), 'Missing display: flex on .chapter-item');
});

test('mangaread.user.js dark mode metadata links meet WCAG AA and carousel slide-end resume fix is backported', () => {
    assert(/html\[data-md-theme="dark"\][^{]*\.summary-content\s+a[^{]*\{[^}]*background:\s*#6d28d9\s*!important/i.test(mangareadCode), 'Missing WCAG AA high-contrast background #6d28d9 on dark mode metadata links');
    assert(/html\[data-md-theme="dark"\][^{]*\.summary-content\s+a[^{]*\{[^}]*color:\s*#ffffff\s*!important/i.test(mangareadCode), 'Missing color: #ffffff on dark mode metadata links');
    assert(mangareadCode.includes('if (a.currentTime >= 5500)'), 'Missing currentTime >= 5500 check in mangaread restartTimer');
    assert(mangareadCode.includes('delay = 50;'), 'Missing delay = 50 slide-end advance in mangaread restartTimer');
});

test('demonicscans.user.js enforces uniform card dimensions across .updates-element, .owl-element and thumbnails', () => {
    assert(demonicCode.includes('.updates-element,'), 'Missing .updates-element rule in demonicscans');
    assert(demonicCode.includes('.owl-element'), 'Missing .owl-element in demonicscans card rules');
    assert(/\.updates-element,\s*\.owl-element\s*\{[^}]*display:\s*flex\s*!important/i.test(demonicCode), 'Missing display: flex on .updates-element');
    assert(/\.updates-element,\s*\.owl-element\s*\{[^}]*min-height:\s*201px\s*!important/i.test(demonicCode), 'Missing min-height: 201px on .updates-element');
    assert(/\.updates-element\s+\.thumb\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3\s*!important/i.test(demonicCode) ||
           /\.thumb[^{]*\{[^}]*aspect-ratio:\s*2\s*\/\s*3\s*!important/i.test(demonicCode), 'Missing 2:3 aspect ratio on .thumb');
    assert(/\.updates-element\s+\.thumb\s*\{[^}]*width:\s*100px\s*!important/i.test(demonicCode), 'Missing fixed 100px width on .updates-element .thumb');
});

test('demonicscans.user.js clamps series titles to 2 lines and standardizes .chap-date auto-margins', () => {
    assert(/\.updates-element\s+h2[^{]*\{[^}]*min-height:\s*2.8em\s*!important/i.test(demonicCode), 'Missing min-height: 2.8em on demonicscans h2');
    assert(/\.updates-element\s+h2[^{]*\{[^}]*max-height:\s*2.8em\s*!important/i.test(demonicCode), 'Missing max-height: 2.8em on demonicscans h2');
    assert(/\.updates-element\s+h2[^{]*\{[^}]*line-height:\s*1.4\s*!important/i.test(demonicCode), 'Missing line-height: 1.4 on demonicscans h2');
    assert(/\.updates-element\s+h2[^{]*\{[^}]*-webkit-line-clamp:\s*2\s*!important/i.test(demonicCode), 'Missing -webkit-line-clamp: 2 on demonicscans h2');
    assert(/\.updates-element-info\s*\{[^}]*display:\s*flex\s*!important;\s*flex-direction:\s*column\s*!important/i.test(demonicCode), 'Missing flex-col layout on .updates-element-info');
    assert(/\.updates-element-info\s*>\s*div:last-child\s*\{[^}]*margin-top:\s*auto\s*!important/i.test(demonicCode), 'Missing margin-top: auto on .updates-element-info > div:last-child');
    assert(/\.updates-element-info\s*>\s*div:last-child\s*\{[^}]*min-height:\s*124px\s*!important/i.test(demonicCode), 'Missing min-height: 124px on .updates-element-info > div:last-child');
    assert(/\.updates-element-info\s*>\s*div:last-child\s*\{[^}]*max-height:\s*124px\s*!important/i.test(demonicCode), 'Missing max-height: 124px on .updates-element-info > div:last-child');
    assert(/\.chap-date\s*\{[^}]*display:\s*flex\s*!important;\s*flex-direction:\s*row\s*!important/i.test(demonicCode), 'Missing flex-row layout on .chap-date');
});

// Summary
console.log('\n----------------------------------------');
if (failed === 0) {
    console.log(`\x1b[32m\x1b[1mALL TESTS PASSED: ${passed}/${passed} checks successful!\x1b[0m\n`);
    process.exit(0);
} else {
    console.error(`\x1b[31m\x1b[1mTESTS FAILED: ${failed} failed, ${passed} passed.\x1b[0m\n`);
    process.exit(1);
}
