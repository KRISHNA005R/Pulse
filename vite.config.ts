import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The one place the live address lives. Used for canonical links, Open Graph,
 * the sitemap and structured data. Change it here if the domain changes.
 */
export const SITE_URL = 'https://pulsemoney.in';

/** Preload the two main font files so the first paint already uses Unbounded and Onest. */
function preloadFonts(): Plugin {
  return {
    name: 'pulse-preload-fonts',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;
      const files = Object.keys(ctx.bundle).filter((f) => /(unbounded|onest)-latin-wght-normal.*\.woff2$/.test(f));
      const tags = files.map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ');
      return html.replace('<!-- font-preload -->', tags);
    },
  };
}

/** Swap __SITE_URL__ placeholders in index.html. */
function siteUrl(): Plugin {
  return { name: 'pulse-site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL) };
}

const DESCRIPTION =
  'PULSE shows what you can safely spend until payday after bills, SIPs and savings. Plan trips, split with friends and track spending. Free, no bank login.';

// `npm run build` → the real website (PWA, SEO, offline).
// `npm run build:artifact` → one self-contained HTML preview with React from cdnjs.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    publicDir: artifact ? false : 'public',
    define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
    plugins: [
      react(),
      siteUrl(),
      ...(artifact
        ? [viteSingleFile()]
        : [
            preloadFonts(),
            VitePWA({
              registerType: 'autoUpdate',
              injectRegister: false, // registered in src/lib/update.ts, which also keeps installed apps current
              includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og-image.jpg', 'robots.txt'],
              manifest: {
                id: '/',
                name: 'PULSE: Know what you can spend',
                short_name: 'PULSE',
                description: DESCRIPTION,
                lang: 'en-IN',
                dir: 'ltr',
                start_url: '/?source=pwa',
                scope: '/',
                display: 'standalone',
                display_override: ['standalone', 'minimal-ui'],
                orientation: 'portrait',
                background_color: '#17140F',
                theme_color: '#F6F5F2',
                categories: ['finance', 'productivity', 'lifestyle'],
                prefer_related_applications: false,
                icons: [
                  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                  { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                ],
                shortcuts: [
                  { name: 'Add expense', short_name: 'Add', description: 'Log money in or out', url: '/?action=add', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
                  { name: 'Can I afford this?', short_name: 'Afford?', description: 'Check a purchase against your week', url: '/?action=afford', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
                  { name: 'Plans', short_name: 'Plans', description: 'Your plans, splits and budgets', url: '/?tab=plans', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
                  { name: 'Ask PULSE AI', short_name: 'Ask AI', description: 'Ask about your money', url: '/?action=ai', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
                ],
                screenshots: [
                  { src: '/screenshots/home-light.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Safe to spend, bills and plans at a glance' },
                  { src: '/screenshots/composer.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Type “pizza with Rahul” and swipe to split' },
                  { src: '/screenshots/plans.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Plans that tell you if you are ahead or behind' },
                  { src: '/screenshots/home-dark.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Dark mode' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,jpg,webmanifest}'],
                globIgnores: ['stats/**', 'founder/**', 'email/**', 'screenshots/**', 'og-image.jpg', 'migrate.html', 'sw-migrate.js', 'llms.txt', '**/*cyrillic*', '**/*vietnamese*', '**/*greek*', 'fonts/**'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/stats/, /^\/founder/, /^\/about/, /^\/404/, /^\/migrate/, /^\/api\//, /\.(xml|txt)$/],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
              },
            }),
          ]),
    ],
    build: artifact
      ? {
          outDir: 'dist-artifact',
          assetsInlineLimit: 100_000_000,
          rollupOptions: {
            external: ['react', 'react-dom', 'react-dom/client'],
            output: {
              format: 'iife',
              globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
            },
          },
        }
      : {},
  };
});
