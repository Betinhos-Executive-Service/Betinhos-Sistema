---
name: verificar-funcoes-operacionais
description: "Verifica a tela #/funcoes-operacionais do shell (Trocar motorista, Duplicar pedido e Trocar carro com Nova/Editar troca via Custom APIs new_*TrocaDeCarro). Use após mudar apps/shell/src/pages/funcoes-operacionais/** ou o item do menu/rota dela."
---
# Verificar Funções Operacionais

## Cobre
- `apps/shell/src/pages/funcoes-operacionais/**`: domain puro (`logic.ts` = previsão de posse e janela entre serviços, `forms.ts` validações, `payloads.ts` corpos das Custom APIs e idempotência FNV-1a, `queries.ts`, `routes.ts`), `data/{dataverse,mock,source}.ts`, hook `useFuncoesOperacionais.ts`, `components/**`.
- Registro: `nav/menu.ts` (Operacional › Funções Operacionais; ids antigos `new_telafuncoesoperacionais` e `custom-page-funcoes-operacionais` redirecionam), `app/routes.tsx`, ícone `Wrench` em `app/AppShell.tsx`, atalho do Geral.
- Origem: repo `Betinhos-Executive-Service/Tela-Funcoes-Operacionais` (WebResource `new_telafuncoesoperacionais` v1.0.173); inventário de paridade em `legacy/funcoes-operacionais/INVENTARIO.md`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/funcoes-operacionais src/nav` → 87 testes em 29/10/2026 (59 do módulo).
2. `pnpm typecheck` e suíte completa do shell antes do PR.

## Rota
`#/funcoes-operacionais` (Motorista), `?aba=pedido`, `?aba=carro`, `?aba=carro&troca={guid}` edita. Legado `?view=`, `?mode=edit&id=`, `?data=` é convertido.

## Roteiro em mock
`cd apps/shell && npx vite --port 36472 --strictPort` → `http://localhost:36472/#/funcoes-operacionais`.
1. Motorista: 5 serviços (#11482–#11486) agrupados Hoje/Amanhã/dia; busca; "Trocar motorista" → toast com Desfazer.
2. Pedido: "Duplicar este pedido" → escolher datas no calendário, horário e motorista → cria os novos.
3. Carro: Tipo Troca, Motorista 1 Bruno e 2 Carla, Entre serviços, escolher posição na agenda → "Agendar troca" → resumo e toast. Devolução/Retirada pedem local (cadastro de local no select).
4. Editar via `?aba=carro&troca=` (id do mock `MOCK_SWAP_ID`); Concluída/Cancelada ficam somente leitura; cancelar/reverter exigem motivo.
5. 390 px sem rolagem horizontal; console sem erros.

## No DEV (não verificável na nuvem)
- Custom APIs `new_RegistrarTrocaDeCarro`, `new_AtualizarTrocaDeCarro`, `new_CancelarTrocaDeCarro`, `new_ReverterTrocaDeCarro` com `new_VersaoEsperada` (etag) — agendar, editar, cancelar e reverter uma troca de teste e conferir a Geral criada pelo servidor.
- Trocar motorista e duplicar pedido gravam em `cr40f_reservadeveculos`/`cr40f_servicosporpassageiro`; conferir no registro.
