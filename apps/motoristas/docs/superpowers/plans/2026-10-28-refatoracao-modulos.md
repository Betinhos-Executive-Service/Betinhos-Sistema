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

## Passo 5 — Núcleo do serviço (feito)
- `src/features/servicos` (início, agenda, busca, cartões), `historico`, `detalhe` (tela, campos, passageiros, escolha do carro, HTML/mídia/mapas do detalhe), `fotos` (captura, prévia, rascunhos de mídia), `checklist` (tela, cartões, regras, envio, CSS), `finalizar` (finalizar, cancelado no local, finalização de manutenção, observação organizada), `voucher` (voucher, assinatura) e `recibo` (tela, PDF, SVG, idioma). Todas com `manifesto.ts`; `src/app/features.ts` virou só a lista.
- `src/shared/ui/AgendaCard.tsx` e `src/shared/camera/` (restrições, erros, lanterna, orientação da foto).
- Pela porta (`useDados()`): no `App.tsx`, agenda, detalhe, visto, checklists, observação, finalizar, voucher e rascunho; no checklist, foto e conclusão; no recibo, registro, PDF e e-mail. O adaptador é estável, não entra em dependências de hooks.
- Prova extra: `verify-ux-flows` e `verify-checklist-send` com o mesmo resultado antes/depois.
- Ficam em `src/lib` até o passo 7 (compartilhados): `serviceVehicleInfleet*`, `useDitado`, `localWorkflow`, `appErrorLogger`, `currencyInput`, `buildStamp`, `pwa*`. Troca de veículo segue dentro do `dataverse.ts`.

## Passo 6 — App.tsx vira AppShell (em fatias)
Regra das fatias: cada bloco vira hook da feature chamado **na mesma posição** do bloco original (a ordem dos efeitos não muda); funções do `App` declaradas mais abaixo (`setToast`, `setCriticalError`...) entram no hook como funções intermediárias, avaliadas só quando o efeito roda. Prova por fatia: testes, `tsc`, build, 16 telas e `verify-ux-flows`/`verify-checklist-send` iguais ao `dist` da main.

- **6a (feito):** helpers de módulo saem para as features (`trocaErros`, `FlowProgressOverlay`, `toastTone`, `rotaInicial`, `rascunhos`, `envioMidia`, rascunhos vazios); hooks `useTermosMulta`, `useChecklists`, `useComunicados`, `useExpenseUploads` e `useMediaDraftState` (4 rascunhos de foto iguais viraram um hook). 3830 → 3371 linhas.
- **6b (feito):** `features/despesas/useExpenseFlow` (estado, fotos, leitura rápida, envio síncrono e assíncrono; chama o `useExpenseUploads`). Efeitos de dados de referência e clientes do recibo ficam no `App` para não mudar a ordem; o hook devolve os setters. `wait` em `shared/`. Novo roteiro `scripts/qa/verify-expense-quickread.cjs`. 3371 → 2904 linhas.
- **6c (feito):** `features/colisao/useCollisionFlow` e `features/manutencao/useMaintenanceRequestFlow` (estado, fotos e envio). A lista de veículos fica no `App` (usada por gastos, colisão e manutenção). Recebimento/QR foi para a 6d: os comprovantes ficam no rascunho de finalização e o "continuar" leva a voucher/finalizar. Extração feita com script (recorte por nome, parâmetros/retornos por análise de uso, funções declaradas depois da chamada embrulhadas). 2904 → 2574 linhas.
- **6d (feito):** `features/recebimento/useReceiveFlow` (comprovantes, QR pago e resumo, passo seguinte) e `features/finalizar/useFinalizeFlow` (rascunhos de voucher/observação, escolha do carro, finalizar, cancelar no local). O hook de finalizar é chamado na posição do último estado movido, porque depende de valores criados mais abaixo. Portão ganhou `verify-qr-charge` e `verify-receive-summary`. 2574 → 1975 linhas.
- **6d2:** carga e atualização da agenda (`resetLocalData`, `refreshLocal`, efeitos da carga inicial e deep links de serviço) → `features/servicos`.
- **6e (feito):** cada grupo de telas virou `src/features/<x>/rotas.tsx` (`rotasX(screen, props)`, 15 rotas); o `App` chama as rotas e faz `show(tela)`. Props tipadas como `ReturnType<typeof useX>` + extras tipados pelo type checker; o `App` guarda o objeto de cada hook e repassa com spread. Telas de grupos diferentes são exclusivas, então a ordem entre grupos não muda o resultado. 1740 → 1175 linhas.
- **6f (feito):** `show`/overlays viram o componente `src/app/AppShell.tsx`; efeitos transversais em `src/app/` (`useAvisos`, `useAvisosGlobais`, `useNavegacao`, `usePersistenciaRascunhos`, `useCarregarRascunhoMidia`, `useDadosFormularios`, `useEstadoInicial`, `resetDadosLocais`) e nas features (`useAutoRefreshAgenda`, `useFilaServicos`, `useMaintenanceFinalizePhoto`, `useReciboPersonalizado`, `useQrChargeSummary`, `useComunicadoDeepLink`, `useIdeasGateway`), cada um chamado na posição do bloco original. 1175 → 539 linhas.

## Passo 7 — Limpeza (feito)
- Os 43 reexports de `src/lib` e `src/data/mockData.ts` saíram; importadores (5 testes) apontam para o caminho real. `lib/dataverse.ts` deixou de reexportar o cliente, `DATAVERSE` e as ideias: 21 arquivos importam direto de `data/dataverse/cliente`, `data/dataverse/entidades` e `features/ideias/remoto`. Foram apagados também 13 arquivos-lixo em `src/lib` com nome terminado em U+F00D (CR do Windows), versionados no passo 4.
- `components/common` → `shared/ui`; `components/{icons,layout,navigation}` → `shared/ui/<sub>`; `AppErrorBoundary` e `ButtonPreviewScreen` → `src/app`; `appErrorLogger`, `buildStamp`, `currencyInput` e `useDitado` → `src/shared`. `photoOrientation` já estava em `shared/camera`; `mapLinks` fica em `features/detalhe` (só o detalhe usa). Sem `src/components/` nem `src/screens/`.
- `src/styles.css` fica na raiz: é a folha de entrada do build e importa o CSS das features, então em `shared/` inverteria a dependência.
- `tests/moduleExports.test.ts` passa a cobrir `src/shared`; snapshot atualizado de propósito (removidos os reexports e os módulos movidos).
- `AGENTS.md`, `system_architecture.md`, `CLAUDE.md` e skills `verificar-*` com os caminhos novos. O `graphify update .` fica para a máquina local (sem CLI na VM).
- Ainda em `src/lib`: `localWorkflow.ts`, `pwa.ts`/`pwaManifest.ts` e `serviceVehicleInfleet*.ts`.

## Passo 8 — `lib/dataverse.ts` dividido pelas features (feito)
- O arquivo (3.934 linhas) foi dividido por script (grafo de declarações com o compilador TypeScript): cada export foi para a feature que o usa (`features/<x>/remoto.ts`; agenda e trocas em `features/servicos/agendaRemota.ts` e `trocas.ts`) e os ajudantes usados por mais de uma feature para `data/dataverse/` (`flow.ts`, `arquivos.ts`, `metadados.ts`, `registros.ts`). Privados seguem o único módulo que os usa; o texto das declarações não mudou, só ganhou `export` quando outro módulo precisa.
- Sem ciclos entre módulos e sem `data/dataverse` importando feature. Os caches (`expenseReferenceData*`, modo de envio, URLs dos Flows, nomes de navegação) continuam com uma cópia só, no módulo das funções que os usam.
- Os 23 importadores em `src` (inclusive `porta.ts` e o adaptador), 8 testes e `scripts/audit-dataverse-selects.cjs` apontam para os módulos novos.

## Fora deste plano
Modo parceiro (parte 2), adaptador Worker + segundo build + Custom API com token (parte 3), troca da página do link (parte 4).
