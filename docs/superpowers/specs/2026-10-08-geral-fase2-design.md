# Geral — fase 2: rolagem infinita, filtros, visões, comandos restantes — design

**Data:** 08/10/2026 · **Status:** escopo aprovado em conversa (escolhas do Renan: visões salvas no Dataverse; ordem A → B → C → D) · **Base:** spec `2026-10-08-geral-react-design.md` e branch `claude/tela-geral-react-9f9bc1` (HEAD `9d65c6b`).

## 0. Objetivo

Paridade funcional com a lista nativa "Geral" do app model-driven, com a UX da Composição de Preço para carga sob demanda: nada de paginação; a lista cresce ao rolar. Entregue em quatro blocos independentes, cada um com plano próprio e verificação em mock antes do seguinte.

## Bloco A — Rolagem infinita

### Decisões
- Sem paginação e sem seletor de "por página". `PAGE_SIZE = 100` fixo (igual à Composição). O estado `pageSize`, o `Select` do rodapé e a chave `betinhos.geral.pagina.v1` saem.
- A lista acumula páginas: `rows = [...páginas carregadas]`, sem repetir ids (`cr40f_reservadeveculosid`). Ordenar, buscar, trocar visão ou filtrar (bloco B) zera a lista e volta ao topo.
- Carga sob demanda por `IntersectionObserver` num sentinela depois da última linha, `rootMargin: '800px 0px'`, raiz = contêiner de rolagem da tabela no desktop e `null` (viewport) nos cards do celular. Sem `IntersectionObserver` (ou com `prefers-reduced-motion`? não: sempre) existe o botão "Carregar mais" como alternativa acessível, visível no rodapé enquanto houver mais.
- Guardas: não dispara enquanto uma página está carregando; descarta resposta de visão/ordem/busca antiga (token); se o servidor devolver o mesmo paging cookie da página anterior, para e mostra erro ("A consulta não avançou. Tente atualizar.") em vez de repetir linhas.
- **Total**: usa `@Microsoft.Dynamics.CRM.totalrecordcount` da primeira página (`returntotalrecordcount="true"`, já pedido pelo `buildFetch`). Quando vier `-1` (mais de 5.000) ou nulo, tenta uma consulta agregada `count` sobre o id com os mesmos filtros e `link-entity` da visão (`aggregate="true"`, alias `total`, sem `order`/`count`/`page`); se também falhar (limite de agregação), `total = null`. Texto: "100 de 220 serviços" com total, "100+ serviços" sem total, "220 serviços" quando tudo carregado. O mesmo texto vai no `meta` do cabeçalho e no rodapé.
- **Rodapé**: linha fina com o texto acima à esquerda e, à direita, `Spinner` + "Carregando mais…" durante a carga, ou "Carregar mais" (botão ghost) quando há mais e o observer não disparou, ou "Fim da lista" quando acabou. Em erro de "carregar mais": `Alert danger` compacto com a mensagem e "Tentar novamente", sem perder as linhas já carregadas.
- **Atualizar** (`reload`): recarrega da página 1 até o número de páginas que estava carregado, em sequência, mantendo a posição de rolagem; seleção é mantida se os ids continuarem presentes. `refresh()` (após Criar/Editar) faz o mesmo.
- **Seleção** passa a ser por lista carregada (não mais por página): "Selecionar tudo" marca as linhas carregadas e o rótulo diz "Selecionar carregados"; a contagem no badge continua.
- Mobile: cards com o mesmo sentinela, rolando a página.
- Mock: 220 linhas → 3 páginas (100, 100, 20); latência configurável como hoje.

### Arquitetura
- `useGeral`: substitui `page/cookies/goTo/pageSize/setPageSize` por `{ rows, more, total, loadingMore, loadMore(), reload(), refresh(), loadError }`; mantém `sort/query/view/selected/cells/save`. Estado interno: `cookie` da última página, `pagesLoaded`, token de requisição, conjunto de ids.
- `source.page(req)` continua igual (`page`, `cookie`, `pageSize`); ganha `source.count(fetchxml, { query, quickFind }) → number | null` (Dataverse: agregado; mock: tamanho do resultado filtrado).
- `domain/fetch.ts`: `buildCountFetch(fetchxml, { query, quickFind })` (puro, testado): remove `order`, `count`, `page`, `paging-cookie`, `returntotalrecordcount`, troca os `<attribute>` da raiz por `<attribute name="cr40f_reservadeveculosid" alias="total" aggregate="count" />`, remove `<attribute>` dos `link-entity` (mantém o join e os filtros), e adiciona `aggregate="true"` e `distinct="false"` no `<fetch>`.
- `components/LoadMore.tsx`: sentinela + rodapé de estado (spinner/botão/fim/erro), recebe `root` por ref.
- `GeralTable`/`GeralCards`: recebem `footer` com o `LoadMore`; a tabela expõe a ref do contêiner de rolagem.
- Remoção: `Pagination`, `domain/pageSize.ts`, testes de paginação.

### Aceite
- Mock: abre com 100 linhas e "100 de 220 serviços"; rolar até o fim carrega 100 e depois 20, termina em "220 serviços" e "Fim da lista"; sem ids repetidos; ordenar/buscar/trocar visão voltam ao topo com 100; "Carregar mais" funciona sem `IntersectionObserver`; erro de carga mostra "Tentar novamente" e mantém as linhas; Atualizar mantém posição e quantidade de páginas; celular idem com cards.
- Testes: `buildCountFetch`, acumulação/dedupe/token/cookie repetido no hook, `LoadMore` nos três estados, página com observer simulado.

## Bloco B — Filtros, colunas e visões pessoais

### Decisões
- **Menu por coluna** (ícone ▾ no cabeçalho, também por teclado): "Ordenar A→Z", "Ordenar Z→A", "Filtrar por…", "Limpar filtro desta coluna", "Ocultar coluna". Colunas de `link-entity` só ordenam e ocultam (filtro fica fora nesta fase).
- **Operadores por tipo** (viram `<condition>` na raiz do FetchXML da visão, dentro de um `<filter type="and">` próprio da tela, acumulando com os filtros da visão):
  - Texto/texto longo: contém, não contém, igual, começa com, está vazio, não está vazio.
  - Choice/status: múltipla escolha (`in`), ou "está vazio".
  - Lookup: múltipla escolha com busca no servidor (`in` pelos ids), ou "está vazio".
  - Data/hora: Hoje, Amanhã, Ontem, Esta semana, Próximos 7 dias, Últimos 7 dias, Este mês, Intervalo (de/até em America/Sao_Paulo → `on-or-after`/`on-or-before`), está vazio.
  - Dinheiro/número: igual, maior ou igual, menor ou igual, entre, está vazio.
  - Sim/Não: Sim, Não.
- **Chips** dos filtros ativos abaixo da toolbar ("Status: Confirmado, Programado ×", "Saída: Hoje ×"), com "Limpar filtros". Busca por palavra-chave continua separada (localização rápida).
- **Editar filtros**: `Drawer` com todos os campos filtráveis da visão (não só as colunas visíveis), mesmo editor por tipo, "Aplicar" e "Limpar tudo".
- **Colunas**: redimensionar arrastando a borda do cabeçalho (mín. 90 px, duplo clique volta ao padrão da visão) e reordenar arrastando o cabeçalho (teclado: Alt+←/→ no cabeçalho focado). Persistência por visão junto das preferências atuais (`betinhos.geral.colunas.v1` ganha `widths`).
- **Visões pessoais no Dataverse**: "Salvar como visão" grava `userquery` (`name`, `returnedtypecode = cr40f_reservadeveculos`, `querytype = 0`, `fetchxml` = FetchXML da visão base com os filtros da tela e a ordenação atual incorporados, `layoutxml` = colunas visíveis na ordem e larguras atuais, `description = 'Criada no Sistema Betinhos'`). "Salvar" numa visão pessoal já aberta atualiza (`PATCH`). Renomear e excluir só visões pessoais, com confirmação. Visões do sistema não mudam. Em mock, as visões pessoais ficam em memória.
- **Link compartilhável** (adiantado do bloco C por ser estado da URL): `#/geral?view=<id>&q=<busca>&sort=<attr>:<asc|desc>&f=<filtros em JSON compacto base64url>`; a tela lê a URL ao abrir e a atualiza (`history.replaceState`) a cada mudança.

### Aceite
- Filtro por coluna de cada tipo gera o FetchXML esperado (testes puros) e filtra no mock; chips refletem e removem; Editar filtros cobre campos não visíveis; redimensionar/reordenar persistem e voltam ao padrão; salvar visão pessoal cria `userquery` com `fetchxml`/`layoutxml` válidos (testado com host falso) e ela aparece no seletor; renomear/excluir funcionam; URL reflete o estado e restaura ao abrir.

## Bloco C — Comandos restantes e painel de contagem

Fonte: scripts do app nativo (cópias em `Dashboard Betinhos/_pac-backup/AppBetinhos-before-infleet/WebResources/`).

- **Auditoria**: `navigateTo({ pageType: 'webresource', webresourceName: 'new_betinhos_AuditoriaViewer', data: JSON.stringify({ version, orgUrl, entityName: 'cr40f_reservadeveculos', entitySetName, validIds }) }, { target: 2, width: { value: 92, unit: '%' }, height: { value: 88, unit: '%' }, position: 1 })` dentro do model-driven; fora, overlay próprio com iframe `/WebResources/new_betinhos_AuditoriaViewer?data=…` (mesmo padrão do voucher). Funciona sem seleção (ids vazios).
- **Gerar OP**: 1+ selecionados. Lê `_cr40f_financeiro_value` das linhas (já vem na visão quando a coluna existe; senão `retrieveRecord` por id). Quem já tem OP não entra; se todos têm, aviso "Todos os serviços selecionados já possuem OP." Confirmação listando quem fica de fora e quantos entram. URL do flow pela variável de ambiente `new_FlowUrlCriarOP` (`environmentvariablevalue`, depois `defaultvalue`). `POST` JSON `{ "guids": "id1,id2" }`. 200/202 → toast "OP criada para N serviço(s)." e `refresh()`; erro → `Alert danger` com status e mensagem.
- **Disparar**: 1+ selecionados. Confirmação "Marcar N serviço(s) como Programado?" (avisa que sem motorista o servidor recusa). `PATCH { cr40f_status: 202410005, new_foiprogramado: true }` por id com `allSettled`, toast com resultado parcial, `refresh()`.
- **Registrar Erro**: exatamente 1 selecionado. `navigateTo({ pageType: 'webresource', webresourceName: 'new_gestao_erros_operacionais.html', data: 'reservaId=<id>' }, { target: 1 })`; fora do model-driven, rota `#/new_gestao_erros_operacionais.html?reservaId=<id>` do shell se existir, senão nova aba.
- **Contagem de Serviços**: `Drawer` React "Serviços por motorista": dia (padrão = dia do filtro de saída da visão, senão hoje), navegação ◀ Hoje ▶, lista de motoristas ativos (`cr40f_funcionarios`, apelido ou nome) com contagem de reservas do dia (`_cr40f_motorista_value ne null`, saída no dia em America/Sao_Paulo), cor por desvio da média entre quem tem serviço (0 cinza; ≤0,6 verde; ≤1,2 amarelo; ≤1,8 laranja; acima vermelho — sempre com o número), expandir motorista mostra hora + trajeto, excluir motorista da média (persistido), atualização a cada 60 s com "Atualizado às HH:mm".
- **Compartilhar**: botão que copia a URL do bloco B e mostra toast "Link copiado."

## Bloco D — Mostrar como

- `SegmentedControl` "Tabela | Cards" no desktop (cards são os do celular, em grade de 2–3 colunas); escolha persistida (`betinhos.geral.modo.v1`). Gráfico fica fora (Dashboard cobre).

## Fora de escopo da fase 2
Gráfico; filtro em colunas de `link-entity`; edição em massa; exclusão de registros; compartilhar visão pessoal com outros usuários (fica pelo app nativo).
