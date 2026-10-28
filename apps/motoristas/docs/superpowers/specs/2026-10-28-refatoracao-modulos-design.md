# Refatoração por funcionalidade + camada de dados (parte 1 de 4)

Status: rascunho para revisão do Renan. Nada de código antes do OK.

## Por que

O App Motoristas vai virar a base única para dois públicos: o motorista Betinhos (dentro do Dynamics, `Xrm.WebApi`) e o motorista terceiro (sem login, servido pelo Worker Cloudflare, com token por link). Hoje isso é inviável porque:

- `src/App.tsx` (3.835 linhas, ~90 `useState`) concentra navegação, estado de todas as telas e chamadas de dados.
- `src/lib/dataverse.ts` (4.427 linhas, 73 exports) mistura acesso HTTP ao Dataverse com regras de negócio (troca, recibo, despesas, QR).
- As telas importam o Dataverse direto (9 arquivos), então não há um ponto único para trocar "de onde vêm os dados".

## Decisões de arquitetura (em linguagem clara)

1. **Pastas por funcionalidade, não por tipo de arquivo.** Hoje um ajuste no checklist toca `screens/`, `components/checklists/`, `lib/checklists.ts`, `lib/checklistSend.ts` e `App.tsx`. Depois, quase tudo fica em `features/checklist/`. Ganho: quem mexe numa feature encontra tudo junto, e o manifesto de liberação do terceiro mora ao lado do código que ele libera.

2. **Porta + adaptadores (a "tomada").** `data/porta.ts` define, em TypeScript, a lista de operações que o app pode pedir (`carregarAgenda`, `salvarChecklist`, `enviarFoto`, `finalizar`...). As telas só conhecem a porta. Quem cumpre o contrato é um adaptador: hoje o `dataverse/` (código atual reorganizado); na parte 3, o `worker/`. Analogia: a tela é o aparelho, a porta é a tomada, o adaptador é a fiação. Troca a fiação sem trocar o aparelho. Por que operações nomeadas e não um `retrieveMultiple` genérico: o Worker precisa checar o token **por operação** ("este link pode finalizar o serviço X?"); com consultas OData livres o terceiro conseguiria ler qualquer tabela.

3. **Uma porta com dois adaptadores reais, não uma abstração especulativa.** A porta só existe porque haverá dois consumidores concretos. Por isso, nesta parte, ela cobre apenas as operações que o terceiro usará (liberadas no manifesto) mais as que já estão no caminho de migração; operações só do motorista Betinhos (despesas, colisão, QR, termos) podem continuar chamando o adaptador Dataverse direto até haver motivo para passar pela porta. Evita centenas de linhas de contrato que ninguém mais implementa.

4. **Modo de execução escolhido uma vez, na entrada.** `app/modo.ts` decide `motorista | terceiro` e qual adaptador injetar (via um `DataProvider` de contexto React). Nesta parte só existe `motorista`; o tipo `terceiro` e o filtro pelo manifesto ficam prontos e testados, mas inalcançáveis.

5. **Manifesto por feature.** Cada `features/<x>/manifesto.ts` exporta `{ id, telas, liberadoTerceiro, flag? }`. Navegação, menu e o futuro Worker leem o mesmo dado, então liberar/bloquear é mudar uma linha. Valores combinados:

   | Liberado ao terceiro | Bloqueado | Atrás de flag (desligado) |
   |---|---|---|
   | serviços, detalhe do próprio serviço, checklist, fotos, finalizar/observação final, voucher (Tenaris), recibo, comunicados, ideias | termos de multa, colisão, despesas, recebimento (QR/cobrança), histórico | meu carro |

6. **Strangler, não big bang.** O código novo cresce em volta do antigo: primeiro a porta delega para as funções atuais (zero mudança de comportamento), depois cada feature migra num PR, e por fim `lib/dataverse.ts` vira só reexportações e some. Em qualquer ponto a `main` publica.

## Estrutura-alvo

```
src/
  app/        main, AppShell, navegação hash (navigation.ts atual), modo.ts, DataProvider, registro de features
  features/
    servicos/ detalhe/ checklist/ fotos/ finalizar/ voucher/ recibo/
    recebimento/ despesas/ colisao/ termos/ comunicados/ ideias/ meu-carro/ historico/ manutencao/
      cada uma: telas, componentes, regras (puras), uso da porta, manifesto.ts
  data/
    porta.ts          contrato (tipos + operações nomeadas)
    dataverse/        cliente HTTP (retrieveMultiple/createOne...), contexto do motorista, adaptador da porta
    worker/contrato.md  parte 3; só a descrição de rotas/payloads agora
    mock/             mockData.ts atual (modo localhost)
  shared/     ui (components/common), câmera e mídia, utilitários (moeda, datas, mapLinks), CSS
```

`types.ts` é dividido por feature conforme cada uma migra; tipos usados por 3+ features vão para `shared/types.ts`.

## O que NÃO muda (contratos congelados)

- Hash routes (`parseHashRoute`, deep link do push model-driven), IDs/`data-*` usados pelos scripts de QA e CDP.
- Nomes lógicos Dataverse, payloads de Flows e Custom APIs, chaves de `localStorage`/IndexedDB (`mediaDraftStore`, `expenseSubmissionStorageKey`).
- Build `scripts/build-react-singlefile.cjs` (um HTML), SW `src/pwa/sw.js`, nome do web resource, versão de build.
- Visual: CSS e Design System intocados (é refatoração, não redesign).

## Ordem de migração (um PR cada)

0. **Rede de segurança:** testes de caracterização para o que ainda não tem cobertura (roteamento hash → tela inicial, `loadRemoteStore` em mock, finalizar/voucher/recibo builders) + script de screenshots do mock antes/depois (reaproveitar `npm run demo:capture`) + snapshot da lista de exports de `dataverse.ts`.
1. **Esqueleto:** pastas, `data/porta.ts` com as operações liberadas ao terceiro, adaptador Dataverse que só delega para `lib/dataverse.ts`, `DataProvider`, `modo.ts`, manifestos e teste do filtro de manifesto. App ainda chama o código antigo.
2. **Cliente Dataverse:** mover `retrieveMultiple/One`, `createOne/updateOne/deleteOne`, runtime detection e `getDriverContext` para `data/dataverse/cliente.ts`; `lib/dataverse.ts` reexporta.
3. **Features pequenas e isoladas primeiro:** comunicados, ideias, termos, meu-carro (aprende o padrão com risco baixo).
4. **Despesas, colisão, recebimento/QR, manutenção.**
5. **Núcleo do serviço:** servicos/agenda → detalhe → fotos → checklist → finalizar → voucher → recibo, já passando pela porta.
6. **App.tsx → AppShell:** estado por feature em hooks próprios (`useChecklistFlow`, `useFinalizeFlow`...), `App.tsx` vira composição + roteador. Meta: < 600 linhas.
7. **Limpeza:** remover reexports de `lib/dataverse.ts`, atualizar `AGENTS.md`/`system_architecture.md`, skills `verificar-*` com os novos caminhos.

## Prova de "nada mudou" em cada PR

- `npm test`, `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, `npm run build` verdes.
- Screenshots do mock (localhost) das telas da área, antes × depois, diff visual zero ou explicado.
- `graphify affected` da área antes de mover; skills `verificar-<area>` executadas.
- Bundle `dist/` com tamanho na mesma faixa (± 2%).
- Nenhum `npm run push`/deploy sem pedido do Renan.

## Riscos

- **Estado acoplado no App.tsx:** callbacks cruzados entre telas (câmera ↔ checklist ↔ finalizar). Mitigação: mover estado só no passo 6, depois que as features já têm casa.
- **Ciclos de import** ao separar `dataverse.ts`: reexport temporário + `tsc` a cada movimento.
- **Conflito com outras frentes** abertas na `main`: PRs pequenos, merge de `origin/main` antes de cada um.
- **Coisa só testável no Dynamics** (Xrm, câmera real, Flows): fica declarado como "não verificado"; validação no DEV feita pelo Renan quando quiser publicar.

## Perguntas em aberto

1. A porta cobre só operações do terceiro (recomendado) ou já todas as 73?
2. Os PRs podem ir para a `main` um a um, ou prefere uma branch de integração e um merge só no fim?
3. Manutenção (solicitação/finalização) e "troca de veículo": bloqueados ao terceiro? (Não estavam na lista.)
