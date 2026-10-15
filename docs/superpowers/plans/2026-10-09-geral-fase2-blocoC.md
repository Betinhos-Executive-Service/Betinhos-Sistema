# Geral fase 2 — Bloco C (comandos restantes e painel de contagem) — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`).

**Objetivo:** paridade com a barra de comandos nativa: Auditoria, Gerar OP, Disparar, Registrar Erro, painel "Serviços por motorista" (Contagem de Serviços). Compartilhar já foi entregue no Bloco B.

**Spec:** `docs/superpowers/specs/2026-10-08-geral-fase2-design.md`, Bloco C. **Base:** HEAD `63a4029`. Fonte dos comportamentos: scripts nativos em `C:\Users\mendo\Desktop\vscode\Dashboard Betinhos\_pac-backup\AppBetinhos-before-infleet\WebResources\` (`new_auditoriaacessar…`, `cr40f_Flow_Gerar_OP…`, `new_programarRegistrosjs…`, `Script_abrir_erro_operacional_reserva…`) e `C:\Users\mendo\Desktop\vscode\Aba Lateral Serviços por Motorista\AbaLateralServicosPorMotorista.js`.

## Restrições globais
As de sempre (tokens `--bt-*`, sem gradiente, hover só em ponteiro fino, sem `transition: all`, pt-BR, botões com verbo, status nunca só por cor, 44 px no celular, modal com alteração pede "Descartar alterações?", `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, testes por arquivo, `pnpm typecheck`). Nada fixo de entity set/nav/URL de flow fora do mock: a URL do flow vem da variável de ambiente. PROD somente leitura; nenhuma chamada real nesta fase (host falso + mock). Só `apps/shell/src/pages/geral/**`.

## Mapa de arquivos
```
data/source.ts + queries.ts   openAuditoria(ids), flowUrl(schema), triggerFlow(url, body), programar(ids), openErroOperacional(id), contagem(dia) + motoristas(); mock de tudo
domain/commands.ts            regras puras: opCandidates(rows) (quem já tem OP), programarPayload, contagem: agrupar/cores por desvio da média, janela do dia em SP
components/AuditoriaOverlay.tsx  overlay com iframe (igual ao voucher) fora do model-driven
components/Dialogs.tsx        GerarOpDialog, DispararDialog
components/ContagemDrawer.tsx  painel "Serviços por motorista"
GeralPage.tsx / GeralToolbar.tsx  comandos no menu "Mais ações" e no grupo de seleção
```

---

### Tarefa C1: domínio e fonte dos comandos

**Arquivos:** criar `domain/commands.ts` (+ test); modificar `data/queries.ts`, `data/source.ts`, `data/mock.ts`, `data/data.test.ts`.

**Interfaces:**
- `domain/commands.ts`:
  - `type OpSplit = { ok: Row[]; comOp: Row[] }`; `splitOp(rows: Row[]): OpSplit` — `comOp` quando `_cr40f_financeiro_value` ou `_cr40f_op_value` (ou `cr40f_financeiro`/`cr40f_op`) é truthy.
  - `PROGRAMADO = 202410005`; `programarPatch = () => ({ cr40f_status: PROGRAMADO, new_foiprogramado: true })`.
  - `dayWindow(day: 'YYYY-MM-DD'): { start: string; end: string }` — ISO UTC do dia em America/Sao_Paulo (00:00 local = `T03:00:00Z`) até +24 h.
  - `type Motorista = { id: string; nome: string }`; `type Contagem = { motorista: Motorista; total: number; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }`; `contar(reservas: Row[], motoristas: Motorista[], excluidos: Set<string>): { linhas: Contagem[]; media: number; total: number }` — média só entre motoristas com serviço e não excluídos; tom: 0 → neutral; ratio ≤ 0,6 → success; ≤ 1,2 → warning (amarelo); ≤ 1,8 → info? **Não**: use `warning` para ≤ 1,2 e `danger` acima de 1,8; para 1,2–1,8 use `warning` com rótulo "acima da média" (o DS só tem 5 tons; o número é sempre exibido). Ordenar por total desc, depois nome.
  - `auditoriaData(ids, entitySet, orgUrl)` → `{ version: '7.0.0', orgUrl, entityName: ENTITY, entitySetName, validIds }`.
- `data/queries.ts`: `envVarPath(schema)` → `environmentvariablevalues?$select=value&$expand=EnvironmentVariableDefinitionId($select=schemaname)&$filter=EnvironmentVariableDefinitionId/schemaname eq '<schema>'`; `envVarDefaultPath(schema)` → `environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq '<schema>'`; `contagemPath(set, start, end)` → `${set}?$select=cr40f_reservadeveculosid,_cr40f_motorista_value,cr40f_dataehorriodesada,cr40f_trajeto&$filter=_cr40f_motorista_value ne null and cr40f_dataehorriodesada ge <start> and cr40f_dataehorriodesada lt <end>&$orderby=cr40f_dataehorriodesada asc`; `motoristasPath(set)` → `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido&$filter=statecode eq 0 and contains(cr40f_funcao,'otorista')&$orderby=cr40f_nomecompleto asc` (conferir: `cr40f_funcao` é choice → use o filtro do Operacional: `apps/shell/src/pages/operacional/data/queries.ts` já lista funcionários e filtra motoristas no cliente por valor formatado; reutilize essa abordagem).
- `Source`:
  - `flowUrl(schema: string): Promise<string | null>` (valor, depois default; mock: `'https://flow.mock/op'`).
  - `triggerFlow(url, body: unknown): Promise<{ status: number }>` via `fetch` POST JSON (não `client.request`, pois é outro host); mock: resolve `{ status: 202 }` depois de 300 ms.
  - `programar(ids): Promise<{ ok: string[]; failed: { id; message }[] }>` com `allSettled` de `update(set, id, programarPatch())`; mock: atualiza status/anotação; falha se `cr40f_id === 'OS-1013'`.
  - `openAuditoria(ids): Promise<'closed' | 'external' | 'mock'>` — dentro do model-driven `navigateTo({ pageType: 'webresource', webresourceName: 'new_betinhos_AuditoriaViewer', data: JSON.stringify(auditoriaData(...)) }, { target: 2, width: { value: 92, unit: '%' }, height: { value: 88, unit: '%' }, position: 1 })`; fora: devolve `'external'` e a página abre `AuditoriaOverlay` com `auditoriaUrl(ids)`; `auditoriaUrl(ids): string | null` = `${clientUrl}/WebResources/new_betinhos_AuditoriaViewer?data=<encoded json>` (mock null).
  - `openErroOperacional(id): Promise<'closed' | 'external' | 'mock'>` — `navigateTo({ pageType: 'webresource', webresourceName: 'new_gestao_erros_operacionais.html', data: 'reservaId=' + id }, { target: 1 })`; fora: `location.hash = hrefFor('new_gestao_erros_operacionais.html')`? Não existe item com query no shell → `window.open(${clientUrl}/WebResources/new_gestao_erros_operacionais.html?data=reservaId%3D<id>)` e `'external'`.
  - `contagem(day): Promise<{ reservas: Row[]; motoristas: Motorista[] }>`; mock a partir das 220 linhas e dos 4 motoristas.
- [ ] Testes: `splitOp`, `programarPatch`, `dayWindow` (fronteiras), `contar` (média, tons, excluídos, ordenação), `auditoriaData`; `data.test`: caminhos de env var e contagem, `flowUrl` valor→default→null, `programar` parcial no mock, `triggerFlow` mock. Commit "Geral: domínio e fonte dos comandos Auditoria, Gerar OP, Disparar, Registrar Erro e contagem por motorista".

### Tarefa C2: comandos na barra (Auditoria, Gerar OP, Disparar, Registrar Erro)

**Arquivos:** criar `components/AuditoriaOverlay.tsx`; modificar `components/Dialogs.tsx`, `GeralPage.tsx`, `GeralToolbar.tsx`, `geral.css`, `GeralPage.test.tsx`.

- Menu "Mais ações" ganha **Auditoria** (sempre; com seleção envia os ids) e **Registrar Erro** (`aria-disabled` com "Selecione exatamente um serviço." quando ≠ 1). Grupo de comandos de seleção ganha **Gerar OP** e **Disparar** (compact/touch como os demais; inertes sem seleção com o mesmo padrão `aria-disabled` + motivo).
- **Gerar OP**: `splitOp(linhas selecionadas)`; todos com OP → toast info "Todos os serviços selecionados já possuem OP."; parcial → `GerarOpDialog` "Serviços com OP existente" listando `cr40f_id` dos que ficam de fora e "Criar OP para N serviço(s) restante(s)?" com "Cancelar"/"Sim, continuar"; nenhum com OP → confirmação simples "Criar OP para N serviço(s)?". Ao confirmar: `flowUrl('new_FlowUrlCriarOP')` (null → `Alert danger` "Variável de ambiente new_FlowUrlCriarOP não configurada."), `triggerFlow(url, { guids: ids.join(',') })`; 200/202 → toast "OP criada para N serviço(s)." + `refresh()`; outro → `Alert danger` "Erro ao acionar o flow (status X)". Botão com `loading` durante a chamada; o diálogo não fecha enquanto carrega.
- **Disparar**: `DispararDialog` "Marcar N serviço(s) como Programado?" com aviso "Serviços sem motorista são recusados pelo servidor." → `programar(ids)` → toast "N serviço(s) programado(s)." ou parcial "X de N programados; falharam: ids. erro" + `refresh()` + `clearSelection()`.
- **Auditoria**: `openAuditoria(ids)`; `'external'` → `AuditoriaOverlay` (mesmo padrão do `VoucherOverlay`, `aria-label="Auditoria"`, 92%×88%, Esc/backdrop fecham); `'mock'` → toast info "A auditoria abre dentro do Dataverse.".
- **Registrar Erro**: `openErroOperacional(id)`; mock → toast info.
- [ ] Testes (mock): Gerar OP com um dos selecionados com OP (mock marca OS-1004 com `_cr40f_financeiro_value`) mostra o diálogo parcial e, ao confirmar, toast de sucesso; Disparar com OS-1013 na seleção reporta parcial; Auditoria e Registrar Erro em mock mostram os toasts; Registrar Erro inerte com 2 selecionados. Commit "Geral: comandos Auditoria, Gerar OP, Disparar e Registrar Erro".

### Tarefa C3: painel "Serviços por motorista"

**Arquivos:** criar `components/ContagemDrawer.tsx` (+ test); modificar `GeralPage.tsx`, `geral.css`.

- "Contagem de Serviços" no menu "Mais ações" abre `Drawer` (default) "Serviços por motorista", eyebrow com a data; cabeçalho com ◀ "Hoje" ▶ e "Atualizado às HH:mm"; dia inicial = dia do filtro ativo de `cr40f_dataehorriodesada` (filtro `today`/`tomorrow`/`range.from`) ou hoje.
- Lista: um item por motorista (apelido ou nome) com `StatusBadge` do total (tom de `contar`), botão expandir mostrando hora + trajeto (carrega da `reservas` já buscada), checkbox "Excluir da média" (persistido em `betinhos.geral.contagem.excluidos.v1`), rodapé "Total — dd/mm/aaaa: N" e a média.
- Atualiza a cada 60 s enquanto aberto (pausa com `document.hidden`); botão "Atualizar".
- Celular: `Sheet`.
- [ ] Testes: componente com dados fixos (tons, excluídos recalculam a média, navegação de dia chama `contagem` com a janela certa, expandir mostra trajetos); página: abre pelo menu e mostra motoristas do mock. Commit "Geral: painel Serviços por motorista (contagem do dia por motorista)".

### Tarefa C4: verificação no navegador
- [ ] Mock: Gerar OP parcial → confirmar → toast; Disparar parcial; Auditoria/Registrar Erro toasts; painel de contagem com dia anterior/seguinte, excluir motorista, expandir; 375 px. Suíte completa verde. Ledger.
