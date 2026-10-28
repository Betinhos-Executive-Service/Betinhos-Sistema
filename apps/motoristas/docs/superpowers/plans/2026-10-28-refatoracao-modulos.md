# Plano: refatoração por funcionalidade + porta de dados

Spec: `docs/superpowers/specs/2026-10-28-refatoracao-modulos-design.md`. Um PR por passo, direto na `main`, merge de `origin/main` antes de abrir.

**Portão de cada passo (obrigatório):** `npm test` · `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` · `npm run build` · screenshots do mock da área (antes × depois) · `graphify affected` antes de mover · `qualidade-antes-do-pr` + `verificacao-manter`. Nunca `npm run push`/deploy.

**Regra de movimento:** mover arquivo = `git mv` + deixar no caminho antigo um reexport de 1 linha até o passo 7. Assim cada PR muda poucos imports e o diff mostra "renomeado" em vez de "apagado/criado".

## Passo 0 — Rede de segurança (feito)
- `tests/moduleExports.test.ts` + `tests/characterization/module-exports.json`: exports (inclusive tipos) de todos os `.ts` de `src/lib`, `src/app`, `src/data`. Ao mover, o caminho antigo precisa reexportar.
- `tests/hashRouteCharacterization.test.ts`: hash, parse, restore e fallback das 31 telas + aliases legados.
- `scripts/qa/screens-baseline.cjs`: 16 telas do mock por rota hash a partir do `dist/`, relógio congelado, comparação por hash do PNG (rodadas seguidas = idênticas).
- Store mock: coberto pelas screenshots; `loadRemoteStore` já tem testes com Xrm falso.

## Passo 1 — Esqueleto (sem uso ainda)
- `src/data/porta.ts`: tipo `PortaDados` com as operações do modo link: `carregarAgenda`, `carregarDetalhe`, `marcarVisto`, `enviarFotoChecklist`, `salvarChecklist`, `salvarObservacao`, `finalizarServico`, `salvarVoucher`, `salvarRascunhoVoucher`, `gerarRecibo` (create + PDF + e-mail), `carregarComunicados`, `carregarIdeias`, `criarIdeia`. Assinaturas copiadas das funções atuais, sem mudar formato.
- `src/data/dataverse/adaptador.ts`: implementa `PortaDados` delegando 1:1 para `lib/dataverse.ts` etc.
- `src/app/modo.ts`: `type Modo = "motorista" | "link"`; `detectarModo()` retorna sempre `"motorista"` agora.
- `src/app/DataProvider.tsx` + `useDados()`; `main.tsx` envolve `<App/>` com o adaptador Dataverse.
- `src/features/<x>/manifesto.ts` para as 16 features + `src/app/features.ts` (registro) + `featuresDoModo(modo)`.
- `src/data/worker/contrato.md`: rotas/payloads esperados, só texto.
- Testes: `featuresDoModo("link")` = lista exata da spec; adaptador expõe todas as chaves de `PortaDados`.
- Pronto quando: build idêntico em comportamento (nada chama `useDados` ainda).

## Passo 2 — Cliente Dataverse
- `git mv` do núcleo HTTP para `src/data/dataverse/cliente.ts`: `isDataverseHostRuntime`, `isStandaloneWebResourceRuntime`, `hasDataverseRuntime`, `retrieveMultiple`, `retrieveOne`, `createOne`, `updateOne`, `deleteOne`, `getDriverContext`, `getDriverCurrentVehicleId` (+ `fetchWebApi.ts`, `customApi.ts`, `remoteReadBatch.ts`, `fieldLookup.ts`).
- `lib/dataverse.ts` passa a importar e reexportar.
- `mockData.ts` → `src/data/mock/`.

## Passo 3 — Features isoladas (aprende o padrão)
Uma por commit, mesmo PR: comunicados, ideias, termos, meu-carro. Para cada: tela(s) de `screens/` + componentes de `components/<x>/` + `lib/<x>.ts` + funções `*Remote` dela em `dataverse.ts` → `features/<x>/` (funções remotas em `features/<x>/remoto.ts`). Comunicados e ideias passam a usar `useDados()`.

## Passo 4 — Features só do motorista
despesas (`expenses*`, `expenseUpload*`), colisão, recebimento (Receive, QrCharge, receiveProofCheck, qrCharge*), manutenção (MaintenanceRequest/PhotoPreview, maintenanceFinalize), troca de veículo (`*Exchange*`). Continuam chamando o Dataverse direto (sem porta). Um PR por feature se o diff passar de ~800 linhas.

## Passo 5 — Núcleo do serviço (passa pela porta)
Ordem: servicos (ServicesScreen, InitialScreen, agendaVisibility, useAgendaSearch) → detalhe (DetailsScreen, detailHtml, detailMedia, passengerContact) → fotos (MediaCaptureScreen, câmera* → `shared/camera/`, mediaDraft*) → checklist → finalizar (FinalizeScreen, observacaoOrganizada, LocalCancel, Signature) → voucher → recibo (Receipt*, receipt*, personalReceipt). Cada chamada de dados no caminho do modo link troca para `useDados()`. Um PR por feature.

## Passo 6 — App.tsx vira AppShell
- Extrair estado por feature em hooks (`useChecklistFlow`, `useFinalizeFlow`, `useReceiptFlow`, `useMediaCapture`...) dentro de cada `features/<x>/`.
- `src/app/AppShell.tsx` com roteamento de tela; filtro de telas por `featuresDoModo(modo)`.
- `App.tsx` < 600 linhas. Teste de caracterização de navegação (passo 0) continua verde.

## Passo 7 — Limpeza
- Remover reexports antigos (`lib/dataverse.ts`, `screens/`, `components/<x>/` vazios); atualizar imports.
- `shared/`: `components/common`, utilitários (currencyInput, mapLinks, buildStamp, appErrorLogger, photoOrientation), CSS.
- Atualizar `AGENTS.md`, `system_architecture.md` e caminhos nas skills `verificar-*`; `graphify update .`.

## Fora deste plano
Modo parceiro (parte 2), adaptador Worker + segundo build + Custom API com token (parte 3), troca da página do link (parte 4).
