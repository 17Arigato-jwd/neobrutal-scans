'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { test } = require('node:test');
const puppeteer = require('puppeteer-core');

const sites = [
    ['asurascans', 'asurascans.com', '/comics/sample', '/comics/sample/chapter/2',
        '<img data-page-index="0"><img data-page-index="1" id="target">'],
    ['comix', 'comix.to', '/title/sample', '/title/sample/11-chapter-2',
        '<div class="rpage-main"><div class="rpage-page" data-page="2" id="target"></div></div>'],
    ['mangaread', 'www.mangaread.org', '/manga/sample', '/manga/sample/chapter-2',
        '<div class="reading-content"><img class="wp-manga-chapter-img"><img class="wp-manga-chapter-img" id="target"></div>'],
    ['demonicscans', 'www.mangademon.org', '/manga/sample', '/title/sample/chapter/2/1',
        '<img class="imgholder"><img class="imgholder" id="target">'],
];

// All strings and nested messages in this fixture are shorter than 128 bytes.
function field(tag, value) {
    const bytes = Buffer.from(value);
    assert.ok(bytes.length < 128);
    return Buffer.concat([Buffer.of(tag, bytes.length), bytes]);
}

function fixture() {
    return gzipSync(Buffer.concat(sites.map(([, host, series, chapter]) => {
        const chapterField = Buffer.concat([Buffer.of(0x82, 0x01), field(0, Buffer.concat([
            field(10, chapter), field(18, 'Chapter 2'), Buffer.of(48, 1),
        ])).subarray(1)]);
        const historyField = Buffer.concat([Buffer.of(0xc2, 0x06), field(0, Buffer.concat([
            field(10, chapter), Buffer.of(16, 90),
        ])).subarray(1)]);
        return field(10, Buffer.concat([
            Buffer.of(8, 1), field(18, 'https://' + host + series), field(26, 'Sample'),
            chapterField, historyField,
        ]));
    })));
}

test('preview, cancellation, import, reload and saved-page links in all four userscripts', async t => {
    assert.ok(process.env.CHROME_BIN, 'Set CHROME_BIN to a Chrome or Chrome Headless Shell executable.');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'neobrutal-import-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const file = path.join(temp, 'reading.tachibk');
    fs.writeFileSync(file, fixture());
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN, pipe: true,
        env: { ...process.env, XDG_CONFIG_HOME: temp }, args: ['--no-sandbox'] });
    t.after(() => browser.close());

    for (const [site, host, , chapter, markup] of sites) {
        await t.test(site, async () => {
            const page = await browser.newPage();
            try {
                page.setDefaultTimeout(5000);
                await page.setRequestInterception(true);
                page.on('request', request => request.respond({
                    contentType: 'text/html',
                    body: '<!doctype html><html><body>' + (request.url().includes(chapter) ? markup : '<main>Home</main>') + '</body></html>',
                }));
                await page.evaluateOnNewDocument(() => {
                    const attach = Element.prototype.attachShadow;
                    Element.prototype.attachShadow = function (options) {
                        const root = attach.call(this, options);
                        if (options.mode === 'closed') window.backupPanel = root;
                        return root;
                    };
                    Element.prototype.scrollIntoView = function () { window.resumeTarget = this.id; };
                });
                const script = fs.readFileSync(path.join(__dirname, '..', site + '.user.js'), 'utf8');
                const open = () => page.evaluate(() => window.backupPanel.querySelector('button').click());
                const status = () => page.evaluate(() => window.backupPanel.querySelector('[role=status]').textContent);
                const preview = async () => {
                    await open();
                    const input = await page.evaluateHandle(() => window.backupPanel.querySelector('input'));
                    await input.uploadFile(file);
                    await input.dispose();
                    await page.waitForFunction(() => window.backupPanel.querySelector('[role=status]').textContent.includes('1 titles ready'));
                };
                const storageKey = 'neobrutal-scans:imported-reading:v1';
                await page.goto('https://' + host + '/');
                await page.addScriptTag({ content: script });
                await preview();
                assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null);
                await page.evaluate(() => window.backupPanel.querySelector('dialog').close());
                await preview();
                await page.evaluate(() => [...window.backupPanel.querySelectorAll('button')]
                    .find(button => button.textContent === 'Import into this browser').click());
                assert.match(await status(), /Import complete/);
                await page.reload();
                await page.addScriptTag({ content: script });
                await open();
                const href = await page.evaluate(() => [...window.backupPanel.querySelectorAll('a')]
                    .find(link => link.textContent === 'Continue reading').href);
                assert.equal(href, 'https://' + host + chapter + '#neobrutal-page=1');
                await page.goto(href);
                await page.addScriptTag({ content: script });
                assert.equal(await page.evaluate(() => window.resumeTarget), 'target');
                assert.equal(new URL(page.url()).hash, '');
            } finally {
                await page.close();
            }
        });
    }
});
