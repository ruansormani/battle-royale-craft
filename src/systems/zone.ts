/**
 * Sistema 5 — Zona / desmoronamento do mapa.
 *
 * Bedrock não tem /worldborder nativo. Aqui a "zona" é uma área circular que ainda
 * existe; a cada fase ela encolhe: sorteia um novo centro/raio menor DENTRO da área
 * atual (garantindo que o novo círculo fica contido no atual) e remove de verdade os
 * blocos que ficaram de fora, em lotes por tick — nunca tudo de uma vez.
 *
 * Expõe a área restante (`getRemainingArea`, `randomPointInRemaining`,
 * `centerOfRemaining`) pra outros sistemas reaproveitarem (ex.: sobrevoo do dragão
 * depois da queda inicial, §4).
 */
import { Dimension, system, world } from "@minecraft/server";
import { CONFIG } from "../config";
import { log, warn } from "../util/log";
import { showTitle } from "../util/screen";

type Phase = "idle" | "warning" | "collapsing" | "paused" | "finished";

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

interface Column {
  x: number;
  z: number;
}

interface ZoneState {
  phase: Phase;
  /** Área que ainda existe de verdade (fonte da verdade pra outros sistemas). */
  current: Circle;
  /** Alvo da fase em andamento (definido no início do aviso, antes de desmoronar). */
  target?: Circle;
  queue: Column[];
  queueIndex: number;
  tick: number;
  intervalId?: number;
  dimension?: Dimension;
}

const state: ZoneState = {
  phase: "idle",
  current: { x: CONFIG.map.centerX, z: CONFIG.map.centerZ, radius: CONFIG.zone.initialRadius },
  queue: [],
  queueIndex: 0,
  tick: 0,
};

// ---------------------------------------------------------------------------
// API pública — leitura da área restante (usada por outros sistemas)
// ---------------------------------------------------------------------------

export function isZoneActive(): boolean {
  return state.phase !== "idle" && state.phase !== "finished";
}

/** Centro/raio da área do mapa que ainda existe. */
export function getRemainingArea(): Circle {
  return { ...state.current };
}

/** Sorteia um ponto dentro da área que ainda existe. */
export function randomPointInRemaining(): { x: number; z: number } {
  const { x, z, radius } = state.current;
  if (radius <= 0) return { x, z };
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: x + Math.cos(angle) * r, z: z + Math.sin(angle) * r };
}

/** Centro exato do que sobrou — destino garantido quando o sorteio falhar demais vezes. */
export function centerOfRemaining(): { x: number; z: number } {
  return { x: state.current.x, z: state.current.z };
}

// ---------------------------------------------------------------------------
// API pública — controle
// ---------------------------------------------------------------------------

export function startZoneCollapse(): boolean {
  if (state.phase !== "idle" && state.phase !== "finished") {
    warn("Desmoronamento já em andamento.");
    return false;
  }
  const { centerX, centerZ } = CONFIG.map;
  const { initialRadius } = CONFIG.zone;
  state.current = { x: centerX, z: centerZ, radius: initialRadius };
  state.dimension = world.getDimension("overworld");
  beginWarning();
  log(`Desmoronamento iniciado. Raio inicial ${initialRadius}.`);
  return true;
}

export function stopZoneCollapse(reason = "stop"): void {
  if (state.intervalId !== undefined) system.clearRun(state.intervalId);
  state.intervalId = undefined;
  state.phase = "idle";
  state.queue = [];
  state.queueIndex = 0;
  log(`Desmoronamento encerrado (${reason}).`);
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

function pickNextTarget(): Circle {
  const { shrinkFactor, minRadius } = CONFIG.zone;
  const cur = state.current;
  const nextRadius = Math.max(minRadius, cur.radius * shrinkFactor);
  if (nextRadius >= cur.radius) {
    // Já está no raio mínimo: não encolhe mais, só marca a fase como concluída.
    return { ...cur };
  }
  const maxOffset = cur.radius - nextRadius; // garante que o novo círculo fica contido no atual
  const angle = Math.random() * Math.PI * 2;
  const offset = Math.sqrt(Math.random()) * maxOffset;
  return {
    x: cur.x + Math.cos(angle) * offset,
    z: cur.z + Math.sin(angle) * offset,
    radius: nextRadius,
  };
}

function beginWarning(): void {
  state.target = pickNextTarget();
  state.phase = "warning";
  state.tick = 0;
  if (state.intervalId !== undefined) system.clearRun(state.intervalId);
  state.intervalId = system.runInterval(tick, 1);
}

/** Monta a fila de colunas que estão na área atual mas ficarão de fora do alvo. */
function buildRingQueue(): void {
  const { columnSize } = CONFIG.zone;
  const cur = state.current;
  const target = state.target!;
  const minX = Math.floor((cur.x - cur.radius) / columnSize) * columnSize;
  const maxX = Math.floor((cur.x + cur.radius) / columnSize) * columnSize;
  const minZ = Math.floor((cur.z - cur.radius) / columnSize) * columnSize;
  const maxZ = Math.floor((cur.z + cur.radius) / columnSize) * columnSize;

  const queue: Column[] = [];
  for (let x = minX; x <= maxX; x += columnSize) {
    for (let z = minZ; z <= maxZ; z += columnSize) {
      const cx = x + columnSize / 2;
      const cz = z + columnSize / 2;
      if (Math.hypot(cx - cur.x, cz - cur.z) > cur.radius) continue; // já fora da área atual
      if (Math.hypot(cx - target.x, cz - target.z) <= target.radius) continue; // vai continuar existindo
      queue.push({ x, z });
    }
  }
  state.queue = queue;
  state.queueIndex = 0;
}

function tick(): void {
  state.tick++;
  try {
    if (state.phase === "warning") tickWarning();
    else if (state.phase === "collapsing") tickCollapsing();
    else if (state.phase === "paused") tickPaused();
  } catch (e) {
    warn("Erro no tick do desmoronamento:", e);
    stopZoneCollapse("erro");
  }
}

function tickWarning(): void {
  const { warnTicks } = CONFIG.zone;
  const remaining = warnTicks - state.tick;
  if (remaining > 0) {
    if (remaining % 20 === 0) {
      const secs = remaining / 20;
      for (const p of world.getAllPlayers()) {
        showTitle(p, "§ezona segura", `Encolhendo em ${secs}s`, 24);
      }
    }
    return;
  }

  buildRingQueue();
  if (state.queue.length === 0) {
    // Alvo igual à área atual (já no raio mínimo): nada a desmoronar, termina aqui.
    state.phase = "finished";
    if (state.intervalId !== undefined) system.clearRun(state.intervalId);
    state.intervalId = undefined;
    log("Desmoronamento concluído — raio mínimo atingido.");
    return;
  }

  state.phase = "collapsing";
  state.tick = 0;
  for (const p of world.getAllPlayers()) {
    showTitle(p, "§czona de desmoronamento", "Corra para a área segura", 40);
  }
  log(`Fase de desmoronamento: ${state.queue.length} colunas na fila.`);
}

function tickCollapsing(): void {
  const dim = state.dimension!;
  const { columnSize, heightSlice, collapseTicks, minColumnsPerTick, maxColumnsPerTick } = CONFIG.zone;
  const remainingTicks = Math.max(1, collapseTicks - state.tick);
  const remainingColumns = state.queue.length - state.queueIndex;
  const perTick = Math.min(
    maxColumnsPerTick,
    Math.max(minColumnsPerTick, Math.ceil(remainingColumns / remainingTicks))
  );

  for (let n = 0; n < perTick && state.queueIndex < state.queue.length; n++) {
    const { x, z } = state.queue[state.queueIndex];
    clearColumn(dim, x, z, columnSize, heightSlice);
    state.queueIndex++;
  }

  if (state.queueIndex < state.queue.length) return;

  state.current = state.target!;
  state.target = undefined;
  log(`Fase concluída. Raio atual: ${state.current.radius.toFixed(0)}.`);

  if (state.current.radius <= CONFIG.zone.minRadius) {
    state.phase = "finished";
    if (state.intervalId !== undefined) system.clearRun(state.intervalId);
    state.intervalId = undefined;
    for (const p of world.getAllPlayers()) showTitle(p, "§czona final", undefined, 40);
    log("Desmoronamento concluído — raio mínimo atingido.");
    return;
  }

  state.phase = "paused";
  state.tick = 0;
}

function tickPaused(): void {
  if (state.tick >= CONFIG.zone.pauseTicks) beginWarning();
}

/** Esvazia uma coluna do topo do mundo até `CONFIG.map.floorY`, em fatias. */
function clearColumn(dim: Dimension, x: number, z: number, size: number, heightSlice: number): void {
  const { floorY, topY } = CONFIG.map;
  const x2 = x + size - 1;
  const z2 = z + size - 1;
  for (let y = floorY; y < topY; y += heightSlice) {
    const y2 = Math.min(y + heightSlice - 1, topY - 1);
    try {
      dim.runCommand(`fill ${x} ${y} ${z} ${x2} ${y2} ${z2} air`);
    } catch (e) {
      warn(`Falha ao desmoronar coluna (${x},${z}) Y ${y}-${y2}:`, e);
    }
  }
}
