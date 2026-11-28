'use strict';

const readingResumePages = {
    asurascans: 'img[data-page-index]',
    comix: '.rpage-main .rpage-page[data-page]',
    mangaread: '.reading-content img.wp-manga-chapter-img',
    demonicscans: 'img.imgholder',
};

function resumeImportedPage(siteName) {
    const hash = location.hash.match(/^#neobrutal-page=(\d+)$/);
    if (!hash || !readingImport.hostMatches(readingImport.sites[siteName], location.hostname)) return;
    const index = Number(hash[1]);
    if (!Number.isSafeInteger(index)) return;
    function resume() {
        const pages = [...document.querySelectorAll(readingResumePages[siteName])];
        const page = siteName === 'comix'
            ? pages.find(element => Number(element.dataset.page) === index + 1)
            : pages[index];
        if (!page) return false;
        history.replaceState(history.state, '', location.pathname + location.search);
        page.scrollIntoView({ block: 'start', inline: 'center' });
        return true;
    }
    if (resume()) return;
    const observer = new MutationObserver(() => { if (resume()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}

function mountReadingImport(siteName) {
    if (window.top !== window.self || location.pathname !== '/' || !document.body ||
        !readingImport.hostMatches(readingImport.sites[siteName], location.hostname)) return;

    const key = 'neobrutal-scans:imported-reading:v1';
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; position: fixed; left: 12px; bottom: 12px; z-index: 2147483646; }
        dialog { box-sizing: border-box; width: min(680px, calc(100vw - 24px)); max-height: 85dvh;
            overflow: auto; background: #161616; color: #fff; border: 2px solid #e8d85c;
            box-shadow: 5px 5px 0 #000; font: 16px/1.5 system-ui; padding: 18px; }
        dialog::backdrop { background: #0009; }
        button, input { font: inherit; }
        button { border: 2px solid #131313; border-radius: 4px; padding: 5px 10px; cursor: pointer;
            background: #e8d85c; color: #141414; margin: 3px; }
        button:disabled { opacity: .6; cursor: default; }
        a { color: #e8d85c; }
        summary { cursor: pointer; }
        h2 { margin: 0 0 12px; }
        li { overflow-wrap: anywhere; }
    `;
    shadow.append(style);
    function element(parent, tag, label) {
        const node = document.createElement(tag);
        if (label) node.textContent = label;
        parent.append(node);
        return node;
    }
    function load() {
        const entries = JSON.parse(localStorage.getItem(key) ?? '[]');
        if (!Array.isArray(entries)) throw new Error('Stored reading data is invalid.');
        return entries;
    }
    function link(parent, path, label) {
        const node = element(parent, 'a', label);
        if (typeof path === 'string' && /^\/(?![\/\\])/.test(path) && !/[\\\s]/.test(path)) node.href = location.origin + path;
        return node;
    }
    function render(parent, entries) {
        parent.replaceChildren();
        const list = element(parent, 'ul');
        for (const entry of entries) {
            const item = element(list, 'li');
            link(item, entry.url, entry.title);
            if (entry.favorite) element(item, 'span', ' · Library' + (entry.categories.length ? ' · ' + entry.categories.join(', ') : ''));
            if (!entry.chapters.length) continue;
            const details = element(item, 'details');
            const history = entry.chapters.filter(chapter => chapter.lastRead).sort((a, b) => b.lastRead - a.lastRead);
            if (history.length) {
                element(item, 'span', ' · ');
                const chapter = history[0];
                const resume = !chapter.read && chapter.page > 0 ? '#neobrutal-page=' + chapter.page : '';
                link(item, chapter.url + resume, 'Continue reading');
            }
            element(details, 'summary', entry.chapters.length + ' chapters with reading data');
            const chapters = element(details, 'ul');
            for (const chapter of entry.chapters) {
                const row = element(chapters, 'li');
                link(row, chapter.url, chapter.name);
                const metadata = [
                    chapter.scanlator, chapter.read && 'Read', chapter.bookmark && 'Bookmarked',
                    chapter.page > 0 && 'Backup page index ' + chapter.page,
                    chapter.lastRead > 0 && new Date(chapter.lastRead).toLocaleString(),
                ].filter(Boolean);
                if (metadata.length) element(row, 'span', ' · ' + metadata.join(' · '));
            }
        }
    }

    const open = element(shadow, 'button', 'Reading backups');
    const dialog = element(shadow, 'dialog');
    element(dialog, 'h2', 'Reading backups').id = 'backup-heading';
    dialog.setAttribute('aria-labelledby', 'backup-heading');
    const close = element(dialog, 'button', 'Close');
    const label = element(dialog, 'label', ' Choose a .tachibk backup ');
    const input = element(label, 'input');
    input.type = 'file';
    input.accept = '.tachibk,.gz,application/gzip,application/octet-stream';
    const status = element(dialog, 'p');
    status.setAttribute('role', 'status');
    const apply = element(dialog, 'button', 'Import into this browser');
    apply.hidden = true;
    const results = element(dialog, 'div');
    let pending;
    let selection = 0;

    function showSaved() {
        pending = null;
        apply.hidden = true;
        try {
            const entries = load();
            status.textContent = entries.length ? 'Imported reading data on this site' : 'Choose a backup to preview this site’s reading data.';
            render(results, entries);
        } catch {
            status.textContent = 'Could not read the saved reading data.';
        }
    }
    open.addEventListener('click', () => {
        showSaved();
        dialog.showModal();
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        selection += 1;
        input.value = '';
        pending = null;
    });
    input.addEventListener('change', async () => {
        const current = ++selection;
        showSaved();
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        status.textContent = 'Reading backup…';
        try {
            const backup = await tachibk.read(file);
            if (current !== selection || !dialog.open) return;
            pending = readingImport.preview(backup, siteName, location.origin);
            const { entries, other, unmatched, unmatchedChapters } = pending;
            status.textContent = `${entries.length} titles ready to merge. ${other} from other or unknown sources, ${unmatched} unmatched titles, ${unmatchedChapters} unmatched chapters. Only library and reading data can be imported.`;
            render(results, entries);
            apply.hidden = !entries.length;
        } catch (error) {
            if (current === selection && dialog.open) status.textContent = 'Could not open backup. ' + error.message;
        }
    });
    apply.addEventListener('click', () => {
        if (!pending) return;
        try {
            const entries = readingImport.merge(load(), pending.entries);
            const changes = nativeReadingImport.updates(siteName, pending.entries, location.origin,
                name => localStorage.getItem(name));
            changes.set(key, entries);
            nativeReadingImport.save(localStorage, changes);
            showSaved();
            status.textContent = `Import complete. ${entries.length} titles stored on this site.` +
                (changes.size > 1 ? ' Reload this page to see the updated library and Continue Reading.' : '');
        } catch {
            status.textContent = 'Could not save the import. The previous reading data is intact.';
        }
    });
    document.body.append(host);
}
