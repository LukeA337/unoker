// index.ts - the engine's public API. The 2D UI now, and a multiplayer server
// later, both import ONLY from here. Keep game logic behind this surface and
// out of rendering code (the swap-boundary discipline).

export * from "./cards";
export * from "./ranking";
export * from "./evaluator";
export * from "./gameState";
export * from "./bot";
