import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

// Cloudflare's "connect to Git" flow set this up: hybrid output + the Cloudflare
// adapter. Every page here is still prerendered to static HTML at build time
// (there are no server routes), so the adapter's _worker.js just serves those
// static assets - it only leaves the door open for server-rendered pages or API
// routes later. Planned multiplayer remains a SEPARATE Workers + Durable Objects
// service; this config doesn't need to change for it.
export default defineConfig({
  output: "hybrid",
  adapter: cloudflare()
});