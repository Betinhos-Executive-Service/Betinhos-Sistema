---
name: verificar-validacao-cliente
description: "Verifica a tela #/validacao-cliente do shell (financeiro acompanha a validação dos serviços pelo cliente no portal: dúvidas, retirada, fechamento do mês, Excel e validadores). Use após mudar apps/shell/src/pages/validacao-cliente/** ou o item do menu/rota dela."
---
# Verificar Validação do cliente

## Cobre
- `apps/shell/src/pages/validacao-cliente/**`: regras puras em `domain/regras.ts` (status, prazo da tácita em dias úteis sem feriados nacionais, sugestão de fechamento, linhas do Excel, validação do validador), lista no padrão DS §10.9.1/§10.9.2 em `domain/lista.ts` (visões prontas A liberar, Liberados, Em dúvida, Aprovados, Retirados; Visão padrão "Validação do cliente" sem os retirados), Excel provisório em `domain/excel.ts` (SpreadsheetML `.xls`), dados em `data/{mock,queries,source}.ts`, `components/{ValidacaoList,ValidacaoDrawer,ValidadoresDrawer}.tsx`.
- Registro: `nav/menu.ts` (Financeiro › Validação do cliente), `app/routes.tsx`, ícone `ShieldCheck` em `app/AppShell.tsx`.
- Spec: `docs/superpowers/specs/2026-10-28-portal-validacao-cliente-design.md`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/validacao-cliente` → 23 testes (15 de regras em `domain/regras.test.ts`, 8 do drawer em `components/ValidacaoDrawer.test.tsx`) em 28/10/2026.
   - Prazo: terça 27/10/2026 → 04/11 (pula Finados); sexta 30/10 com feriado na segunda → 09/11.
   - Excel de out/2026 da Tenaris no mock = 48207 (tácito) e 48206 (aprovado); 48208 marcado "Próximo mês" fica fora.
2. `pnpm typecheck` sem erros; suíte completa do shell antes do PR.

## Dados do mock
`data/mock.ts`, recarregado a cada entrada na página (gravações somem ao recarregar). Clientes Tenaris e Ternium; serviços 48201–48215:
- A liberar: 48201, 48202 (Tenaris), 48215 (Ternium).
- Liberado: 48203, 48210 (preço alterado: valor anterior R$ 780,00), 48212 (Ternium).
- Em dúvida: 48204 (motivo Espera), 48213 (Ternium). Respondido: 48205.
- Aprovado: 48206, 48208 ("Próximo mês"), 48211 (set/2026, "Entra"), 48214. Aprovado automaticamente: 48207. Retirado: 48209 (conversa guardada).
- Validadores: Carla (autenticador ativo), Roberto (aguardando QR code), Ana (inativa), Marcos (Ternium).

## Roteiro no navegador (mock)
Subir o shell em porta própria para não derrubar o dev server de outra sessão: `cd apps/shell && npx vite --port 36593 --strictPort --host 127.0.0.1` e abrir `http://127.0.0.1:36593/#/validacao-cliente` (a primeira carga do Vite pode recarregar uma vez ao otimizar dependências; os `ERR_NETWORK_CHANGED` dessa hora são do servidor subindo).
0. Liberar: abrir 48201 (A liberar) → campo Observação + "Liberar para o portal" → linha vira Liberado. Selecionar 48202 e 48215 → barra de lote "Liberar para o portal (2)" → diálogo com observação opcional → Liberados. Retirado (48209) mostra "Liberar de novo". Liberado com observação (48203) → "Salvar observação". Selecionar os dois em dúvida → "Retirar do portal (2)" com confirmação. Botão "Dúvidas (N)" troca para a visão Em dúvida.
1. Lista com "Dados de exemplo", chip "Situação: …" da Visão padrão, sem 48209. Visões do seletor do título: as cinco prontas.
2. Abrir 48204 → drawer "Serviço 48204" com composição, conversa e campo "Responder". Digitar, Esc → "Descartar alterações?" (Continuar editando mantém o texto). "Enviar resposta" → situação Respondido, mensagem na conversa, toast "Resposta enviada. O cliente tem até dd/mm/aaaa…". Vazio → "Escreva a resposta antes de enviar."
3. "Retirar do portal" → confirmação explica que o cliente deixa de ver, não entra no fechamento e a conversa fica; confirmar → Retirado, conversa visível, linha sai da Visão padrão (contagem cai).
4. Marcar a caixa de 48212 → "Incluir no fechamento" → coluna Fechamento "Entra". "Exportar Excel do mês" → Tenaris/outubro: contagem e total; exportar baixa `fechamento-tenaris-2026-10.xls`.
5. "Validadores" → cadastrar vazio mostra os 3 erros; cadastrar Paula Rocha/Tenaris → entra na lista "Aguardando QR code"; "Refazer autenticador" da Carla com confirmação → "Aguardando QR code".
6. 375 px: cards, detalhe em Sheet com "Enviar resposta", Validadores em Sheet, sem rolagem horizontal.
7. Console sem erros depois da carga.
Se o screenshot do navegador interno falhar (janela atrás), dirija pelo DOM (`dialog[open]`, `.vc-open`, `.vc-check input`) e leia o resultado no texto.

## No DEV (schema criado em 29/10/2026)
- Schema: `powershell.exe -File packages/deploy/provision-portal-cliente.ps1` (dry run) e `-Apply`, só da `main` no checkout principal → `SCHEMA OK` com as 5 tabelas e `cr40f_clientes1.cr40f_portalhabilitado` (Tenaris `564bdd2e-74cf-f011-8543-6045bd3adc1c` marcada no DEV). Relacionamentos precisam do prefixo `cr40f_` (o Dataverse recusa `systemuser_cr40f_…`).
- Metadata conferida: sets `cr40f_validacaoservicos`, `cr40f_validadorclientes`, `cr40f_mensagemvalidacaos`, `cr40f_codigoacessos`, `cr40f_dispositivoconfiavels`; navegações `cr40f_Reserva`, `cr40f_Cliente`, `cr40f_LiberadoPor`, `cr40f_Validacao`, `cr40f_Validador`. Nome do cliente é `cr40f_nomedocliente` (não há `cr40f_name` em `cr40f_clientes1`).
- Composição: `cr40f_valorhoramotorista`, `cr40f_valordadiaria`, `cr40f_valortempodeespera`, `new_valorpedagios`, `cr40f_valorrodoanel`, `cr40f_valorayrtonsenna`, `cr40f_valorarcometropolitano`, `new_valorestacionamento`, `cr40f_valorcombustivel`, `cr40f_valorpassageirosadicionais`, `cr40f_valoradequacaoderota`, `cr40f_valordesviosentrecidades`, `new_valorlocacao`, `new_valorpassagens`, `new_ajuste`; total `new_valortotal` (repasse a terceiro fica fora).
- Teste autenticado: `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/validacao-cliente` (papel com "financeiro" ou administrador). Liberar um serviço de teste da Tenaris, responder uma mensagem e conferir os registros nas tabelas.
- E-mail ao cliente: variável `cr40f_URLFlowPortalClienteEmails` com o flow "Portal cliente – e-mails" (`{ tipo: 'resposta_betinhos', para, dados }`); sem ela a resposta grava e o toast avisa que o e-mail não saiu.
