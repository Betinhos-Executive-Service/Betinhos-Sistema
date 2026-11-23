---
name: verificar-projetos
description: "Verifica o módulo Projetos do Sistema Betinhos (#/projetos, tabelas cr40f_projeto e cr40f_projetoatualizacao): regra do Concluído com prova, linha do tempo, anexos, migration e tela no mock e no DEV. Use após mudar apps/shell/src/pages/projetos/** ou a migration 20261123-0845-projetos.ps1."
---
# Verificar Projetos

Complementa `verificar-shell` (typecheck, testes e ambiente do shell); aqui só o que é do módulo.

## Cobre
- Código: `apps/shell/src/pages/projetos/**`, `nav/menu.ts` (item no grupo Operacional, depois do Planner), `app/routes.tsx`, `app/AppShell.tsx` (ícone `FolderKanban`) e `packages/deploy/migrations/20261123-0845-projetos.ps1`.
- Seção "Projetos (cr40f_projeto)" do `CLAUDE.md` da raiz (nomes lógicos, choices, privilégios).

## Roteiro local (sem Dataverse)
1. `cd apps/shell && pnpm typecheck && pnpm exec vitest run src/pages/projetos src/nav src/app/AppShell.icons.test.tsx` → tudo verde. `ProjetosPage.test.tsx` cobre os 5 cenários:
   1. Concluído sem prova é bloqueado com o aviso e não grava.
   2. Concluído com prova com anexo grava `cr40f_status = 100000003`.
   3. Atualização do agente aparece na linha do tempo com autor, selo "Prova" e miniatura.
   4. "Nova atualização" com anexo entra na linha do tempo.
   5. Anexo acima de 5 MB é recusado com a mensagem do limite.
2. `node packages/deploy/migrations-ci.mjs` → "Migrations ok." (BOM, nome e idempotência; não executa a migration).
3. `pnpm dev` (porta 36472, mock): `#/projetos` mostra "Dados de exemplo", 5 projetos, visões "Em curso", "Em validação" e "Concluídos", busca por palavras, e o drawer com cabeçalho, Instruções de uso, "Nova atualização" e a linha do tempo. Fechar o drawer com alteração pergunta "Descartar alterações?". Sem rolagem horizontal em 390 px; console sem erro.

## DEV (só leitura até o Renan pedir)
- A migration é à mão no DEV (`-Apply` só com pedido). Depois: `cr40f_projeto` e `cr40f_projetoatualizacao` existem na AppBetinhos, o lookup `cr40f_Projeto` é Restrict e `Acesso-Betinhos-MDA`/`DEV - Usuário` leem e gravam.
- Na tela publicada: criar projeto, tentar Concluído sem prova (bloqueado), registrar atualização com print marcada como prova (anexo vira annotation; abrir pela miniatura), concluir.
- Agente: criar `cr40f_projetoatualizacao` pela Web API com `cr40f_Projeto@odata.bind` e conferir que aparece na linha do tempo com o autor "Agente".

## Limites conhecidos
- O Dataverse não bloqueia Concluído sem prova (a regra é da tela); anexo de nota acima de 5 MB é recusado pelo ambiente.
- Não verificado sem Dataverse: metadata real, privilégios de anotação, tamanho máximo de arquivo no ambiente.
