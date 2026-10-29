# System Architecture

## Organização por funcionalidade

- `src/main.tsx` escolhe o adaptador de dados e monta o `DataProvider` (`src/app/DataProvider.tsx`); as telas pedem dados por `useDados()`.
- `src/App.tsx` é só composição: chama os hooks de cada feature na ordem fixa dos efeitos e passa a tela da vez para `src/app/AppShell.tsx` (animação de troca, toast, carregamento, progresso de envio, escolha do carro, erro crítico e selo de build).
- `src/app/` guarda o que atravessa as features: abertura (`bootstrap.ts`, `useEstadoInicial.ts`, `rotaInicial.ts`), navegação hash e Voltar do celular (`navigation.ts`, `useNavegacao.ts`, `backGuard.ts`), avisos (`useAvisos.ts`, `useAvisosGlobais.ts`), rascunhos de mídia e voucher (`usePersistenciaRascunhos.ts`, `useCarregarRascunhoMidia.ts`), dados dos formulários (`useDadosFormularios.ts`), `resetDadosLocais.ts`, modo de execução (`modo.ts`) e registro de features (`features.ts`).
- `src/features/<x>/` reúne telas, componentes, regras puras, hooks de fluxo (`useXFlow`), rotas (`rotas.tsx`, `rotasX(screen, props)`) e o `manifesto.ts` de cada funcionalidade (serviços, detalhe, fotos, checklist, finalizar, voucher, recibo, recebimento, despesas, colisão, manutenção, termos, comunicados, ideias, meu carro, histórico).
- `src/data/porta.ts` é o contrato das operações que o modo link usa; `src/data/dataverse/` tem o cliente HTTP (`cliente.ts`), entidades, Custom APIs e o adaptador da porta; `src/data/mock/` tem o mock de localhost.
- `src/lib/dataverse.ts` ainda concentra as regras e chamadas do Dataverse de várias features (troca, recibo, despesas, QR, voucher, finalizar). Novas regras vão para a feature; as operações liberadas ao terceiro passam pela porta.
- `src/shared/` tem a UI comum (`shared/ui`, inclusive `icons/`, `layout/` e `navigation/`), câmera e mídia (`shared/camera`) e utilitários (`appErrorLogger`, `buildStamp`, `currencyInput`, `useDitado`).
- `src/styles.css` é a folha de estilos de entrada do build e importa o CSS das features.

## Despesas

- `src/features/despesas/expenses.ts` é só barrel; consumidores importam dele.
- `expenses.types.ts` tem os contratos; `expenses.defaults.ts` os catálogos locais usados antes de carregar a referência do Dataverse; `expenses.reference.ts` busca, parse, validação e normalização; `expenses.payload.ts` só monta o payload do Dataverse.

## Regras de refatoração

- Estado e efeitos novos entram num hook da feature, não no `App.tsx`; o hook é chamado na posição que mantém a ordem dos efeitos.
- Mudança de despesa vai para `expenses.reference.ts` ou `expenses.payload.ts`, não para condicionais nas telas.
- Mover ou remover export de `src/lib`, `src/app`, `src/data` ou `src/shared` exige atualizar de propósito `tests/characterization/module-exports.json` (`UPDATE_SNAPSHOT=1 npm test`).
- Rode `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, `npm test` e `npm run build` depois de mudança estrutural.

## Trocas e posse de veiculos

- O ciclo operacional escreve por Custom APIs: `new_RegistrarTrocaDeCarro`, `new_AtualizarTrocaDeCarro`, `new_ConfirmarTrocaMotorista`, `new_ConcluirTrocaDeCarro`, `new_CancelarTrocaDeCarro` e `new_ReverterTrocaDeCarro`.
- `new_RegistrarTrocaDeCarro` cria troca/Geral e conclui a operacao imediata na mesma transacao. A chave `new_idempotencykey` e o `new_requesthash` protegem reenvios.
- `ExchangeConflictValidator` valida janela e sobreposicao no PreValidation. `ExchangePossessionFinalizer` rejeita lacuna com `POSSESSION_CHAIN_GAP`; nao cria posse sintetica.
- `LifecycleAuthorization` aceita mutacoes internas apenas quando existe uma Custom API conhecida na cadeia de contexto. Escrita direta e delete continuam bloqueados.
- Edicao, confirmacao, cancelamento e reversao carregam RowVersion antes do comando. Divergencia retorna `EXCHANGE_CONCURRENCY_CONFLICT` sem sobrescrita.
- A Tela Operacional nao permite forcar conflito, preserva o snapshot de veiculos da troca e coleta motivo/data efetiva em dialogo auditavel.
- O App Motoristas confirma o participante autenticado pela API, pagina consultas e exige funcionario ativo. Codigos de dominio viram mensagens seguras.
- Fotos e assinaturas de rascunho ficam no IndexedDB por ate sete dias, limitadas a 25 MB. `localStorage` recebe apenas o estado sem blobs/base64.
- O pipeline `scripts/push-dev.ps1` exporta backup antes do deploy e bloqueia a publicacao se testes, TypeScript, builds, testes .NET ou validacao final falharem.
