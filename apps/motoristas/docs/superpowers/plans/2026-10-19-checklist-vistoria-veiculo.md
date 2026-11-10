# Plano — Módulo Checklist de Vistoria de Veículo

## Contexto

Com os carros passando a ser controlados pela Infleet, as "trocas de carro" deixam de existir e o checklist não pode mais acontecer no ato da troca. O objetivo é uma **vistoria quinzenal por veículo**, feita no App Motoristas pelo motorista que estiver com o carro naquele momento (motorista resolvido **no servidor pela Infleet**), com **itens configuráveis** pela operação. Não existe reprovação: a operação apenas consulta e, se quiser, **solicita manualmente** um checklist extra, que aparece como mais uma pendência para o motorista. A gestão (modelos, pendências, solicitações, consulta de respostas e fotos) fica numa **tela web nova**, irmã da Tela Gestão de Comunicados.

Decisões do usuário: tipo = vistoria do veículo; periodicidade = quinzenal por veículo + solicitação manual; itens = modelos no Dataverse; tipos de item = **Foto obrigatória, Número (KM/combustível), Texto livre**; veículo/motorista = Infleet no servidor; sem bloqueio/reprovação.

Repo: `App Motoristas` (worktree `checklist-module-plan-baa2b4`, base `develop`). Gestão: novo repo irmão `C:\Users\mendo\Desktop\vscode\Tela Gestão de Checklists\`.

---

## Fase 0 — Descoberta (concluída) e "APIs permitidas"

Padrão a copiar = **módulo Comunicados** (pendência por motorista, Custom API, push, gestão irmã). Fotos = **colisão v2**.

| Necessidade | Reusar (fonte) |
|---|---|
| Custom API unbound no app | `executeComunicadoAction` — `src/lib/comunicados.ts:396-436` (params sempre `Edm.String`, `structuralProperty: 1`, `execute.bind(online)`) |
| Mock local | `isMockComunicados`, `localMockRequest`, `mockRequest` — `src/lib/comunicados.ts:43-154` |
| Paginação | `allRows` — `src/lib/comunicados.ts:286-297` |
| Leitura/escrita Dataverse | `retrieveMultiple` (417), `retrieveOne` (460), `createOne` (514), `updateOne` (487) — `src/lib/dataverse.ts`; registrar novas tabelas em `DATAVERSE` (179-204) **e** `ENTITY_SET_TO_ENTITY_NAME` (210-237) |
| Motorista atual | `getDriverContext()` — `src/lib/dataverse.ts:568` |
| Upload de foto | `uploadCollisionPhotoRemote` — `src/lib/dataverse.ts:1783-1836` (Flow `new_FlowURLFlowSalvarArquivosOnedrive` via `runHttpFlow` 3522 + linha em tabela de anexo) |
| Câmera / prévia | `MediaCaptureScreen` (prop `title`), `MaintenancePhotoPreviewScreen` (`title`, `prompt`) |
| Rascunho persistente | `saveMediaDraft/loadMediaDraft/clearMediaDraft` com chave própria — `src/lib/mediaDraftStore.ts` (limite 25 MB/registro) |
| Form UI | `FormFields.tsx` (`TextInputField`, `TextAreaField`), `ActionButton`, `FormMenu`, `AppShell` |
| Lista/detalhe/sucesso | `ComunicadosScreen.tsx:56-215`; card `ComunicadoAgendaCard.tsx`; destaque em `ServicesScreen.tsx:19-51` |
| Navegação | `src/types.ts:4` (`Screen`), `src/app/navigation.ts` (`SCREEN_HASH_PATHS`, aliases, `SCREEN_DEPTH`, `isListScreen` 247, `shouldAutoRefreshScreen` 263), `App.tsx` `navigateFromInitial` 1702-1711, tile em `InitialScreen.tsx:30-38` |
| Deep link do push | `bootstrap.ts` `readLaunchParam` 44-49; `webresources/new_appmotoristas_push_redirect.js` `ROUTES` 12-15 |
| Schema idempotente | `scripts/provision-comunicados.ps1` (helpers `Invoke-Dv`, `Ensure-Table/Column/Relationship/Key/Api`, `Ensure-HeaderGuard`) |
| Plugin | `plugins/DriverRecordSharing/ComunicadoCommandPlugin.cs` (`RecipientForCaller` 98-118, `InputGuid`, serviços `caller`/`system`); testes xUnit `ComunicadoCommandPluginTests.cs` (`FakeService`) |
| Push | `scripts/provision-comunicados-push-flow.ps1` (trigger em `pushstatus = Pendente`, `SendPushNotificationV2` para `new_AppMotoristasv2`) |
| Papel | `scripts/grant-comunicados-role.ps1` (Basic read em `Acesso-Motoristas`) |
| Infleet | GraphQL `https://api.infleet.com.br/v1/graphql`, Bearer token. Consultas reais (de `Skill Agendamento/infleet-mcp/lib.mjs` e `schema.json`): `listDriversPaginated(filters, limit, offset){ id name active cnh vehicle { plate displayName } }`, `getDriverAtByVehicleId(vehicleId, atTime){ id name cnh }`, `getVehicle(id){ plate odometer }` |
| Gestão web | Copiar estrutura de `Tela Gestão de Comunicados` (esbuild + React, `src/lib/dataverse.ts` shim, `scripts/sync-shared.cjs`, `scripts/mock-api.cjs`, `push-dev.ps1`, `add-gestao-comunicados-to-app.ps1`) |

**Anti-padrões:** não chamar a Infleet do navegador (token exposto); não enviar `Edm.Guid` em Custom API; não gravar respostas/conclusão direto do cliente (só via Custom API); não usar `new_possedeveiculo`/`cr40f_veiculoatual` como fonte do vínculo (trocas acabam); não inventar campos de `cr40f_veiculos` — conferir metadata antes (Dataverse MCP falhou nesta sessão).

**Descoberta da Fase 1 (19/10/2026, DEV):** a Infleet **já é sincronizada** no Dataverse por Flows ativos: `Infleet - Sincronizar carro atual dos motoristas` (a cada 5 min, Custom API `new_SincronizarVeiculoAtual`, grava `cr40f_funcionarios.cr40f_veiculoatual`, `new_veiculoatualdesde`, `new_infleetdriverid`, `new_origemveiculoatual`) e `Infleet - Sincronizar hodômetro` (a cada 6 h, grava `cr40f_veiculos.cr40f_hodometro`/`cr40f_hodometroem`). Veículo tem `new_infleetvehicleid`. Por isso **não há chamada nova à Infleet nem token**: a atribuição usa esse vínculo dentro do plugin. `cr40f_cnh` é Integer (não serve para casamento). Choices: `cr40f_statusdoveiculo` 202410001=Ativo; `new_categoriadoveiculo` 100000000=Próprio.

---

## Modelo de dados (prefixo `new_`, solução `AppBetinhos`)

- **`new_checklistmodelo`** (Org): nome, ativo, `new_padraoquinzenal` (bool — modelo usado pela rotina), `new_periodicidadedias` (int, padrão 15).
- **`new_checklistmodeloitem`** (Org): lookup modelo, `new_ordem`, `new_rotulo`, `new_instrucao`, `new_tipo` (choice: Foto 100000000 / Número 100000001 / Texto 100000002), `new_obrigatorio`, `new_unidade` (ex.: "km", "%").
- **`new_checklistveiculo`** (UserOwned — dono = systemuser do motorista, igual ao destinatário de comunicado): lookup veículo (`cr40f_veiculos`), lookup motorista (`cr40f_funcionarios`), lookup modelo, `new_itensjson` (cópia imutável dos itens no momento da criação), `new_origem` (Quinzenal/Manual), `new_estado` (Aguardando motorista / Pendente / Concluído / Cancelado), `new_solicitadoem`, `new_solicitadopor`, `new_concluidoem`, `new_respostasjson`, `new_atribuidoem`, `new_odometroinfleet`, `new_erroatribuicao`, `new_canceladoem`, `new_motivocancelamento`, `new_pushstatus`/`new_pusherro`, `new_chaveunica` (veículo + data de referência, evita duplicata da rotina).
- **`new_checklistveiculofoto`** (UserOwned): lookup checklist, `new_itemchave`, `new_ordem`, `new_link`, `new_caminho`, `new_nomearquivo` (espelha `cr40f_anexocolisao_v2`).

## Fluxo

1. **Rotina quinzenal** (Flow agendado diário 06:30 America/Sao_Paulo chama `new_ProcessarChecklistsVeiculos`): para cada veículo próprio ativo sem checklist concluído há ≥ `periodicidadedias` e sem pendente aberto, cria `new_checklistveiculo` em **Aguardando motorista** com o modelo padrão.
2. **Solicitação manual** (Gestão): escolhe veículo (+ modelo opcional) → Custom API `new_SolicitarChecklistVeiculo` cria o mesmo registro com origem Manual.
3. **Atribuição** (no plugin, sem Flow): responsável = funcionário ativo cujo `cr40f_veiculoatual` (sincronizado da Infleet) é o veículo; com dois, vale o `new_veiculoatualdesde` mais recente; empate, sem motorista ou sem usuário Microsoft → `new_erroatribuicao` visível na Gestão. Roda na solicitação manual, na rotina diária (novos e abertos; troca de motorista reatribui e gera novo push) e no botão "Tentar novamente" (`new_ReatribuirChecklistVeiculo`). Hodômetro do veículo vai para `new_odometroinfleet`.
4. **Push** (Flow cópia do de comunicados) → abre o app em `checklistId=<id>`.
5. **App**: tile "Checklist" + destaque em Serviços enquanto pendente → tela do checklist renderiza itens de `new_itensjson` (Foto → câmera; Número → campo numérico com KM pré-preenchido do odômetro; Texto → área de texto) → rascunho salvo no IndexedDB (`checklist:<id>`) → envio: sobe fotos via Flow existente → Custom API `new_ConcluirChecklistVeiculo(checklistId, respostasJson)`; plugin valida dono/motorista (`RecipientForCaller`), obrigatórios e links, cria as linhas de foto e conclui. Sem reprovação.

---

## Fase 1 — Schema, plugin e Custom APIs (App Motoristas)

- Copiar `scripts/provision-comunicados.ps1` → `scripts/provision-checklists.ps1` (mesmos helpers; tabelas/colunas/chave acima; Custom APIs `new_SolicitarChecklistVeiculo`, `new_ProcessarChecklistsVeiculos`, `new_ReatribuirChecklistVeiculo`, `new_ConcluirChecklistVeiculo`, `new_CancelarChecklistVeiculo`, `new_ReenviarPushChecklist`; guard de Update/Delete em `new_checklistveiculo` concluído).
- Criar `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs` copiando a estrutura de `ComunicadoCommandPlugin.cs` (dispatch por `MessageName`, `InputGuid`, `RecipientForCaller`, exceções amigáveis); testes em `ChecklistCommandPluginTests.cs` com `FakeService`.
- Copiar `grant-comunicados-role.ps1` → `grant-checklists-role.ps1` (Basic read em checklist e foto para `Acesso-Motoristas`); preflight/smoke copiando `preflight-comunicados-dev.ps1` e `smoke-comunicados-dev.ps1`.
- Incluir provisionamento e nomes das Custom APIs em `scripts/push-dev.ps1` (lista da linha 82) e as tabelas em `scripts/schema-index.cjs`.
- **Verificação:** `dotnet test` do plugin; preflight read-only em DEV; `provision-checklists.ps1` dry-run e depois `-Apply` em DEV; smoke com `Guid.Empty` retorna mensagem do plugin; metadata e pertencimento à solução conferidos.

## Fase 2 — Flows (DEV)

- `scripts/provision-checklist-flows.ps1` copiando `provision-comunicados-push-flow.ps1` (criação via tabela `workflows`, clonagem de connection references, ativação e verificação) para 2 Flows: **Checklists | Rotina diária** (Recurrence 06:30 America/Sao_Paulo → `PerformUnboundAction new_ProcessarChecklistsVeiculos`, mesmo conector do Flow Infleet de carro atual) e **Push checklist** (trigger em `new_pushstatus = Pendente`).
- Adicionar rota `new_checklistveiculo → checklistId` em `webresources/new_appmotoristas_push_redirect.js` e anexar o OnLoad ao form leve da tabela (`provision-push-redirect.ps1`).
- **Verificação:** execução manual da rotina cria checklist só para veículo próprio ativo devido; atribuição bate com `cr40f_veiculoatual` (conferir com MCP Infleet `motorista_no_horario`); veículo sem motorista grava `new_erroatribuicao`; push chega e abre o checklist.

## Fase 3 — App Motoristas (UI do motorista)

- Ler `DESIGN_SYSTEM.md` + `design-tokens.json` do diretório pai antes de qualquer UI.
- `src/lib/checklists.ts` copiando a forma de `comunicados.ts`: tipos, constantes de choice, mock local, `mapChecklist`, `loadDriverChecklists`, `loadDriverChecklist(id)`, `isChecklistPending`, `validateChecklistAnswers` (puro), `concluirChecklist` via helper de Custom API copiado de `executeComunicadoAction`.
- Upload: `uploadChecklistPhotoRemote` em `dataverse.ts` copiando `uploadCollisionPhotoRemote` (pasta `Checklists/{DEV/}{placa}/{data}`), retornando só o link (o plugin cria a linha).
- `src/screens/ChecklistsScreen.tsx` (lista pendentes/concluídos + detalhe com itens), `src/components/checklists/ChecklistAgendaCard.tsx`; screens `checklists`, `fotoChecklist`, `previewFotoChecklist` em `types.ts` e `navigation.ts`; tile em `InitialScreen.tsx` com badge; destaque em `ServicesScreen.tsx`; recarga no ciclo de `refreshLocal`; deep link `checklistId` em `bootstrap.ts`.
- Rascunho por checklist no IndexedDB (`checklist:<id>`), restaurado ao reabrir; fotos comprimidas antes de salvar para respeitar 25 MB.
- Versão de build incrementada e exibida no rodapé (padrão já existente).
- **Verificação:** `npm test` (novo `tests/checklists.test.ts`: mapeamento, validação, pendência, falha de Custom API, fluxo mock local); `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`; `npm run dev` + `ux-audit` modo Fluxo no mock (abrir pendência, tirar foto, fechar app no meio, retomar, enviar); depois `npm run push` em DEV e teste autenticado no dispositivo, conferindo versão no rodapé.

## Fase 4 — Tela Gestão de Checklists (repo irmão novo)

- Criar `Tela Gestão de Checklists` copiando o esqueleto de `Tela Gestão de Comunicados` (build esbuild, shim `dataverse.ts` **com `retrieveOne`**, `sync-shared.cjs` apontando para `src/lib/checklists.ts`, `mock-api.cjs`, `push-dev.ps1`, inclusão no sitemap do App Betinhos Interno copiando `add-gestao-comunicados-to-app.ps1`).
- Abas: **Veículos** (placa, motorista Infleet, último checklist, próximo vencimento, pendência, erro de atribuição, botão "Solicitar checklist"/"Tentar novamente"), **Checklists** (filtros por estado/veículo/período; detalhe com respostas e fotos via links), **Modelos** (CRUD de modelo e itens com ordem, tipo, obrigatório; marcar padrão quinzenal).
- **Verificação:** `pnpm`/scripts do projeto; mock local; publicação em DEV; fluxo autenticado: criar modelo → solicitar manual → motorista conclui no app → respostas e fotos visíveis na gestão; `ux-audit` modo Fluxo.

## Fase 5 — Verificação final e docs

- `docs/plano-checklist-vistoria.md` copiando a estrutura de `docs/plano-comunicados-motoristas.md` (regras, dados, segurança, ordem de publicação).
- Grep de anti-padrões: nenhum `infleet` em `src/`; nenhum `Edm.Guid` novo; nenhum `createOne` em tabelas de checklist pelo app.
- E2E DEV: rotina → atribuição → push → conclusão → gestão; motorista sem papel não lê checklist de outro; concluído não aceita edição.
- PROD somente após aprovação explícita.

## Riscos

- **Vínculo Infleet desatualizado ou compartilhado** (2 motoristas no mesmo carro hoje em DEV): regra do mais recente + erro visível e reatribuição diária.
- **Dependência da sincronização Infleet existente**: se os Flows Infleet pararem, a atribuição fica com erro visível em vez de errar o motorista.
- **Fotos grandes/rede ruim**: rascunho em IndexedDB + upload por item com repetição; conclusão só após todos os links.
- **Drift do código compartilhado** com a gestão: `sync-shared --check` no build.
