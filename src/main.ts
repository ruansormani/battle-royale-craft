/**
 * Ponto de entrada do addon Battle Royale.
 * Cada sistema é iniciado separadamente e pode ser testado isolado via /scriptevent.
 *
 * Comandos de teste (operador, no console do BDS ou no jogo):
 *   /scriptevent br:drop        → inicia a queda do dragão com todos os jogadores online
 *   /scriptevent br:drop_stop   → encerra a queda (ejeta quem estiver montado)
 */
import { system, world } from "@minecraft/server";
import { startDragonDrop, stopDragonDrop } from "./systems/dragonDrop";
import { startNetherBlock } from "./systems/netherBlock";
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
  }
});
