---
name: verificar-plugins
description: "Verifica os plugins C# do Dataverse (Cr40f.Financeiro.Plugin, incluindo ValorOpPlugin, Cr40f.Documentos.Plugin, Cr40f.Frota.Plugin e Cr40f.Portal.Plugin) e seus registradores. Use após mudar packages/plugins/** ou quando pedirem para testar plugin, valor da OP ou sincronização financeira."
---
# Verificar plugins do Dataverse

## Cobre
- Código: `packages/plugins/Cr40f.Financeiro.Plugin/**`, `packages/plugins/Cr40f.Documentos.Plugin/**`, `packages/plugins/Cr40f.Frota.Plugin/**`, `packages/plugins/Cr40f.Portal.Plugin/**`, registradores em `packages/plugins/tools/**`, scripts `packages/plugins/scripts/*.ps1`.
- Comportamento: valor da OP (`cr40f_financeiro.cr40f_valor`) = soma de `new_valortotal` das composições das reservas (`reserva.new_composicaodepreco`), a mesma soma do `SyncEngine`; sincronização financeira (pagantes → OP → reservas).

## Preparar ambiente
- .NET SDK 8+ (`dotnet --list-sdks`); chave de assinatura em `%USERPROFILE%\.codex\keys\Cr40f.Financeiro.Plugin.snk`.
- DEV: `https://org23b93544.crm2.dynamics.com/`. Token em cache do registrador (`%TEMP%\Betinhos\Dataverse\financeiro.msalcache.bin`); na primeira vez abre login no navegador — quem entra é o Renan.

## Roteiro
1. `dotnet test packages/plugins/Cr40f.Financeiro.Plugin.Tests/Cr40f.Financeiro.Plugin.Tests.csproj` → "Com falha: 0" (34 testes em 19/10/2026, 7 de `ValorOpTests`).
2. `dotnet build packages/plugins/tools/Cr40f.Financeiro.Registrar/Cr40f.Financeiro.Registrar.csproj` → "0 Erro(s)".
3. Simulação no DEV (só leitura): `dotnet run --project packages/plugins/tools/Cr40f.Financeiro.Registrar/Cr40f.Financeiro.Registrar.csproj -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --simularValorOp` → linha `valor da OP: N OPs, M com reservas, K mudariam, 0 gravadas (simulação)`.
4. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:financeiro:dev` → steps `Cr40f.ValorOp: …` criados/reconciliados e "plugin publicado com sucesso".
5. Carga inicial no DEV: mesmo comando do passo 3 com `--recalcularValorOp` → `K gravadas`; repetir `--simularValorOp` → `0 mudariam`.
6. Comportamento: no Sistema Betinhos (DEV) › Ordens de Pagamento, o valor de cada OP aparece sem o título "Soma dos serviços" (agora vem de `cr40f_valor`); alterar um campo de origem (ex.: `new_valorpedagios`) de uma composição de teste — `new_valortotal` é calculada e não aceita escrita — ligada a uma reserva com OP e conferir a OP atualizada na hora.

## Frota (Custom API `cr40f_FrotaPendencias`)
1. `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests` → "Com falha: 0" (5 em 20/10/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Frota.Plugin.snk` (o script de push cria se faltar).
2. Paridade com o shell: `Fixtures/paridade.json` é lido também por `apps/shell/src/pages/frota/domain/paridade.test.ts` (`npx vitest run src/pages/frota/domain/paridade` em `apps/shell`). Mudou regra ou limiar (`alertas.ts` `LIMIARES` ↔ `Modelo.cs` `Limiares`)? Atualize os dois lados e o `esperado` do fixture. `Catalogo.cs` é gerado de `manutencaoCatalogo.json` (teste `Catalogo_igual_ao_json_do_shell`).
3. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:frota:dev`.
4. Testar no DEV (só leitura): `dotnet run --project packages/plugins/tools/Cr40f.Frota.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --testar` → JSON `{hoje,total,pendencias}`; os totais por tipo batem com a aba Pendências do shell no DEV (prioridade, reincidência, preventiva, custo, hodômetro; "agendada" só as vencidas).

## Portal (reabrir validação quando o preço muda, `ReabrirValidacaoPlugin`)
1. `dotnet test packages/plugins/Cr40f.Portal.Plugin.Tests` → "Com falha: 0" (11 em 28/10/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Portal.Plugin.snk` (o script de push cria se faltar).
2. Cenários cobertos: aprovado + preço novo → Liberado com valor anterior, prazo novo e aprovado em/por limpos; mesmo valor (com e sem imagem) e segunda execução → nada; Retirado, validação inativa ou reserva sem validação → nada; duas reservas na mesma composição → as duas; `Depth` > 1 → sai sem ler nem gravar.
3. Dias úteis (`DiasUteis.cs`): mesma regra de `prazoTacita` em `apps/shell/src/pages/geral/domain/portal.ts` (fixos + Sexta-feira Santa, UTC-3). Mudou um lado? Mude o outro e o teste `Feriados_nacionais`.
4. `dotnet build packages/plugins/Cr40f.Portal.Plugin -c Release` e conferir o public key token da DLL (não vazio).
5. Publicar no DEV (só da `main`, checkout principal, **depois** de `packages/deploy/provision-portal-cliente.ps1 -Apply`): `pnpm push:plugin:portal:dev`. O registrador falha se `cr40f_validacaoservico` não existir. Step: `Cr40f.Portal: preço alterado reabre validação` (Update de `cr40f_composicaodeprecos`, pós, síncrono, **sem filtro** porque `new_valortotal` é calculada, imagem `pre` com `new_valortotal`).
6. Comportamento no DEV: numa reserva de teste com validação Aprovada, alterar um campo de origem da composição (ex.: `new_valorpedagios`) → a validação volta para Liberado, `cr40f_valoranterior` = valor antigo, `cr40f_prazotacita` = hoje + 5 úteis; repetir o mesmo valor → nada muda. Desfazer o valor depois.

## Casos de borda
- Reserva sem composição conta 0 (como o `SyncEngine`); OP sem reserva fica sem valor (null).
- Excluir composição: o step pré-Delete guarda as OPs (o vínculo some antes do pós-Delete).
- Mover reserva de OP: a imagem `pre` recalcula a OP antiga e a nova.

## Evidência obrigatória
- Saída do `dotnet test`, linha da simulação antes/depois da carga e print da lista de OPs no DEV.

## Limites
- PROD só com aprovação explícita (carga inicial grava em todas as OPs).
- Fluxos do Power Automate que escutam alteração de OP podem disparar quando `cr40f_valor` muda: conferir no DEV antes do PROD.
