/**
 * Configuração central. Valores de mapa usam o mapa "Ixellior" (McMeddon, 3000x3000) — ver
 * docs/DESIGN.md §1. centerX/centerZ medidos em jogo (aldeia perto do meio do mapa); floorY
 * ainda é estimativa — só temos um ponto de referência de altura real até agora.
 */
export const CONFIG = {
  map: {
    /** Centro medido em jogo, dentro de uma vila perto do meio do mapa Ixellior. */
    centerX: 1552,
    centerZ: 1562,
    /** Lado da área usada em blocos (mapa Ixellior tem 3000x3000 no total). */
    size: 2000,
    /**
     * Y abaixo do qual tudo é removido para virar "ilha flutuante" (§1) e até onde
     * o desmoronamento (§5) esvazia cada coluna. Único dado real até agora: o chão da vila
     * do centro está em Y=92 — ajustar depois de medir mais pontos (vale/montanha) do mapa.
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

  lobby: {
    /**
     * Fase de teste (§3): sem placar/matchmaking de verdade ainda — só um tempo fixo de
     * espera, porque em teste não tem gente suficiente pra bater um número máximo de
     * jogadores. Versão de produção (área fixa fora do mapa, duas condições de início)
     * fica pra depois — ver docs/DESIGN.md §3.
     */
    testWaitTicks: 20 * 30,
    /** Mínimo online pro tempo acabar e a partida realmente começar (senão só cancela). */
    testMinPlayers: 1,
    /** Bateu esse número antes do tempo acabar, começa na hora. */
    testMaxPlayers: 30,
  },

  dragonFlight: {
    /** Mesma entidade da queda inicial (§4) — reaproveitada aqui, como o roadmap prevê. */
    entityId: "br:dragon",
    /** Quanto tempo o dragão fica parado antes do primeiro sobrevoo pós-queda ("alguns minutos"). */
    restAfterDropTicks: 20 * 60 * 3,
    /** Velocidade do voo autônomo (sem piloto) — mais suave que a rota da queda inicial. */
    cruiseSpeedBlocksPerTick: 1.0,
    /** Tentativas de sortear um ponto com chão sólido antes de usar o centro garantido (§4). */
    maxLandingAttemptsPerCycle: 12,
    /** Quanto tempo (ticks) o dragão fica pousado à espera de um piloto — sorteado nesse intervalo. */
    landStayTicksMin: 20 * 20,
    landStayTicksMax: 20 * 60,

    pilot: {
      /** Velocidade horizontal do voo livre pilotado (blocos/tick), controlada pelo WASD. */
      speedBlocksPerTick: 1.6,
      /** Velocidade de subida/descida (blocos/tick), controlada por Pular/Agachar. */
      verticalSpeedBlocksPerTick: 1.2,
      /** Inclinação máxima de subida/descida do corpo do dragão (visual, não afeta o voo). */
      maxPitchDeg: 45,
      /** Limites de altura durante o voo livre — placeholders, ajustar após medir o mapa. */
      minY: 40,
      maxY: 280,
      /**
       * `player.inputInfo.getMovementVector()` é recente e o sentido exato de "+1" não está
       * 100% documentado — se o dragão andar ao contrário do esperado num teste real, inverte
       * aqui em vez de mexer na lógica de voo.
       */
      invertForwardInput: false,
      invertStrafeInput: false,
    },

    /**
     * De onde os dois poderes saem: da BOCA do dragão, não da mão do piloto — offset a
     * partir de `dragon.location` (base/pés), na direção que o dragão está olhando.
     * Placeholders — ajustar em jogo olhando o modelo real (geometria do Ender Dragon).
     */
    mouth: {
      forwardOffset: 3.5,
      upOffset: 2.2,
    },

    /**
     * Poder 1 — "Chifre do Dragão": ataque normal do dragão, ilimitado, só com cooldown
     * curto entre disparos. Item vanilla dado na mão secundária (ver nota em dragonFlight.ts
     * sobre por que o ataque usa itens em vez do botão de ataque nativo).
     */
    fireball: {
      itemTypeId: "minecraft:blaze_rod",
      itemName: "§cChifre do Dragão",
      /** Velocidade de disparo do dragon_fireball. */
      speed: 1.6,
      /** Intervalo mínimo entre disparos do mesmo piloto. */
      cooldownTicks: 20 * 3,
    },

    /**
     * Poder 2 — "Bolas de Fogo": carga limitada, recarrega uma de cada vez com o tempo.
     * Item vanilla dado na mão principal (força o slot 0 da hotbar enquanto pilota).
     */
    fireballCharge: {
      itemTypeId: "minecraft:fire_charge",
      itemName: "§6Bolas de Fogo",
      /** Cargas máximas — ponto de partida pra ajustar jogando. */
      maxCharges: 15,
      /** Tempo (ticks) pra recarregar UMA carga (não o estoque inteiro de uma vez). */
      regenTicks: 20 * 8,
      /** Velocidade de disparo do dragon_fireball. */
      speed: 1.6,
    },
  },
} as const;
