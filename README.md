# UNOKER.NET

A website teaching **UNOKER** (poker with an Uno deck), with a 1990s "early
internet" aesthetic. Three pages: home, the full rules, and a **playable**
single-player game vs. computer opponents on `/play`.

Built with [Astro](https://astro.build). Static output, deploys free to
Cloudflare Pages. No backend yet (single-player runs entirely in the browser).

## What's here

```
src/
  layouts/BaseLayout.astro      site chrome: marquee, nav, footer junk
  components/
    Card.astro                  modern UNO-style CSS card art
    Game.astro                  the 2D play table (renderer: draws engine state)
    GamePlaceholder.astro       the original "under construction" swap-point marker
  pages/
    index.astro                 landing page
    rules.astro                 full rules, from the guide
    play.astro                  renders <Game/>  (the swap point)
  styles/global.css             the whole 90s look + the game table
  engine/                       the pure game engine + tests (see its README)
public/favicon.svg
```

The engine (`src/engine/`) is pure TypeScript with no DOM/network: deck, hand
evaluator, and the betting/draw state machine, with a Vitest suite. `Game.astro`
is just a renderer over it. Run the tests with `npm test`.

## Run it locally (Windows)

You need [Node.js](https://nodejs.org) (LTS). Then, in this folder:

```
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:4321). Edits hot-reload.

To make a production build and preview it exactly as it'll be served:

```
npm run build      # outputs to dist/
npm run preview
```

## Deploy to Cloudflare Pages (free)

1. Push this folder to a GitHub repo (see below).
2. In the Cloudflare dashboard: **Workers & Pages -> Create -> Pages ->
   Connect to Git**, pick the repo.
3. Set the build config (Cloudflare usually auto-detects Astro, but verify):
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Save and deploy. You get a free `*.pages.dev` URL. Every `git push`
   redeploys; pull requests get their own preview URLs.

Wrong output directory is the #1 cause of a successful build showing a blank
page, so double-check it's `dist`.

### First push to GitHub

```
git init
git add .
git commit -m "UNOKER skeleton"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### Custom domain (later)

Buy the domain (Cloudflare Registrar sells at cost). In the Pages project:
**Custom domains -> Set up a domain**. Adding it changes the URL, nothing else.

## Changing the hand rankings

UNOKER's rankings are unusual and tuned by simulation. They live as one ordered
array, `HAND_RANKINGS`, in `src/engine/ranking.ts` (index 0 = strongest).
**Reorder that array and the whole game re-ranks** — the evaluator compares by
rank index and never hardcodes the order, so no other edits are needed. `npm
test` covers the evaluator against the rules PDF's worked hands.

## Building the 3D version next

The game on `/play` is a deliberately plain 2D renderer (`Game.astro`) over the
engine. A 3D (PS1-style) version is a *separate* renderer that swaps in for
`<Game />` in `src/pages/play.astro` and reads the same `GameState` — if it
stalls, the 2D game still works. Keep all rules/deck/evaluation logic in
`src/engine/`; renderers only draw state and send back player intents. See
`src/engine/README.md`.

### Multiplayer, when you get there

A static site can't hold WebSocket connections, so multiplayer will be a
**separate Cloudflare Workers + Durable Objects service** (the successor to
PartyKit, which Cloudflare absorbed). It imports the same `src/engine/` code,
owns the authoritative game state per room, and reveals hands only at showdown.
This site's hosting setup doesn't change when you add it.
