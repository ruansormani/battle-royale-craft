/**
 * Sistema 1 — Ilha flutuante.
 *
 * Operação ÚNICA, rodada na preparação do mapa (não durante a partida): remove
 * tudo abaixo de `CONFIG.map.floorY`, coluna por coluna, em lotes pequenos por
 * tick — nunca tudo de uma vez — pra não travar o tick do servidor. Depois de
 * concluída, o resultado é permanente; não precisa rodar de novo.
 */
import { Dimension, system, world } from "@minecraft/server";
import { CONFIG } from "../config";
import { log, warn } from "../util/log";

interface RunState {
  columns: { x: number; z: number }[];
  index: number;
  intervalId: number;
}

let running: RunState | undefined;

export function isFloatingIslandRunning(): boolean {
  return running !== undefined;
}

export function startFloatingIsland(): boolean {
  if (running) {
    warn("Preparação da ilha flutuante já em andamento.");
    return false;
  }

  const { centerX, centerZ, size, floorY } = CONFIG.map;
  const { columnSize } = CONFIG.floatingIsland;
  const half = size / 2;
  const minX = Math.floor((centerX - half) / columnSize) * columnSize;
  const maxX = Math.floor((centerX + half) / columnSize) * columnSize;
  const minZ = Math.floor((centerZ - half) / columnSize) * columnSize;
  const maxZ = Math.floor((centerZ + half) / columnSize) * columnSize;

  const columns: { x: number; z: number }[] = [];
  for (let x = minX; x <= maxX; x += columnSize) {
    for (let z = minZ; z <= maxZ; z += columnSize) {
      columns.push({ x, z });
    }
  }

  running = { columns, index: 0, intervalId: 0 };
  running.intervalId = system.runInterval(tick, 1);
  log(`Preparação da ilha flutuante iniciada: ${columns.length} colunas abaixo de Y=${floorY}.`);
  return true;
}

function tick(): void {
  if (!running) return;
  const dim = world.getDimension("overworld");
  const { columnSize, heightSlice, columnsPerTick } = CONFIG.floatingIsland;
  const floorY = CONFIG.map.floorY;
  const bottomY = -64;

  for (let n = 0; n < columnsPerTick && running.index < running.columns.length; n++) {
    const { x, z } = running.columns[running.index];
    clearColumn(dim, x, z, columnSize, bottomY, floorY, heightSlice);
    running.index++;
  }

  if (running.index >= running.columns.length) {
    system.clearRun(running.intervalId);
    log(`Ilha flutuante pronta: tudo abaixo de Y=${floorY} removido.`);
    running = undefined;
  }
}

/** Limpa uma coluna [x, x+size) × [z, z+size) do `bottomY` até logo abaixo de `topY`, em fatias. */
function clearColumn(
  dim: Dimension,
  x: number,
  z: number,
  size: number,
  bottomY: number,
  topY: number,
  heightSlice: number
): void {
  if (topY <= bottomY) return;
  const x2 = x + size - 1;
  const z2 = z + size - 1;
  for (let y = bottomY; y < topY; y += heightSlice) {
    const y2 = Math.min(y + heightSlice - 1, topY - 1);
    try {
      dim.runCommand(`fill ${x} ${y} ${z} ${x2} ${y2} ${z2} air`);
    } catch (e) {
      // Chunk descarregado ou fora dos limites do mundo — segue pra próxima fatia.
      warn(`Falha ao limpar coluna (${x},${z}) Y ${y}-${y2}:`, e);
    }
  }
}
