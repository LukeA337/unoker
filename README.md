# UNOKER.NET

The skeleton for a website teaching **UNOKER** (poker with an Uno deck), with a
1990s "early internet" aesthetic. Two real pages of content (home + rules) and a
placeholder for the game you'll build next.

Built with [Astro](https://astro.build). Static output, deploys free to
Cloudflare Pages. No backend yet.

## What's here

```
src/
  layouts/BaseLayout.astro      site chrome: marquee, nav, footer junk
  components/
    Card.astro                  original CSS card art (NOT Uno's design)
    GamePlaceholder.astro       "under construction" -> THE SWAP POINT for the game
  pages/
    index.astro                 landing page
    rules.astro                 full rules, from the guide
    play.astro                  renders <GamePlaceholder/>
  styles/global.css             the whole 90s look
  engine/                       RESERVED for the pure game engine (see its README)
public/favicon.svg
```

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

## Building the game next

The game goes on `/play`. In `src/pages/play.astro`, swap the single line
`<GamePlaceholder />` for your game component (an Astro island, e.g.
`<Game client:load />`).

Put the rules/deck/hand-evaluation logic in `src/engine/` as pure TypeScript
(no DOM, no network). That's what lets the identical code run client-side now
and on a server when you add multiplayer. See `src/engine/README.md`.

### Multiplayer, when you get there

A static site can't hold WebSocket connections, so multiplayer will be a
**separate Cloudflare Workers + Durable Objects service** (the successor to
PartyKit, which Cloudflare absorbed). It imports the same `src/engine/` code,
owns the authoritative game state per room, and reveals hands only at showdown.
This site's hosting setup doesn't change when you add it.
