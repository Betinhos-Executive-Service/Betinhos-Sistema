# Despesas operacionais em React (`#/despesas-operacionais`)

Data: 09/10/2026 · Aprovado por Renan.

## Objetivo
Trocar a lista nativa de `cr40f_despesaoperacional` (aberta em iframe pelo `EntityFrame`) por uma tela React do shell, **somente consulta**, no molde de Ordens de Pagamento.

## Decisões
- Só leitura: nenhuma escrita no Dataverse (validar, pagar, editar e enviar comprovante continuam fora).
- A tela legada `new_teladespesasoperacionais` (tabela `cr40f_despesa`, cartões/Pluggy) fica como está no menu.
- Comprovantes (`cr40f_anexodespesaoperacional`): só ver e abrir o link (`cr40f_sharelink`, depois `cr40f_urlsharepoint`; só http(s)).
- Período padrão: últimos 90 dias pela data do gasto, filtrado no servidor.
- Cadastros de categoria e forma de pagamento seguem nas listas nativas.

## Tela
- Cabeçalho com 4 KPIs da lista filtrada: Total, Aguardando pagamento (R$ e qtd), Sem comprovante (status do anexo diferente de Completo, mesmo critério do Dashboard), Possível duplicidade.
- Filtros: visão, busca (descrição, local, motorista, categoria, forma, reserva, veículo, protocolo, cidade), período, status operacional, status financeiro, categoria, motorista, alertas. Visões prontas: Todas, Aguardando pagamento, Precisa corrigir, Sem comprovante, Possível duplicidade; visões pessoais em localStorage (`betinhos.despesas.visoes.v1`).
- Tabela no desktop e cartões até 820 px; 50 por página.
- Ficha (Drawer wide): Gasto, Vínculos (motorista, veículo, reserva, manutenção com link para a ficha no model-driven), Observações, Comprovantes (carregados ao abrir), Origem e registro (com link do mapa quando há latitude/longitude).

## Código
`apps/shell/src/pages/despesas/` (domain, data, componentes, testes); rota em `RouteLayout.tsx`, item em `nav/menu.ts` no lugar de `table('cr40f_despesaoperacional')`, ícone em `AppShell.tsx`. Reaproveita `pagantes.css`, `SaveViewDialog`, `PERIODOS`/`periodoStart`, `formatMoney`/`formatDate`, `safeUrl` e `openFromRow`.

## Verificação
- Testes de domínio, consultas e página (mock); suíte do shell e typecheck verdes.
- Colunas das duas tabelas conferidas no DEV (leitura).
- Pendente: publicar em DEV e conferir autenticado (FormattedValue dos lookups, links de anexos).
