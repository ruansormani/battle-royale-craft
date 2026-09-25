# Bedrock Battle Royale

Addon de Battle Royale para **Minecraft Bedrock** (behavior pack + resource pack + Script API em TypeScript).
Pensado para rodar num **Bedrock Dedicated Server (BDS)** próprio, com 30 jogadores por partida.

Decisões de design fechadas: [`docs/DESIGN.md`](docs/DESIGN.md). Andamento: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Estrutura

```
behavior_pack/        manifest, entidades (br:dragon), scripts/main.js (gerado)
resource_pack/        manifest, client entity do dragão
src/                  código TypeScript (@minecraft/server, @minecraft/server-ui)
  main.ts             ponto de entrada + comandos de teste (/scriptevent)
  config.ts           todos os números ajustáveis (mapa, dragão, ...)
  systems/            um arquivo por sistema, testável isolado
tools/package.mjs     gera dist/battle-royale.mcaddon
```

## Build

Requer Node 18+.

```bash
npm install
npm run build      # compila src/ → behavior_pack/scripts/main.js
npm run package    # build + gera dist/battle-royale.mcaddon
npm run watch      # recompila a cada alteração
npm run typecheck
```

## Instalar no Bedrock Dedicated Server

1. Rode `npm run build`.
2. Copie as pastas para o servidor:
   - `behavior_pack/` → `<BDS>/behavior_packs/battle_royale_bp/`
   - `resource_pack/` → `<BDS>/resource_packs/battle_royale_rp/`
3. Ative os packs no mundo, em `<BDS>/worlds/<nome-do-mundo>/`:

   `world_behavior_packs.json`
   ```json
   [{ "pack_id": "fb5f39e5-7886-40ba-8620-75cc3f387193", "version": [0, 1, 0] }]
   ```
   `world_resource_packs.json`
   ```json
   [{ "pack_id": "44c9fa12-ede1-4e04-ab17-c073cdd548f0", "version": [0, 1, 0] }]
   ```
4. No `server.properties`:
   ```properties
   max-players=30
   texturepack-required=true
   difficulty=peaceful        # fase de teste (seção 8 do design)
   ```
5. Reinicie o servidor. No console deve aparecer `[BR] Addon Battle Royale carregado.`

> O mundo precisa ter o mapa **BATTLE ROYALE ISLAND** (Protagnst) importado. Depois de importar,
> meça o centro da ilha e atualize `CONFIG.map.centerX/centerZ` em `src/config.ts`.

## Testar

Como operador (no jogo ou no console do BDS):

| Comando | O que faz |
|---|---|
| `/scriptevent br:lobby_start` | Espera jogadores (fase de teste) e inicia a queda sozinho quando o tempo acabar |
| `/scriptevent br:lobby_stop` | Cancela a espera do lobby |
| `/scriptevent br:drop` | Inicia a queda do dragão com todos os jogadores online (direto, sem lobby) |
| `/scriptevent br:drop_stop` | Encerra a queda e ejeta quem estiver montado |
| `/scriptevent br:make_floating` | **Preparação do mapa, roda uma vez só.** Remove tudo abaixo de `CONFIG.map.floorY` |
| `/scriptevent br:zone_start` | Inicia o desmoronamento por fases (zona segura → zona de desmoronamento) |
| `/scriptevent br:zone_stop` | Encerra o desmoronamento (não desfaz blocos já removidos) |
| `/scriptevent br:flight_spawn` | Cria um dragão de teste direto na fase de pouso (pula o descanso inicial) |
| `/scriptevent br:flight_stop` | Encerra o sobrevoo e ejeta quem estiver montado |

Na queda: agache pra pular do dragão e, no ar, aperte pular pra abrir a asa.
Quem não pular até o fim da rota é ejetado à força.

**Lobby (fase de teste)**: `br:lobby_start` mostra "aguardando jogadores" na tela pra quem
estiver online, atualizando a cada segundo, e depois de `CONFIG.lobby.testWaitTicks` chama
`br:drop` sozinho com quem estiver no servidor (ou antes, se bater
`CONFIG.lobby.testMaxPlayers`). Sem isso, como a fase de teste não tem jogadores suficientes
pra bater um número máximo de verdade, a partida nunca começaria sozinha. Versão de produção
(área fixa fora do mapa, placar) é outro item do roadmap.

**Nether**: entrar no Nether por qualquer meio devolve o jogador ao Overworld na hora (sempre ativo).

**Ilha flutuante**: rode `br:make_floating` uma única vez, depois de importar e medir o mapa
(ajuste `CONFIG.map.floorY` antes). É uma limpeza definitiva, em lotes de colunas por tick —
pode demorar alguns minutos pro mapa inteiro (2000×2000), sem travar o servidor.

**Desmoronamento**: começa **sozinho** assim que a queda do dragão termina (não precisa de
comando manual — `br:zone_start` continua disponível pra testar isolado). Sorteia um novo
centro/raio menor a cada fase (sempre contido na área anterior), avisa "zona segura" com
contagem, depois remove os blocos que ficaram de fora em lotes ("zona de desmoronamento"),
pausa, e repete até o raio mínimo (`CONFIG.zone.minRadius`). A área restante fica disponível
para outros sistemas via `getRemainingArea()` / `randomPointInRemaining()` em
`src/systems/zone.ts` — é o dado que o sobrevoo do dragão reaproveita pra escolher pontos de
pouso (ver abaixo).

**Sobrevoo pós-queda**: depois que a queda termina (`br:drop_stop` ou fim da rota), o mesmo
dragão é assumido pelo sistema `dragonFlight.ts` automaticamente:

1. Fica parado por alguns minutos (`CONFIG.dragonFlight.restAfterDropTicks`).
2. Sorteia um ponto dentro da área que ainda existe (reaproveita `zone.ts`), acha o chão por
   baixo dele (um candidato por tick, nunca busca sem limite — depois de
   `maxLandingAttemptsPerCycle` tentativas usa o centro exato garantido), voa até lá e pousa.
3. Pousado, fica esperando: o primeiro jogador que montar vira o piloto. Só um piloto por vez —
   qualquer outro que tentar montar junto é ejetado na hora (evita alguém cair sem controle se
   o piloto desmontar no meio do voo). Se ninguém montar depois de um tempo, decola de novo
   pro próximo ponto.
4. Montou = **câmera trava em terceira pessoa** (`minecraft:third_person`, preset nativo do
   F5, de cima e um pouco atrás), não importa a preferência que o jogador já tinha.
   Desmontou = volta pra preferência de primeira/terceira pessoa de antes (não força
   primeira pessoa — só devolve o controle da câmera, `camera.clear()`).
5. Pilotando — **voo estilo criativo**: anda (WASD) na direção que o piloto está olhando
   (olhar pra baixo + andar pra frente = mergulhar); Pular sobe e Agachar desce, **sempre**
   independente de pra onde o piloto olha; sem nenhum input, o dragão simplesmente para no
   ar (paira, não cai). Usa `player.inputInfo` — API real da Mojang pra dar controle de
   verdade a um jogador montado (não é gambiarra).
6. Dois poderes de ataque, um em cada mão — mas o ataque em si é do **dragão**: sai da BOCA
   dele (offset a partir do corpo, na direção que ele está olhando —
   `CONFIG.dragonFlight.mouth`), não da mão nem da mira do piloto. O item na mão é só o
   gatilho:
   - **Poder 1 — "Chifre do Dragão"** (mão secundária, `minecraft:blaze_rod` renomeado):
     ataque normal do dragão, ilimitado, só com um cooldown curto entre disparos.
   - **Poder 2 — "Bolas de Fogo"** (mão principal, `minecraft:fire_charge` renomeado): carga
     limitada (`CONFIG.dragonFlight.fireballCharge.maxCharges`, começa em 15). Cada uso
     consome 1 carga; as cargas recarregam sozinhas com o tempo, uma de cada vez
     (`regenTicks` por carga) — não o estoque inteiro de uma vez. O contador atual
     (`N/15`) aparece na action bar.
   Os itens anteriores das duas mãos são salvos e devolvidos ao desmontar.
7. Desmontou no meio do ar? O dragão desce e pousa embaixo de onde estava, e o ciclo continua.

> **Por que item vanilla pro ataque, e não o botão de ataque nativo?** A Script API não
> expõe um jeito de interceptar o clique de ataque enquanto o jogador está montado numa
> entidade passiva (`InputButton` só tem `Jump`/`Sneak`). E não há como gerar uma textura
> customizada neste projeto (sem assets de imagem), então os gatilhos são itens vanilla
> reaproveitados, sem tocar no resto do inventário do jogador. Isso também significa que
> **não dá pra garantir o "círculo de recarga" nativo em volta do ícone do item** pro Poder 2
> — sem um item PRÓPRIO com `minecraft:cooldown` declarado (exigiria item novo + textura +
> arquivos de resource pack, fora do escopo agora), o selo nativo é só melhor esforço; o
> contador confiável é o texto `N/15` na action bar. Ver o comentário no topo de
> `src/systems/dragonFlight.ts`.

## Pontos a validar em jogo (marcados no código)

- `minecraft:rideable` com 30 assentos: se o motor recusar algum assento, o jogador cai no
  modo *fallback* (segue o dragão por teleporte e pula ao agachar). O log do servidor avisa.
- Movimento do dragão por velocidade (`applyImpulse`) mantém os montados; se desviar da rota,
  corrige com teleporte.
- O visual usa a geometria/textura nativas do Ender Dragon (`geometry.dragon`), por enquanto
  sem animação de asa.
- Pilotagem livre e ataque do sobrevoo (`dragonFlight.ts`) são implementados via script (ver
  seção acima) — testar sensação de voo e o disparo do `dragon_fireball` em jogo antes de
  fechar como definitivo.
- O sentido de `player.inputInfo.getMovementVector()` (o que é "+1" no eixo frente/trás e no
  de lado) não está 100% documentado — se o dragão andar ao contrário do esperado, inverte em
  `CONFIG.dragonFlight.pilot.invertForwardInput`/`invertStrafeInput`.
- `CONFIG.dragonFlight.mouth.forwardOffset`/`upOffset` (de onde as bolas de fogo saem, em
  relação ao corpo do dragão) são placeholders — ajustar olhando o modelo real em jogo até a
  bola de fogo sair visualmente da boca, não do meio do corpo.
- `minecraft:third_person` via `pilot.camera.setCamera()` trava a câmera ao montar — confirmar
  em jogo se segura mesmo contra o jogador tentando apertar F5, e se `camera.clear()` devolve
  a preferência certa ao desmontar.
- `pilot.startItemCooldown()` pro selo de recarga do Poder 2 é melhor esforço (ver nota acima)
  — confirmar em jogo se aparece ou não; o contador na action bar é a fonte confiável de
  qualquer forma.

## Áudio por proximidade (não implementado, de propósito)

A Script API não acessa o microfone. O caminho futuro é um app externo (VoiceCraft,
Bedrock Voice Chat ou VCMC) recebendo a posição dos jogadores. Ver `docs/DESIGN.md` §7.
