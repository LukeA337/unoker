// gameState.ts - the UNOKER betting/draw state machine as a pure reducer.
//
// Shape: (state, action) -> state. No DOM, no global RNG, no I/O. All
// randomness is derived deterministically from config.seed + handNumber, so
// the whole GameState is serialisable and a hand is fully reproducible.
//
// Flow per hand (from the rules):
//   blinds -> bet1 -> draw1 (<=2) -> bet2 -> draw2 (<=1) -> bet3 -> showdown
// Betting skips folded and all-in players; draws include every non-folded
// player. Side pots are built from each player's total contribution.

import type { Card } from "./cards";
import { buildDeck, makeRng, shuffle } from "./cards";
import {
  bestArrangement,
  compareHands,
  evaluateHand,
  type HandResult,
} from "./evaluator";

export type Phase =
  | "bet1"
  | "draw1"
  | "bet2"
  | "draw2"
  | "bet3"
  | "showdown"
  | "handOver";

export interface PlayerConfig {
  name: string;
  isBot: boolean;
}

export interface GameConfig {
  players: PlayerConfig[]; // 2..4; index 0 is conventionally the human
  startingChips: number;
  minBet: number; // big blind / minimum bet
  seed: number;
}

export interface PlayerState {
  id: number;
  name: string;
  isBot: boolean;
  chips: number;
  hand: Card[]; // ordered (order matters at showdown)
  committedThisRound: number;
  totalCommitted: number; // this whole hand, for side pots
  folded: boolean;
  allIn: boolean;
  hasActed: boolean; // since the last raise (betting) / has drawn (draw)
  lastAction?: string; // for the UI
}

export interface PotResult {
  amount: number;
  winners: number[]; // player ids
}

export interface ShowdownResult {
  hands: { playerId: number; result: HandResult; order: Card[] }[];
  pots: PotResult[];
  payouts: Record<number, number>; // playerId -> chips won
  uncontested: boolean; // true if everyone else folded (no reveal)
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  phase: Phase;
  dealer: number;
  toAct: number; // index to act; -1 when nobody acts (showdown/handOver)
  currentBet: number; // highest committedThisRound this round
  lastRaiseSize: number; // for min-raise enforcement
  drawLimit: number; // discard cap for the current draw phase
  log: string[];
  showdown?: ShowdownResult;
  handNumber: number;
}

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number } // target committedThisRound (covers opening bet)
  | { type: "reorder"; order: number[] } // permute the acting player's hand
  | { type: "draw"; discard: number[] }; // indices in hand to discard & replace

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clone(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    deck: s.deck.slice(),
    discard: s.discard.slice(),
    log: s.log.slice(),
  };
}

const isBetting = (phase: Phase): boolean =>
  phase === "bet1" || phase === "bet2" || phase === "bet3";
const isDraw = (phase: Phase): boolean => phase === "draw1" || phase === "draw2";

/** Total chips in play this hand. */
export function potTotal(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.totalCommitted, 0);
}

function seatAfter(
  s: GameState,
  from: number,
  pred: (p: PlayerState) => boolean,
): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (pred(s.players[j])) return j;
  }
  return -1;
}

const canBet = (p: PlayerState): boolean => !p.folded && !p.allIn;
const inHand = (p: PlayerState): boolean => !p.folded;

function commit(p: PlayerState, amount: number): void {
  const delta = Math.min(amount, p.chips);
  p.chips -= delta;
  p.committedThisRound += delta;
  p.totalCommitted += delta;
  if (p.chips === 0) p.allIn = true;
}

// ---------------------------------------------------------------------------
// starting a game / hand
// ---------------------------------------------------------------------------

export function startGame(config: GameConfig): GameState {
  const players: PlayerState[] = config.players.map((pc, i) => ({
    id: i,
    name: pc.name,
    isBot: pc.isBot,
    chips: config.startingChips,
    hand: [],
    committedThisRound: 0,
    totalCommitted: 0,
    folded: false,
    allIn: false,
    hasActed: false,
  }));
  const s: GameState = {
    config,
    players,
    deck: [],
    discard: [],
    phase: "handOver",
    dealer: 0,
    toAct: -1,
    currentBet: 0,
    lastRaiseSize: config.minBet,
    drawLimit: 0,
    log: [],
    handNumber: 0,
  };
  return startHand(s);
}

/** Begin a fresh hand: rotate dealer, shuffle, deal, post blinds. */
export function startHand(prev: GameState): GameState {
  const s = clone(prev);
  const n = s.players.length;
  s.handNumber += 1;
  if (s.handNumber > 1) {
    // move the button to the next player that still has chips
    s.dealer = seatAfter(s, s.dealer, (p) => p.chips > 0);
    if (s.dealer === -1) s.dealer = 0;
  }

  const rng = makeRng((s.config.seed + s.handNumber * 0x9e3779b1) | 0);
  const deck = shuffle(buildDeck(), rng);

  for (const p of s.players) {
    p.hand = [];
    p.committedThisRound = 0;
    p.totalCommitted = 0;
    p.folded = p.chips <= 0; // busted players sit the hand out
    p.allIn = false;
    p.hasActed = false;
    p.lastAction = undefined;
  }
  for (let r = 0; r < 5; r++) {
    for (const p of s.players) if (!p.folded) p.hand.push(deck.pop() as Card);
  }
  s.deck = deck;
  s.discard = [];
  s.showdown = undefined;

  const sb = seatAfter(s, s.dealer, inHand);
  const bb = seatAfter(s, sb, inHand);
  commit(s.players[sb], Math.floor(s.config.minBet / 2));
  s.players[sb].lastAction = "small blind";
  commit(s.players[bb], s.config.minBet);
  s.players[bb].lastAction = "big blind";

  s.currentBet = Math.max(
    s.players[sb].committedThisRound,
    s.players[bb].committedThisRound,
  );
  s.lastRaiseSize = s.config.minBet;
  for (const p of s.players) p.hasActed = false;
  s.phase = "bet1";
  s.toAct = seatAfter(s, bb, canBet);
  s.log.push(
    `--- Hand ${s.handNumber} --- dealer ${s.players[s.dealer].name}, ` +
      `${s.players[sb].name} posts ${s.players[sb].committedThisRound}, ` +
      `${s.players[bb].name} posts ${s.players[bb].committedThisRound}`,
  );

  // blinds may already settle the round (e.g. everyone all-in on blinds)
  return settleBettingIfDone(s);
}

// ---------------------------------------------------------------------------
// legal actions
// ---------------------------------------------------------------------------

export interface LegalActions {
  phase: Phase;
  toAct: number;
  isDraw: boolean;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  drawLimit: number;
}

export function legalActions(s: GameState): LegalActions | null {
  if (s.toAct < 0) return null;
  const p = s.players[s.toAct];
  const base: LegalActions = {
    phase: s.phase,
    toAct: s.toAct,
    isDraw: isDraw(s.phase),
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    drawLimit: s.drawLimit,
  };
  if (isDraw(s.phase)) return base;
  if (!isBetting(s.phase)) return null;

  const toCall = s.currentBet - p.committedThisRound;
  base.canFold = true;
  base.canCheck = toCall === 0;
  base.canCall = toCall > 0 && p.chips > 0;
  base.callAmount = Math.min(toCall, p.chips);

  const maxTo = p.committedThisRound + p.chips; // all-in cap
  const minTo = s.currentBet + Math.max(s.lastRaiseSize, s.config.minBet);
  // A raise is possible if the player can put in more than a call (even a
  // short all-in counts as a raise option in this casual ruleset).
  base.canRaise = p.chips > toCall;
  base.maxRaiseTo = maxTo;
  base.minRaiseTo = Math.min(minTo, maxTo);
  return base;
}

// ---------------------------------------------------------------------------
// applying an action
// ---------------------------------------------------------------------------

export function currentActor(s: GameState): PlayerState | null {
  return s.toAct >= 0 ? s.players[s.toAct] : null;
}

export function applyAction(prev: GameState, action: Action): GameState {
  const s = clone(prev);
  const p = s.players[s.toAct];

  // reorder is always allowed for the acting player and does not pass the turn
  if (action.type === "reorder") {
    if (s.toAct < 0) return prev;
    s.players[s.toAct].hand = reorderHand(p.hand, action.order);
    return s;
  }

  if (isBetting(s.phase)) return applyBetting(s, action);
  if (isDraw(s.phase)) return applyDraw(s, action);
  return prev; // no actions accepted in showdown/handOver
}

function reorderHand(hand: Card[], order: number[]): Card[] {
  if (
    order.length !== hand.length ||
    new Set(order).size !== hand.length ||
    order.some((i) => i < 0 || i >= hand.length)
  ) {
    return hand; // ignore an invalid permutation
  }
  return order.map((i) => hand[i]);
}

function applyBetting(s: GameState, action: Action): GameState {
  const p = s.players[s.toAct];
  switch (action.type) {
    case "fold":
      p.folded = true;
      p.hasActed = true;
      p.lastAction = "fold";
      break;
    case "check":
      if (s.currentBet !== p.committedThisRound) return s; // illegal -> ignore
      p.hasActed = true;
      p.lastAction = "check";
      break;
    case "call": {
      const toCall = s.currentBet - p.committedThisRound;
      commit(p, toCall);
      p.hasActed = true;
      p.lastAction = p.allIn ? "all-in" : "call";
      break;
    }
    case "raise": {
      const target = Math.max(action.to, 0);
      const maxTo = p.committedThisRound + p.chips;
      const to = Math.min(target, maxTo);
      if (to <= s.currentBet && to < maxTo) return s; // not a real raise -> ignore
      const raiseSize = to - s.currentBet;
      commit(p, to - p.committedThisRound);
      if (raiseSize > 0) {
        s.lastRaiseSize = Math.max(raiseSize, s.lastRaiseSize);
        s.currentBet = Math.max(s.currentBet, to);
        // a genuine raise re-opens the action for everyone else
        for (const q of s.players) if (canBet(q) && q.id !== p.id) q.hasActed = false;
      }
      p.hasActed = true;
      p.lastAction = p.allIn ? "all-in" : `raise to ${to}`;
      break;
    }
    default:
      return s;
  }

  // everyone but one folded -> award immediately
  if (s.players.filter(inHand).length <= 1) return awardUncontested(s);

  if (bettingComplete(s)) return advancePhase(settleBettingRound(s));

  s.toAct = seatAfter(s, s.toAct, canBet);
  return s;
}

function bettingComplete(s: GameState): boolean {
  const able = s.players.filter(canBet);
  return able.every((p) => p.hasActed && p.committedThisRound === s.currentBet);
}

/** No chips move here (they are already in totalCommitted); just reset the
 *  per-round counters so the next betting round starts clean. */
function settleBettingRound(s: GameState): GameState {
  for (const p of s.players) {
    p.committedThisRound = 0;
    p.hasActed = false;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.config.minBet;
  return s;
}

/** If blinds/all-ins already completed the opening round, settle + advance. */
function settleBettingIfDone(s: GameState): GameState {
  if (s.players.filter(inHand).length <= 1) return awardUncontested(s);
  if (isBetting(s.phase) && bettingComplete(s)) {
    return advancePhase(settleBettingRound(s));
  }
  return s;
}

// ---------------------------------------------------------------------------
// draws
// ---------------------------------------------------------------------------

function applyDraw(s: GameState, action: Action): GameState {
  const p = s.players[s.toAct];
  if (action.type !== "draw") return s;

  const valid = action.discard
    .filter((i, idx, arr) => arr.indexOf(i) === idx) // dedupe
    .filter((i) => i >= 0 && i < p.hand.length)
    .slice(0, s.drawLimit);

  const discardSet = new Set(valid);
  const kept: Card[] = [];
  const tossed: Card[] = [];
  p.hand.forEach((c, i) => (discardSet.has(i) ? tossed.push(c) : kept.push(c)));

  // draw replacements from the top of the deck (guard against an empty deck)
  const drawn: Card[] = [];
  for (let i = 0; i < tossed.length && s.deck.length > 0; i++) {
    drawn.push(s.deck.pop() as Card);
  }
  s.discard.push(...tossed);
  p.hand = [...kept, ...drawn];
  p.hasActed = true;
  p.lastAction = tossed.length ? `drew ${drawn.length}` : "stood pat";

  if (s.players.filter(inHand).every((q) => q.hasActed)) {
    return advancePhase(s);
  }
  s.toAct = seatAfter(s, s.toAct, inHand);
  return s;
}

// ---------------------------------------------------------------------------
// phase transitions
// ---------------------------------------------------------------------------

function startDrawPhase(s: GameState, phase: Phase, limit: number): GameState {
  s.phase = phase;
  s.drawLimit = limit;
  for (const p of s.players) p.hasActed = false;
  s.toAct = seatAfter(s, s.dealer, inHand);
  if (s.toAct === -1) return advancePhase(s);
  return s;
}

function startBettingPhase(s: GameState, phase: Phase): GameState {
  s.phase = phase;
  s.currentBet = 0;
  s.lastRaiseSize = s.config.minBet;
  for (const p of s.players) {
    p.committedThisRound = 0;
    p.hasActed = false;
  }
  s.toAct = seatAfter(s, s.dealer, canBet);
  if (s.toAct === -1 || bettingComplete(s)) return advancePhase(s);
  return s;
}

/** Move from the just-finished phase to the next one. */
function advancePhase(s: GameState): GameState {
  switch (s.phase) {
    case "bet1":
      return startDrawPhase(s, "draw1", 2);
    case "draw1":
      return startBettingPhase(s, "bet2");
    case "bet2":
      return startDrawPhase(s, "draw2", 1);
    case "draw2":
      return startBettingPhase(s, "bet3");
    case "bet3":
      return runShowdown(s);
    default:
      return s;
  }
}

// ---------------------------------------------------------------------------
// showdown + pots
// ---------------------------------------------------------------------------

function awardUncontested(s: GameState): GameState {
  const winner = s.players.find(inHand);
  const pot = potTotal(s);
  const payouts: Record<number, number> = {};
  if (winner) {
    winner.chips += pot;
    payouts[winner.id] = pot;
    s.log.push(`${winner.name} wins ${pot} (everyone else folded)`);
  }
  for (const p of s.players) {
    p.committedThisRound = 0;
    p.totalCommitted = 0; // chips have left the pot; keep accounting clean
  }
  s.showdown = {
    hands: [],
    pots: [{ amount: pot, winners: winner ? [winner.id] : [] }],
    payouts,
    uncontested: true,
  };
  s.phase = "handOver";
  s.toAct = -1;
  return s;
}

/** Classic layered side-pot construction from each player's total contribution.
 *  Folded players still contribute chips but cannot win. */
function buildPots(s: GameState): PotResult[] {
  const levels = [
    ...new Set(
      s.players.filter((p) => p.totalCommitted > 0).map((p) => p.totalCommitted),
    ),
  ].sort((a, b) => a - b);

  const pots: PotResult[] = [];
  let prev = 0;
  for (const lvl of levels) {
    let amount = 0;
    for (const p of s.players) {
      const contrib = Math.min(p.totalCommitted, lvl) - Math.min(p.totalCommitted, prev);
      amount += Math.max(contrib, 0);
    }
    const eligible = s.players
      .filter((p) => !p.folded && p.totalCommitted >= lvl)
      .map((p) => p.id);
    if (amount > 0) pots.push({ amount, winners: eligible });
    prev = lvl;
  }
  return pots;
}

function runShowdown(s: GameState): GameState {
  const contenders = s.players.filter(inHand);

  // Bots play optimally: arrange their hand to its strongest legal order.
  // Humans are evaluated exactly as they left their cards (arranging is a skill).
  const hands = contenders.map((p) => {
    let order = p.hand;
    if (p.isBot) order = bestArrangement(p.hand).order;
    p.hand = order;
    return { playerId: p.id, result: evaluateHand(order), order: order.slice() };
  });
  const resultById = new Map(hands.map((h) => [h.playerId, h.result]));

  const pots = buildPots(s);
  const payouts: Record<number, number> = {};
  for (const pot of pots) {
    if (pot.winners.length === 0) continue;
    // strongest eligible hand(s) take the pot
    let best: HandResult | null = null;
    let winners: number[] = [];
    for (const id of pot.winners) {
      const r = resultById.get(id) as HandResult;
      const cmp = best === null ? 1 : compareHands(r, best);
      if (cmp > 0) {
        best = r;
        winners = [id];
      } else if (cmp === 0) {
        winners.push(id);
      }
    }
    // split, distributing any odd remainder to the earliest seats left of dealer
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const ordered = [...winners].sort(
      (a, b) =>
        ((a - s.dealer + s.players.length) % s.players.length) -
        ((b - s.dealer + s.players.length) % s.players.length),
    );
    for (const id of ordered) {
      let amt = share;
      if (remainder > 0) {
        amt += 1;
        remainder -= 1;
      }
      payouts[id] = (payouts[id] ?? 0) + amt;
    }
    pot.winners = ordered;
  }

  for (const p of s.players) if (payouts[p.id]) p.chips += payouts[p.id];
  for (const p of s.players) {
    p.committedThisRound = 0;
    p.totalCommitted = 0; // chips have left the pot; keep accounting clean
  }

  for (const h of hands) {
    s.log.push(
      `${s.players[h.playerId].name}: ${h.result.category.name}` +
        (payouts[h.playerId] ? ` -> wins ${payouts[h.playerId]}` : ""),
    );
  }

  s.showdown = { hands, pots, payouts, uncontested: false };
  s.phase = "handOver";
  s.toAct = -1;
  return s;
}

// ---------------------------------------------------------------------------
// between hands
// ---------------------------------------------------------------------------

/** Players still holding chips. */
export function solventPlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => p.chips > 0);
}

export function isGameOver(s: GameState): boolean {
  return solventPlayers(s).length <= 1;
}
