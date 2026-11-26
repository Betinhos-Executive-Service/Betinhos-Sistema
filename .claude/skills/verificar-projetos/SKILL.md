---
name: verificar-projetos
description: "Verifica o quadro Projetos do Planner (#/planner?view=projects, tabelas cr40f_projeto, cr40f_projetoetapa e cr40f_projetoatualizacao): cartões por situação com etapa 1 escondida (PRJ-n.1), detalhe em drawer, regra do Pronto (Concluída) com prova, situação só do Renan, briefing com áudio e transcrição, papel Projetos, migration e tela no mock e no DEV. Use após mudar apps/shell/src/pages/planner/projetos/**, planner/views/ProjectsView.tsx, planner/components/{ProjectDetailDrawer,NewProjectDrawer}.tsx, planner/domain/projectsBoard.ts ou a migration 20261123-0845-projetos.ps1."
---
# Verificar Projetos

Complementa `verificar-shell` (typecheck, testes e ambiente do shell); aqui só o que é do módulo.

## Cobre
- Código: `apps/shell/src/pages/planner/projetos/**` (painel, formulário, dados, regras), `planner/views/ProjectsView.tsx` (quadro), `planner/components/ProjectDetailDrawer.tsx` (detalhe) e `NewProjectDrawer.tsx` (Nova ideia), `planner/domain/projectsBoard.ts` e `packages/deploy/migrations/20261123-0845-projetos.ps1`. A rota `#/projetos` do Back-End saiu em 25/11/2026 (`menu.test.ts` confere que não volta).
- Seção "Projetos (cr40f_projeto)" do `CLAUDE.md` da raiz (nomes lógicos, choices, papel, regras dos agentes, como o Renan é identificado).

## Roteiro local (sem Dataverse)
1. `cd apps/shell && pnpm typecheck && pnpm exec vitest run --maxWorkers=2 src/pages/planner/projetos src/pages/planner/views/ProjectsView.test.tsx src/pages/planner/domain/projectsBoard.test.ts src/nav` → tudo verde.
   - `domain.test.ts`: Pronto só com prova da etapa, gestor não muda a situação, etapa única (menor número, `PRJ-n.1`), atrasada, situação ("Pronto · N provas", "No PROD"), formulário do projeto (diff do projeto e da etapa), anexos com áudio, autor pelo perfil, payloads; e o `domain/painel.ts`: fase da trilha, ação pendente, parada (mais de 7 dias), "Precisa de mim" (só Renan), "o que falta", contagens e linhas dos chips, busca sem acento, motivo do Pronto travado.
   - `views/ProjectsView.test.tsx`: cartão abre o detalhe (`projeto=<id>` na URL, sem link para `#/projetos`); Pronto travado sem prova e liberado com prova; gestor com Pronto travado ("só o Renan") e Situação desabilitada; transcrição e "Transcrição pendente"; "Como usar"; gravar áudio (microfone simulado e negado); anexo acima de 5 MB recusado; "Descartar alterações?" ao fechar o detalhe (X) e o formulário; editar grava `cr40f_instrucoes` e o nome da etapa.
2. `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` → sem erro (migration nova, não editada depois de publicada).
3. `pnpm dev` (porta 36472, mock; se ocupada, `npx vite --port <outra> --strictPort` em `apps/shell`): `#/planner?view=projects` mostra "Dados de exemplo" e o seletor de perfil (Renan/Gestor), as colunas por situação e "Nova ideia". Clicar no cartão (qualquer ponto dele) abre o drawer do detalhe (`projeto=<id>` na URL): trilha, propriedades, provas com "+ Adicionar", briefing, "Como usar", linha do tempo e as ações; "Marcar como Pronto" mostra o motivo quando travado ("falta prova", "só o Renan"). Clique fora, X e Esc fecham; com atualização não registrada pergunta "Descartar alterações?"; durante o envio não fecha. "Editar projeto" troca o detalhe pelo formulário, e fechar o formulário volta ao detalhe. Em 390 px o drawer ocupa a largura, sem rolagem horizontal. Console sem erro.
4. Print: skill `print-ui` ou Playwright no dev server; salvar em `~/.t3/userdata/attachments/projetos-planner-quadro.png` e `projetos-planner-detalhe.png` (1440x900) e `projetos-planner-detalhe-mobile.png` (390x844).

## DEV (só leitura até o Renan pedir)
- O Deploy aplica a migration no DEV (tag `schema-dev-publicado`). Depois: as três tabelas na BetinhosCore, chave alternativa `cr40f_codigo` na etapa, lookups Restrict, coluna `cr40f_transcricao`, papel `Projetos` na solução. O papel é atribuído à mão (Renan, gestor, conta dos agentes).
- Notas: `EntityDefinitions(LogicalName='cr40f_projetoatualizacao')?$select=HasNotes` tem de dar `true` e a relação `cr40f_projetoatualizacao_Annotations` tem de existir. O POST que criou a tabela pediu notas e o Dataverse gravou `false` (23/11/2026, tela com "Could not find a property named 'cr40f_projetoatualizacao_Annotations'"); a migration `20261123-1700-projetos-habilitar-notas.ps1` liga e confere. Conferir o mesmo no TEST e no PROD depois do import.
- Na tela publicada, como Renan (Administrador do Sistema): criar projeto (a etapa 1 nasce junto), tentar Pronto sem prova (bloqueado), registrar prova com print (vira anotação; abrir pela miniatura), marcar Pronto. Como usuário só com o papel `Projetos`: Situação desabilitada, atualização grava com autor Gestor.
- Agente: usar a etapa `.1` (criar se faltar) e criar `cr40f_projetoatualizacao` pela Web API (`cr40f_Projeto@odata.bind`, `cr40f_Etapa@odata.bind`, `cr40f_autor = 100000002`) e conferir na linha do tempo do painel com o autor "Agente".

## Limites conhecidos
- Sem trava no servidor (decisão do Renan): o Dataverse aceita Concluída sem prova e status gravado por qualquer conta com o papel; a regra é da tela.
- A transcrição do áudio não é gerada pela tela; quem grava `cr40f_transcricao` é o plugin `Cr40f.Projetos.Plugin` (Groq, segredo `groq.transcricao`; até lá aparece "Transcrição pendente"). Dois áudios em atualizações paralelas da mesma linha podem perder um texto (leitura e gravação sem trava).
- Horários: `cr40f_data` vai em UTC e `cr40f_data`/`cr40f_publicadoprod` voltam convertidos para America/Sao_Paulo (`localIso` em `data/queries.ts`); no DEV, conferir que a hora mostrada na linha do tempo é a hora local do registro.
- Perfil Renan depende de papel direto (não herdado de equipe).
- Não verificado sem Dataverse: metadata real, privilégios do papel e de anotação, tamanho máximo de arquivo no ambiente, gravação de áudio em navegador real dentro do model-driven.
