# Roadmap

Ordem de implementação. Cada sistema fica em `src/systems/` e é testável isolado.

- [x] Estrutura do projeto (manifests, build TS, README, empacotamento)
- [x] §4 Queda inicial — dragão em linha reta + asa (`dragonDrop.ts`) — **validar em jogo**
- [x] §9 Bloqueio do Nether (`netherBlock.ts`)
- [x] §1 Script único de "ilha flutuante" (`floatingIsland.ts`) — **validar em jogo**
- [x] **Mapa final escolhido e importado**: Ixellior (McMeddon), 3000x3000, Bedrock nativo —
      `CONFIG.map.centerX/centerZ` já atualizados com o centro medido em jogo (X=1552, Z=1562).
      Falta medir mais pontos (vale/montanha) pra calibrar `CONFIG.map.floorY` direito.
- [x] §5 Desmoronamento do mapa (`zone.ts`) — **validar em jogo**
- [x] §4 Sobrevoo pós-queda + pilotagem estilo criativo + Poder 1/Poder 2 de ataque
      (`dragonFlight.ts`) — **validar em jogo**
- [x] §3 Lobby, versão simples de teste (`lobby.ts`) — **validar em jogo**
- [x] Cadeia automática de partida: lobby → queda → (fim da queda) dragão autônomo E zona
      começam sozinhos, sem comando manual — **validar em jogo**
- [ ] **§1 (pendência real)** Reset de terreno entre partidas: o mapa Ixellior é único e fixo, e
      a zona desmorona + jogadores destroem o mapa jogando. Ainda não decidido: rotação de
      sub-áreas dentro dos 3000x3000 (esgota depois de algumas partidas) ou backup/restore do
      mundo preparado — ver docs/DESIGN.md §1
- [ ] §11 (parcial) Casa de encantamento: construir com Bloco de Estrutura, colar por arena com
      `structureManager.place()` ajustando pelo chão real do ponto — só essa estrutura por
      enquanto (construção incremental, testar antes de partir pra vila/casa de poções)
- [ ] §7 Times: chat por `targets`, fogo amigo desfeito por script, menu `ActionFormData` por item
- [ ] §12 Caído → revive; tag de reviver = Name Tag vanilla com o nome do jogador morto, só
      dropa em 2x2/4x4, só o time pega (entidade customizada, não item de verdade — Script API
      não garante bloquear pickup vanilla por time), some sozinha depois de um tempo se ninguém
      pegar; Token da Imortalidade; espectador do próprio time — depende do §7 (times) existir
- [ ] §11 (restante) Loot tables, crafting do isqueiro, trocas de aldeão por vila
- [ ] §6 Colapso de construção de jogador (flood-fill com teto)
- [ ] §13 Bots de teste (4, padrão Genesis)
- [ ] §3 Lobby fase 2 (produção)

## Em aberto
- Densidade de loot ao escalar de 10 para 30 jogadores
- Ícone flutuante sobre o inventário (pesquisar viabilidade no resource pack)
- Áudio por proximidade via app companheiro
- Lobby com matchmaking (fase 2)
- Ajuste fino dos preços das vilas
- Mobs hostis com fome ativa (Pacífico → Normal → Difícil)
