# Neobrutal Scans

[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%7C%20Violentmonkey-black?style=for-the-badge&logo=tampermonkey)](https://github.com/17Arigato-jwd/neobrutal-scans)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A high-contrast **Neobrutalist skin and debloater suite** for **DemonicScans / MangaDemon**, **Asura Scans** (both comic and novel sides), **MangaRead**, and **Comix**. It eliminates popunders, invasive ad slots, reader membership popups, and account nags, replaces cluttered layouts with bold neobrutalist typography and borders, and supercharges the reading experience with interactive hero carousels, continue-reading shelves, zoom & stretch controls, offline `.cbz` / `.pdf` exports, and multi-chapter batch ZIP downloads.

---

## Table of Contents

- [Quick Install](#quick-install)
  - [Prerequisites](#prerequisites)
  - [One-Click Installation](#one-click-installation)
- [Features](#features)
  - [Neobrutalism Design System](#neobrutalism-design-system)
  - [Netflix-Style Featured Hero Banner](#netflix-style-home--featured-hero-carousel)
- [Dedicated Extension Details](#dedicated-extension-details)
  - [Asura Scans Dedicated Features](#asura-scans-dedicated-features)
  - [DemonicScans Dedicated Features](#demonicscans-dedicated-features)
  - [MangaRead Dedicated Features](#mangaread-dedicated-features)
  - [Comix Dedicated Features](#comix-dedicated-features)
- [Supercharged Reader Dock & Offline Tools](#supercharged-reader-dock--offline-tools)
- [Configuration](#configuration)
- [Supported Domains](#supported-domains)
- [Userscript Permissions](#userscript-permissions)
- [Roadmap & Progress](#roadmap--progress)
  - [Asura Scans Edition](#asura-scans-edition-roadmap)
  - [Demonic Scans Edition](#demonic-scans-edition-roadmap)
  - [MangaRead Dedicated Edition](#mangaread-dedicated-edition-roadmap)
  - [Comix Dedicated Edition](#comix-dedicated-edition-roadmap)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [License](#license)

---

## Quick Install

### Prerequisites
Install a userscript manager extension in your browser:
- [Tampermonkey](https://www.tampermonkey.net/) (Recommended for Chrome, Firefox, Brave, Edge, Safari, Kiwi, Orion)
- [Violentmonkey](https://violentmonkey.github.io/) (Open-source alternative for Chrome, Firefox, Edge)

### One-Click Installation

Choose the dedicated script for your site:

| Dedicated Extension | Current Version | One-Click Install | Supported Domains |
|:---|:---:|:---:|:---|
| **Asura Scans Dedicated** | [![Version](https://img.shields.io/badge/version-2026--11--28.1-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/asurascans.user.js) | **[Install Asura Scans Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/asurascans.user.js)** | `asurascans.com`, `*.asurascans.com` |
| **Comix Dedicated** | [![Version](https://img.shields.io/badge/version-2026--11--21.19-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js) | **[Install Comix Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/comix.user.js)** | `comix.to`, `*.comix.to`, `comix.ws`, `*.comix.ws` |
| **Demonic Scans Dedicated** *(MangaDemon)* | [![Version](https://img.shields.io/badge/version-2026--11--18.3-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js) | **[Install DemonicScans Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)** | `demonicscans.org`, `mangademon.org`, & mirrors |
| **MangaRead Dedicated** *(mangaread.org)* | [![Version](https://img.shields.io/badge/version-2026--11--21.16-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js) | **[Install MangaRead Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/mangaread.user.js)** | `mangaread.org`, `*.mangaread.org` |

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

## Dedicated Extension Details

### Asura Scans Dedicated Features
- **Full-Site Neobrutalism Skin**: High-contrast aesthetic with solid black borders, hard drop shadows, and zero-flash Dark/Light theme toggle with persistent storage.
- **Floating Reader Dock & Zoom Controls**: Minimalist auto-hiding reader dock with dynamic zoom (50% to 200%), background switcher, and chapter navigation.
- **Novel Reader Formatting**: Clean typography, readable paragraph spacing, and distraction-free formatting tailored specifically for Asura novels.
- **Multi-Chapter Batch Downloader**: Download multiple selected chapters in a consolidated ZIP archive directly from the series overview page.
- **Ad Slot Collapsing & De-bloat**: Automatic elimination of empty ad containers, sticky promotional units, and distracting third-party scripts.

---

### DemonicScans Dedicated Features
- **Continue Reading Shelf**: Persistent cookie-stored shelf (`#md-continue-reading`) positioned directly under the hero banner showing in-progress series with last read chapter, next chapter quick-access button, and reading progress bar.
- **Reader Membership Popup Immunity**: Neutralizes `#subpanel` promo dialog, dark backdrop, scroll locking (`html.reader-membership-open`), 700px PayPal promotion widgets, and PubAdX ad releases.
- **Smart Comments & GIF Support**: Automatically switches comment sections to the **Top** tab and filters low-effort short comments while preserving GIF and image-only reactions.
- **3-Tier Podium Leaderboard**: Elevated rank podium (Gold #1, Silver #2, Bronze #3) with monospaced rows on `/leaderboard.php`.
- **Advanced Search Overlay Cards**: Bottom-to-mid black gradient overlays between text and cover art for enhanced readability.
- **Full Title Restoration**: Un-truncates all titles on `translationlist.php` and eliminates redundant headers.
- **Novel Reader Formatting**: Clean typography, readable paragraph spacing, and `.epub` novel export.
- **Comic / Novel Format Switch**: One-click toggle between comic and novel formats for series available in both.

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
- **Modal Contrast Hardening**: Neutralized white-on-white and dark-on-dark contrast bugs with explicit Neobrutalist background, text, and border styling on modals and inputs (`.md-modal`, `.md-modal-bd`, `.md-modal-hd`, `input[type="search"]`).
- **Continue Reading with Edge Fade & Save to List**: Enhanced `#md-continue-reading` matching Latest Manga Updates card styles with horizontal edge fade indicators and an integrated Save to List prompt.
- **Site-Wide Header & Single-Row Sub-Nav**: Consolidated navigation header with uniform spacing, icon buttons, and streamlined single-row sub-nav layout.
- **Viewport-Centered Chapter Comments**: True viewport-centered chapter comments section with high-contrast sort bar and gradient-morphing "Load More Comments" button.
- **Privacy Policy & Static Page Support**: Extended Neobrutalist container layout and typography styling to static pages (`/privacy-policy`, `/terms`, `/dmca`, `/contact`, `/about`).
- **Full-Site Mobile Ergonomics**: Responsive optimizations across mobile viewports (≤ 768px) with touch-friendly controls, uncluttered listings, and optimized modal sizing.
- **Immersive Chapter Reader**: Native browser scrollbars are suppressed (`scrollbar-width: none`) in the reader view, redundant chapter headings (`#chapter-heading`, `.entry-header`) above comic images are removed, and the bottom reader bar (`#md-rbar`) is centered across viewports.
- **Streamlined Browse Navigation & Mobile Sub-Nav**: Lightweight text-styled Browse trigger (`.md-subnav-btn`) matching header aesthetics, paired with high-specificity mobile sub-nav visibility overrides.
- **Standalone Continue Reading Shelf**: Positioned `#md-continue-reading` as a dedicated section between the Featured Hero banner and Latest Manga Updates with responsive margins and edge fade styling.
- **Custom Neobrutalist Comment Video Player**: Embedded media videos in comments feature a customized Neobrutalist control bar with play/pause toggle, interactive seek bar, time counter, mute toggle, direct video downloader button (`.md-vid-dl`), and fullscreen support.
- **Spoiler Tag Styling Revamp**: wpDiscuz spoiler wrappers restyled with uppercase `JetBrains Mono` headers, high-contrast borders, and clean expandable content blocks.
- **2-Row Mobile Reader Bottom Dock**: In chapter reader mode on mobile viewports (≤ 768px), the dock is formatted into a thumb-reachable 2-row grid (`repeat(6, 1fr)`) eliminating horizontal scrolling while keeping all navigation, zoom, and download tools accessible.
- **Series Overview Add-to-List**: Full-width Neobrutalist "Add to List" button (`#md-ov-lib-btn`) on manga profile headers.
- **Interactive Search Card Info Overlay**: Clicking "INFO" on search cards reveals an animated Neobrutalist overlay (`.md-sc-overlay`) featuring rating pills, release year, publication status, authors, artists, clickable genre tags, and a dynamic "See more" expansion button.
- **Contained Card Geometry & Edge-to-Edge Covers**: Enforced strict 2-line title containment, 1-line alternative title slotting, and edge-to-edge cover container styling eliminating text clipping across catalog and search listings.

---

### Comix Dedicated Features
- **Full-Site Neobrutalism & 4-Theme Settings Sync**: High-contrast neobrutalist aesthetic with solid black borders, hard drop shadows, and four synchronized themes (Main, Dark, Light, Custom) linked bidirectionally with the site's native Settings modal, including real-time RGB input binding.
- **Client-Side Local Library & Custom Lists**: Full client-side library modal (`#md-lib-modal`) accessible from the top navigation bar (`#md-lib-btn`). Manage in-progress titles with a "Currently Reading" shelf and create custom-named collections (e.g., Plan to Read, Completed, Dropped), complete with an interactive "Save to Library" picker (`#md-series-save`) on series pages and synchronized shelf badges.
- **Netflix-Style Featured Hero Banner**: 10-slide hero carousel (`#md-hero`) with falling vertical progress timer (5.5s), auto-centered thumbnail strip, smooth pause-on-hover/focus, stationary title line-box, and responsive 3D hover tilt on PC book covers.
- **Persistent Continue Reading Shelf**: Local cookie- and `localStorage`-stored shelf (`#md-continue-reading`) positioned on the home route, displaying reading progress percentages, last read chapter, and instant jump links.
- **Single Scrollable Chapter List & Scanlation Deduplication**: Complete series chapter view (`#md-all-chaps`) grouping multiple scanlation releases under unified chapter rows with scanlation-group dropdown selectors.
- **Deduplicated Multi-Chapter Batch Exporter (ZIP & PDF)**: Deduplicated "Select All" downloader selecting unique chapters while automatically skipping duplicate scanlation groups, supporting exports of up to 500 chapters per batch into consolidated ZIP archives or formatted PDF documents.
- **Unified Reader Top Bar & Floating Dock**: Synchronized top bar (`#md-rbar`) with live comment count attribution and chapter status, paired with an auto-hiding floating bottom reader dock (`#md-dock`). Includes animated reader tools, zoom presets (50% to 200%), stretch-to-width mode, paper/charcoal/black/theme background toggle, full keyboard navigation (`[`/`]`, `-`/`=`, `B`), and auto-hiding during downward scroll.
- **Comprehensive De-Bloater & Privacy Shield**: Intercepts cross-origin `window.open` popups, neutralizes ad iframes (doubleclick, googlesyndication, a-ads), hides intrusive sign-in/register nags, strips reaction/like buttons, hides home announcements and PWA prompts, and flattens comment threads with clean, read-only score badges.
- **Mobile Ergonomics & Touch Optimization**: Mobile-responsive overhaul (max-width: 768px) with `env(safe-area-inset-*)` support, horizontal snap track on Continue Reading (`scroll-snap-type: x proximity`), horizontally scrollable single-row reader bottom dock with hidden scrollbars, touch-friendly 38px–44px hit targets, horizontal overflow prevention (`overflow-x: clip; --md-base: 100vw`), 2-column mobile library grid, and `@media (hover: none)` touchscreen adaptations avoiding sticky hover states.

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
| **Comix** | `comix.to`, `*.comix.to`, `comix.ws`, `*.comix.ws` | Full-site Neobrutalism, 4-theme Settings sync, Offline Library & custom lists, Hero carousel with 3D tilt, Deduplicated chapter list & group dropdowns, 500-chapter batch ZIP & PDF exporter, Reader dock with stretch-to-width, Ad & sign-in debloater |

---

## Userscript Permissions

- `@run-at document-start`: Injected early to neutralize ad listeners, poison membership popup triggers, and apply theme datasets before initial paint, eliminating white flashes.
- `@grant unsafeWindow`: Bypasses sandbox boundaries to neutralize malicious ad network globals, hook dialog prototypes, and mirror theme sync directly in the page window.
- `GM_xmlhttpRequest` / `GM.xmlHttpRequest`: Required to fetch raw comic panel image data across CDNs without CORS restrictions for assembling `.cbz` / `.zip` archives and compiling `.pdf` files.
- `@connect`: Grants explicit permissions to access comic image domains (such as `cdn.asurascans.com`, `demoniclibs.com`, `librarydm.com`, `readermc.org`, `mangafirst.org`, `mangaread.org`, `comix.to`, `comix.ws`).

---

## Roadmap & Progress

Development progress and planned milestones are tracked independently for each dedicated edition:

### Asura Scans Edition Roadmap
- [x] **Neobrutalism UI Overhaul**: High-contrast black borders, hard drop shadows, and zero-flash Dark/Light theme toggle with persistent storage.
- [x] **Minimalist Floating Reader Dock**: Auto-hiding reader controls with dynamic zoom (50% to 200%), contrast background selector, and chapter navigation.
- [x] **Novel Reader Typography**: Typography and line-spacing optimization tailored for Asura web novels.
- [x] **Batch Chapter Downloader**: Multi-chapter ZIP archiver with concurrent image downloading.
- [x] **Ad Slot Collapsing & Debloat**: Automatic elimination of empty ad blocks and promotional clutter.
- [ ] **Netflix-Style Featured Hero Banner**: Port the auto-cycling hero carousel with falling progress timer to the Asura homepage.
- [ ] **Reading Progress Tracking**: Persistent continue-reading shelf tracking chapter history and read positions.

### Demonic Scans Edition Roadmap
- [x] **Anti-Ad & Membership Protection**: Suppression of `#subpanel` promo popups, scroll-lock immunity, and neutralization of PubAdX / Onclicka networks.
- [x] **Netflix-Style Featured Hero Carousel**: 10-slide banner with falling progress timer, pause-on-hover, and flicker-free art hover decoupling.
- [x] **Persistent Continue Reading Shelf**: Local cookie-backed shelf tracking recent series, chapter milestones, and direct jump buttons.
- [x] **Competitive Leaderboard Podium**: Elevated Gold/Silver/Bronze podium ranking display on `/leaderboard.php`.
- [x] **Poster Search Card Styling**: Mid-to-bottom dark gradient overlays between cover artwork and metadata typography.
- [x] **Smart Comments & Media Support**: Automatic "Top" tab sorting, low-effort comment filtering, and preservation of GIF reactions.
- [x] **Bimodal Reader Architecture**: Format switching between comic and novel layouts, with single-chapter `.cbz` and novel `.epub` export.
- [ ] **Client-Side Reading Lists**: Custom shelves (Plan to Read, Completed, Dropped) with synchronized badge counts.
- [ ] **Multi-Chapter PDF Exporter**: In-browser document compilation for offline chapter reading.

### MangaRead Dedicated Edition Roadmap
- [x] **Multi-Tier Adware Shield**: Complete elimination of PubAdX, Yandex RTB, Onclicka popunders, and WordPress ad inserter scripts.
- [x] **Responsive Hero Banner & Margin Adaptation**: Full hero carousel with automatic margin gap trimming on mobile devices.
- [x] **Standalone Continue Reading Section**: Dedicated progress shelf between Hero and Updates with horizontal edge fade indicators.
- [x] **Local Library & Custom Collections**: Client-side library modal (`#md-lib-modal`), overview "Add to List" button, and synchronized badge tallies.
- [x] **2-Row Touch-Friendly Reader Dock**: Thumb-reachable 2-row grid dock on mobile viewports with auto-scroll, zoom, and `.cbz` packaging.
- [x] **Immersive Chapter Reader**: Suppressed native browser scrollbars (`scrollbar-width: none`), removed redundant headings, and centered floating bottom dock.
- [x] **Interactive Search Card Info Overlay**: Clickable "INFO" trigger expanding into animated Neobrutalist overlays with tags and dynamic expansion.
- [x] **Custom Comment Video Player**: Integrated media controls with seek bar, duration timer, volume mute, and one-click direct video downloader.
- [x] **Modal Contrast Hardening & Static Route Theming**: High-contrast text fixes across all dialogs, plus full theme coverage on Privacy, Terms, and DMCA pages.
- [ ] **Multi-Chapter Batch PDF Downloader**: Direct PDF document assembly from series chapter listings.
- [ ] **Cross-Device Library Portability**: Import/export capabilities for reading progress and custom list configurations.

### Comix Dedicated Edition Roadmap
- [x] **Full-Site Neobrutalism & 4-Theme Settings Sync**: Real-time bidirectional synchronization with site settings across Main, Dark, Light, and Custom palettes with live RGB color bindings.
- [x] **Client-Side Local Library Modal**: Dedicated `#md-lib-modal` accessible via top navigation, featuring custom collections and series page quick-save pickers.
- [x] **Deduplicated Series Chapter View**: Unified chapter rows grouping multiple scanlation releases with group dropdown selectors (`#md-all-chaps`).
- [x] **High-Capacity Batch Exporter (ZIP & PDF)**: Deduplicated "Select All" downloader supporting up to 500 chapters per batch in consolidated ZIP or PDF formats.
- [x] **Synchronized Reader Navigation & Floating Dock**: Reader top bar (`#md-rbar`) with live comment counts, paired with auto-hiding dock (`#md-dock`) featuring stretch-to-width mode and zoom controls.
- [x] **Sign-In & Banner Debloat**: Elimination of sign-in nags, rating prompts, home announcements, and distraction-free comment threads with read-only scores.
- [x] **Mobile Ergonomics Hardening**: Constrained viewport overflow (`overflow-x: clip`), safe-area insets (`env(safe-area-inset-*)`), and `@media (hover: none)` touchscreen adaptations.
- [ ] **Offline Library Data Backup**: JSON import and export for local library collections and read states.
- [ ] **Custom Keyboard Shortcut Remapping**: Configurable keybindings for chapter jumping, zoom scaling, and dock toggles.

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
