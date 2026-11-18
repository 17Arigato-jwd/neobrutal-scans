# Neobrutal Scans

[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%7C%20Violentmonkey-black?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)
[![Version](https://img.shields.io/badge/version-2026--11--02.14-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A high-contrast **Neobrutalist skin and debloater** for **DemonicScans** and **Asura Scans** (both comic and novel sides). It strips away popunders, invasive ad slots, and account nags, replaces cluttered layouts with bold neobrutalist typography and borders, and supercharges the reading experience with zoom controls, offline `.cbz` downloads, and multi-chapter batch ZIP downloads.

---

## Quick Install

### Prerequisites
Install a userscript manager extension in your browser:
- [Tampermonkey](https://www.tampermonkey.net/) (Recommended for Chrome, Firefox, Brave, Edge, Safari, Kiwi, Orion)
- [Violentmonkey](https://violentmonkey.github.io/) (Open-source alternative for Chrome, Firefox, Edge)

### One-Click Installation

Choose the dedicated script for your site:

- **[Install DemonicScans Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/demonicscans.user.js)**  
  *Lightweight, high-performance userscript exclusively tailored for DemonicScans.*
- **[Install Asura Scans Dedicated Edition](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/asurascans.user.js)**  
  *Dedicated script designed specifically for Asura Scans.*

*(Note: The previous monolithic combined script has been archived to [`archive/neobrutal-scans.user.js`](archive/neobrutal-scans.user.js)).*

Your userscript manager will automatically detect the script and prompt you to click **Install**.

---

## Features

### Neobrutalism Design System
- Bold black borders, hard drop shadows, and high-contrast surfaces.
- Modern typography powered by **DM Sans** and **JetBrains Mono**.
- Clean badges, metadata pills, and responsive carousels.
- Restyled cards and layouts on home, browse, and series overview pages.

### Netflix-Style Home Layout
- Prominent **Featured Hero Banner** on list/home pages displaying blurred dark backdrops, Title Case typography, views badge, latest chapter badge, CTA buttons, and an oversized tilted book cover card clipped under the banner container.
- **Timed Hero Carousel with Falling Progress Bars**: Automatically transitions through every series in "Most Viewed Today" using mini series thumbnails located directly beneath the Read Now / More Info buttons. A vertical progress bar smoothly falls from the top of the active thumbnail to the bottom to indicate the timer before transitioning. Hovering anywhere on the hero pauses the timer.
- **Stationary Carousel Layout**: The hero card body locks the title line-box height and pins the buttons and thumbnails to prevent vertical bouncing when switching between series of different title lengths.
- **Views & Latest Chapter Pills**: Dynamically displays formatted view counts (e.g. `18M views`) and the latest chapter badge with background fetching for carousel series.
- **Streamlined 2-Column Latest Updates**: Wide 2-column card grid on desktop with large thumbnails, crisp chapter buttons, and a centered bottom "See More" action button.
- Responsive design tailored for both wide desktop monitors and mobile screens.

### Fluid Carousel Drag-to-Scroll
- Native mouse drag-to-scroll on carousel rails with inertial momentum glide.
- Automatic click cancellation on drag release to prevent unintended navigation.

### Dark & Light Mode
- Instant theme toggle in the top-right header with zero flash-of-unstyled-content.
- Deep purple/charcoal dark surfaces with crisp borders.
- Remembers your preference in `localStorage` across page loads and tabs.

### Complete De-Bloat & Anti-Ad
- **Popunder Neutralizer**: Pins ExoClick/ad-network hijackers (`popMagic`, `msgJsPop101`, etc.) to inert stubs in the page context before they can attach click listeners.
- **Removes Annoyances**: Eliminates Veyra banners, 0-Ads popups, dead ad gaps, and site announcement overlays.
- **Account Nag Removal**: Hides login-locked bookmark and rating buttons on series pages when unauthenticated.

### Supercharged Reader Dock & Controls
- Floating, minimalist reader dock that stays hidden until you hover or tap the page.
- **Dock Chapter Selector**: Jump to any chapter directly from the dock without leaving your reading position.
- **Immersive Tap-to-Show Mode (DemonicScans)**: Site navigation is hidden while reading and toggles smoothly on tap together with the bottom dock.
- Auto-hides when you scroll down to maximize screen estate for panels and text.
- **Zoom Controls**: Scale images from 50% to 200% on the fly.
- **Background Switcher**: Alternate between contrast backgrounds.

### Offline Reader & Downloads
- **Single Chapter `.cbz` Export**: Package all pages into an offline Comic Book Zip archive (.cbz) with parallel image fetching.
- **Multi-Chapter Batch Downloader**: Select multiple chapters from the series overview and download them together in a consolidated `.zip`.
- **Novel Reader Formatting**: Clean typography, readable paragraph spacing, and `.epub` novel export.
- **Comic ↔ Novel Switch**: One-click toggle between comic and novel formats for series available in both.

### Smart Comments (DemonicScans)
- Automatically switches comment sections to the **Top** tab.
- Automatically hides low-effort short comments (configurable word threshold).

---

## Configuration

The script includes user-adjustable settings at the very top of each userscript in the `CONFIG` object:

```javascript
const CONFIG = {
    maxWidth: 1280,        // Content column width (in px)
    collapseGaps: true,    // Hide empty blocks (dead ad slots)
    arrows: true,          // ‹ › navigation buttons on carousels
    backToTop: true,       // Floating scroll-to-top button
    compactViews: true,    // Formats view counts (e.g., 10.4M)
    heroAutoplay: true,    // Autoplay banner carousels
    themeDefault: 'light', // Default theme: 'light' | 'dark' | 'system'
    reader: {
        baseWidth: 800,    // Default width of reader pages at 100% zoom
        concurrency: 4,    // Parallel image downloads for .cbz generation
    },
    topComments: true,     // Switch DemonicScans comments to "Top"
    maxCommentWords: 3,    // Hide comments with fewer than this many words
    keepImageComments: false, // Keep comments containing only GIFs/images
    dockScrollPx: 150,     // Scroll distance threshold before dock hides
};
```

To modify settings, open your userscript manager's dashboard, select **Neobrutal Scans**, adjust the `CONFIG` values, and save (`Ctrl+S`).

---

## Supported Domains

| Domain | Supported Features |
|---|---|
| `asurascans.com` / `*.asurascans.com` | Full Neobrutalism skin, Dark mode, Reader dock, Zoom, Novel reader, Batch downloader |
| `demonicscans.org` / `*.demonicscans.org` | Popunder killer, Netflix hero, Drag carousel, Chapter dock selector, Neobrutalism skin, Dark mode, Reader dock, .cbz export, Comment filter |

---

## Permissions Explained

- `@run-at document-start`: Injected early to neutralize ad listeners and apply theme datasets before initial paint, eliminating white flashes.
- `GM_xmlhttpRequest`: Required to fetch raw comic panel image data across CDNs without CORS restrictions for assembling `.cbz` / `.zip` archives.
- `@connect`: Grants explicit permissions to access comic image domains (such as `cdn.asurascans.com`, `demoniclibs.com`, `librarydm.com`, `readermc.org`, `mangafirst.org`).

---

## Roadmap & Planned Features

- [ ] **Multi-Site Expansion**
  - [ ] Add support for `mangaread.org` (ad debloating, layout cleanup, and reader integration).
- [x] **Browse & Homepage Overhaul**
  - [x] **Netflix-style Layout**: Transform standard home/browse catalogs into a Netflix-inspired streaming UI with prominent featured hero banners, backdrop previews, and clean categorical shelves.
  - [x] **Horizontal Carousel Scrolling**: Add horizontal mouse-wheel scrolling and drag-to-scroll interaction for carousel rails.
- [x] **Reader Experience Enhancements**
  - [x] **Immersive Reader Header (DemonicScans)**: Suppress the default site navigation header while reading chapters on DemonicScans. Replace it with an overlay header that toggles smoothly on page tap/click in unison with the reader dock.
  - [x] **Bottom Dock Chapter Selector**: Add an interactive chapter selection dropdown directly inside the floating bottom dock (`#md-dock`) for instant navigation between chapters without manual scrolling.
- [ ] **DemonicScans Comment Section Upgrades**
  - [ ] **Demon Rank Gradients**: Add distinctive custom gradient styles for user comment badges corresponding to different demon tiers and roles.
  - [ ] **High-Contrast Dark Comment Box**: Render user/author comment boxes in deep black (`#000000`) during dark mode instead of the default purple card surface.
- [ ] **Mobile & UI Optimizations**
  - [ ] **Mobile Dark/Light Mode Toggle Optimization**: Refine the dark/light mode toggle switch on mobile viewports for improved touch responsiveness, optimized tap target sizing, and seamless header positioning without crowding navigation controls.

---

## Testing & Quality Assurance

A dedicated verification test suite is included to validate userscript syntax, metadata sync, CSS rules, layout stability, and functional components:

```bash
npm test
```

The test runner runs natively on Node.js without third-party dependencies, validating:
- JavaScript syntax and compilation for both standalone and unified userscripts.
- Metadata headers and cross-file version synchronization.
- CSS properties ensuring no breaking `!important` flags on progress bar animations.
- Hero carousel layout isolation and height clamping.
- String transformations (Title Case casing, compact view count formatting, and DOM extraction).

---

## License

This project is licensed under the [MIT License](LICENSE).
