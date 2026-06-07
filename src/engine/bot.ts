// bot.ts - a simple, PURE computer-opponent policy.
//
// A bot is just another agent that reads the same information a player has
// (its own hand + public state) and emits an Action. It holds NO privileged
// knowledge of other hands and never mutates state, so it could run client- or
// server-side unchanged. Strength is judged with the engine's own evaluator.

import type { RNG } from "./cards";
import { bestArrangement } from "./evaluator";
import { HAND_RANKINGS } from "./ranking";
import {
  type Action,
  type GameState,
  legalActions,
  potTotal,
} from "./gameState";

/** 0 (worst) .. 1 (best) estimate of the acting player's hand strength. */
function handStrength(s: GameState): number {
  const p = s.players[s.toAct];
  const best = bestArrangement(p.hand).result;
  // rankIndex 0 is the nuts; spread it across [0,1].
  return 1 - best.rankIndex / (HAND_RANKINGS.length - 1);
}

/** Decide an action for whoever is to act. Deterministic given the same rng. */
export function botAction(s: GameState, rng: RNG): Action {
  const legal = legalActions(s);
  if (!legal) return { type: "check" };

  if (legal.isDraw) return botDraw(s);

  const strength = handStrength(s);
  const jitter = (rng() - 0.5) * 0.15; // a little unpredictability
  const score = Math.max(0, Math.min(1, strength + jitter));
  const p = s.players[s.toAct];
  const pot = Math.max(potTotal(s), 1);

  // ---- no bet to face: check, or value-bet when strong ----
  if (legal.canCheck) {
    if (score > 0.55 && legal.canRaise && rng() < 0.7) {
      const sized = legal.minRaiseTo + Math.round((pot / 2) * (score - 0.5) * 2);
      return { type: "raise", to: Math.min(sized, legal.maxRaiseTo) };
    }
    return { type: "check" };
  }

  // ---- facing a bet: fold / call / raise on a rough pot-odds + strength read ----
  const callOdds = legal.callAmount / (pot + legal.callAmount);
  if (score < 0.25 && score < callOdds) {
    return { type: "fold" };
  }
  if (score > 0.7 && legal.canRaise && rng() < 0.5) {
    const sized = legal.minRaiseTo + Math.round((pot / 2) * (score - 0.6));
    return { type: "raise", to: Math.min(sized, legal.maxRaiseTo) };
  }
  if (legal.canCall) return { type: "call" };
  return { type: "fold" };
}

/** Draw policy: keep a hand that is already decent; otherwise pitch the
 *  least-useful plain number cards (never the wilds/copies) up to the limit. */
function botDraw(s: GameState): Action {
  const p = s.players[s.toAct];
  const best = bestArrangement(p.hand).result;
  // Roughly "one pair flush" or better -> stand pat.
  if (best.rankIndex <= 7) return { type: "draw", discard: [] };

  const discardable = p.hand
    .map((card, i) => ({ card, i }))
    .filter(({ card }) => card.kind.type === "number")
    .sort((a, b) => {
      const av = a.card.kind.type === "number" ? a.card.kind.value : 0;
      const bv = b.card.kind.type === "number" ? b.card.kind.value : 0;
      return av - bv; // pitch the lowest values first
    })
    .slice(0, s.drawLimit)
    .map(({ i }) => i);

  return { type: "draw", discard: discardable };
}
