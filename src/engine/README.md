# src/engine/  (the pure UNOKER game engine)

The **pure, framework-free game engine**: the rules, the deck, and the hand
evaluator, written as plain TypeScript with no DOM and no network code. The 2D
UI on `/play` imports it; a future multiplayer server and a 3D renderer would
import the exact same code.

## Why it lives on its own

Keeping the engine separate from the UI is the single decision that makes both
a 3D rendering layer and multiplayer easy to add later. The same engine runs in
several places unchanged:

1. **Now (single player):** imported by the `<Game />` component on `/play`. The
   AI opponents and the human all run client-side.
2. **A second renderer (e.g. 3D PS1 look):** swaps in for `<Game />` and reads
   the same `GameState`. If it stalls, the 2D game still works.
3. **Multiplayer (later):** imported by a **Cloudflare Workers + Durable
   Objects** server holding each room's authoritative state. The server owns the
   deck and deals, so clients can't read others' hole cards; reveal at showdown.

## Files

- `cards.ts`     — `Card` model, the 108-card deck, a seedable mulberry32 RNG +
                   Fisher-Yates `shuffle`. No global `Math.random()`.
- `ranking.ts`   — **`HAND_RANKINGS`: the 16 categories as one ordered array.**
                   This array *is* the hand rankings. Reorder it (e.g. after new
                   probability sims) and the whole game re-ranks with no other
                   edits. `rankIndexOf(pattern, flush)` is the only lookup.
- `evaluator.ts` — resolves copy chains left-to-right, brute-forces wild values
                   (0..10), decides flush feasibility from colours, classifies
                   the value shape, and routes everything through `ranking.ts`.
                   `evaluateHand(orderedHand)`, `compareHands`, `bestArrangement`.
- `gameState.ts` — the betting/draw machine as a pure reducer:
                   blinds → bet → draw(≤2) → bet → draw(≤1) → bet → showdown,
                   with side pots. `startGame`, `startHand`, `applyAction`,
                   `legalActions`, `currentActor`, `potTotal`, `isGameOver`.
- `bot.ts`       — a pure opponent policy `(state, rng) → Action`. Reads only its
                   own hand + public state; holds no privileged knowledge.
- `index.ts`     — the public API barrel. Renderers import ONLY from here.

## Design rules (keep these true)

- **Order matters.** A hand is an *ordered* five cards; copies copy the card to
  their left (a leftmost copy sees 0). The evaluator optimises wild values for a
  *given* order — it never reorders the hand (that is the player's locked choice
  at showdown). `bestArrangement` is offered separately for hints/bots.
- **Rankings are data, not code.** Never branch on a hand category by name in
  logic; always compare `rankIndex`. This is what keeps `HAND_RANKINGS`
  swappable.
- **The engine is deterministic and pure.** All randomness comes from
  `config.seed`; the whole `GameState` is serialisable. No DOM, no I/O.

## Tests

`engine.test.ts` (run with `npm test`) encodes the rules PDF's worked example
hands as fixtures, plus the tricky cases: copy chains exceeding 10, wilds
preferring Two Pair over Three of a Kind (UNOKER's inverted ranking), "Two Pair
Flush beats Five of a Kind", side-pot chip conservation across full hands. The
PDF examples remain the source of truth for the evaluator.
