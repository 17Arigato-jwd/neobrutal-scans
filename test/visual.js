/**
 * test/visual.js - Automated Headless Browser Visual Test Harness
 *
 * Implements Milestone E2E headless visual regression testing for:
 *   - MangaRead userscript (mangaread.user.js)
 *   - DemonicScans userscript (demonicscans.user.js)
 *
 * Captures 12 deterministic screenshots into .temp/screenshot/ using
 * pre-installed Chrome for Testing and local mock HTTP fixture server.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// Configuration
const PORT = parseInt(process.env.TEST_PORT || process.env.PORT || '8765', 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, '.temp');
const MANGAREAD_TEMP_DIR = path.join(TEMP_DIR, 'mangaread');
const SCREENSHOT_DIR = path.join(TEMP_DIR, 'screenshot');

const CHROME_PATH = process.env.CHROME_BIN || '/home/varchas/.cache/puppeteer/chrome/linux-152.0.7977.75/chrome-linux64/chrome';

// 1x1 Transparent PNG placeholder buffer
const EMPTY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

// Read userscript sources
const DEMONIC_SCRIPT = fs.readFileSync(path.join(ROOT_DIR, 'demonicscans.user.js'), 'utf8');
const MANGAREAD_SCRIPT = fs.readFileSync(path.join(ROOT_DIR, 'mangaread.user.js'), 'utf8');

// Sample payload for DemonicScans Continue Reading cookie contract (md_cr)
const CONTINUE_READING_PAYLOAD = [
    {
        id: 'talent-swallowing-magician',
        title: 'Talent-Swallowing Magician',
        img: '/img/talent.jpg',
        seriesUrl: '/manga/Talent%25252DSwallowing-Magician',
        lastReadUrl: '/chaptered.php?manga=11127&chapter=50',
        lastReadNum: 50,
        lastReadLbl: 'Chapter 50',
        nextUrl: '/chaptered.php?manga=11127&chapter=51',
        nextNum: 51,
        nextLbl: 'Chapter 51',
        latestNum: 151,
        ts: 1700000000000
    },
    {
        id: 'castle-2-pinnacle',
        title: 'Castle 2: Pinnacle',
        img: '/img/castle.jpg',
        seriesUrl: '/manga/Castle-2%253A-Pinnacle',
        lastReadUrl: '/chaptered.php?manga=11916&chapter=130',
        lastReadNum: 130,
        lastReadLbl: 'Chapter 130',
        nextUrl: '/chaptered.php?manga=11916&chapter=131',
        nextNum: 131,
        nextLbl: 'Chapter 131',
        latestNum: 135,
        ts: 1700000000000
    }
];

/**
 * Creates and starts local HTTP fixture server
 */
function startFixtureServer(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://127.0.0.1:${port}`);
            const pathname = parsedUrl.pathname;

            // 1. Image fallback (relative or external mock paths)
            if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(pathname) || pathname.startsWith('/img/')) {
                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'no-cache'
                });
                return res.end(EMPTY_PNG);
            }

            let filePath = null;
            let contentType = 'text/html; charset=utf-8';

            // 2. Static CSS and JS assets
            if (pathname === '/css/mainstyle.css' || pathname === '/mainstyle.css' || pathname === '/temp/mainstyle.css') {
                filePath = path.join(TEMP_DIR, 'mainstyle.css');
                contentType = 'text/css; charset=utf-8';
            } else if (pathname === '/wp-content/plugins/madara-core/assets/js/script.js' || pathname === '/mangaread/script.js' || pathname === '/script.js') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'script.js');
                contentType = 'application/javascript; charset=utf-8';
            }
            // 3. DemonicScans routes
            else if (pathname === '/' || pathname === '/index.html' || pathname === '/index.php') {
                filePath = path.join(TEMP_DIR, 'index.html');
            } else if (pathname === '/chaptered.php' || pathname === '/chapter_reader.html') {
                filePath = path.join(TEMP_DIR, 'chapter_reader.html');
            } else if (pathname === '/translationlist.php' || pathname === '/translationlist.html') {
                filePath = path.join(TEMP_DIR, 'translationlist.html');
            } else if (pathname === '/lastupdates.php' || pathname === '/lastupdates.html') {
                filePath = path.join(TEMP_DIR, 'lastupdates.html');
            } else if (pathname === '/lastnvupdates.php') {
                filePath = path.join(TEMP_DIR, 'lastnvupdates.html');
            } else if (pathname === '/newmangalist.php') {
                filePath = path.join(TEMP_DIR, 'newmangalist.html');
            } else if (/^\/(manga|title|novel)\//.test(pathname) || pathname === '/manga_overview.html') {
                filePath = path.join(TEMP_DIR, 'manga_overview.html');
            }
            // 4. MangaRead routes
            else if (pathname === '/mangaread' || pathname === '/mangaread/' || pathname === '/mangaread/index.html' || pathname === '/mangaread/homepage.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'homepage.html');
            } else if (pathname.includes('/god-level-assassin')) {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'god-level-assassin.html');
            } else if (pathname.startsWith('/mangaread/manga/')) {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'god-level-assassin.html');
            } else if (pathname === '/mangaread/manga_detail.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'manga_detail.html');
            } else if (pathname.startsWith('/mangaread/chapter/') || pathname === '/mangaread/chapter_reader.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'chapter_reader.html');
            } else if (pathname === '/mangaread/listing' || pathname === '/mangaread/listing/' || pathname === '/mangaread/listing.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'listing.html');
            } else if (pathname === '/mangaread/search' || pathname === '/mangaread/search/' || pathname === '/mangaread/search.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'search.html');
            }

            // Fallback for relative paths in TEMP_DIR or MANGAREAD_TEMP_DIR
            if (!filePath || !fs.existsSync(filePath)) {
                const altPath1 = path.join(TEMP_DIR, pathname.replace(/^\//, ''));
                const altPath2 = path.join(MANGAREAD_TEMP_DIR, pathname.replace(/^\/mangaread\//, '').replace(/^\//, ''));
                if (fs.existsSync(altPath1) && fs.statSync(altPath1).isFile()) {
                    filePath = altPath1;
                    if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
                    else if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
                } else if (fs.existsSync(altPath2) && fs.statSync(altPath2).isFile()) {
                    filePath = altPath2;
                    if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
                    else if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
                }
            }

            // 5. Response output
            if (filePath && fs.existsSync(filePath)) {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache'
                });
                return fs.createReadStream(filePath).pipe(res);
            }

            // Generic stub for missing stylesheets or scripts
            if (pathname.endsWith('.css')) {
                res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
                return res.end('/* stub css */');
            }
            if (pathname.endsWith('.js')) {
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
                return res.end('/* stub js */');
            }

            // Fallback 404
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Not found: ${pathname}`);
        });

        server.listen(port, '127.0.0.1', () => {
            console.log(`[FixtureServer] Listening on http://127.0.0.1:${port}`);
            resolve(server);
        });

        server.on('error', reject);
    });
}

/**
 * Launch headless Chrome browser instance
 */
async function launchBrowser() {
    if (!fs.existsSync(CHROME_PATH)) {
        throw new Error(`Chrome for Testing binary not found at ${CHROME_PATH}. Configure CHROME_BIN env variable.`);
    }

    console.log(`[Puppeteer] Launching Chrome binary: ${CHROME_PATH}`);
    return await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1440,900'
        ],
        defaultViewport: {
            width: 1440,
            height: 900
        }
    });
}

/**
 * Prepares a new page with ad-blocking, userscript sandbox polyfills, and userscript injection
 */
async function createTestingPage(browser, userscriptContent, preInitFn = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Enable request interception for tracker blocking and remote image handling
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url().toLowerCase();
        const resourceType = req.resourceType();

        // Abort ad and tracker requests
        if (
            url.includes('google-analytics') ||
            url.includes('googletagmanager') ||
            url.includes('pubfuture') ||
            url.includes('pubadx') ||
            url.includes('yandex') ||
            url.includes('disqus')
        ) {
            return req.abort();
        }

        // Return 1x1 image for external CDN image requests to ensure offline resilience
        if (resourceType === 'image' && !url.startsWith('http://127.0.0.1') && !url.startsWith('data:')) {
            return req.respond({
                status: 200,
                contentType: 'image/png',
                body: EMPTY_PNG
            });
        }

        req.continue();
    });

    // Sandbox & Userscript GM polyfills
    await page.evaluateOnNewDocument(() => {
        window.unsafeWindow = window;
        if (typeof window.GM_xmlhttpRequest === 'undefined') window.GM_xmlhttpRequest = () => {};
        if (typeof window.GM === 'undefined') window.GM = { xmlHttpRequest: () => {} };
        // If loaded on local mock server at /mangaread/ or /mangaread, alias pathname to '/' so isHome checks evaluate cleanly
        if (location.pathname === '/mangaread/' || location.pathname === '/mangaread') {
            try { history.replaceState(null, '', '/'); } catch (_) {}
        }
    });

    // Custom pre-initialization (e.g. setting theme localStorage or cookies)
    if (preInitFn) {
        await page.evaluateOnNewDocument(preInitFn);
    }

    // Inject userscript at document-start
    await page.evaluateOnNewDocument(userscriptContent);

    return page;
}

/**
 * Main Visual Test Suite Runner
 */
async function runVisualTests() {
    console.log('=== Starting E2E Visual Test Runner ===');

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    let server = null;
    let browser = null;

    // Graceful teardown handler
    let isTearingDown = false;
    const cleanup = async () => {
        if (isTearingDown) return;
        isTearingDown = true;
        if (browser) {
            try { await browser.close(); console.log('[Puppeteer] Browser closed.'); } catch (_) {}
        }
        if (server) {
            try { server.close(); console.log('[FixtureServer] Server closed.'); } catch (_) {}
        }
    };

    process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
    process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });

    try {
        server = await startFixtureServer(PORT);
        browser = await launchBrowser();

        const results = [];

        // -----------------------------------------------------------------
        // SCENARIO 1: mangaread-home-hero-carousel.png
        // -----------------------------------------------------------------
        console.log('[Scenario 1/12] MangaRead Homepage Hero Carousel...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-hero', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-home-hero-carousel.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-home-hero-carousel.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 2: mangaread-light-mode-theme.png
        // -----------------------------------------------------------------
        console.log('[Scenario 2/12] MangaRead Light Mode Linear Gradient Theme...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT, () => {
                localStorage.setItem('md-theme', JSON.stringify('light'));
            });
            await page.goto(`${BASE_URL}/mangaread/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('html[data-md-theme="light"]', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-light-mode-theme.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-light-mode-theme.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 3: mangaread-account-and-bookmark-removed.png
        // -----------------------------------------------------------------
        console.log('[Scenario 3/12] MangaRead Account Elements & Bookmark Button Debloating...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/god-level-assassin-im-the-shadow/`, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 500));

            // Verify debloated elements are absent or hidden
            const elementsHidden = await page.evaluate(() => {
                const bm = document.querySelector('.add-bookmark');
                const modal = document.querySelector('.c-modal_item');
                const bmHidden = !bm || getComputedStyle(bm).display === 'none' || getComputedStyle(bm).visibility === 'hidden';
                const modalHidden = !modal || getComputedStyle(modal).display === 'none' || getComputedStyle(modal).visibility === 'hidden';
                return bmHidden && modalHidden;
            });
            console.log(`  - Account/Bookmark debloat verified: ${elementsHidden}`);

            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-account-and-bookmark-removed.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-account-and-bookmark-removed.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 4: mangaread-comments-theme-light.png
        // -----------------------------------------------------------------
        console.log('[Scenario 4/12] MangaRead Comments Dynamic Theme (Light Mode)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT, () => {
                localStorage.setItem('md-theme', JSON.stringify('light'));
            });
            await page.goto(`${BASE_URL}/mangaread/manga/god-level-assassin-im-the-shadow/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#wpdcom, #respond', { timeout: 8000 });
            await page.evaluate(() => {
                const el = document.querySelector('#wpdcom, #respond');
                if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-comments-theme-light.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-comments-theme-light.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 5: mangaread-comments-theme-dark.png
        // -----------------------------------------------------------------
        console.log('[Scenario 5/12] MangaRead Comments Dynamic Theme (Dark Mode)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT, () => {
                localStorage.setItem('md-theme', JSON.stringify('dark'));
            });
            await page.goto(`${BASE_URL}/mangaread/manga/god-level-assassin-im-the-shadow/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#wpdcom, #respond', { timeout: 8000 });
            await page.evaluate(() => {
                const el = document.querySelector('#wpdcom, #respond');
                if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-comments-theme-dark.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-comments-theme-dark.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 6: mangaread-no-duplicate-back-to-top.png
        // -----------------------------------------------------------------
        console.log('[Scenario 6/12] MangaRead Single Back-to-Top Button (#md-top)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-top', { timeout: 8000 });
            await page.evaluate(() => window.scrollTo(0, 1500));
            await new Promise(r => setTimeout(r, 400));

            const topButtonsState = await page.evaluate(() => {
                const nativeBtn = document.querySelector('.go-to-top');
                const mdTop = document.querySelector('#md-top');
                const nativeHidden = !nativeBtn || getComputedStyle(nativeBtn).display === 'none';
                const mdTopVisible = mdTop && mdTop.classList.contains('show');
                return { nativeHidden, mdTopVisible };
            });
            console.log(`  - Back-to-top state: mdTopVisible=${topButtonsState.mdTopVisible}, nativeHidden=${topButtonsState.nativeHidden}`);

            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-no-duplicate-back-to-top.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-no-duplicate-back-to-top.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 7: mangaread-series-page-ui.png
        // -----------------------------------------------------------------
        console.log('[Scenario 7/12] MangaRead Series Detail Page Restored UI...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/god-level-assassin-im-the-shadow/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.c-sub-header-nav', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-series-page-ui.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'mangaread-series-page-ui.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 8: demonicscans-chapter-reader.png
        // -----------------------------------------------------------------
        console.log('[Scenario 8/12] DemonicScans Chapter Reader Images & Comments...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/chaptered.php?manga=11127&chapter=151`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('img.imgholder', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));

            const readerState = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img.imgholder'));
                const visibleImgs = imgs.filter(i => getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility !== 'hidden');
                const cwComments = document.querySelector('#cw-comments');
                const commentsVisible = cwComments && getComputedStyle(cwComments).display !== 'none';
                return { count: imgs.length, visible: visibleImgs.length, commentsVisible };
            });
            console.log(`  - Reader images: ${readerState.visible}/${readerState.count} visible, commentsVisible=${readerState.commentsVisible}`);

            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-chapter-reader.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'demonicscans-chapter-reader.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 9: demonicscans-hero-hover-pause.png
        // -----------------------------------------------------------------
        console.log('[Scenario 9/12] DemonicScans Hero Carousel Hover Pause Behavior...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-hero', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));

            // Hover over the hero carousel thumbnail
            await page.hover('#md-hero .md-hero-thumb, #md-hero');
            await new Promise(r => setTimeout(r, 200));

            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-hero-hover-pause.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'demonicscans-hero-hover-pause.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 10: demonicscans-latest-translations.png
        // -----------------------------------------------------------------
        console.log('[Scenario 10/12] DemonicScans Latest Translations Portrait Layout...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/translationlist.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.updates-element, [data-md-trans="1"]', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-latest-translations.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'demonicscans-latest-translations.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 11: demonicscans-latest-updates.png
        // -----------------------------------------------------------------
        console.log('[Scenario 11/12] DemonicScans Latest Updates Horizontal Cards with Timestamps...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/lastupdates.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.updates-element', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-latest-updates.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'demonicscans-latest-updates.png', path: outPath });
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 12: demonicscans-continue-reading.png
        // -----------------------------------------------------------------
        console.log('[Scenario 12/12] DemonicScans Continue Reading Cookie-Persisted Section...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT, () => {
                const payload = [
                    {
                        id: 'talent-swallowing-magician',
                        title: 'Talent-Swallowing Magician',
                        img: '/img/talent.jpg',
                        seriesUrl: '/manga/Talent%25252DSwallowing-Magician',
                        lastReadUrl: '/chaptered.php?manga=11127&chapter=50',
                        lastReadNum: 50,
                        lastReadLbl: 'Chapter 50',
                        nextUrl: '/chaptered.php?manga=11127&chapter=51',
                        nextNum: 51,
                        nextLbl: 'Chapter 51',
                        latestNum: 151,
                        ts: Date.now() - 3600000
                    },
                    {
                        id: 'castle-2-pinnacle',
                        title: 'Castle 2: Pinnacle',
                        img: '/img/castle.jpg',
                        seriesUrl: '/manga/Castle-2%253A-Pinnacle',
                        lastReadUrl: '/chaptered.php?manga=11916&chapter=130',
                        lastReadNum: 130,
                        lastReadLbl: 'Chapter 130',
                        nextUrl: '/chaptered.php?manga=11916&chapter=131',
                        nextNum: 131,
                        nextLbl: 'Chapter 131',
                        latestNum: 135,
                        ts: Date.now() - 7200000
                    }
                ];
                document.cookie = `md_cr=${encodeURIComponent(JSON.stringify(payload))}; path=/; max-age=2592000`;
            });

            // Set browser cookie via Puppeteer cookie API as well
            await page.setCookie({
                name: 'md_cr',
                value: encodeURIComponent(JSON.stringify(CONTINUE_READING_PAYLOAD)),
                domain: '127.0.0.1',
                path: '/',
                httpOnly: false,
                secure: false
            });

            await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-continue-reading', { timeout: 8000 });
            await page.evaluate(() => {
                const el = document.querySelector('#md-continue-reading');
                if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-continue-reading.png');
            await page.screenshot({ path: outPath });
            results.push({ name: 'demonicscans-continue-reading.png', path: outPath });
            await page.close();
        }

        // Summary & Validation
        console.log('\n=== E2E Visual Test Execution Summary ===');
        console.log(`Total Scenarios: ${results.length}/12 captured`);
        let allValid = true;
        for (const item of results) {
            const stats = fs.statSync(item.path);
            const sizeKB = (stats.size / 1024).toFixed(1);
            if (stats.size === 0) {
                console.error(`  ❌ ${item.name} is EMPTY!`);
                allValid = false;
            } else {
                console.log(`  ✔ ${item.name} (${sizeKB} KB)`);
            }
        }

        if (!allValid || results.length !== 12) {
            throw new Error(`Visual test suite incomplete: expected 12 non-empty screenshots, got ${results.length}`);
        }

        console.log('\nALL 12 VISUAL SCREENSHOTS SUCCESSFULLY CAPTURED!\n');
    } finally {
        await cleanup();
    }
}

// Execute runner if invoked directly
if (require.main === module) {
    runVisualTests()
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Visual Test Runner Failed:', err);
            process.exit(1);
        });
}

module.exports = {
    startFixtureServer,
    launchBrowser,
    runVisualTests
};
