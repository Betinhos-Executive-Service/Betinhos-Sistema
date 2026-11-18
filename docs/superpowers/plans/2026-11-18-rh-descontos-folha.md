# RH, bloco 1 (descontos em folha do mês): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O "Acertar → folha" da multa passa a gerar de 1 a 12 parcelas em `new_parcelamultafolha`, a multa fica "Descontando" até a última parcela ser lançada, e o Júnior confere, lança, desfaz e exporta o mês em `#/rh-descontos`.

**Architecture:** As regras novas (divisão, janela de competência, "descontando", passos internos `ConcluirDesconto` e `ReabrirDesconto`) entram na classe pura `MultaEtapas`/`MultaParcelas` do `Cr40f.Frota.Plugin`, com espelho em `multaEtapas.ts` e paridade pelo fixture `multa-etapas.json`. O `cr40f_PassoMulta` cria as parcelas no Acertar → folha. Uma Custom API nova, `cr40f_LancarDescontoFolha`, lança e desfaz em lote e muda a multa só por `Execute` do `cr40f_PassoMulta`. A tela nova reaproveita a fonte de dados da Frota (`createFrotaSource`) e um gerador de XLSX novo em `apps/shell/src/lib/xlsx.ts`.

**Tech Stack:** C# net462 (plugins Dataverse, xUnit em net48), .NET 8 (registrador), React + TypeScript + Vitest (`apps/shell`), `@betinhos/ui` (VirtualTable, StatCard), fflate (`zipSync`), migration PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-11-18-rh-descontos-folha-design.md` (commit 241c2eed). As decisões da seção "Decisões do Renan (18/11/2026)" abaixo completam a spec; onde divergem, valem elas.

## Global Constraints

- Códigos de `new_parcelamultafolha.new_status`: Prevista **100000000**, Descontada **100000001**, Cancelada **100000002**. `cr40f_multas.cr40f_status`: Acertar **202410006**, Encerrada **202410005**, Cancelada **202410007**.
- Valor base: `cr40f_valorpago`. Divisão truncada nos centavos; a sobra vai na **última** parcela (100/3 = 33,33 · 33,33 · 33,34; 0,05/2 = 0,02 · 0,03). A soma é sempre igual ao valor pago.
- Competência da parcela *i* = primeira + (*i* − 1) meses, sempre `yyyy-MM-01`. Janela da primeira: do mês anterior ao de hoje até hoje + 12 meses (fuso de Brasília).
- Mensagens exatas, nesta ordem de checagem no Acertar → folha:
  1. "Informe o mês do desconto."
  2. "Registre o pagamento antes de lançar na folha."
  3. "A multa não tem motorista; defina o responsável antes."
  4. "Escolha um mês entre MM/AAAA e MM/AAAA." (exemplo com hoje 17/11/2026: "Escolha um mês entre 10/2026 e 11/2027.")
  5. "Escolha de 1 a 12 parcelas."
- `new_name` da parcela: `Multa <auto> · <x>/<y>` (auto = `cr40f_novacoluna`, "sem número" quando vazio).
- Rótulo do servidor na multa descontando: "Descontando em folha". O "x/y" aparece só na tela.
- "Hoje" = `FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow)` no servidor e `todaySP()` no shell. Datas `yyyy-MM-dd`, gravadas com `MultaMapper.DataGravada` (meio-dia UTC).
- **Máquina:** testes, builds, `vite` e Playwright rodam no desktop Linux (`renan-H410M-H`), nesta worktree. Sem `node_modules` na worktree, rode `pnpm install --frozen-lockfile` na raiz dela uma vez.
- **Publicação:** só por PR para a `develop`. A sessão de implementação nunca roda `pnpm push`, `pnpm wr`, `push:plugin:*`, `sitemap:*` nem `packages/deploy/provision-*`. Schema só por migration, que fica imutável depois de publicada. DEV só leitura durante a implementação. O PROD é somente leitura.
- Migration com BOM UTF-8, comentários em ASCII e compatível com Windows PowerShell 5.1.
- Repositório público: mock e fixtures só com dados fictícios (nomes com "(fictício)", CPF de teste `000.000.000-00`/`111.111.111-11`, placas `TST`).
- Mudança de UI: print da tela, do drawer e do Excel no chat (cópia em `~/.t3/userdata/attachments/`).
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões do Renan (18/11/2026)

1. **Centavos:** a sobra na última vale só para o Acertar → folha (`MultaParcelas`). O termo de multa (`TermoMultaCommandPlugin`, sobra nas primeiras, 1 a 3) não muda.
2. **Planner:** a tarefa da multa fecha enquanto ela está descontando (`MultaSituacao.Descontando`). Desfazer uma parcela reabre a multa em "4. Acertar", mas ela continua descontando, então a tarefa segue fechada. Só volta a abrir se a multa sair do desconto, o que esta entrega não faz.
3. **Limpeza no DEV:** nada é apagado. O roteiro termina com a multa de teste Encerrada e as parcelas como histórico fictício. O lookup `new_multa` usa Delete = **Restrict**.
4. **Cancelar multa com parcela Prevista:** é recusado com "Esta multa tem parcelas previstas na folha e não pode ser cancelada.".
5. **Brecha da trava do termo:** fechada. Hoje o cliente pode mudar uma parcela de Prevista para Descontada ou Cancelada direto. Agora toda gravação em parcela passa pelo servidor (`cr40f_LancarDescontoFolha`, `cr40f_PassoMulta` ou as APIs do termo).
6. **Lista de multas:** ganha a visão nova "Descontando". A multa descontando sai de "Aguardando acerto" e o e-mail diário para de contá-la.
7. **Menu:** "RH › Descontos em folha" aparece para todos. Quem não lê `new_parcelamultafolha` vê "Sem acesso" (status 403 do `ApiError` vira esse texto na Task 12).
8. **Atrasadas:** o mês atual mostra a faixa "N parcelas de meses anteriores ainda previstas", com link para o mês mais antigo. A lista e o Excel continuam só com o mês escolhido.
9. **Primeiro mês no drawer:** vem com o mês atual.

## Divergências com a spec, resolvidas no plano

- **Trava do termo:** está ativa no DEV (Create, Update e Delete em `new_parcelamultafolha`) e bloqueia criar parcela fora das APIs do termo. A Task 2 inclui `cr40f_PassoMulta` e `cr40f_LancarDescontoFolha` em `TermoMultaCommandPlugin.Apis`.
- **Limite de `new_numero`:** no DEV vai só de 1 a 3. A migration sobe o máximo para 12.
- **Parcelas de teste:** o DEV tem 4 parcelas de teste do termo, sem `new_multa`. Elas aparecem na tela como origem "Termo" e não mudam nenhuma multa.
- **Dono das parcelas:** o `cr40f_PassoMulta` roda como quem chama. As parcelas são criadas pelo serviço de sistema, com `ownerid` = quem chamou.
- **Exclusão:** a §9.4 ("apaga a multa e as parcelas") fica impossível pela trava e pelo Restrict; ver decisão 3.
- **Excel:** o `pagamento-fornecedores/lib/excel.js` é JS com estilos fixos de serviços e não serve aos dois. O gerador genérico novo fica em `apps/shell/src/lib/xlsx.ts`, e o pagamento não muda.
- **Também mudam:** `MultasDoDia.cs`, `MultaTarefa.cs`, `linhas.ts` e `listas.ts` (decisões 2 e 6).
- **Transação:** um `Execute` aninhado que falha aborta a transação do Dataverse, mesmo capturado. A `cr40f_LancarDescontoFolha` só chama o passo da multa depois de validar localmente com `MultaEtapas.Validar`, e nunca captura erro do passo.

## File Structure

**Schema**
- Create `packages/deploy/migrations/20261118-1800-rh-descontos-parcelas.ps1`: lookup `new_Multa` (`new_multa`), `new_lancadoem` (DateOnly) e `new_numero` com máximo 12.

**Servidor (`packages/plugins/Cr40f.Frota.Plugin`)**
- Create `MultaParcelas.cs`: divisão, competência, janela e mês por extenso (puro).
- Modify `MultaEtapas.cs`: `DadosPasso.Parcelas`, `MultaEstado.ParcelasPrevistas/ParcelasDescontadas`, `MultaSituacao.Descontando`, passos internos, validação e aplicação novas.
- Modify `PassoMultaPlugin.cs`: conta as parcelas e cria as do Acertar → folha.
- Create `LancarDescontoFolhaPlugin.cs`: a Custom API de lançar e desfazer.
- Modify `MultasDoDia.cs:50` e `MultaTarefa.cs:109,131`: excluem quem está descontando.
- Tests em `packages/plugins/Cr40f.Frota.Plugin.Tests`: `MultaParcelasTests.cs` (novo), `PassoMultaTests.cs`, `LancarDescontoFolhaTests.cs` (novo), `MultasDoDiaTests.cs`, `MultaTarefaTests.cs`, `ParidadeMultaTests.cs` e `Fixtures/multa-etapas.json`.

**Termo (`packages/plugins/Betinhos.DriverRecordSharing`)**
- Modify `TermoMultaCommandPlugin.cs:67` (Apis) e `:151-160` (sem a exceção do cliente). Test: `Betinhos.DriverRecordSharing.Tests/TermoMultaCommandPluginTests.cs:483-492`.

**Registrador**
- Modify `packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs`: Api nova.

**Shell (`apps/shell/src`)**
- Modify `pages/frota/domain/multaEtapas.ts` (+ test): espelho.
- Modify `pages/frota/domain/linhas.ts` e `listas.ts`: visão "Descontando".
- Modify `pages/frota/data/types.ts`, `mappers.ts`, `source.ts`, `dataverse.ts`, `mock.ts` e `hostSource.ts`: `ParcelaFolha`, leitura do mês e lançar.
- Modify `pages/frota/components/MultaPassoAPasso.tsx`: parcelas, primeiro mês, prévia e bloco "Descontos em folha".
- Create `lib/xlsx.ts` (+ test): planilha genérica.
- Create `pages/rh-descontos/domain/descontos.ts` (+ test): agrupamento, subtotais, resumo e linhas do Excel.
- Create `pages/rh-descontos/RhDescontosPage.tsx` (+ test) e `rh-descontos.css`.
- Modify `nav/menu.ts`, `app/routes.tsx` e `app/AppShell.tsx`: rota, grupo RH e ícone `HandCoins`.

**Verificação**
- Modify `.claude/skills/verificar-multas/SKILL.md`: roteiro do DEV do desconto em folha.

---

### Task 1: Migration do schema

**Files:**
- Create: `packages/deploy/migrations/20261118-1800-rh-descontos-parcelas.ps1`

**Interfaces:**
- Produces: `new_parcelamultafolha.new_multa` (lookup → `cr40f_multas`, navigation `new_Multa`, relação `cr40f_multas_new_parcelamultafolha_multa`, Delete Restrict), `new_parcelamultafolha.new_lancadoem` (DateOnly) e `new_numero` com MaxValue 12.

- [ ] **Step 1: Conferir os helpers e o nome de publicação.** Leia `packages/deploy/migrations/_dv.ps1` (funções `Label`, `U`, `Write-Step`, `Connect-Dv`, `Invoke-Dv`, `Get-Rows`, `Get-Coluna`, `Add-ComponenteNaSolucao`, `Publish-Tabela`) e `packages/deploy/migrations/README.md`. Se `U` ou `Add-ComponenteNaSolucao` tiverem outra assinatura, ajuste as chamadas abaixo.

- [ ] **Step 2: Escrever a migration** (salvar com BOM UTF-8; comentários só em ASCII):

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# RH bloco 1 (descontos em folha): parcelas do Acertar -> folha apontam para a multa, guardam o dia do lancamento
# e podem ir ate 12. Idempotente. Somente DEV; o PROD recebe pelas solucoes (tabela ja esta na BetinhosCore).
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "new_parcelamultafolha"
$multas = "cr40f_multas"
$solucao = "BetinhosCore"

# ---------- lookup da parcela para a multa ----------
$rel = "cr40f_multas_new_parcelamultafolha_multa"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $tabela.new_multa (Restrict)." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = $multas; ReferencedAttribute = "cr40f_multasid"; ReferencingEntity = $tabela
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Restrict"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "new_Multa"; DisplayName = (Label "Multa"); Description = (Label (U "Multa de origem da parcela (Acertar na folha).")); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $tabela.new_multa"
  }
}

# ---------- dia do lancamento ----------
if (-not (Get-Coluna $tabela "new_lancadoem")) {
  if (-not $Apply) { Write-Step "DRY RUN criaria $tabela.new_lancadoem (DateOnly)." }
  else {
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$tabela')/Attributes" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "new_LancadoEm"
      DisplayName = (Label (U "Lançado em")); Description = (Label (U "Dia em que o RH marcou a parcela como lançada na folha."))
      RequiredLevel = @{ Value = "None" }; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" }
    } | Out-Null
    Write-Step "criada $tabela.new_lancadoem"
  }
}

# ---------- numero da parcela ate 12 ----------
$path = "EntityDefinitions(LogicalName='$tabela')/Attributes(LogicalName='new_numero')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
$numero = Invoke-Dv "GET" $path
if ([int] $numero.MaxValue -lt 12) {
  if (-not $Apply) { Write-Step "DRY RUN subiria $tabela.new_numero de $($numero.MaxValue) para 12." }
  else {
    $corpo = @{ "@odata.type" = "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata" }
    foreach ($p in $numero.PSObject.Properties) { if ($p.Name -notlike '@odata.*') { $corpo[$p.Name] = $p.Value } }
    $corpo["MaxValue"] = 12
    Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$tabela')/Attributes($($numero.MetadataId))" $corpo | Out-Null
    Write-Step "new_numero aceita ate 12"
  }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $tabela
foreach ($c in @("new_multa", "new_lancadoem")) {
  $col = Get-Coluna $tabela $c
  if (-not $col) { throw "Coluna $tabela.$c nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $solucao 2 $col.MetadataId
}
if ([int] (Invoke-Dv "GET" $path).MaxValue -ne 12) { throw "PUT nao gravou MaxValue 12 em new_numero." }
Write-Step "OK: $tabela com new_multa, new_lancadoem e new_numero ate 12."
```

- [ ] **Step 3: Conferir o arquivo.** Rode `pnpm --filter deploy test` (ou `node --test packages/deploy/*.test.mjs`) para o `migrations-ci.mjs` aceitar o nome novo. Confira o BOM com `head -c3 packages/deploy/migrations/20261118-1800-rh-descontos-parcelas.ps1 | od -An -tx1`; o esperado é `ef bb bf`. Confira que não há acento fora das strings `U "..."` com `grep -nP '^\s*#.*[^\x00-\x7F]'`; o esperado é nenhuma linha.

- [ ] **Step 4: Dry-run no DEV (só leitura).** Na máquina com `az login` feito, sem `-Apply`: `pwsh -File packages/deploy/migrations/20261118-1800-rh-descontos-parcelas.ps1`. Esperado: as três linhas "DRY RUN …" e "dry-run: nada gravado.". O Deploy aplica de verdade depois do merge.

- [ ] **Step 5: Commit**

```bash
git add packages/deploy/migrations/20261118-1800-rh-descontos-parcelas.ps1
git commit -m "feat(rh): migration das parcelas de desconto em folha (multa, lançado em, até 12)"
```

---

### Task 2: Trava do termo aceita as gravações do desconto e fecha a brecha do cliente

**Files:**
- Modify: `packages/plugins/Betinhos.DriverRecordSharing/TermoMultaCommandPlugin.cs:67` e `:151-160`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/TermoMultaCommandPluginTests.cs:483-492`

**Interfaces:**
- Produces: gravação em `new_parcelamultafolha` permitida só quando o contexto pai é uma das APIs do termo, `cr40f_PassoMulta` ou `cr40f_LancarDescontoFolha` (ou tem a variável `termo_server_write`).

- [ ] **Step 1: Trocar o teste da brecha pelos testes novos.** Substitua o `[Theory] ParcelaSoMudaDePrevistaParaDescontadaOuCancelada` por:

```csharp
        [Theory]
        [InlineData(100000001)]
        [InlineData(100000002)]
        [InlineData(100000000)]
        public void ParcelaNaoMudaDeStatusPeloCliente(int novo)
        {
            var s = Cenario();
            var parcela = s.Add(new Entity("new_parcelamultafolha") { ["new_status"] = new OptionSetValue(100000000) });
            var target = new Entity("new_parcelamultafolha", parcela.Id) { ["new_status"] = new OptionSetValue(novo) };
            Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", target));
        }

        [Theory]
        [InlineData("cr40f_LancarDescontoFolha")]
        [InlineData("cr40f_PassoMulta")]
        public void ParcelaMudaPelasApisDoDesconto(string api)
        {
            var s = Cenario();
            var parcela = s.Add(new Entity("new_parcelamultafolha") { ["new_status"] = new OptionSetValue(100000000) });
            var target = new Entity("new_parcelamultafolha", parcela.Id) { ["new_status"] = new OptionSetValue(100000001), ["new_lancadoem"] = new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc) };
            AllowedGuard(s, "Update", target, new RemoteExecutionContext { MessageName = api });
        }

        [Fact]
        public void CreateDeParcelaPeloPassoDaMultaEhPermitido()
        {
            var s = Cenario();
            AllowedGuard(s, "Create", new Entity("new_parcelamultafolha") { ["new_valor"] = new Money(1m) }, new RemoteExecutionContext { MessageName = "cr40f_PassoMulta" });
        }
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests --filter "FullyQualifiedName~TermoMultaCommandPluginTests"`. Expected: FAIL em `ParcelaNaoMudaDeStatusPeloCliente(100000001)`, `(100000002)`, `ParcelaMudaPelasApisDoDesconto` e `CreateDeParcelaPeloPassoDaMultaEhPermitido`.

- [ ] **Step 3: Implementar.** Na linha 67:

```csharp
        // APIs que gravam termo e parcela pelo servidor. cr40f_PassoMulta e cr40f_LancarDescontoFolha (Cr40f.Frota.Plugin)
        // criam e lançam as parcelas do Acertar -> folha (RH bloco 1).
        private static readonly string[] Apis = { "new_EnviarTermoMulta", "new_AssinarTermoMulta", "new_ContestarTermoMulta", "new_CancelarTermoMulta", "new_ExpirarTermoMulta", "new_LembrarTermoMulta", "cr40f_PassoMulta", "cr40f_LancarDescontoFolha" };
```

No bloco `if (reference.LogicalName == ParcelaTable)` (linhas 151-160), troque o corpo por:

```csharp
            if (reference.LogicalName == ParcelaTable)
            {
                if (context.MessageName == "Create") throw new InvalidPluginExecutionException("Parcela de multa só é criada pela assinatura do termo ou pelo acerto da multa.");
                // Lançar e desfazer só pela cr40f_LancarDescontoFolha, que grava a data e encerra ou reabre a multa (spec RH §8).
                throw new InvalidPluginExecutionException(Bloqueado);
            }
```

No teste `CreateDeParcelaForaDoPluginEhBloqueado`, atualize a mensagem esperada para "Parcela de multa só é criada pela assinatura do termo ou pelo acerto da multa.". Se `Prevista`, `Descontada` ou `ParcelaCancelada` ficarem sem uso, o compilador avisa: remova só as constantes sem nenhuma referência.

- [ ] **Step 4: Rodar e ver passar.** Run: `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests`. Expected: PASS em tudo.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Betinhos.DriverRecordSharing packages/plugins/Betinhos.DriverRecordSharing.Tests
git commit -m "feat(termo): trava das parcelas aceita o desconto em folha e fecha a mudança direta do cliente"
```

---

### Task 3: Regras do desconto no servidor (`MultaParcelas` e `MultaEtapas`) e fixture

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/MultaParcelas.cs`
- Modify: `packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/MultaParcelasTests.cs` (novo), `ParidadeMultaTests.cs` e `Fixtures/multa-etapas.json`

**Interfaces:**
- Produces:
  - `ParcelaPlano { int Numero; int Total; string Competencia /* yyyy-MM-01 */; decimal Valor }`
  - `MultaParcelas.Dividir(decimal valor, int n, string primeira) : List<ParcelaPlano>`
  - `MultaParcelas.Competencia(string mes) : string` (`yyyy-MM` ou `yyyy-MM-01` → `yyyy-MM-01`)
  - `MultaParcelas.Janela(string hoje) : (string De, string Ate)`
  - `MultaParcelas.MesBr(string iso) : string` (`2026-10-01` → `10/2026`)
  - `Passos.ConcluirDesconto = "ConcluirDesconto"` e `Passos.ReabrirDesconto = "ReabrirDesconto"`
  - `DadosPasso.Parcelas : int?` (JSON `parcelas`)
  - `MultaEstado.ParcelasPrevistas`, `ParcelasDescontadas : int?` (JSON `parcelasPrevistas`, `parcelasDescontadas`; fora de `Campos`)
  - `MultaSituacao.Descontando : bool` (JSON `descontando`, Order 7)
  - `MultaEtapas.Descontando(MultaEstado m) : bool`

- [ ] **Step 1: Teste da divisão.** Crie `MultaParcelasTests.cs`:

```csharp
using System.Linq;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaParcelasTests
{
    [Theory]
    [InlineData(100.00, 3, "33.33,33.33,33.34")]
    [InlineData(0.05, 2, "0.02,0.03")]
    [InlineData(300.00, 3, "100.00,100.00,100.00")]
    [InlineData(130.16, 1, "130.16")]
    [InlineData(1000.00, 12, "83.33,83.33,83.33,83.33,83.33,83.33,83.33,83.33,83.33,83.33,83.33,83.37")]
    public void Divide_truncando_e_sobra_na_ultima(double valor, int n, string esperado)
    {
        var plano = MultaParcelas.Dividir((decimal)valor, n, "2026-12");
        Assert.Equal(esperado, string.Join(",", plano.Select(p => p.Valor.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture))));
        Assert.Equal((decimal)valor, plano.Sum(p => p.Valor));
        Assert.All(plano, p => Assert.Equal(n, p.Total));
        Assert.Equal(Enumerable.Range(1, n), plano.Select(p => p.Numero));
    }

    [Fact]
    public void Competencias_viram_o_ano()
    {
        var plano = MultaParcelas.Dividir(90m, 3, "2026-11-01");
        Assert.Equal(new[] { "2026-11-01", "2026-12-01", "2027-01-01" }, plano.Select(p => p.Competencia));
    }

    [Theory]
    [InlineData("2026-11-17", "2026-10-01", "2027-11-01")]
    [InlineData("2027-01-05", "2026-12-01", "2028-01-01")]
    public void Janela_vai_do_mes_anterior_ate_doze_meses(string hoje, string de, string ate)
    {
        Assert.Equal((de, ate), MultaParcelas.Janela(hoje));
    }

    [Fact]
    public void Mes_por_extenso() => Assert.Equal("10/2026", MultaParcelas.MesBr("2026-10-01"));
}
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~MultaParcelasTests"`. Expected: FAIL de compilação ("MultaParcelas does not exist").

- [ ] **Step 3: Implementar `MultaParcelas.cs`:**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Cr40f.Frota.Plugin;

public sealed class ParcelaPlano
{
    public int Numero { get; set; }
    public int Total { get; set; }
    /// <summary>yyyy-MM-01.</summary>
    public string Competencia { get; set; } = "";
    public decimal Valor { get; set; }
}

/// <summary>Parcelas do Acertar -> folha (spec RH §3). Espelho: dividirParcelas/janelaCompetencia de multaEtapas.ts; paridade em
/// Fixtures/multa-etapas.json (seção "divisoes"). O termo de multa tem divisão própria (sobra nas primeiras) e não usa esta classe.</summary>
public static class MultaParcelas
{
    public const int Maximo = 12;

    public static List<ParcelaPlano> Dividir(decimal valor, int n, string primeira)
    {
        if (n < 1 || n > Maximo) throw new ArgumentOutOfRangeException(nameof(n));
        var centavos = (long)decimal.Round(valor * 100m, 0, MidpointRounding.AwayFromZero);
        var parcela = centavos / n;
        var inicio = Mes(Competencia(primeira));
        var plano = new List<ParcelaPlano>(n);
        for (var i = 1; i <= n; i++)
            plano.Add(new ParcelaPlano
            {
                Numero = i,
                Total = n,
                Competencia = inicio.AddMonths(i - 1).ToString("yyyy-MM-01", CultureInfo.InvariantCulture),
                Valor = (i == n ? centavos - parcela * (n - 1) : parcela) / 100m,
            });
        return plano;
    }

    public static string Competencia(string mes) => mes.Length == 7 ? mes + "-01" : mes.Substring(0, 7) + "-01";

    public static (string De, string Ate) Janela(string hoje)
    {
        var mes = Mes(Competencia(hoje.Substring(0, 7)));
        return (mes.AddMonths(-1).ToString("yyyy-MM-01", CultureInfo.InvariantCulture), mes.AddMonths(Maximo).ToString("yyyy-MM-01", CultureInfo.InvariantCulture));
    }

    public static string MesBr(string iso) => iso.Substring(5, 2) + "/" + iso.Substring(0, 4);

    private static DateTime Mes(string iso) => DateTime.ParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
```

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Expected: PASS.

- [ ] **Step 5: Fixture: casos novos e caso alterado.** Em `Fixtures/multa-etapas.json` (o `hoje` é `2026-11-17`):

Troque a aplicação `"acerto na folha"` por:

```json
{ "nome": "acerto na folha em 3 parcelas: não encerra", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12", "parcelas": 3 }, "mudancas": ["acertoEm=2026-11-17", "competencia=2026-12-01"] }
```

Acrescente em `aplicacoes`:

```json
{ "nome": "concluir desconto encerra no dia do último lançamento", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1", "competencia": "2026-12-01", "acertoEm": "2026-11-10", "parcelasPrevistas": 0, "parcelasDescontadas": 3 }, "passo": "ConcluirDesconto", "dados": { "data": "2026-11-17" }, "mudancas": ["encerradaEm=2026-11-17", "status=202410005"] },
{ "nome": "reabrir desconto volta para acertar e limpa o encerramento", "multa": { "status": 202410005, "valorPago": 100, "motoristaId": "f1", "competencia": "2026-12-01", "acertoEm": "2026-11-10", "encerradaEm": "2026-11-15", "parcelasPrevistas": 1, "parcelasDescontadas": 2 }, "passo": "ReabrirDesconto", "dados": {}, "mudancas": ["encerradaEm=null", "status=202410006"] }
```

> Antes de colar, confira como o fixture escreve um campo limpo: procure `=null` nos casos de `mudancas` (`grep -n '=null' Fixtures/multa-etapas.json`). Se o formato for outro, use o mesmo.

Acrescente em `validacoes` (os três de "mês do desconto" que já existem continuam iguais):

```json
{ "nome": "folha sem valor pago", "multa": { "status": 202410006, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12" }, "erro": "Registre o pagamento antes de lançar na folha." },
{ "nome": "folha sem motorista", "multa": { "status": 202410006, "valorPago": 100 }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12" }, "erro": "A multa não tem motorista; defina o responsável antes." },
{ "nome": "folha antes do mês anterior", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-09" }, "erro": "Escolha um mês entre 10/2026 e 11/2027." },
{ "nome": "folha depois de 12 meses", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2027-12" }, "erro": "Escolha um mês entre 10/2026 e 11/2027." },
{ "nome": "folha no mês anterior vale", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-10" }, "erro": null },
{ "nome": "folha com 13 parcelas", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12", "parcelas": 13 }, "erro": "Escolha de 1 a 12 parcelas." },
{ "nome": "folha com 0 parcelas", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12", "parcelas": 0 }, "erro": "Escolha de 1 a 12 parcelas." },
{ "nome": "descontando não aceita novo acerto", "multa": { "status": 202410006, "valorPago": 100, "motoristaId": "f1", "competencia": "2026-12-01", "acertoEm": "2026-11-10" }, "passo": "RegistrarAcerto", "dados": { "acerto": "folha", "competencia": "2026-12" }, "erro": "Este passo não vale para a etapa atual da multa. Recarregue a tela." },
{ "nome": "concluir com parcela prevista", "multa": { "status": 202410006, "competencia": "2026-12-01", "acertoEm": "2026-11-10", "parcelasPrevistas": 1, "parcelasDescontadas": 2 }, "passo": "ConcluirDesconto", "dados": {}, "erro": "Ainda há parcelas previstas desta multa." },
{ "nome": "concluir fora do desconto", "multa": { "status": 202410006 }, "passo": "ConcluirDesconto", "dados": {}, "erro": "Esta multa não está descontando em folha." },
{ "nome": "reabrir sem parcela prevista", "multa": { "status": 202410005, "competencia": "2026-12-01", "acertoEm": "2026-11-10", "encerradaEm": "2026-11-15", "parcelasPrevistas": 0, "parcelasDescontadas": 3 }, "passo": "ReabrirDesconto", "dados": {}, "erro": "Não há parcela prevista para reabrir a multa." },
{ "nome": "reabrir multa que não foi para a folha", "multa": { "status": 202410005, "encerradaEm": "2026-11-15" }, "passo": "ReabrirDesconto", "dados": {}, "erro": "Só reabre multa encerrada pelo desconto em folha." },
{ "nome": "cancelar com parcela prevista", "multa": { "status": 202410006, "competencia": "2026-12-01", "acertoEm": "2026-11-10", "parcelasPrevistas": 2, "parcelasDescontadas": 1 }, "passo": "Cancelar", "dados": { "motivoTexto": "Teste de cancelamento" }, "erro": "Esta multa tem parcelas previstas na folha e não pode ser cancelada." }
```

> Se o caso de validação não aceitar `"erro": null`, confira em `CasoValidacao` (o campo `Erro` é `string?`) e no teste TS como o caso sem erro é escrito hoje, e use o mesmo formato.

Acrescente em `avaliacoes`:

```json
{ "nome": "descontando em folha: sem passo pendente", "multa": { "status": 202410006, "competencia": "2026-12-01", "acertoEm": "2026-11-10" }, "etapa": "acertar", "pendentes": [], "proximoPasso": "Descontando em folha", "proximoPrazo": null, "prazoVencido": false, "aguardandoPenalidade": false, "descontando": true }
```

Crie a seção nova `divisoes` no topo do arquivo, depois de `hoje`:

```json
"divisoes": [
  { "valor": 100, "parcelas": 3, "primeira": "2026-12", "esperado": [{ "numero": 1, "competencia": "2026-12-01", "valor": 33.33 }, { "numero": 2, "competencia": "2027-01-01", "valor": 33.33 }, { "numero": 3, "competencia": "2027-02-01", "valor": 33.34 }] },
  { "valor": 0.05, "parcelas": 2, "primeira": "2026-11-01", "esperado": [{ "numero": 1, "competencia": "2026-11-01", "valor": 0.02 }, { "numero": 2, "competencia": "2026-12-01", "valor": 0.03 }] },
  { "valor": 250, "parcelas": 1, "primeira": "2026-10", "esperado": [{ "numero": 1, "competencia": "2026-10-01", "valor": 250 }] }
]
```

- [ ] **Step 6: Paridade no C#.** Em `ParidadeMultaTests.cs`:
  - Em `FixtureMultas`: `[DataMember(Name = "divisoes")] public List<CasoDivisao> Divisoes { get; set; } = new();`.
  - Em `CasoAvaliacao`: `[DataMember(Name = "descontando")] public bool Descontando { get; set; }`.
  - Na asserção das avaliações, inclua `Assert.Equal(c.Descontando, s.Descontando)`.
  - Classe e teste novos:

```csharp
[DataContract]
public sealed class CasoDivisao
{
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
    [DataMember(Name = "parcelas")] public int Parcelas { get; set; }
    [DataMember(Name = "primeira")] public string Primeira { get; set; } = "";
    [DataMember(Name = "esperado")] public List<ParcelaEsperada> Esperado { get; set; } = new();
}

[DataContract]
public sealed class ParcelaEsperada
{
    [DataMember(Name = "numero")] public int Numero { get; set; }
    [DataMember(Name = "competencia")] public string Competencia { get; set; } = "";
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
}
```

```csharp
    [Fact]
    public void Divisoes_do_fixture()
    {
        foreach (var c in FixtureMultas.Carregar().Divisoes)
        {
            var plano = MultaParcelas.Dividir(c.Valor, c.Parcelas, c.Primeira);
            Assert.Equal(c.Esperado.Select(e => (e.Numero, e.Competencia, e.Valor)), plano.Select(p => (p.Numero, p.Competencia, p.Valor)));
        }
    }
```

Se houver um teste de contagem dos casos no C#, atualize as contagens para os números novos do fixture.

- [ ] **Step 7: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~Paridade"`. Expected: FAIL nas validações e aplicações novas, e erro de compilação em `Descontando` e `Parcelas`.

- [ ] **Step 8: Implementar em `MultaEtapas.cs`.**

Em `Passos`:

```csharp
    /// <summary>Internos: só a cr40f_LancarDescontoFolha chama (via Execute de cr40f_PassoMulta); direto do cliente recusam pelas mesmas regras.</summary>
    public const string ConcluirDesconto = "ConcluirDesconto";
    public const string ReabrirDesconto = "ReabrirDesconto";
    public static readonly string[] Todos = { DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer, ResultadoRecurso, ConcluirDesconto, ReabrirDesconto };
```

Em `MultaEstado` (depois de `RecursoPendente`; não entram em `Campos` porque não são colunas da multa):

```csharp
    /// <summary>Contagem de new_parcelamultafolha da multa, carregada pelo passo. Ausente = 0.</summary>
    [DataMember(Name = "parcelasPrevistas")] public int? ParcelasPrevistas { get; set; }
    [DataMember(Name = "parcelasDescontadas")] public int? ParcelasDescontadas { get; set; }
```

Em `DadosPasso`: `[DataMember(Name = "parcelas")] public int? Parcelas { get; set; }`, e acrescente `parcelas 1 a 12` no comentário da classe.

Em `MultaSituacao`: `[DataMember(Name = "descontando", Order = 7)] public bool Descontando { get; set; }`.

Em `RotuloPasso`: `[Passos.ConcluirDesconto] = "Concluir desconto"` e `[Passos.ReabrirDesconto] = "Reabrir desconto"`.

Método novo, ao lado de `AceitePendente`:

```csharp
    /// <summary>Acertar -> folha já gravado: a multa espera as parcelas serem lançadas (spec RH §3).</summary>
    public static bool Descontando(MultaEstado m) => Etapa(m.Status) == Acertar && m.Competencia != null && m.AcertoEm != null;
```

Em `Avaliar`, troque `case Acertar:` e o `ProximoPasso`:

```csharp
            case Acertar:
                if (Descontando(m)) s.Descontando = true;
                else s.Pendentes.Add(Passos.RegistrarAcerto);
                break;
```

```csharp
        s.ProximoPasso = s.Pendentes.Count > 0 ? RotuloPasso[s.Pendentes[0]]
            : s.AguardandoPenalidade ? "Aguardando penalidade"
            : s.Descontando ? "Descontando em folha"
            : etapa == Cancelada ? "Cancelada" : etapa == Encerrada ? "Encerrada" : "";
```

Em `Validar`, no primeiro `switch` (o de `PrazoVencido`, `Cancelar` e `Recorrer`), mude `Cancelar` e acrescente os dois passos internos:

```csharp
            case Passos.Cancelar:
                if (!Aberta(s.Etapa)) return "Esta multa já está encerrada.";
                if (m.ParcelasPrevistas > 0) return "Esta multa tem parcelas previstas na folha e não pode ser cancelada.";
                var motivo = d.MotivoTexto?.Trim() ?? "";
                if (motivo.Length < 5) return "Escreva o motivo do cancelamento.";
                return motivo.Length > 2000 ? "O motivo do cancelamento passa de 2.000 caracteres." : null;
            case Passos.ConcluirDesconto:
                if (!Descontando(m)) return "Esta multa não está descontando em folha.";
                return m.ParcelasPrevistas > 0 || !(m.ParcelasDescontadas > 0) ? "Ainda há parcelas previstas desta multa." : null;
            case Passos.ReabrirDesconto:
                if (s.Etapa != Encerrada || m.Competencia == null || m.AcertoEm == null) return "Só reabre multa encerrada pelo desconto em folha.";
                return m.ParcelasPrevistas > 0 ? null : "Não há parcela prevista para reabrir a multa.";
```

No segundo `switch`, troque `case Passos.RegistrarAcerto:`:

```csharp
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") return ValidarFolha(m, d, hoje);
                if (d.Acerto == "empresa") return MotivoDe(d.Motivo) == null ? "Escolha o motivo de a empresa assumir." : null;
                return "Escolha: lancei na folha ou empresa assume.";
```

Método novo:

```csharp
    private static string? ValidarFolha(MultaEstado m, DadosPasso d, string hoje)
    {
        if (d.Competencia == null || !MesIso.IsMatch(d.Competencia)) return "Informe o mês do desconto.";
        if (!(m.ValorPago > 0)) return "Registre o pagamento antes de lançar na folha.";
        if (string.IsNullOrWhiteSpace(m.MotoristaId)) return "A multa não tem motorista; defina o responsável antes.";
        var (de, ate) = MultaParcelas.Janela(hoje);
        var c = MultaParcelas.Competencia(d.Competencia);
        if (string.CompareOrdinal(c, de) < 0 || string.CompareOrdinal(c, ate) > 0) return $"Escolha um mês entre {MultaParcelas.MesBr(de)} e {MultaParcelas.MesBr(ate)}.";
        var n = d.Parcelas ?? 1;
        return n < 1 || n > MultaParcelas.Maximo ? "Escolha de 1 a 12 parcelas." : null;
    }
```

Em `Aplicar`, troque `case Passos.RegistrarAcerto:` e acrescente os passos internos:

```csharp
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") { n.Competencia = MultaParcelas.Competencia(d.Competencia!); n.AcertoEm = hoje; } // segue em Acertar até a última parcela
                else { n.MotivoEmpresa = MotivoDe(d.Motivo); n.AcertoEm = hoje; n.EncerradaEm = hoje; n.Status = MultaCodigos.Encerrada; }
                break;
            case Passos.ConcluirDesconto:
                n.EncerradaEm = string.IsNullOrWhiteSpace(d.Data) ? hoje : d.Data; n.Status = MultaCodigos.Encerrada;
                break;
            case Passos.ReabrirDesconto:
                n.EncerradaEm = null; n.Status = MultaCodigos.Acertar;
                break;
```

> O `ConcluirDesconto` e o `ReabrirDesconto` ficam no primeiro `switch` do `Validar`, antes da checagem de pendentes, como `Cancelar`. Assim a multa descontando (sem pendentes) aceita os dois.

- [ ] **Step 9: Rodar e ver passar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`. Expected: PASS. Se `PassoMultaTests` tiver um caso de acerto na folha que espera encerrar, ele falha aqui. Corrija na Task 5, que reescreve esse teste, e anote no commit.

- [ ] **Step 10: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(multas): regras do desconto em folha (parcelas, janela, descontando, concluir e reabrir)"
```

---

### Task 4: Espelho no shell (`multaEtapas.ts`) e paridade

**Files:**
- Modify: `apps/shell/src/pages/frota/domain/multaEtapas.ts`
- Test: `apps/shell/src/pages/frota/domain/multaEtapas.test.ts` e `paridade.test.ts` (o que lê `multa-etapas.json`; confira com `grep -ln "multa-etapas.json" apps/shell/src/pages/frota/domain/*.test.ts`)

**Interfaces:**
- Consumes: as regras e mensagens da Task 3.
- Produces:
  - `PASSOS` com `'ConcluirDesconto' | 'ReabrirDesconto'`
  - `MultaEstado.parcelasPrevistas?: number | null` e `parcelasDescontadas?: number | null`
  - `DadosPasso.parcelas?: number`
  - `Situacao.descontando: boolean`
  - `descontando(m: MultaEstado): boolean`
  - `type ParcelaPlano = { numero: number; total: number; competencia: string; valor: number }`
  - `dividirParcelas(valor: number, n: number, primeira: string): ParcelaPlano[]`
  - `janelaCompetencia(hoje: string): { de: string; ate: string }`
  - `mesBr(iso: string): string`
  - `previaParcelas(valor: number, n: number): string`

- [ ] **Step 1: Testes.** Em `multaEtapas.test.ts`:

```ts
import { dividirParcelas, janelaCompetencia, previaParcelas } from './multaEtapas'

describe('parcelas da folha', () => {
  it('trunca e põe a sobra na última', () => {
    expect(dividirParcelas(100, 3, '2026-12').map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    expect(dividirParcelas(0.05, 2, '2026-12').map((p) => p.valor)).toEqual([0.02, 0.03])
  })
  it('competências viram o ano', () => {
    expect(dividirParcelas(90, 3, '2026-11-01').map((p) => p.competencia)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
  it('janela do mês anterior até 12 meses', () => {
    expect(janelaCompetencia('2026-11-17')).toEqual({ de: '2026-10-01', ate: '2027-11-01' })
  })
  it('prévia', () => {
    expect(previaParcelas(100, 3)).toBe('3× R$ 33,33 · última R$ 33,34')
    expect(previaParcelas(100, 2)).toBe('2× R$ 50,00')
    expect(previaParcelas(130.16, 1)).toBe('1× R$ 130,16')
  })
})
```

No teste de paridade, acrescente o laço das `divisoes`, compare `descontando` nas avaliações e atualize a contagem `[18, 43, 23]` para os números novos de `[avaliacoes, validacoes, aplicacoes]`. Com os casos da Task 3, a conta é `[19, 56, 25]`; confira com `python3 -c "import json;d=json.load(open('packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json'));print([len(d[k]) for k in ('avaliacoes','validacoes','aplicacoes')])"`.

```ts
  it('divisões do fixture', () => {
    for (const c of fixture.divisoes) {
      expect(dividirParcelas(c.valor, c.parcelas, c.primeira).map(({ numero, competencia, valor }) => ({ numero, competencia, valor }))).toEqual(c.esperado)
    }
  })
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm --filter shell exec vitest run src/pages/frota/domain/multaEtapas.test.ts src/pages/frota/domain/paridade.test.ts`. Expected: FAIL ("dividirParcelas is not exported" e os casos novos).

- [ ] **Step 3: Implementar.** Em `multaEtapas.ts`, espelhe a Task 3 linha por linha:
  - `PASSOS` com os dois passos internos no fim; `ROTULO_PASSO` com "Concluir desconto" e "Reabrir desconto".
  - Campos novos em `MultaEstado`, `DadosPasso` e `Situacao`.
  - `export const descontando = (m: MultaEstado) => etapaDe(m.status) === 'acertar' && !!m.competencia && !!m.acertoEm`.
  - `avaliar`: o `case 'acertar'` e o `proximoPasso` "Descontando em folha" iguais ao C#, e `descontando` no objeto devolvido (`false` nos demais casos).
  - `validarPasso`: os mesmos `case` e a mesma ordem; `(m.parcelasPrevistas ?? 0) > 0` no lugar de `m.ParcelasPrevistas > 0`.
  - `aplicarPasso`: os mesmos três `case`.
  - Funções novas:

```ts
const MAXIMO_PARCELAS = 12
const somaMeses = (iso: string, meses: number) => {
  const [a, m] = iso.split('-').map(Number)
  const t = a * 12 + (m - 1) + meses
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}
export const competenciaDe = (mes: string) => `${mes.slice(0, 7)}-01`
export const mesBr = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export function janelaCompetencia(hoje: string) {
  const mes = competenciaDe(hoje)
  return { de: somaMeses(mes, -1), ate: somaMeses(mes, MAXIMO_PARCELAS) }
}
export type ParcelaPlano = { numero: number; total: number; competencia: string; valor: number }
export function dividirParcelas(valor: number, n: number, primeira: string): ParcelaPlano[] {
  const centavos = Math.round(valor * 100)
  const parcela = Math.floor(centavos / n)
  const inicio = competenciaDe(primeira)
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1, total: n, competencia: somaMeses(inicio, i),
    valor: (i === n - 1 ? centavos - parcela * (n - 1) : parcela) / 100,
  }))
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
export function previaParcelas(valor: number, n: number) {
  const plano = dividirParcelas(valor, n, '2000-01')
  const primeira = plano[0].valor, ultima = plano[n - 1].valor
  return ultima === primeira ? `${n}× ${brl(primeira)}` : `${n}× ${brl(primeira)} · última ${brl(ultima)}`
}
```

A mensagem da janela usa `` `Escolha um mês entre ${mesBr(de)} e ${mesBr(ate)}.` ``. `MultaEtapas.Competencia` do C# e `competenciaDe` aceitam `yyyy-MM` e `yyyy-MM-dd`.

> Se o shell já tiver `formatMoney` em `pages/frota/data/format.ts`, use ele no lugar de `brl`, desde que o teste da prévia passe com o mesmo texto.

- [ ] **Step 4: Rodar e ver passar.** Run: `pnpm --filter shell exec vitest run src/pages/frota` e `pnpm --filter shell typecheck`. Expected: PASS. O `Record<Passo, string>` obriga a ter os rótulos novos; o typecheck acusa se faltar algum.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/domain packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json
git commit -m "feat(multas): espelho do desconto em folha no shell e paridade"
```

---

### Task 5: Passo da multa conta e cria as parcelas

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/PassoMultaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/PassoMultaTests.cs` e `FakeMundo.cs` (se precisar)

**Interfaces:**
- Consumes: `MultaParcelas.Dividir`, `MultaEstado.ParcelasPrevistas/ParcelasDescontadas` (Task 3).
- Produces:
  - `PassoMultaPlugin.Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje, IOrganizationService? sistema = null, Guid? dono = null) : string`
  - `PassoMultaPlugin.Parcelas = "new_parcelamultafolha"`, `Prevista = 100000000`, `Descontada = 100000001`
  - `PassoMultaPlugin.ContarParcelas(IOrganizationService s, Guid multaId, MultaEstado e) : void`

- [ ] **Step 1: Testes.** Em `PassoMultaTests.cs`:

```csharp
    private static Entity MultaParaFolha(FakeMundo mundo, Guid motorista) => Multa(mundo, MultaCodigos.Acertar, m =>
    {
        m["cr40f_valorpago"] = new Money(100m);
        m["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", motorista);
        m["cr40f_pagaem"] = new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc);
    });

    [Fact]
    public void Folha_em_tres_cria_as_parcelas_e_nao_encerra()
    {
        var mundo = new FakeMundo();
        var motorista = Guid.NewGuid();
        var dono = Guid.NewGuid();
        var multa = MultaParaFolha(mundo, motorista);

        var json = PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\",\"parcelas\":3}", Hoje, mundo, dono);

        var parcelas = mundo.Criados.Where(e => e.LogicalName == PassoMultaPlugin.Parcelas).OrderBy(e => e.GetAttributeValue<int>("new_numero")).ToList();
        Assert.Equal(new[] { 33.33m, 33.33m, 33.34m }, parcelas.Select(p => p.GetAttributeValue<Money>("new_valor").Value));
        Assert.Equal(new[] { "Multa 1A2B3C · 1/3", "Multa 1A2B3C · 2/3", "Multa 1A2B3C · 3/3" }, parcelas.Select(p => p.GetAttributeValue<string>("new_name")));
        Assert.Equal(new DateTime(2027, 2, 1, 12, 0, 0, DateTimeKind.Utc), parcelas[2]["new_competencia"]);
        Assert.All(parcelas, p =>
        {
            Assert.Equal(multa.Id, p.GetAttributeValue<EntityReference>("new_multa").Id);
            Assert.Equal(motorista, p.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(100000000, p.GetAttributeValue<OptionSetValue>("new_status").Value);
            Assert.Equal(dono, p.GetAttributeValue<EntityReference>("ownerid").Id);
        });
        var gravado = mundo.Atualizados.Single();
        Assert.False(gravado.Contains("cr40f_status"));
        Assert.False(gravado.Contains("cr40f_encerradaem"));
        Assert.Contains("\"descontando\":true", json);
        Assert.Contains("\"proximoPasso\":\"Descontando em folha\"", json);
    }

    [Fact]
    public void Folha_sem_parcelas_informadas_gera_uma()
    {
        var mundo = new FakeMundo();
        var multa = MultaParaFolha(mundo, Guid.NewGuid());
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\"}", Hoje);
        var p = Assert.Single(mundo.Criados.Where(e => e.LogicalName == PassoMultaPlugin.Parcelas));
        Assert.Equal(100m, p.GetAttributeValue<Money>("new_valor").Value);
        Assert.Equal("Multa 1A2B3C · 1/1", p["new_name"]);
    }

    [Fact]
    public void Recusa_da_folha_nao_cria_parcela()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Acertar, m => m["cr40f_valorpago"] = new Money(100m));
        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\"}", Hoje));
        Assert.Equal("A multa não tem motorista; defina o responsável antes.", erro.Message);
        Assert.Empty(mundo.Criados);
    }

    [Fact]
    public void Cancelar_com_parcela_prevista_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = MultaParaFolha(mundo, Guid.NewGuid());
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\",\"parcelas\":2}", Hoje);
        foreach (var p in mundo.Criados.ToList()) mundo.Add(p); // o FakeMundo guarda o que foi criado? Ver Step 2.

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.Cancelar, "{\"motivoTexto\":\"Teste de cancelamento\"}", Hoje));
        Assert.Equal("Esta multa tem parcelas previstas na folha e não pode ser cancelada.", erro.Message);
    }
```

Reescreva o teste antigo de acerto na folha que esperava encerrar (procure `"acerto\":\"folha\"` no arquivo): ele passa a esperar a criação da parcela e a multa em Acertar, como `Folha_sem_parcelas_informadas_gera_uma`.

- [ ] **Step 2: Conferir o `FakeMundo`.** Leia `FakeMundo.Create` (linha 45) e `RetrieveMultiple` (linha 63):
  - Se `Create` já guarda a linha em `Linhas(tabela)`, apague a linha `foreach (var p in mundo.Criados.ToList()) mundo.Add(p);` do teste.
  - Se a condição `Equal` compara o valor gravado (`EntityReference`) direto com o `Guid` da condição, faça o comparador usar `(valor as EntityReference)?.Id ?? valor`. É uma linha no método que compara as condições.

- [ ] **Step 3: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~PassoMultaTests"`. Expected: FAIL (`Parcelas` não existe e nenhuma parcela é criada).

- [ ] **Step 4: Implementar.** Em `PassoMultaPlugin`:

```csharp
    public const string Parcelas = "new_parcelamultafolha";
    public const int Prevista = 100000000, Descontada = 100000001;
```

No `Execute`, troque a linha do `Executar`:

```csharp
            // Parcelas: a trava do termo só deixa o servidor gravar; criadas pelo SYSTEM com o dono = quem fez o acerto.
            context.OutputParameters["MultaJson"] = Executar(factory.CreateOrganizationService(context.UserId), multaId, passo, dados, hoje, factory.CreateOrganizationService(null), context.UserId);
```

E o `Executar`:

```csharp
    public static string Executar(IOrganizationService service, Guid multaId, string passo, string? dadosJson, string hoje, IOrganizationService? sistema = null, Guid? dono = null)
    {
        sistema ??= service;
        DadosPasso? dados;
        try { dados = string.IsNullOrWhiteSpace(dadosJson) ? null : Json.Ler<DadosPasso>(dadosJson!); }
        catch (Exception) { throw new InvalidPluginExecutionException("Dados do passo inválidos."); }
        dados ??= new DadosPasso();
        var linha = service.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas));
        var antes = MultaMapper.Estado(linha);
        ContarParcelas(sistema, multaId, antes);
        var erro = MultaEtapas.Validar(antes, passo, dados, hoje);
        if (erro != null) throw new InvalidPluginExecutionException(erro);
        var trocaMotorista = (passo == Passos.DefinirResponsavel && dados.Responsavel == "motorista") || !string.IsNullOrWhiteSpace(dados.MotoristaId);
        if (trocaMotorista && !Guid.TryParse(dados.MotoristaId, out _)) throw new InvalidPluginExecutionException("Motorista inválido.");
        var depois = MultaEtapas.Aplicar(antes, passo, dados, hoje);
        if (passo == Passos.RegistrarAcerto && dados.Acerto == "folha")
            CriarParcelas(sistema, multaId, linha.GetAttributeValue<string>("cr40f_novacoluna") ?? "sem número", antes, dados, dono);
        var mudancas = MultaEtapas.Mudancas(antes, depois);
        if (mudancas.Count > 0) service.Update(MultaMapper.Gravacao(multaId, mudancas));
        return Json.Serializar(MultaEtapas.Avaliar(depois, hoje));
    }

    public static void ContarParcelas(IOrganizationService s, Guid multaId, MultaEstado e)
    {
        var q = new QueryExpression(Parcelas) { ColumnSet = new ColumnSet("new_status") };
        q.Criteria.AddCondition("new_multa", ConditionOperator.Equal, multaId);
        var status = s.RetrieveMultiple(q).Entities.Select(p => p.GetAttributeValue<OptionSetValue>("new_status")?.Value).ToList();
        e.ParcelasPrevistas = status.Count(v => v == Prevista);
        e.ParcelasDescontadas = status.Count(v => v == Descontada);
    }

    private static void CriarParcelas(IOrganizationService s, Guid multaId, string auto, MultaEstado m, DadosPasso d, Guid? dono)
    {
        foreach (var p in MultaParcelas.Dividir(m.ValorPago!.Value, d.Parcelas ?? 1, d.Competencia!))
        {
            var e = new Entity(Parcelas)
            {
                ["new_name"] = $"Multa {auto} · {p.Numero}/{p.Total}",
                ["new_multa"] = new EntityReference(MultaMapper.Tabela, multaId),
                ["new_motorista"] = new EntityReference("cr40f_funcionarios", Guid.Parse(m.MotoristaId!)),
                ["new_numero"] = p.Numero,
                ["new_competencia"] = MultaMapper.DataGravada(p.Competencia),
                ["new_valor"] = new Money(p.Valor),
                ["new_status"] = new OptionSetValue(Prevista),
            };
            if (dono is Guid u && u != Guid.Empty) e["ownerid"] = new EntityReference("systemuser", u);
            s.Create(e);
        }
    }
```

Acrescente `using System.Linq;`. Confira no DEV, só leitura, que o alvo de `new_parcelamultafolha.new_motorista` é `cr40f_funcionarios` (`EntityDefinitions(LogicalName='new_parcelamultafolha')/Attributes(LogicalName='new_motorista')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`). O termo grava o mesmo `motoristaRef` da multa (`TermoMultaCommandPlugin.cs:450`).

- [ ] **Step 5: Rodar e ver passar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(multas): Acertar na folha cria as parcelas e a multa segue descontando"
```

---

### Task 6: Custom API `cr40f_LancarDescontoFolha`

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/LancarDescontoFolhaPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/LancarDescontoFolhaTests.cs`

**Interfaces:**
- Consumes: `PassoMultaPlugin.Executar`, `ContarParcelas`, `Parcelas`, `Prevista`, `Descontada` (Task 5); `MultaEtapas.Validar`, `Descontando` (Task 3).
- Produces:
  - Mensagem `cr40f_LancarDescontoFolha`, com entrada `ParcelaIdsJson` (string, JSON de GUIDs) e `Acao` (string `lancar` | `desfazer`) e saída `ResultadoJson` (string).
  - `ResultadoJson` = `{"parcelas":[{"id":"<guid>","ok":true,"erro":null}],"encerradas":["<multaId>"],"reabertas":["<multaId>"]}`.
  - `LancarDescontoFolhaPlugin.Executar(IOrganizationService sistema, IReadOnlyList<Guid> ids, string acao, string hoje, Action<Guid, string, string> passo) : ResultadoLancamento`.

- [ ] **Step 1: Testes.**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class LancarDescontoFolhaTests
{
    private const string Hoje = "2026-11-18";

    private static (FakeMundo Mundo, Guid Multa, List<Guid> Parcelas) Cenario(int n)
    {
        var mundo = new FakeMundo();
        var multa = mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "TST0001",
            ["cr40f_status"] = new OptionSetValue(MultaCodigos.Acertar),
            ["cr40f_valorpago"] = new Money(100m),
            ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        });
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, $"{{\"acerto\":\"folha\",\"competencia\":\"2026-11\",\"parcelas\":{n}}}", Hoje);
        foreach (var u in mundo.Atualizados.ToList()) Aplicar(mundo, u);
        mundo.Atualizados.Clear();
        return (mundo, multa.Id, mundo.Linhas(PassoMultaPlugin.Parcelas).Select(p => p.Id).ToList());
    }

    // O FakeMundo grava os Updates na linha? Se já gravar, Aplicar vira no-op (Step 2).
    private static void Aplicar(FakeMundo mundo, Entity u) { }

    private static Action<Guid, string, string> Passo(FakeMundo mundo) => (multa, passo, dados) => PassoMultaPlugin.Executar(mundo, multa, passo, dados, Hoje);

    private static int Status(FakeMundo m, Guid id) => m.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == id).GetAttributeValue<OptionSetValue>("new_status").Value;
    private static int StatusMulta(FakeMundo m, Guid id) => m.Linhas(MultaMapper.Tabela).Single(p => p.Id == id).GetAttributeValue<OptionSetValue>("cr40f_status").Value;

    [Fact]
    public void Lanca_a_primeira_e_a_multa_segue_aberta()
    {
        var (mundo, multa, ids) = Cenario(2);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[0] }, "lancar", Hoje, Passo(mundo));
        Assert.True(r.Parcelas.Single().Ok);
        Assert.Equal(PassoMultaPlugin.Descontada, Status(mundo, ids[0]));
        Assert.Equal(new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc), mundo.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == ids[0])["new_lancadoem"]);
        Assert.Empty(r.Encerradas);
        Assert.Equal(MultaCodigos.Acertar, StatusMulta(mundo, multa));
    }

    [Fact]
    public void Lancar_a_ultima_encerra_e_desfazer_reabre()
    {
        var (mundo, multa, ids) = Cenario(2);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, ids, "lancar", Hoje, Passo(mundo));
        Assert.Equal(new[] { multa.ToString() }, r.Encerradas);
        Assert.Equal(MultaCodigos.Encerrada, StatusMulta(mundo, multa));

        var d = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[1] }, "desfazer", Hoje, Passo(mundo));
        Assert.Equal(new[] { multa.ToString() }, d.Reabertas);
        Assert.Equal(PassoMultaPlugin.Prevista, Status(mundo, ids[1]));
        Assert.Null(mundo.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == ids[1])["new_lancadoem"]);
        Assert.Equal(MultaCodigos.Acertar, StatusMulta(mundo, multa));
        Assert.Null(mundo.Linhas(MultaMapper.Tabela).Single(p => p.Id == multa).GetAttributeValue<DateTime?>("cr40f_encerradaem"));
    }

    [Fact]
    public void Lote_com_recusa_no_meio_segue_as_outras()
    {
        var (mundo, _, ids) = Cenario(3);
        LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[1] }, "lancar", Hoje, Passo(mundo));
        var inexistente = Guid.NewGuid();
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[0], ids[1], inexistente, ids[2] }, "lancar", Hoje, Passo(mundo));
        Assert.Equal(new[] { true, false, false, true }, r.Parcelas.Select(p => p.Ok));
        Assert.Equal("Esta parcela já foi lançada.", r.Parcelas[1].Erro);
        Assert.Equal("Parcela não encontrada.", r.Parcelas[2].Erro);
        Assert.Single(r.Encerradas);
    }

    [Fact]
    public void Desfazer_parcela_prevista_recusa()
    {
        var (mundo, _, ids) = Cenario(1);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, ids, "desfazer", Hoje, Passo(mundo));
        Assert.Equal("Esta parcela ainda não foi lançada.", r.Parcelas.Single().Erro);
    }

    [Theory]
    [InlineData("apagar", 1, "Ação inválida: use lancar ou desfazer.")]
    [InlineData("lancar", 0, "Escolha de 1 a 200 parcelas.")]
    [InlineData("lancar", 201, "Escolha de 1 a 200 parcelas.")]
    public void Entrada_invalida_recusa(string acao, int quantos, string mensagem)
    {
        var mundo = new FakeMundo();
        var ids = Enumerable.Range(0, quantos).Select(_ => Guid.NewGuid()).ToList();
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => LancarDescontoFolhaPlugin.Executar(mundo, ids, acao, Hoje, Passo(mundo)));
        Assert.Equal(mensagem, erro.Message);
    }

    [Fact]
    public void Parcela_de_termo_lanca_sem_mexer_em_multa()
    {
        var mundo = new FakeMundo();
        var p = mundo.Add(new Entity(PassoMultaPlugin.Parcelas, Guid.NewGuid()) { ["new_status"] = new OptionSetValue(PassoMultaPlugin.Prevista), ["new_termo"] = new EntityReference("new_termomulta", Guid.NewGuid()) });
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { p.Id }, "lancar", Hoje, (_, _, _) => throw new Exception("não deveria chamar o passo"));
        Assert.True(r.Parcelas.Single().Ok);
        Assert.Empty(r.Encerradas);
    }
}
```

- [ ] **Step 2: Ajustar o cenário ao `FakeMundo`.** Se `FakeMundo.Update` já mescla os atributos na linha guardada e `Create` guarda em `Linhas`, apague `Aplicar` e as duas linhas que o usam. Se não mescla, implemente `Aplicar` como `foreach (var a in u.Attributes) mundo.Linhas(u.LogicalName).Single(l => l.Id == u.Id)[a.Key] = a.Value;` e chame-o também depois de cada `Executar` nos testes. O preferível é fazer o `FakeMundo.Update` mesclar, uma mudança de 3 linhas.

- [ ] **Step 3: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~LancarDescontoFolhaTests"`. Expected: FAIL de compilação.

- [ ] **Step 4: Implementar `LancarDescontoFolhaPlugin.cs`:**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class ResultadoParcela
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "ok", Order = 2)] public bool Ok { get; set; }
    [DataMember(Name = "erro", Order = 3)] public string? Erro { get; set; }
}

[DataContract]
public sealed class ResultadoLancamento
{
    [DataMember(Name = "parcelas", Order = 1)] public List<ResultadoParcela> Parcelas { get; set; } = new();
    [DataMember(Name = "encerradas", Order = 2)] public List<string> Encerradas { get; set; } = new();
    [DataMember(Name = "reabertas", Order = 3)] public List<string> Reabertas { get; set; } = new();
}

/// <summary>
/// Custom API global cr40f_LancarDescontoFolha (spec RH §5). Lança ou desfaz parcelas de new_parcelamultafolha em lote; recusa por linha.
/// A multa muda só por Execute de cr40f_PassoMulta (ConcluirDesconto/ReabrirDesconto), como quem chama, para a MultaTravaPlugin valer.
/// Um Execute aninhado que falha aborta a transação inteira mesmo capturado: por isso o passo só é chamado depois de MultaEtapas.Validar
/// aceitar localmente, e o erro dele nunca é capturado aqui.
/// </summary>
public sealed class LancarDescontoFolhaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_LancarDescontoFolha";
    public const int Cancelada = 100000002, Maximo = 200;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo lançamento da folha.");
            var json = context.InputParameters.Contains("ParcelaIdsJson") ? Convert.ToString(context.InputParameters["ParcelaIdsJson"]) : null;
            var acao = context.InputParameters.Contains("Acao") ? Convert.ToString(context.InputParameters["Acao"]) ?? "" : "";
            List<Guid> ids;
            try { ids = string.IsNullOrWhiteSpace(json) ? new List<Guid>() : Json.Ler<List<Guid>>(json!); }
            catch (Exception) { throw new InvalidPluginExecutionException("Lista de parcelas inválida."); }
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            var caller = factory.CreateOrganizationService(context.UserId);
            var r = Executar(factory.CreateOrganizationService(null), ids, acao, hoje, (multa, passo, dados) =>
                caller.Execute(new OrganizationRequest(PassoMultaPlugin.Mensagem) { ["MultaId"] = multa, ["Passo"] = passo, ["DadosJson"] = dados }));
            context.OutputParameters["ResultadoJson"] = Json.Serializar(r);
            tracing.Trace("{0}: {1} em {2} parcelas, {3} encerradas, {4} reabertas", Mensagem, acao, ids.Count, r.Encerradas.Count, r.Reabertas.Count);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw new InvalidPluginExecutionException("Não foi possível lançar as parcelas. Recarregue a tela e tente de novo.");
        }
    }

    public static ResultadoLancamento Executar(IOrganizationService sistema, IReadOnlyList<Guid> ids, string acao, string hoje, Action<Guid, string, string> passo)
    {
        if (acao != "lancar" && acao != "desfazer") throw new InvalidPluginExecutionException("Ação inválida: use lancar ou desfazer.");
        if (ids.Count < 1 || ids.Count > Maximo) throw new InvalidPluginExecutionException("Escolha de 1 a 200 parcelas.");
        var unicos = ids.Distinct().ToList();
        var q = new QueryExpression(PassoMultaPlugin.Parcelas) { ColumnSet = new ColumnSet("new_status", "new_multa") };
        q.Criteria.AddCondition("new_parcelamultafolhaid", ConditionOperator.In, unicos.Cast<object>().ToArray());
        var achadas = sistema.RetrieveMultiple(q).Entities.ToDictionary(e => e.Id);
        var lancar = acao == "lancar";
        var r = new ResultadoLancamento();
        var multas = new List<Guid>();
        foreach (var id in ids)
        {
            var linha = new ResultadoParcela { Id = id.ToString() };
            r.Parcelas.Add(linha);
            if (!achadas.TryGetValue(id, out var p)) { linha.Erro = "Parcela não encontrada."; continue; }
            var status = p.GetAttributeValue<OptionSetValue>("new_status")?.Value;
            linha.Erro = status == Cancelada ? "Esta parcela foi cancelada."
                : lancar && status == PassoMultaPlugin.Descontada ? "Esta parcela já foi lançada."
                : !lancar && status == PassoMultaPlugin.Prevista ? "Esta parcela ainda não foi lançada."
                : status != PassoMultaPlugin.Prevista && status != PassoMultaPlugin.Descontada ? "Situação da parcela desconhecida."
                : null;
            if (linha.Erro != null) continue;
            sistema.Update(new Entity(PassoMultaPlugin.Parcelas, id)
            {
                ["new_status"] = new OptionSetValue(lancar ? PassoMultaPlugin.Descontada : PassoMultaPlugin.Prevista),
                ["new_lancadoem"] = lancar ? MultaMapper.DataGravada(hoje) : null,
            });
            p["new_status"] = new OptionSetValue(lancar ? PassoMultaPlugin.Descontada : PassoMultaPlugin.Prevista); // repetida no lote vira recusa
            linha.Ok = true;
            if (p.GetAttributeValue<EntityReference>("new_multa") is EntityReference m && !multas.Contains(m.Id)) multas.Add(m.Id);
        }
        foreach (var multaId in multas)
        {
            var estado = MultaMapper.Estado(sistema.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas)));
            PassoMultaPlugin.ContarParcelas(sistema, multaId, estado);
            var nome = lancar ? Passos.ConcluirDesconto : Passos.ReabrirDesconto;
            var dados = lancar ? new DadosPasso { Data = hoje } : new DadosPasso();
            if (MultaEtapas.Validar(estado, nome, dados, hoje) != null) continue; // ainda há prevista, ou nada a reabrir
            passo(multaId, nome, Json.Serializar(dados));
            (lancar ? r.Encerradas : r.Reabertas).Add(multaId.ToString());
        }
        return r;
    }
}
```

> `Json.Serializar(new DadosPasso { Data = hoje })` precisa produzir `{"data":"2026-11-18"}`. Se o serializador escrever os campos nulos, o `Json.Ler` do passo aceita do mesmo jeito. Confira em `Json.cs`.

- [ ] **Step 5: Rodar e ver passar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(rh): Custom API cr40f_LancarDescontoFolha (lançar e desfazer em lote, encerra e reabre a multa)"
```

---

### Task 7: Registrador da frota

**Files:**
- Modify: `packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs` (array `apis`, depois de `cr40f_MultasDoDia`)

**Interfaces:**
- Consumes: `Cr40f.Frota.Plugin.LancarDescontoFolhaPlugin` (Task 6).

- [ ] **Step 1: Acrescentar a Api.**

```csharp
    new Api("Cr40f.Frota.Plugin.LancarDescontoFolhaPlugin", "cr40f_LancarDescontoFolha", "RH | Lançar desconto em folha",
        "Lança ou desfaz parcelas de desconto em folha (new_parcelamultafolha) em lote; encerra ou reabre a multa pelo cr40f_PassoMulta. Recusa por parcela.", "prvWritecr40f_multas",
        new[]
        {
            new Param("ParcelaIdsJson", TipoString, "Lista JSON de GUIDs de new_parcelamultafolha (até 200)."),
            new Param("Acao", TipoString, "lancar | desfazer"),
        },
        new[] { new Param("ResultadoJson", TipoString, "{parcelas:[{id,ok,erro}], encerradas:[multaId], reabertas:[multaId]}") }),
```

Confira a ordem dos argumentos de `Param` (nome, tipo, descrição, opcional) no `cr40f_PassoMulta` logo acima e siga a mesma.

- [ ] **Step 2: Compilar.** Run: `dotnet build packages/plugins/tools/Cr40f.Frota.Registrar`. Expected: build OK. Se o registrador tiver um modo `--dry-run` ou teste de listagem (veja o `README` ou o `Main`), rode e confira que aparece `cr40f_LancarDescontoFolha`. Não rode contra o DEV: quem registra é o Deploy.

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs
git commit -m "feat(rh): registrador da frota inclui cr40f_LancarDescontoFolha"
```

---

### Task 8: E-mail diário, tarefa do Planner e lista de multas excluem quem está descontando

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/MultasDoDia.cs:50`, `MultaTarefa.cs:109,131`
- Modify: `apps/shell/src/pages/frota/domain/linhas.ts:25`, `listas.ts:142-145,272-278`
- Test: `MultasDoDiaTests.cs`, `MultaTarefaTests.cs`, `apps/shell/src/pages/frota/domain/listas.test.ts`

**Interfaces:**
- Consumes: `MultaSituacao.Descontando` e `Situacao.descontando` (Tasks 3 e 4).
- Produces: fila `'descontando'` e visão `descontando` "Descontando" na lista de multas.

- [ ] **Step 1: Testes.**
  - Em `MultasDoDiaTests.cs`: uma multa em Acertar com `cr40f_competenciadesconto` e `cr40f_acertoem` não conta em `AguardandoAcerto`, e uma em Acertar sem eles conta 1.
  - Em `MultaTarefaTests.cs`: a multa descontando cria a tarefa com `cr40f_status` = Concluída (100000003), e uma tarefa aberta de multa que passa a descontar é concluída.
  - Em `listas.test.ts`: `filasDaMulta({ ...situacaoBase, etapa: 'acertar', descontando: true })` devolve `['descontando']`, e as visões de multa têm os ids `['prazo-vencido','aguardando-penalidade','aguardando-acerto','descontando','encerradas','todas']`.

Use os construtores que cada arquivo de teste já tem (`Multa(...)`, `Cenario(...)`). Para não depender do nome do construtor, copie o caso de "aguardando acerto" que já existe e acrescente as duas colunas.

- [ ] **Step 2: Rodar e ver falhar.** Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~MultasDoDia|FullyQualifiedName~MultaTarefa"` e `pnpm --filter shell exec vitest run src/pages/frota/domain/listas.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - `MultasDoDia.cs:50`: `else if (s.Etapa == MultaEtapas.Acertar && !s.Descontando) r.AguardandoAcerto++;`
  - `MultaTarefa.cs:109` e `:131`: troque `MultaEtapas.Aberta(s.Etapa)` por `(MultaEtapas.Aberta(s.Etapa) && !s.Descontando)`, com o comentário `// Descontando em folha: nada para a Frota fazer; o RH lança pela tela (decisão de 18/11/2026).`
  - `linhas.ts:25`: `if (s.etapa === 'acertar') filas.push(s.descontando ? 'descontando' : 'aguardando-acerto')`
  - `listas.ts`: em `SITUACAO_OPCOES`, depois de `aguardando-acerto`, `{ value: 'descontando', label: 'Descontando em folha' }`. Nas visões de multa, depois de `aguardando-acerto`, `view('descontando', 'Descontando', 4, filaMulta('descontando'))`, e renumere `encerradas` para 5 e `todas` para 6.

- [ ] **Step 4: Rodar e ver passar.** Os mesmos comandos, mais `pnpm --filter shell exec vitest run src/pages/frota`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests apps/shell/src/pages/frota/domain
git commit -m "feat(multas): multa descontando sai do e-mail, fecha a tarefa e ganha visão própria"
```

---

### Task 9: Dados do shell (tipos, leitura do mês, lançar e mock)

**Files:**
- Modify: `apps/shell/src/pages/frota/data/types.ts`, `mappers.ts`, `source.ts`, `dataverse.ts`, `mock.ts`, `hostSource.ts:11`
- Test: `apps/shell/src/pages/frota/data/mappers.test.ts`, `dataverse.test.ts`, `mock.test.ts`

**Interfaces:**
- Produces (em `types.ts`):

```ts
export type ParcelaFolhaStatus = 'prevista' | 'descontada' | 'cancelada'
/** Linha de new_parcelamultafolha para o RH e para o drawer da multa. `total` = parcelas da mesma multa (ou termo). */
export type ParcelaFolha = {
  id: string; numero: number; total: number; competencia: string; valor: number; status: ParcelaFolhaStatus; lancadoEm: string | null
  origem: 'multa' | 'termo'
  colaborador: { id: string; nome: string; cpf: string | null } | null
  multa: { id: string; auto: string; placa: string | null; dataInfracao: string | null; infracao: string | null } | null
}
export type ResultadoLancamento = { parcelas: { id: string; ok: boolean; erro: string | null }[]; encerradas: string[]; reabertas: string[] }
```

- Produces (em `DataSource`, `source.ts`):

```ts
  /** Parcelas com competência de `inicio` a `fim` (`yyyy-MM`, inclusivos), de multa e de termo. Alimenta a linha do tempo e o mês. */
  listarDescontosPeriodo(inicio: string, fim: string): Promise<ParcelaFolha[]>
  /** Parcelas Previstas com competência antes do mês; `maisAntigo` em yyyy-MM. */
  previstasAntes(mes: string): Promise<{ quantidade: number; maisAntigo: string | null }>
  listarParcelasMulta(multaId: string): Promise<ParcelaFolha[]>
  lancarDescontoFolha(ids: string[], acao: 'lancar' | 'desfazer'): Promise<ResultadoLancamento>
```

- [ ] **Step 1: Conferir os nomes no DEV (só leitura).** Com o `dv.py` da sessão de planejamento, ou o `$select` direto na Web API:
  - nome da navigation do lookup novo depois do Deploy (`new_Multa`);
  - colunas da multa: data da infração `cr40f_dataehorario` e infração (lookup `cr40f_codigodainfracao`, ou o nome usado em `pages/frota/data/mappers.ts` para a multa);
  - CPF do funcionário `cr40f_numerodocpf` e nome `cr40f_nomecompleto`.

  Antes do Deploy o lookup não existe no DEV. O `$expand` do Step 3 usa `new_Multa`, que é o SchemaName da migration. Se o Dataverse gerar outro nome de navigation, ajuste a constante `NAV_MULTA`.

- [ ] **Step 2: Testes.**
  - `mappers.test.ts`: `mapParcelaFolha` com uma linha que tem `new_Multa` expandido, `new_motorista` expandido e `new_lancadoem`. Confira `status: 'descontada'`, `lancadoEm: '2026-11-18'`, `origem: 'multa'` e `multa.auto`.
  - `mock.test.ts`: `listarDescontosPeriodo(mesAtual, mesAtual)` devolve parcelas de 4 colaboradores fictícios (Ana, Bruno, Carla, Diego): uma multa à vista, uma em 3 parcelas (a 1ª no mês anterior, já lançada), uma em 2 parcelas (a 1ª no mês atual) e uma lançada; mais uma parcela Prevista de 2 meses atrás. `listarDescontosPeriodo(mesAnterior, mesAtual+2)` traz as parcelas dos outros meses. Depois de `lancarDescontoFolha([id], 'lancar')`, a parcela vira `descontada` com `lancadoEm` = `todaySP()`. Lançar de novo devolve `ok: false` com "Esta parcela já foi lançada.".
  - `dataverse.test.ts`: `lancarDescontoFolha` chama `cr40f_LancarDescontoFolha` com `{ ParcelaIdsJson: '["<id limpo>"]', Acao: 'lancar' }` e devolve o JSON de `ResultadoJson`. A recusa do servidor sai como `ApiError`, no mesmo estilo dos testes de `passoMulta` (linhas 315-331).

- [ ] **Step 3: Implementar.**

`mappers.ts`:

```ts
export const NAV_MULTA = 'new_Multa'
export const NAV_MOTORISTA = 'new_motorista'
export const SELECT_PARCELA_FOLHA = ['new_parcelamultafolhaid', 'new_numero', 'new_competencia', 'new_valor', 'new_status', 'new_lancadoem', '_new_multa_value', '_new_termo_value'] as const
export const EXPAND_PARCELA_FOLHA = `${NAV_MULTA}($select=cr40f_novacoluna,cr40f_dataehorario,_cr40f_placa_value,_cr40f_codigodainfracao_value),${NAV_MOTORISTA}($select=cr40f_nomecompleto,cr40f_numerodocpf)`
const STATUS_PARCELA: Record<number, ParcelaFolhaStatus> = { 100000000: 'prevista', 100000001: 'descontada', 100000002: 'cancelada' }

export function mapParcelaFolha(row: Row, total: number): ParcelaFolha {
  const multa = row[NAV_MULTA] as Row | null | undefined
  const motorista = row[NAV_MOTORISTA] as Row | null | undefined
  return {
    id: str(row.new_parcelamultafolhaid) ?? '',
    numero: num(row.new_numero) ?? 0,
    total,
    competencia: str(row.new_competencia)?.slice(0, 10) ?? '',
    valor: num(row.new_valor) ?? 0,
    status: STATUS_PARCELA[num(row.new_status) ?? 100000000] ?? 'prevista',
    lancadoEm: str(row.new_lancadoem)?.slice(0, 10) ?? null,
    origem: row._new_multa_value ? 'multa' : 'termo',
    colaborador: motorista ? { id: str(row._new_motorista_value) ?? '', nome: str(motorista.cr40f_nomecompleto) ?? 'Sem nome', cpf: str(motorista.cr40f_numerodocpf) } : null,
    multa: multa && row._new_multa_value ? {
      id: str(row._new_multa_value) ?? '',
      auto: str(multa.cr40f_novacoluna) ?? 'sem número',
      placa: str(multa['_cr40f_placa_value@OData.Community.Display.V1.FormattedValue']),
      dataInfracao: str(multa.cr40f_dataehorario)?.slice(0, 10) ?? null,
      infracao: str(multa['_cr40f_codigodainfracao_value@OData.Community.Display.V1.FormattedValue']),
    } : null,
  }
}
```

> `str` e `num` são os helpers que `mappers.ts` já usa (`mapParcelaTermo`, linha 272). As anotações `FormattedValue` exigem o header `Prefer: odata.include-annotations="*"`. Confira se `api.retrieveMultipleRecords` do `xrm.ts` já manda o header; se não, leia a placa e a infração pelo mesmo caminho que `mapMulta` usa hoje.

`dataverse.ts` (ao lado de `listarParcelasTermo`):

```ts
    async listarDescontosPeriodo(inicio: string, fim: string) {
      const de = `${inicio}-01`
      const ate = proximoMes(`${fim}-01`)
      const filtro = `new_competencia ge ${de} and new_competencia lt ${ate} and new_status ne 100000002`
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${SELECT_PARCELA_FOLHA.join(',')},_new_motorista_value&$expand=${EXPAND_PARCELA_FOLHA}&$filter=${filtro}&$orderby=new_competencia asc`)).entities
      const totais = await totaisPorOrigem(rows)
      return rows.map((r) => mapParcelaFolha(r, totais.get(String(r._new_multa_value ?? r._new_termo_value)) ?? 1))
    },

    async previstasAntes(mes: string) {
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=new_competencia&$filter=new_status eq 100000000 and new_competencia lt ${mes}-01&$orderby=new_competencia asc`)).entities
      return { quantidade: rows.length, maisAntigo: rows.length ? String(rows[0].new_competencia).slice(0, 7) : null }
    },

    async listarParcelasMulta(multaId: string) {
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${SELECT_PARCELA_FOLHA.join(',')},_new_motorista_value&$expand=${EXPAND_PARCELA_FOLHA}&$filter=_new_multa_value eq ${guid(multaId)}&$orderby=new_numero asc`)).entities
      return rows.map((r) => mapParcelaFolha(r, rows.length))
    },

    async lancarDescontoFolha(ids: string[], acao: 'lancar' | 'desfazer'): Promise<ResultadoLancamento> {
      const payload = await customApi('cr40f_LancarDescontoFolha', { ParcelaIdsJson: JSON.stringify(ids.map(guid)), Acao: acao }, 'Não foi possível lançar as parcelas')
      const json = typeof payload.ResultadoJson === 'string' ? payload.ResultadoJson : ''
      if (!json) throw new Error('O servidor não devolveu o resultado do lançamento. Recarregue a tela')
      return JSON.parse(json) as ResultadoLancamento
    },
```

Helpers no mesmo arquivo:

```ts
const proximoMes = (iso: string) => {
  const [a, m] = iso.split('-').map(Number)
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
}
```

```ts
  /** Quantas parcelas cada multa (ou termo) tem no total, para o "x/y". Uma consulta por lote de 50 origens. */
  async function totaisPorOrigem(rows: Row[]) {
    const totais = new Map<string, number>()
    const multas = [...new Set(rows.map((r) => r._new_multa_value).filter(Boolean).map(String))]
    const termos = [...new Set(rows.filter((r) => !r._new_multa_value).map((r) => r._new_termo_value).filter(Boolean).map(String))]
    for (const [campo, ids] of [['_new_multa_value', multas], ['_new_termo_value', termos]] as const)
      for (let i = 0; i < ids.length; i += 50) {
        const lote = ids.slice(i, i + 50).map((id) => `${campo} eq ${id}`).join(' or ')
        for (const r of (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${campo}&$filter=${lote}`)).entities) {
          const k = String(r[campo]); totais.set(k, (totais.get(k) ?? 0) + 1)
        }
      }
    return totais
  }
```

`mock.ts`: um `Map` de parcelas fictícias montado a partir de `todaySP()`.
- "Ana Teste (fictício)", CPF `000.000.000-00`: multa `TST0001`, placa `TST1A23`, à vista, R$ 195,23, no mês atual.
- "Bruno Teste (fictício)", CPF `111.111.111-11`: multa `TST0002`, placa `TST4B56`, em 3× de R$ 100,00 (33,33 · 33,33 · 33,34), com a 1ª no mês anterior (já lançada), a 2ª no mês atual e a 3ª no próximo.
- "Carla Teste (fictício)", CPF `222.222.222-22`: multa `TST0003`, R$ 88,38 à vista, no mês atual e já lançada.
- Uma parcela Prevista de 2 meses atrás para Bruno, para a faixa de atrasadas aparecer.

Use `dividirParcelas` da Task 4 para os valores. `lancarDescontoFolha` aplica as mesmas recusas do servidor, linha por linha.

`hostSource.ts:11`: acrescente `'lancarDescontoFolha'` em `GRAVACOES`.

- [ ] **Step 4: Rodar e ver passar.** Run: `pnpm --filter shell exec vitest run src/pages/frota/data` e `pnpm --filter shell typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/frota/data
git commit -m "feat(rh): dados das parcelas de desconto em folha no shell (Dataverse e mock)"
```

---

### Task 10: Drawer da multa (parcelas, primeiro mês, prévia e bloco "Descontos em folha")

**Files:**
- Modify: `apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx` (bloco do RegistrarAcerto, por volta das linhas 237-247, e `feitos()`)
- Test: `apps/shell/src/pages/frota/components/MultaPassoAPasso.test.tsx` (crie se não existir, no padrão dos testes de componente da pasta)

**Interfaces:**
- Consumes: `previaParcelas`, `janelaCompetencia`, `mesBr`, `descontando` (Task 4); `source.listarParcelasMulta` (Task 9).

- [ ] **Step 1: Testes.**
  - Com "Lancei na folha" escolhido e uma multa de valor pago R$ 100,00, os campos "Parcelas" (padrão 1) e "Primeiro mês" (padrão `todaySP().slice(0, 7)`) aparecem. Com Parcelas = 3, o texto "3× R$ 33,33 · última R$ 33,34" aparece.
  - "Gravar" chama `source.passoMulta(id, 'RegistrarAcerto', { acerto: 'folha', competencia: '<mês>', parcelas: 3 })`.
  - O input de mês tem `min` = `janelaCompetencia(hoje).de.slice(0, 7)` e `max` = `.ate.slice(0, 7)`.
  - Uma multa descontando com 3 parcelas (1 descontada) mostra o bloco "Descontos em folha" com 3 linhas, o título "Descontando 1/3" e "Lançada em dd/mm" na primeira.

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm --filter shell exec vitest run src/pages/frota/components/MultaPassoAPasso.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - No estado do formulário do Acertar, acrescente `parcelas: 1` e `competencia: todaySP().slice(0, 7)` como padrão. Hoje o mês vem vazio.
  - Embaixo do `Input type="month"`:

```tsx
{dados.acerto === 'folha' && (
  <>
    <Field label="Parcelas">
      <Input type="number" min={1} max={12} step={1} value={String(dados.parcelas ?? 1)}
        onChange={(e) => setDados({ ...dados, parcelas: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} />
    </Field>
    {multa.valorPago ? <p className="mp-previa">{previaParcelas(multa.valorPago, dados.parcelas ?? 1)}</p> : <p className="mp-aviso">Registre o pagamento antes de lançar na folha.</p>}
  </>
)}
```

  Use os mesmos componentes (`Field`, `Input`) e classes que o bloco já usa. Confira o nome real do campo do valor pago na multa do shell (`multa.valorPago` ou o que `mapMulta` produz). Renomeie o rótulo do mês para "Primeiro mês", com `min` e `max` da janela.
  - O `dadosSemVazios` precisa manter `parcelas`, que é número. Confira que ele não descarta número.
  - Bloco "Descontos em folha": quando `situacao.descontando` ou a multa estiver Encerrada com `competencia`, carregue `source.listarParcelasMulta(multa.id)` num `useEffect` com token contra resposta fora de ordem, no padrão de `listarParcelasTermo`. Mostre:

```tsx
<section className="mp-descontos" aria-label="Descontos em folha">
  <h4>{situacao.descontando ? `Descontando ${parcelas.filter((p) => p.status === 'descontada').length}/${parcelas.length}` : 'Descontos em folha'}</h4>
  <ul>
    {parcelas.map((p) => (
      <li key={p.id}>
        <span>{p.numero}/{p.total} · {mesBr(p.competencia)}</span>
        <span>{formatMoney(p.valor)}</span>
        <span>{p.status === 'descontada' && p.lancadoEm ? `Lançada em ${p.lancadoEm.slice(8, 10)}/${p.lancadoEm.slice(5, 7)}` : p.status === 'cancelada' ? 'Cancelada' : 'Prevista'}</span>
      </li>
    ))}
  </ul>
</section>
```

  - Em `feitos()`, o acerto na folha mostra "Na folha desde MM/AAAA, N parcelas".

- [ ] **Step 4: Rodar e ver passar.** Run: `pnpm --filter shell exec vitest run src/pages/frota` e `pnpm --filter shell typecheck`. Expected: PASS.

- [ ] **Step 5: Print.** `pnpm --filter shell dev` na porta registrada do projeto (36472, `--strictPort`), em modo mock. Abra `#/frota-multas`, escolha uma multa em "4. Acertar" com valor pago, depois "Lancei na folha" e Parcelas 3, e tire o print. Abra a multa do Bruno (descontando) e tire o print do bloco. Copie os dois para `~/.t3/userdata/attachments/rh-drawer-acertar.png` e `rh-drawer-descontando.png`. Se o mock da Frota não tiver multa em Acertar com valor pago e motorista, acrescente uma fictícia no `mock.ts` (Task 9).

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/frota
git commit -m "feat(multas): drawer pede parcelas e primeiro mês, mostra a prévia e as parcelas da folha"
```

---

### Task 11: Gerador de XLSX (`lib/xlsx.ts`)

**Files:**
- Create: `apps/shell/src/lib/xlsx.ts`
- Test: `apps/shell/src/lib/xlsx.test.ts`

**Interfaces:**
- Produces:

```ts
export type Celula = string | number | null | { valor: number; formato: 'moeda' } | { valor: string; negrito: true }
export type Planilha = { aba: string; colunas: { titulo: string; largura?: number }[]; linhas: Celula[][] }
export function gerarXlsx(p: Planilha): Uint8Array
export function baixarXlsx(nome: string, p: Planilha): void
```

- [ ] **Step 1: Testes.**

```ts
import { strFromU8, unzipSync } from 'fflate'
import { gerarXlsx } from './xlsx'

describe('gerarXlsx', () => {
  const xml = (arq: Uint8Array, nome: string) => strFromU8(unzipSync(arq)[nome])
  const p = { aba: 'Descontos', colunas: [{ titulo: 'Colaborador' }, { titulo: 'Valor' }], linhas: [['Ana & Cia <fictício>', { valor: 33.33, formato: 'moeda' as const }], [{ valor: 'Total', negrito: true as const }, { valor: 1234.5, formato: 'moeda' as const }]] }

  it('tem as partes mínimas de um xlsx', () => {
    const arq = unzipSync(gerarXlsx(p))
    expect(Object.keys(arq).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort())
  })
  it('valor é número com estilo de moeda, não texto', () => {
    const s = xml(gerarXlsx(p), 'xl/worksheets/sheet1.xml')
    expect(s).toContain('<c r="B2" s="1"><v>33.33</v></c>')
    expect(xml(gerarXlsx(p), 'xl/styles.xml')).toContain('formatCode="&quot;R$&quot; #,##0.00"')
  })
  it('texto inline escapado e cabeçalho em negrito', () => {
    const s = xml(gerarXlsx(p), 'xl/worksheets/sheet1.xml')
    expect(s).toContain('<c r="A1" t="inlineStr" s="2"><is><t>Colaborador</t></is></c>')
    expect(s).toContain('Ana &amp; Cia &lt;fictício&gt;')
    expect(s).toContain('<c r="A3" t="inlineStr" s="2">')
  })
  it('nome da aba vai no workbook', () => {
    expect(xml(gerarXlsx(p), 'xl/workbook.xml')).toContain('<sheet name="Descontos" sheetId="1" r:id="rId1"/>')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm --filter shell exec vitest run src/lib/xlsx.test.ts`. Expected: FAIL ("Cannot find module './xlsx'").

- [ ] **Step 3: Implementar.**

```ts
// apps/shell/src/lib/xlsx.ts
// Planilha .xlsx mínima gerada no navegador (uma aba, texto inline, número, moeda, negrito). Sem dependência além do fflate.
// O pagamento-fornecedores tem gerador próprio (lib/excel.js) acoplado aos serviços; este é o genérico do shell.
import { strToU8, zipSync } from 'fflate'

export type Celula = string | number | null | { valor: number; formato: 'moeda' } | { valor: string; negrito: true }
export type Planilha = { aba: string; colunas: { titulo: string; largura?: number }[]; linhas: Celula[][] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const coluna = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : coluna(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))
// Estilos: 0 padrão, 1 moeda, 2 negrito.
const ESTILO = { moeda: 1, negrito: 2 } as const

function celula(c: Celula, ref: string): string {
  if (c === null || c === '') return ''
  if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
  if (typeof c === 'string') return `<c r="${ref}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`
  if ('formato' in c) return `<c r="${ref}" s="${ESTILO.moeda}"><v>${c.valor}</v></c>`
  return `<c r="${ref}" t="inlineStr" s="${ESTILO.negrito}"><is><t>${esc(c.valor)}</t></is></c>`
}

export function gerarXlsx(p: Planilha): Uint8Array {
  const todas: Celula[][] = [p.colunas.map((c) => ({ valor: c.titulo, negrito: true as const })), ...p.linhas]
  const rows = todas.map((linha, r) => `<row r="${r + 1}">${linha.map((c, i) => celula(c, `${coluna(i)}${r + 1}`)).join('')}</row>`).join('')
  const cols = p.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 16}" customWidth="1"/>`).join('')
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="${esc(p.aba.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`),
  })
}

export function baixarXlsx(nome: string, p: Planilha) {
  const url = URL.createObjectURL(new Blob([gerarXlsx(p)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

> A moeda em negrito (subtotal) não tem estilo próprio, e o subtotal leva o rótulo em negrito. Se o Renan pedir o valor do subtotal em negrito, acrescente um `xf` 3 (`numFmtId 164`, `fontId 1`) e o formato `{ valor, formato: 'moeda', negrito: true }`.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/lib/xlsx.ts apps/shell/src/lib/xlsx.test.ts
git commit -m "feat(shell): gerador de xlsx genérico (texto, número, moeda e negrito)"
```

---

### Task 12: Tela `#/rh-descontos`

**Files:**
- Create: `apps/shell/src/pages/rh-descontos/domain/descontos.ts` (+ `descontos.test.ts`)
- Create: `apps/shell/src/pages/rh-descontos/RhDescontosPage.tsx` (+ `RhDescontosPage.test.tsx`)
- Create: `apps/shell/src/pages/rh-descontos/rh-descontos.css`

**Interfaces:**
- Consumes: `createFrotaSource(host)`, `DataSource.listarDescontosPeriodo/previstasAntes/lancarDescontoFolha` e `ParcelaFolha` (Task 9); `gerarXlsx`/`baixarXlsx` e `Planilha` (Task 11); `mesBr` (Task 4).
- Produces:
  - `export function RhDescontosPage(): JSX.Element` (named export, como `TreinamentosPage`)
  - Em `descontos.ts`:
    - `type LinhaDesconto = ParcelaFolha & { grupo: string; origemTexto: string; parcelaTexto: string; situacaoTexto: string }`
    - `linhasDoMes(p: ParcelaFolha[]): LinhaDesconto[]`
    - `resumo(p: ParcelaFolha[]): { total: number; colaboradores: number; previstas: number; lancadas: number }`
    - `planilhaDoMes(p: ParcelaFolha[], mes: string): Planilha`
    - `nomeArquivo(mes: string): string`

- [ ] **Step 1: Testes do domínio** (`descontos.test.ts`, com 3 parcelas fictícias montadas à mão no teste):
  - `linhasDoMes` ordena por colaborador e por origem. `grupo` é `"<nome> · R$ <subtotal do colaborador>"`, que serve de chave do agrupamento da tabela, para o subtotal aparecer no cabeçalho do grupo. `origemTexto` é "Multa TST0002 · TST4B56" ou "Termo"; `parcelaTexto`, "2/3"; `situacaoTexto`, "Prevista" ou "Lançada em 18/11".
  - `resumo` soma total, conta colaboradores distintos, previstas e lançadas.
  - `planilhaDoMes`:
    - colunas, na ordem: Colaborador, CPF, Competência, Nº do auto, Placa, Data da infração, Infração, Parcela, Valor, Situação;
    - competência em `mm/aaaa`, data da infração em `dd/mm/aaaa`, valor como `{ valor, formato: 'moeda' }`;
    - depois das linhas de cada colaborador, uma linha `[{ valor: 'Subtotal <nome>', negrito: true }, ..., { valor: subtotal, formato: 'moeda' }, null]`;
    - no fim, `[{ valor: 'Total geral', negrito: true }, ..., { valor: total, formato: 'moeda' }, null]`;
    - a coluna Valor é a 9ª (índice 8).
  - `nomeArquivo('2026-11')` é `'descontos-folha-2026-11.xlsx'`.
  - `porColaborador` agrupa por colaborador com subtotal em centavos; `totaisPorMes` separa lançado, a lançar e atrasada (prevista antes do mês atual); `mascararCpf('111.111.111-11')` é `'111.***.***-11'` e `null` vira `''`.

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm --filter shell exec vitest run src/pages/rh-descontos`. Expected: FAIL.

- [ ] **Step 3: Implementar `descontos.ts`.** Funções puras, sem React. O subtotal usa centavos inteiros (`Math.round(v * 100)`) para não acumular erro de ponto flutuante. O formato de moeda do `grupo` usa o mesmo `formatMoney` do shell.

- [ ] **Step 4: Testes da página** (`RhDescontosPage.test.tsx`, com o host em modo mock, no padrão de `TreinamentosPage.test.tsx`):
  - abre no mês atual, no passo "1 Conferir", com o título "Folha de <mês por extenso>" e o total do mês;
  - a faixa de meses mostra 7 meses (mês anterior − 1 até mês atual + 5) com o total de cada um; clicar num mês troca a folha;
  - mostra um holerite por colaborador, com subtotal e "2/3" na linha da parcela parcelada;
  - a alternância "Linha do tempo" mostra a grade colaborador × mês, com a coluna do mês da folha destacada;
  - o aviso de atrasadas ("1 parcela de meses anteriores ainda prevista") tem o botão "Ver <mês>", que troca a folha;
  - no passo "2 Lançar", marcar 2 colaboradores e "Lançar os 2 marcados" muda o holerite para o carimbo "Lançado"; "Desfazer" volta;
  - recusa do servidor aparece no holerite do colaborador, com o texto como veio;
  - o passo "3 Enviar" tem o botão "Baixar Excel", que chama `baixarXlsx('descontos-folha-<mes>.xlsx', …)` (mock do módulo com `vi.mock('../../lib/xlsx')`);
  - um mês sem parcelas mostra "Nenhum desconto para <mês por extenso>." (ex.: "Nenhum desconto para março de 2027.");
  - o clique numa linha de multa navega para `#/frota-multas?registro=multa:<id>`.

- [ ] **Step 5: Implementar a página.** Decisão do Renan (18/11/2026): tela visual, por motorista, por mês e por folha, em passo a passo; combina as 3 propostas (holerites, mapa motorista × mês e fita de fechamento). Prints aprovados em `~/.t3/userdata/attachments/rh-proposta-*.png`.
  - **Base técnica** (como `TreinamentosPage` e `FrotaPage`):
    - `const { source, error } = useMemo(() => { try { return { source: createFrotaSource(host), error: null } } catch (e) { return { source: null, error: errorMessage(e) } } }, [host])`, como em `FrotaPage.tsx:81`;
    - erro de carga com `ApiError` de status 403 mostra "Sem acesso" (decisão 7); outro erro mostra a mensagem como veio;
    - estado `mes` (`yyyy-MM`), que começa em `todaySP().slice(0, 7)`, e `passo` (`'conferir' | 'lancar' | 'enviar'`), que começa em `'conferir'`;
    - uma carga só: `Promise.all([source.listarDescontosPeriodo(inicioJanela, fimJanela), source.previstasAntes(mesAtual)])`, com token contra resposta fora de ordem; a janela é do mês da folha − 2 ao mês da folha + 4 e só recarrega quando o mês sai dela; as parcelas do mês da folha são um filtro em memória.
  - **Cabeçalho:** "RH · Descontos em folha" pequeno e, embaixo, o título "Folha de <mês por extenso>" na fonte display do DS. À direita, as setas de mês anterior e próximo e "Hoje".
  - **Passos:** uma barra de 3 passos clicáveis ("1 Conferir", "2 Lançar", "3 Enviar à contabilidade"). Passo concluído ganha ✓: Lançar fica concluído quando todas as parcelas do mês estão lançadas, e Enviar depois do download do Excel nesta sessão.
  - **Faixa de meses** (sempre visível): 7 cartões com uma minibarra empilhada (lançado em verde, a lançar em azul claro), o mês abreviado e o total. O mês da folha fica com fundo `brand`; o mês com parcela atrasada fica com fundo `warning-soft`. Clicar troca o mês.
  - **Passo 1 Conferir:**
    - resumo do mês: total grande (fonte display), barra de progresso lançado × a lançar, legenda com os valores, "N motoristas · M parcelas" e o aviso de atrasadas (só no mês atual e com `quantidade > 0`), com o botão "Ver <mês>";
    - alternância `SegmentedControl` "Holerites | Linha do tempo";
    - **Holerites:** grade `auto-fill minmax(320px,1fr)` de cartões, um por colaborador:
      - cabeçalho com avatar das iniciais, nome e CPF mascarado (`111.***.***-11`);
      - linhas "Multa <auto> · <placa>", com a infração e a data embaixo, o valor e as bolinhas da parcela (uma por parcela; lançada cheia em verde, a do mês com anel `action`) mais "x/y";
      - rodapé com o subtotal;
      - colaborador com tudo lançado ganha o carimbo "LANÇADO" girado, com a data;
    - **Linha do tempo:** grade com colaboradores em linhas e os 7 meses em colunas. Cada parcela é uma pílula com o valor (lançada `success-soft` com ✓; a lançar `action-soft`; atrasada `warning-soft` tracejada). Parcelas do mesmo parcelamento em meses vizinhos se encostam (barra contínua). A coluna do mês da folha fica destacada e o rodapé mostra o total de cada mês. Clicar numa pílula de outro mês troca a folha.
  - **Passo 2 Lançar:** duas colunas.
    - À esquerda, a "fita de somar": uma linha por colaborador com círculo de marcação e subtotal; a lançada fica com ✓ verde e o nome riscado. Embaixo, "lançado", "falta lançar" e o TOTAL. Fonte mono do DS.
    - À direita, o detalhe do colaborador ativo: nome, CPF e, por multa, a corrente de parcelas (cartões por mês: lançada em `success-soft`, a do mês com borda `action` e "agora", futuras neutras).
    - Botões: "Lançar os N marcados" (só com prevista marcada) e "Lancei R$ x na folha" no detalhe (lança as previstas daquele colaborador no mês). No colaborador lançado, "Desfazer".
    - O resultado de cada parcela aparece no holerite ou na fita (recusa do servidor como veio; outro erro, "Não foi possível lançar. Tente de novo." em todas do lote) e o período é recarregado depois.
  - **Passo 3 Enviar:** cartão com o resumo (total, colaboradores, parcelas, quantas lançadas), aviso "Ainda há N parcelas a lançar" quando houver, e o botão primário "Baixar Excel" (`baixarXlsx(nomeArquivo(mes), planilhaDoMes(...))`). Depois do download, ✓ "Excel baixado às HH:mm".
  - **Vazio:** sem parcelas no mês, os passos somem e fica `EmptyState` "Nenhum desconto para <mês por extenso>." (com `new Date(Number(a), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })`). A faixa de meses continua.
  - **Navegação:** clicar numa linha de multa (holerite, corrente ou pílula do mês da folha) faz `location.hash = '#/frota-multas?registro=multa:' + id`. Linha de termo (sem multa) não navega.
  - **Componentes e estilo:**
    - componentes em arquivos próprios em `rh-descontos/components/` (`FaixaMeses`, `Holerite`, `LinhaDoTempo`, `FitaFechamento`, `PassosFolha`), cada um com uma função;
    - CSS só com tokens `--bt-*` do DS, sem `border-left` colorido e sem cor fixa;
    - em tela estreita (container query), as duas colunas do passo 2 empilham e a linha do tempo rola na horizontal dentro do cartão;
    - versão visível segue o padrão do shell.
  - Mapeamento para o domínio: `descontos.ts` ganha `porColaborador(p)` (grupos com subtotal e parcelas ordenadas), `totaisPorMes(p)` (`Map<yyyy-MM, { lancado, aLancar, atrasada }>`) e `mascararCpf(cpf)`, todos testados no Step 1.

- [ ] **Step 6: Rodar e ver passar.** Run: `pnpm --filter shell exec vitest run src/pages/rh-descontos` e `pnpm --filter shell typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/rh-descontos
git commit -m "feat(rh): tela Descontos em folha em passos (holerites, linha do tempo, fita de fechamento e Excel)"
```

---

### Task 13: Menu, rota e ícone

**Files:**
- Modify: `apps/shell/src/nav/menu.ts` (union `page` na linha 14 e grupo novo depois de `cadastros`, linha 89)
- Modify: `apps/shell/src/app/routes.tsx` (`PAGE_LOADERS`, perto da linha 46)
- Modify: `apps/shell/src/app/AppShell.tsx` (import do lucide na linha 5 e mapa de ícones perto da linha 88)
- Test: `apps/shell/src/app/routes.test.tsx`, `apps/shell/src/app/AppShell.icons.test.tsx`

- [ ] **Step 1: Testes.** Em `routes.test.tsx`, `rh-descontos` tem loader. Em `AppShell.icons.test.tsx`, o teste que confere ícone para todo item do menu já cobre o item novo. Rode antes para ver o teste falhar.

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm --filter shell exec vitest run src/app`. Expected: FAIL depois do Step 3 parcial, ou passa se o teste for dinâmico. Nesse caso, siga.

- [ ] **Step 3: Implementar.**
  - `menu.ts`: acrescente `'rh-descontos'` na union de `page`. Depois do grupo `cadastros`:

```ts
  {
    id: 'rh',
    label: 'RH',
    items: [{ kind: 'page', id: 'rh-descontos', label: 'Descontos em folha', page: 'rh-descontos' }],
  },
```

  - `routes.tsx`: `'rh-descontos': () => import('../pages/rh-descontos/RhDescontosPage').then((m) => m.RhDescontosPage),`
  - `AppShell.tsx`: importe `HandCoins` de `lucide-react` e acrescente `'rh-descontos': <HandCoins />,` no mapa.
  - Se o hash de rota for derivado do `id` (`#/rh-descontos`), nada mais muda. Confira como `#/treinamentos` resolve.

- [ ] **Step 4: Rodar e ver passar.** Run: `pnpm --filter shell exec vitest run src/app src/nav` e `pnpm --filter shell typecheck`. Expected: PASS.

- [ ] **Step 5: Print.** No `vite` mock (porta 36472), tire o print de `#/rh-descontos` com o menu aberto no grupo RH e com uma linha com recusa. Abra o Excel baixado (`python3 -c` com `zipfile` lendo `sheet1.xml`, ou o LibreOffice headless convertendo para PNG: `soffice --headless --convert-to png`) e tire o print. Copie para `~/.t3/userdata/attachments/rh-descontos-tela.png` e `rh-descontos-excel.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/nav/menu.ts apps/shell/src/app/routes.tsx apps/shell/src/app/AppShell.tsx apps/shell/src/app/*.test.tsx
git commit -m "feat(rh): grupo RH no menu com Descontos em folha (ícone HandCoins)"
```

---

### Task 14: Permissões (conferência, só leitura)

**Files:** nenhum (anotação no PR)

- [ ] **Step 1: DEV.** Liste os papéis com privilégio de leitura em `new_parcelamultafolha` e `cr40f_multas` (`roleprivilegescollection` pelo `privilegeid` de `prvReadnew_parcelamultafolha` e `prvReadcr40f_multas`). Confira que o Júnior é Administrador do Sistema; na planejamento, ele era. Anote no PR quais papéis leem as parcelas e qual o nível (usuário, unidade, organização).

- [ ] **Step 2: PROD (só leitura).** Faça a mesma consulta. Se o papel de quem vai usar a tela não tiver leitura de parcela no nível organização, anote no PR como pendência da virada. O papel vai pelas soluções, e a sessão não altera privilégio.

- [ ] **Step 3:** Confira que a tela não faz `update` direto. `grep -n "updateRecord\|update(" apps/shell/src/pages/rh-descontos -r` deve voltar vazio.

---

### Task 15: Skill `verificar-multas` e ux-audit

**Files:**
- Modify: `.claude/skills/verificar-multas/SKILL.md`

- [ ] **Step 1: Roteiro do DEV na skill.** Acrescente a seção "Desconto em folha (RH bloco 1)":
  1. Crie uma multa de teste fictícia, auto `TST-RH-<data>`, com motorista de teste e valor pago R$ 100,00. Use o passo a passo até "4. Acertar".
  2. Faça o Acertar → folha em 2 parcelas, com o primeiro mês = mês atual. A multa segue em "4. Acertar" com "Descontando em folha", e a tarefa do Planner fica Concluída.
  3. Em `#/rh-descontos`, a 1ª aparece no mês atual e a 2ª no próximo, com R$ 50,00 cada.
  4. Lance a 1ª: a multa segue aberta.
  5. Lance a 2ª: a multa vai para Encerrada, com `cr40f_encerradaem` = hoje.
  6. Desfaça a 2ª: a multa volta para "4. Acertar" sem `cr40f_encerradaem`.
  7. Lance a 2ª de novo: a multa encerra.
  8. Fim: a multa de teste fica Encerrada e as parcelas ficam como histórico fictício. Nada é apagado: a trava do termo bloqueia, e o Restrict também.
  9. Recusas a conferir: Acertar → folha sem valor pago, mês fora da janela, 13 parcelas, cancelar a multa com parcela prevista e `PATCH` direto em `new_parcelamultafolha.new_status` pela Web API, que a trava recusa.

  Inclua os comandos de leitura (`$select` das parcelas por `_new_multa_value`) e os critérios de sucesso de cada passo.

- [ ] **Step 2: ux-audit modo Fluxo.** Carregue a skill `ux-audit` e rode o modo Fluxo em `#/rh-descontos` no mock: escolher o mês, conferir, lançar em lote, desfazer, ver a recusa e exportar. Corrija os achados críticos e anote os demais no PR.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/verificar-multas/SKILL.md
git commit -m "docs(skills): roteiro do desconto em folha na verificar-multas"
```

---

### Task 16: Qualidade e PR para a `develop`

- [ ] **Step 1:** Rode a skill `qualidade-antes-do-pr` (2 a 3 passadas de `/simplify` e `karpathy-coder`, depois `/code-review high --fix`). Em seguida, `verificacao-manter` (`verificar-multas`, `verificar-termo-multa` e `verificar-shell`).
- [ ] **Step 2:** Rode a suíte completa: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`, `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests`, `pnpm --filter shell test`, `pnpm --filter shell typecheck` e `pnpm --filter shell build`.
- [ ] **Step 3:** Faça o push da branch e abra o PR para a `develop`. No corpo:
  - resumo;
  - as decisões do Renan;
  - a migration;
  - a Custom API nova;
  - a mudança na trava do termo;
  - os prints (drawer, tela e Excel);
  - as permissões da Task 14;
  - "não verificado no DEV até o Deploy": o roteiro da Task 15 roda depois do merge.
- [ ] **Step 4:** Depois do merge e do Deploy, rode o roteiro da `verificar-multas` no DEV. Rode também `verificar-solucoes` para conferir que `new_multa` e `new_lancadoem` estão na BetinhosCore e que a `cr40f_LancarDescontoFolha` está na solução da frota. O PROD vai pelo "Publicar soluções", depois da fase 1 de multas no PROD.
