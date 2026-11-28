'use strict';

// Wire fields used by the Mihon 0.21 backup models and compatible exporters.
const tachibk = (() => {
    const MiB = 1024 * 1024;
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    const invalid = () => new Error('Invalid or unsupported .tachibk backup.');
    const schemas = {
        backup: { 1: ['manga', 'manga', true], 2: ['categories', 'category', true], 101: ['sources', 'source', true] },
        manga: {
            1: ['source', 'id'], 2: ['url', 'text'], 3: ['title', 'text'], 13: ['addedAt', 'int'],
            16: ['chapters', 'chapter', true], 17: ['categories', 'id', true],
            100: ['favorite', 'bool'], 104: ['history', 'history', true], 112: ['memo', 'memo'],
        },
        category: { 1: ['name', 'text'], 2: ['order', 'id'] },
        source: { 1: ['name', 'text'], 2: ['id', 'id'] },
        chapter: {
            1: ['url', 'text'], 2: ['name', 'text'], 3: ['scanlator', 'text'], 4: ['read', 'bool'],
            5: ['bookmark', 'bool'], 6: ['page', 'int'], 13: ['memo', 'memo'],
        },
        history: { 1: ['url', 'text'], 2: ['lastRead', 'int'], 3: ['duration', 'int'] },
    };

    function decode(bytes, schema = 'backup') {
        let offset = 0;
        const result = {};
        function varint() {
            let value = 0n;
            for (let i = 0; i < 10; i += 1) {
                const byte = bytes[offset++];
                if (byte === undefined || (i === 9 && byte > 1)) throw invalid();
                value |= BigInt(byte & 127) << BigInt(7 * i);
                if (byte < 128) return value;
            }
            throw invalid();
        }
        while (offset < bytes.length) {
            const tag = varint();
            if (tag < 8n || tag > 0xffffffffn) throw invalid();
            const wire = Number(tag & 7n);
            const field = schemas[schema][Number(tag >> 3n)];
            let raw;
            if (wire === 0) raw = varint();
            else if (wire === 2) {
                const length = Number(varint());
                if (length > bytes.length - offset) throw invalid();
                raw = bytes.subarray(offset, offset + length);
                offset += length;
            } else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4;
            else throw invalid();
            if (offset > bytes.length) throw invalid();
            if (!field) continue;

            const [name, type, repeated] = field;
            const numeric = type === 'id' || type === 'int' || type === 'bool';
            if (numeric && wire === 2 && repeated) {
                // Protobuf readers must accept packed and unpacked repeated scalars.
                const packed = [];
                const end = offset;
                offset -= raw.length;
                while (offset < end) packed.push(varint().toString());
                if (offset !== end) throw invalid();
                if (packed.length <= 10000) (result[name] ??= []).push(...packed);
                if (packed.length > 10000) throw invalid();
                continue;
            }
            if (wire !== (numeric ? 0 : 2)) throw invalid();
            let value;
            if (type === 'id') value = BigInt.asIntN(64, raw).toString();
            else if (type === 'int') {
                const signed = BigInt.asIntN(64, raw);
                value = signed >= 0n && signed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(signed) : 0;
            } else if (type === 'bool') value = raw !== 0n;
            else if (type === 'text') value = utf8.decode(raw);
            else if (type === 'memo') {
                try { value = JSON.parse(utf8.decode(raw)); } catch { continue; }
            } else value = decode(raw, type);

            if (repeated) (result[name] ??= []).push(value);
            else result[name] = value;
        }
        return result;
    }

    async function read(file) {
        if (!file.size || file.size > 16 * MiB) throw new Error('Choose a backup under 16 MiB.');
        if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress backups.');
        const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
        if (signature[0] !== 31 || signature[1] !== 139) throw invalid();
        const stream = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await stream.read();
                if (done) break;
                size += value.length;
                if (size > 64 * MiB) {
                    await stream.cancel();
                    throw new Error('The unpacked backup exceeds 64 MiB.');
                }
                chunks.push(value);
            }
        } finally {
            stream.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        const backup = decode(bytes);
        if (!backup.manga?.length || backup.manga.some(manga => manga.source === undefined || !manga.url)) {
            throw invalid();
        }
        return backup;
    }

    return { read };
})();
