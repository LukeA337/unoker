import { describe, it, expect } from "vitest";
import {
  type Card,
  type Color,
  buildDeck,
  makeRng,
  shuffle,
} from "./cards";
import { HAND_RANKINGS, rankIndexOf } from "./ranking";
import { evaluateHand, compareHands, bestArrangement } from "./evaluator";
import {
  startGame,
  applyAction,
  potTotal,
  type GameState,
} from "./gameState";
import { botAction } from "./bot";

// ---- tiny card builders --------------------------------------------------
let _id = 0;
const num = (color: Color, value: number): Card => ({
  id: `t${_id++}`,
  kind: { type: "number", value },
  color,
});
const wild = (): Card => ({ id: `t${_id++}`, kind: { type: "wild" }, color: null });
const copy = (add: 0 | 2 | 4, color: Color | null = null): Card => ({
  id: `t${_id++}`,
  kind: { type: "copy", add },
  color,
});

const sortedVals = (cards: Card[]) =>
  [...evaluateHand(cards).resolvedValues].sort((a, b) => a - b);

// ==========================================================================
describe("deck", () => {
  it("has 108 cards with the right composition", () => {
    const d = buildDeck();
    expect(d.length).toBe(108);
    const numbered = d.filter((c) => c.kind.type === "number");
    const wilds = d.filter((c) => c.kind.type === "wild");
    const copy0 = d.filter((c) => c.kind.type === "copy" && c.kind.add === 0);
    const copy2 = d.filter((c) => c.kind.type === "copy" && c.kind.add === 2);
    const copy4 = d.filter((c) => c.kind.type === "copy" && c.kind.add === 4);
    expect(numbered.length).toBe(84);
    expect(wilds.length).toBe(4);
    expect(copy0.length).toBe(8);
    expect(copy2.length).toBe(8);
    expect(copy4.length).toBe(4);
    // one 0 and two each of 1..10 per colour
    for (const color of ["red", "green", "blue", "yellow"] as Color[]) {
      const zeros = numbered.filter(
        (c) => c.color === color && c.kind.type === "number" && c.kind.value === 0,
      );
      expect(zeros.length).toBe(1);
    }
    // Copy +4 and Wild carry no printed colour
    expect(copy4.every((c) => c.color === null)).toBe(true);
    expect(wilds.every((c) => c.color === null)).toBe(true);
  });

  it("shuffles deterministically and as a permutation", () => {
    const a = shuffle(buildDeck(), makeRng(123));
    const b = shuffle(buildDeck(), makeRng(123));
    const c = shuffle(buildDeck(), makeRng(124));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect([...a.map((x) => x.id)].sort()).toEqual(
      [...buildDeck().map((x) => x.id)].sort(),
    );
  });
});

// ==========================================================================
describe("ranking table (the swappable list)", () => {
  it("has all 16 categories (8 patterns x flush/no-flush)", () => {
    expect(HAND_RANKINGS.length).toBe(16);
    const keys = new Set(HAND_RANKINGS.map((c) => `${c.pattern}:${c.flush}`));
    expect(keys.size).toBe(16);
  });

  it("encodes UNOKER's unusual interleaving", () => {
    // Two Pair Flush beats plain Five of a Kind...
    expect(rankIndexOf("twoPair", true)).toBeLessThan(
      rankIndexOf("fiveOfAKind", false),
    );
    // ...which in turn beats Three of a Kind Flush.
    expect(rankIndexOf("fiveOfAKind", false)).toBeLessThan(
      rankIndexOf("threeOfAKind", true),
    );
    // a flush version always outranks its own non-flush version
    for (const c of HAND_RANKINGS.filter((x) => x.flush)) {
      expect(rankIndexOf(c.pattern, true)).toBeLessThan(
        rankIndexOf(c.pattern, false),
      );
    }
  });
});

// ==========================================================================
describe("copy-chain resolution", () => {
  it("treats a leftmost copy as if a 0 sits to its left", () => {
    // +4 leftmost -> 0+4 = 4
    const h = [copy(4), num("green", 4), copy(2, "green"), num("green", 1), num("green", 0)];
    expect(evaluateHand(h).resolvedValues[0]).toBe(4);
  });

  it("chains copies left-to-right and may exceed 10", () => {
    // 9, +2->11, +2->13, 10, +2->12  (the rules' highest straight, 9..13)
    const h = [
      num("red", 9),
      copy(2, "red"),
      copy(2, "red"),
      num("yellow", 10),
      copy(2, "blue"),
    ];
    expect(sortedVals(h)).toEqual([9, 10, 11, 12, 13]);
    expect(evaluateHand(h).category.name).toBe("Straight");
  });
});

// ==========================================================================
describe("evaluator on the rules' worked example hands", () => {
  it("Uno (high card, mixed colours)", () => {
    const h = [
      num("red", 2),
      num("green", 3),
      num("red", 4),
      num("blue", 5),
      num("red", 9),
    ];
    expect(evaluateHand(h).category.name).toBe("Uno");
  });

  it("One Pair via a basic copy (C copies the 5 to its left)", () => {
    const h = [
      num("red", 2),
      num("green", 3),
      num("red", 4),
      num("blue", 5),
      copy(0, "yellow"),
    ];
    expect(evaluateHand(h).resolvedValues).toEqual([2, 3, 4, 5, 5]);
    expect(evaluateHand(h).category.name).toBe("One Pair");
  });

  it("Full House from a copy chain (8 8 10 10 10)", () => {
    const h = [
      num("blue", 8),
      num("yellow", 8),
      copy(2, "red"),
      copy(0, "blue"),
      num("green", 10),
    ];
    expect(sortedVals(h)).toEqual([8, 8, 10, 10, 10]);
    expect(evaluateHand(h).category.name).toBe("Full House");
  });

  it("Straight Flush (all yellow, 8..12)", () => {
    const h = [
      num("yellow", 8),
      num("yellow", 9),
      copy(2, "yellow"),
      num("yellow", 10),
      copy(2, "yellow"),
    ];
    const r = evaluateHand(h);
    expect(sortedVals(h)).toEqual([8, 9, 10, 11, 12]);
    expect(r.category.name).toBe("Straight Flush");
    expect(r.flushColor).toBe("yellow");
  });

  it("Five of a Kind Flush, optimising two wilds to 6", () => {
    const h = [num("blue", 6), num("blue", 6), copy(0, "blue"), wild(), wild()];
    const r = evaluateHand(h);
    expect(r.category.name).toBe("Five of a Kind Flush");
    expect(r.rankIndex).toBe(0);
    expect(r.resolvedValues).toEqual([6, 6, 6, 6, 6]);
  });

  it("Two Pair Flush arrangement (+4 4 +2 W 0, all green-able)", () => {
    const h = [copy(4), num("green", 4), copy(2, "green"), wild(), num("green", 0)];
    const r = evaluateHand(h);
    expect(r.category.name).toBe("Two Pair Flush");
  });
});

// ==========================================================================
describe("wild optimisation respects the custom rankings", () => {
  it("prefers Two Pair over Three of a Kind (Two Pair ranks higher)", () => {
    // 5 5 9 2 + wild: trips(wild=5) is possible but two pair(wild=9/2) ranks higher
    const h = [num("red", 5), num("green", 5), num("blue", 9), num("yellow", 2), wild()];
    const r = evaluateHand(h);
    expect(r.category.name).toBe("Two Pair");
    expect(r.category.flush).toBe(false);
  });

  it("no flush when two fixed colours are present", () => {
    const h = [num("red", 1), num("blue", 1), num("red", 2), num("red", 3), wild()];
    expect(evaluateHand(h).category.flush).toBe(false);
  });

  it("Uno Flush: all one colour, no pair (a Copy +4 borrows the colour)", () => {
    const h = [num("red", 1), num("red", 3), num("red", 5), num("red", 7), copy(4)];
    const r = evaluateHand(h);
    expect(r.category.name).toBe("Uno Flush");
    expect(r.flushColor).toBe("red");
  });
});

// ==========================================================================
describe("comparisons + tiebreaks", () => {
  it("a higher Full House beats a lower one", () => {
    const high = evaluateHand([
      num("red", 10),
      num("blue", 10),
      num("green", 10),
      num("red", 2),
      num("blue", 2),
    ]);
    const low = evaluateHand([
      num("red", 9),
      num("blue", 9),
      num("green", 9),
      num("red", 8),
      num("blue", 8),
    ]);
    expect(compareHands(high, low)).toBeGreaterThan(0);
    expect(compareHands(low, high)).toBeLessThan(0);
  });

  it("identical hands tie", () => {
    const a = evaluateHand([
      num("red", 4),
      num("blue", 4),
      num("green", 7),
      num("red", 2),
      num("blue", 9),
    ]);
    const b = evaluateHand([
      num("green", 4),
      num("yellow", 4),
      num("blue", 7),
      num("green", 2),
      num("red", 9),
    ]);
    expect(compareHands(a, b)).toBe(0);
  });

  it("Two Pair Flush beats plain Five of a Kind (the famous upset)", () => {
    const twoPairFlush = evaluateHand([
      num("red", 4),
      num("red", 4),
      num("red", 9),
      num("red", 9),
      num("red", 1),
    ]);
    const fiveKind = evaluateHand([
      num("red", 7),
      num("blue", 7),
      num("green", 7),
      num("yellow", 7),
      num("red", 7),
    ]);
    expect(twoPairFlush.category.name).toBe("Two Pair Flush");
    expect(fiveKind.category.name).toBe("Five of a Kind");
    expect(compareHands(twoPairFlush, fiveKind)).toBeGreaterThan(0);
  });
});

// ==========================================================================
describe("bestArrangement", () => {
  it("finds the order that yields a Straight Flush from copy cards", () => {
    const cards = [
      num("yellow", 8),
      num("yellow", 10),
      copy(2, "yellow"),
      num("yellow", 9),
      copy(2, "yellow"),
    ];
    expect(bestArrangement(cards).result.category.name).toBe("Straight Flush");
  });
});

// ==========================================================================
describe("game state machine", () => {
  const sumChips = (s: GameState) => s.players.reduce((t, p) => t + p.chips, 0);

  it("plays a full hand to showdown while conserving chips", () => {
    let s = startGame({
      players: [
        { name: "A", isBot: true },
        { name: "B", isBot: true },
        { name: "C", isBot: true },
      ],
      startingChips: 200,
      minBet: 10,
      seed: 7,
    });
    const TOTAL = 600;
    const rng = makeRng(999);

    let guard = 0;
    while (s.phase !== "handOver" && guard++ < 2000) {
      // chips never leak while the hand is live
      expect(sumChips(s) + potTotal(s)).toBe(TOTAL);
      s = applyAction(s, botAction(s, rng));
    }
    expect(s.phase).toBe("handOver");
    expect(guard).toBeLessThan(2000);
    // pot has been distributed; every chip is accounted for
    expect(sumChips(s)).toBe(TOTAL);
    expect(potTotal(s)).toBe(0);
  });

  it("conserves chips across many seeded hands", () => {
    for (const seed of [1, 2, 3, 42, 100]) {
      let s = startGame({
        players: [
          { name: "A", isBot: true },
          { name: "B", isBot: true },
        ],
        startingChips: 150,
        minBet: 10,
        seed,
      });
      const rng = makeRng(seed * 31 + 1);
      let guard = 0;
      while (s.phase !== "handOver" && guard++ < 2000) {
        s = applyAction(s, botAction(s, rng));
      }
      expect(s.players.reduce((t, p) => t + p.chips, 0)).toBe(300);
    }
  });
});
