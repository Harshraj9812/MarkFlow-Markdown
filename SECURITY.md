# Security and privacy review

Reviewed locally on 17 November 2026. This records a dependency advisory scan and targeted source/browser review; it is not a guarantee that every possible vulnerability has been found. No live Netlify deployment or account configuration was inspected.

## Where documents are processed

- Markdown parsing, highlighting, equations, Mermaid diagrams, HTML generation and PDF preparation run in the browser. PDF output uses the browser's print engine.
- Drafts, preferences and attached raster images are stored in IndexedDB on the current browser/device. The app does not encrypt that storage or sync it to a server. Browser-profile access and installed extensions remain relevant to confidentiality.
- The repository contains a static Netlify build, with no upload endpoint, Functions, database service or analytics integration. Netlify still receives ordinary requests for the site and its static assets. Hosting traffic metadata is distinct from document conversion.
- Absolute HTTP(S) image URLs intentionally contact their image host. Optional image embedding also fetches those URLs, without cookies or a referrer. An image URL can itself contain sensitive information. Local image references are resolved against attached files, without requesting the relative path from the hosting server.
- Following an external document link or the developer-credit link opens that destination after a user action.

## Dependency findings and remediation

The initial `npm audit` reported **four moderate affected-package findings**, with no high or critical findings. Two underlying advisories affected the PWA build chain: `glob` and `minimatch`, propagated through `workbox-build` and `vite-plugin-pwa`.

| Advisory | Previous installed dependency | Remediation |
| --- | --- | --- |
| [Glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `glob` 11.1.0 under Workbox | Scoped override to `glob` 14.0.6 |
| [Minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `minimatch` 10.2.6 under that glob | Patched glob resolves `minimatch` 11.0.9 |

The override is restricted to `workbox-build`. It avoids downgrading the current PWA plugin. The production build and browser/offline checks validate the API usage after this transitive major-version change. Remove or reassess the override when Workbox adopts a patched glob release itself.

After remediation, both `npm audit` and `npm audit --omit=dev` report **zero known vulnerabilities**. The lockfile records the resolved versions. Audit results describe the advisory database at scan time, not future disclosures or package provenance. The [npm audit documentation](https://docs.npmjs.com/cli/audit.html/) describes the package names/versions submitted to the registry; the audit does not submit Markdown documents.

## Application findings and fixes

### Unexpected request for local image paths

A browser regression reproduced a request for a local Markdown image's relative filename and query string before the app replaced the missing image. This could disclose that path to the hosting server, even though the document body was not uploaded.

The renderer now parses sanitized HTML in an inert template, removes image sources before adoption into the active document, and resolves local references before display. Missing local images become placeholders. Explicit external images remain supported and are covered by a separate mocked-host test.

### Imported HTML reusing application styles

Sanitized raw HTML could retain app class names such as `toast`, enabling imported content to imitate or overlay parts of the interface. Imported classes are now restricted to the document renderer's supported formatting classes. Native dialogs and popover attributes are also blocked. Document identifiers are prefixed to keep them separate from application controls.

### Additional enforcement

- Imported scripts, frames, forms, event attributes and document-supplied styles are removed. Background-image and link-ping attributes are also blocked.
- Content Security Policy is declared in the app and Netlify headers. It restricts scripts to the same origin, blocks inline script execution, objects and base-URL changes, and permits the internal PDF print frame. Localhost WebSocket exceptions appear only in the app's meta policy for Vite development; deployed headers are stricter.
- Inline **styles** remain allowed because equation and diagram rendering needs them. This is separate from inline scripts, which are blocked.
- Mermaid remains in strict mode, and generated SVG is sanitized. KaTeX trusted HTML commands are disabled. Exported HTML has its own restrictive policy, and the print iframe runs without script permission.

## Repeatable checks

```bash
npm audit
npm audit --omit=dev
npm test
npm run build
npm run test:browser
```

Security browser tests assert that local note text and local image paths are not transmitted, imported HTML cannot reuse app overlay classes or execute scripts, CSP blocks inline script injection, and explicitly linked external images still display and embed correctly. Other browser tests cover diagrams, equations, offline reload, attachments, storage, mobile navigation, HTML exports and PDF behavior.

Update a running PWA when prompted to use these fixes. Previously downloaded HTML files are static copies and should be regenerated if the updated renderer or policy is needed.

## Public repository review

The publication review on 17 November 2026 used the official Gitleaks 8.30.1 binary, verified against its release checksum. Scanning ran locally with redacted reports kept outside the repository; source files were not uploaded to a scanning service.

- The current public candidate files (tracked files plus non-ignored new files) produced no secret findings with the scanner's default rules. A manual review also checked credential markers, personal filesystem paths, private hostnames/IP addresses and package-download URLs.
- All available Git refs and reflogs were scanned: one existing commit, with no secret findings. No ignored files were already tracked.
- `review-exports/` contains personal document review artifacts and remains ignored and untracked, alongside build output, dependencies and test traces. Keep these local files out of any manual upload/archive intended for publication.
- Ignore rules additionally exclude environment files, cloud credential directories, local editor/agent state, private-key files and scanner reports. `.env.example` is allowed for placeholder-only examples.
- The developer name and website link are intentional public credits. Test values such as `MARKFLOW_PRIVATE_TOKEN` and `token=secret` are deliberately fake regression fixtures.
- **Privacy item:** the existing commit's author and committer metadata use a personal email address rather than a GitHub noreply address. That metadata will be public if this history is published. Changing local Git configuration affects future commits; hiding the address in this existing commit requires a deliberate history rewrite. History was not modified during this review.

This is a review of the local files and available history, not a guarantee that all sensitive data can be detected. Recheck newly added files before publication. No GitHub publication was performed.
