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
    /**
     * Y abaixo do qual tudo é removido para virar "ilha flutuante" (§1) e até onde
     * o desmoronamento (§5) esvazia cada coluna. Ajustar após medir o relevo real do mapa.
     */
    floorY: 30,
    /** Topo do mundo considerado nas limpezas de coluna. */
    topY: 320,
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

  floatingIsland: {
    /** Lado de cada coluna processada por vez (limite do /fill: 16×16×heightSlice < 32768). */
    columnSize: 16,
    /** Altura de cada fatia de /fill dentro da coluna. */
    heightSlice: 112,
    /** Colunas limpas por tick — operação única, mas ainda em lotes pra não travar o servidor. */
    columnsPerTick: 4,
  },

  zone: {
    /** Raio inicial da área segura (mapa 2000×2000 → metade do lado). */
    initialRadius: 1000,
    /** Abaixo disso o desmoronamento para (zona final). */
    minRadius: 60,
    /** Cada fase encolhe o raio por este fator. */
    shrinkFactor: 0.6,
    /** Contagem regressiva antes de cada fase começar a desmoronar. */
    warnTicks: 20 * 30,
    /** Duração alvo de cada fase de remoção de blocos (ritmo é ajustado pra caber nesse tempo). */
    collapseTicks: 20 * 60,
    /** Pausa segura entre o fim de uma fase e o aviso da próxima. */
    pauseTicks: 20 * 20,
    /** Lado de cada coluna processada (mesmo limite de /fill do item acima). */
    columnSize: 16,
    heightSlice: 112,
    /** Ritmo de remoção por tick, ajustado pra durar ~collapseTicks, com teto de segurança. */
    minColumnsPerTick: 1,
    maxColumnsPerTick: 24,
  },
} as const;
