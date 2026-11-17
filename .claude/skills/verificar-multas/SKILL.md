---
name: verificar-multas
description: "Verifica a fase 1 das multas: regras MultaEtapas (plugin e espelho do shell, paridade), Custom APIs cr40f_PassoMulta, cr40f_MultasDoDia e new_DossieMulta, trava (observar/travar), tarefa da multa no Planner, drawer passo a passo, lista e visões, Abrir multa no Planner, aba Multas da ficha e o e-mail Multas de hoje. Use após mudar packages/plugins/Cr40f.Frota.Plugin/Multa*.cs, PassoMultaPlugin.cs, MultasDoDia*.cs, DossieMultaPlugin.cs, frota/domain/multa*.ts, MultaPassoAPasso.tsx, frota/domain/{linhas,listas}.ts, planner/domain/multaTaskFlow.ts, flows/multas-do-dia.json ou a migration 20261117-1200-multas-fase1.ps1."
---
# Verificar multas (fase 1)

Spec: `docs/superpowers/specs/2026-11-17-multas-fase1-design.md`. Plano: `docs/superpowers/plans/2026-11-17-multas-fase1.md`.
Testes, builds e navegador rodam na Betinhos-Renan (este PC tem 8 GB). Só DEV; PROD é proibido aqui.
Roteiro do SNE (rotina do Júnior, não é verificada aqui): `docs/multas/rotina-sne.md`.

## 1. Testes (sem Dataverse)
```
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --nologo -v q
dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --nologo -v q --filter FullyQualifiedName~DossieMulta
pnpm --filter @betinhos/shell typecheck
pnpm --filter @betinhos/shell test -- src/pages/frota/domain src/pages/frota/components/MultaPassoAPasso.test.tsx src/pages/frota/components/RegistroDrawer.test.tsx src/pages/frota/views src/pages/planner/domain/multaTaskFlow.test.ts src/pages/planner/PlannerPage.test.tsx src/pages/funcionarios/components/RelatedTabs.test.tsx src/pages/dashboard/domain/abas/multas.test.ts
pnpm --filter @betinhos/deploy test
```
Esperado: tudo verde. `ParidadeMultaTests` e `multaEtapas.test.ts` leem o mesmo `Fixtures/multa-etapas.json`: mudou uma regra, mude os dois lados e o fixture.

## 2. Mock (sem Dataverse)
Suba o shell em mock (`pnpm --filter @betinhos/shell dev`, porta 36472) e passe por:
1. `#/frota-multas`: abre na visão **Comigo** (filtro rápido "Com passo a dar"); colunas Auto, Data, Placa, Responsável, Etapa, Próximo passo, Próximo prazo; u5 com prazo vermelho; visões Prazo vencido, Aguardando penalidade (u6), Aguardando acerto (u4), Encerradas e canceladas (u3, u9), Todas.
2. Uma multa do começo ao fim, u1: Definir o responsável (Motorista, "Bruno Lima (fictício)") → Avisar o motorista ("Copiar mensagem" e "Avisei") → Indicar no órgão (canal DSV Digital, data de hoje) → a multa vai para Pagar e fica "Aguardando a penalidade" (o mock não tem a rotina do SNE: confira só até aqui).
3. Prazo vencido, u5: o passo ocupa a tela inteira, o menu "Mais ações da multa" some; responder "Não: a empresa paga a guia (prazo perdido)" leva a Pagar com responsável Empresa (prazo perdido).
4. u7 (Pagar com vencimento): Registrar pagamento → Acertar → "Lancei na folha" com o mês → Encerrada.
5. Menu "Mais ações da multa" em u2: "Cancelar multa" exige motivo; "Em recurso" leva a "Entrar com recurso" e, depois, ao passo "Registrar resultado" (como u10).
6. `#/planner?taskId=task-multa-1`: botão "Abrir multa" leva a `#/frota-multas?registro=multa:u1`; mudar o status para Concluída mostra "A tarefa fecha sozinha quando a multa for encerrada."
7. 375 px: sem rolagem horizontal no drawer e na lista.
Prints de antes e depois do drawer, da lista e da tarefa no Planner vão para o chat.

## 3. Dataverse DEV
Esta seção é para a pessoa com acesso ao DEV, a partir do checkout principal na develop atualizada. Sessão de código ou cloud não roda os scripts com `-Apply`, nem `pnpm push`/`provision-*`, nem grava no Dataverse; nunca use o conector do PROD.

Pré-requisitos: Deploy da `develop` verde (migration, plugin da frota, DriverRecordSharing, tela), `packages/plugins/scripts/register-dossiemulta-customapi.ps1 -Apply` e o flow criado à mão (`provision-flow-multas-do-dia.ps1 -Remetente <noreply>`), os dois do checkout principal.
1. **Schema**: `cr40f_multas.cr40f_status` com os rótulos novos e a opção 202410007 Cancelada; colunas novas; `cr40f_MultasTravaModo` = `observar`.
2. **Registro**: `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com --testar-multas` imprime o MultasJson com `hoje`, `total` e as cinco seções.
3. **Multa nova**: crie uma multa de teste pelo formulário nativo (auto `TESTE-<data>`, placa de teste, data para indicar daqui a 2 dias). Esperado: status "1. Identificar o responsável"; em até 1 min uma tarefa no Planner `Multa TESTE-... · <placa> · Definir o responsável`, prioridade urgente, equipe Frota, sininho do principal.
4. **Passo a passo no DEV**: dê os passos na tela até Encerrada. A cada etapa a tarefa muda o título, o prazo, o checklist e ganha um evento "Multa: ... → ..."; encerrada, a tarefa vai para Concluída. Conclua a tarefa à mão com outra multa aberta: o Planner recusa; com a multa aberta e a tarefa concluída por fora, o próximo passo a reabre.
5. **Trava em observar**: grave `cr40f_status` direto pela Web API numa multa de teste. Esperado: a gravação passa e o log de plugins (`plugintracelogs?$filter=typename eq 'Cr40f.Frota.Plugin.MultaTravaPlugin'&$orderby=createdon desc&$top=5`) tem `Recusaria multa <id> (Update): ... | origem: gravação direta, usuário <id>`.
6. **Duplicata**: crie outra multa com o mesmo auto. Em observar, passa e o trace diz `Já existe multa com o auto ...`; com a variável em `travar` (só no DEV, voltar para `observar` no fim), a criação é recusada com essa mensagem.
7. **Dossiê**: na multa de teste, "Copiar mensagem" traz o serviço da agenda da placa no horário e as viagens do InFleet (ou, com o InFleet fora do ar, exatamente "Rastreador: indisponível no momento." sem quebrar).
8. **E-mail**: com `cr40f_recebeemailmultas` marcado só para quem testa, rode o flow "Multas | Multas de hoje" à mão: um e-mail com as seções na ordem; sem itens, a execução termina sem enviar.

## Evidência obrigatória
Saída dos testes do item 1, prints do item 2, o MultasJson do item 3.2, o trace do item 3.5, a tarefa do item 3.3 e o e-mail do item 3.8.

## Limites
- Só prova o DEV. O PROD recebe tudo pelo "Publicar soluções" (ensaio no TEST e aprovação do Renan).
- Bypass de administrador (correção de dados) usa o bypass nativo de lógica customizada; não é coberto aqui.
- O termo de multa fica escondido nesta fase (skills `verificar-termo-multa` e `verificar-app-termo-multa`).
- A rotina do SNE grava a placa e a infração por `@odata.bind` (`cr40f_Placa`, `cr40f_Codigodainfracao`), nomes ainda não confirmados em uso real; a conferência está no roteiro da rotina.
