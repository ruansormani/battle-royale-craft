# Roadmap

Ordem de implementação. Cada sistema fica em `src/systems/` e é testável isolado.

- [x] Estrutura do projeto (manifests, build TS, README, empacotamento)
- [x] §4 Queda inicial — dragão em linha reta + asa (`dragonDrop.ts`) — **validar em jogo**
- [x] §9 Bloqueio do Nether (`netherBlock.ts`)
- [x] §1 Script único de "ilha flutuante" (`floatingIsland.ts`) — **validar em jogo**
- [x] §5 Desmoronamento do mapa (`zone.ts`) — **validar em jogo**
- [x] §4 Sobrevoo pós-queda + pilotagem estilo criativo + Poder 1/Poder 2 de ataque
      (`dragonFlight.ts`) — **validar em jogo**
- [x] §3 Lobby, versão simples de teste (`lobby.ts`) — **validar em jogo**
- [x] Cadeia automática de partida: lobby → queda → (fim da queda) dragão autônomo E zona
      começam sozinhos, sem comando manual — **validar em jogo**
- [ ] §7 Times: chat por `targets`, fogo amigo desfeito por script, menu `ActionFormData` por item
- [ ] §12 Caído → revive, tag de reviver, Token da Imortalidade, espectador do próprio time
- [ ] §11 Loot tables, crafting do isqueiro, trocas de aldeão por vila, casas via `structureManager.place()`
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
