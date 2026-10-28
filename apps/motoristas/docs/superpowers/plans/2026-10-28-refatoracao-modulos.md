# Plano: refatoração por funcionalidade + porta de dados

Spec: `docs/superpowers/specs/2026-10-28-refatoracao-modulos-design.md`. Um PR por passo, direto na `main`, merge de `origin/main` antes de abrir.

**Portão de cada passo (obrigatório):** `npm test` · `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` · `npm run build` · screenshots do mock da área (antes × depois) · `graphify affected` antes de mover · `qualidade-antes-do-pr` + `verificacao-manter`. Nunca `npm run push`/deploy.

**Regra de movimento:** mover arquivo = `git mv` + deixar no caminho antigo um reexport de 1 linha até o passo 7. Assim cada PR muda poucos imports e o diff mostra "renomeado" em vez de "apagado/criado".

## Passo 0 — Rede de segurança (feito)
- `tests/moduleExports.test.ts` + `tests/characterization/module-exports.json`: exports (inclusive tipos) de todos os `.ts` de `src/lib`, `src/app`, `src/data`. Ao mover, o caminho antigo precisa reexportar.
- `tests/hashRouteCharacterization.test.ts`: hash, parse, restore e fallback das 31 telas + aliases legados.
- `scripts/qa/screens-baseline.cjs`: 16 telas do mock por rota hash a partir do `dist/`, relógio congelado, comparação por hash do PNG (rodadas seguidas = idênticas).
- Store mock: coberto pelas screenshots; `loadRemoteStore` já tem testes com Xrm falso.

## Passo 1 — Esqueleto (feito)
- `src/data/porta.ts`: `PortaDados` com 20 operações do modo link (agenda, detalhe, visto, checklists, foto do checklist, observação, finalizar, voucher e rascunho, recibo, comunicados, ideias). Tipos via `typeof` das funções atuais, para não divergirem.
- `src/data/dataverse/adaptador.ts`: implementa a porta delegando 1:1 (teste garante que são as mesmas funções).
- `src/app/modo.ts` (`motorista | link`, sempre `motorista` por enquanto), `src/app/DataProvider.tsx` + `useDados()`, `main.tsx` injeta o adaptador Dataverse.
- `src/app/features.ts`: registro único de features com `liberadoLink` + `featuresDoModo`/`telasDoModo`. Cada item vira `features/<x>/manifesto.ts` quando a feature ganhar pasta (passos 3–5), em vez de 16 arquivos vazios agora.
- `src/data/worker/contrato.md`. Nenhuma tela usa `useDados()` ainda.

## Passo 2 — Cliente Dataverse (feito)
- `src/data/dataverse/cliente.ts`: detecção de runtime (Xrm da janela/parent, fetch na URL direta, mock em localhost), CRUD com log, `getDriverContext`/`getDriverCurrentVehicleId`, helpers de log e GUID, tipos `XrmLike`/`DataverseRecord`/`DriverContext`.
- `src/data/dataverse/entidades.ts`: `DATAVERSE` e mapas de entity set → nome lógico.
- `git mv` de `fetchWebApi`, `customApi`, `remoteReadBatch` para `src/data/dataverse/` e de `mockData` para `src/data/mock/`; caminhos antigos com reexport explícito (o snapshot de exports não mudou).
- `fieldLookup` fica: é regra de detalhe, vai para `shared/` no passo 7.

## Passo 3 — Features isoladas (feito)
- `src/features/comunicados/` (tela, card da agenda, regras/remoto, CSS), `src/features/termos/` (telas, selfie, regras/remoto, CSS), `src/features/ideias/` (tela, regras, `remoto.ts` saído do `dataverse.ts`), `src/features/meu-carro/` (tela, regras). Cada uma com `manifesto.ts` lido por `src/app/features.ts`.
- `SignaturePad` em `src/shared/ui/` (usado por comunicados e termos). `getCurrentUserId` foi para o cliente Dataverse.
- `App.tsx` carrega comunicados e ideias por `useDados()`.
- `lib/comunicados|termosMulta|ideas|myVehicle.ts` viram `export *` para o novo caminho; o teste de exports agora segue `export *` até o destino.
- Ficam para depois: remotos do "Meu carro" (`loadMyVehiclesRemote`, `setMyCurrentVehicleRemote`) dependem da resolução Infleet do serviço, migram junto do núcleo (passo 5). Termos importa `cleanGuid`/`validateSignature` de comunicados; vão para `shared/` no passo 7.

## Passo 4 — Features só do motorista (feito)
- `src/features/despesas/` (tela de gasto, leitura rápida do comprovante e telas de leitura/ilegível, overlay de envio, regras e envio assíncrono), `src/features/colisao/`, `src/features/recebimento/` (recebimento, cobrança por QR, conferência do comprovante), `src/features/manutencao/` (solicitar manutenção). Cada uma com `manifesto.ts`.
- Caminhos antigos de `src/lib` com `export *`.
- Leitura rápida do comprovante fica em despesas (dona); recebimento importa de lá.
- Ficam para o passo 5: `MaintenancePhotoPreviewScreen` (prévia genérica de foto, usada também pelo checklist) vai para "fotos"; troca de veículo não tem arquivo próprio (lógica no `dataverse.ts`) e segue com serviços/detalhe; `maintenanceFinalize` vai com finalizar.
- Remotos dessas features (`*ExpenseUpload*Remote`, `uploadCollisionPhotoRemote`, `createQrChargeRemote`...) seguem em `lib/dataverse.ts`; saem num passo próprio depois do 5, quando o arquivo for dividido por feature.
- Atenção: o script de mudança de pasta precisa reescrever imports de asset (svg/png); o `tsc` não pega, só o build.

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
