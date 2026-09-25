/**
 * Ponto de entrada do addon Battle Royale.
 * Cada sistema é iniciado separadamente e pode ser testado isolado via /scriptevent.
 *
 * Comandos de teste (operador, no console do BDS ou no jogo):
 *   /scriptevent br:lobby_start     → espera jogadores (fase de teste, §3) e inicia a queda
 *                                      sozinho quando o tempo acabar — fluxo recomendado
 *   /scriptevent br:lobby_stop      → cancela a espera do lobby
 *   /scriptevent br:drop            → inicia a queda do dragão com todos os jogadores online
 *                                      direto, sem passar pelo lobby (teste rápido)
 *   /scriptevent br:drop_stop       → encerra a queda (ejeta quem estiver montado)
 *   /scriptevent br:make_floating   → preparação do mapa (§1), roda UMA VEZ, remove tudo
 *                                      abaixo de CONFIG.map.floorY
 *   /scriptevent br:zone_start      → inicia o desmoronamento por fases (§5)
 *   /scriptevent br:zone_stop       → encerra o desmoronamento (não desfaz o que já sumiu)
 *   /scriptevent br:flight_spawn    → cria um dragão de teste já na fase de pouso (§4,
 *                                      sobrevoo — pula o descanso inicial, só pra testar)
 *   /scriptevent br:flight_stop     → encerra o sobrevoo e ejeta quem estiver montado
 */
import { system, world } from "@minecraft/server";
import { startDragonDrop, stopDragonDrop } from "./systems/dragonDrop";
import { spawnFlightTestDragon, startDragonFlightSystem, stopDragonFlight } from "./systems/dragonFlight";
import { startFloatingIsland } from "./systems/floatingIsland";
import { startLobbyWait, stopLobbyWait } from "./systems/lobby";
import { startNetherBlock } from "./systems/netherBlock";
import { startZoneCollapse, stopZoneCollapse } from "./systems/zone";
import { log } from "./util/log";

world.afterEvents.worldLoad.subscribe(() => {
  startNetherBlock();
  startDragonFlightSystem();
  log("Addon Battle Royale carregado.");
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  switch (ev.id) {
    case "br:lobby_start":
      startLobbyWait();
      break;
    case "br:lobby_stop":
      stopLobbyWait("comando");
      break;
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
    case "br:flight_spawn":
      spawnFlightTestDragon();
      break;
    case "br:flight_stop":
      stopDragonFlight("comando");
      break;
  }
});
