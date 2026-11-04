# ⚡ Neobrutal Scans

[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%7C%20Violentmonkey-black?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/neobrutal-scans.user.js)
[![Version](https://img.shields.io/badge/version-2026--11--01.2-blue?style=for-the-badge)](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/neobrutal-scans.user.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A high-contrast **Neobrutalist skin and debloater** for **Asura Scans** and **DemonicScans** (both comic and novel sides). It strips away popunders, invasive ad slots, and account nags, replaces cluttered layouts with bold neobrutalist typography and borders, and supercharges the reading experience with zoom controls, offline `.cbz` downloads, and multi-chapter batch ZIP downloads.

---

## 🚀 Quick Install

### Prerequisites
Install a userscript manager extension in your browser:
- [Tampermonkey](https://www.tampermonkey.net/) (Recommended for Chrome, Firefox, Brave, Edge, Safari)
- [Violentmonkey](https://violentmonkey.github.io/) (Open-source alternative for Chrome, Firefox, Edge)

### One-Click Installation
Click the button below or open the link directly in your browser:

👉 **[Install Neobrutal Scans directly](https://raw.githubusercontent.com/17Arigato-jwd/neobrutal-scans/main/neobrutal-scans.user.js)**

Your userscript manager will automatically detect the script and prompt you to click **Install**.

---

## ✨ Features

### 🎨 Neobrutalism Design System
- Bold black borders, hard drop shadows, and high-contrast surfaces.
- Modern typography powered by **DM Sans** and **JetBrains Mono**.
- Clean badges, metadata pills, and responsive carousels.
- Restyled cards and layouts on both home, list, and series overview pages.

### 🌓 Dark & Light Mode
- Instant theme toggle in the top-right header with zero flash-of-unstyled-content.
- Deep purple/charcoal dark surfaces with crisp borders.
- Remembers your preference in `localStorage` across page loads and tabs.

### 🛡️ Complete De-Bloat & Anti-Ad
- **Popunder Neutralizer**: Pins ExoClick/ad-network hijackers (`popMagic`, `msgJsPop101`, etc.) to inert stubs in the page context before they can attach click listeners.
- **Removes Annoyances**: Eliminates Veyra banners, 0-Ads popups, dead ad gaps, and site announcement overlays.
- **Account Nag Removal**: Hides login-locked bookmark and rating buttons on series pages when unauthenticated.

### 📖 Supercharged Reader Dock
- Floating, minimalist reader dock that stays hidden until you hover or tap the page.
- Auto-hides when you scroll down to maximize screen estate for panels and text.
- **Zoom Controls**: Scale images from 50% to 200% on the fly.
- **Background Switcher**: Alternate between contrast backgrounds.
- **Auto-Hiding Header**: Smoothly slides away when scrolling down and reappears on scroll up.

### 📦 Offline Reader & Downloads
- **Single Chapter `.cbz` Export**: Package all pages into an offline Comic Book Zip archive (.cbz) with parallel image fetching.
- **Multi-Chapter Batch Downloader**: Select multiple chapters from the series overview and download them together in a consolidated `.zip`.
- **Novel Reader Formatting**: Clean typography, readable paragraph spacing, and `.epub` novel export.
- **Comic ↔ Novel Switch**: One-click toggle between comic and novel formats for series available in both.

### 💬 Smart Comments (DemonicScans)
- Automatically switches comment sections to the **Top** tab.
- Automatically hides low-effort short comments (configurable word threshold).

---

## ⚙️ Configuration

The script includes user-adjustable settings at the very top of `neobrutal-scans.user.js` in the `CONFIG` object:

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

## 🌐 Supported Domains

| Domain | Supported Features |
|---|---|
| `asurascans.com` / `*.asurascans.com` | Full Neobrutalism skin, Dark mode, Reader dock, Zoom, Novel reader, Batch downloader |
| `demonicscans.org` / `*.demonicscans.org` | Popunder killer, Neobrutalism skin, Dark mode, Reader dock, .cbz export, Comment filter |

---

## 🔒 Permissions Explained

- `@run-at document-start`: Injected early to neutralize ad listeners and apply theme datasets before initial paint, eliminating white flashes.
- `GM_xmlhttpRequest`: Required to fetch raw comic panel image data across CDNs without CORS restrictions for assembling `.cbz` / `.zip` archives.
- `@connect`: Grants explicit permissions to access comic image domains (such as `cdn.asurascans.com`, `demoniclibs.com`, `librarydm.com`, `readermc.org`, `mangafirst.org`).

---

## 🗺️ Roadmap & Planned Features

- [ ] **Multi-Site Expansion**
  - [ ] Add support for `mangaread.org` (ad debloating, layout cleanup, and reader integration).
- [ ] **Browse & Homepage Overhaul**
  - [ ] **Netflix-style Layout**: Transform standard home/browse catalogs into a Netflix-inspired streaming UI with prominent featured hero banners, backdrop previews, and clean categorical shelves.
  - [ ] **Horizontal Carousel Scrolling**: Add horizontal mouse-wheel scrolling (mapping vertical wheel delta to horizontal rail scroll) and drag-to-scroll interaction for carousel rails.
- [ ] **Reader Experience Enhancements**
  - [ ] **Immersive Reader Header (DemonicScans)**: Suppress the default site navigation header while reading chapters on DemonicScans. Replace it with an AsuraScans-style overlay header (series title, chapter number/title, and series overview link) that toggles smoothly on page tap/click in unison with the reader dock.
  - [ ] **Bottom Dock Chapter Selector**: Add an interactive chapter selection dropdown directly inside the floating bottom dock (`#md-dock`) for instant navigation between chapters without manual scrolling.
- [ ] **DemonicScans Comment Section Upgrades**
  - [ ] **Demon Rank Gradients**: Add distinctive custom gradient styles for user comment badges corresponding to different demon tiers and roles.
  - [ ] **High-Contrast Dark Comment Box**: Render user/author comment boxes in deep black (`#000000`) during dark mode instead of the default purple card surface.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

