# src/engine/  (reserved)

This folder is intentionally empty for now. It is the home of the **pure,
framework-free game engine**: the rules, the deck, and the hand evaluator,
written as plain TypeScript with no DOM and no network code.

## Why it lives on its own

Keeping the engine separate from the UI is the single decision that makes
multiplayer easy to add later. The exact same engine code can run in two
places:

1. **Now (single player):** imported directly into the browser by the game
   component on `/play`. The AI opponents and the human all run client-side.

2. **Later (multiplayer):** imported by a **Cloudflare Workers + Durable
   Objects** server, which holds each game room's authoritative state over a
   WebSocket. The server owns the deck and deals, so clients can't cheat by
   reading their own hole cards. Reveal happens only at showdown.

Because both consume the same `engine/` module, adding multiplayer is "stand
up a separate server that imports this folder," not "rewrite the game."

## Suggested files (build in this order)

- `cards.ts`     deck model + seedable shuffle (108 cards)
- `evaluator.ts` resolve copy chains left-to-right, optimize wild values/colors,
                 classify the hand. THE hard part. Write tests first.
- `ranking.ts`   the 16 hand categories + tiebreaker comparison (non-standard
                 order; values can exceed 10, so don't reuse an off-the-shelf
                 poker ranker)
- `gameState.ts` betting/draw state machine as a pure reducer
- `bot.ts`       AI opponent policy (optional)

The worked examples in the original rules PDF are a ready-made test suite for
`evaluator.ts`. Encode them as fixtures before writing any UI.
