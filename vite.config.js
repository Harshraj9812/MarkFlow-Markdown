import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const embeddedMathFonts = {
  name: 'embedded-math-fonts',
  resolveId(id) { if (id === 'virtual:math-css') return '\0markflow-math-css'; },
  load(id) {
    if (id !== '\0markflow-math-css') return;
    const base = new URL('./node_modules/katex/dist/', import.meta.url);
    const css = readFileSync(new URL('katex.min.css', base), 'utf8').replace(/src:([^;}]+)/g, (match, sources) => {
      const font = sources.match(/url\(fonts\/([^)]+\.woff2)\)/);
      if (!font) return match;
      const data = readFileSync(new URL(`fonts/${font[1]}`, base)).toString('base64');
      return `src:url(data:font/woff2;base64,${data}) format("woff2")`;
    });
    return `export default ${JSON.stringify(css)};`;
  },
};

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1800,
  },
  plugins: [embeddedMathFonts, VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'],
    manifest: {
      id: '/', name: 'Markflow — Markdown workspace', short_name: 'Markflow',
      description: 'Turn Markdown into modern HTML and PDF. Works offline.',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#0b0e14', theme_color: '#0b0e14',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      // Mermaid's diagram engines are split into chunks; precache all of them.
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/assets\//],
    },
  })],
});
