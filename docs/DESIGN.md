# Design — decisões fechadas

Registro das decisões da sessão de planejamento. **Não reabrir**; itens "em aberto" estão no fim.

## Disciplina de engenharia
- Nunca fazer busca/cálculo caro sem teto máximo. Preferir perder o efeito a reagir com dado incompleto.
- Remoção em massa de blocos sempre em lotes pequenos, nunca tudo de uma vez.
- Preferir mecanismos nativos (loot table, trocas de aldeão, montaria, câmera, onScreenDisplay) a reimplementar via script.
- **Construção incremental**: cada peça nova entra, é testada em jogo, e só permanece se funcionar
  bem — o que não ficar bom é retirado. Não travar o resto do projeto esperando uma peça ficar
  perfeita de primeira.

## 1. Mapa base (REVISADO — mapa original descartado)
- O mapa "BATTLE ROYALE ISLAND" (Protagnst) foi verificado e **descartado**: só existe pra Java
  Edition, o download é pago via Patreon (sem arquivo direto no site), e a descrição exige ~30
  mods de Forge (armas, Alex's Mobs) pro terreno funcionar direito — conversão pra Bedrock
  deixaria buracos/blocos errados em proporção desconhecida sem abrir o mundo primeiro.
- Também foram avaliados 5 mapas de battle royale já nativos do Bedrock — nenhum serviu: os dois
  melhores (TEF, Minewar) têm licença "todos os direitos reservados" que proíbe modificar/criar
  obra derivada sem autorização (e o projeto literalmente desmorona o terreno deles), além de
  virem com sistemas próprios (lobby, tempestade, água que mata) que brigariam com os nossos.
- **Decisão**: o terreno é gerado pelo **próprio Bedrock** (geração vanilla, sem mapa externo).
  Sem custo, sem risco de licença, sem conversão, tamanho configurável em `CONFIG.map.size`.
- **Arena nova a cada partida**: como a zona desmorona blocos de verdade e os jogadores
  quebram/constroem o mapa inteiro jogando, reaproveitar a mesma área pra uma partida nova não
  funciona (nasceria cheia de buraco/escombro). Em vez de restaurar/resetar terreno (pesado pra
  uma área de milhões de colunas), cada partida usa um **centro novo, nunca usado antes**, dentro
  do mesmo mundo — terreno intocado = sempre limpo de fábrica. O sistema guarda os centros já
  usados (dynamic property do mundo, sobrevive a reinício do servidor).
- A ilha flutuante (limpar tudo abaixo de um Y) e a colagem das estruturas (ver §14) passam a
  rodar automaticamente pra cada arena nova, não mais como preparação manual única.
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
- **Escopo atual de construção (revisado)**: seguindo a disciplina de construção incremental, por
  enquanto só a **casa de encantamento** está sendo desenhada/construída. Vilas e casa de poções
  ficam pra depois, no mesmo ritmo (uma peça de cada vez, testada antes da próxima).
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
- **Tag de revive (revisado)**: usa o Name Tag ORIGINAL do jogo (`minecraft:name_tag`), sem
  customização de item — mas com o **nome do jogador que morreu** escrito nela (nameTag), pra dar
  pra ver de quem é. **Só dropa em modo 2x2/4x4** (solo não tem time pra reviver, não dropa).
  **Só o time de quem morreu pode pegar/interagir** — nenhum outro jogador, nem inimigo nem outro
  time. Recomendação técnica: usar uma entidade customizada que aparenta um Name Tag largado (não
  um item de verdade largado no chão), porque a Script API não garante um jeito confiável de
  restringir pickup vanilla por time; a interação de reviver fica condicionada a checar o time de
  quem interage. **Tem prazo**: se ninguém do time pegar a tempo, ela SOME (não fica até o fim da
  partida) — dá um prazo curto pra alguém correr até lá. Duração exata é placeholder, ajustar
  jogando.
- Reviver morto: pegar a "tag" que caiu e clicar em reviver. Revivido volta pela sequência do dragão (espectador → contagem → cai com a asa), só com a asa, sem armadura, sem itens.
- Token da Imortalidade: muito raro, só em baú, raridade uniforme. Uso único ao ser eliminado: espectador → contagem 60→0 → cai com a asa; sem armadura, resto do inventário restaurado (duplicação intencional).
- Espectador só entre membros vivos do próprio time; câmera nativa travada no alvo.

## 13. Bots (teste)
- 4 bots, mesma equipe, nunca se atacam, só atacam jogador real. Reaproveitar padrão do Genesis (SimulatedPlayer + IA por utilidade).

## 14. Construção do mapa (revisado — ver §1)
- Terreno: gerado pelo próprio Bedrock (não baixado — ver §1), uma arena nova por partida.
- Estruturas repetidas (casa de encantamento, depois vilas/casa de poções) construídas uma vez com
  Bloco de Estrutura e coladas com `world.structureManager.place()` em cada arena nova, ajustando
  a altura pelo chão real do ponto (terreno gerado varia, diferente de mapa desenhado à mão).

## Em aberto
Densidade de loot para 30 jogadores · ícone flutuante no inventário · áudio por proximidade · lobby com matchmaking · ajuste de preços · hostis com fome ativa.
