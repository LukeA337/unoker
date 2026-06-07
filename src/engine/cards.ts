// cards.ts - the UNOKER deck model and a deterministic, seedable shuffle.
//
// Pure: no DOM, no network, no global RNG. This is the look-independent core,
// so the same code can run client-side now and on a server later (see
// src/engine/README.md).

export type Color = "red" | "green" | "blue" | "yellow";
export const COLORS: readonly Color[] = ["red", "green", "blue", "yellow"];

// The kind of a card:
//  - number: carries a fixed value 0..10
//  - wild:   takes ANY value (0..10) and ANY colour
//  - copy:   takes the resolved value of the card to its LEFT, plus `add`
//            (0 = basic copy, 2 = Copy +2, 4 = Copy +4)
export type CardKind =
  | { type: "number"; value: number }
  | { type: "wild" }
  | { type: "copy"; add: 0 | 2 | 4 };

// A physical card. `color` is the PRINTED colour used for flushes. It is null
// for cards whose colour is free for flush purposes: Wild cards and Copy +4.
// Basic Copy and Copy +2 keep their printed colour (they only copy a VALUE).
export interface Card {
  id: string;
  kind: CardKind;
  color: Color | null;
}

/** A deterministic PRNG returning a float in [0, 1). Seed it explicitly; never
 *  reach for Math.random() inside the engine so play stays reproducible. */
export type RNG = () => number;

/** mulberry32 - tiny, fast, good enough for shuffling and bot jitter. */
export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Pure: returns a new array, leaves the input untouched. */
export function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * Build the full 108-card UNOKER deck:
 *  - 84 numbered: per colour, one 0 and two each of 1..10  (4 x 21)
 *  -  8 basic copies: two per colour
 *  -  8 Copy +2:      two per colour
 *  -  4 Copy +4:      colourless (free colour for flush)
 *  -  4 Wild:         colourless
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const add = (kind: CardKind, color: Color | null) =>
    deck.push({ id: `c${n++}`, kind, color });

  for (const color of COLORS) {
    add({ type: "number", value: 0 }, color);
    for (let v = 1; v <= 10; v++) {
      add({ type: "number", value: v }, color);
      add({ type: "number", value: v }, color);
    }
    add({ type: "copy", add: 0 }, color);
    add({ type: "copy", add: 0 }, color);
    add({ type: "copy", add: 2 }, color);
    add({ type: "copy", add: 2 }, color);
  }
  for (let i = 0; i < 4; i++) add({ type: "wild" }, null);
  for (let i = 0; i < 4; i++) add({ type: "copy", add: 4 }, null);
  return deck;
}

/** The single character shown on a card face: "0".."10", "W", "C", "+2", "+4". */
export function faceLabel(card: Card): string {
  switch (card.kind.type) {
    case "number":
      return String(card.kind.value);
    case "wild":
      return "W";
    case "copy":
      return card.kind.add === 0 ? "C" : `+${card.kind.add}`;
  }
}

/** Which visual face the <Card> component should draw. Printed-colour copies
 *  (basic, +2) render as that colour; colourless Copy +4 renders as "copy". */
export function faceColorClass(
  card: Card,
): Color | "wild" | "copy" {
  if (card.kind.type === "wild") return "wild";
  if (card.kind.type === "copy") return card.color ?? "copy";
  return card.color as Color;
}
