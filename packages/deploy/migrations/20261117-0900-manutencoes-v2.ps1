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
    $body.Value = 202410001; $body.Label = (Label "Agendado"); $body.MergeLabels = $true
    Invoke-Dv "POST" "UpdateOptionValue" $body | Out-Null
    Write-Step "rotulo 202410001 = Agendado"
  } else { Write-Step "DRY RUN trocaria o rotulo de 202410001 para Agendado" }
}

# Choice global (cr40f_pagamento usa cr40f_opcoes) nao entra na publicacao da tabela: publica o optionset junto.
if ($Apply) {
  if ($pagamento.IsGlobal) {
    Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$table</entity></entities><optionsets><optionset>$($pagamento.Name)</optionset></optionsets></importexportxml>" } | Out-Null
    Write-Step "tabela e optionset $($pagamento.Name) publicados"
  } else { Publish-Tabela $table }
}
