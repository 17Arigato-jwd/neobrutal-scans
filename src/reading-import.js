'use strict';

const readingImport = (() => {
    const sites = {
        asurascans: {
            ids: ['6247824327199706550'], names: /^asura scans$/i,
            hosts: ['asurascans.com', 'asuracomic.net'],
            series: /^\/comics\/([\w-]+)$/,
            chapter: /^\/comics\/([\w-]+)\/chapter\/[^/]+$/,
        },
        comix: {
            ids: ['7537715367149829912'], names: /^comix$/i,
            hosts: ['comix.to', 'comix.ws'],
            series: /^\/title\/([\w-]+)$/,
            chapter: /^\/title\/([\w-]+)\/\d+-chapter-[\w.-]+$/,
        },
        mangaread: {
            ids: [], names: /^mangaread(?:\.org)?$/i, hosts: ['mangaread.org'],
            series: /^\/manga\/([\w-]+)$/,
            chapter: /^\/manga\/([\w-]+)\/[^/]+$/,
        },
        demonicscans: {
            ids: [], names: /^(?:demonic\s*scans|manga\s*demon|demon\s*reader)$/i,
            hosts: ['demonicscans.org', 'mangademon.org', 'mangademon.com', 'mangademon.cc', 'mangademon.me', 'mgdemon.org', 'demonreader.org'],
            series: /^\/(?:manga|title)\/([\w-]+)$/,
            chapter: /^\/title\/([\w-]+)\/chapter\/[^/]+(?:\/\d+)?$/,
        },
    };

    function hostMatches(site, hostname) {
        return site.hosts.some(host => hostname === host || hostname === 'www.' + host);
    }

    function sourceSite(id, name) {
        return Object.values(sites).find(site => site.ids.includes(id)) ??
            Object.values(sites).find(site => site.names.test(name || ''));
    }

    function route(value, site, origin, trusted, kind, memo) {
        if (!value || /[\\\u0000-\u0020]/.test(value) || (!trusted && !/^https?:\/\//i.test(value))) return null;
        if (value.startsWith('//')) return null;
        let url;
        try { url = new URL(value, origin); } catch { return null; }
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || !hostMatches(site, url.hostname)) return null;

        let path = url.pathname.replace(/\/$/, '');
        if (site === sites.asurascans && path.startsWith('/series/')) {
            const slug = kind === 'series' ? memo?.slug : memo?.mangaSlug;
            if (typeof slug !== 'string' || !/^[\w-]+$/.test(slug)) return null;
            path = path.replace(/^\/series\/[^/]+/, '/comics/' + slug);
        }
        if (site === sites.comix && trusted && kind === 'series' && /^\/[\w-]+$/.test(path)) path = '/title' + path;
        if (site === sites.demonicscans && kind === 'series') path = path.replace(/^\/title\//, '/manga/');
        const match = path.match(site[kind]);
        if (!match) return null;
        // MangaRead reader flags and Demonic's chapter queries can affect the destination.
        return { path: path + url.search, key: match[1], canonical: path };
    }

    function preview(backup, siteName, origin) {
        const site = sites[siteName];
        const names = new Map((backup.sources || []).map(source => [source.id, source.name]));
        const categories = new Map((backup.categories || []).map(category => [category.order ?? '0', category.name]));
        const result = { entries: [], unmatched: 0, other: 0, unmatchedChapters: 0 };
        for (const manga of backup.manga) {
            const known = sourceSite(manga.source, names.get(manga.source));
            if (known && known !== site) {
                result.other += 1;
                continue;
            }
            const series = route(manga.url, site, origin, known === site, 'series', manga.memo);
            if (!series) {
                result[known === site ? 'unmatched' : 'other'] += 1;
                continue;
            }
            const byUrl = new Map();
            const history = new Map();
            for (const visit of manga.history || []) {
                if ((history.get(visit.url)?.lastRead || 0) <= (visit.lastRead || 0)) history.set(visit.url, visit);
            }
            const chapters = [...(manga.chapters || [])];
            const listed = new Set(chapters.map(chapter => chapter.url));
            for (const url of history.keys()) {
                if (!listed.has(url)) chapters.push({ url });
            }
            for (const chapter of chapters) {
                const visit = history.get(chapter.url);
                if (!chapter.read && !chapter.bookmark && !chapter.page && !visit?.lastRead) continue;
                const legacyPrefix = manga.url.replace(/\/$/, '') + '/chapter/';
                const memo = chapter.memo ?? (site === sites.asurascans && chapter.url?.startsWith(legacyPrefix)
                    ? { mangaSlug: manga.memo?.slug } : undefined);
                const link = route(chapter.url, site, origin, true, 'chapter', memo);
                if (!link || link.key !== series.key) {
                    result.unmatchedChapters += 1;
                    continue;
                }
                const record = {
                    url: link.path, name: chapter.name || link.canonical.split('/').at(-1),
                    scanlator: chapter.scanlator || '', read: !!chapter.read, bookmark: !!chapter.bookmark,
                    page: chapter.page || 0, lastRead: visit?.lastRead || 0, duration: visit?.duration || 0,
                };
                byUrl.set(record.url, mergeChapter(byUrl.get(record.url), record));
            }
            const favorite = manga.favorite !== false;
            if (favorite || byUrl.size) result.entries.push({
                key: series.key, url: series.canonical, title: manga.title || series.key,
                favorite, categories: favorite ? [...new Set((manga.categories || []).map(id => categories.get(id)).filter(Boolean))] : [],
                addedAt: manga.addedAt || 0, chapters: [...byUrl.values()],
            });
        }
        return result;
    }

    function mergeChapter(old, incoming) {
        if (!old) return incoming;
        const latest = incoming.lastRead > old.lastRead ? incoming : old;
        return {
            ...latest, read: old.read || incoming.read, bookmark: old.bookmark || incoming.bookmark,
            page: Math.max(old.page, incoming.page),
        };
    }

    function merge(existing, incoming) {
        const entries = new Map(existing.map(entry => [entry.key, entry]));
        for (const entry of incoming) {
            const old = entries.get(entry.key);
            if (!old) {
                entries.set(entry.key, entry);
                continue;
            }
            const chapters = new Map(old.chapters.map(chapter => [chapter.url, chapter]));
            for (const chapter of entry.chapters) chapters.set(chapter.url, mergeChapter(chapters.get(chapter.url), chapter));
            entries.set(entry.key, {
                ...old, favorite: old.favorite || entry.favorite,
                categories: [...new Set([...old.categories, ...entry.categories])],
                addedAt: old.addedAt && entry.addedAt ? Math.min(old.addedAt, entry.addedAt) : old.addedAt || entry.addedAt,
                chapters: [...chapters.values()],
            });
        }
        return [...entries.values()];
    }

    return { preview, merge, hostMatches, sites };
})();
