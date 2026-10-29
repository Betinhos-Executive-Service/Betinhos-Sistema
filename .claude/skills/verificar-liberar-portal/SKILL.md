---
name: verificar-liberar-portal
description: "Verifica a ação \"Liberar para o portal\" da Tabela Geral (#/geral): regra de prontos/bloqueados, prazo da tácita, drawer de confirmação, coluna Portal e o schema cr40f_validacaoservico (provision-portal-cliente.ps1). Use após mudar esses arquivos ou quando pedirem para testar a liberação de serviços para o cliente."
---
# Verificar "Liberar para o portal" (Geral)

## Cobre
- `apps/shell/src/pages/geral/domain/portal.ts` (+ `.test.ts`): `motivoBloqueio`/`classificar` (ordem: cancelado → já liberado → sem cliente → cliente sem portal → composição não concluída; Retirado pode liberar de novo). Status, rótulos e `prazoTacita` vêm de `pages/validacao-cliente/domain/regras.ts` (testados lá).
- `apps/shell/src/pages/geral/data/portal.ts`: mock (perfil pelo número da OS, `n % 6`: 2 = sem composição, 3 = "Grupo Atlântico" sem portal; ex.: OS-1004 sem composição, OS-1005 sem portal) e Dataverse (reserva com `$expand=new_ComposicaodePreco($select=new_status,new_valortotal)`, `cr40f_clientes1.cr40f_portalhabilitado`, cria ou atualiza `cr40f_validacaoservico` em blocos de 10).
- `components/LiberarPortalDrawer.tsx` (+ `.test.tsx`), ligações em `GeralPage.tsx` (Ações, clique direito, ⋮ com dica sem seleção, barra do celular) e a coluna virtual `portal` (`useGeralViewState` › `hiddenByDefault`).
- Schema: `packages/deploy/provision-portal-cliente.ps1` (na `main`, aplicado no DEV em 29/10/2026 pela sessão da tela `#/validacao-cliente`; Tenaris com Portal habilitado no DEV).
- Valores de metadata conferidos no DEV em 28/10/2026: composição `new_status` 100000000 Pendente / 100000001 Concluido; reserva `cr40f_status` 202410002 Cancelado; nav `new_ComposicaodePreco` e `cr40f_Cliente`; nome primário do cliente `cr40f_nomedocliente`.

## Roteiro
1. `cd apps/shell && npx tsc --noEmit -p .` sem erros; `npx vitest run src/pages/geral/domain/portal.test.ts src/pages/geral/components/LiberarPortalDrawer.test.tsx` verde (rodar em segundo plano: a máquina é lenta e o vitest passa de 5 min com a suíte da Geral).
2. Navegador interno, `.claude/launch.json` › `shell` (porta 36472, mock). `#/geral`, desktop 1500x800:
   - Sem seleção: ⋮ › "Liberar para o portal" desabilitado com "Selecione um ou mais serviços.".
   - Marque OS-1002 a OS-1005 (OS-1002 e OS-1003 prontos, OS-1004 "Composição não concluída"; OS-1005 é do "Grupo Atlântico" sem portal, mas está Cancelado no mock e aparece como "Serviço cancelado", que tem prioridade) → Ações › "Liberar para o portal" → drawer com "Prontos para liberar (2)", "Não podem ser liberados (2)", total em R$ e botão "Liberar 2 serviços". Gravar → toast "2 serviços liberados para o portal; 2 ficaram de fora."
   - Repetir com OS-1002 → "Já liberado" e botão "Liberar" desabilitado.
   - Digitar observação e apertar Esc ou clicar no fundo → "Descartar alterações?" com "Continuar editando" (volta ao drawer com o texto) e "Descartar".
   - Painel de colunas: "Portal" aparece desligada; ligar → coluna mostra "Liberado" nas OS liberadas e "—" nas demais; clicar "Ordenar" nela só avisa (não ordena).
3. 375 px (preset mobile): marcar cards → barra de seleção tem "Liberar para o portal" → Sheet com o mesmo conteúdo, sem rolagem horizontal. Com observação, X → "Descartar alterações?" → "Continuar editando" reabre o Sheet com o texto (o Sheet fecha o próprio `<dialog>`; o drawer o remonta pela `key`). Há vários `dialog.bt-sheet` na página: confira o que tem "Liberar para o portal".
4. Console sem erros (`read_console_messages` onlyErrors).
5. DEV (depois de publicar da `main`): selecionar um serviço de teste da Tenaris com composição Concluido, liberar e conferir o registro em `cr40f_validacaoservicos` (status 100000000, prazo, `_cr40f_liberadopor_value`) e que `cr40f_statusdefaturamento` da reserva não mudou.

## Casos de borda
- Reserva sem composição (lookup vazio) = "Composição não concluída"; valor `null` soma 0 no total.
- Falha por serviço no Dataverse não aborta os demais: toast vermelho com os códigos que falharam.
- `cr40f_statusdefaturamento` da reserva nunca é gravado (o PATCH vai só em `cr40f_validacaoservico`).
- Preferência de colunas salva antes da coluna Portal existir mantém a Portal oculta; visão salva nunca leva `portal` no layoutxml.

## Evidência obrigatória
- Saída dos testes e do typecheck e screenshot do drawer (desktop e 375 px).

## Limites
- Gravação real no Dataverse, privilégios do usuário de aplicação do portal e o que o cliente vê no portal (`verificar-portal-cliente`) não são verificáveis em mock.
