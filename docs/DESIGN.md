# Design — decisões fechadas

Registro das decisões da sessão de planejamento. **Não reabrir**; itens "em aberto" estão no fim.

## Disciplina de engenharia
- Nunca fazer busca/cálculo caro sem teto máximo. Preferir perder o efeito a reagir com dado incompleto.
- Remoção em massa de blocos sempre em lotes pequenos, nunca tudo de uma vez.
- Preferir mecanismos nativos (loot table, trocas de aldeão, montaria, câmera, onScreenDisplay) a reimplementar via script.

## 1. Mapa base
- "BATTLE ROYALE ISLAND" (Protagnst, Planet Minecraft), ilha 2000x2000, feita pra até 10 jogadores. Só terreno/estruturas; descartar addons de arma de fogo. Só itens nativos.
- "Ilha flutuante": script rodado UMA VEZ na preparação, limpa tudo abaixo de um Y escolhido.
- Ao escalar para 30 jogadores, pode ser preciso aumentar a densidade de baús.

## 2. Hospedagem
- BDS próprio (mesma infra do Genesis), `max-players` no server.properties. 30 jogadores por partida.

## 3. Lobby
- **Teste (revisado)**: precisa de um tempo fixo de espera mesmo — sem isso, como não tem
  jogadores suficientes pra bater um número máximo, a partida nunca começaria sozinha.
  Versão simples: espera `testWaitTicks`, mostra "aguardando jogadores" na tela, e começa a
  queda com quem estiver online (mínimo `testMinPlayers`) quando o tempo acabar OU quando
  bater `testMaxPlayers` antes disso. Sem área fixa fora do mapa, sem placar de verdade ainda
  — isso é da fase 2.
- Fase 2: área fixa fora do mapa, sem item/combate, placar de espera; início por (máximo de jogadores) OU (tempo máximo com mínimo aceitável). Contagem na TELA. Saída durante a contagem só ajusta o placar. Fim de partida volta todos ao lobby.

## 4. Queda inicial — dragão
- Ilhas flutuantes em círculo DESCARTADAS.
- Dragão nasce no início, voa em linha reta, altura fixa, atravessa o mapa. Jogadores começam montados (montaria nativa). Cada um escolhe quando descer; asa abre e plana. Quem não pular é forçado a descer. SEM Queda Lenta.
- Sobrevoo depois de alguns minutos:
  - Sem ninguém montado: sorteia ponto dentro da área que ainda existe (mesmo dado do desmoronamento), voa suave, pousa, repete. Tentativas limitadas; depois usa o centro exato do que sobrou.
  - Pousado: jogador pode montar (base do pescoço, logo depois das asas). Só um piloto por vez.
  - **Montado — pilotagem estilo criativo (revisado)**: via `player.inputInfo` (API real da
    Mojang pra mount steering, não componente nativo declarativo). WASD = anda na direção que
    o piloto olha (olhar pra baixo + andar = mergulhar); Pular/Agachar = sobe/desce, sempre
    independente de pra onde olha; sem nenhum input, o dragão paira no lugar (não cai).
  - **Ataque — dois poderes (revisado)**: Poder 1 "Chifre do Dragão" (mão secundária) =
    ataque normal, `dragon_fireball`, ilimitado, só cooldown curto. Poder 2 "Bolas de Fogo"
    (mão principal) = mesmo `dragon_fireball`, carga limitada (começa em 15), cada uso
    consome 1 carga, cargas recarregam uma de cada vez com o tempo. Os dois via item vanilla
    + `itemUse` (Script API não intercepta o botão de ataque nativo com o jogador montado).
  - Vida reduzida.

## 5. Zona / desmoronamento
- Sem /worldborder nativo: construir via script. O mapa DESMORONA de verdade (remove blocos), aos poucos.
- Centro do anel muda a cada fase, sorteado dentro da área que sobrou.
- Títulos na tela via `onScreenDisplay.setTitle()`: "zona de desmoronamento" e "zona segura". Contagem antes de cada fase.
- Cair no vazio já mata e some com itens (nativo). Construções NÃO protegidas contra mineração por enquanto.

## 6. Colapso de construção de jogador
- Terreno natural intocado. Só blocos colocados por jogador na partida têm colapso completo.
- Andaime como único material de subir: DESCARTADO.
- Rastrear blocos de jogador; checagem de conectividade só quando o bloco quebrado encosta em construção de jogador; flood-fill com teto — se passar do teto, NÃO desmorona.

## 7. Chat, fogo amigo, comunicação
- Chat só para o próprio time (`targets` do evento de chat). Morto ainda escreve para o time. Solo: sem chat.
- Fogo amigo: script rastreia o time e desfaz o dano na hora.
- Áudio por proximidade: NÃO agora (Script API sem microfone). Futuro: app externo (VoiceCraft / Bedrock Voice Chat / VCMC) recebendo posições.
- Acesso rápido: primeiro menu `ActionFormData` ligado a um item; ícone flutuante sobre o inventário é incerto (pesquisar).

## 8. Mobs e fome
- Teste: Pacífico. Depois testar Normal e Difícil e decidir sobre script que remove só hostis.

## 9. Nether
- Isqueiro craftável (pederneira + ferro). Script devolve ao Overworld qualquer jogador que entre no Nether, na hora.

## 10. Tempo e clima
- Dia/noite e clima nativos. Opcional futuro: forçar tempestade por comando.

## 11. Loot, crafting e vilas
- Baús comuns via loot table nativa: armas/armaduras/ferramentas, comida, maçã dourada (comum e encantada), livro encantado, poção. Raros também em baú comum, com % baixo.
- Minério/madeira/mineração sem mudança. Foguete e pérola/olho do Ender no loot comum.
- Arco e besta encantáveis; "flecha especial" = flecha de poção (ex. envenenada).
- Mesa de encantamento com estantes, casa dedicada, alguns pontos fixos.
- Bigorna sem local fixo, mais rara que baú; casa só com bigorna, bigorna+baú, ou item no baú.
- Suporte de poções em casa dedicada; verruga do Nether pré-plantada em areia de almas; pó de blaze e ingredientes em baú próximo.
- Vilas especializadas (poção / arma / armadura) com trocas customizadas do aldeão (behavior pack). Esmeralda como moeda, via loot.
- Preços iniciais: poção de cura 3-4 · flecha envenenada (4-8) 4-5 · peça de ferro encantada 6-8 · espada de diamante 10-12 · peça de diamante 10-14 · maçã dourada 6-8 · maçã encantada 20-25 · conjunto de diamante 40+.

## 12. Morte, revive, Token da Imortalidade
- Toda morte SEMPRE dropa os itens.
- Caído: estado crítico curto (travado, rastejando); aliado perto e parado alguns segundos reanima com pouca vida; senão morre de verdade.
- Reviver morto: pegar a "tag" que caiu e clicar em reviver. Revivido volta pela sequência do dragão (espectador → contagem → cai com a asa), só com a asa, sem armadura, sem itens.
- Token da Imortalidade: muito raro, só em baú, raridade uniforme. Uso único ao ser eliminado: espectador → contagem 60→0 → cai com a asa; sem armadura, resto do inventário restaurado (duplicação intencional).
- Espectador só entre membros vivos do próprio time; câmera nativa travada no alvo.

## 13. Bots (teste)
- 4 bots, mesma equipe, nunca se atacam, só atacam jogador real. Reaproveitar padrão do Genesis (SimulatedPlayer + IA por utilidade).

## 14. Construção do mapa
- Baixar o mapa. Estruturas repetidas construídas uma vez com Bloco de Estrutura e coladas com `world.structureManager.place()`.

## Em aberto
Densidade de loot para 30 jogadores · ícone flutuante no inventário · áudio por proximidade · lobby com matchmaking · ajuste de preços · hostis com fome ativa.
