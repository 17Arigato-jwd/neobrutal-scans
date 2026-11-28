'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');
const { test } = require('node:test');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', name + '.js'), 'utf8');
const { tachibk, readingImport, nativeReadingImport } = vm.runInNewContext(
    [source('tachibk'), source('reading-import'), source('reading-import-native'),
        '({ tachibk, readingImport, nativeReadingImport })'].join('\n'),
    { TextDecoder, DecompressionStream, Uint8Array, URL },
);

function varint(value) {
    let n = BigInt(value);
    const bytes = [];
    while (n >= 128n) {
        bytes.push(Number(n & 127n) | 128);
        n >>= 7n;
    }
    bytes.push(Number(n));
    return Buffer.from(bytes);
}
const number = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);
const bytes = (field, value) => Buffer.concat([varint(field * 8 + 2), varint(Buffer.byteLength(value)), Buffer.from(value)]);
const message = (field, ...fields) => bytes(field, Buffer.concat(fields));
const backup = (...fields) => new Blob([gzipSync(Buffer.concat(fields))]);
const asuraId = 6247824327199706550n;
const comixId = 7537715367149829912n;
const origin = 'https://asurascans.com';
const manga = (id, url, ...fields) => message(1, number(1, id), bytes(2, url), bytes(3, 'Example'), ...fields);
const normalize = value => JSON.parse(JSON.stringify(value));

test('decodes 64-bit source IDs, packed categories, history, and extension memos', async () => {
    const decoded = await tachibk.read(backup(
        manga(asuraId, '/series/stable',
            message(16, bytes(1, '/series/stable/chapter/2.5'), bytes(2, 'Chapter 2.5'), number(4, 1), number(5, 1), number(6, 7)),
            bytes(17, varint(2)),
            message(104, bytes(1, '/series/stable/chapter/2.5'), number(2, 1700000000000), number(3, 180000)),
            bytes(112, '{"slug":"browser-slug"}'), bytes(777, 'unknown')),
        manga(comixId, '/abc-example'),
        message(2, bytes(1, 'Weekly'), number(2, 2)),
    ));
    assert.equal(decoded.manga[0].source, String(asuraId));
    const plan = normalize(readingImport.preview(decoded, 'asurascans', origin));
    assert.equal(plan.other, 1);
    assert.equal(plan.entries[0].url, '/comics/browser-slug');
    assert.deepEqual(plan.entries[0].categories, ['Weekly']);
    assert.deepEqual(plan.entries[0].chapters, [{
        url: '/comics/browser-slug/chapter/2.5', name: 'Chapter 2.5', scanlator: '',
        read: true, bookmark: true, page: 7, lastRead: 1700000000000, duration: 180000,
    }]);
});

test('isolates sources, retains distinct Comix releases, and skips cross-series chapter links', async () => {
    const decoded = await tachibk.read(backup(
        manga(comixId, '/abc-example', number(100, 0),
            message(16, bytes(1, 'title/abc-example/12-chapter-2.5'), number(5, 1)),
            message(16, bytes(1, '/title/abc-example/13-chapter-2.5'), number(4, 1)),
            message(16, bytes(1, '/title/unrelated/14-chapter-3'), number(4, 1)),
            message(16, bytes(1, 'https://evil.invalid/title/abc-example/15-chapter-4'), number(4, 1))),
        manga(asuraId, 'https://comix.ws/title/abc-example'),
        manga(33n, '/title/unattributed'),
    ));
    const plan = readingImport.preview(decoded, 'comix', 'https://comix.to');
    assert.equal(plan.other, 2);
    assert.equal(plan.unmatchedChapters, 2);
    assert.equal(plan.entries[0].favorite, false);
    assert.equal(plan.entries[0].chapters.length, 2);
});

test('recognizes MangaRead and Demonic routes with same-site support', async () => {
    const decoded = await tachibk.read(backup(
        manga(23n, 'https://www.mangaread.org/manga/example/',
            message(104, bytes(1, '/manga/example/special/?style=list'), number(2, 1700000000000))),
        manga(84n, '/manga/example',
            message(16, bytes(1, '/title/example/chapter/11/1'), number(5, 1))),
        message(101, bytes(1, 'MangaDemon'), number(2, 84)),
    ));
    const mr = readingImport.preview(decoded, 'mangaread', 'https://www.mangaread.org');
    assert.equal(mr.entries[0].chapters[0].url, '/manga/example/special?style=list');
    const dm = readingImport.preview(decoded, 'demonicscans', 'https://www.mangademon.org');
    assert.equal(dm.entries[0].chapters[0].url, '/title/example/chapter/11/1');
});

test('reports unresolved Asura slugs and rejects corrupt, truncated and oversized files', async () => {
    const decoded = await tachibk.read(backup(manga(asuraId, '/series/stable')));
    assert.equal(readingImport.preview(decoded, 'asurascans', origin).unmatched, 1);
    await assert.rejects(tachibk.read(new Blob(['not gzip'])));
    await assert.rejects(tachibk.read(backup(Buffer.of(10, 100, 1))));
    await assert.rejects(tachibk.read(backup(bytes(104, 'not manga'))));
    await assert.rejects(tachibk.read(new Blob([Buffer.alloc(16 * 1024 * 1024 + 1)])), /under 16 MiB/);
});

test('preserves newer history and bookmarks, and importing twice does not change the result', async () => {
    const file = backup(manga(asuraId, '/comics/example',
        message(16, bytes(1, '/comics/example/chapter/5'), number(4, 1), number(6, 7)),
        message(104, bytes(1, '/comics/example/chapter/5'), number(2, 100), number(3, 400)),
    ));
    const { entries } = readingImport.preview(await tachibk.read(file), 'asurascans', origin);
    const old = normalize(entries);
    Object.assign(old[0].chapters[0], { lastRead: 200, duration: 600, page: 3, bookmark: true });
    const merged = readingImport.merge(old, entries);
    assert.equal(merged[0].chapters[0].lastRead, 200);
    assert.equal(merged[0].chapters[0].duration, 600);
    assert.equal(merged[0].chapters[0].bookmark, true);
    assert.equal(merged[0].chapters[0].page, 7);
    assert.deepEqual(normalize(readingImport.merge(merged, entries)), normalize(merged));
});

test('merges Comix history and categories while preserving newer history and existing saves', () => {
    const history = [{ seriesPath: '/title/abc-example', url: '/title/abc-example/12-chapter-1', updatedAt: 500 }];
    const storage = new Map([['nb-comix:history', JSON.stringify(history)]]);
    const chapter = { url: '/title/abc-example/13-chapter-2', name: 'Chapter 2', lastRead: 300, page: 4 };
    const entry = { key: 'abc-example', url: '/title/abc-example', title: 'Example', favorite: true,
        addedAt: 20, categories: ['Weekly'], chapters: [chapter] };
    const get = key => storage.get(key) ?? null;
    const first = nativeReadingImport.updates('comix', [entry], 'https://comix.to', get);
    assert.equal(first.has('md-comix-history'), false);
    assert.equal(first.get('md-comix-lists').lists.at(-1).items[0].path, entry.url);
    storage.set('md-comix-lists', JSON.stringify(first.get('md-comix-lists')));
    assert.equal(nativeReadingImport.updates('comix', [entry], 'https://comix.to', get).size, 0);
});

test('MangaRead imports history-only records without creating library membership', () => {
    const entries = [{ key: 'Example', url: '/manga/Example', title: 'Example', favorite: false, categories: [],
        chapters: [{ url: '/manga/Example/chapter-2', name: 'Chapter 2', lastRead: 300, page: 4 }] }];
    const changes = nativeReadingImport.updates('mangaread', entries, 'https://www.mangaread.org', () => null);
    assert.equal(changes.has('md-library'), false);
    assert.equal(changes.get('md-history')[0].chapterUrl, 'https://www.mangaread.org/manga/Example/chapter-2');
    assert.equal(changes.get('md-history')[0].pct, 0);
});

test('rolls back a partial import when the next storage write exceeds quota', () => {
    const data = new Map([['lists', 'previous']]);
    const storage = {
        getItem: key => data.get(key) ?? null,
        setItem(key, value) {
            if (key === 'history') throw new Error('quota exceeded');
            data.set(key, value);
        },
        removeItem: key => data.delete(key),
    };
    assert.throws(() => nativeReadingImport.save(storage, new Map([['lists', {}], ['new', []], ['history', []]])), /quota/);
    assert.deepEqual([...data], [['lists', 'previous']]);
});
