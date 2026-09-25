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
 *   piloted    → um jogador pilota de verdade, voo estilo criativo (ver nota de controles),
 *                com dois poderes de ataque (ver nota de ataque). O assento nativo tem
 *                30 vagas (reaproveitado da entidade da queda), mas só UM piloto por vez é
 *                permitido aqui: qualquer outro jogador que tentar montar junto é ejetado na
 *                hora — o risco de o piloto desmontar no meio do voo e derrubar um passageiro
 *                "de carona" sem controle nenhum não vale a pena.
 *
 * ## Nota técnica — controles de voo (estilo criativo)
 *
 * Usa `player.inputInfo` (API dedicada da Mojang pra isso — não é gambiarra):
 *   - `getMovementVector()` dá o WASD (y = frente/trás, x = lado) — vira empuxo horizontal
 *     na direção que o piloto está olhando (olhar pra baixo + andar pra frente = mergulhar).
 *   - `getButtonState(Jump/Sneak)` sobe/desce, SEMPRE independente de pra onde o piloto olha.
 *   - Sem nenhum input, o dragão simplesmente para: como a entidade não tem gravidade
 *     (`has_gravity: false`), zerar a velocidade já é suficiente pra pairar no lugar.
 * O sentido exato de `getMovementVector()` (o que conta como "+1") não está 100%
 * documentado — se o dragão andar ao contrário do esperado num teste real, inverte em
 * `CONFIG.dragonFlight.pilot.invertForwardInput`/`invertStrafeInput`, não a lógica.
 *
 * ## Nota técnica — por que o ataque usa itens em vez do botão de ataque
 *
 * A Script API não expõe um jeito de interceptar o botão de ataque nativo enquanto o
 * jogador está montado numa entidade passiva (`InputButton` só tem `Jump`/`Sneak`, não tem
 * ataque). Por isso os dois poderes são gatilhados por item (`itemUse`), marcados por
 * dynamic property, dados nas duas mãos só durante o voo (salva/restaura o que já estava
 * equipado, sem mexer no resto do inventário):
 *   - Poder 1 — "Chifre do Dragão" (mão secundária, `minecraft:blaze_rod` renomeado):
 *     poder normal do dragão, ilimitado, só com um cooldown curto entre disparos.
 *   - Poder 2 — "Bolas de Fogo" (mão principal, `minecraft:fire_charge` renomeado): carga
 *     limitada (`maxCharges`, começa em 15), cada uso consome 1 carga, e as cargas
 *     recarregam sozinhas com o tempo (uma de cada vez, não tudo de uma vez).
 * Os dois itens são vanilla — não há como gerar textura customizada neste projeto (sem
 * assets de imagem). Por isso também não há como garantir o "circulozinho de recarga"
 * nativo em volta do ícone: sem um item PRÓPRIO com `minecraft:cooldown` declarado (exigiria
 * um item novo, textura e arquivos de resource pack — fora do escopo agora), o selo nativo
 * é só melhor esforço; o contador confiável é o texto na action bar (`N/15`).
 */
import {
  ButtonState,
  Dimension,
  Entity,
  EquipmentSlot,
  InputButton,
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

const POWER1_FLAG = "br:dragonHornPower1";
const POWER2_FLAG = "br:dragonHornPower2";

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

interface ChargeState {
  count: number;
  /** `system.currentTick` em que a próxima carga fica pronta (só relevante se count < max). */
  nextRegenTick: number;
}

/** Item da mão secundária (Poder 1) salvo por jogador, pra devolver ao desmontar. */
const savedOffhand = new Map<string, ItemStack | undefined>();
/** Item que estava no slot 0 da hotbar (Poder 2) antes de montar, pra devolver ao desmontar. */
const savedSlot0Item = new Map<string, ItemStack | undefined>();
/** Slot da hotbar que o jogador tinha selecionado antes de montar, pra devolver ao desmontar. */
const savedSelectedSlot = new Map<string, number>();
/** Último `system.currentTick` em que cada jogador disparou o Poder 1 (cooldown simples). */
const lastFireTick = new Map<string, number>();
/** Cargas do Poder 2 por jogador. */
const fireballCharges = new Map<string, ChargeState>();

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
    restoreAbilities(state.pilotId);
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
  equipAbilities(pilot);
  showTitle(
    pilot,
    "§lVOO LIVRE",
    "Ande pra controlar • pule/agache pra subir/descer • pare pra pairar",
    60
  );
  showChargeStatus(pilot);
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

  const view = pilot.getViewDirection();
  faceDirection(dragon, view, cfg.maxPitchDeg);

  // Frente/trás e de lado: sempre relativos a pra onde o piloto está olhando (olhar pra
  // baixo + andar pra frente = mergulhar). Subir/descer: SEMPRE vertical, independente do
  // olhar — pular sobe, agachar desce, parado paira.
  const move = pilot.inputInfo.getMovementVector();
  const forwardInput = clampNum(move.y, -1, 1) * (cfg.invertForwardInput ? -1 : 1);
  const strafeInput = clampNum(move.x, -1, 1) * (cfg.invertStrafeInput ? -1 : 1);
  const yawRad = Math.atan2(-view.x, view.z);
  const right = { x: Math.cos(yawRad), z: Math.sin(yawRad) };

  let vx = view.x * forwardInput + right.x * strafeInput;
  let vz = view.z * forwardInput + right.z * strafeInput;
  const horizontalLen = Math.hypot(vx, vz);
  if (horizontalLen > 1) {
    vx /= horizontalLen;
    vz /= horizontalLen;
  }

  let vy = view.y * forwardInput;
  const jumping = pilot.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  const sneaking = pilot.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
  if (jumping && !sneaking) vy += 1;
  else if (sneaking && !jumping) vy -= 1;
  vy = clampNum(vy, -1, 1);

  const loc = dragon.location;
  if (loc.y >= cfg.maxY && vy > 0) vy = 0;
  if (loc.y <= cfg.minY && vy < 0) vy = 0;

  dragon.clearVelocity();
  if (vx !== 0 || vy !== 0 || vz !== 0) {
    dragon.applyImpulse({
      x: vx * cfg.speedBlocksPerTick,
      y: vy * cfg.verticalSpeedBlocksPerTick,
      z: vz * cfg.speedBlocksPerTick,
    });
  }
  // Sem impulso: sem gravidade (has_gravity: false), o dragão só para no ar — paira sozinho.

  if (state.tick % 100 === 0) showChargeStatus(pilot);
}

function endPiloting(): void {
  const pilotId = state.pilotId;
  state.pilotId = undefined;
  if (pilotId) restoreAbilities(pilotId);
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
  savedSlot0Item.delete(ev.playerId);
  savedSelectedSlot.delete(ev.playerId);
  lastFireTick.delete(ev.playerId);
  fireballCharges.delete(ev.playerId);
  if (state.phase === "piloted" && state.pilotId === ev.playerId) endPiloting();
});

// ---------------------------------------------------------------------------
// Itens de ataque — Poder 1 (Chifre) e Poder 2 (Bolas de Fogo) — ver nota no topo do arquivo
// ---------------------------------------------------------------------------

function equipAbilities(pilot: Player): void {
  const eq = pilot.getComponent("minecraft:equippable");
  if (!eq) return;

  // Poder 1 — mão secundária, sempre acessível independente do slot da hotbar selecionado.
  savedOffhand.set(pilot.id, eq.getEquipment(EquipmentSlot.Offhand));
  const horn = new ItemStack(CONFIG.dragonFlight.fireball.itemTypeId, 1);
  horn.nameTag = CONFIG.dragonFlight.fireball.itemName;
  horn.setDynamicProperty(POWER1_FLAG, true);
  eq.setEquipment(EquipmentSlot.Offhand, horn);

  // Poder 2 — mão principal = slot 0 da hotbar, forçado a ficar selecionado ao montar.
  // "Mainhand" é só um alias pro slot ativo, então guarda o slot original ANTES de trocar,
  // e guarda o item que já estava no slot 0 DEPOIS de trocar (senão salva/restaura o item
  // errado — ver comentário em restoreAbilities).
  savedSelectedSlot.set(pilot.id, pilot.selectedSlotIndex);
  pilot.selectedSlotIndex = 0;
  savedSlot0Item.set(pilot.id, eq.getEquipment(EquipmentSlot.Mainhand));
  const fireCharge = new ItemStack(CONFIG.dragonFlight.fireballCharge.itemTypeId, 1);
  fireCharge.nameTag = CONFIG.dragonFlight.fireballCharge.itemName;
  fireCharge.setDynamicProperty(POWER2_FLAG, true);
  eq.setEquipment(EquipmentSlot.Mainhand, fireCharge);

  fireballCharges.set(pilot.id, {
    count: CONFIG.dragonFlight.fireballCharge.maxCharges,
    nextRegenTick: system.currentTick,
  });
}

function restoreAbilities(playerId: string): void {
  const savedOff = savedOffhand.get(playerId);
  const savedSlot0 = savedSlot0Item.get(playerId);
  const savedSlot = savedSelectedSlot.get(playerId);
  savedOffhand.delete(playerId);
  savedSlot0Item.delete(playerId);
  savedSelectedSlot.delete(playerId);
  fireballCharges.delete(playerId);
  lastFireTick.delete(playerId);

  const player = world.getAllPlayers().find((p) => p.id === playerId);
  if (!player) return; // saiu do jogo: nada a restaurar
  const eq = player.getComponent("minecraft:equippable");
  if (!eq) return;

  eq.setEquipment(EquipmentSlot.Offhand, savedOff);
  // Garante que "Mainhand" aponta pro slot 0 antes de devolver o item — senão o item do
  // slot 0 vai parar no slot que o jogador tiver selecionado NAQUELE momento (pode ter
  // trocado de slot durante o voo).
  player.selectedSlotIndex = 0;
  eq.setEquipment(EquipmentSlot.Mainhand, savedSlot0);
  if (savedSlot !== undefined) player.selectedSlotIndex = savedSlot;
}

function showChargeStatus(pilot: Player): void {
  const c = getCharges(pilot.id);
  const max = CONFIG.dragonFlight.fireballCharge.maxCharges;
  showActionBar(pilot, `§cChifre§r: sopro do dragão   §6Bolas de Fogo§r: ${c.count}/${max}`);
}

// ---------------------------------------------------------------------------
// Poder 2 — cargas com recarga individual (nunca busca/loop sem teto: no máximo
// `maxCharges` iterações por chamada, mesmo depois de muito tempo parado)
// ---------------------------------------------------------------------------

function getCharges(playerId: string): ChargeState {
  const cfg = CONFIG.dragonFlight.fireballCharge;
  let c = fireballCharges.get(playerId);
  if (!c) {
    c = { count: cfg.maxCharges, nextRegenTick: system.currentTick };
    fireballCharges.set(playerId, c);
  }
  while (c.count < cfg.maxCharges && system.currentTick >= c.nextRegenTick) {
    c.count++;
    c.nextRegenTick += cfg.regenTicks;
  }
  return c;
}

/** Consome uma carga se houver; devolve o estado atualizado ou `undefined` se não tinha. */
function consumeCharge(playerId: string): ChargeState | undefined {
  const cfg = CONFIG.dragonFlight.fireballCharge;
  const c = getCharges(playerId);
  if (c.count <= 0) return undefined;
  const wasFull = c.count === cfg.maxCharges;
  c.count--;
  if (wasFull) c.nextRegenTick = system.currentTick + cfg.regenTicks;
  return c;
}

// ---------------------------------------------------------------------------
// Disparo
// ---------------------------------------------------------------------------

function handleItemUse(ev: ItemUseAfterEvent): void {
  if (state.phase !== "piloted" || ev.source.id !== state.pilotId) return;
  const dragon = state.dragon;
  if (!dragon || !dragon.isValid) return;

  if (ev.itemStack.getDynamicProperty(POWER1_FLAG) === true) {
    firePower1(dragon, ev.source);
  } else if (ev.itemStack.getDynamicProperty(POWER2_FLAG) === true) {
    firePower2(dragon, ev.source);
  }
}

function firePower1(dragon: Entity, pilot: Player): void {
  const cfg = CONFIG.dragonFlight.fireball;
  const now = system.currentTick;
  const last = lastFireTick.get(pilot.id) ?? -Infinity;
  if (now - last < cfg.cooldownTicks) return;
  lastFireTick.set(pilot.id, now);
  fireDragonFireball(dragon, pilot, cfg.speed);
}

function firePower2(dragon: Entity, pilot: Player): void {
  const cfg = CONFIG.dragonFlight.fireballCharge;
  const c = consumeCharge(pilot.id);
  if (!c) {
    showActionBar(pilot, "§7Sem cargas de Bolas de Fogo — recarregando...");
    return;
  }
  fireDragonFireball(dragon, pilot, cfg.speed);
  showChargeStatus(pilot);
  if (c.count === 0) {
    // Melhor esforço: tenta o selo de recarga nativo. Sem um item PRÓPRIO com
    // minecraft:cooldown declarado (item vanilla reaproveitado), pode não aparecer — o
    // contador na action bar acima é a fonte confiável.
    try {
      pilot.startItemCooldown("br:fireball_charge", Math.max(1, c.nextRegenTick - system.currentTick));
    } catch {
      /* melhor esforço, ignora falha */
    }
  }
}

function fireDragonFireball(dragon: Entity, pilot: Player, speed: number): void {
  const dim = state.dimension ?? dragon.dimension;
  const dir = pilot.getViewDirection();
  const loc = dragon.location;
  const spawnPos = { x: loc.x + dir.x * 2, y: loc.y + 1.5, z: loc.z + dir.z * 2 };

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
  } catch (e) {
    warn("Falha ao disparar dragon_fireball:", e);
  }
}
