# Portfolio

Personal portfolio of **Aymen Fergani**, full stack web developer from Algeria.
Live at **https://aymenfergani.vercel.app**

A time-travel themed site: a persistent Three.js "time tunnel", a wormhole opening scene, a 3D hero portrait that materialises from a portal, and full-screen section jumps on desktop (mouse wheel, arrow keys, or the dial on the right). Phones and tablets scroll normally. English, French and Arabic (right-to-left), switchable from the top bar. No build step: plain HTML, CSS and JavaScript.

## Run it locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` straight from disk will not load the 3D layer, because browsers block ES modules on `file://`.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import the `Portfolio` repository.
2. Project name: `portfolio`. Framework preset: **Other**. Leave the build command empty; the output directory is the repository root.
3. After the first deploy, open **Settings → Domains**, add `aymenfergani.vercel.app` and make it the main domain.

Every push to `main` redeploys automatically.

## Things to edit

| What | Where |
| --- | --- |
| Contact email | `CONFIG.email` at the top of `js/main.js` |
| French and Arabic text | `js/i18n.js` (English stays in `index.html`; each translated element carries a `data-i18n` key) |
| Timeline milestones (2023 → Next) | `index.html`, section `id="timeline"` |
| Technologies in the stack | `index.html`, section `id="stack"` |
| The two projects in development | `index.html`, the `.slot` items in section `id="projects"` |
| DF Shoes screenshots | `assets/img/dfshoes/` (01-intro … 04-detail are 1440×810, mobile.webp is 390×844). Replace a file with the same name to update it |
| Text on the 3D dial ring | `CONFIG.ringText` in `js/main.js` |
| Logo | the `#af-mark` symbol at the top of `index.html`, and `assets/favicon.svg` |
| Link preview image | `assets/og.jpg` (1200×630) |

## Files

- `index.html` · content and structure
- `css/style.css` · theme tokens (brass = past, flux = future), layout and effects
- `js/main.js` · section transitions, touch flow, HUD, cursor, form, language switcher
- `js/i18n.js` · French and Arabic translations (Arabic switches the layout to right-to-left)
- `js/chrono-scene.js` · the Three.js layer (wormhole intro, tunnel, chronograph rings, portrait shader, portal)
- `assets/img/` · portraits (transparent WebP) and DF Shoes screenshots
- `vercel.json` · clean URLs and caching for images

Libraries: Three.js 0.160.0 from jsDelivr, fonts from Google Fonts (Unbounded, Instrument Serif, Manrope, Martian Mono, plus Noto Kufi Arabic, IBM Plex Sans Arabic and Noto Naskh Arabic for Arabic). Without WebGL the hero falls back to a 2D portrait with the same layout.
