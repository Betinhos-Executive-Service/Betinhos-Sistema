---
name: verificar-multas
description: "Verifica a fase 1 das multas: regras MultaEtapas (plugin e espelho do shell, paridade), Custom APIs cr40f_PassoMulta, cr40f_MultasDoDia e new_DossieMulta, trava (observar/travar), tarefa da multa no Planner, drawer passo a passo, lista e visões, Abrir multa no Planner, aba Multas da ficha e o e-mail Multas de hoje. Use após mudar packages/plugins/Cr40f.Frota.Plugin/Multa*.cs, PassoMultaPlugin.cs, MultasDoDia*.cs, DossieMultaPlugin.cs, frota/domain/multa*.ts, MultaPassoAPasso.tsx, frota/domain/{linhas,listas}.ts, planner/domain/multaTaskFlow.ts, flows/multas-do-dia.json as migrations 20261117-1200-multas-fase1.ps1 / 20261117-2100-multas-fase1-choice-local.ps1, ou o desconto em folha (MultaParcelas.cs, LancarDescontoFolhaPlugin.cs, Custom API cr40f_LancarDescontoFolha, apps/shell/src/pages/rh-descontos/**, lib/xlsx.ts, migration 20261118-1800-rh-descontos-parcelas.ps1)."
---
# Verificar multas (fases 1 e 3)

Spec: `docs/superpowers/specs/2026-11-17-multas-fase1-design.md`. Plano: `docs/superpowers/plans/2026-11-17-multas-fase1.md`.
Testes, builds e navegador rodam na Betinhos-Renan (este PC tem 8 GB). Só DEV; PROD é proibido aqui.
Fase 3 (o motorista resolve no app): spec `docs/superpowers/specs/2026-11-18-multas-fase3-app-design.md`; seção 5 abaixo e skill `verificar-termo-multa`.
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
Esta seção é para a pessoa com acesso ao DEV, a partir do checkout principal na develop atualizada. Sessão de código ou cloud não roda os scripts com `-Apply`, nem `pnpm push`/`provision-*`, nem grava no Dataverse; nunca use os conectores do claude.ai que gravam no PROD (ex.: Dataverse Betinhos).

Pré-requisitos: Deploy da `develop` verde (migration, plugin da frota, DriverRecordSharing, tela), `packages/plugins/scripts/register-dossiemulta-customapi.ps1 -Apply` e o flow criado à mão (`provision-flow-multas-do-dia.ps1 -Remetente <noreply>`), os dois do checkout principal.
1. **Schema**: `cr40f_multas.cr40f_status` com os rótulos novos e a opção 202410007 Cancelada; colunas novas; `cr40f_MultasTravaModo` = `observar`.
2. **Registro**: `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com --testar-multas` imprime o MultasJson com `hoje`, `total` e as cinco seções.
3. **Multa nova**: crie uma multa de teste pelo formulário nativo (auto `TESTE-<data>`, placa de teste, data para indicar daqui a 2 dias). Esperado: status "1. Identificar o responsável"; em até 1 min uma tarefa no Planner `Multa TESTE-... · <placa> · Definir o responsável`, prioridade urgente, equipe Frota, sininho do principal.
4. **Passo a passo no DEV**: dê os passos na tela até Encerrada. A cada etapa a tarefa muda o título, o prazo, o checklist e ganha um evento "Multa: ... → ..."; encerrada, a tarefa vai para Concluída. Conclua a tarefa à mão com outra multa aberta: o Planner recusa; com a multa aberta e a tarefa concluída por fora, o próximo passo a reabre.
5. **Trava em observar**: grave `cr40f_status` direto pela Web API numa multa de teste. Esperado: a gravação passa e o log de plugins (`plugintracelogs?$filter=typename eq 'Cr40f.Frota.Plugin.MultaTravaPlugin'&$orderby=createdon desc&$top=5`) tem `Recusaria multa <id> (Update): ... | origem: ...`. Na origem aparece a mensagem do contexto ("dentro de Update", ou "Update < Upsert" num PATCH sem `If-Match`), não o texto "gravação direta".
6. **Duplicata**: crie outra multa com o mesmo auto. Em qualquer modo da trava a criação é recusada: o Dataverse devolve 412 pela chave alternativa `cr40f_ChaveNotificacaodaMulta` ("Notificação da Multa"), e em `observar` o trace da trava também registra `Recusaria ... Já existe multa com o auto ...`.
7. **Dossiê**: na multa de teste, "Copiar mensagem" traz o serviço da agenda da placa no horário e as viagens do InFleet (ou, com o InFleet fora do ar, exatamente "Rastreador: indisponível no momento." sem quebrar).
8. **E-mail**: com `cr40f_recebeemailmultas` marcado só para quem testa, rode o flow "Multas | Multas de hoje" à mão: um e-mail com as seções na ordem; sem itens, a execução termina sem enviar.

## 4. Desconto em folha (RH bloco 1)
Spec: `docs/superpowers/specs/2026-11-18-rh-descontos-folha-design.md`. Mesmas regras da seção 3 (só DEV, quem tem acesso, checkout principal). Pré-requisito: Deploy verde com a migration `20261118-1800-rh-descontos-parcelas.ps1` (colunas `new_multa` e `new_lancadoem`) e a Custom API `cr40f_LancarDescontoFolha` registrada.

Testes sem Dataverse: `pnpm --filter shell test -- rh-descontos multa` (tela, prévia das parcelas, Excel) e os testes `MultaParcelas*`, `LancarDescontoFolha*` e `PassoMulta*` do `Cr40f.Frota.Plugin.Tests`. No mock (`pnpm dev`, porta 36472), `#/rh-descontos` mostra "Descontos de <mês>" com setas de mês, o aviso de setembro em atraso ("N desconto(s) de meses anteriores ainda não foi/foram lançado(s), desde <mês>" com "Ver <mês>"), os cartões "1 Lançar no sistema da folha" ("Faltam X de N motoristas · R$") e "2 Enviar Excel à contabilidade" (botão "Baixar Excel", arquivo `descontos-folha-AAAA-MM.xlsx`; volta a pedir o download depois de lançar ou desfazer) e uma tabela com 4 colaboradores fictícios (Motorista, Motivo, Situação, Descontar, ação). A seta do nome expande a linha: Auto, Infração, Data, Parcelamento, as parcelas mês a mês (a do mês com borda azul) e "Abrir a multa na Frota". Checkbox só em parcela A lançar; com seleção aparece "Marcar as N como lançadas" no rodapé. Em 390px as linhas viram cartões, sem rolagem horizontal, e "Selecionar todas a lançar" fica visível acima delas.

Leitura das parcelas de uma multa (critério de cada passo):
`new_parcelamultafolhas?$select=new_name,new_numero,new_competencia,new_valor,new_status,new_lancadoem&$filter=_new_multa_value eq <id da multa>&$orderby=new_numero` e da multa `cr40f_multases(<id>)?$select=cr40f_status,cr40f_competenciadesconto,cr40f_acertoem,cr40f_encerradaem`.

1. **Multa de teste**: auto `TST-RH-<data>`, motorista de teste, valor pago R$ 100,00; passo a passo até "4. Acertar".
2. **Acertar → folha em 2 parcelas**, primeiro mês = mês atual. Esperado: 2 parcelas Previstas de R$ 50,00 (competências no dia 1 de dois meses seguidos); a multa segue em "4. Acertar" (202410006) com a situação "Descontando em folha", `cr40f_competenciadesconto` = 1º mês, `cr40f_acertoem` = hoje; a tarefa do Planner fica Concluída e o e-mail diário não cobra a multa.
3. **Tela**: em `#/rh-descontos` a 1ª aparece no mês atual como "Multa <placa> · parcela 1 de 2", A lançar, R$ 50,00; expandida, mostra as 2 parcelas mês a mês. A 2ª aparece no próximo mês (seta ">").
4. **Lançar a 1ª** ("Marcar lançado" na linha; rodapé "1 parcela · R$ 50,00 marcada como lançada." e situação "Lançada em dd/mm"): parcela Descontada com `new_lancadoem` = hoje; a multa continua aberta.
5. **Lançar a 2ª**: multa Encerrada com `cr40f_encerradaem` = hoje.
6. **Desfazer a 2ª** ("Desfazer" na linha; rodapé "... voltou para a lançar."): parcela Prevista sem `new_lancadoem`; multa de volta em "4. Acertar" sem `cr40f_encerradaem`.
7. **Lançar a 2ª de novo**: a multa encerra.
8. **Fim**: a multa de teste fica Encerrada e as parcelas ficam como histórico fictício. Não apague: a trava do termo e o Restrict do lookup bloqueiam.
9. **Recusas** (mensagem do servidor na tela, nada gravado): Acertar → folha sem valor pago ("Registre o pagamento antes de lançar na folha."), mês fora da janela ("Escolha um mês entre ..."), 13 parcelas, cancelar a multa com parcela Prevista, e `PATCH` direto em `new_parcelamultafolha.new_status` pela Web API (a trava do termo recusa sempre, com "Parcela de multa só é lançada ou desfeita pela tela Descontos em folha e não pode ser alterada nem excluída por fora."). Mudar `cr40f_multas.cr40f_status` direto pela Web API passa enquanto `cr40f_MultasTravaModo` = `observar` (padrão no DEV); conferir o "Recusaria" no trace.

Permissão: a tela só lê (`prvRead` em `new_parcelamultafolha` e `cr40f_multas`); grava pela Custom API, que exige `prvWritecr40f_multas`. Em 18/11/2026 o papel Acesso-Betinhos-MDA lê multas mas não lê parcelas.

## 5. Fase 3: o motorista resolve a multa no app
Mesmas regras da seção 3 (só DEV, leitura; nada de PROD nem dado real). Códigos fixos em `.superpowers/sdd/2026-11-18-multas-fase3-app/global-constraints.md`.

Testes sem Dataverse (rodar um de cada vez; vitest pesado dá timeout por carga):
```
export PATH=$HOME/.dotnet:$PATH
dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests -p:SignAssembly=false --nologo -v q
dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --nologo -v q
pnpm --filter shell exec vitest run src/pages/frota
```
Esperado: tudo verde. As regras vivem em `MultaEtapas` (plugin) e no espelho do shell, com o mesmo fixture de paridade.

Mock do shell (`#/frota-multas`, porta 36472): autos fictícios A000000101 a A000000106 (`apps/shell/src/pages/frota/data/mock.ts`), um caso por auto:
- A000000101: etapa 2 sem termo, "Avisar o motorista" com o termo ainda não enviado.
- A000000102: termo pendente (`termoVigente`): o passo mostra "Aguarde a assinatura do termo ou cancele o termo." e o WhatsApp recusa com "Cancele o termo antes de avisar pelo WhatsApp."; próximo passo "Aguardando o motorista assinar o termo".
- A000000103: contestada (`contestadaEm`) na etapa 1: próximo passo "Decidir a contestação do motorista"; o prazo vencido exige escolher o motorista.
- A000000104: indicada no canal Senatran com aceite declarado: "Conferir o aceite na CNH Digital (motorista declarou em dd/mm)".
- A000000105 e A000000106: etapa Pagar; acerto preso ao termo (valor pago acima do termo recusa com "O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume."; primeiro mês já passado recusa com "O primeiro mês do termo (mm/aaaa) já passou; as parcelas começam em mm/aaaa.").

Casos novos e leitura no DEV (só GET; `<host>` = `https://org23b93544.crm2.dynamics.com`):
1. **Contestada no e-mail diário**: multa na etapa 1 com `cr40f_contestadaem` preenchida. Leitura: `<host>/api/data/v9.2/cr40f_multases?$select=cr40f_name,cr40f_status,cr40f_contestadaem,cr40f_dataparaindicar,_new_termovigente_value&$filter=cr40f_contestadaem ne null`. Esperado no `--testar-multas` (seção 3.2): seção "Contestadas pelo motorista" logo depois de "Prazo vencido"; a contestada com prazo vencido aparece só em "Prazo vencido".
2. **Termo pendente bloqueia a indicação**: multa com `new_termovigente` apontando para termo Pendente (`new_termomultas(<id>)?$select=new_status` = 100000000). O `cr40f_PassoMulta` de "Avisar" (WhatsApp) e de indicar recusa com os textos acima.
3. **Acerto preso ao termo**: termo Assinado e Folha; o `Acertar` só aceita folha dentro do termo (parcelas e primeiro mês do termo, valor pago no máximo o valor do termo). Leia `new_termomultas(<id>)?$select=new_status,new_formapagamento,new_parcelas,new_primeiracompetencia,new_valortotal` e as parcelas como na seção 4.
4. **`PrazoVencido` cancela o termo**: responder o passo `PrazoVencido` com termo pendente deixa o termo Cancelado (100000004) e `new_termovigente` vazio, e limpa `cr40f_contestadaem`.
5. **Datas novas**: `cr40f_aceitedeclaradoem` e `cr40f_ultimolembreteaceiteem` só mudam por `new_DeclararAceiteMulta` e `new_LembrarAceiteMulta` (a trava da multa aceita só esses dois caminhos). Uma gravação direta pela Web API, em `observar`, passa e deixa `Recusaria` no trace.
6. **Schema**: migration `20261119-0900-multas-fase3.ps1` cria `cr40f_contestadaem`, `cr40f_aceitedeclaradoem` e `cr40f_ultimolembreteaceiteem` (datas, só dia) em `cr40f_multas` e sobe `new_termomulta.new_parcelas` para no máximo 12. Confirme na metadata (`EntityDefinitions(LogicalName='cr40f_multas')/Attributes(LogicalName='cr40f_contestadaem')`).

Passos manuais depois do merge na `develop` (quem for verificar; nada disso é automático):
- Rodar `packages/plugins/scripts/register-multas-fase3-customapis.ps1 -Apply` **logo depois do Deploy do merge**, do checkout principal: o flow do termo (`provision-flow-termo-multa.ps1`) passa `new_Automatico` e a API precisa já ter o parâmetro.
- O flow "Multa | Push do aceite" (`provision-flow-multa-aceite-push.ps1`) é criado à mão no DEV, uma vez, e **ainda não tem mapa em `flows-dev.mjs`** (o Deploy não o atualiza até um PR seguinte; o "Termo de multa" já tem).
- A conta da connection reference do Dataverse do flow do aceite precisa do privilégio de gestor (`prvCreatenew_TermoMulta`) que o `new_LembrarAceiteMulta` exige; sem ele a API recusa com "Sem permissao para lembrar o aceite.".

## Evidência obrigatória
Saída dos testes do item 1, prints do item 2, o MultasJson do item 3.2, o trace do item 3.5, a tarefa do item 3.3 e o e-mail do item 3.8; na fase 3, a saída dos três `dotnet test`/vitest da seção 5, os prints dos autos A000000101 a A000000106 e as leituras 5.1 a 5.4; no desconto em folha, a leitura das parcelas e da multa após os itens 4.2, 4.5 e 4.6 e o print da tela no item 4.3.

## Limites
- Só prova o DEV. O PROD recebe tudo pelo "Publicar soluções" (ensaio no TEST e aprovação do Renan).
- Bypass de administrador (correção de dados) usa o bypass nativo de lógica customizada; não é coberto aqui.
- O sininho só toca quando a atribuição nasce na criação da tarefa; responsável colocado depois pelo reparo (ex.: equipe Frota vazia na criação) não gera sininho.
- O termo volta na fase 3 (skill `verificar-termo-multa`; a tela do app está na seção 4 dela).
- A rotina do SNE grava a placa e a infração por `@odata.bind` (`cr40f_Placa`, `cr40f_Codigodainfracao`) (nomes de navegação confirmados na metadata do PROD, para `cr40f_veiculoses` e `cr40f_infracaodetransitos`); a conferência da primeira multa criada continua no roteiro da rotina, como boa prática.

## 6. Configuração do App (fase B2)
- `Betinhos.DriverRecordSharing` tem cópia idêntica do resolvedor (`AppConfigResolver.cs`) e o leitor `AppConfigLeitor`; `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --filter "FullyQualifiedName~AppConfigLeitor|FullyQualifiedName~TermoMulta|FullyQualifiedName~QrCharge"` com "Com falha: 0". Os testes de multa semeiam a matriz publicada (`ChecklistFakeService`).
- Com `multas` desligado para o motorista, as Custom APIs de multa recusam (`MultasDesligado`, mensagem "O módulo Multas não está disponível…"); o desligamento vem do perfil, piloto ou exceção da pessoa. Falha ao ler a configuração recusa também (fail-closed).
- DEV: com `cr40f_AppConfigDefinirPessoa` (`Tipo='excecao'`, `Chave='multas'`, `Ligado=false`) num motorista de teste, chamar a API de multa por ele e esperar a recusa; encerrar a exceção depois.
