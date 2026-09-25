/**
 * Sistema 9 — Bloqueio do Nether.
 * Bedrock não tem opção no server.properties para desligar o Nether, então:
 * no instante em que qualquer jogador aparece no Nether (portal, comando, o que for),
 * ele volta para o Overworld na última posição segura conhecida.
 */
import { Player, system, Vector3, world } from "@minecraft/server";
import { CONFIG } from "../config";
import { log } from "../util/log";
import { showTitle } from "../util/screen";

/** Posição no Overworld de ~1 s atrás (a mais recente pode ser dentro do portal). */
const lastSafe = new Map<string, Vector3>();
const current = new Map<string, Vector3>();

function fallbackPoint(): Vector3 {
  const { centerX, centerZ } = CONFIG.map;
  return { x: centerX + 0.5, y: 200, z: centerZ + 0.5 };
}

function sendBack(p: Player): void {
  const overworld = world.getDimension("overworld");
  const dest = lastSafe.get(p.id) ?? current.get(p.id) ?? fallbackPoint();
  p.teleport(dest, { dimension: overworld });
  showTitle(p, "§cNether bloqueado", "Você voltou para a ilha", 40);
  log(`${p.name} entrou no Nether e foi devolvido ao Overworld.`);
}

export function startNetherBlock(): void {
  let ticks = 0;
  system.runInterval(() => {
    ticks += CONFIG.netherBlock.checkIntervalTicks;
    const sample = ticks % 20 === 0;
    for (const p of world.getAllPlayers()) {
      const dimId = p.dimension.id;
      if (dimId === "minecraft:nether") {
        sendBack(p);
      } else if (dimId === "minecraft:overworld" && sample) {
        const prev = current.get(p.id);
        if (prev) lastSafe.set(p.id, prev);
        const l = p.location;
        current.set(p.id, { x: l.x, y: l.y, z: l.z });
      }
    }
  }, CONFIG.netherBlock.checkIntervalTicks);

  world.afterEvents.playerLeave.subscribe((ev) => {
    lastSafe.delete(ev.playerId);
    current.delete(ev.playerId);
  });
}
