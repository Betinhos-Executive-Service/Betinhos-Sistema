---
name: verificar-projetos
description: "Verifica o módulo Projetos do Sistema Betinhos (#/projetos, tabelas cr40f_projeto, cr40f_projetoetapa e cr40f_projetoatualizacao): etapas PRJ-n.m, regra do Concluída com prova da etapa, status só do Renan, briefing com áudio e transcrição, papel Projetos, migration e tela no mock e no DEV. Use após mudar apps/shell/src/pages/projetos/** ou a migration 20261123-0845-projetos.ps1."
---
# Verificar Projetos

Complementa `verificar-shell` (typecheck, testes e ambiente do shell); aqui só o que é do módulo.

## Cobre
- Código: `apps/shell/src/pages/projetos/**`, `nav/menu.ts` (item no grupo Back-End, depois dos Logs dos apps), `app/routes.tsx`, `app/AppShell.tsx` (ícone `FolderKanban`) e `packages/deploy/migrations/20261123-0845-projetos.ps1`.
- Seção "Projetos (cr40f_projeto)" do `CLAUDE.md` da raiz (nomes lógicos, choices, papel, regras dos agentes, como o Renan é identificado).

## Roteiro local (sem Dataverse)
1. `cd apps/shell && pnpm typecheck && pnpm exec vitest run src/pages/projetos src/nav src/app/AppShell.icons.test.tsx` → tudo verde.
   - `domain.test.ts`: Concluída só com prova da mesma etapa, gestor não muda status, próxima etapa `PRJ-n.m` (maior número + 1), progresso derivado, atrasada, formulários, anexos com áudio, autor pelo perfil, payloads; e o `domain/painel.ts`: fase da trilha (1 a 5, Pausada sem destaque, Vencido), ação pendente, parada (mais de 7 dias), "Precisa de mim" (só Renan), contagens e agrupamento dos chips, busca sem acento, galeria de provas por projeto e tipo, motivo do Concluir travado.
   - `ProjetosPage.test.tsx`: lista agrupada com trilha e ação pendente; chips com contagem e filtro (gestor sem "Precisa de mim"); recolher grupo e setas do teclado; gestor cria projeto e etapa (nasce em Ideia com o próximo código) e o painel abre neles; Concluir travado sem prova e liberado depois de uma prova com anexo; gestor com Concluir e Status travados; transcrição e "Transcrição pendente"; Gravar áudio do painel com MediaRecorder falso; microfone negado; anexo acima de 5 MB recusado; "Descartar alterações?" ao trocar de linha com atualização não registrada e ao cancelar o drawer; abas Provas (filtro por tipo) e Instruções (edita e grava).
2. `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` → sem erro (migration nova, não editada depois de publicada).
3. `pnpm dev` (porta 36472, mock; se ocupada, `npx vite --port <outra> --strictPort` em `apps/shell`): `#/projetos` mostra "Dados de exemplo" e o seletor "Perfil (exemplo)" (Renan/Gestor), a barra Lista/Provas/Instruções, a busca "Buscar projeto, etapa ou PRJ…" e os chips com contagem. Na lista: grupos por projeto (recolhíveis, barra de progresso, "n de m", "Parado há N dias") e etapas com a trilha Ideia → Fazendo → DEV → PROD → Prova, provas, avatar R/G/IA e a ação pendente. Clicar numa linha abre o painel fixo à direita (`etapa=<id>` ou `projeto=<id>` na URL): trilha grande, propriedades, provas com "+ Adicionar", briefing, linha do tempo e as ações; Concluir mostra o motivo quando travado ("falta prova", "só o Renan"). Esc ou X fecham o painel; com atualização não registrada, trocar de linha ou de aba (Lista/Provas/Instruções) pergunta "Descartar alterações?". "Editar etapa", "Nova etapa", "Editar projeto" e "Novo projeto" abrem drawers do DS (clique fora, X e Esc fecham; com alteração pergunta "Descartar alterações?"; durante o salvamento não fecham). Abaixo de 1100 px o painel vira drawer; em 420 px a linha empilha código/nome, trilha e atividade, sem rolagem horizontal. Aba Provas filtra por projeto e tipo; aba Instruções edita o "Como usar". Console sem erro.
4. Print: skill `print-ui` ou Playwright no dev server; salvar em `~/.t3/userdata/attachments/projetos-lista.png` (painel aberto), `projetos-provas.png`, `projetos-instrucoes.png` e `projetos-estreito.png` (420 px) e comparar com `projetos-mock-4.png`.

## DEV (só leitura até o Renan pedir)
- O Deploy aplica a migration no DEV (tag `schema-dev-publicado`). Depois: as três tabelas na BetinhosCore, chave alternativa `cr40f_codigo` na etapa, lookups Restrict, coluna `cr40f_transcricao`, papel `Projetos` na solução. O papel é atribuído à mão (Renan, gestor, conta dos agentes).
- Notas: `EntityDefinitions(LogicalName='cr40f_projetoatualizacao')?$select=HasNotes` tem de dar `true` e a relação `cr40f_projetoatualizacao_Annotations` tem de existir. O POST que criou a tabela pediu notas e o Dataverse gravou `false` (23/11/2026, tela com "Could not find a property named 'cr40f_projetoatualizacao_Annotations'"); a migration `20261123-1700-projetos-habilitar-notas.ps1` liga e confere. Conferir o mesmo no TEST e no PROD depois do import.
- Na tela publicada, como Renan (Administrador do Sistema): criar projeto e etapa, tentar Concluída sem prova (bloqueado), registrar prova com print (vira anotação; abrir pela miniatura), concluir. Como usuário só com o papel `Projetos`: Status desabilitado, atualização grava com autor Gestor.
- Agente: criar etapa e `cr40f_projetoatualizacao` pela Web API (`cr40f_Projeto@odata.bind`, `cr40f_Etapa@odata.bind`, `cr40f_autor = 100000002`) e conferir na linha do tempo da etapa com o autor "Agente".

## Limites conhecidos
- Sem trava no servidor (decisão do Renan): o Dataverse aceita Concluída sem prova e status gravado por qualquer conta com o papel; a regra é da tela.
- A transcrição do áudio não é gerada pela tela; quem grava `cr40f_transcricao` é o plugin `Cr40f.Projetos.Plugin` (Groq, segredo `groq.transcricao`; até lá aparece "Transcrição pendente"). Dois áudios em atualizações paralelas da mesma linha podem perder um texto (leitura e gravação sem trava).
- Horários: `cr40f_data` vai em UTC e `cr40f_data`/`cr40f_publicadoprod` voltam convertidos para America/Sao_Paulo (`localIso` em `data/queries.ts`); no DEV, conferir que a hora mostrada na linha do tempo é a hora local do registro.
- Perfil Renan depende de papel direto (não herdado de equipe).
- Não verificado sem Dataverse: metadata real, privilégios do papel e de anotação, tamanho máximo de arquivo no ambiente, gravação de áudio em navegador real dentro do model-driven.
