import { defineConfig } from 'astro/config';

// Static output deploys cleanly to Cloudflare Pages with no adapter.
// When you add the multiplayer server later, it lives as a SEPARATE
// Cloudflare Workers + Durable Objects service. This config does not change.
export default defineConfig({
  output: 'static',
});
