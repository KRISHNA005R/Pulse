// Only for the OWASP ZAP scan: the normal tests, with every request going through ZAP so it learns
// the app's real traffic (local stand-in only). Not part of the normal test run.
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  use: { ...base.use, launchOptions: { proxy: { server: 'http://127.0.0.1:8090', bypass: '<-loopback>' } }, ignoreHTTPSErrors: true },
});
