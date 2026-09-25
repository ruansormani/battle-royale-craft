/**
 * Sistema 4 — Queda inicial pelo dragão.
 *
 * Fluxo:
 *  1. BOARDING: jogadores ficam presos no ponto inicial da rota (carrega os chunks),
 *     recebem a asa (elytra) no peito e veem uma contagem na tela.
 *  2. FLYING: o dragão nasce, todos montam (montaria nativa, `minecraft:rideable`),
 *     e ele voa em linha reta, altura fixa, atravessando a ilha inteira.
 *     Cada jogador desce quando quiser (agachar = desmontar, comportamento nativo).
 *     Depois é só apertar pular no ar pra abrir a asa. Sem Queda Lenta.
 *  3. FINISHED: no fim da rota, quem ainda estiver montado é ejetado à força.
 *
 * O sobrevoo posterior (pouso aleatório, pilotagem, fireball) é outro sistema
 * e vai reaproveitar a mesma entidade `br:dragon`.
 */
import {
  Dimension,
  Entity,
  EquipmentSlot,
  ItemStack,
  Player,
  system,
  Vector3,
  world,
} from "@minecraft/server";
import { CONFIG } from "../config";
import { log, warn } from "../util/log";
import { showActionBar, showTitle } from "../util/screen";

type Phase = "idle" | "boarding" | "flying";

interface Route {
  start: Vector3;
  end: Vector3;
  dir: Vector3; // unitário, só X/Z
  length: number;
  yawDeg: number;
}

interface DropState {
  phase: Phase;
  route?: Route;
  dimension?: Dimension;
  dragon?: Entity;
  tick: number;
  /** Jogadores ainda "no dragão" (montados ou no fallback). */
  aboard: Set<string>;
  /** Jogadores que não couberam num assento nativo e seguem por teleporte. */
  fallbackRiders: Set<string>;
  intervalId?: number;
}

const state: DropState = { phase: "idle", tick: 0, aboard: new Set(), fallbackRiders: new Set() };

/** Callback opcional pro próximo sistema (sobrevoo) assumir o dragão. */
let onFinished: ((dragon: Entity | undefined) => void) | undefined;

export function onDragonDropFinished(cb: (dragon: Entity | undefined) => void): void {
  onFinished = cb;
}

export function isDropActive(): boolean {
  return state.phase !== "idle";
}

// ---------------------------------------------------------------------------
// Rota
// ---------------------------------------------------------------------------

function buildRandomRoute(): Route {
  const { centerX, centerZ, size } = CONFIG.map;
  const { flightY, routeMargin } = CONFIG.dragonDrop;
  const angle = Math.random() * Math.PI * 2;
  const dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
  // Metade da diagonal garante que a linha atravessa a ilha quadrada inteira.
  const half = (size / 2) * Math.SQRT2 + routeMargin;
  const start = { x: centerX - dir.x * half, y: flightY, z: centerZ - dir.z * half };
  const end = { x: centerX + dir.x * half, y: flightY, z: centerZ + dir.z * half };
  // Yaw do Minecraft: 0 = +Z (sul), 90 = -X (oeste).
  const yawDeg = (Math.atan2(-dir.x, dir.z) * 180) / Math.PI;
  return { start, end, dir, length: half * 2, yawDeg };
}

function pointAt(route: Route, dist: number): Vector3 {
  return {
    x: route.start.x + route.dir.x * dist,
    y: route.start.y,
    z: route.start.z + route.dir.z * dist,
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function startDragonDrop(players: Player[]): boolean {
  if (state.phase !== "idle") {
    warn("Queda do dragão já em andamento.");
    return false;
  }
  if (players.length === 0) {
    warn("Nenhum jogador para a queda.");
    return false;
  }

  const route = buildRandomRoute();
  const dimension = world.getDimension("overworld");

  state.phase = "boarding";
  state.route = route;
  state.dimension = dimension;
  state.tick = 0;
  state.aboard = new Set(players.map((p) => p.id));
  state.fallbackRiders.clear();
  state.dragon = undefined;

  for (const p of players) {
    equipWings(p);
    p.teleport(route.start, { dimension, rotation: { x: 0, y: route.yawDeg } });
  }

  state.intervalId = system.runInterval(tick, 1);
  log(`Queda iniciada: ${players.length} jogadores, rota ${route.length.toFixed(0)} blocos, yaw ${route.yawDeg.toFixed(0)}°`);
  return true;
}

export function stopDragonDrop(reason = "stop"): void {
  if (state.intervalId !== undefined) system.clearRun(state.intervalId);
  state.intervalId = undefined;

  const dragon = state.dragon;
  if (dragon?.isValid) {
    try {
      dragon.getComponent("minecraft:rideable")?.ejectRiders();
    } catch {
      /* ignore */
    }
  }

  log(`Queda encerrada (${reason}).`);
  state.phase = "idle";
  state.aboard.clear();
  state.fallbackRiders.clear();
  state.dragon = undefined;

  if (onFinished) {
    onFinished(dragon?.isValid ? dragon : undefined);
  } else if (dragon?.isValid) {
    // Sem sistema de sobrevoo registrado ainda: remove o dragão.
    dragon.remove();
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function tick(): void {
  state.tick++;
  try {
    if (state.phase === "boarding") tickBoarding();
    else if (state.phase === "flying") tickFlying();
  } catch (e) {
    warn("Erro no tick da queda:", e);
    stopDragonDrop("erro");
  }
}

function aboardPlayers(): Player[] {
  const out: Player[] = [];
  for (const p of world.getAllPlayers()) if (state.aboard.has(p.id)) out.push(p);
  return out;
}

function tickBoarding(): void {
  const route = state.route!;
  const dim = state.dimension!;
  const total = CONFIG.dragonDrop.boardingTicks;
  const remaining = total - state.tick;

  // Segura todo mundo no ponto inicial (não cai enquanto o chunk carrega).
  for (const p of aboardPlayers()) {
    p.teleport(route.start, { dimension: dim, rotation: { x: 0, y: route.yawDeg } });
    if (remaining % 20 === 0 && remaining > 0) {
      showTitle(p, `§l${remaining / 20}`, "Prepare-se para montar no dragão", 20);
    }
  }

  if (remaining > 0) return;

  // Nasce o dragão e monta todo mundo.
  const dragon = dim.spawnEntity(CONFIG.dragonDrop.entityId, route.start);
  dragon.setRotation({ x: 0, y: route.yawDeg });
  state.dragon = dragon;

  const rideable = dragon.getComponent("minecraft:rideable");
  for (const p of aboardPlayers()) {
    const seated = rideable ? rideable.addRider(p) : false;
    if (!seated) state.fallbackRiders.add(p.id);
    showTitle(p, "§lVOANDO", "Agache para pular • Pule no ar para abrir a asa", 60);
  }
  if (state.fallbackRiders.size > 0) {
    warn(`${state.fallbackRiders.size} jogador(es) sem assento nativo — usando teleporte de acompanhamento.`);
  }

  state.phase = "flying";
  state.tick = 0;
}

function tickFlying(): void {
  const route = state.route!;
  const dragon = state.dragon;
  const cfg = CONFIG.dragonDrop;

  if (!dragon || !dragon.isValid) {
    warn("Dragão ficou inválido (chunk descarregado?). Forçando descida.");
    stopDragonDrop("dragao-invalido");
    return;
  }

  const dist = state.tick * cfg.speedBlocksPerTick;
  if (dist >= route.length) {
    for (const p of aboardPlayers()) showTitle(p, "§lPULE!", "Fim da rota do dragão", 40);
    stopDragonDrop("fim-da-rota");
    return;
  }

  // Movimento: velocidade constante (mantém os montados), com correção por teleporte se desviar.
  const target = pointAt(route, dist + cfg.speedBlocksPerTick);
  const loc = dragon.location;
  const dx = target.x - loc.x;
  const dy = target.y - loc.y;
  const dz = target.z - loc.z;
  const drift = Math.hypot(dx, dy, dz);
  if (drift > cfg.maxDriftBlocks + cfg.speedBlocksPerTick) {
    dragon.teleport(pointAt(route, dist), { rotation: { x: 0, y: route.yawDeg } });
  } else {
    dragon.clearVelocity();
    dragon.applyImpulse({ x: dx, y: dy, z: dz });
    dragon.setRotation({ x: 0, y: route.yawDeg });
  }

  // Quem desmontou (agachou) = pulou. Fallback: agachar libera.
  for (const p of aboardPlayers()) {
    if (state.fallbackRiders.has(p.id)) {
      if (p.isSneaking) {
        releasePlayer(p);
        continue;
      }
      const d = dragon.location;
      p.teleport({ x: d.x, y: d.y + cfg.fallbackRideOffsetY, z: d.z }, { keepVelocity: false });
    } else {
      const ridingOn = p.getComponent("minecraft:riding")?.entityRidingOn;
      if (!ridingOn || ridingOn.id !== dragon.id) {
        releasePlayer(p);
        continue;
      }
    }
    if (state.tick % 20 === 0) {
      const left = Math.ceil((route.length - dist) / cfg.speedBlocksPerTick / 20);
      showActionBar(p, `Agache para pular • descida forçada em ${left}s`);
    }
  }
}

function releasePlayer(p: Player): void {
  state.aboard.delete(p.id);
  state.fallbackRiders.delete(p.id);
  showActionBar(p, "Pule no ar para abrir a asa!");
}

// ---------------------------------------------------------------------------
// Asa
// ---------------------------------------------------------------------------

function equipWings(p: Player): void {
  const eq = p.getComponent("minecraft:equippable");
  if (!eq) return;
  eq.setEquipment(EquipmentSlot.Chest, new ItemStack("minecraft:elytra", 1));
}

// Jogador que sai no meio da queda: só remove do conjunto.
world.afterEvents.playerLeave.subscribe((ev) => {
  state.aboard.delete(ev.playerId);
  state.fallbackRiders.delete(ev.playerId);
});
