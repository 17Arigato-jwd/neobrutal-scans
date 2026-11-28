'use strict';

const nativeReadingImport = (() => {
    function latestChapter(entry) {
        return entry.chapters.reduce((latest, chapter) =>
            chapter.lastRead > (latest?.lastRead || 0) ? chapter : latest, null);
    }

    function mergeHistory(history, record, key, limit) {
        if (!record) return history;
        const previous = history.find(item => item[key] === record[key]);
        // Older versions did not record a visit time. Preserve those entries.
        if (previous && (!previous.updatedAt || previous.updatedAt >= record.updatedAt)) return history;
        return [record, ...history.filter(item => item[key] !== record[key])]
            .sort((a, b) => (b.updatedAt ?? Infinity) - (a.updatedAt ?? Infinity)).slice(0, limit);
    }

    function updates(site, entries, origin, get) {
        const changes = new Map();
        function read(key, fallback, legacyKey) {
            const value = get(key) ?? (legacyKey ? get(legacyKey) : null);
            return value === null ? fallback : JSON.parse(value);
        }
        if (site === 'comix') {
            const listsKey = 'md-comix-lists', historyKey = 'md-comix-history';
            const library = read(listsKey, { lists: [
                { id: 'reading', name: 'Currently Reading', items: [] },
                { id: 'plan', name: 'Plan to Read', items: [] },
                { id: 'completed', name: 'Completed', items: [] },
            ] }, 'nb-comix:lists');
            let history = read(historyKey, [], 'nb-comix:history');
            const oldHistory = history;
            let libraryChanged = false;
            for (const entry of entries) {
                const chapter = latestChapter(entry);
                if (chapter) history = mergeHistory(history, {
                    seriesPath: entry.url, url: chapter.url.split('?')[0], title: entry.title, label: chapter.name,
                    page: chapter.page + 1, totalPages: 0, cover: '', updatedAt: chapter.lastRead,
                }, 'seriesPath', 16);
                if (!entry.favorite) continue;
                const names = entry.categories.length ? entry.categories : ['Plan to Read'];
                for (const name of names) {
                    let list = library.lists.find(item => item.name === name || (item.id === 'reading' && name === 'Currently Reading'));
                    if (!list) {
                        list = { id: 'backup-' + name, name, items: [] };
                        library.lists.push(list);
                    }
                    if (list.items.some(item => item.path === entry.url)) continue;
                    list.items.push({ path: entry.url, title: entry.title, cover: '', addedAt: entry.addedAt });
                    libraryChanged = true;
                }
            }
            if (libraryChanged) changes.set(listsKey, library);
            if (history !== oldHistory) changes.set(historyKey, history);
        } else if (site === 'mangaread') {
            const libraryKey = 'md-library', historyKey = 'md-history';
            const library = read(libraryKey, { 'Currently Reading': [], 'Plan to Read': [], Completed: [] });
            let history = read(historyKey, []);
            const oldHistory = history;
            let libraryChanged = false;
            for (const entry of entries) {
                const slug = entry.key.toLowerCase();
                const url = new URL(entry.url + '/', origin).href;
                const chapter = latestChapter(entry);
                const chapterUrl = chapter ? new URL(chapter.url, origin).href : '';
                if (chapter) history = mergeHistory(history, {
                    slug, series: entry.title, seriesUrl: url, chapterUrl, chapterLabel: chapter.name,
                    cover: '', pct: 0, updatedAt: chapter.lastRead,
                }, 'slug', 30);
                if (!entry.favorite) continue;
                const names = entry.categories.length ? entry.categories : ['Plan to Read'];
                for (const name of names) {
                    if (!Object.hasOwn(library, name)) Object.defineProperty(library, name, { value: [], enumerable: true });
                    if (!Array.isArray(library[name]) || library[name].some(item => item.slug === slug)) continue;
                    library[name].push({ slug, title: entry.title, url, cover: '', chapterUrl,
                        chapterLabel: chapter?.name || '', addedAt: entry.addedAt });
                    libraryChanged = true;
                }
            }
            if (libraryChanged) changes.set(libraryKey, library);
            if (history !== oldHistory) changes.set(historyKey, history);
        }
        return changes;
    }

    function save(storage, changes) {
        const writes = [...changes].map(([key, value]) => [key, JSON.stringify(value), storage.getItem(key)]);
        const applied = [];
        try {
            for (const [key, value, before] of writes) {
                if (value === before) continue;
                storage.setItem(key, value);
                applied.push([key, before]);
            }
        } catch (error) {
            // Free the changed space first, so an earlier expansion cannot block a restore.
            for (const [key] of applied) storage.removeItem(key);
            for (const [key, before] of applied) {
                if (before !== null) storage.setItem(key, before);
            }
            throw error;
        }
    }

    return { updates, save };
})();
