---
name: verificar-projetos
description: "Verifica o módulo Projetos do Sistema Betinhos (#/projetos, tabelas cr40f_projeto, cr40f_projetoetapa e cr40f_projetoatualizacao): uma linha por projeto com etapa 1 escondida (PRJ-n.1), regra do Pronto (Concluída) com prova, situação só do Renan, briefing com áudio e transcrição, papel Projetos, migration e tela no mock e no DEV. Use após mudar apps/shell/src/pages/projetos/** ou a migration 20261123-0845-projetos.ps1."
---
# Verificar Projetos

Complementa `verificar-shell` (typecheck, testes e ambiente do shell); aqui só o que é do módulo.

## Cobre
- Código: `apps/shell/src/pages/projetos/**`, `nav/menu.ts` (item no grupo Back-End, depois dos Logs dos apps), `app/routes.tsx`, `app/AppShell.tsx` (ícone `FolderKanban`) e `packages/deploy/migrations/20261123-0845-projetos.ps1`.
- Seção "Projetos (cr40f_projeto)" do `CLAUDE.md` da raiz (nomes lógicos, choices, papel, regras dos agentes, como o Renan é identificado).

## Roteiro local (sem Dataverse)
1. `cd apps/shell && pnpm typecheck && pnpm exec vitest run src/pages/projetos src/nav src/app/AppShell.icons.test.tsx` → tudo verde.
   - `domain.test.ts`: Pronto só com prova da etapa, gestor não muda a situação, etapa única (menor número, `PRJ-n.1`), atrasada, situação ("Pronto · N provas", "No PROD"), formulário do projeto (diff do projeto e da etapa), anexos com áudio, autor pelo perfil, payloads; e o `domain/painel.ts`: fase da trilha, ação pendente, parada (mais de 7 dias), "Precisa de mim" (só Renan), "o que falta", contagens e linhas dos chips, busca sem acento, motivo do Pronto travado.
   - `ProjetosPage.test.tsx`: uma linha por projeto, sem abas; chips com contagem (gestor sem "Precisa de mim"); setas do teclado; gestor cria projeto e a etapa 1 nasce `PRJ-n.1` em Ideia com o "o que falta"; Pronto travado sem prova e liberado depois de uma prova com anexo; gestor com Pronto e Situação travados; transcrição e "Transcrição pendente"; "Como usar"; Gravar áudio com MediaRecorder falso; microfone negado; anexo acima de 5 MB recusado; "Descartar alterações?" ao trocar de linha e ao cancelar o drawer; editar projeto grava projeto e etapa 1.
2. `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` → sem erro (migration nova, não editada depois de publicada).
3. `pnpm dev` (porta 36472, mock; se ocupada, `npx vite --port <outra> --strictPort` em `apps/shell`): `#/projetos` mostra "Dados de exemplo" e o seletor "Perfil (exemplo)" (Renan/Gestor), a busca, os chips com contagem e "+ Novo". A lista tem uma linha por projeto (nome com código e área, pílula de situação e "o que falta"). Clicar numa linha abre o painel fixo à direita (`projeto=<id>` na URL): trilha, propriedades, provas com "+ Adicionar", briefing, "Como usar", linha do tempo e as ações; "Marcar como Pronto" mostra o motivo quando travado ("falta prova", "só o Renan"). Esc ou X fecham o painel; com atualização não registrada, trocar de linha pergunta "Descartar alterações?". "Editar projeto" e "Novo" abrem o drawer do DS (clique fora, X e Esc fecham; com alteração pergunta "Descartar alterações?"; durante o salvamento não fecham). Abaixo de 1100 px o painel vira drawer; em 420 px a linha empilha, sem rolagem horizontal. Console sem erro.
4. Print: skill `print-ui` ou Playwright no dev server; salvar em `~/.t3/userdata/attachments/projetos-simples-lista.png` e `projetos-simples-painel.png` (1440x900).

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
