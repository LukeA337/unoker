// evaluator.ts - resolve an ordered UNOKER hand into its best legal category.
//
// THE hard, look-independent part. Given five cards IN ORDER (order is fixed at
// showdown - the player committed to it), this:
//   1. resolves the copy chain left-to-right,
//   2. brute-forces wild values (0..10) to find the strongest value shape,
//   3. decides flush feasibility from the printed colours,
//   4. classifies the value shape into a Pattern,
//   5. looks the (pattern, flush) pair up in the data-driven HAND_RANKINGS,
//   6. returns a tiebreak vector for comparing same-category hands.
//
// It NEVER hardcodes the ranking order - everything routes through
// ranking.ts, so reordering HAND_RANKINGS changes results with no edits here.

import type { Card, Color } from "./cards";
import { COLORS } from "./cards";
import {
  type HandCategory,
  type Pattern,
  categoryAt,
  rankIndexOf,
} from "./ranking";

export interface HandResult {
  rankIndex: number; // index into HAND_RANKINGS; lower = stronger
  category: HandCategory; // the resolved category (pattern + flush + name)
  resolvedValues: number[]; // resolved value of each card, in hand order
  wildValues: number[]; // chosen value for each wild, in hand order
  flushColor: Color | null; // the colour the flush resolves to, if any
  tiebreak: number[]; // compare same-category hands, highest first
}

const HAND_SIZE = 5;

/** The printed colour of a card for flush purposes, or null if it is free
 *  (Wild and Copy +4 can be any colour). */
function printedColor(card: Card): Color | null {
  return card.color;
}

/** Whether a flush is achievable, and in which colour. A flush needs all five
 *  cards to share a colour; free-colour cards (Wild, Copy +4) can become
 *  whatever the fixed-colour cards already are. Independent of wild VALUES. */
function flushFeasibility(cards: Card[]): { feasible: boolean; color: Color | null } {
  const fixed = new Set<Color>();
  for (const c of cards) {
    const col = printedColor(c);
    if (col !== null) fixed.add(col);
  }
  if (fixed.size === 0) return { feasible: true, color: COLORS[0] }; // all free
  if (fixed.size === 1) return { feasible: true, color: [...fixed][0] };
  return { feasible: false, color: null };
}

/** Resolve the copy chain for a given assignment of wild values.
 *  Copies take the resolved value of the card to their left (+add); the value
 *  to the left of the leftmost card is treated as 0. */
function resolveValues(cards: Card[], wildValues: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  let wi = 0;
  for (const c of cards) {
    let v: number;
    switch (c.kind.type) {
      case "number":
        v = c.kind.value;
        break;
      case "wild":
        v = wildValues[wi++];
        break;
      case "copy":
        v = prev + c.kind.add;
        break;
    }
    out.push(v);
    prev = v;
  }
  return out;
}

/** Classify five resolved values into a Pattern. */
function classify(values: number[]): Pattern {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const byCount = [...counts.values()].sort((a, b) => b - a);
  const distinctAsc = [...counts.keys()].sort((a, b) => a - b);

  if (byCount[0] === 5) return "fiveOfAKind";
  if (byCount[0] === 4) return "fourOfAKind";
  if (byCount[0] === 3 && byCount[1] === 2) return "fullHouse";
  if (byCount[0] === 3) return "threeOfAKind";
  if (byCount[0] === 2 && byCount[1] === 2) return "twoPair";
  if (byCount[0] === 2) return "onePair";
  // all five distinct
  if (distinctAsc.length === 5 && distinctAsc[4] - distinctAsc[0] === 4) {
    return "straight";
  }
  return "uno";
}

/** Tiebreak vector: groups sorted by (count desc, value desc), highest first.
 *  Straights compare on their top card. Compared lexicographically. */
function tiebreakVector(values: number[], pattern: Pattern): number[] {
  if (pattern === "straight") return [Math.max(...values)];
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([value]) => value);
}

/** Compare two tiebreak vectors. >0 if a is stronger, <0 if b, 0 if equal. */
function compareTiebreak(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

/** Strict "is candidate strictly stronger than current best?" using the same
 *  total order players see: lower rankIndex first, then tiebreak. */
function strongerThan(
  cand: { rankIndex: number; tiebreak: number[] },
  best: { rankIndex: number; tiebreak: number[] } | null,
): boolean {
  if (best === null) return true;
  if (cand.rankIndex !== best.rankIndex) return cand.rankIndex < best.rankIndex;
  return compareTiebreak(cand.tiebreak, best.tiebreak) > 0;
}

/**
 * Evaluate an ordered five-card hand to its strongest legal category.
 * Optimises only over the free parameters the rules allow at showdown: wild
 * VALUES and (implicitly) the colours of free-colour cards for a flush. It does
 * NOT reorder the hand - order is locked once flipped.
 */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length !== HAND_SIZE) {
    throw new Error(`evaluateHand expects ${HAND_SIZE} cards, got ${cards.length}`);
  }

  const flush = flushFeasibility(cards);
  const wildIdx = cards
    .map((c, i) => (c.kind.type === "wild" ? i : -1))
    .filter((i) => i >= 0);

  // Enumerate every assignment of wild values in {0..10}. With at most four
  // wilds this is <= 11^4 combinations - tiny.
  let best: HandResult | null = null;
  const wildValues = new Array(wildIdx.length).fill(0);

  const tryAssignment = () => {
    const values = resolveValues(cards, wildValues);
    const pattern = classify(values);
    const tiebreak = tiebreakVector(values, pattern);

    // Candidate categories for this value shape: the non-flush row always, and
    // the flush row when a flush is feasible. Take whichever ranks higher. We
    // compare BOTH rather than assuming flush > non-flush, so the result stays
    // correct under any reordering of HAND_RANKINGS.
    let chosenRank = rankIndexOf(pattern, false);
    if (flush.feasible) {
      chosenRank = Math.min(chosenRank, rankIndexOf(pattern, true));
    }

    const candidate: HandResult = {
      rankIndex: chosenRank,
      category: categoryAt(chosenRank),
      resolvedValues: values,
      wildValues: wildValues.slice(),
      flushColor: categoryAt(chosenRank).flush ? flush.color : null,
      tiebreak,
    };
    if (strongerThan(candidate, best)) best = candidate;
  };

  const recurse = (depth: number) => {
    if (depth === wildIdx.length) {
      tryAssignment();
      return;
    }
    for (let v = 0; v <= 10; v++) {
      wildValues[depth] = v;
      recurse(depth + 1);
    }
  };
  recurse(0);

  // best is always set: with zero wilds, recurse(0) runs tryAssignment once.
  return best as unknown as HandResult;
}

/** Compare two evaluated hands. >0 if a wins, <0 if b wins, 0 if a true tie
 *  (split pot). Uses the same order players see. */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankIndex !== b.rankIndex) return a.rankIndex < b.rankIndex ? 1 : -1;
  return compareTiebreak(a.tiebreak, b.tiebreak);
}

/**
 * Best arrangement of a set of cards over all orderings. Players choose their
 * own order before showdown; this finds the strongest legal order, which the
 * UI can offer as an "auto-arrange" hint and bots use to value their hands.
 * Returns the winning ordering and its result.
 */
export function bestArrangement(cards: Card[]): {
  order: Card[];
  result: HandResult;
} {
  if (cards.length !== HAND_SIZE) {
    throw new Error(`bestArrangement expects ${HAND_SIZE} cards`);
  }
  let bestOrder: Card[] | null = null;
  let bestResult: HandResult | null = null;

  const perm: Card[] = [];
  const used = new Array(cards.length).fill(false);
  const go = () => {
    if (perm.length === cards.length) {
      const result = evaluateHand(perm);
      if (bestResult === null || compareHands(result, bestResult) > 0) {
        bestResult = result;
        bestOrder = perm.slice();
      }
      return;
    }
    for (let i = 0; i < cards.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      perm.push(cards[i]);
      go();
      perm.pop();
      used[i] = false;
    }
  };
  go();

  return {
    order: bestOrder as unknown as Card[],
    result: bestResult as unknown as HandResult,
  };
}
