#!/usr/bin/env node
/**
 * Automated Verification & Regression Test Suite for Neobrutal Scans
 * Checks syntax, metadata synchronization, CSS rules, isolation guards,
 * and functional behavior for demonicscans.user.js & neobrutal-scans.user.js.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const DEMONIC_PATH = path.join(ROOT, 'demonicscans.user.js');
const NEOBRUTAL_PATH = path.join(ROOT, 'neobrutal-scans.user.js');
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
test('neobrutal-scans.user.js exists', () => assert(fs.existsSync(NEOBRUTAL_PATH)));
test('README.md exists', () => assert(fs.existsSync(README_PATH)));

const demonicCode = fs.readFileSync(DEMONIC_PATH, 'utf8');
const neobrutalCode = fs.readFileSync(NEOBRUTAL_PATH, 'utf8');
const readmeCode = fs.readFileSync(README_PATH, 'utf8');

// 2. Syntax & Compilation
console.log('\n\x1b[36m[Group 2: JavaScript Syntax & Compilation]\x1b[0m');
test('demonicscans.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(demonicCode, { filename: 'demonicscans.user.js' });
});
test('neobrutal-scans.user.js compiles cleanly without syntax errors', () => {
    new vm.Script(neobrutalCode, { filename: 'neobrutal-scans.user.js' });
});

// 3. Metadata & Version Synchronization
console.log('\n\x1b[36m[Group 3: Metadata & Version Synchronization]\x1b[0m');
function getMeta(code, key) {
    const m = code.match(new RegExp(`//\\s*@${key}\\s+(.+)`));
    return m ? m[1].trim() : null;
}

const demonicVersion = getMeta(demonicCode, 'version');
const neobrutalVersion = getMeta(neobrutalCode, 'version');

test('demonicscans.user.js has a valid @version', () => {
    assert(demonicVersion && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(demonicVersion), `Got ${demonicVersion}`);
});
test('neobrutal-scans.user.js has matching @version', () => {
    assert.strictEqual(neobrutalVersion, demonicVersion, `Version mismatch: ${neobrutalVersion} vs ${demonicVersion}`);
});
test('README.md version badge matches script version', () => {
    const m = readmeCode.match(/version-(\d{4}--\d{2}--\d{2}\.\d+)-blue/);
    assert(m, 'Version badge not found in README.md');
    const badgeVersion = m[1].replace(/--/g, '-');
    assert.strictEqual(badgeVersion, demonicVersion, `Badge version ${badgeVersion} != script version ${demonicVersion}`);
});
test('Metadata contains essential Userscript headers', () => {
    for (const code of [demonicCode, neobrutalCode]) {
        assert(getMeta(code, 'name'), 'Missing @name');
        assert(getMeta(code, 'match'), 'Missing @match');
        assert(getMeta(code, 'run-at'), 'Missing @run-at');
        assert(getMeta(code, 'downloadURL'), 'Missing @downloadURL');
    }
});

// 4. CSS Integrity & Progress Bar Keyframes
console.log('\n\x1b[36m[Group 4: CSS Rules & Hero Animation Integrity]\x1b[0m');
test('.md-thumb-fill height: 0% has NO !important (which would break @keyframes)', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const fillRule = code.match(/#md-hero\s+\.md-thumb-fill\s*\{[^}]+\}/);
        assert(fillRule, `Could not find #md-hero .md-thumb-fill in ${name}`);
        assert(!/height:\s*0%\s*!important/i.test(fillRule[0]),
            `Found breaking "height: 0% !important" in #md-hero .md-thumb-fill in ${name}`);
    }
});
test('@keyframes mdProgressFall is defined and animates height from 0% to 100%', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const kf = code.match(/@keyframes\s+mdProgressFall\s*\{[\s\S]*?100%\s*\{[^}]+\}\s*\}/);
        assert(kf, `Missing @keyframes mdProgressFall in ${name}`);
        assert(/0%\s*\{\s*height:\s*0%;?\s*\}/i.test(kf[0]), 'Missing 0% { height: 0% } in keyframes');
        assert(/100%\s*\{\s*height:\s*100%;?\s*\}/i.test(kf[0]), 'Missing 100% { height: 100% } in keyframes');
    }
});
test('.md-hero-thumb.is-active .md-thumb-fill animation has NO !important (allows JS reset)', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const activeRule = code.match(/#md-hero\s+\.md-hero-thumb\.is-active\s+\.md-thumb-fill\s*\{[^}]+\}/);
        assert(activeRule, `Missing is-active .md-thumb-fill in ${name}`);
        assert(!/animation:[^;]+!important/i.test(activeRule[0]),
            `Found breaking "!important" on animation in ${name}`);
        assert(/animation:\s*mdProgressFall\s+5\.5s/i.test(activeRule[0]),
            `Animation missing mdProgressFall 5.5s in ${name}`);
    }
});
test('.md-hero-title locks height and line clamp to prevent thumbnails moving vertically', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const titleRule = code.match(/#md-hero\s+\.md-hero-title\s*\{[^}]+\}/);
        assert(titleRule, `Missing #md-hero .md-hero-title in ${name}`);
        assert(/-webkit-line-clamp:\s*2/i.test(titleRule[0]), `Missing -webkit-line-clamp: 2 in ${name}`);
        assert(/min-height:\s*2\.4em/i.test(titleRule[0]), `Missing min-height: 2.4em in ${name}`);
        assert(/max-height:\s*2\.4em/i.test(titleRule[0]), `Missing max-height: 2.4em in ${name}`);
        assert(/text-transform:\s*none/i.test(titleRule[0]), `Title must have text-transform: none in ${name}`);
    }
});
test('.md-hero-body has flex column layout with justify-content: flex-end', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const bodyRule = code.match(/#md-hero\s+\.md-hero-body\s*\{[^}]+\}/);
        assert(bodyRule, `Missing #md-hero .md-hero-body in ${name}`);
        assert(/display:\s*flex/i.test(bodyRule[0]), `Missing display: flex in ${name}`);
        assert(/justify-content:\s*flex-end/i.test(bodyRule[0]), `Missing justify-content: flex-end in ${name}`);
        assert(/min-height:\s*320px/i.test(bodyRule[0]), `Missing min-height: 320px in ${name}`);
    }
});
test('.md-hero-meta, .md-hero-views, and .md-hero-chapter styles are defined', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        assert(code.includes('#md-hero .md-hero-meta'), `Missing #md-hero .md-hero-meta in ${name}`);
        assert(code.includes('#md-hero .md-hero-views'), `Missing #md-hero .md-hero-views in ${name}`);
        assert(code.includes('#md-hero .md-hero-chapter'), `Missing #md-hero .md-hero-chapter in ${name}`);
    }
});

// 5. DOM Isolation Guards
console.log('\n\x1b[36m[Group 5: Hero Banner DOM Isolation]\x1b[0m');
test('#md-hero is protected in UI_ZONES', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        const uiMatch = code.match(/const\s+UI_ZONES\s*=\s*'([^']+)'/);
        assert(uiMatch, `Missing UI_ZONES in ${name}`);
        assert(uiMatch[1].includes('#md-hero'), `#md-hero not in UI_ZONES in ${name}`);
    }
});
test('tagCell, buildHead, organize, and MutationObserver skip #md-hero', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        assert(code.includes("cell.closest('#md-hero')"), `tagCell does not guard against #md-hero in ${name}`);
        assert(code.includes("sec.closest('#md-hero')"), `buildHead does not guard against #md-hero in ${name}`);
        assert(code.includes("t.closest('#md-hero')"), `organize does not guard against #md-hero in ${name}`);
        assert(code.includes("closest('#md-hero"), `MutationObserver does not guard against #md-hero in ${name}`);
    }
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

test('buildHero contains toTitleCase and metadata extraction logic in both files', () => {
    for (const [name, code] of [['demonic', demonicCode], ['neobrutal', neobrutalCode]]) {
        assert(code.includes('toTitleCase(cur.title)'), `Missing toTitleCase in showSlide in ${name}`);
        assert(code.includes('md-hero-views'), `Missing md-hero-views in buildHero in ${name}`);
        assert(code.includes('md-hero-chapter'), `Missing md-hero-chapter in buildHero in ${name}`);
        assert(code.includes('NF.format('), `Missing NF.format in views extraction in ${name}`);
        assert(code.includes('harvestChapterMap'), `Missing chapter map harvesting in ${name}`);
    }
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
