/**
 * Configuração central. Valores de mapa são PLACEHOLDERS até o mapa
 * "BATTLE ROYALE ISLAND" (Protagnst) ser importado e medido no servidor.
 */
export const CONFIG = {
  map: {
    /** Centro da ilha (X/Z) — ajustar após importar o mapa. */
    centerX: 0,
    centerZ: 0,
    /** Lado da ilha em blocos (mapa original: 2000x2000). */
    size: 2000,
  },

  dragonDrop: {
    entityId: "br:dragon",
    /** Altura fixa do voo (Y). */
    flightY: 220,
    /** Blocos por tick (20 ticks = 1 s). 1.5 → 30 blocos/s. */
    speedBlocksPerTick: 1.5,
    /** Quanto o trajeto começa/termina fora da borda da ilha. */
    routeMargin: 64,
    /** Ticks segurando os jogadores no ponto inicial (carregar chunk + contagem). */
    boardingTicks: 60,
    /** Se o dragão desviar mais que isso da rota, corrige com teleporte. */
    maxDriftBlocks: 2,
    /** Altura acima do dragão para quem não coube num assento (fallback). */
    fallbackRideOffsetY: 4,
  },

  netherBlock: {
    /** A cada quantos ticks checa a dimensão dos jogadores. */
    checkIntervalTicks: 5,
  },
} as const;
