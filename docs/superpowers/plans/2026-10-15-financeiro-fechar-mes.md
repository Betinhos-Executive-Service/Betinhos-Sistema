# Financeiro automático — Plano 3: fechamento mensal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Custom API unbound `cr40f_FecharMesCliente` que cria uma OP consolidada com os serviços "Faturamento Mensal" concluídos de um cliente num mês, e na tela `#/pendencias` o tipo 4 com o botão "Fechar mês" que chama a API e abre o Gerar Pagantes na OP criada.

**Architecture:** No plugin, uma função pura `FechamentoMensal.Elegiveis(reservas, mes)` decide o que entra; `FecharMesClientePlugin` carrega, valida, cria a OP, vincula as reservas e grava log (mesma transação). O registrador ganha suporte a Custom API unbound. No shell, `detectarPendencias` passa a receber as reservas Mensal sem OP e agrupa por cliente + mês.

**Spec:** `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md` §4.3 e §5 (tipo 4).

## Global Constraints

- Elegível: reserva com `_cr40f_cliente_value == clienteId`, `cr40f_status == 202410008` (Concluído), `cr40f_statusdefaturamento == 202410008` (Faturamento Mensal), `cr40f_financeiro` nulo, `statecode == 0`, saída dentro do mês em America/Sao_Paulo (UTC−03:00 fixo, sem horário de verão desde 2019): `[AAAA-MM-01T03:00Z, próximo mês 01T03:00Z)`.
- Mês só pode ser fechado se já terminou (mês < mês corrente em São Paulo).
- Sem reserva elegível: erro "Nenhum serviço mensal concluído sem OP para este cliente no mês.", nada criado.
- OP criada: `cr40f_status` 202410000 (Aberta), `cr40f_valor` = soma de `new_valortotal` das CPs; se alguma reserva elegível não tem CP ou CP sem valor → erro "Há serviços sem composição de preço; complete antes de fechar o mês.", nada criado. `new_clientedaop` = `cr40f_nomedocliente` do cliente; `cr40f_datado1servico`/`cr40f_datadoultimoservico` = menor/maior saída (data).
- Status de faturamento das reservas **não muda** (continua Mensal) — o motor marca Pago quando o pagante for pago.
- Log: uma linha por reserva vinculada (`cr40f_entidade` reserva, `cr40f_campo` `cr40f_financeiro`, `cr40f_de` vazio, `cr40f_para` = id da OP, motivo "Fechamento mensal AAAA-MM", origem Manual).
- Permissão: usuário precisa de Create em `cr40f_financeiro` (checar com `RetrievePrincipalAccess` não serve para create; usar o user service para criar a OP, o que já impõe o privilégio).
- Só DEV. Commits em português com trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Design System como no Plano 2.

---

### Task 1: Seleção pura e testes (C#)

**Files:** Create `packages/plugins/Cr40f.Financeiro.Plugin/FechamentoMensal.cs`, `packages/plugins/Cr40f.Financeiro.Plugin.Tests/FechamentoMensalTests.cs`; Modify `Codigos.cs` (acrescentar `ReservaConcluida = 202410008`).

- [ ] **Step 1: Testes**

```csharp
using System;
using System.Linq;
using Cr40f.Financeiro.Plugin;
using Xunit;

public class FechamentoMensalTests
{
    static ReservaMensal R(string saidaUtc, int status = Codigos.ReservaConcluida, int fat = Codigos.ReservaFatMensal, bool temOp = false, int? cp = 10000) =>
        new() { Id = Guid.NewGuid(), SaidaUtc = DateTime.Parse(saidaUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal), Status = status, FatStatus = fat, TemOp = temOp, CpValorCents = cp };

    [Fact]
    public void JanelaDoMesEmSaoPaulo()
    {
        var (ini, fim) = FechamentoMensal.Janela("2026-09");
        Assert.Equal(new DateTime(2026, 9, 1, 3, 0, 0, DateTimeKind.Utc), ini);
        Assert.Equal(new DateTime(2026, 10, 1, 3, 0, 0, DateTimeKind.Utc), fim);
    }

    [Fact]
    public void FiltraElegiveis()
    {
        var dentro = R("2026-09-01T03:00:00Z");
        var lista = new[] { dentro, R("2026-09-01T02:59:00Z"), R("2026-10-01T03:00:00Z"), R("2026-09-10T12:00:00Z", status: 202410005), R("2026-09-10T12:00:00Z", fat: Codigos.ReservaFatPago), R("2026-09-10T12:00:00Z", temOp: true) };
        Assert.Equal(new[] { dentro.Id }, FechamentoMensal.Elegiveis(lista, "2026-09").Select(r => r.Id));
    }

    [Fact]
    public void MesAbertoNaoFecha()
    {
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.ValidarMes("2026-10", new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc)));
        FechamentoMensal.ValidarMes("2026-09", new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void MesInvalidoFalha() => Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.Janela("2026-13"));

    [Fact]
    public void TotalExigeComposicao()
    {
        Assert.Equal(25000, FechamentoMensal.TotalCents(new[] { R("2026-09-02T12:00:00Z", cp: 10000), R("2026-09-03T12:00:00Z", cp: 15000) }));
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.TotalCents(new[] { R("2026-09-02T12:00:00Z", cp: null) }));
    }
}
```

- [ ] **Step 2: RED** — `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`.

- [ ] **Step 3: Implementação**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

public sealed class ReservaMensal
{
    public Guid Id { get; set; }
    public DateTime SaidaUtc { get; set; }
    public int? Status { get; set; }
    public int? FatStatus { get; set; }
    public bool TemOp { get; set; }
    public int? CpValorCents { get; set; }
}

public static class FechamentoMensal
{
    static readonly TimeSpan Offset = TimeSpan.FromHours(3); // America/Sao_Paulo, UTC-03:00 sem horário de verão

    public static (DateTime Inicio, DateTime Fim) Janela(string mes)
    {
        if (!DateTime.TryParseExact(mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            throw new InvalidPluginExecutionException("mes deve estar no formato AAAA-MM.");
        var ini = DateTime.SpecifyKind(d, DateTimeKind.Utc).Add(Offset);
        return (ini, ini.AddMonths(1));
    }

    public static void ValidarMes(string mes, DateTime agoraUtc)
    {
        var (_, fim) = Janela(mes);
        if (agoraUtc < fim) throw new InvalidPluginExecutionException("O mês ainda não terminou.");
    }

    public static IReadOnlyList<ReservaMensal> Elegiveis(IEnumerable<ReservaMensal> reservas, string mes)
    {
        var (ini, fim) = Janela(mes);
        return reservas.Where(r => r.Status == Codigos.ReservaConcluida && r.FatStatus == Codigos.ReservaFatMensal && !r.TemOp && r.SaidaUtc >= ini && r.SaidaUtc < fim).ToList();
    }

    public static int TotalCents(IEnumerable<ReservaMensal> reservas)
    {
        var lista = reservas.ToList();
        if (lista.Any(r => r.CpValorCents is null || r.CpValorCents <= 0))
            throw new InvalidPluginExecutionException("Há serviços sem composição de preço; complete antes de fechar o mês.");
        return lista.Sum(r => r.CpValorCents!.Value);
    }
}
```

- [ ] **Step 4: GREEN** (24 testes). **Step 5: Commit** `financeiro: seleção pura do fechamento mensal (janela em São Paulo, elegíveis, total)`.

---

### Task 2: Plugin `FecharMesClientePlugin`

**Files:** Create `FecharMesClientePlugin.cs`; Modify `Contracts.cs`, `ContractsTests.cs`.

- [ ] **Step 1: Contrato + teste**: `FecharMesRequest { clienteId: Guid, mes: string }` com `Validate()` (clienteId vazio → IPEE "clienteId é obrigatório."; mês via `FechamentoMensal.Janela`). `FecharMesResponse { opId, reservas (int), valor (decimal) }`. Testes: request válido desserializa; `clienteId` vazio falha.

- [ ] **Step 2: Plugin** (molde do `SincronizarFinanceiroPlugin`: try/catch/trace, `JsonException` → "Payload inválido."):
  1. Ler `cr40f_RequestJson`, validar, `FechamentoMensal.ValidarMes(mes, DateTime.UtcNow)`.
  2. Com o user service: `RetrieveMultiple` de `cr40f_reservadeveculos` com `cr40f_cliente == clienteId`, `cr40f_statusdefaturamento == ReservaFatMensal`, `cr40f_status == ReservaConcluida`, `cr40f_financeiro` Null, `statecode == 0`, `cr40f_dataehorriodesada` ≥ ini e < fim; colunas `cr40f_dataehorriodesada`, `new_composicaodepreco`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_financeiro`.
  3. Buscar CPs (`new_valortotal`) pelos ids; montar `ReservaMensal`; `Elegiveis` (reforça os filtros); vazio → IPEE "Nenhum serviço mensal concluído sem OP para este cliente no mês."; `TotalCents`.
  4. Buscar `cr40f_clientes1` (`cr40f_nomedocliente`).
  5. Com o **user service** criar a OP (`cr40f_status` Aberta, `cr40f_valor` Money, `new_clientedaop`, `cr40f_datado1servico`, `cr40f_datadoultimoservico`).
  6. Com o system service: `SharedVariables["cr40f_sync"] = true`; para cada reserva `Update` de `cr40f_financeiro` → OP; criar linha de log (reaproveite as colunas de `MudancaApplier`; extraia um helper `LogWriter.Write(service, opId, reservaId, entidade, campo, de, para, motivo, origem, usuario)` e use-o também no `MudancaApplier`, sem mudar o que ele grava).
  7. Responder `FecharMesResponse`.

- [ ] **Step 3:** `dotnet test` (26) + build Release. **Commit** `financeiro: Custom API cr40f_FecharMesCliente cria OP consolidada do mês e vincula os serviços`.

---

### Task 3: Registrador para Custom API unbound

**Files:** Modify `packages/plugins/tools/Cr40f.Financeiro.Registrar/Program.cs`.

- [ ] Generalizar `EnsureCustomApi(..., string? boundEntity)`: `bindingtype` 0 (Global) quando `boundEntity` é null, sem `boundentitylogicalname`; descrição/displayname por parâmetro. Registrar tipo `Cr40f.Financeiro.Plugin.FecharMesClientePlugin` (`UpsertPluginTypeNamed`) e a API `cr40f_FecharMesCliente` (display "Fechar Mês do Cliente") com os mesmos filhos `cr40f_RequestJson` (obrigatório) e `cr40f_ResponseJson` via `EnsureCustomApiChildren`; `ConfigureMainOperationStep` para ela também. Acrescentar ao modo de validação `--fechar <clienteId> --mes AAAA-MM` que executa `OrganizationRequest("cr40f_FecharMesCliente")` e imprime o JSON.
- [ ] Build Release 0 avisos; **Commit** `financeiro: registrador publica a Custom API unbound cr40f_FecharMesCliente`.
- [ ] **(controlador)** Publicar em DEV (`powershell -File packages/plugins/scripts/push-financeiro-plugin.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -EnvironmentName dev`) e validar: chamar com um cliente/mês sem elegíveis → erro esperado; listar em DEV via MCP se existe reserva Mensal concluída sem OP de mês fechado e, se existir, fechar uma e conferir OP, vínculo e log.

---

### Task 4: Tipo 4 no domínio e nos dados do shell

**Files:** Modify `apps/shell/src/pages/pendencias/domain/{codes,types,detect,domain.test}.ts`, `data/{queries,mock,source,data.test}.ts`.

- [ ] `TipoPendencia` ganha `'mensal-sem-op'` (`TIPO_LABEL`: "Mensal sem OP"); `Pendencia` ganha `clienteId: string` e `mes: string | null` ('AAAA-MM'). `detectarPendencias(ops, reservas, pagantes, agora = new Date())`: reservas com `status === RESERVA_CONCLUIDA`, `fatStatus === FAT.mensal`, `opId == null`, `saida` em mês < mês corrente de São Paulo, agrupadas por `clienteId|mes` → uma pendência por grupo, id `mensal-sem-op:${clienteId}:${mes}`, `valor` = soma das `cpValor`, `corrigivel: false`, detalhe "N serviço(s) de AAAA-MM". Mês de São Paulo: `new Date(saida.getTime() - 3*3600e3).toISOString().slice(0,7)`.
- [ ] Testes: 2 reservas mensais do mesmo cliente/mês fechado → 1 pendência com 2 reservaIds; mês corrente → nada; com OP → nada; status ≠ Concluído → nada.
- [ ] `queries.ts`: o filtro passa a incluir `cr40f_statusdefaturamento eq ${FAT.mensal}`.
- [ ] `source.ts`: `fecharMes(clienteId, mes) → Promise<{ opId: string; reservas: number; valor: number }>` — Dataverse: `POST cr40f_FecharMesCliente` (unbound, path sem entity set) com `{ cr40f_RequestJson: JSON.stringify({ clienteId, mes }) }`, parse de `cr40f_ResponseJson`; mock: cria OP em memória, vincula as reservas, devolve o resumo. Mock ganha um caso tipo 4. Teste de dados: mock `fecharMes` remove o tipo 4 da detecção seguinte.
- [ ] Vitest + typecheck; **Commit** `pendencias: tipo 4 (Mensal sem OP) no domínio e fecharMes no source`.

---

### Task 5: Diálogo "Fechar mês" na página

**Files:** Create `apps/shell/src/pages/pendencias/components/FecharMesDialog.tsx`; Modify `components/PendenciasList.tsx` (ação do tipo 4; badge tom `info`), `PendenciasPage.tsx`, `PendenciasPage.test.tsx`.

- [ ] Ação "Fechar mês" no tipo 4 abre diálogo (mesmo `Dialog` do `CorrigirDialog`): cliente, mês (formatado "setembro de 2026"), lista de serviços (códigos), total; "Fechar mês" chama `fecharMes`; durante a chamada overlay/Esc/X não fecham; sucesso → toast "OP criada com N serviço(s)", `reload()` e abre `GerarPagantesFrame` com `gerarPagantesUrl(opId)` (no mock, toast como no Rateio); erro → `Alert` no diálogo.
- [ ] Teste em mock: abre, confirma, toast, pendência some. **Commit** `pendencias: Fechar mês cria a OP consolidada e abre o Gerar Pagantes`.

---

### Task 6: Review final, PR e publicação

- [ ] Review final da branch; PR para `main`; após CI verde, merge (com ok do Renan); `git pull` no checkout principal; `pnpm push`; commit da versão; informar versão publicada.
