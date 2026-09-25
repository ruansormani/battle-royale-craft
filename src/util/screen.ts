import { Player } from "@minecraft/server";

/** Título grande e centralizado (onScreenDisplay, nunca chat). */
export function showTitle(player: Player, title: string, subtitle?: string, stayTicks = 40): void {
  try {
    player.onScreenDisplay.setTitle(title, {
      subtitle,
      fadeInDuration: 5,
      stayDuration: stayTicks,
      fadeOutDuration: 10,
    });
  } catch {
    /* jogador saiu no meio */
  }
}

export function showActionBar(player: Player, text: string): void {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    /* ignore */
  }
}
