// ranking.ts - the UNOKER hand rankings, expressed as DATA.
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS ARRAY IS THE GAME'S HAND RANKINGS.  To change how hands rank,    │
// │  reorder `HAND_RANKINGS` and change nothing else.  Index 0 = strongest.│
// │  The evaluator derives all strength comparisons from this order, so a  │
// │  reorder here (e.g. after re-running probability sims) is a one-line    │
// │  change with no logic edits anywhere.                                  │
// └──────────────────────────────────────────────────────────────────────┘

// The value-shape of a hand, independent of colour/flush.
export type Pattern =
  | "fiveOfAKind"
  | "fullHouse"
  | "straight"
  | "fourOfAKind"
  | "twoPair"
  | "threeOfAKind"
  | "onePair"
  | "uno"; // all distinct, not a straight (a.k.a. high card)

export interface HandCategory {
  pattern: Pattern;
  flush: boolean; // true if all five cards share a colour
  name: string; // display name
}

// Best (index 0) to worst. The interleaving of flush / non-flush is the whole
// point of UNOKER's custom rankings - DO NOT assume "flush always wins".
export const HAND_RANKINGS: readonly HandCategory[] = [
  { pattern: "fiveOfAKind", flush: true, name: "Five of a Kind Flush" },
  { pattern: "fullHouse", flush: true, name: "Full House Flush" },
  { pattern: "straight", flush: true, name: "Straight Flush" },
  { pattern: "fourOfAKind", flush: true, name: "Four of a Kind Flush" },
  { pattern: "twoPair", flush: true, name: "Two Pair Flush" },
  { pattern: "fiveOfAKind", flush: false, name: "Five of a Kind" },
  { pattern: "threeOfAKind", flush: true, name: "Three of a Kind Flush" },
  { pattern: "onePair", flush: true, name: "One Pair Flush" },
  { pattern: "uno", flush: true, name: "Uno Flush" },
  { pattern: "straight", flush: false, name: "Straight" },
  { pattern: "fullHouse", flush: false, name: "Full House" },
  { pattern: "fourOfAKind", flush: false, name: "Four of a Kind" },
  { pattern: "twoPair", flush: false, name: "Two Pair" },
  { pattern: "threeOfAKind", flush: false, name: "Three of a Kind" },
  { pattern: "onePair", flush: false, name: "One Pair" },
  { pattern: "uno", flush: false, name: "Uno" },
];

/** Strength rank of a (pattern, flush) combination. Lower = stronger.
 *  Returns the array index; throws if the table is missing a combination. */
export function rankIndexOf(pattern: Pattern, flush: boolean): number {
  const i = HAND_RANKINGS.findIndex(
    (c) => c.pattern === pattern && c.flush === flush,
  );
  if (i === -1) {
    throw new Error(
      `HAND_RANKINGS is missing an entry for pattern=${pattern} flush=${flush}`,
    );
  }
  return i;
}

/** Convenience: the category object at a given strength rank. */
export function categoryAt(rankIndex: number): HandCategory {
  return HAND_RANKINGS[rankIndex];
}
