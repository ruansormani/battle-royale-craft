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
| `/scriptevent br:drop` | Inicia a queda do dragão com todos os jogadores online |
| `/scriptevent br:drop_stop` | Encerra a queda e ejeta quem estiver montado |
| `/scriptevent br:make_floating` | **Preparação do mapa, roda uma vez só.** Remove tudo abaixo de `CONFIG.map.floorY` |
| `/scriptevent br:zone_start` | Inicia o desmoronamento por fases (zona segura → zona de desmoronamento) |
| `/scriptevent br:zone_stop` | Encerra o desmoronamento (não desfaz blocos já removidos) |

Na queda: agache pra pular do dragão e, no ar, aperte pular pra abrir a asa.
Quem não pular até o fim da rota é ejetado à força.

**Nether**: entrar no Nether por qualquer meio devolve o jogador ao Overworld na hora (sempre ativo).

**Ilha flutuante**: rode `br:make_floating` uma única vez, depois de importar e medir o mapa
(ajuste `CONFIG.map.floorY` antes). É uma limpeza definitiva, em lotes de colunas por tick —
pode demorar alguns minutos pro mapa inteiro (2000×2000), sem travar o servidor.

**Desmoronamento**: `br:zone_start` sorteia um novo centro/raio menor a cada fase (sempre
contido na área anterior), avisa "zona segura" com contagem, depois remove os blocos que
ficaram de fora em lotes ("zona de desmoronamento"), pausa, e repete até o raio mínimo
(`CONFIG.zone.minRadius`). A área restante fica disponível para outros sistemas via
`getRemainingArea()` / `randomPointInRemaining()` em `src/systems/zone.ts` — é o dado que o
sobrevoo do dragão (próximo item do roadmap) vai reaproveitar.

## Pontos a validar em jogo (marcados no código)

- `minecraft:rideable` com 30 assentos: se o motor recusar algum assento, o jogador cai no
  modo *fallback* (segue o dragão por teleporte e pula ao agachar). O log do servidor avisa.
- Movimento do dragão por velocidade (`applyImpulse`) mantém os montados; se desviar da rota,
  corrige com teleporte.
- O visual usa a geometria/textura nativas do Ender Dragon (`geometry.dragon`), por enquanto
  sem animação de asa.

## Áudio por proximidade (não implementado, de propósito)

A Script API não acessa o microfone. O caminho futuro é um app externo (VoiceCraft,
Bedrock Voice Chat ou VCMC) recebendo a posição dos jogadores. Ver `docs/DESIGN.md` §7.
