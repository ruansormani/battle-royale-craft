/**
 * Ponto de entrada do addon Battle Royale.
 * Cada sistema é iniciado separadamente e pode ser testado isolado via /scriptevent.
 *
 * Comandos de teste (operador, no console do BDS ou no jogo):
 *   /scriptevent br:drop            → inicia a queda do dragão com todos os jogadores online
 *   /scriptevent br:drop_stop       → encerra a queda (ejeta quem estiver montado)
 *   /scriptevent br:make_floating   → preparação do mapa (§1), roda UMA VEZ, remove tudo
 *                                      abaixo de CONFIG.map.floorY
 *   /scriptevent br:zone_start      → inicia o desmoronamento por fases (§5)
 *   /scriptevent br:zone_stop       → encerra o desmoronamento (não desfaz o que já sumiu)
 */
import { system, world } from "@minecraft/server";
import { startDragonDrop, stopDragonDrop } from "./systems/dragonDrop";
import { startFloatingIsland } from "./systems/floatingIsland";
import { startNetherBlock } from "./systems/netherBlock";
import { startZoneCollapse, stopZoneCollapse } from "./systems/zone";
import { log } from "./util/log";

world.afterEvents.worldLoad.subscribe(() => {
  startNetherBlock();
  log("Addon Battle Royale carregado.");
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  switch (ev.id) {
    case "br:drop":
      startDragonDrop(world.getAllPlayers());
      break;
    case "br:drop_stop":
      stopDragonDrop("comando");
      break;
    case "br:make_floating":
      startFloatingIsland();
      break;
    case "br:zone_start":
      startZoneCollapse();
      break;
    case "br:zone_stop":
      stopZoneCollapse("comando");
      break;
  }
});
