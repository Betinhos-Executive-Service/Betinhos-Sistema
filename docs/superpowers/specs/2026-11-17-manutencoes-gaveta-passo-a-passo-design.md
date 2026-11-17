# Gaveta da manutenção passo a passo (design)

Data: 17/11/2026. Decisões do Renan na conversa de 17/11/2026, depois de ver a gaveta das manutenções v2 no DEV. Referência visual: a gaveta de multas (`MultaPassoAPasso`, branch `t3/revisar-processo-multas`).

## Problema

A gaveta única da manutenção (plano 2, `frota/components/GavetaManutencao.tsx`) é uma ficha: o selo, uma fila de botões soltos (Reagendar, Cancelar, Concluir), o pedido, o encaixe, a classificação e o histórico. Ela não diz o que falta fazer nem quem faz. O Renan quer o mesmo modelo da multa: cada etapa mostra só o próximo passo, sem para onde fugir.

## Processo (o que não muda)

O motorista pede pelo App. O gestor de frota agenda (dia ou semana). O gestor de operação programa: motorista e saída, na Geral ou na gaveta. O motorista leva o carro, paga e conclui pelo App. O financeiro confere a despesa na tela de despesas.

Status e valores continuam os do plano 1: Solicitado 0, Agendado 202410001, Programado 202410005, Realizado 202410002, Reprovado 100000002, Cancelado 100000001. Sem schema novo nem migration. Sem tarefa no Planner por enquanto.

## Decisões

- **D1. Três etapas: Agendar · Programar · Realizar.** A etapa sai do status: Solicitado → Agendar, Agendado → Programar, Programado → Realizar e Realizado → fim. Reprovado e Cancelado são fins negativos.
- **D2. Um passo por vez.** O corpo mostra só o passo pendente da etapa atual, com os campos obrigatórios dele e um botão. Os passos já feitos aparecem em leitura, em lista ("Agendada em 17/11 para a semana de 23 a 29/11 · Média"). As exceções ficam no menu "⋯" do passo:
  - **Agendar:** Reprovar (motivo obrigatório), Cancelar e "Já foi feita: concluir".
  - **Programar:** Reagendar, Cancelar e "Já foi feita: concluir".
  - **Realizar:** Concluir por ele, Reagendar e Cancelar.
  - **Fim (Realizado):** Corrigir classificação.

  "Já foi feita: concluir" (P1, 17/11/2026) cobre a manutenção que o motorista fez sem passar pelo ciclo: abre o mesmo `ConcluirManutencaoForm` do "Concluir por ele". "Abrir formulário" continua no rodapé em todas as etapas.
- **D3. Agendar pede grau e quando.** O grau (Alta, Média ou Baixa) vem preenchido com o do pedido e pode ser corrigido. "Quando" é Num dia ou Numa semana (segunda a domingo), mais a data. O comentário ao motorista é opcional. Grava pela `cr40f_ManutencaoAgendar`, que ganha o campo opcional `grau` no `RequestJson`. Sem o campo, o grau não muda, então o App e as chamadas antigas não mudam.
- **D4. Programar pede motorista e saída.**
  - **Gravação:** grava na linha da Geral da manutenção (a `geralId` do espelho, buscada por `cr40f_om`) com o mesmo `programarPatch` do Disparar. O espelho do plano 1 leva a manutenção a Programado.
  - **Fora da janela:** se a saída ficar fora da janela, avisa e grava, como na Geral (plano 3, D7).
  - **Geral:** quem está na Geral continua programando por lá.
- **D5. Realizar é do motorista.** O passo mostra "Aguardando o motorista concluir no App", com o motorista e a saída. "Concluir por ele" (no "⋯") abre o formulário de conclusão que já existe (`ConcluirManutencaoForm`), com `origem: "shell"`. A classificação dos serviços acontece só na conclusão.
- **D6. Reagendar volta para Programar.** A janela muda, e motorista e saída são limpos. É o comportamento atual da `cr40f_ManutencaoAgendar` sobre uma manutenção Agendada ou Programada.
- **D7. O topo destaca placa, problema e prazo.**
  - **Título:** "placa · problema" é o título da gaveta (o guia não tem título próprio, para não repetir); no guia, embaixo, o grau e quem pediu (ou o motorista e a saída, na etapa Realizar).
  - **À direita, conforme a etapa:**
    - antes de agendar: "Esperando há N dias", contados da solicitação;
    - depois de agendar: a janela ("23 a 29/11");
    - janela vencida e não realizada: "Atrasada desde <fim da janela>", em vermelho (`atrasada()` de `frota/domain/janela.ts`);
    - realizada: o valor.
- **D8. O fim mostra o resumo e a despesa.** Na Realizada aparecem em leitura:
  - serviços por categoria;
  - km, data, valor, pagamento, estabelecimento e quem realizou (sem a cidade: o detalhe da manutenção não a lê);
  - nota e fotos;
  - o estado da despesa ligada (pendente de anexo, em análise pela IA ou conferida), com link que abre a despesa.

  Nenhuma ação, a não ser "Corrigir classificação" no "⋯".
- **D9. Fim negativo.** Na Reprovada e na Cancelada, a barra fica cinza na etapa onde parou e um quadro mostra "Reprovada: <motivo>" (ou "Cancelada: <motivo>"), sem data: não há coluna com a data da reprovação ou do cancelamento. Nenhuma ação, a não ser "Abrir formulário".
- **D10. Quem não é dono do passo vê, mas não age.** Os comandos do servidor já recusam quem não tem privilégio. A gaveta mostra a mensagem do servidor, sem esconder o passo.

## Arquitetura (abordagem A, escolhida pelo Renan)

- **`apps/shell/src/pages/frota/domain/manutencaoEtapas.ts`** (puro, sem React):
  - `avaliar(m, hoje)` → `{ etapa, passo, prazo, atrasada, feitos, fimNegativo }`, onde:
    - `etapa` é `'agendar' | 'programar' | 'realizar' | 'realizada' | 'reprovada' | 'cancelada'`;
    - `passo` é `'Agendar' | 'Programar' | 'AguardarConclusao' | null`;
    - `prazo` é `{ tipo: 'esperando' | 'janela' | 'atrasada' | 'valor', texto }`;
    - `feitos` são as linhas de leitura.
  - `validarPasso(passo, dados, m, hoje)` → texto do que falta, ou `null`.
  - `extras(etapa)` → itens do "⋯".

  Mesmo molde do `multaEtapas` da multa.
- **`apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx`:** topo, barra, passo, feitos e "⋯". Recebe a manutenção, o `source` e `onChanged`. Os formulários de Reprovar, Cancelar e Concluir são reaproveitados de `GavetaManutencao.tsx` e `ConcluirManutencaoForm.tsx`.
- **`GavetaManutencao.tsx`:** fica com a casca (carregar, `StaleError`, rodapé "Abrir formulário") e troca o corpo pelo `ManutencaoPassoAPasso`. Saem a seção solta de ações, a "Classificação" fora da conclusão e o histórico em tabela: o histórico vira a lista de feitos.
- **`frota/data`:** `programarManutencao(manutencaoId, motoristaId, saida)` lê a linha da Geral pelo `cr40f_om` e aplica o `programarPatch` de `geral/domain/commands.ts`. Esse patch passa a ser exportado de um lugar comum aos dois, sem copiar a regra. `agendarManutencao` ganha o `grau` opcional.
- **Plugin (`Cr40f.Frota.Plugin`):** `AgendarPedido.Grau` (int?, opcional). Com valor, grava `cr40f_graudamanutencao` junto do encaixe e valida contra o choice. Teste no `AgendarTests`.
- **Fora do escopo:**
  - o App: o passo a passo no App é o plano 4, e é lá que a regra das etapas pode ir para o servidor (abordagem B);
  - a virada dos registros antigos (plano 5);
  - a tarefa no Planner.

## Erros

- **`StaleError`** (a manutenção mudou por trás): a gaveta recarrega e mantém o que foi digitado quando o passo ainda vale, como hoje.
- **Programar sem linha da Geral** (manutenção antiga, anterior ao espelho): o passo diz "Esta manutenção não tem linha na Geral; reagende para criar" e oferece Reagendar.
- **Falha de privilégio:** mostra a mensagem do servidor no passo, sem fechar a gaveta.

## Testes

- **`manutencaoEtapas.test.ts`:**
  - cada status vira a etapa e o passo certos;
  - prazo: esperando, janela, atrasada e valor;
  - feitos em ordem;
  - `validarPasso` de Agendar (grau e data obrigatórios; dia ou semana) e de Programar (motorista e saída; fora da janela não bloqueia);
  - os extras por etapa;
  - Reprovada e Cancelada.
- **`ManutencaoPassoAPasso.test.tsx`:**
  - um passo por vez;
  - o botão desabilitado até completar o obrigatório;
  - "⋯" com os extras certos;
  - Agendar chama a API com `grau`;
  - Programar chama `programarManutencao`;
  - Concluir por ele abre o formulário com `origem: "shell"`;
  - o fim negativo sem ações.
- **`GavetaManutencao.test.tsx`:** os testes atuais ajustados à casca nova (abrir, `StaleError`, Abrir formulário).
- **C#:** `AgendarTests` com e sem `grau`; grau inválido recusado.
- **Prints no mock:** as quatro etapas, o fim negativo e o celular a 390 px. No DEV, sobre os registros "TESTE mock" criados em 17/11/2026.
