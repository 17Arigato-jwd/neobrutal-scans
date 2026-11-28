'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sources = ['tachibk', 'reading-import', 'reading-import-native', 'reading-import-ui'];
const bundle = sources.map(name => fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8').trimEnd()).join('\n\n');
const start = '// BEGIN GENERATED READING IMPORT';
const end = '// END GENERATED READING IMPORT';
const check = process.argv.includes('--check');

for (const site of ['asurascans', 'comix', 'mangaread', 'demonicscans']) {
    const file = path.join(root, site + '.user.js');
    const original = fs.readFileSync(file, 'utf8');
    const marker = original.indexOf(start);
    const endMarker = original.indexOf(end);
    const base = marker < 0 ? original : original.slice(0, marker) + original.slice(endMarker + end.length).replace(/^\n/, '');
    const metadata = '// ==/UserScript==';
    const embedded = base.replace(metadata, `${metadata}
${start}
(() => {
    'use strict';
    const isImportPage = location.pathname === '/' || ('${site}' === 'asurascans' &&
        /^\\/(?:comics|browse(?:\\/comics)?)\\/?$/.test(location.pathname));
    if (typeof document.addEventListener !== 'function' || !location.hostname ||
        (!isImportPage && !location.hash?.startsWith('#neobrutal-page='))) return;

${bundle.split('\n').map(line => line ? '    ' + line : '').join('\n')}

    const mount = () => {
        if (window.top !== window.self || !document.body) return;
        if (isImportPage) mountReadingImport('${site}');
        else resumeImportedPage('${site}');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})();
${end}`);
    if (check && embedded !== original) {
        process.stderr.write(site + '.user.js has an outdated reading import bundle.\n');
        process.exitCode = 1;
    } else if (!check && embedded !== original) fs.writeFileSync(file, embedded);
}
