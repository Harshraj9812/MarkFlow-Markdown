# Markflow

A browser-based Markdown workspace for DevOps notes, runbooks and documentation. Import or paste Markdown, preview it, then export a self-contained HTML document or use your browser's **Save as PDF**.

The app is static and can be hosted on Netlify. It has no server, login, paid API or document upload service.

See [SECURITY.md](SECURITY.md) for data handling, the security review, dependency remediation and repeatable audit checks.

## Run locally

Use Node.js 22.22.2 or later (or a current Node.js 24/26 release).

```bash
npm ci
npm run dev
```

Open the localhost URL shown by Vite. Development mode supports editing and conversion; service-worker offline access is enabled in the production build:

```bash
npm run build
npm run preview
```

Do not open `index.html` directly from your filesystem. The original, standalone visual mockup remains in `style-preview.html`.

## Deploy on Netlify

1. Push this project to your Git repository and import it into Netlify, or build locally and upload `dist/` using Netlify's manual deploy.
2. Build command: `npm run build`.
3. Publish directory: `dist`.
4. Node.js: `22` (configured in `netlify.toml`).

No environment variables, Functions or backend services are needed. The app is suitable for Netlify's free plan, subject to that plan's hosting usage limits. No hosting account was created or deployment performed as part of the local implementation.

## Use

- Drag a `.md`, `.markdown` or `.txt` file onto the page, choose **Browse files** in the editor, or paste directly into the editor. On phones, the fixed bottom bar switches between **Markdown**, **Preview**, **Settings** and **Export**.
- **Paste text** focuses the editor so you can use your keyboard or device's Paste menu. The app does not request clipboard-reading permission.
- Change the document theme, reading size, page size and margins. The app workspace stays dark; document appearance is independent.
- Under **Reading layout**, choose contents inside the document or in a left sidebar. The preview adapts to its panel width; exported HTML uses a wider reading area. Narrow screens stack the contents above the text. This setting is saved with your draft and carried into HTML/PDF exports.
- **Wrap text** in the editor toggles visual line wrapping without changing your Markdown. The setting is saved locally, and line numbers follow wrapped lines.
- **Expand preview** temporarily hides the editor to give wide layouts more room. **Show editor** returns to the split workspace.
- Toggle **Table of contents** to generate linked navigation from headings, even when no contents list was written in the source. A contents list already in the source remains part of the document; turn generated contents off to avoid duplication.
- Save the source using **Save .md** or `Ctrl+S` / `Cmd+S`.
- The current draft, settings and attached images are saved in IndexedDB on this browser/device. Clearing site data removes them; download Markdown and HTML for durable copies. Markdown downloads contain the source, not separate image attachments.

### Syntax

- CommonMark and GitHub-style tables, task lists, strikethrough and automatic links.
- Nested lists and quotes, footnotes, horizontal rules, images and safe HTML such as `<details>` / `<summary>`.
- GitHub-style `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` blockquotes.
- Highlighted Bash/shell, YAML, JSON, Dockerfile, HCL/Terraform, Python, JavaScript, TypeScript, Nginx, INI, XML/HTML, CSS, SQL and diffs. Unknown languages remain readable plain code. HCL highlighting uses a basic grammar.
- Mermaid diagrams in fenced `mermaid` blocks. Invalid diagrams display their source and a warning rather than blocking the rest of the document.
- KaTeX equations: `$inline$`, `$$display$$`, `\(inline\)`, `\[display\]`, and fenced `math` blocks. KaTeX supports a subset of LaTeX, not a full LaTeX document compiler.

The built-in example demonstrates the supported content. The renderer sanitizes imported HTML; scripts, embedded frames, custom document styles and event handlers are removed. Trusted HTML and unsafe Mermaid interactions are disabled.

### Images

Use **Add local images** to attach PNG, JPEG, GIF, WebP or AVIF files. You can also drop one Markdown file together with its images. Markdown such as `![Dashboard](images/dashboard.png)` resolves an attached `dashboard.png` by filename. Attaching a second file with the same name replaces the first.

Attached images are stored locally and embedded as data URLs in HTML exports. Missing local images produce a visible placeholder. Raster image attachments are supported; local SVG and folder/ZIP imports are not included.

External HTTP(S) images load from their original host. **Embed linked images** attempts to include those images in the exported HTML; this requires internet access and the image server's CORS permission. If embedding fails, the app keeps the external URL and reports that it still requires internet. Attach a local copy to make the document portable. Private images requiring cookies are not fetched for embedding.

### HTML export

**Export HTML** downloads one file with embedded document CSS, equation fonts, code highlighting and already-rendered SVG diagrams. The file needs no application server or scripts. Only images left as external links require a network connection.

### PDF export

**Save as PDF** prepares a document-only print layout in the page, waits for fonts and images, expands collapsible sections, then opens the browser print dialog. Select the browser's built-in **Save as PDF** destination to retain clickable links. The editor is restored after printing or cancellation.

- PDF pages and diagrams always use a light theme, independently of the preview/HTML theme. **PDF appearance** offers soft gray panels or a white minimal-ink style.
- Disable browser headers/footers if you do not want the date and URL.
- Web URLs and in-document contents/footnote links are preserved as PDF links. Links to other Markdown files need full web URLs for a portable destination; the converter does not know where those files will be hosted.
- Page size and margin controls provide CSS print defaults. Browser settings can override them, and pagination varies between browsers.
- Short heading introductions stay with their following code block when the group fits on one page. Code blocks that fit on a page stay together. Oversized groups may break between their introduction and code; blocks taller than a full page can split. Print code uses tighter line spacing, and long lines wrap. Wide tables are constrained to the page. Very large diagrams may need a smaller reading size or separate export.

PDF generation is native browser printing, so text stays selectable. There is no screenshot-to-PDF conversion or backend PDF service.

## Offline and installation

Open the deployed HTTPS site (or production localhost preview) once and wait for the green **Offline** badge before disconnecting. It indicates that offline access is ready, including while your device is online. The first cache includes all bundled diagram engines and equation fonts, so an unused diagram type can still render offline. External images are not automatically cached.

The **Install app** button appears when your browser offers installation. Browsers with different installation flows can use their own **Install app** or **Add to Home Screen** menu. Service workers require HTTPS or localhost. Offline mode is not provided by the development server.

An update notice appears when a new version is available. Updating saves the draft before reloading. Browser storage restrictions or a failed initial download may prevent offline setup; the status indicator reports readiness.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests use the production build at `http://127.0.0.1:4173` and cover rich rendering, import, attachments, persistence, standalone HTML, offline reload and a previously unused diagram engine, safe rendering, mobile layout and PDF preparation. PDF tests generate a real Chromium PDF; native print-dialog interactions still require a manual browser check.

The PDF pagination regression also uses Poppler's `pdftotext` when installed, checking that headings and short introductions stay with their code, code blocks that fit stay on one page, oversized blocks keep all their lines, and light print pages have a white background. That regression is skipped if `pdftotext` is unavailable. Set `MARKFLOW_TEST_PORT` to use a different test-server port.

## Structure

- `src/markdown.js`: parsing, code highlighting, math and diagram extraction.
- `src/render.js`: sanitization, linked headings/contents, callouts and Mermaid rendering.
- `src/images.js`: local image matching and optional external image embedding.
- `src/export.js`: portable HTML and document-only printing.
- `src/storage.js`: local draft and image persistence.
- `src/main.js`: editor and application interactions.
- `src/document.css`: shared document styling for preview and exports.
- `vite.config.js`: static build, embedded equation fonts, manifest and offline precache.
