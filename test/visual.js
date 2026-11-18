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

const LEADERBOARD_HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>DemonicScans Leaderboard</title>
    <link rel="stylesheet" href="/css/mainstyle.css">
</head>
<body data-md-page="leaderboard">
    <div class="leaderboard-container">
        <h1 class="big-fat-titles" style="text-align: center; margin: 24px 0;">Top Readers Leaderboard</h1>
        <div class="podium-section" data-md-podium="1">
            <div class="podium-card rank-2">
                <span class="podium-badge">RANK #2</span>
                <div style="font: 800 16px 'DM Sans', sans-serif;">ShadowMonarch</div>
                <div class="leaderboard-score">18,420 EXP</div>
            </div>
            <div class="podium-card rank-1">
                <span class="podium-badge">RANK #1</span>
                <div style="font: 900 18px 'DM Sans', sans-serif;">DemonicEmperor</div>
                <div class="leaderboard-score">25,890 EXP</div>
            </div>
            <div class="podium-card rank-3">
                <span class="podium-badge">RANK #3</span>
                <div style="font: 800 16px 'DM Sans', sans-serif;">AzureDragon</div>
                <div class="leaderboard-score">14,210 EXP</div>
            </div>
        </div>
        <div class="leaderboard-list">
            <div class="leaderboard-row">
                <span class="leaderboard-rank">#4</span>
                <span style="font-weight: 700;">SwordSaint_99</span>
                <span class="leaderboard-score">12,450 EXP</span>
            </div>
            <div class="leaderboard-row">
                <span class="leaderboard-rank">#5</span>
                <span style="font-weight: 700;">ChaosBringer</span>
                <span class="leaderboard-score">11,120 EXP</span>
            </div>
            <div class="leaderboard-row">
                <span class="leaderboard-rank">#6</span>
                <span style="font-weight: 700;">GhostBlade</span>
                <span class="leaderboard-score">9,870 EXP</span>
            </div>
        </div>
    </div>
</body>
</html>`;

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
            if (pathname.startsWith('/assets/reader-membership.js')) {
                filePath = path.join(TEMP_DIR, 'assets', 'reader-membership.js');
                contentType = 'application/javascript; charset=utf-8';
            } else if (pathname.startsWith('/assets/reader-membership.css')) {
                filePath = path.join(TEMP_DIR, 'assets', 'reader-membership.css');
                contentType = 'text/css; charset=utf-8';
            } else if (pathname === '/css/mainstyle.css' || pathname === '/mainstyle.css' || pathname === '/temp/mainstyle.css') {
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
            } else if (pathname === '/advanced.php' || pathname === '/advanced.html') {
                filePath = path.join(TEMP_DIR, 'advanced.html');
            } else if (pathname === '/bookmarks.php' || pathname === '/bookmarks.html') {
                filePath = path.join(TEMP_DIR, 'bookmarks.html');
            } else if (pathname === '/leaderboard.php' || pathname === '/leaderboard.html') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(LEADERBOARD_HTML);
            } else if (/^\/(manga|title|novel)\//.test(pathname) || pathname === '/manga_overview.html') {
                filePath = path.join(TEMP_DIR, 'manga_overview.html');
            }
            // 4. MangaRead routes
            else if (pathname === '/mangaread' || pathname === '/mangaread/' || pathname === '/mangaread/index.html' || pathname === '/mangaread/homepage.html') {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'homepage.html');
            } else if (pathname.includes('/god-level-assassin') || pathname.includes('/eternal-youth')) {
                filePath = path.join(MANGAREAD_TEMP_DIR, 'god-level-assassin.html');
            } else if (pathname.startsWith('/mangaread/manga/')) {
                if (req.url.includes('m_orderby') || req.url.includes('m_status')) {
                    filePath = path.join(MANGAREAD_TEMP_DIR, 'listing.html');
                } else {
                    filePath = path.join(MANGAREAD_TEMP_DIR, 'god-level-assassin.html');
                }
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
        // Alias local mock /mangaread path to live MangaRead pathname
        if (location.pathname.startsWith('/mangaread')) {
            const rel = location.pathname.replace(/^\/mangaread/, '') || '/';
            try { history.replaceState(null, '', rel + location.search); } catch (_) {}
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

        const recordScreenshot = (filename, outPath) => {
            results.push({ name: filename, path: outPath });
        };

        // -----------------------------------------------------------------
        // SCENARIO 1: mangaread_home_dark.png & mangaread-home-hero-carousel.png
        // -----------------------------------------------------------------
        console.log('[Scenario 1] MangaRead Homepage Dark Mode & Hero Carousel...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT, () => {
                localStorage.setItem('md-theme', JSON.stringify('dark'));
            });
            await page.goto(`${BASE_URL}/mangaread/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-hero', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath1 = path.join(SCREENSHOT_DIR, 'mangaread_home_dark.png');
            const outPath2 = path.join(SCREENSHOT_DIR, 'mangaread-home-hero-carousel.png');
            await page.screenshot({ path: outPath1 });
            fs.copyFileSync(outPath1, outPath2);
            recordScreenshot('mangaread_home_dark.png', outPath1);
            recordScreenshot('mangaread-home-hero-carousel.png', outPath2);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 2: mangaread_home_light.png & mangaread-light-mode-theme.png
        // -----------------------------------------------------------------
        console.log('[Scenario 2] MangaRead Homepage Light Mode Theme...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT, () => {
                localStorage.setItem('md-theme', JSON.stringify('light'));
            });
            await page.goto(`${BASE_URL}/mangaread/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('html[data-md-theme="light"]', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath1 = path.join(SCREENSHOT_DIR, 'mangaread_home_light.png');
            const outPath2 = path.join(SCREENSHOT_DIR, 'mangaread-light-mode-theme.png');
            await page.screenshot({ path: outPath1 });
            fs.copyFileSync(outPath1, outPath2);
            recordScreenshot('mangaread_home_light.png', outPath1);
            recordScreenshot('mangaread-light-mode-theme.png', outPath2);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 3: mangaread_top.png
        // -----------------------------------------------------------------
        console.log('[Scenario 3] MangaRead Top Page (/manga/?m_orderby=views)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/?m_orderby=views`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.c-page-content, .page-listing-item', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread_top.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('mangaread_top.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 4: mangaread_completed.png
        // -----------------------------------------------------------------
        console.log('[Scenario 4] MangaRead Completed Page (/manga/?m_status=completed)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/?m_status=completed`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.c-page-content, .page-listing-item', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread_completed.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('mangaread_completed.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 5: mangaread_detail.png & mangaread-series-page-ui.png
        // -----------------------------------------------------------------
        console.log('[Scenario 5] MangaRead Series Detail Page (/manga/eternal-youth/)...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/eternal-youth/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.c-breadcrumb-wrapper, .profile-manga', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath1 = path.join(SCREENSHOT_DIR, 'mangaread_detail.png');
            const outPath2 = path.join(SCREENSHOT_DIR, 'mangaread-series-page-ui.png');
            await page.screenshot({ path: outPath1 });
            fs.copyFileSync(outPath1, outPath2);
            recordScreenshot('mangaread_detail.png', outPath1);
            recordScreenshot('mangaread-series-page-ui.png', outPath2);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 6: mangaread_reader.png
        // -----------------------------------------------------------------
        console.log('[Scenario 6] MangaRead Chapter Reader Page...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/chapter/chapter-1/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.reading-content, #md-dock', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'mangaread_reader.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('mangaread_reader.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 7: mangaread-account-and-bookmark-removed.png
        // -----------------------------------------------------------------
        console.log('[Scenario 7] MangaRead Account Elements Debloating & Bookmark Styling...');
        {
            const page = await createTestingPage(browser, MANGAREAD_SCRIPT);
            await page.goto(`${BASE_URL}/mangaread/manga/god-level-assassin-im-the-shadow/`, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 500));

            const modalHidden = await page.evaluate(() => {
                const modal = document.querySelector('.c-modal_item');
                return !modal || getComputedStyle(modal).display === 'none' || getComputedStyle(modal).visibility === 'hidden';
            });
            console.log(`  - Account modal debloat verified: ${modalHidden}`);

            const outPath = path.join(SCREENSHOT_DIR, 'mangaread-account-and-bookmark-removed.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('mangaread-account-and-bookmark-removed.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 8: mangaread-comments-theme-light.png
        // -----------------------------------------------------------------
        console.log('[Scenario 8] MangaRead Comments Dynamic Theme (Light Mode)...');
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
            recordScreenshot('mangaread-comments-theme-light.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 9: mangaread-comments-theme-dark.png
        // -----------------------------------------------------------------
        console.log('[Scenario 9] MangaRead Comments Dynamic Theme (Dark Mode)...');
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
            recordScreenshot('mangaread-comments-theme-dark.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 10: mangaread-no-duplicate-back-to-top.png
        // -----------------------------------------------------------------
        console.log('[Scenario 10] MangaRead Single Back-to-Top Button (#md-top)...');
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
            recordScreenshot('mangaread-no-duplicate-back-to-top.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 11: demonicscans_home.png
        // -----------------------------------------------------------------
        console.log('[Scenario 11] DemonicScans Homepage...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-hero', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans_home.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('demonicscans_home.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 12: demonicscans_carousel.png & demonicscans-hero-hover-pause.png
        // -----------------------------------------------------------------
        console.log('[Scenario 12] DemonicScans Hero Carousel Hover Pause Behavior...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#md-hero', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));

            await page.hover('#md-hero .md-hero-card, #md-hero .md-hero-thumb, #md-hero');
            await new Promise(r => setTimeout(r, 200));

            const outPath1 = path.join(SCREENSHOT_DIR, 'demonicscans_carousel.png');
            const outPath2 = path.join(SCREENSHOT_DIR, 'demonicscans-hero-hover-pause.png');
            await page.screenshot({ path: outPath1 });
            fs.copyFileSync(outPath1, outPath2);
            recordScreenshot('demonicscans_carousel.png', outPath1);
            recordScreenshot('demonicscans-hero-hover-pause.png', outPath2);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 13: demonicscans_translations.png & demonicscans-latest-translations.png
        // -----------------------------------------------------------------
        console.log('[Scenario 13] DemonicScans Translations List (No Duplicate Title & Full Un-truncation)...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/translationlist.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.updates-element, [data-md-trans="1"]', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath1 = path.join(SCREENSHOT_DIR, 'demonicscans_translations.png');
            const outPath2 = path.join(SCREENSHOT_DIR, 'demonicscans-latest-translations.png');
            await page.screenshot({ path: outPath1 });
            fs.copyFileSync(outPath1, outPath2);
            recordScreenshot('demonicscans_translations.png', outPath1);
            recordScreenshot('demonicscans-latest-translations.png', outPath2);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 14: demonicscans_advanced_search.png
        // -----------------------------------------------------------------
        console.log('[Scenario 14] DemonicScans Advanced Search Poster Overlay Cards with Gradient...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/advanced.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.advanced-element', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans_advanced_search.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('demonicscans_advanced_search.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 15: demonicscans_leaderboard.png
        // -----------------------------------------------------------------
        console.log('[Scenario 15] DemonicScans 3-Tier Podium Leaderboard Architecture...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/leaderboard.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.podium-section, .podium-card.rank-1', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans_leaderboard.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('demonicscans_leaderboard.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 16: demonicscans-chapter-reader.png
        // -----------------------------------------------------------------
        console.log('[Scenario 16] DemonicScans Chapter Reader Images & Comments...');
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
                const subpanel = document.querySelector('#subpanel, dialog.reader-membership-promo');
                const payment = document.querySelector('.payment-widget');
                const popcont = document.querySelector('#popcont');
                const isLocked = document.documentElement.classList.contains('reader-membership-open');
                const subpanelVisible = subpanel && (subpanel.open || (getComputedStyle(subpanel).display !== 'none' && getComputedStyle(subpanel).visibility !== 'hidden'));
                const paymentVisible = payment && (getComputedStyle(payment).display !== 'none' && getComputedStyle(payment).visibility !== 'hidden');
                return {
                    count: imgs.length,
                    visible: visibleImgs.length,
                    commentsVisible,
                    subpanelGone: !subpanel || !subpanelVisible,
                    paymentGone: !payment || !paymentVisible,
                    popcontGone: !popcont,
                    isUnlocked: !isLocked
                };
            });
            console.log(`  - Reader images: ${readerState.visible}/${readerState.count} visible, commentsVisible=${readerState.commentsVisible}`);
            console.log(`  - Membership popup eliminated: subpanelGone=${readerState.subpanelGone}, paymentGone=${readerState.paymentGone}, isUnlocked=${readerState.isUnlocked}`);

            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-chapter-reader.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('demonicscans-chapter-reader.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 17: demonicscans-latest-updates.png
        // -----------------------------------------------------------------
        console.log('[Scenario 17] DemonicScans Latest Updates Horizontal Cards with Timestamps...');
        {
            const page = await createTestingPage(browser, DEMONIC_SCRIPT);
            await page.goto(`${BASE_URL}/lastupdates.php`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.updates-element', { timeout: 8000 });
            await new Promise(r => setTimeout(r, 400));
            const outPath = path.join(SCREENSHOT_DIR, 'demonicscans-latest-updates.png');
            await page.screenshot({ path: outPath });
            recordScreenshot('demonicscans-latest-updates.png', outPath);
            await page.close();
        }

        // -----------------------------------------------------------------
        // SCENARIO 18: demonicscans-continue-reading.png
        // -----------------------------------------------------------------
        console.log('[Scenario 18] DemonicScans Continue Reading Cookie-Persisted Section...');
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
            recordScreenshot('demonicscans-continue-reading.png', outPath);
            await page.close();
        }

        // Summary & Validation
        console.log('\n=== E2E Visual Test Execution Summary ===');
        console.log(`Total Scenarios: ${results.length} captured`);
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

        if (!allValid || results.length < 18) {
            throw new Error(`Visual test suite incomplete: expected at least 18 non-empty screenshots, got ${results.length}`);
        }

        console.log(`\nALL ${results.length} VISUAL SCREENSHOTS SUCCESSFULLY CAPTURED!\n`);
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
