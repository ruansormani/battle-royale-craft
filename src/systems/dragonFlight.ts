/**
 * Sistema 4 (continuação) — Sobrevoo do dragão depois da queda inicial.
 *
 * Assume a MESMA entidade `br:dragon` que a queda inicial (`dragonDrop.ts`) usou, via
 * `onDragonDropFinished`. Estados:
 *
 *   resting    → parado no lugar por alguns minutos (config `restAfterDropTicks`).
 *   targeting  → sorteia um ponto dentro da área que ainda existe (reaproveita `zone.ts`)
 *                e procura chão sólido por baixo dele, um candidato por tick. Depois de
 *                `maxLandingAttemptsPerCycle` tentativas, usa o centro exato garantido.
 *   cruising   → voa suave até o ponto resolvido (também usado pra "descer e pousar" quando
 *                um piloto desmonta no meio do ar — mesma lógica, alvo diferente).
 *   landed     → pousado, parado; o primeiro jogador que montar vira o piloto.
 *   piloted    → um jogador pilota de verdade: a direção do olhar dele vira a direção do
 *                voo (aplicada por script, tick a tick — ver nota abaixo). O assento nativo
 *                tem 30 vagas (reaproveitado da entidade da queda), mas só UM piloto por vez
 *                é permitido aqui: qualquer outro jogador que tentar montar junto é ejetado
 *                na hora — o risco de o piloto desmontar no meio do voo e derrubar um
 *                passageiro "de carona" sem controle nenhum não vale a pena.
 *
 * ## Nota técnica — por que a pilotagem e o ataque são via script
 *
 * A Script API do Bedrock não expõe um jeito de interceptar o botão de ataque nativo
 * enquanto o jogador está montado numa entidade passiva (esse clique não gera um evento
 * script utilizável aqui). Por isso:
 *   - Pilotagem: lida a cada tick via `player.getViewDirection()` e aplicada por impulso,
 *     mesma técnica já usada em `dragonDrop.ts` pra mover o dragão pela rota da queda.
 *   - Ataque: em vez de depender do botão de ataque, o piloto recebe um item VANILLA
 *     (`minecraft:blaze_rod`, sem asset novo — não há como gerar textura customizada
 *     neste projeto) na mão secundária, marcado por dynamic property. Usar esse item
 *     (`itemUse`) dispara o `dragon_fireball`. O item anterior da mão secundária é salvo
 *     e devolvido ao desmontar.
 */
import {
  Dimension,
  Entity,
  EquipmentSlot,
  ItemStack,
  ItemUseAfterEvent,
  Player,
  system,
  Vector3,
  world,
} from "@minecraft/server";
import { CONFIG } from "../config";
import { log, warn } from "../util/log";
import { showActionBar, showTitle } from "../util/screen";
import { onDragonDropFinished } from "./dragonDrop";
import { centerOfRemaining, randomPointInRemaining } from "./zone";

type Phase = "idle" | "resting" | "targeting" | "cruising" | "landed" | "piloted";

const FIREBALL_ITEM_FLAG = "br:dragonHorn";

interface FlightState {
  phase: Phase;
  dragon?: Entity;
  dimension?: Dimension;
  /** Ticks desde o início da fase atual (cada `beginX` zera). */
  tick: number;
  /** Alvo 3D resolvido, usado por "cruising". */
  target?: Vector3;
  /** Quanto tempo (ticks) fica pousado nesta rodada — sorteado ao entrar em "landed". */
  stayTicks: number;
  pilotId?: string;
  intervalId?: number;
}

const state: FlightState = { phase: "idle", tick: 0, stayTicks: 0 };

/** Item da mão secundária salvo por jogador, pra devolver ao desmontar. */
const savedOffhand = new Map<string, ItemStack | undefined>();
/** Último `system.currentTick` (relógio absoluto, não o `state.tick` local) em que cada jogador disparou. */
const lastFireTick = new Map<string, number>();

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function isFlightActive(): boolean {
  return state.phase !== "idle";
}

/** Liga o sistema: assume o dragão assim que a queda inicial terminar. */
export function startDragonFlightSystem(): void {
  onDragonDropFinished((dragon) => {
    if (dragon) takeOverDragon(dragon, world.getDimension("overworld"));
  });
  world.afterEvents.itemUse.subscribe(handleItemUse);
}

/** Cria um dragão novo direto na fase de pouso, sem esperar a queda — só pra testar. */
export function spawnFlightTestDragon(): boolean {
  if (state.phase !== "idle") {
    warn("Sobrevoo já ativo — use /scriptevent br:flight_stop antes de testar de novo.");
    return false;
  }
  const dim = world.getDimension("overworld");
  const { centerX, centerZ } = CONFIG.map;
  const dragon = dim.spawnEntity(CONFIG.dragonFlight.entityId, {
    x: centerX + 0.5,
    y: CONFIG.dragonDrop.flightY,
    z: centerZ + 0.5,
  });
  state.dragon = dragon;
  state.dimension = dim;
  beginTargeting();
  if (state.intervalId === undefined) state.intervalId = system.runInterval(tick, 1);
  log("Dragão de teste do sobrevoo criado (pulando o descanso inicial).");
  return true;
}

export function stopDragonFlight(reason = "comando"): void {
  const dragon = state.dragon;
  if (dragon?.isValid) {
    try {
      dragon.getComponent("minecraft:rideable")?.ejectRiders();
    } catch {
      /* ignore */
    }
  }
  resetToIdle(reason);
}

// ---------------------------------------------------------------------------
// Handoff da queda inicial
// ---------------------------------------------------------------------------

function takeOverDragon(dragon: Entity, dim: Dimension): void {
  if (state.phase !== "idle") {
    warn("Sistema de sobrevoo já tem um dragão ativo — ignorando handoff da queda.");
    return;
  }
  state.dragon = dragon;
  state.dimension = dim;
  state.phase = "resting";
  state.tick = 0;
  if (state.intervalId === undefined) state.intervalId = system.runInterval(tick, 1);
  log("Dragão assumido pelo sistema de sobrevoo — descansando antes do primeiro voo.");
}

function resetToIdle(reason: string): void {
  if (state.intervalId !== undefined) system.clearRun(state.intervalId);
  state.intervalId = undefined;
  if (state.pilotId) {
    restoreOffhand(state.pilotId);
    state.pilotId = undefined;
  }
  state.phase = "idle";
  state.dragon = undefined;
  state.dimension = undefined;
  state.target = undefined;
  log(`Sobrevoo do dragão encerrado (${reason}).`);
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

function tick(): void {
  state.tick++;

  const dragon = state.dragon;
  if (!dragon || !dragon.isValid) {
    warn("Dragão do sobrevoo ficou inválido (chunk descarregado?) — sistema volta a ficar ocioso.");
    resetToIdle("dragao-invalido");
    return;
  }

  try {
    switch (state.phase) {
      case "resting":
        tickResting();
        break;
      case "targeting":
        tickTargeting();
        break;
      case "cruising":
        tickCruising();
        break;
      case "landed":
        tickLanded();
        break;
      case "piloted":
        tickPiloted();
        break;
    }
  } catch (e) {
    warn("Erro no tick do sobrevoo:", e);
    resetToIdle("erro");
  }
}

function tickResting(): void {
  // `minecraft:rideable` deixa qualquer jogador montar por interação nativa a qualquer
  // momento — não é o script que decide quando permitir. Fora da fase "landed"/"piloted",
  // ninguém deveria conseguir ficar montado; se alguém tentar, desmonta na hora.
  ejectUnwantedRiders();
  if (state.tick >= CONFIG.dragonFlight.restAfterDropTicks) beginTargeting();
}

/** Ejeta qualquer jogador montado fora das fases que devem permitir isso ("landed"/"piloted"). */
function ejectUnwantedRiders(): void {
  const rideable = state.dragon?.getComponent("minecraft:rideable");
  if (rideable && rideable.getRiders().length > 0) rideable.ejectRiders();
}

// ---------------------------------------------------------------------------
// targeting — sorteio de ponto de pouso, um candidato por tick (nunca sem teto)
// ---------------------------------------------------------------------------

function beginTargeting(): void {
  state.phase = "targeting";
  state.tick = 0;
  state.target = undefined;
}

function tickTargeting(): void {
  ejectUnwantedRiders();
  const cfg = CONFIG.dragonFlight;
  const dim = state.dimension!;
  const usingFallback = state.tick >= cfg.maxLandingAttemptsPerCycle;
  const point = usingFallback ? centerOfRemaining() : randomPointInRemaining();
  const groundY = findGroundY(dim, point.x, point.z);

  if (groundY !== undefined) {
    state.target = { x: point.x, y: groundY, z: point.z };
    beginCruising();
    return;
  }

  if (usingFallback) {
    // Nem o centro garantido tem chão sólido (área toda desmoronada) — pousa "no ar" na
    // altitude de cruzeiro da queda, em vez de ficar tentando sem limite.
    state.target = { x: point.x, y: CONFIG.dragonDrop.flightY, z: point.z };
    warn("Sem chão sólido nem no centro da área restante — indo pra altitude segura.");
    beginCruising();
  }
  // Senão, tenta de novo no próximo tick (state.tick já avança sozinho em tick()).
}

/** Escaneia de cima pra baixo, dentro do teto do mapa, até achar o primeiro bloco sólido. */
function findGroundY(dim: Dimension, x: number, z: number): number | undefined {
  const { floorY, topY } = CONFIG.map;
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = topY - 1; y >= floorY; y--) {
    let block;
    try {
      block = dim.getBlock({ x: bx, y, z: bz });
    } catch {
      return undefined; // chunk não carregado
    }
    if (block && !block.isAir) return y + 1;
  }
  return undefined; // nada sólido no intervalo (ex.: já desmoronou tudo ali)
}

// ---------------------------------------------------------------------------
// cruising — voo suave até `state.target` (pouso normal e "descer" pós-desmonte)
// ---------------------------------------------------------------------------

function beginCruising(): void {
  state.phase = "cruising";
  state.tick = 0;
}

function tickCruising(): void {
  const dragon = state.dragon!;
  const target = state.target;
  if (!target) {
    warn("Fase 'cruising' sem alvo definido — voltando a sortear.");
    beginTargeting();
    return;
  }

  ejectUnwantedRiders();

  const arrived = stepToward(dragon, target, CONFIG.dragonFlight.cruiseSpeedBlocksPerTick);
  if (arrived) beginLanded();
}

/** Move o dragão uma fração do caminho até `target`; devolve `true` quando chegou. */
function stepToward(dragon: Entity, target: Vector3, speedPerTick: number): boolean {
  const loc = dragon.location;
  const dx = target.x - loc.x;
  const dy = target.y - loc.y;
  const dz = target.z - loc.z;
  const dist = Math.hypot(dx, dy, dz);

  if (dist <= speedPerTick) {
    dragon.teleport(target);
    dragon.clearVelocity();
    return true;
  }

  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  dragon.clearVelocity();
  dragon.applyImpulse({ x: dir.x * speedPerTick, y: dir.y * speedPerTick, z: dir.z * speedPerTick });
  faceDirection(dragon, dir, 35);
  return false;
}

function faceDirection(dragon: Entity, dir: Vector3, maxPitchDeg: number): void {
  const yawDeg = (Math.atan2(-dir.x, dir.z) * 180) / Math.PI;
  const pitchDeg = clampNum((-Math.asin(clampNum(dir.y, -1, 1)) * 180) / Math.PI, -maxPitchDeg, maxPitchDeg);
  dragon.setRotation({ x: pitchDeg, y: yawDeg });
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// landed — pousado, esperando um piloto ou o fim da estadia
// ---------------------------------------------------------------------------

function beginLanded(): void {
  state.phase = "landed";
  state.tick = 0;
  const { landStayTicksMin, landStayTicksMax } = CONFIG.dragonFlight;
  state.stayTicks = landStayTicksMin + Math.floor(Math.random() * (landStayTicksMax - landStayTicksMin));
  log(`Dragão pousado. Sobrevoa de novo em até ${(state.stayTicks / 20).toFixed(0)}s se ninguém montar.`);
}

function tickLanded(): void {
  const dragon = state.dragon!;
  const rideable = dragon.getComponent("minecraft:rideable");
  const riders = (rideable?.getRiders() ?? []).filter((r): r is Player => r.typeId === "minecraft:player");

  if (riders.length > 0) {
    beginPiloting(riders[0]);
    return;
  }
  if (state.tick >= state.stayTicks) beginTargeting();
}

// ---------------------------------------------------------------------------
// piloted — um jogador pilota de verdade
// ---------------------------------------------------------------------------

function beginPiloting(pilot: Player): void {
  state.phase = "piloted";
  state.pilotId = pilot.id;
  state.tick = 0;
  equipFireballHorn(pilot);
  showTitle(pilot, "§lVOO LIVRE", "Olhe pra onde quer ir • use o Chifre do Dragão pra atacar", 60);
  log(`${pilot.name} assumiu o controle do dragão.`);
}

function tickPiloted(): void {
  const dragon = state.dragon!;
  const cfg = CONFIG.dragonFlight.pilot;
  const rideable = dragon.getComponent("minecraft:rideable");
  const riders = rideable?.getRiders() ?? [];
  const pilot = riders.find((r) => r.id === state.pilotId) as Player | undefined;

  if (!pilot || !pilot.isValid) {
    endPiloting();
    return;
  }

  // Só um piloto por vez: qualquer outro jogador que montou junto é ejetado na hora.
  for (const rider of riders) {
    if (rider.id !== pilot.id) rideable?.ejectRider(rider);
  }

  const dir = pilot.getViewDirection();
  const loc = dragon.location;
  let vy = dir.y;
  if (loc.y >= cfg.maxY && vy > 0) vy = 0;
  if (loc.y <= cfg.minY && vy < 0) vy = 0;

  dragon.clearVelocity();
  dragon.applyImpulse({
    x: dir.x * cfg.speedBlocksPerTick,
    y: vy * cfg.speedBlocksPerTick,
    z: dir.z * cfg.speedBlocksPerTick,
  });
  faceDirection(dragon, dir, cfg.maxPitchDeg);

  if (state.tick % 100 === 0) showActionBar(pilot, "Use o Chifre do Dragão pra atacar");
}

function endPiloting(): void {
  const pilotId = state.pilotId;
  state.pilotId = undefined;
  if (pilotId) restoreOffhand(pilotId);
  // Desce e pousa embaixo de onde estava (mesma lógica de "cruising", alvo = chão local).
  const dragon = state.dragon!;
  const dim = state.dimension!;
  const loc = dragon.location;
  const groundY = findGroundY(dim, loc.x, loc.z) ?? CONFIG.dragonDrop.flightY;
  state.target = { x: loc.x, y: groundY, z: loc.z };
  beginCruising();
}

world.afterEvents.playerLeave.subscribe((ev) => {
  savedOffhand.delete(ev.playerId);
  lastFireTick.delete(ev.playerId);
  if (state.phase === "piloted" && state.pilotId === ev.playerId) endPiloting();
});

// ---------------------------------------------------------------------------
// Chifre do Dragão — item vanilla usado como gatilho do ataque (ver nota no topo do arquivo)
// ---------------------------------------------------------------------------

function equipFireballHorn(pilot: Player): void {
  const eq = pilot.getComponent("minecraft:equippable");
  if (!eq) return;
  savedOffhand.set(pilot.id, eq.getEquipment(EquipmentSlot.Offhand));

  const horn = new ItemStack(CONFIG.dragonFlight.fireball.itemTypeId, 1);
  horn.nameTag = CONFIG.dragonFlight.fireball.itemName;
  horn.setDynamicProperty(FIREBALL_ITEM_FLAG, true);
  eq.setEquipment(EquipmentSlot.Offhand, horn);
}

function restoreOffhand(playerId: string): void {
  const saved = savedOffhand.get(playerId);
  savedOffhand.delete(playerId);
  const player = world.getAllPlayers().find((p) => p.id === playerId);
  if (!player) return; // saiu do jogo: nada a restaurar
  const eq = player.getComponent("minecraft:equippable");
  eq?.setEquipment(EquipmentSlot.Offhand, saved);
}

function handleItemUse(ev: ItemUseAfterEvent): void {
  if (state.phase !== "piloted" || ev.source.id !== state.pilotId) return;
  if (ev.itemStack.getDynamicProperty(FIREBALL_ITEM_FLAG) !== true) return;

  const cfg = CONFIG.dragonFlight.fireball;
  const now = system.currentTick;
  const last = lastFireTick.get(ev.source.id) ?? -Infinity;
  if (now - last < cfg.cooldownTicks) return;
  lastFireTick.set(ev.source.id, now);

  const dragon = state.dragon;
  if (dragon && dragon.isValid) fireDragonFireball(dragon, ev.source);
}

function fireDragonFireball(dragon: Entity, pilot: Player): void {
  const dim = state.dimension ?? dragon.dimension;
  const dir = pilot.getViewDirection();
  const loc = dragon.location;
  const spawnPos = { x: loc.x + dir.x * 2, y: loc.y + 1.5, z: loc.z + dir.z * 2 };
  const speed = CONFIG.dragonFlight.fireball.speed;

  try {
    const fireball = dim.spawnEntity("minecraft:dragon_fireball", spawnPos);
    const projectile = fireball.getComponent("minecraft:projectile");
    const velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    if (projectile) {
      projectile.owner = pilot;
      projectile.shoot(velocity);
    } else {
      // Sem componente de projétil disponível por algum motivo: impulso direto como fallback.
      warn("dragon_fireball sem minecraft:projectile — usando impulso como fallback.");
      fireball.applyImpulse(velocity);
    }
    showActionBar(pilot, "§cFogo!");
  } catch (e) {
    warn("Falha ao disparar dragon_fireball:", e);
  }
}
