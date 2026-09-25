/**
 * Sistema 3 — Lobby (fase de teste).
 *
 * Versão BEM simples, só pra destravar o teste: sem área fixa fora do mapa, sem placar de
 * verdade. Espera os jogadores por um tempo fixo (`CONFIG.lobby.testWaitTicks`) e inicia a
 * queda do dragão com quem estiver online, mesmo sem bater o número final de jogadores —
 * na fase de teste dificilmente vai ter gente suficiente pra isso. A versão de produção
 * (área fixa, placar visível, início por máximo de jogadores OU tempo com mínimo aceitável)
 * fica pra depois — ver docs/DESIGN.md §3.
 */
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "../config";
import { startDragonDrop } from "./dragonDrop";
import { log, warn } from "../util/log";
import { showTitle } from "../util/screen";

interface LobbyState {
  active: boolean;
  tick: number;
  intervalId?: number;
}

const state: LobbyState = { active: false, tick: 0 };

export function isLobbyWaiting(): boolean {
  return state.active;
}

export function startLobbyWait(): boolean {
  if (state.active) {
    warn("Lobby já está esperando jogadores.");
    return false;
  }
  state.active = true;
  state.tick = 0;
  state.intervalId = system.runInterval(tick, 20); // atualiza a cada segundo
  log("Lobby: esperando jogadores (fase de teste).");
  tick(); // mostra o primeiro aviso na hora, sem esperar 1s
  return true;
}

export function stopLobbyWait(reason = "comando"): void {
  if (state.intervalId !== undefined) system.clearRun(state.intervalId);
  state.intervalId = undefined;
  state.active = false;
  log(`Lobby: espera encerrada (${reason}).`);
}

function tick(): void {
  if (!state.active) return;

  const cfg = CONFIG.lobby;
  const players = world.getAllPlayers();
  const remaining = Math.max(0, cfg.testWaitTicks - state.tick);
  const secsLeft = Math.ceil(remaining / 20);

  for (const p of players) {
    showTitle(p, "§eAguardando jogadores", `${players.length} online • início em ${secsLeft}s`, 24);
  }

  if (players.length >= cfg.testMaxPlayers || remaining <= 0) {
    launch(players);
    return;
  }
  state.tick += 20;
}

function launch(players: Player[]): void {
  if (players.length < CONFIG.lobby.testMinPlayers) {
    warn(
      `Lobby: tempo acabou com só ${players.length} jogador(es) online ` +
        `(mínimo ${CONFIG.lobby.testMinPlayers}) — cancelado, ninguém pra começar.`
    );
    stopLobbyWait("sem-jogadores");
    return;
  }
  stopLobbyWait("inicio");
  startDragonDrop(players);
}
