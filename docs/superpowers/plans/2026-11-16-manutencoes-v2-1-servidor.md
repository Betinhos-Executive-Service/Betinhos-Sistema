# Manutenções v2, plano 1: schema e servidor (implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** criar o schema novo das manutenções e as regras no servidor: as Custom APIs Agendar, Reprovar, Cancelar e Concluir, e o espelho da programação da Geral. Este plano não muda nenhuma tela.

**Architecture:** tudo entra no `Cr40f.Frota.Plugin`, que já existe. As regras puras (janela, transições, espelho) ficam em `Manutencao/Ciclo.cs`, testadas sem Dataverse. A execução fica em `Manutencao/ManutencaoService.cs` sobre `IOrganizationService` e é testada com um serviço em memória. Dois `IPlugin` finos chamam essas classes: um despacha as 4 Custom APIs globais (entrada `RequestJson`, saída `ResponseJson`) e o outro é o step do espelho no Update da Geral. O registrador da Frota passa a registrar os três tipos.

**Tech Stack:** C# (`net462` no plugin, `net48` nos testes), Microsoft.CrmSdk.CoreAssemblies 9.0.2.60, xunit 2.9, `DataContractJsonSerializer` (sem Newtonsoft), PowerShell 5.1 nas migrations.

**Spec:** `docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md` (seções Ciclo de vida, Dados, Regras no servidor e Virada).

## Global Constraints

- **Test runners e builds** (`dotnet test`, `dotnet build`) **nunca rodam nesta máquina** (8 GB, regra do CLAUDE.md do usuário). Rodam na máquina linkada **Betinhos-Renan** (T3 environmentId `0af2203c-6aba-4a53-8896-1d00fe75c6fa`), via `delegate_task` com `target.environmentId`. O mesmo vale para chamadas ao Dataverse DEV (`az`, `pwsh`).
- O plugin usa só `DataContractJsonSerializer` (`Cr40f.Frota.Plugin.Json`). Nenhum pacote novo.
- Migration: nome `AAAAMMDD-HHMM-descricao.ps1`; BOM UTF-8; comentários em ASCII; idempotente; dry-run sem `-Apply`; só DEV; **imutável depois de publicada** (`packages/deploy/migrations/README.md`).
- Nenhum `provision-*.ps1` novo. Schema só por migration.
- Mensagens ao usuário (exceções `InvalidPluginExecutionException`) em português, frase completa, sem jargão.
- Códigos de choice:
  - Manutenção (`cr40f_status`): Solicitado `0`, Agendado `202410001` (era "Aprovado"), Programado `202410005`, Realizado `202410002`, Reprovado `100000002`, Cancelado `100000001`.
  - Pagamento (`cr40f_pagamento`): Cartão `202410000`, Pedido de compra `202410001`, Pix `202410002`, **Dinheiro `202410003` (novo)**.
  - Geral (`cr40f_status`): Confirmado `202410001`, Programado `202410005`, Concluído `202410008`, Cancelado `202410002`, Cancelado com reservas `202410010`. Categoria (`new_categoriadoitem`) Manutenção `100000001`.
  - `new_classificacaoorigem`: Manual `100000001`.
- Janela: um dia (início = fim) ou uma semana de **segunda a domingo** (início numa segunda, fim = início + 6).
- Fuso: Brasília = UTC−3 (sem horário de verão), como em `FrotaPendenciasPlugin.ResolverHoje`.
- Commits em português no estilo `tipo(escopo): resumo`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch de trabalho a partir da `develop` atualizada. PR para a `develop`.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| Criar `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md` | Fatos lidos no DEV (Tarefa 1) que o código usa |
| Criar `packages/deploy/migrations/20261117-0900-manutencoes-v2.ps1` | Janela, km na realização, Dinheiro, rótulo Agendado |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs` | Nomes lógicos e códigos (manutenção, Geral, despesa) |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs` | JSON de entrada e saída das Custom APIs |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Ciclo.cs` | Regras puras: janela, transições, conclusão, espelho |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/LinhaGeral.cs` | Montar e localizar a linha da Geral da manutenção |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/DespesaManutencao.cs` | Criar ou atualizar a despesa ligada |
| Criar `packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.cs` | Agendar, Reprovar, Cancelar, Concluir |
| Criar `packages/plugins/Cr40f.Frota.Plugin/ManutencaoComandoPlugin.cs` | `IPlugin` das 4 Custom APIs |
| Criar `packages/plugins/Cr40f.Frota.Plugin/GeralManutencaoEspelhoPlugin.cs` | `IPlugin` do step do espelho |
| Modificar `packages/plugins/Cr40f.Frota.Plugin/Catalogo.cs` | Categoria de cada serviço |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/MemoriaService.cs` | `IOrganizationService` em memória |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/CicloTests.cs` | Testes das regras puras |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs` | Agendar, Reprovar, Cancelar |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/ConcluirTests.cs` | Concluir e despesa |
| Criar `packages/plugins/Cr40f.Frota.Plugin.Tests/PluginsTests.cs` | Despacho das Custom APIs e espelho |
| Modificar `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeTests.cs` | Categoria por serviço igual ao JSON do shell |
| Modificar `packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs` | Registrar os 3 tipos, as 4 APIs e o step |

---

### Tarefa 1: Descoberta no DEV

O flow "Agendar manutenção" e a regra de negócio "Aprovado" não estão no repositório. Antes de escrever `LinhaGeral.Nova` e `DespesaManutencao`, é preciso ler no DEV o que o flow grava e os tipos das colunas usadas. **Roda na Betinhos-Renan** (precisa de `az login`).

**Files:**
- Create: `docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md`

**Interfaces:**
- Produces: a lista de campos que a linha da Geral precisa ao ser criada, os tipos de `cr40f_despesaoperacional.cr40f_valor` / `cr40f_datagasto`, se o step do `DriverNoticePlugin` cobre a categoria Manutenção e se `cr40f_status` / `cr40f_pagamento` da manutenção são choices globais. As Tarefas 2, 4 e 5 leem esse arquivo.

- [ ] **Step 1: Ler a definição do flow "Agendar manutenção"**

```bash
BASE=https://org23b93544.crm2.dynamics.com
TOKEN=$(az account get-access-token --resource "$BASE/" --query accessToken -o tsv)
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/api/data/v9.2/workflows?\$select=name,clientdata,statecode&\$filter=category eq 5 and contains(name,'anuten')" \
  | python3 -c "import json,sys; [print(w['name'], w['statecode'], '\n', w['clientdata'][:20000], '\n----') for w in json.load(sys.stdin)['value']]"
```

Anote no arquivo de descoberta, para cada ação `CreateRecord` / `UpdateRecord` em `cr40f_reservadeveculoses` e `cr40f_manutencoeses`, **todos os campos e valores** (inclusive cliente, solicitante, status e textos fixos).

- [ ] **Step 2: Ler a regra de negócio "Aprovado"**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/api/data/v9.2/workflows?\$select=name,workflowid,statecode,primaryentity&\$filter=category eq 2 and primaryentity eq 'cr40f_manutencoes'"
```

Anote o nome, o `workflowid` e o estado. Ela sai do DEV no plano 5 (virada), não neste.

- [ ] **Step 3: Colunas obrigatórias da Geral e tipos das colunas usadas**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?\$select=LogicalName,RequiredLevel,AttributeType&\$filter=RequiredLevel/Value eq 'ApplicationRequired' or RequiredLevel/Value eq 'SystemRequired'"
for col in cr40f_valor cr40f_datagasto; do
  curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
    "$BASE/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes(LogicalName='$col')?\$select=LogicalName,AttributeType"; echo
done
for col in cr40f_status cr40f_pagamento; do
  curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
    "$BASE/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_manutencoes')/Attributes(LogicalName='$col')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?\$select=LogicalName&\$expand=OptionSet(\$select=Name,IsGlobal,Options)"; echo
done
```

- [ ] **Step 4: Step do push dos serviços**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/api/data/v9.2/sdkmessageprocessingsteps?\$select=name,filteringattributes,stage,statecode&\$filter=contains(name,'DriverNotice')"
```

Anote se o step filtra por categoria. O código de `DriverNoticePlugin.cs` não filtra, então a linha de manutenção programada já recebe push. Confirme se isso vale no DEV.

- [ ] **Step 5: Escrever o arquivo de descoberta e commitar**

O arquivo tem quatro seções com os resultados crus dos Steps 1 a 4, e uma quinta, **"Decisões para o código"**, com:
- `LinhaGeral.Nova` precisa gravar: \<lista de campos e valores vindos do Step 1 e das colunas obrigatórias do Step 3\>;
- status inicial da linha não programada: \<o valor que o flow usa; se o flow usa outro além de Confirmado `202410001`, ele vale\>;
- `cr40f_despesaoperacional.cr40f_valor` é `Money` ou `Decimal`;
- `cr40f_status` e `cr40f_pagamento` da manutenção são globais (sim/não) e com que nome.

```bash
git add docs/superpowers/plans/2026-11-16-manutencoes-v2-descoberta.md
git commit -m "docs(frota): descoberta no DEV para as manutenções v2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Migration do schema

**Files:**
- Create: `packages/deploy/migrations/20261117-0900-manutencoes-v2.ps1` (com BOM UTF-8)

**Interfaces:**
- Consumes: Tarefa 1 (choices globais ou locais).
- Produces: colunas `cr40f_janelainicio` e `cr40f_janelafim` (DateOnly) e `cr40f_kmrealizado` (inteiro) em `cr40f_manutencoes`; opção Dinheiro `202410003` em `cr40f_pagamento`; rótulo "Agendado" no `202410001` de `cr40f_status`.

- [ ] **Step 1: Escrever a migration**

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Manutencoes v2 (docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md):
# janela do encaixe (inicio e fim, so data), km na realizacao, opcao "Dinheiro" no pagamento
# e rotulo "Agendado" no lugar de "Aprovado" (mesmo valor 202410001).
# Confere que as colunas da classificacao existem: o plugin Cr40f.Frota grava nelas ao concluir.
# Aditiva e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_manutencoes"

foreach ($c in @("new_servicosmanutencao", "new_categoriasmanutencao", "new_classificacaoorigem")) {
  if (-not (Get-Coluna $table $c)) { throw "Coluna $table.$c nao existe no DEV; o plugin de manutencao depende dela." }
}

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function SoData([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = 0; $c.MaxValue = 2147483647; return $c
}

$colunas = @(
  (SoData "cr40f_JanelaInicio" "Janela - in$([char]0xED)cio" "Primeiro dia em que a manuten$([char]0xE7)$([char]0xE3)o pode ser feita (encaixe do gestor de frota)."),
  (SoData "cr40f_JanelaFim" "Janela - fim" "$([char]0xDA)ltimo dia da janela. Igual ao in$([char]0xED)cio quando o encaixe $([char]0xE9) num dia."),
  (Inteiro "cr40f_KmRealizado" "Km na realiza$([char]0xE7)$([char]0xE3)o" "Hod$([char]0xF4)metro informado por quem concluiu a manuten$([char]0xE7)$([char]0xE3)o.")
)

foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  if (Get-Coluna $table $logical) { Write-Step "$logical ja existe"; continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $logical"; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
  $found = Get-Coluna $table $logical
  if (-not $found) { throw "Coluna $logical nao apareceu depois do POST." }
  Add-ComponenteNaSolucao $found.MetadataId 2
  Write-Step "$logical criada"
}

function Get-OptionSet([string] $Coluna) {
  $r = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$Coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet"
  return $r.OptionSet
}
function Rotulo($Opcao) { return @($Opcao.Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 })[0].Label }
# Choice global usa OptionSetName; local usa tabela e coluna.
function Alvo($OptionSet, [string] $Coluna) {
  if ($OptionSet.IsGlobal) { return @{ OptionSetName = $OptionSet.Name } }
  return @{ EntityLogicalName = $table; AttributeLogicalName = $Coluna }
}

$pagamento = Get-OptionSet "cr40f_pagamento"
$dinheiro = @($pagamento.Options | Where-Object { (Rotulo $_) -eq "Dinheiro" })
if ($dinheiro.Count -eq 0) {
  if (@($pagamento.Options | Where-Object { $_.Value -eq 202410003 }).Count -gt 0) { throw "202410003 ja usado em cr40f_pagamento com outro rotulo." }
  if ($Apply) {
    $body = Alvo $pagamento "cr40f_pagamento"
    $body.Value = 202410003; $body.Label = (Label "Dinheiro"); $body.SolutionUniqueName = $script:SolucaoDev
    Invoke-Dv "POST" "InsertOptionValue" $body | Out-Null
    Write-Step "opcao Dinheiro (202410003) criada"
  } else { Write-Step "DRY RUN criaria a opcao Dinheiro (202410003)" }
} elseif ($dinheiro[0].Value -ne 202410003) {
  throw "Dinheiro existe com o valor $($dinheiro[0].Value); o plugin espera 202410003."
}

$status = Get-OptionSet "cr40f_status"
$aprovado = @($status.Options | Where-Object { $_.Value -eq 202410001 })
if ($aprovado.Count -ne 1) { throw "cr40f_status sem a opcao 202410001." }
if ((Rotulo $aprovado[0]) -ne "Agendado") {
  if ($Apply) {
    $body = Alvo $status "cr40f_status"
    $body.Value = 202410001; $body.Label = (Label "Agendado"); $body.MergeLabels = $true; $body.SolutionUniqueName = $script:SolucaoDev
    Invoke-Dv "POST" "UpdateOptionValue" $body | Out-Null
    Write-Step "rotulo 202410001 = Agendado"
  } else { Write-Step "DRY RUN trocaria o rotulo de 202410001 para Agendado" }
}

if ($Apply) { Publish-Tabela $table }
```

- [ ] **Step 2: Gravar com BOM UTF-8 e conferir**

Run: `head -c 3 packages/deploy/migrations/20261117-0900-manutencoes-v2.ps1 | xxd -p`
Expected: `efbbbf`. Se faltar, `printf '\xef\xbb\xbf' | cat - arquivo > tmp && mv tmp arquivo`.

- [ ] **Step 3: Dry-run no DEV (Betinhos-Renan)**

Run: `pwsh -File packages/deploy/migrations/20261117-0900-manutencoes-v2.ps1`
Expected: só linhas `DRY RUN ...` e nenhuma exceção. Não rode com `-Apply`: quem aplica é o Deploy.

- [ ] **Step 4: Conferir a trava das migrations**

Run: `git diff --name-status -M origin/develop...HEAD | node packages/deploy/migrations-ci.mjs` (leve; pode rodar nesta máquina, igual ao `ci.yml`)
Expected: sai com código 0.

- [ ] **Step 5: Commit**

```bash
git add packages/deploy/migrations/20261117-0900-manutencoes-v2.ps1
git commit -m "feat(frota): migration das manutenções v2 (janela, km, Dinheiro, Agendado)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Esquema, contratos e regras puras (`Ciclo`)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/Ciclo.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/CicloTests.cs`

**Interfaces:**
- Produces:
  - `static class M` (manutenção), `static class G` (Geral), `static class D` (despesa): constantes de nomes e códigos.
  - `AgendarPedido { ManutencaoId, Inicio, Fim, Comentario }`, `MotivoPedido { ManutencaoId, Comentario }`, `ConcluirPedido { ManutencaoId, Servicos:int[], Km:int, Data, Valor:decimal, Pagamento:int, Estabelecimento, CidadeId, RealizadoPorId, ServicoRealizado, Comentario, LinkNotaFiscal, LinkFotoFinal1..3 }`, `AgendarResposta { GeralId }`, `ConcluirResposta { DespesaId, StatusAnexo, GeralId }`. JSON em camelCase.
  - `Ciclo.ValidarJanela(string inicio, string fim) -> (DateTime Inicio, DateTime Fim)`, `Ciclo.InicioDoDiaUtc(DateTime dia) -> DateTime`, `Ciclo.ExigirAgendavel(int)`, `Ciclo.ExigirReprovavel(int)`, `Ciclo.ExigirCancelavel(int)`, `Ciclo.ExigirConcluivel(int)`, `Ciclo.ValidarConclusao(ConcluirPedido)`, `Ciclo.LerDataHora(string) -> DateTime`, `Ciclo.Espelho(int statusManutencao, int? statusGeral, bool temMotorista) -> int?`, `Ciclo.Erro(string) -> InvalidPluginExecutionException`.

- [ ] **Step 1: Escrever os testes que falham**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/CicloTests.cs
using System;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class CicloTests
{
    [Fact]
    public void Janela_de_um_dia()
    {
        var (inicio, fim) = Ciclo.ValidarJanela("2026-11-18", "2026-11-18");
        Assert.Equal(new DateTime(2026, 11, 18), inicio);
        Assert.Equal(inicio, fim);
    }

    [Fact]
    public void Janela_de_semana_vai_de_segunda_a_domingo()
    {
        var (inicio, fim) = Ciclo.ValidarJanela("2026-11-16", "2026-11-22");
        Assert.Equal(DayOfWeek.Monday, inicio.DayOfWeek);
        Assert.Equal(DayOfWeek.Sunday, fim.DayOfWeek);
    }

    [Theory]
    [InlineData("2026-11-17", "2026-11-23")] // terça a segunda
    [InlineData("2026-11-16", "2026-11-20")] // segunda a sexta
    [InlineData("2026-11-20", "2026-11-18")] // fim antes do início
    [InlineData("18/11/2026", "18/11/2026")] // formato errado
    public void Janela_invalida_e_recusada(string inicio, string fim)
    {
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarJanela(inicio, fim));
        Assert.Contains("janela", erro.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Inicio_do_dia_em_Brasilia_em_UTC()
    {
        var utc = Ciclo.InicioDoDiaUtc(new DateTime(2026, 11, 16));
        Assert.Equal(new DateTime(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc), utc);
        Assert.Equal(DateTimeKind.Utc, utc.Kind);
    }

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Agendado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Realizado, false)]
    [InlineData(M.Reprovado, false)]
    [InlineData(M.Cancelado, false)]
    public void Agendar_so_em_aberto(int status, bool pode)
        => Confere(() => Ciclo.ExigirAgendavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Agendado, false)]
    [InlineData(M.Programado, false)]
    public void Reprovar_so_solicitado(int status, bool pode)
        => Confere(() => Ciclo.ExigirReprovavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Realizado, false)]
    [InlineData(M.Cancelado, false)]
    public void Cancelar_antes_de_encerrar(int status, bool pode)
        => Confere(() => Ciclo.ExigirCancelavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)] // escritório lança depois do fato
    [InlineData(M.Agendado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Reprovado, false)]
    [InlineData(M.Cancelado, false)]
    public void Concluir_em_aberto(int status, bool pode)
        => Confere(() => Ciclo.ExigirConcluivel(status), pode);

    [Fact]
    public void Conclusao_exige_servicos_do_catalogo_km_valor_e_pagamento()
    {
        var ok = PedidoValido();
        Ciclo.ValidarConclusao(ok);
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Servicos = Array.Empty<int>())));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Servicos = new[] { 999 })));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Km = 0)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Valor = 0)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Pagamento = 1)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Estabelecimento = " ")));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.CidadeId = "")));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Data = "ontem")));
    }

    [Theory]
    [InlineData(M.Agendado, G.StatusProgramado, true, M.Programado)]
    [InlineData(M.Programado, G.StatusProgramado, true, null)] // já está
    [InlineData(M.Agendado, G.StatusProgramado, false, null)] // programado sem motorista não vale
    [InlineData(M.Programado, G.StatusAProgramar, false, M.Agendado)] // saiu da programação
    [InlineData(M.Programado, G.StatusConcluido, true, null)] // conclusão é do Concluir
    [InlineData(M.Programado, G.StatusCancelado, true, null)] // cancelamento é do Cancelar
    [InlineData(M.Realizado, G.StatusProgramado, true, null)] // encerrada não muda
    [InlineData(M.Solicitado, G.StatusProgramado, true, null)] // sem encaixe não espelha
    public void Espelho_da_programacao(int manutencao, int geral, bool motorista, int? esperado)
        => Assert.Equal(esperado, Ciclo.Espelho(manutencao, geral, motorista));

    internal static ConcluirPedido PedidoValido() => new()
    {
        ManutencaoId = Guid.NewGuid().ToString(),
        Servicos = new[] { 100000007 },
        Km = 85200,
        Data = "2026-11-18T14:30:00Z",
        Valor = 380.50m,
        Pagamento = M.PagamentoCartao,
        Estabelecimento = "Auto Center Centro",
        CidadeId = Guid.NewGuid().ToString(),
        RealizadoPorId = Guid.NewGuid().ToString(),
        ServicoRealizado = "Troca das pastilhas dianteiras",
        Comentario = "Barulho resolvido",
        LinkNotaFiscal = "https://sharepoint/nota.jpg",
    };

    static ConcluirPedido Com(ConcluirPedido origem, Action<ConcluirPedido> mudar)
    {
        var copia = Json.Ler<ConcluirPedido>(Json.Serializar(origem));
        mudar(copia);
        return copia;
    }

    static void Confere(Action acao, bool pode)
    {
        if (pode) acao();
        else Assert.Throws<InvalidPluginExecutionException>(acao);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~CicloTests`
Expected: FAIL na compilação ("The type or namespace name 'Manutencao' does not exist").

- [ ] **Step 3: Escrever `Esquema.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/Esquema.cs
namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Manutenção (cr40f_manutencoes). Códigos iguais a apps/shell/src/pages/frota/data/schema.ts.</summary>
public static class M
{
    public const string Tabela = "cr40f_manutencoes";
    public const string Status = "cr40f_status", Veiculo = "cr40f_placa_carro", DataAprovacao = "cr40f_datadaaprovacao";
    public const string JanelaInicio = "cr40f_janelainicio", JanelaFim = "cr40f_janelafim", KmRealizado = "cr40f_kmrealizado";
    public const string ComentarioAoMotorista = "cr40f_comentariosaomotorista", ComentarioAprovador = "cr40f_comentariosdoaprovador";
    public const string DataManutencao = "cr40f_datamanutencao", Valor = "cr40f_valor", Estabelecimento = "cr40f_estabelecimento";
    public const string ServicoRealizado = "cr40f_servicorealizado", Pagamento = "cr40f_pagamento", RealizadoPor = "cr40f_realizado_por_nome";
    public const string ComentarioColaborador = "new_comentariosdocolaborador";
    public const string Servicos = "new_servicosmanutencao", Categorias = "new_categoriasmanutencao", Origem = "new_classificacaoorigem";
    public const string LinkNotaFiscal = "new_linkdanotafiscal", LinkFotoFinal1 = "new_linkdafotofinal1", LinkFotoFinal2 = "new_linkdafotofinal2", LinkFotoFinal3 = "new_linkdafotofinal3";

    public const int Solicitado = Codigos.Solicitado, Agendado = Codigos.Aprovado, Programado = Codigos.Programado;
    public const int Realizado = Codigos.Realizado, Reprovado = Codigos.Reprovado, Cancelado = Codigos.Cancelado;
    public const int PagamentoCartao = 202410000, PagamentoPedidoCompra = 202410001, PagamentoPix = 202410002, PagamentoDinheiro = 202410003;
    public const int OrigemManual = 100000001;
}

/// <summary>Linha da Geral (cr40f_reservadeveculos) que guarda só a programação da manutenção.</summary>
public static class G
{
    public const string Tabela = "cr40f_reservadeveculos";
    public const string Manutencao = "cr40f_om", Categoria = "new_categoriadoitem", Veiculo = "cr40f_veiculo", Motorista = "cr40f_motorista";
    public const string Saida = "cr40f_dataehorriodesada", Status = "cr40f_status", FoiProgramado = "new_foiprogramado";
    public const string DataFinalizacao = "new_datadefinalizacao", ObservacaoFinal = "new_observacaofinal";

    public const int CategoriaManutencao = 100000001;
    /// <summary>Status da linha encaixada e ainda não programada. Conferido na Tarefa 1 (descoberta).</summary>
    public const int StatusAProgramar = 202410001;
    public const int StatusProgramado = 202410005, StatusConcluido = 202410008, StatusCancelado = 202410002, StatusCanceladoComReservas = 202410010;
}

/// <summary>Despesa operacional ligada à manutenção. Campos iguais a apps/motoristas/src/features/despesas/expenses.payload.ts.</summary>
public static class D
{
    public const string Tabela = "cr40f_despesaoperacional", TabelaCategoria = "cr40f_categoriadespesaoperacional", TabelaForma = "cr40f_formapagamentodespesa", TabelaCidade = "cr40f_cidade";
    public const string Manutencao = "cr40f_manutencao", Nome = "cr40f_nome", DataGasto = "cr40f_datagasto", Valor = "cr40f_valor";
    public const string StatusOperacional = "cr40f_statusoperacional", StatusFinanceiro = "cr40f_statusfinanceiro", StatusAnexo = "cr40f_statusanexo", Origem = "cr40f_origem";
    public const string Observacao = "cr40f_observacao", Estabelecimento = "cr40f_estabelecimento";
    public const string Motorista = "cr40f_motorista", Categoria = "cr40f_categoria", Forma = "cr40f_formapagamento", Cidade = "cr40f_cidade", Veiculo = "cr40f_veiculo";
    public const int StatusInicial = 100000000, OrigemApp = 100000000, AnexoPendente = 100000001, AnexoEnviado = 100000002;
}
```

- [ ] **Step 4: Escrever `Contratos.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs
using System.Runtime.Serialization;

namespace Cr40f.Frota.Plugin.Manutencao;

[DataContract]
public sealed class AgendarPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    /// <summary>yyyy-MM-dd.</summary>
    [DataMember(Name = "inicio")] public string Inicio { get; set; } = "";
    [DataMember(Name = "fim")] public string Fim { get; set; } = "";
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
}

[DataContract]
public sealed class MotivoPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
}

[DataContract]
public sealed class ConcluirPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    [DataMember(Name = "servicos")] public int[] Servicos { get; set; } = new int[0];
    [DataMember(Name = "km")] public int Km { get; set; }
    /// <summary>ISO 8601 com fuso (hora da ação no aparelho ou no shell).</summary>
    [DataMember(Name = "data")] public string Data { get; set; } = "";
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
    [DataMember(Name = "pagamento")] public int Pagamento { get; set; }
    [DataMember(Name = "estabelecimento")] public string Estabelecimento { get; set; } = "";
    [DataMember(Name = "cidadeId")] public string CidadeId { get; set; } = "";
    [DataMember(Name = "realizadoPorId")] public string RealizadoPorId { get; set; } = "";
    [DataMember(Name = "servicoRealizado")] public string? ServicoRealizado { get; set; }
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
    [DataMember(Name = "linkNotaFiscal")] public string? LinkNotaFiscal { get; set; }
    [DataMember(Name = "linkFotoFinal1")] public string? LinkFotoFinal1 { get; set; }
    [DataMember(Name = "linkFotoFinal2")] public string? LinkFotoFinal2 { get; set; }
    [DataMember(Name = "linkFotoFinal3")] public string? LinkFotoFinal3 { get; set; }
}

[DataContract]
public sealed class AgendarResposta
{
    [DataMember(Name = "geralId")] public string GeralId { get; set; } = "";
}

[DataContract]
public sealed class ConcluirResposta
{
    [DataMember(Name = "despesaId")] public string DespesaId { get; set; } = "";
    /// <summary>D.AnexoPendente: quem chamou ainda sobe a nota fiscal na despesa. D.AnexoEnviado: já subiu antes.</summary>
    [DataMember(Name = "statusAnexo")] public int StatusAnexo { get; set; }
    [DataMember(Name = "geralId")] public string? GeralId { get; set; }
}
```

- [ ] **Step 5: Escrever `Ciclo.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/Ciclo.cs
using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Regras do ciclo da manutenção, sem Dataverse. Spec: docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md.</summary>
public static class Ciclo
{
    static readonly int[] Pagamentos = { M.PagamentoCartao, M.PagamentoPedidoCompra, M.PagamentoPix, M.PagamentoDinheiro };

    public static InvalidPluginExecutionException Erro(string mensagem) => new(mensagem);

    /// <summary>Um dia (início = fim) ou uma semana de segunda a domingo.</summary>
    public static (DateTime Inicio, DateTime Fim) ValidarJanela(string inicio, string fim)
    {
        var i = LerDia(inicio);
        var f = LerDia(fim);
        if (i == f) return (i, f);
        if (i.DayOfWeek == DayOfWeek.Monday && f == i.AddDays(6)) return (i, f);
        throw Erro("A janela precisa ser um dia ou uma semana de segunda a domingo.");
    }

    /// <summary>00:00 de Brasília (UTC−3, sem horário de verão desde 2019) em UTC.</summary>
    public static DateTime InicioDoDiaUtc(DateTime dia) => DateTime.SpecifyKind(dia.Date.AddHours(3), DateTimeKind.Utc);

    public static void ExigirAgendavel(int status)
    {
        if (status is not (M.Solicitado or M.Agendado or M.Programado)) throw Erro("Só dá para encaixar uma manutenção em aberto.");
    }

    public static void ExigirReprovavel(int status)
    {
        if (status != M.Solicitado) throw Erro("Só dá para reprovar uma manutenção que ainda não foi encaixada.");
    }

    public static void ExigirCancelavel(int status)
    {
        if (Encerrada(status)) throw Erro("Esta manutenção já foi encerrada.");
    }

    public static void ExigirConcluivel(int status)
    {
        if (Encerrada(status)) throw Erro("Esta manutenção já foi encerrada.");
    }

    public static bool Encerrada(int status) => status is M.Realizado or M.Reprovado or M.Cancelado;

    public static void ValidarConclusao(ConcluirPedido p)
    {
        if (p.Servicos is null || p.Servicos.Length == 0) throw Erro("Escolha pelo menos um serviço realizado.");
        var fora = p.Servicos.Where(s => !Catalogo.Servicos.ContainsKey(s)).ToList();
        if (fora.Count > 0) throw Erro("Serviço desconhecido: " + string.Join(", ", fora) + ".");
        if (p.Km <= 0) throw Erro("Informe o km do veículo.");
        if (p.Valor <= 0) throw Erro("Informe o valor pago.");
        if (!Pagamentos.Contains(p.Pagamento)) throw Erro("Escolha a forma de pagamento.");
        if (string.IsNullOrWhiteSpace(p.Estabelecimento)) throw Erro("Informe o estabelecimento.");
        if (!Guid.TryParse(p.CidadeId, out _)) throw Erro("Informe a cidade.");
        if (!Guid.TryParse(p.RealizadoPorId, out _)) throw Erro("Informe quem realizou a manutenção.");
        LerDataHora(p.Data);
    }

    public static DateTime LerDataHora(string valor)
    {
        if (!DateTimeOffset.TryParse(valor, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var data))
            throw Erro("Data da manutenção inválida.");
        return data.UtcDateTime;
    }

    /// <summary>
    /// Novo status da manutenção quando a linha da Geral muda, ou null se não muda. Só age em manutenção encaixada
    /// (Agendado/Programado); conclusão e cancelamento são das Custom APIs, que gravam a manutenção antes da linha.
    /// </summary>
    public static int? Espelho(int statusManutencao, int? statusGeral, bool temMotorista)
    {
        if (statusManutencao is not (M.Agendado or M.Programado)) return null;
        if (statusGeral is G.StatusConcluido or G.StatusCancelado or G.StatusCanceladoComReservas) return null;
        var programada = statusGeral == G.StatusProgramado && temMotorista;
        if (programada && statusManutencao == M.Agendado) return M.Programado;
        if (!programada && statusManutencao == M.Programado) return M.Agendado;
        return null;
    }

    static DateTime LerDia(string valor)
    {
        if (!DateTime.TryParseExact(valor, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dia))
            throw Erro("Data da janela inválida (use aaaa-mm-dd).");
        return dia.Date;
    }
}
```

- [ ] **Step 6: Rodar os testes (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~CicloTests`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/Manutencao packages/plugins/Cr40f.Frota.Plugin.Tests/CicloTests.cs
git commit -m "feat(frota): regras do ciclo da manutenção (janela, transições, espelho)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Agendar, Reprovar e Cancelar

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/LinhaGeral.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.cs` (Concluir entra na Tarefa 5)
- Create: `packages/plugins/Cr40f.Frota.Plugin.Tests/MemoriaService.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs`

**Interfaces:**
- Consumes: `M`, `G`, `Ciclo`, `AgendarPedido`, `MotivoPedido`, `AgendarResposta` (Tarefa 3); campos de `LinhaGeral.Nova` (Tarefa 1).
- Produces:
  - `LinhaGeral.Ativa(IOrganizationService, Guid manutencaoId) -> Entity?` (lança erro se houver mais de uma);
  - `LinhaGeral.Nova(Guid manutencaoId, EntityReference veiculo, DateTime saidaUtc) -> Entity`;
  - `new ManutencaoService(IOrganizationService, Func<DateTime> agoraUtc)` com `Agendar(AgendarPedido) -> AgendarResposta`, `Reprovar(MotivoPedido)` e `Cancelar(MotivoPedido)`;
  - `MemoriaService` nos testes: `Com(params Entity[])`, `Linha(tabela, id)`, `Todas(tabela)`, `Criados`, `Atualizados`.

- [ ] **Step 1: Escrever o serviço em memória dos testes**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/MemoriaService.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Tests;

/// <summary>Dataverse em memória: Create/Update/Retrieve e RetrieveMultiple com condições Equal, NotEqual, Null e NotIn no nível raiz.</summary>
public sealed class MemoriaService : IOrganizationService
{
    readonly Dictionary<(string, Guid), Entity> _linhas = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();

    public MemoriaService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas) _linhas[(linha.LogicalName, linha.Id)] = Clonar(linha);
        return this;
    }

    public Entity Linha(string tabela, Guid id) => _linhas[(tabela, id)];
    public IEnumerable<Entity> Todas(string tabela) => _linhas.Values.Where(e => e.LogicalName == tabela);

    public Guid Create(Entity entity)
    {
        var id = entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id;
        var nova = Clonar(entity);
        nova.Id = id;
        if (!nova.Contains("statecode")) nova["statecode"] = new OptionSetValue(0);
        _linhas[(nova.LogicalName, id)] = nova;
        Criados.Add(Clonar(nova));
        return id;
    }

    public void Update(Entity entity)
    {
        if (!_linhas.TryGetValue((entity.LogicalName, entity.Id), out var atual)) throw new InvalidOperationException($"{entity.LogicalName} {entity.Id} não existe.");
        foreach (var a in entity.Attributes) atual[a.Key] = a.Value;
        Atualizados.Add(Clonar(entity));
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        if (!_linhas.TryGetValue((entityName, id), out var linha)) throw new InvalidPluginExecutionException($"{entityName} {id} não existe.");
        return Clonar(linha);
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        var linhas = Todas(q.EntityName).Where(e => q.Criteria.Conditions.All(c => Atende(e, c))).Select(Clonar).ToList();
        return new EntityCollection(linhas) { MoreRecords = false };
    }

    static bool Atende(Entity e, ConditionExpression c)
    {
        e.Attributes.TryGetValue(c.AttributeName, out var valor);
        object? bruto = valor switch { EntityReference r => r.Id, OptionSetValue o => o.Value, _ => valor };
        return c.Operator switch
        {
            ConditionOperator.Equal => Equals(bruto, c.Values[0]),
            ConditionOperator.NotEqual => !Equals(bruto, c.Values[0]),
            ConditionOperator.Null => bruto is null,
            ConditionOperator.NotIn => !c.Values.Any(v => Equals(v, bruto)),
            _ => throw new NotSupportedException(c.Operator.ToString()),
        };
    }

    static Entity Clonar(Entity origem)
    {
        var copia = new Entity(origem.LogicalName, origem.Id);
        foreach (var a in origem.Attributes) copia[a.Key] = a.Value;
        return copia;
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
```

- [ ] **Step 2: Escrever os testes que falham**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs
using System;
using System.Linq;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class AgendarTests
{
    static readonly DateTime Agora = new(2026, 11, 16, 13, 0, 0, DateTimeKind.Utc);
    readonly Guid _manutencaoId = Guid.NewGuid();
    readonly EntityReference _veiculo = new("cr40f_veiculos", Guid.NewGuid());

    Entity Manutencao(int status, DateTime? aprovadaEm = null) => new(M.Tabela, _manutencaoId)
    {
        [M.Status] = new OptionSetValue(status),
        [M.Veiculo] = _veiculo,
        [M.DataAprovacao] = aprovadaEm,
    };

    Entity Linha(int status, Guid? motorista = null) => new(G.Tabela, Guid.NewGuid())
    {
        [G.Manutencao] = new EntityReference(M.Tabela, _manutencaoId),
        [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
        [G.Status] = new OptionSetValue(status),
        [G.Motorista] = motorista is null ? null : new EntityReference("cr40f_funcionarios", motorista.Value),
        [G.FoiProgramado] = motorista is not null,
        ["statecode"] = new OptionSetValue(0),
    };

    ManutencaoService Servico(MemoriaService memoria) => new(memoria, () => Agora);

    AgendarPedido Semana(string? comentario = null) => new() { ManutencaoId = _manutencaoId.ToString(), Inicio = "2026-11-16", Fim = "2026-11-22", Comentario = comentario };

    [Fact]
    public void Primeiro_encaixe_cria_a_linha_da_Geral_e_agenda()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado));

        var resposta = Servico(memoria).Agendar(Semana("Levar até sexta"));

        var linha = memoria.Todas(G.Tabela).Single();
        Assert.Equal(resposta.GeralId, linha.Id.ToString());
        Assert.Equal(G.CategoriaManutencao, linha.GetAttributeValue<OptionSetValue>(G.Categoria).Value);
        Assert.Equal(_manutencaoId, linha.GetAttributeValue<EntityReference>(G.Manutencao).Id);
        Assert.Equal(_veiculo.Id, linha.GetAttributeValue<EntityReference>(G.Veiculo).Id);
        Assert.Equal(new DateTime(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc), linha.GetAttributeValue<DateTime>(G.Saida));
        Assert.Equal(G.StatusAProgramar, linha.GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.False(linha.GetAttributeValue<bool>(G.FoiProgramado));

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Agendado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(new DateTime(2026, 11, 16), m.GetAttributeValue<DateTime>(M.JanelaInicio));
        Assert.Equal(new DateTime(2026, 11, 22), m.GetAttributeValue<DateTime>(M.JanelaFim));
        Assert.Equal(Agora, m.GetAttributeValue<DateTime>(M.DataAprovacao));
        Assert.Equal("Levar até sexta", m.GetAttributeValue<string>(M.ComentarioAoMotorista));
    }

    [Fact]
    public void Reagendar_reaproveita_a_linha_tira_o_motorista_e_mantem_a_data_do_primeiro_encaixe()
    {
        var primeiroEncaixe = new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc);
        var linha = Linha(G.StatusProgramado, Guid.NewGuid());
        var memoria = new MemoriaService().Com(Manutencao(M.Programado, primeiroEncaixe), linha);

        var resposta = Servico(memoria).Agendar(new AgendarPedido { ManutencaoId = _manutencaoId.ToString(), Inicio = "2026-11-25", Fim = "2026-11-25" });

        Assert.Equal(linha.Id.ToString(), resposta.GeralId);
        Assert.Single(memoria.Todas(G.Tabela));
        var atual = memoria.Linha(G.Tabela, linha.Id);
        Assert.Null(atual.GetAttributeValue<EntityReference>(G.Motorista));
        Assert.Equal(G.StatusAProgramar, atual.GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.False(atual.GetAttributeValue<bool>(G.FoiProgramado));
        Assert.Equal(new DateTime(2026, 11, 25, 3, 0, 0, DateTimeKind.Utc), atual.GetAttributeValue<DateTime>(G.Saida));
        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Agendado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(primeiroEncaixe, m.GetAttributeValue<DateTime>(M.DataAprovacao));
    }

    [Fact]
    public void Linha_cancelada_nao_conta_como_ativa()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado), Linha(G.StatusCancelado));
        Servico(memoria).Agendar(Semana());
        Assert.Equal(2, memoria.Todas(G.Tabela).Count());
    }

    [Fact]
    public void Duas_linhas_ativas_e_erro()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Agendado), Linha(G.StatusAProgramar), Linha(G.StatusAProgramar));
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
        Assert.Contains("mais de uma", erro.Message);
    }

    [Fact]
    public void Sem_veiculo_nao_encaixa()
    {
        var m = Manutencao(M.Solicitado);
        m[M.Veiculo] = null;
        var memoria = new MemoriaService().Com(m);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
        Assert.Empty(memoria.Criados);
    }

    [Fact]
    public void Realizada_nao_encaixa()
    {
        var memoria = new MemoriaService().Com(Manutencao(M.Realizado));
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Agendar(Semana()));
    }

    [Fact]
    public void Reprovar_exige_comentario_e_cancela_a_linha()
    {
        var linha = Linha(G.StatusAProgramar);
        var memoria = new MemoriaService().Com(Manutencao(M.Solicitado), linha);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Reprovar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = " " }));

        Servico(memoria).Reprovar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = "Já foi feito semana passada" });

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Reprovado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal("Já foi feito semana passada", m.GetAttributeValue<string>(M.ComentarioAprovador));
        Assert.Equal(G.StatusCancelado, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
    }

    [Fact]
    public void Cancelar_programada_grava_manutencao_antes_da_linha()
    {
        var linha = Linha(G.StatusProgramado, Guid.NewGuid());
        var memoria = new MemoriaService().Com(Manutencao(M.Programado), linha);

        Servico(memoria).Cancelar(new MotivoPedido { ManutencaoId = _manutencaoId.ToString(), Comentario = "Carro vendido" });

        Assert.Equal(M.Cancelado, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(G.StatusCancelado, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.Equal(M.Tabela, memoria.Atualizados.First().LogicalName); // espelho vê a manutenção já encerrada
    }
}
```

- [ ] **Step 3: Rodar e ver falhar (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~AgendarTests`
Expected: FAIL na compilação ("ManutencaoService could not be found").

- [ ] **Step 4: Escrever `LinhaGeral.cs`**

Acrescente em `Nova` os campos listados em "Decisões para o código" da descoberta (Tarefa 1). Os do bloco abaixo são o mínimo.

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/LinhaGeral.cs
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>A linha da Geral guarda só a programação da manutenção (quando e quem). No máximo uma ativa por manutenção.</summary>
public static class LinhaGeral
{
    static readonly string[] Colunas = { G.Status, G.Motorista, G.Veiculo, G.Saida, G.FoiProgramado, G.Categoria, G.Manutencao };

    public static Entity? Ativa(IOrganizationService service, Guid manutencaoId)
    {
        var query = new QueryExpression(G.Tabela) { ColumnSet = new ColumnSet(Colunas), TopCount = 3 };
        query.Criteria.AddCondition(G.Manutencao, ConditionOperator.Equal, manutencaoId);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition(G.Status, ConditionOperator.NotIn, G.StatusCancelado, G.StatusCanceladoComReservas);
        var linhas = service.RetrieveMultiple(query).Entities;
        if (linhas.Count > 1) throw Ciclo.Erro("Esta manutenção tem mais de uma linha ativa na Geral. Cancele as duplicadas antes de continuar.");
        return linhas.FirstOrDefault();
    }

    /// <summary>Linha encaixada e ainda não programada: sem motorista, saída no início da janela.</summary>
    public static Entity Nova(Guid manutencaoId, EntityReference veiculo, DateTime saidaUtc) => new(G.Tabela)
    {
        [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
        [G.Manutencao] = new EntityReference(M.Tabela, manutencaoId),
        [G.Veiculo] = veiculo,
        [G.Saida] = saidaUtc,
        [G.Status] = new OptionSetValue(G.StatusAProgramar),
        [G.FoiProgramado] = false,
    };

    /// <summary>Reagendamento: volta a "a programar" e tira o motorista (o DriverNoticePlugin avisa quem saiu).</summary>
    public static Entity Reabrir(Guid geralId, EntityReference veiculo, DateTime saidaUtc) => new(G.Tabela, geralId)
    {
        [G.Veiculo] = veiculo,
        [G.Saida] = saidaUtc,
        [G.Motorista] = null,
        [G.Status] = new OptionSetValue(G.StatusAProgramar),
        [G.FoiProgramado] = false,
    };

    public static Entity Cancelar(Guid geralId) => new(G.Tabela, geralId) { [G.Status] = new OptionSetValue(G.StatusCancelado) };
}
```

- [ ] **Step 5: Escrever `ManutencaoService.cs` (sem Concluir)**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.cs
using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>
/// Ações da manutenção. Ordem das gravações: a manutenção encerrada é gravada antes da linha da Geral,
/// para o espelho (GeralManutencaoEspelhoPlugin) ver o estado final e não reabrir nada.
/// </summary>
public sealed partial class ManutencaoService
{
    readonly IOrganizationService _service;
    readonly Func<DateTime> _agoraUtc;

    public ManutencaoService(IOrganizationService service, Func<DateTime> agoraUtc)
    {
        _service = service;
        _agoraUtc = agoraUtc;
    }

    public AgendarResposta Agendar(AgendarPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        var (inicio, fim) = Ciclo.ValidarJanela(pedido.Inicio, pedido.Fim);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status, M.Veiculo, M.DataAprovacao));
        Ciclo.ExigirAgendavel(Status(m));
        var veiculo = m.GetAttributeValue<EntityReference>(M.Veiculo) ?? throw Ciclo.Erro("A manutenção não tem veículo. Informe o veículo antes de encaixar.");
        var saida = Ciclo.InicioDoDiaUtc(inicio);

        var linha = LinhaGeral.Ativa(_service, id);
        Guid geralId;
        if (linha is null) geralId = _service.Create(LinhaGeral.Nova(id, veiculo, saida));
        else
        {
            geralId = linha.Id;
            _service.Update(LinhaGeral.Reabrir(linha.Id, veiculo, saida));
        }

        var patch = new Entity(M.Tabela, id)
        {
            [M.JanelaInicio] = inicio,
            [M.JanelaFim] = fim,
            [M.Status] = new OptionSetValue(M.Agendado),
        };
        if (m.GetAttributeValue<DateTime?>(M.DataAprovacao) is null) patch[M.DataAprovacao] = _agoraUtc();
        if (!string.IsNullOrWhiteSpace(pedido.Comentario)) patch[M.ComentarioAoMotorista] = pedido.Comentario!.Trim();
        _service.Update(patch);
        return new AgendarResposta { GeralId = geralId.ToString() };
    }

    public void Reprovar(MotivoPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        if (string.IsNullOrWhiteSpace(pedido.Comentario)) throw Ciclo.Erro("Escreva o motivo da reprovação.");
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status));
        Ciclo.ExigirReprovavel(Status(m));
        Encerrar(id, M.Reprovado, pedido.Comentario!);
    }

    public void Cancelar(MotivoPedido pedido)
    {
        var id = Id(pedido.ManutencaoId);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status));
        Ciclo.ExigirCancelavel(Status(m));
        Encerrar(id, M.Cancelado, pedido.Comentario);
    }

    void Encerrar(Guid id, int status, string? comentario)
    {
        var linha = LinhaGeral.Ativa(_service, id);
        var patch = new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(status) };
        if (!string.IsNullOrWhiteSpace(comentario)) patch[M.ComentarioAprovador] = comentario!.Trim();
        _service.Update(patch);
        if (linha is not null) _service.Update(LinhaGeral.Cancelar(linha.Id));
    }

    static Guid Id(string valor) => Guid.TryParse(valor, out var id) ? id : throw Ciclo.Erro("Manutenção não informada.");

    static int Status(Entity e, string coluna = M.Status) => e.GetAttributeValue<OptionSetValue>(coluna)?.Value ?? M.Solicitado;
}
```

- [ ] **Step 6: Rodar os testes (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~AgendarTests|FullyQualifiedName~CicloTests"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/Manutencao packages/plugins/Cr40f.Frota.Plugin.Tests/MemoriaService.cs packages/plugins/Cr40f.Frota.Plugin.Tests/AgendarTests.cs
git commit -m "feat(frota): agendar, reprovar e cancelar manutenção com a linha da Geral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Concluir (manutenção, despesa e linha da Geral)

**Files:**
- Modify: `packages/plugins/Cr40f.Frota.Plugin/Catalogo.cs` (adicionar `CategoriaPorServico` e `Categorias(IEnumerable<int>)`)
- Modify: `packages/plugins/Cr40f.Frota.Plugin.Tests/ParidadeTests.cs` (paridade das categorias)
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/DespesaManutencao.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.Concluir.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/ConcluirTests.cs`

**Interfaces:**
- Consumes: `ManutencaoService` (parcial), `LinhaGeral`, `Ciclo.ValidarConclusao`, `ConcluirPedido`, `ConcluirResposta`; tipo de `D.Valor` (Tarefa 1).
- Produces:
  - `ManutencaoService.Concluir(ConcluirPedido) -> ConcluirResposta`;
  - `DespesaManutencao.Garantir(...) -> (Guid Id, int StatusAnexo)`;
  - `DespesaManutencao.NomesForma(int pagamento) -> string[]`;
  - `Catalogo.Categorias(IEnumerable<int> servicos) -> int[]`.

- [ ] **Step 1: Escrever os testes que falham**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/ConcluirTests.cs
using System;
using System.Linq;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class ConcluirTests
{
    readonly Guid _manutencaoId = Guid.NewGuid();
    readonly EntityReference _veiculo = new("cr40f_veiculos", Guid.NewGuid());
    readonly Guid _categoriaManutencao = Guid.NewGuid();
    readonly Guid _cartao = Guid.NewGuid();
    readonly Guid _particular = Guid.NewGuid();

    MemoriaService Base(int status, Entity? linha = null, string? notaNoRegistro = null)
    {
        var memoria = new MemoriaService().Com(
            new Entity(M.Tabela, _manutencaoId) { [M.Status] = new OptionSetValue(status), [M.Veiculo] = _veiculo, [M.LinkNotaFiscal] = notaNoRegistro },
            new Entity(D.TabelaCategoria, Guid.NewGuid()) { [D.Nome] = "Combustível" },
            new Entity(D.TabelaCategoria, _categoriaManutencao) { [D.Nome] = "Manutenção" },
            new Entity(D.TabelaForma, _cartao) { [D.Nome] = "Cartão de crédito" },
            new Entity(D.TabelaForma, _particular) { [D.Nome] = "Particular (Reembolso)" });
        if (linha is not null) memoria.Com(linha);
        return memoria;
    }

    Entity Linha() => new(G.Tabela, Guid.NewGuid())
    {
        [G.Manutencao] = new EntityReference(M.Tabela, _manutencaoId),
        [G.Status] = new OptionSetValue(G.StatusProgramado),
        [G.Motorista] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        ["statecode"] = new OptionSetValue(0),
    };

    ConcluirPedido Pedido(Action<ConcluirPedido>? mudar = null)
    {
        var p = CicloTests.PedidoValido();
        p.ManutencaoId = _manutencaoId.ToString();
        p.Servicos = new[] { 100000007, 100000014 }; // pastilhas (Freios) + alinhamento (Pneus e rodas)
        mudar?.Invoke(p);
        return p;
    }

    static ManutencaoService Servico(MemoriaService m) => new(m, () => DateTime.UtcNow);

    [Fact]
    public void Conclui_manutencao_cria_despesa_e_conclui_a_linha()
    {
        var linha = Linha();
        var memoria = Base(M.Programado, linha);

        var resposta = Servico(memoria).Concluir(Pedido());

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Realizado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(new[] { 100000007, 100000014 }, m.GetAttributeValue<OptionSetValueCollection>(M.Servicos).Select(o => o.Value));
        Assert.Equal(new[] { 100000001, 100000002 }, m.GetAttributeValue<OptionSetValueCollection>(M.Categorias).Select(o => o.Value).OrderBy(v => v));
        Assert.Equal(M.OrigemManual, m.GetAttributeValue<OptionSetValue>(M.Origem).Value);
        Assert.Equal(85200, m.GetAttributeValue<int>(M.KmRealizado));
        Assert.Equal(380.50m, m.GetAttributeValue<Money>(M.Valor).Value);
        Assert.Equal(M.PagamentoCartao, m.GetAttributeValue<OptionSetValue>(M.Pagamento).Value);
        Assert.Equal("https://sharepoint/nota.jpg", m.GetAttributeValue<string>(M.LinkNotaFiscal));

        var despesa = memoria.Todas(D.Tabela).Single();
        Assert.Equal(resposta.DespesaId, despesa.Id.ToString());
        Assert.Equal(_categoriaManutencao, despesa.GetAttributeValue<EntityReference>(D.Categoria).Id);
        Assert.Equal(_cartao, despesa.GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal(_manutencaoId, despesa.GetAttributeValue<EntityReference>(D.Manutencao).Id);
        Assert.Equal(_veiculo.Id, despesa.GetAttributeValue<EntityReference>(D.Veiculo).Id);
        Assert.Equal(D.AnexoPendente, resposta.StatusAnexo);

        Assert.Equal(G.StatusConcluido, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.Equal(linha.Id.ToString(), resposta.GeralId);
    }

    [Fact]
    public void Repetir_nao_duplica_despesa_e_preserva_o_anexo_enviado()
    {
        var memoria = Base(M.Agendado, Linha());
        var primeira = Servico(memoria).Concluir(Pedido());
        memoria.Update(new Entity(D.Tabela, Guid.Parse(primeira.DespesaId)) { [D.StatusAnexo] = new OptionSetValue(D.AnexoEnviado) });

        var segunda = Servico(memoria).Concluir(Pedido());

        Assert.Single(memoria.Todas(D.Tabela));
        Assert.Equal(primeira.DespesaId, segunda.DespesaId);
        Assert.Equal(D.AnexoEnviado, segunda.StatusAnexo);
    }

    [Fact]
    public void Dinheiro_vira_Particular_na_despesa()
    {
        var memoria = Base(M.Programado);
        Servico(memoria).Concluir(Pedido(p => p.Pagamento = M.PagamentoDinheiro));
        Assert.Equal(_particular, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal(M.PagamentoDinheiro, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Pagamento).Value);
    }

    [Fact]
    public void Sem_nota_fiscal_nao_conclui()
    {
        var memoria = Base(M.Programado);
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Concluir(Pedido(p => p.LinkNotaFiscal = null)));
        Assert.Contains("nota fiscal", erro.Message);
        Assert.Empty(memoria.Criados);
    }

    [Fact]
    public void Nota_ja_gravada_no_registro_vale()
    {
        var memoria = Base(M.Programado, notaNoRegistro: "https://sharepoint/antes.jpg");
        Servico(memoria).Concluir(Pedido(p => p.LinkNotaFiscal = null));
        Assert.Equal(M.Realizado, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Sem_linha_na_Geral_conclui_mesmo_assim()
    {
        var memoria = Base(M.Solicitado); // escritório lançando depois do fato
        var resposta = Servico(memoria).Concluir(Pedido());
        Assert.Null(resposta.GeralId);
        Assert.Single(memoria.Todas(D.Tabela));
    }

    [Fact]
    public void Cancelada_nao_conclui()
    {
        var memoria = Base(M.Cancelado);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Concluir(Pedido()));
    }

    [Fact]
    public void Grava_a_manutencao_antes_da_linha()
    {
        var memoria = Base(M.Programado, Linha());
        Servico(memoria).Concluir(Pedido());
        var ordem = memoria.Atualizados.Select(e => e.LogicalName).Where(n => n is M.Tabela or G.Tabela).ToList();
        Assert.True(ordem.IndexOf(M.Tabela) < ordem.IndexOf(G.Tabela));
    }
}
```

Acrescente ao final da classe `ParidadeTests` (antes do `}` que fecha a classe) e ao `ServicoJson`:

```csharp
    [Fact]
    public void Categoria_de_cada_servico_igual_ao_json_do_shell()
    {
        var json = File.ReadAllText(FixtureParidade.Caminho("..", "..", "..", "..", "..", "..", "apps", "shell", "src", "pages", "frota", "domain", "manutencaoCatalogo.json"));
        var catalogo = Json.Ler<CatalogoJson>(json);
        Assert.Equal(catalogo.Servicos.ToDictionary(s => s.Value, s => s.Categoria), Catalogo.CategoriaPorServico.ToDictionary(k => k.Key, k => k.Value));
    }
```

```csharp
// em ServicoJson
    [DataMember(Name = "categoria")] public int Categoria { get; set; }
```

- [ ] **Step 2: Rodar e ver falhar (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter "FullyQualifiedName~ConcluirTests|FullyQualifiedName~ParidadeTests"`
Expected: FAIL na compilação (`Concluir`, `CategoriaPorServico` não existem).

- [ ] **Step 3: Gerar `CategoriaPorServico` a partir do JSON do shell**

Run (leve, pode rodar nesta máquina):

```bash
python3 -I -c "
import json
d=json.load(open('apps/shell/src/pages/frota/domain/manutencaoCatalogo.json'))
for s in d['servicos']: print(f'        [{s[\"value\"]}] = {s[\"categoria\"]},')"
```

Cole a saída no dicionário abaixo, dentro de `Catalogo.cs`:

```csharp
    /// <summary>Categoria (new_categoriasmanutencao) de cada serviço, do mesmo JSON do shell (ParidadeTests confere).</summary>
    public static readonly IReadOnlyDictionary<int, int> CategoriaPorServico = new Dictionary<int, int>
    {
        // saída do comando acima, uma linha por serviço
    };

    public static int[] Categorias(IEnumerable<int> servicos)
        => servicos.Where(CategoriaPorServico.ContainsKey).Select(s => CategoriaPorServico[s]).Distinct().OrderBy(c => c).ToArray();
```

Adicione `using System.Linq;` no topo de `Catalogo.cs`.

- [ ] **Step 4: Escrever `DespesaManutencao.cs`**

Se a descoberta (Tarefa 1) indicar que `cr40f_despesaoperacional.cr40f_valor` é `Decimal`, troque `new Money(p.Valor)` por `p.Valor`.

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/DespesaManutencao.cs
using System;
using System.Globalization;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Uma despesa da categoria Manutenção por manutenção, com os mesmos campos que o App gravava (expenses.payload.ts).</summary>
public sealed class DespesaManutencao
{
    readonly IOrganizationService _service;
    public DespesaManutencao(IOrganizationService service) => _service = service;

    public (Guid Id, int StatusAnexo) Garantir(Guid manutencaoId, EntityReference veiculo, EntityReference motorista, ConcluirPedido p, DateTime dataUtc)
    {
        var categoria = PorNome(D.TabelaCategoria, n => n.Contains("manutencao")) ?? throw Ciclo.Erro("Categoria de despesa \"Manutenção\" não encontrada.");
        var nomesForma = NomesForma(p.Pagamento).Select(Normalizar).ToArray();
        var forma = PorNome(D.TabelaForma, n => nomesForma.Contains(n)) ?? throw Ciclo.Erro("Forma de pagamento da despesa não encontrada: " + NomesForma(p.Pagamento)[0] + ".");

        var dados = new Entity(D.Tabela)
        {
            [D.Nome] = categoria.GetAttributeValue<string>(D.Nome) + " - " + DataBrasilia(dataUtc).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            [D.DataGasto] = dataUtc,
            [D.Valor] = new Money(p.Valor),
            [D.Observacao] = string.IsNullOrWhiteSpace(p.Comentario) ? "Sem comentarios." : p.Comentario!.Trim(),
            [D.Estabelecimento] = p.Estabelecimento.Trim(),
            [D.Motorista] = motorista,
            [D.Categoria] = categoria.ToEntityReference(),
            [D.Forma] = forma.ToEntityReference(),
            [D.Cidade] = new EntityReference(D.TabelaCidade, Guid.Parse(p.CidadeId)),
            [D.Veiculo] = veiculo,
            [D.Manutencao] = new EntityReference(M.Tabela, manutencaoId),
        };

        var existente = Existente(manutencaoId);
        if (existente is null)
        {
            dados[D.StatusOperacional] = new OptionSetValue(D.StatusInicial);
            dados[D.StatusFinanceiro] = new OptionSetValue(D.StatusInicial);
            dados[D.StatusAnexo] = new OptionSetValue(D.AnexoPendente);
            dados[D.Origem] = new OptionSetValue(D.OrigemApp);
            return (_service.Create(dados), D.AnexoPendente);
        }
        dados.Id = existente.Id;
        _service.Update(dados);
        return (existente.Id, existente.GetAttributeValue<OptionSetValue>(D.StatusAnexo)?.Value ?? D.AnexoPendente);
    }

    /// <summary>Mesmos nomes do App (mapMaintenancePaymentToExpensePaymentNames), com Dinheiro como reembolso.</summary>
    public static string[] NomesForma(int pagamento) => pagamento switch
    {
        M.PagamentoPedidoCompra => new[] { "Faturado (Plano mensal)", "Faturado" },
        M.PagamentoPix or M.PagamentoDinheiro => new[] { "Particular (Reembolso)", "Particular" },
        _ => new[] { "Cartao de credito", "Cartão de crédito" },
    };

    Entity? Existente(Guid manutencaoId)
    {
        var query = new QueryExpression(D.Tabela) { ColumnSet = new ColumnSet(D.StatusAnexo), TopCount = 1 };
        query.Criteria.AddCondition(D.Manutencao, ConditionOperator.Equal, manutencaoId);
        return _service.RetrieveMultiple(query).Entities.FirstOrDefault();
    }

    Entity? PorNome(string tabela, Func<string, bool> aceita)
    {
        var linhas = _service.RetrieveMultiple(new QueryExpression(tabela) { ColumnSet = new ColumnSet(D.Nome) }).Entities;
        return linhas.FirstOrDefault(l => aceita(Normalizar(l.GetAttributeValue<string>(D.Nome) ?? "")));
    }

    static DateTime DataBrasilia(DateTime utc) => utc.AddHours(-3);

    public static string Normalizar(string texto)
    {
        var decomposto = texto.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in decomposto)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC).Trim().ToLowerInvariant();
    }
}
```

- [ ] **Step 5: Escrever `ManutencaoService.Concluir.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/Manutencao/ManutencaoService.Concluir.cs
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

public sealed partial class ManutencaoService
{
    /// <summary>
    /// Caminho único para Realizado (App e shell). Roda na transação da Custom API: despesa, manutenção e linha
    /// entram juntas ou nada entra. Repetir é seguro: com a manutenção já Realizada, só garante despesa e linha.
    /// </summary>
    public ConcluirResposta Concluir(ConcluirPedido p)
    {
        var id = Id(p.ManutencaoId);
        Ciclo.ValidarConclusao(p);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status, M.Veiculo, M.LinkNotaFiscal));
        var status = Status(m);
        var veiculo = m.GetAttributeValue<EntityReference>(M.Veiculo) ?? throw Ciclo.Erro("A manutenção não tem veículo.");
        var realizadoPor = new EntityReference("cr40f_funcionarios", Guid.Parse(p.RealizadoPorId));
        var data = Ciclo.LerDataHora(p.Data);
        var jaRealizada = status == M.Realizado;

        if (!jaRealizada)
        {
            Ciclo.ExigirConcluivel(status);
            var nota = string.IsNullOrWhiteSpace(p.LinkNotaFiscal) ? m.GetAttributeValue<string>(M.LinkNotaFiscal) : p.LinkNotaFiscal;
            if (string.IsNullOrWhiteSpace(nota)) throw Ciclo.Erro("Falta a foto da nota fiscal.");
        }

        var linha = LinhaGeral.AtivaOuConcluida(_service, id);
        var despesa = new DespesaManutencao(_service).Garantir(id, veiculo, realizadoPor, p, data);
        if (!jaRealizada) _service.Update(Conclusao(id, p, data, realizadoPor));
        if (linha is not null && Status(linha, G.Status) != G.StatusConcluido)
        {
            _service.Update(new Entity(G.Tabela, linha.Id)
            {
                [G.Status] = new OptionSetValue(G.StatusConcluido),
                [G.DataFinalizacao] = data,
                [G.ObservacaoFinal] = p.Comentario?.Trim() ?? "",
            });
        }
        return new ConcluirResposta { DespesaId = despesa.Id.ToString(), StatusAnexo = despesa.StatusAnexo, GeralId = linha?.Id.ToString() };
    }

    static Entity Conclusao(Guid id, ConcluirPedido p, DateTime data, EntityReference realizadoPor)
    {
        var e = new Entity(M.Tabela, id)
        {
            [M.Status] = new OptionSetValue(M.Realizado),
            [M.DataManutencao] = data,
            [M.KmRealizado] = p.Km,
            [M.Valor] = new Money(p.Valor),
            [M.Pagamento] = new OptionSetValue(p.Pagamento),
            [M.Estabelecimento] = p.Estabelecimento.Trim(),
            [M.RealizadoPor] = realizadoPor,
            [M.Servicos] = new OptionSetValueCollection(p.Servicos.Distinct().Select(s => new OptionSetValue(s)).ToList()),
            [M.Categorias] = new OptionSetValueCollection(Catalogo.Categorias(p.Servicos).Select(c => new OptionSetValue(c)).ToList()),
            [M.Origem] = new OptionSetValue(M.OrigemManual),
        };
        if (!string.IsNullOrWhiteSpace(p.ServicoRealizado)) e[M.ServicoRealizado] = p.ServicoRealizado!.Trim();
        if (!string.IsNullOrWhiteSpace(p.Comentario)) e[M.ComentarioColaborador] = p.Comentario!.Trim();
        if (!string.IsNullOrWhiteSpace(p.LinkNotaFiscal)) e[M.LinkNotaFiscal] = p.LinkNotaFiscal;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal1)) e[M.LinkFotoFinal1] = p.LinkFotoFinal1;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal2)) e[M.LinkFotoFinal2] = p.LinkFotoFinal2;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal3)) e[M.LinkFotoFinal3] = p.LinkFotoFinal3;
        return e;
    }
}
```

Em `LinhaGeral.cs`, acrescente (a conclusão repetida precisa achar a linha já concluída):

```csharp
    /// <summary>Como Ativa, mas a linha já concluída também conta (Concluir repetido).</summary>
    public static Entity? AtivaOuConcluida(IOrganizationService service, Guid manutencaoId)
    {
        var query = new QueryExpression(G.Tabela) { ColumnSet = new ColumnSet(Colunas), TopCount = 3 };
        query.Criteria.AddCondition(G.Manutencao, ConditionOperator.Equal, manutencaoId);
        query.Criteria.AddCondition(G.Status, ConditionOperator.NotIn, G.StatusCancelado, G.StatusCanceladoComReservas);
        var linhas = service.RetrieveMultiple(query).Entities;
        if (linhas.Count > 1) throw Ciclo.Erro("Esta manutenção tem mais de uma linha ativa na Geral. Cancele as duplicadas antes de continuar.");
        return linhas.FirstOrDefault();
    }
```

Linha concluída pode estar com `statecode` inativo, então essa consulta não filtra por `statecode`.

- [ ] **Step 6: Rodar todos os testes do projeto (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: PASS (inclui `ParidadeTests` e `RepositoryTests`, que já existiam).

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin packages/plugins/Cr40f.Frota.Plugin.Tests
git commit -m "feat(frota): concluir manutenção com despesa e linha da Geral numa transação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Plugins (Custom APIs e espelho)

**Files:**
- Create: `packages/plugins/Cr40f.Frota.Plugin/ManutencaoComandoPlugin.cs`
- Create: `packages/plugins/Cr40f.Frota.Plugin/GeralManutencaoEspelhoPlugin.cs`
- Test: `packages/plugins/Cr40f.Frota.Plugin.Tests/PluginsTests.cs`

**Interfaces:**
- Consumes: `ManutencaoService`, `Ciclo.Espelho`, contratos (Tarefas 3 a 5).
- Produces:
  - Custom APIs globais `cr40f_ManutencaoAgendar`, `cr40f_ManutencaoReprovar`, `cr40f_ManutencaoCancelar` e `cr40f_ManutencaoConcluir`, com entrada `RequestJson` (string) e saída `ResponseJson` (string; `{}` em Reprovar e Cancelar).
  - Tipos `Cr40f.Frota.Plugin.ManutencaoComandoPlugin` e `Cr40f.Frota.Plugin.GeralManutencaoEspelhoPlugin`.
  - Os planos 2 a 4 (shell e App) chamam essas APIs com estes nomes.

- [ ] **Step 1: Escrever os testes que falham**

```csharp
// packages/plugins/Cr40f.Frota.Plugin.Tests/PluginsTests.cs
using System;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class PluginsTests
{
    [Fact]
    public void Comando_despacha_pela_mensagem_e_devolve_json()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Solicitado), [M.Veiculo] = new EntityReference("cr40f_veiculos", Guid.NewGuid()) });
        var json = ManutencaoComandoPlugin.Executar(memoria, ManutencaoComandoPlugin.Agendar, "{\"manutencaoId\":\"" + id + "\",\"inicio\":\"2026-11-18\",\"fim\":\"2026-11-18\"}", () => DateTime.UtcNow);
        Assert.Contains("\"geralId\":\"", json);
        Assert.Equal(M.Agendado, memoria.Linha(M.Tabela, id).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Comando_com_json_invalido_da_erro_legivel()
    {
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => ManutencaoComandoPlugin.Executar(new MemoriaService(), ManutencaoComandoPlugin.Cancelar, "não é json", () => DateTime.UtcNow));
        Assert.Equal("Pedido inválido.", erro.Message);
    }

    [Fact]
    public void Comando_desconhecido_e_recusado()
        => Assert.Throws<InvalidPluginExecutionException>(() => ManutencaoComandoPlugin.Executar(new MemoriaService(), "cr40f_Outra", "{}", () => DateTime.UtcNow));

    [Fact]
    public void Espelho_programa_a_manutencao_quando_a_linha_ganha_motorista()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Agendado) });
        var pre = new Entity(G.Tabela, Guid.NewGuid())
        {
            [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
            [G.Manutencao] = new EntityReference(M.Tabela, id),
            [G.Status] = new OptionSetValue(G.StatusAProgramar),
        };
        var target = new Entity(G.Tabela, pre.Id)
        {
            [G.Status] = new OptionSetValue(G.StatusProgramado),
            [G.Motorista] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        };

        GeralManutencaoEspelhoPlugin.Aplicar(memoria, target, pre);

        Assert.Equal(M.Programado, memoria.Linha(M.Tabela, id).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Espelho_ignora_linha_de_servico()
    {
        var memoria = new MemoriaService();
        var pre = new Entity(G.Tabela, Guid.NewGuid()) { [G.Categoria] = new OptionSetValue(100000000) };
        GeralManutencaoEspelhoPlugin.Aplicar(memoria, new Entity(G.Tabela, pre.Id) { [G.Status] = new OptionSetValue(G.StatusProgramado) }, pre);
        Assert.Empty(memoria.Atualizados);
    }

    [Fact]
    public void Espelho_nao_grava_quando_nada_muda()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Agendado) });
        var pre = new Entity(G.Tabela, Guid.NewGuid()) { [G.Categoria] = new OptionSetValue(G.CategoriaManutencao), [G.Manutencao] = new EntityReference(M.Tabela, id), [G.Status] = new OptionSetValue(G.StatusAProgramar) };
        GeralManutencaoEspelhoPlugin.Aplicar(memoria, new Entity(G.Tabela, pre.Id) { [G.Motorista] = null }, pre);
        Assert.Empty(memoria.Atualizados);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests --filter FullyQualifiedName~PluginsTests`
Expected: FAIL na compilação.

- [ ] **Step 3: Escrever `ManutencaoComandoPlugin.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/ManutencaoComandoPlugin.cs
using System;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Custom APIs globais das manutenções (entrada RequestJson, saída ResponseJson). Rodam no contexto de quem chama:
/// os privilégios do Dataverse continuam valendo (motorista conclui a dele, gestor encaixa).
/// </summary>
public sealed class ManutencaoComandoPlugin : IPlugin
{
    public const string Agendar = "cr40f_ManutencaoAgendar", Reprovar = "cr40f_ManutencaoReprovar", Cancelar = "cr40f_ManutencaoCancelar", Concluir = "cr40f_ManutencaoConcluir";
    public const string Entrada = "RequestJson", Saida = "ResponseJson";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            var service = factory.CreateOrganizationService(context.UserId);
            var json = context.InputParameters.Contains(Entrada) ? context.InputParameters[Entrada] as string : null;
            context.OutputParameters[Saida] = Executar(service, context.MessageName, json ?? "", () => DateTime.UtcNow);
            tracing.Trace("{0}: ok", context.MessageName);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", context.MessageName, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível concluir a ação na manutenção. " + error.Message, error);
        }
    }

    public static string Executar(IOrganizationService service, string mensagem, string json, Func<DateTime> agoraUtc)
    {
        var acoes = new ManutencaoService(service, agoraUtc);
        switch (mensagem)
        {
            case Agendar: return Json.Serializar(acoes.Agendar(Ler<AgendarPedido>(json)));
            case Reprovar: acoes.Reprovar(Ler<MotivoPedido>(json)); return "{}";
            case Cancelar: acoes.Cancelar(Ler<MotivoPedido>(json)); return "{}";
            case Concluir: return Json.Serializar(acoes.Concluir(Ler<ConcluirPedido>(json)));
            default: throw Ciclo.Erro("Ação de manutenção desconhecida: " + mensagem + ".");
        }
    }

    static T Ler<T>(string json) where T : class
    {
        try { return Json.Ler<T>(json) ?? throw Ciclo.Erro("Pedido inválido."); }
        catch (Exception erro) when (erro is SerializationException or System.Xml.XmlException) { throw Ciclo.Erro("Pedido inválido."); }
    }
}
```

- [ ] **Step 4: Escrever `GeralManutencaoEspelhoPlugin.cs`**

```csharp
// packages/plugins/Cr40f.Frota.Plugin/GeralManutencaoEspelhoPlugin.cs
using System;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Step pós-operação síncrono no Update de cr40f_reservadeveculos (filtro: cr40f_status, cr40f_motorista; imagem "pre").
/// Programar a linha de manutenção na Geral põe a manutenção em Programado; tirar da programação volta a Agendado.
/// Grava como SYSTEM: quem programa é a operação, que não precisa de escrita na tabela de manutenções.
/// </summary>
public sealed class GeralManutencaoEspelhoPlugin : IPlugin
{
    public const string ImagemPre = "pre";
    public const string AtributosPre = G.Categoria + "," + G.Manutencao + "," + G.Status + "," + G.Motorista;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            var target = (Entity)context.InputParameters["Target"];
            var pre = context.PreEntityImages.Contains(ImagemPre) ? context.PreEntityImages[ImagemPre] : null;
            Aplicar(factory.CreateOrganizationService(null), target, pre);
        }
        catch (Exception error)
        {
            tracing.Trace("Espelho da manutenção: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível atualizar a manutenção ligada a esta linha. " + error.Message, error);
        }
    }

    public static void Aplicar(IOrganizationService service, Entity target, Entity? pre)
    {
        if (Final<OptionSetValue>(target, pre, G.Categoria)?.Value != G.CategoriaManutencao) return;
        var manutencao = Final<EntityReference>(target, pre, G.Manutencao);
        if (manutencao is null) return;
        var statusGeral = Final<OptionSetValue>(target, pre, G.Status)?.Value;
        var temMotorista = Final<EntityReference>(target, pre, G.Motorista) is not null;

        var m = service.Retrieve(M.Tabela, manutencao.Id, new ColumnSet(M.Status));
        var atual = m.GetAttributeValue<OptionSetValue>(M.Status)?.Value ?? M.Solicitado;
        var novo = Ciclo.Espelho(atual, statusGeral, temMotorista);
        if (novo is null) return;
        service.Update(new Entity(M.Tabela, manutencao.Id) { [M.Status] = new OptionSetValue(novo.Value) });
    }

    static T? Final<T>(Entity target, Entity? pre, string coluna) where T : class
        => target.Contains(coluna) ? target.GetAttributeValue<T>(coluna) : pre?.GetAttributeValue<T>(coluna);
}
```

- [ ] **Step 5: Rodar todos os testes (Betinhos-Renan)**

Run: `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Frota.Plugin/ManutencaoComandoPlugin.cs packages/plugins/Cr40f.Frota.Plugin/GeralManutencaoEspelhoPlugin.cs packages/plugins/Cr40f.Frota.Plugin.Tests/PluginsTests.cs
git commit -m "feat(frota): Custom APIs da manutenção e espelho da programação da Geral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Registrador

**Files:**
- Modify: `packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs`

**Interfaces:**
- Consumes: os nomes de tipo e de mensagem da Tarefa 6 e `GeralManutencaoEspelhoPlugin.AtributosPre`.
- Produces: o registro no DEV, idempotente:
  - 3 tipos de plugin;
  - a Custom API `cr40f_FrotaPendencias` (sem mudança);
  - 4 Custom APIs com `RequestJson` / `ResponseJson`;
  - o step "Cr40f.Frota: espelho da manutenção (Update Geral)" com a imagem `pre`.
  - O Deploy já chama este registrador (`push-plugins-dev.ps1`, peça `frota`), sem mudança no workflow.

- [ ] **Step 1: Generalizar o tipo de plugin**

Em `Program.cs`, troque `const string PluginTypeName = ...` e a chamada `var pluginTypeId = UpsertPluginType(service, assemblyId);` por:

```csharp
const string PendenciasType = "Cr40f.Frota.Plugin.FrotaPendenciasPlugin";
const string ComandoType = "Cr40f.Frota.Plugin.ManutencaoComandoPlugin";
const string EspelhoType = "Cr40f.Frota.Plugin.GeralManutencaoEspelhoPlugin";
```

```csharp
var pendenciasTypeId = UpsertPluginType(service, assemblyId, PendenciasType);
var comandoTypeId = UpsertPluginType(service, assemblyId, ComandoType);
var espelhoTypeId = UpsertPluginType(service, assemblyId, EspelhoType);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
EnsureCustomApi(service, pendenciasTypeId, solutionUniqueName);
foreach (var api in apisManutencao)
    EnsureComandoApi(service, comandoTypeId, solutionUniqueName, api.Nome, api.Exibicao, api.Descricao);
EnsureStep(service, espelhoTypeId, "Update", "cr40f_reservadeveculos", 40, "cr40f_status,cr40f_motorista",
    "Cr40f.Frota: espelho da manutenção (Update Geral)", solutionUniqueName,
    "new_categoriadoitem,cr40f_om,cr40f_status,cr40f_motorista");
```

Em `UpsertPluginType`, receba `string typeName`: use-o no lugar de `PluginTypeName` e derive `name`/`friendlyname` do último segmento (`typeName.Split('.').Last()`).

- [ ] **Step 2: Declarar as 4 APIs e o registro delas**

O registrador usa top-level statements, então a lista é uma variável local declarada **antes** do bloco do Step 1 (logo depois de `const string EspelhoType`). A função `EnsureComandoApi` entra junto das outras funções locais, depois de `EnsureCustomApi`:

```csharp
var apisManutencao = new (string Nome, string Exibicao, string Descricao)[]
{
    ("cr40f_ManutencaoAgendar", "Manutenção | Agendar", "Encaixa (ou reagenda) a manutenção num dia ou numa semana de segunda a domingo e cria ou reabre a linha dela na Geral."),
    ("cr40f_ManutencaoReprovar", "Manutenção | Reprovar", "Reprova uma manutenção solicitada (comentário obrigatório) e cancela a linha da Geral."),
    ("cr40f_ManutencaoCancelar", "Manutenção | Cancelar", "Cancela uma manutenção em aberto e a linha dela na Geral."),
    ("cr40f_ManutencaoConcluir", "Manutenção | Concluir", "Conclui a manutenção (serviços, km, valor, pagamento), cria ou atualiza a despesa e conclui a linha da Geral, numa transação."),
};

static void EnsureComandoApi(ServiceClient service, Guid pluginTypeId, string solution, string nome, string exibicao, string descricao)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", nome));
    if (existing is not null)
    {
        var update = new UpdateRequest { Target = new Entity("customapi", existing.Id) { ["plugintypeid"] = Ref("plugintype", pluginTypeId) } };
        update["SolutionUniqueName"] = solution;
        service.Execute(update);
        customApiId = existing.Id;
        Log($"reutilizando Custom API {nome}");
    }
    else
    {
        var create = new CreateRequest
        {
            Target = new Entity("customapi")
            {
                ["uniquename"] = nome, ["name"] = nome, ["displayname"] = exibicao, ["description"] = descricao,
                ["bindingtype"] = new OptionSetValue(0), ["isfunction"] = false, ["isprivate"] = false,
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
                ["plugintypeid"] = Ref("plugintype", pluginTypeId),
                ["iscustomizable"] = new BooleanManagedProperty(false),
            },
        };
        create["SolutionUniqueName"] = solution;
        customApiId = ((CreateResponse)service.Execute(create)).id;
        Log($"criando Custom API {nome}");
    }

    if (!ChildExists(service, "customapirequestparameter", customApiId, "RequestJson"))
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = "RequestJson", ["name"] = $"{nome}.RequestJson",
            ["displayname"] = "Pedido JSON", ["description"] = "Contrato em packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs.",
            ["type"] = new OptionSetValue(10), ["isoptional"] = false, ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);

    if (!ChildExists(service, "customapiresponseproperty", customApiId, "ResponseJson"))
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = "ResponseJson", ["name"] = $"{nome}.ResponseJson",
            ["displayname"] = "Resposta JSON", ["description"] = "Contrato em packages/plugins/Cr40f.Frota.Plugin/Manutencao/Contratos.cs.",
            ["type"] = new OptionSetValue(10), ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
}
```

- [ ] **Step 3: Copiar `EnsureStep` do registrador do Financeiro**

Copie a função `EnsureStep` inteira de `packages/plugins/tools/Cr40f.Financeiro.Registrar/Program.cs:440-477` para o fim das funções locais de `Program.cs` da Frota. A assinatura é a mesma: `(ServiceClient service, Guid pluginTypeId, string messageName, string entity, int stage, string? filter, string name, string solutionUniqueName, string? preImageAttributes = null)`, com step síncrono (`mode` 0), `rank` 20, componente 92 na solução e a imagem `pre` reconciliada. Ela usa `FindSingleOrNone`, `Ref`, `Log` e `EnsureSolutionComponent`, que já existem no registrador da Frota com as mesmas assinaturas.

- [ ] **Step 4: Atualizar o comentário do topo**

```csharp
// Registra o plugin da frota: Custom API global cr40f_FrotaPendencias, as Custom APIs das manutenções
// (cr40f_ManutencaoAgendar/Reprovar/Cancelar/Concluir) e o step do espelho da programação no Update da Geral.
// Modo de verificação: --testar [yyyy-MM-dd] chama cr40f_FrotaPendencias e imprime o PendenciasJson.
```

- [ ] **Step 5: Compilar (Betinhos-Renan)**

Run: `dotnet build packages/plugins/tools/Cr40f.Frota.Registrar`
Expected: Build succeeded, 0 erros.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/tools/Cr40f.Frota.Registrar/Program.cs
git commit -m "feat(frota): registrador publica as Custom APIs da manutenção e o step do espelho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: PR, Deploy no DEV e conferência

**Files:** nenhum arquivo novo. Esta tarefa verifica o que as anteriores publicaram.

- [ ] **Step 1: Abrir o PR para a `develop`**

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat(frota): manutenções v2, schema e servidor" --body "$(cat <<'EOF'
Plano 1 das manutenções v2 (spec: docs/superpowers/specs/2026-11-16-manutencoes-v2-design.md).

- Migration: janela (início/fim), km na realização, pagamento Dinheiro, rótulo Agendado.
- Cr40f.Frota.Plugin: Custom APIs cr40f_ManutencaoAgendar/Reprovar/Cancelar/Concluir e o espelho da programação no Update da Geral.
- Nenhuma tela muda; o flow "Agendar manutenção" continua até a virada (plano 5).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Vincule o PR à thread (`link_pull_request`) e espere o CI (job `plugins` roda os testes da Frota).

- [ ] **Step 2: Depois do merge, conferir o Deploy**

Use a skill `verificar-deploy-dev`. O Deploy precisa mostrar a migration `20261117-0900-manutencoes-v2.ps1` aplicada e a peça `frota` publicada.

- [ ] **Step 3: Testar as APIs no DEV (Betinhos-Renan)**

Com uma manutenção de teste em Solicitado no DEV (`$ID`), chame cada API pela Web API e confira o resultado:

```bash
BASE=https://org23b93544.crm2.dynamics.com; TOKEN=$(az account get-access-token --resource "$BASE/" --query accessToken -o tsv)
call() { curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$BASE/api/data/v9.2/$1" -d "$2"; echo; }
call cr40f_ManutencaoAgendar "{\"RequestJson\":\"{\\\"manutencaoId\\\":\\\"$ID\\\",\\\"inicio\\\":\\\"2026-11-23\\\",\\\"fim\\\":\\\"2026-11-29\\\"}\"}"
```

Expected:
- a resposta traz o `geralId`;
- a manutenção fica com status 202410001 ("Agendado") e a janela de 23 a 29/11;
- aparece uma linha de categoria Manutenção na Geral, sem motorista, com saída 23/11 03:00Z.

Depois, programe essa linha na Geral do DEV com motorista e status Programado. **A manutenção tem de ficar Programado (espelho), e o motorista recebe o push.** Reagende com `cr40f_ManutencaoAgendar`: a manutenção volta a Agendado e a linha fica sem motorista. Cancele com `cr40f_ManutencaoCancelar`.

- [ ] **Step 4: Registrar o resultado no PR**

Comente no PR o que foi conferido no DEV e o que não foi (o `Concluir` real só será exercitado pelo App no plano 4).

---

## Próximos planos (escritos depois deste)

- **Plano 2: Shell › Frota.** Fila "A encaixar", gaveta, "Nova manutenção", Concluir pelo shell e Pendências e agente alinhados (`Regras.cs` + `pendencias.ts`, paridade).
- **Plano 3: Shell › Geral.** Linha de manutenção com outra cara, selo "atrasada" e liga/desliga na visão.
- **Plano 4: App.** Finalizar com serviços, km, Dinheiro e `cr40f_ManutencaoConcluir`. A nota fiscal continua subindo na despesa quando `statusAnexo` = pendente.
- **Plano 5: Virada.** Conversão dos registros, retirada do flow e da regra de negócio, `docs/auto`.
