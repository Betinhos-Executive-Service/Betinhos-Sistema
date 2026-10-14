# Geral (lista editável de serviços) em React — design

**Data:** 08/10/2026 · **Status:** aprovado em conversa (escolhas do Renan) · **Escopo:** rota `#/geral` no shell, no lugar da lista nativa `cr40f_reservadeveculos` (grupo Operacional, rótulo "Geral").

## 1. Decisões

- "Geral" é a tabela de reservas/serviços (`cr40f_reservadeveculos`). A tela substitui **a lista nativa com suas visões e a barra de comandos**. O formulário de criação/edição **continua sendo o WebResource Formulário Geral** (`new_formulario_geral.html`); esta tela só o abre.
- **Edição na célula** de todo campo simples da reserva: status, status de faturamento, data/hora de saída, previsão de retorno, motorista, veículo, tipo de veículo, tipo de serviço, solicitante, cliente, trajeto, observações (interna, de operação, de faturamento, final), CR, receber, forma de pagamento, cotação, e-mail. Só leitura: ID, criado em/por, campos VIEW gerados por flow (`cr40f_passageirosetelefonedecontato`, `cr40f_endereodesada`, `cr40f_perfildopassageiro`), colunas de tabela ligada (valor total da composição) e link do voucher.
- **Visões e colunas vêm do Dataverse**: visões do sistema (`savedquery`, querytype 0, ativas) e visões pessoais do usuário (`userquery`), com `fetchxml` + `layoutxml`. Padrão: a visão marcada como `isdefault` (hoje "🗓️Agenda"). Mostrar/ocultar/reordenar colunas é local, salvo no navegador por visão.
- **Motor FetchXML**: a tela injeta ordenação, busca e paginação no FetchXML da visão e executa via Web API `?fetchXml=`. Suporta `link-entity`, ordenar por coluna, buscar e paginar no servidor.
- **Feedback de gravação na própria célula** (gravando, salvo, erro), toast só para falhas fora da célula e para comandos.
- **Comandos desta fase**: Criar, Editar, Atualizar, Desativar/Ativar, Gerar Voucher, Copiar Serviços, e atalhos de navegação para Funções Operacionais, Escala FDS e Contagem de Serviços.
- **Fora do escopo**: formulário completo, "Mostrar como", gráfico, Auditoria, Gerar OP, Disparar, Registrar Erro, edição em massa, criar/editar visões no Dataverse, exclusão de registros.

## 2. Fonte auditada (DEV, 08/10/2026)

- Formulário principal da reserva: `68573afa-38de-499a-a67f-bf95eb4c19d9` (objecttypecode 10580), aba única "Detalhes do Serviço". Não há aba "Geral" em formulário; "Geral" é o rótulo da tabela no app.
- Visões do sistema (13): 📲 Visualização Mobile, 🗓️ Agenda (Todos serviços), 🗓️Agenda (**padrão**, filtro `next-x-years 3`, ordem `cr40f_dataehorriodesada asc`), ℹ️ Sem CR da Tenaris, ⚠️Requer análise, 💰View Composição de Preços, 🗓️ Dia posterior, 🗓️ Hoje, 🚫Pedidos sem motorista designado, 🗓️ Final de semana e próxima segunda, 📤 Disparar, Visualização Padrão, 💲A receber. Duas visões usam `link-entity` para `cr40f_composicaodeprecos` (`new_valortotal` e campos de valor).
- Visões pessoais (11), ex.: Tenaris, Serviços de Amanhã, Emergencial, Houve erro.
- Localização rápida: "Localização Rápida de Reserva de veículoss Ativo(a)" (`isquickfindquery = 1`); os campos de busca vêm do filtro `isquickfindfields="1"`.
- Barra de comandos moderna (`appaction`, grade principal): Criar (`Mscrm.NewRecordFromGrid`), Atualizar (`new_refreshGrid`), Funções Operacionais (`cr40f_abrirfuncoesoperacionais` → WebResource `new_telafuncoesoperacionais`), Contagem de Serviços (`new_scriptabalateralservicospormotorista`, painel lateral injetado no DOM), Escala FDS (`cr40f_escalafds_commands.js` → `cr40f_EscalaFDS.html` em overlay), Auditoria, Gerar OP (`cr40f_Flow_Gerar_OP`), Disparar (`new_programarRegistros.js`), Registrar Erro, Copiar Serviços (`new_ScriptCopiarServicos`), Gerar Voucher (`cr40f_VoucherConfirmacaoCommand.js` → overlay `cr40f_VoucherConfirmacao.html?ids=[…]`), Desativar/Ativar.
- Contrato de abertura do Formulário Geral (comando atual): `Xrm.Navigation.navigateTo({ pageType: 'webresource', webresourceName: 'new_formulario_geral.html', data: JSON.stringify({ mode: 'create' | 'edit', entityName: 'cr40f_reservadeveculos', id, recordId, entityId }) }, { target: 1 })`, e ao fechar atualiza a grade.
- Schema da reserva: ver `describe` de `cr40f_reservadeveculos` (choices de status, faturamento, tipo de veículo, tipo de serviço, forma de pagamento; lookups `cr40f_cliente`, `cr40f_solicitante`, `cr40f_motorista`, `cr40f_veiculo`, `cr40f_passageiro1..4`). Rótulos e opções vêm da metadata em tempo real; navigation properties dos lookups vêm de `ManyToOneRelationships`, nunca fixas.

## 3. Arquitetura

`apps/shell/src/pages/geral/`:

- `domain/` (puro, testado): `fetch.ts` (parse do FetchXML da visão, injeção de `order`, condições de busca, `count`/`page`/`paging-cookie`, preservando `link-entity`), `layout.ts` (`layoutxml` → colunas com nome, alias, largura, ordem), `cells.ts` (tipo de célula a partir da metadata: choice, lookup, datetime, text, memo, money, boolean, readonly), `format.ts` (pt-BR, BRL, America/Sao_Paulo), `edit.ts` (validação por tipo, patch só do campo alterado, bind/limpeza de lookup, máquina de estados da célula), `columns.ts` (preferências locais de colunas por visão), `copy.ts` (texto do Copiar Serviços).
- `data/`: `queries.ts` (visões, localização rápida, atributos, execução de FetchXML, busca de lookups), `source.ts` (`Source` Dataverse e mock), `mock.ts` (3 visões, ~60 reservas, motoristas, veículos, clientes, pessoas).
- `useGeral.ts`: visão ativa, página, ordenação, busca, seleção, linhas e estados de célula.
- `components/`: `GeralToolbar`, `GeralTable` (cabeçalho ordenável, seleção, células), `Cell*` por tipo, `ColumnsMenu`, `GeralCards` + `GeralSheet` (mobile), `Dialogs` (Copiar, Desativar/Ativar), `EscalaFdsDrawer`.
- `geral.css` só com tokens `--bt-*`. Sem CSS de header próprio: `PageHeader` + `PageToolbar` do `@betinhos/ui`.
- `nav/menu.ts`: `{ kind: 'page', id: 'geral', label: 'Geral', page: 'geral' }` no lugar de `table('cr40f_reservadeveculos')`; `RouteLayout` roteia `page === 'geral'`.
- `@betinhos/dataverse`: `createMetadata` ganha `attributes(entity)` (tipo, rótulo, `IsValidForUpdate`, opções, `Targets`) e `PrimaryNameAttribute` em `EntityInfo`, se ainda não existirem.

### 3.1 `Source`

```ts
type Source = {
  mock: boolean
  views(): Promise<View[]>                       // sistema + pessoais, com fetchxml, layoutxml, isdefault, grupo
  quickFind(): Promise<string[]>                 // atributos de localização rápida
  attributes(): Promise<Map<string, AttributeInfo>>
  page(req: { fetchxml: string; page: number; cookie?: string; sort?: Sort; query?: string }): Promise<Page>
  update(id: string, patch: Row): Promise<void>
  clearLookup(id: string, attribute: string): Promise<void>
  setState(ids: string[], active: boolean): Promise<void>
  search(target: string, text: string): Promise<LookupOption[]>   // até 25, nome primário contém texto
  reload(id: string, columns: string[]): Promise<Row>             // relê a linha após gravar
  openForm(mode: 'create' | 'edit', id?: string): Promise<void>  // Formulário Geral; resolve ao fechar
  openVoucher(ids: string[]): void
  kv: KV
}
```

### 3.2 Execução de visão

1. Parse do `fetchxml` da visão; remove `count`/`page`/`paging-cookie` existentes; mantém `distinct`, `link-entity`, `filter` e `order`.
2. Ordenação: clique no cabeçalho substitui o `<order>` da entidade raiz pelo atributo clicado (asc → desc → ordem da visão). Colunas de `link-entity` ordenam pelo alias.
3. Busca: palavra-chave vira `<filter type="or">` com `like %texto%` nos campos de localização rápida que são texto; campos de lookup usam o atributo de nome via `link-entity` só quando a visão já o traz; demais são ignorados. Debounce 300 ms. Vazio remove o filtro.
4. Paginação: `count="50"`, `page="N"` e `paging-cookie` da resposta anterior (`@Microsoft.Dynamics.CRM.fetchxmlpagingcookie`). `@odata.count` quando a resposta trouxer; senão "Linhas 1–50" sem total.
5. Resposta: valores brutos + `@OData.Community.Display.V1.FormattedValue` (header `Prefer: odata.include-annotations="*"`), já usados por `formatted()` do pacote dataverse.

### 3.3 Edição

- Patch só do campo alterado. Lookup: `"<nav>@odata.bind": "/<set>(<id>)"`; limpar: `DELETE <set>(<id>)/<nav>/$ref`. Choice: número. Data/hora: ISO em UTC a partir do valor digitado em America/Sao_Paulo. Dinheiro: número com 2 casas. Sim/Não: boolean.
- Atualização otimista; após 2xx, `reload(id, colunas da visão)` e as células que mudaram além da editada (ex.: veículo após trocar motorista) recebem o mesmo "salvo" discreto.
- Erro: valor restaurado, estado `erro` com a mensagem do Dataverse resumida (`DataverseError.message`), "Tentar de novo" na tooltip.
- Trocar motorista dispara flows reais em DEV (avisos e Atribuir Veículo Automático), como no Resumo Operacional. A tela não bloqueia, só avisa no `title` do editor.

## 4. Tabela e células

- Colunas do `layoutxml` (ordem, largura em px → `minmax`), cabeçalho 36 px, 11 px/800, uppercase (§10.9). Primeira coluna é a do layout (ID na Agenda) e abre o Formulário Geral em edição.
- Caixa de seleção por linha e "selecionar página"; contagem na toolbar.
- Mostrar/ocultar/reordenar colunas por visão em `betinhos.geral.colunas.v1` (`{ [viewId]: { hidden: string[]; order: string[] } }`), validado campo a campo, com "Restaurar colunas da visão". Funciona sem `localStorage` (memória).
- Rodapé: "Linhas 1–50 de N" (ou sem N) e paginação. Linha 54–62 px, texto 12–13 px, hover só em `(hover: hover) and (pointer: fine)`.

| Tipo | Leitura | Edição |
|---|---|---|
| Choice | `StatusBadge` (status e faturamento, tom por valor) ou texto | `Select` no lugar, abre já focado, fecha ao escolher |
| Lookup | texto formatado; vazio "—" | `Select` pesquisável no servidor (`search`), com "Limpar" |
| Data e hora | `dd/mm/aaaa HH:mm` | `input type="datetime-local"`, fuso America/Sao_Paulo |
| Texto | 1 linha com reticências; `title` com o texto todo | `Input` |
| Texto longo | idem | `Textarea` de 3 linhas que cresce até 8 |
| Dinheiro | `R$ 1.234,00` | `Input inputMode="decimal"` com máscara BRL |
| Sim/Não | `Switch` | alterna direto, grava na hora |
| Só leitura | texto; voucher é link | cadeado discreto no hover, `aria-readonly` |

**Interação**: entrar em edição por duplo clique, Enter ou começar a digitar com a célula focada. Confirmar com Enter, Tab (próxima célula editável) ou clicar fora. Esc cancela e restaura. Setas navegam entre células (`role="grid"`, `aria-selected`, foco visível com o anel do DS). Nenhuma animação em ações de teclado.

**Feedback inline** (sempre ícone com rótulo acessível, nunca só cor):
1. Gravando: valor novo visível, `Spinner` 12 px no canto direito, célula bloqueada (`aria-busy`).
2. Salvo: ✓ em `--bt-success` surge (160 ms, `cubic-bezier(.23,1,.32,1)`) e some em 1,5 s; fundo pisca uma vez em `--bt-success-soft` (200 ms). Em `prefers-reduced-motion`, só o ícone.
3. Erro: borda esquerda 2 px `--bt-danger`, ⚠ no canto, `aria-describedby` com a mensagem; tooltip com "Tentar de novo". Persiste até gravar com sucesso ou atualizar.
4. Alterado por flow: células recarregadas que mudaram recebem o ✓ discreto.

## 5. Cabeçalho, toolbar e comandos

- `PageHeader`: eyebrow "Operacional", título "Geral", meta "N serviços" (quando houver total), ações **Atualizar** (secundária) e **Criar serviço** (primária). `useShellHeader` no celular com título e atualizar.
- `PageToolbar filters`: `Select` de visão (grupos "Visões do sistema" / "Minhas visões"), `SearchBox`, botão "Colunas", e, com seleção, o grupo: **Editar** (1 selecionado), **Gerar Voucher**, **Copiar Serviços**, **Desativar**/**Ativar** (conforme `statecode` dos selecionados; misto desabilita com motivo).
- `Menu` "⋮": **Funções Operacionais** (`#/new_telafuncoesoperacionais`), **Escala FDS** (`Drawer wide` com iframe de `cr40f_EscalaFDS.html`), **Contagem de Serviços** (`#/operacional`, modo motorista).
- **Criar/Editar**: dentro do model-driven, `navigateTo` com o contrato da §2 e recarga da página atual ao resolver; por URL direta, abre `/WebResources/new_formulario_geral.html?data=…` em nova aba e mostra "Atualizar" em destaque. Em mock, `Dialog` explicando que o formulário abre no Dataverse.
- **Gerar Voucher**: overlay próprio da tela (iframe `cr40f_VoucherConfirmacao.html?ids=<json>`), fecha por Esc, backdrop e `postMessage` igual ao comando atual.
- **Copiar Serviços**: mesmo bloco do script atual, campo a campo (Data, ID, Horário, Cliente, Receber ✓/✗/—, Trajeto, Passageiro, Local de saída, Destino, Obs ao motorista, Perfil do Passageiro), separado por linha em branco, ordenado por data; `Dialog` com prévia e "Copiar", toast de sucesso.
- **Desativar/Ativar**: `Dialog` de confirmação listando os IDs; `PATCH statecode/statuscode` por registro; resultado parcial reportado (quantos ok, quais falharam).
- Clicar na linha fora de célula só foca; seleção é pela caixa.

## 6. Mobile (≤ 820 px)

- Cards com ID, status, data/hora, cliente, motorista e trajeto. Toque abre `Sheet` com os campos editáveis da linha (um controle por campo, mesmo feedback por campo). Visão e busca na toolbar; comandos sobre selecionados em barra inferior fixa quando há seleção. 320 px sem rolagem horizontal.

## 7. Estados e erros

- Carregando: skeleton com as colunas da visão. Vazia: `EmptyState` "Nenhum serviço nesta visão", com "Limpar busca" quando houver busca.
- Visão que o servidor recusa: `Alert danger` com a mensagem e "Voltar para a Agenda"; a visão continua no seletor.
- Metadata indisponível: colunas em texto só leitura e `Alert` "Edição indisponível no momento".
- Coluna do layout ausente na metadata: rótulo = nome lógico, só leitura, sem derrubar a visão.
- Sem visões (erro em `savedqueries`): `Alert` com tentar de novo.

## 8. Testes e aceite

- Unitários: `fetch.ts` (ordem, busca, paginação, `link-entity` preservado, `count/page` antigos removidos), `layout.ts`, `cells.ts`, `format.ts`, `edit.ts` (patch mínimo, bind/limpeza de lookup, datas em fuso, estados da célula), `columns.ts` (validação e restauração), `copy.ts` (texto idêntico ao script). Teste de página com mock: trocar visão, ordenar, buscar, editar com sucesso e com erro.
- Aceite: em mock e em DEV a Agenda abre com as colunas da visão; trocar visão, ordenar, buscar e paginar funcionam no servidor; editar status, motorista, data, texto, dinheiro e Sim/Não grava e mostra ✓ na célula; erro mostra ⚠ e restaura; Criar/Editar abrem o Formulário Geral e recarregam ao fechar; Voucher, Copiar e Desativar funcionam com seleção; `pnpm typecheck` e `pnpm test` verdes; 320 px sem rolagem horizontal; versão `v0.0.x · dd/mm/aaaa HH:mm` visível em todos os estados.
- Publicação em DEV só com ok do Renan.
