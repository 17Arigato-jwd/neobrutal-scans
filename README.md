# Neobrutal Scans

[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%7C%20Violentmonkey-black?style=for-the-badge&logo=tampermonkey)](https://github.com/17Arigato-jwd/neobrutal-scans)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A high-contrast **Neobrutalist skin and debloater suite** for **DemonicScans / MangaDemon**, **Asura Scans** (both comic and novel sides), **MangaRead**, and **Comix**. It eliminates popunders, invasive ad slots, reader membership popups, and account nags, replaces cluttered layouts with bold neobrutalist typography and borders, and supercharges the reading experience with interactive hero carousels, continue-reading shelves, zoom controls, offline `.cbz` exports, and multi-chapter batch ZIP downloads.

---

## Quick Install

### Prerequisites
Install a userscript manager extension in your browser:
- [Tampermonkey](https://www.tampermonkey.net/) (Recommended for Chrome, Firefox, Brave, Edge, Safari, Kiwi, Orion)
- [Violentmonkey](https://violentmonkey.github.io/) (Open-source alternative for Chrome, Firefox, Edge)

### One-Click Installation

Choose the dedicated script for your site:

[![Version](https://img.shields.io/badge/version-2026--11--18.3-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)  
- **[Install DemonicScans Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)**  
  *Lightweight, high-performance userscript exclusively tailored for DemonicScans and MangaDemon mirrors.*

[![Version](https://img.shields.io/badge/version-2026--11--18.2-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/asurascans.user.js)  
- **[Install Asura Scans Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/asurascans.user.js)**  
  *Dedicated script designed specifically for Asura Scans (comics and web novels).*

[![Version](https://img.shields.io/badge/version-2026--11--20.3-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js)  
- **[Install MangaRead Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js)**  
  *Dedicated userscript designed specifically for MangaRead (mangaread.org).*

[![Version](https://img.shields.io/badge/version-2026--11--20.4-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js)  
- **[Install Comix Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js)**  
  *Dedicated userscript designed specifically for Comix (comix.to).*

*(Note: The legacy monolithic combined script has been archived to [`archive/neobrutal-scans.user.js`](archive/neobrutal-scans.user.js)).*

Your userscript manager will automatically detect the script and prompt you to click **Install**.

---

## Features

### Neobrutalism Design System
- **High-Contrast Aesthetics**: Bold solid black borders (`var(--bw)`), crisp drop shadows, and vibrant accent surfaces (warm yellow on DemonicScans, purple gradient on MangaRead).
- **Modern Typography**: Clean, readable sans-serif typography powered by **DM Sans** and monospaced accents via **JetBrains Mono**.
- **Sliding Pill Theme Switch**: Instant, zero-flash dark/light mode toggle in the header with animated sliding knob and `localStorage` persistence.
- **Uniform Card Geometry**: Strict 2:3 aspect-ratio covers, uniform 201px card heights, 2-line clamped titles, and standardized flex layouts across all viewports.

---

### Netflix-Style Home & Featured Hero Carousel
- **Featured Hero Banner**: Prominent banner on homepage/list routes displaying blurred dark backdrops, Title Case typography, views pill badge, latest chapter pill, CTA buttons, and an oversized tilted book cover card clipped under the banner container.
- **Falling Progress Bars & Auto-Play**: Transitions through featured series using thumbnail strips located beneath the CTA buttons. A vertical progress bar smoothly falls from top to bottom (5.5s) to indicate the active timer. Hovering anywhere on the hero pauses the timer.
- **Auto-Centered Thumbnail Strip**: When navigating or cycling between featured series, the active thumbnail is automatically scrolled to the center of the viewable strip.
- **Flicker-Free Art Hover**: Decoupled static hit boundary (`.md-hero-card`) and inner art (`.md-hero-card-art`) prevents edge-hover flicker, while a static pointer bridge (`::after`) keeps tilted elements clickable without layout feedback loops.
- **Stationary Layout**: The hero card body locks the title line-box height and pins the buttons and thumbnails to eliminate vertical layout shift.

---

### DemonicScans Dedicated Features
- **Continue Reading Shelf**: Persistent cookie-stored shelf (`#md-continue-reading`) positioned directly under the hero banner showing in-progress series with last read chapter, next chapter quick-access button, and reading progress bar.
- **Reader Membership Popup Immunity**: Neutralizes `#subpanel` promo dialog, dark backdrop, scroll locking (`html.reader-membership-open`), 700px PayPal promotion widgets, and PubAdX ad releases.
- **Smart Comments & GIF Support**: Automatically switches comment sections to the **Top** tab and filters low-effort short comments while preserving GIF and image-only reactions.
- **3-Tier Podium Leaderboard**: Elevated rank podium (Gold #1, Silver #2, Bronze #3) with monospaced rows on `/leaderboard.php`.
- **Advanced Search Overlay Cards**: Bottom-to-mid black gradient overlays between text and cover art for enhanced readability.
- **Full Title Restoration**: Un-truncates all titles on `translationlist.php` and eliminates redundant headers.
- **Novel Reader Formatting**: Clean typography, readable paragraph spacing, and `.epub` novel export.
- **Comic ↔ Novel Switch**: One-click toggle between comic and novel formats for series available in both.

---

### MangaRead Dedicated Features
- **Featured Hero Carousel**: Full hero banner with falling progress bars, view counts, and latest chapter indicators ported to MangaRead homepage.
- **Dynamic Mobile Hero Spacing**: Automatically calculates and trims excessive vertical margin gaps under `#md-hero` on mobile viewports ($\le 768\text{px}$) on load and resize.
- **Unified Multi-Row Listing Grid**: Flattens nested row wrappers with `display: contents` into a single responsive grid container (3-columns on desktop $\ge 900\text{px}$, responsive 2-columns on mobile $\le 600\text{px}$), maintaining uniform spacing without ragged rows.
- **Series Detail Page Overhaul**: Asura-style high-contrast layout with responsive metadata blocks, chapter buttons, and dynamic blurred cover backdrop (`div.profile-manga > .md-profile-bg`).
- **Restructured wpDiscuz Comments**: Clean avatar-aligned votes/scores, author badges positioned inline beside names, and report flag + collapse button pinned top-right to prevent awkward text wrapping.
- **Collapsible Comment Threads**: Nested comment trees feature interactive `+` / `−` collapse buttons (`setupCommentCollapse()`), allowing readers to fold long reply chains cleanly.
- **Live Comment Loading Indicator**: Floating Neobrutalist indicator (`.md-cload`) providing real-time feedback during comment pagination and comment submission.
- **Sticky Chapter Reader Bar**: Minimalist bottom reader bar with quick prev/next navigation, home shortcut, and automatic purging of intrusive related-manga clutter beneath the reader.
- **Un-Clipped Action Buttons**: Clean, full-sized "Read First" and "Read Last" CTA buttons (`#btn-read-first`, `#btn-read-last`) on series pages with zero text overflow or link underlines.
- **Heading Glyphs & Neobrutalist Accents**: Section headings are automatically decorated with thematic Neobrutalist glyphs (star, bolt, doc, chat) matching the design system.
- **Performance Optimizations**: Native asynchronous decoding (`decoding="async"`) and lazy-loading (`loading="lazy"`) across catalog and updates grids.
- **Smooth AJAX Load-More Animations**: Staggered pop-in animation (`.md-pop-in`) for newly loaded series cards when clicking "Load More" (`nav.navigation-ajax a.load-ajax`).
- **Complete De-Bloat**: Eliminates top/bottom ad blocks, PubAdX sticky units, Yandex RTB, Onclicka popunders, chat widgets (Minnit/Cbox/RumbleTalk), and social sharing bars.
- **Multi-Chapter Batch ZIP Downloader**: Select multiple chapters from the series overview and download them together in a consolidated `.zip`.

---

### Comix Dedicated Features
- **Full-Site Neobrutalism & Theme Sync**: High-contrast neobrutalist aesthetic with solid borders, hard shadows, custom palettes (Light, Dark, Custom), and full synchronization with the site's own Settings.
- **Featured Hero Carousel**: Prominent hero banner on `/home` showcasing top series with Title Case metadata, chapter badge, dynamic view formatting, and falling vertical progress bar (5.5s timer with pause-on-hover/focus).
- **Continue Reading Shelf**: Local reading history shelf (`.nb-history`) tracking recent series, chapter titles, page progress, and read timestamps directly in `localStorage`.
- **Floating Reader Dock**: Minimal bottom dock with dynamic zoom (50% to 200%), reading mode toggle, background selector (Paper, Charcoal, Black, Theme), and chapter navigation.
- **Single Chapter `.cbz` Packaging**: One-click Comic Book Zip exporter embedding standard `ComicInfo.xml` metadata and parallel image downloading.
- **Multi-Chapter Batch Downloader & PDF Export**: Download multiple selected chapters in a consolidated ZIP archive or export directly to PDF from series pages (`/title/*`).
- **Promotion & Sign-In Debloater**: Automatic removal of sponsored homepage banners, PWA install prompts, ending promotional banners, sign-in UI nags, and distracting third-party frames.

---

### Supercharged Reader Dock & Offline Tools
- **Minimalist Floating Reader Dock**: Floating bottom dock that stays hidden until you hover or tap the page.
- **Dock Chapter Selector**: Jump to any chapter directly from the dock without leaving your reading position.
- **Auto-Hiding Navigation**: Header and dock slide away smoothly while reading down and return instantly on upward scroll.
- **Zoom & Contrast Controls**: Scale images from 50% to 200% on the fly and alternate between paper, dark, and pitch-black backgrounds.
- **Single Chapter `.cbz` Export**: Package all pages into an offline Comic Book Zip archive (.cbz) with parallel image fetching.

---

## Configuration

Settings can be customized directly in the `CONFIG` object at the top of each script:

```javascript
const CONFIG = {
    maxWidth: 1280,            // Max content column width (in px)
    collapseGaps: true,        // Automatically collapse empty ad slot blocks
    arrows: true,              // ‹ › navigation buttons on carousels
    backToTop: true,           // Floating scroll-to-top button
    fullTitles: true,          // Un-truncate long series titles from title attributes
    compactViews: true,        // Format view counts (e.g., 18.4M)
    heroAutoplay: true,        // Autoplay featured hero banner carousel
    themeDefault: 'light',     // Default theme: 'light' | 'dark' | 'system'
    reader: {
        baseWidth: 800,        // Default page width at 100% zoom
        zoomSteps: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2],
        concurrency: 4,        // Parallel image downloads for .cbz generation
    },
    topComments: true,         // Switch DemonicScans comments to "Top" automatically
    maxCommentWords: 3,        // Hide comments with fewer than this many words
    keepImageComments: true,   // Keep comments containing GIFs or image links
    readerDockOnTap: true,     // Reader dock stays hidden until you tap the page
    dockHideOnScroll: true,    // Hide dock after scrolling down
    dockScrollPx: 150,         // Scroll distance threshold before dock hides
    readerHeaderAutoHide: true // Header slides away while reading down, returns on scroll up
};
```

To modify settings, open your userscript manager's dashboard, select your installed userscript, adjust the `CONFIG` values, and save (`Ctrl+S`).

---

## Supported Domains

| Site | Supported Domains & Mirrors | Key Features |
|---|---|---|
| **DemonicScans** | `demonicscans.org`, `mangademon.org`, `mangademon.com`, `mangademon.cc`, `mangademon.me`, `mgdemon.org`, `demonreader.org` | Popunder killer, Membership popup immunity, Netflix hero carousel, Continue Reading shelf, 3-tier podium leaderboard, .cbz download, Novel reader |
| **MangaRead** | `mangaread.org`, `*.mangaread.org` | 4-layer ad & popunder debloater, Hero carousel, Series backdrop, AJAX load-more animations, wpDiscuz dynamic comments, .cbz export, Batch ZIP downloader |
| **Asura Scans** | `asurascans.com`, `*.asurascans.com` | High-contrast Neobrutalism skin, Dark mode, Reader dock, Zoom controls, Novel reader formatting, Multi-chapter batch ZIP downloader |
| **Comix** | `comix.to`, `*.comix.to` | High-contrast Neobrutalism skin, Theme sync, Featured hero carousel, Local reading history, Reader tools & backgrounds, .cbz export with ComicInfo.xml, Multi-chapter batch ZIP & PDF exporter, Promotion & sign-in debloater |

---

## Permissions Explained

- `@run-at document-start`: Injected early to neutralize ad listeners, poison membership popup triggers, and apply theme datasets before initial paint, eliminating white flashes.
- `@grant unsafeWindow`: Bypasses sandbox boundaries to neutralize malicious ad network globals and hook dialog prototypes directly in the page window.
- `GM_xmlhttpRequest`: Required to fetch raw comic panel image data across CDNs without CORS restrictions for assembling `.cbz` / `.zip` archives.
- `@connect`: Grants explicit permissions to access comic image domains (such as `cdn.asurascans.com`, `demoniclibs.com`, `librarydm.com`, `readermc.org`, `mangafirst.org`, `mangaread.org`).

---

## Roadmap & Progress

- [x] **Multi-Site Expansion**
  - [x] Dedicated edition for `mangaread.org` with 4-layer ad purging, hero carousel, dynamic comments, and batch downloader.
  - [x] Dedicated edition for `comix.to` with featured carousel, reading history, reader dock, and CBZ/batch ZIP export.
  - [x] Separate version control and dedicated install links for each site.
- [x] **Homepage & Browsing Overhaul**
  - [x] **Netflix-style Featured Hero**: Full banner with falling progress bar, pause-on-hover, view pills, and stationary title box.
  - [x] **Continue Reading Section**: Persistent cookie shelf for tracking reading progress and resuming chapters on DemonicScans.
  - [x] **Standardized 2:3 Card Geometry**: Zero height variance, clamped 2-line titles, and uniform grid sizing.
  - [x] **3-Tier Podium Leaderboard**: Elevated gold/silver/bronze podium design on DemonicScans leaderboard.
  - [x] **Advanced Search Poster Cards**: High-contrast bottom black gradient overlay for enhanced readability.
- [x] **Reader & Anti-Ad Hardening**
  - [x] **Reader Membership Popup Immunity**: Neutralized `#subpanel` dialog, scroll locking, and 700px PayPal promotion box.
  - [x] **Immersive Auto-Hiding Navigation**: Header and dock slide away while reading down and return on upward scroll.
  - [x] **Bottom Dock Chapter Selector**: Interactive chapter selection dropdown directly inside `#md-dock`.
  - [x] **Smart Comments & GIF Support**: Automatic "Top" sorting, spam word filtering, and preservation of GIF/media reactions.
- [x] **Visual Polish & Animations**
  - [x] **Sliding Pill Theme Toggle**: Smooth knob sliding animation with persistent theme storage.
  - [x] **Staggered AJAX Animations**: Pop-in animation for newly loaded cards on MangaRead.
  - [x] **Dynamic Blurred Series Backdrop**: Elevated series header with background cover blur on MangaRead.

---

## Testing & Quality Assurance

A dedicated verification test suite validates userscript syntax, metadata sync, CSS rules, layout stability, and functional components:

```bash
# Run unit & regression assertions
npm test

# Run headless visual screenshot regression suite
node test/visual.js
```

The automated test runner validates:
- JavaScript syntax and compilation for all dedicated userscripts.
- Metadata headers and per-script version synchronization with `README.md`.
- CSS properties ensuring no breaking `!important` flags on progress bar animations.
- Hero carousel layout isolation, static hitbox art separation, and hover jitter buffers.
- String transformations (Title Case casing, compact view count formatting, and URL normalization).
- Reader membership popup suppression and scroll-lock immunity.

---

## License

This project is licensed under the [MIT License](LICENSE).
