param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# RH bloco 1 (descontos em folha): parcelas do Acertar -> folha apontam para a multa, guardam o dia do lancamento
# e podem ir ate 12. Idempotente. Somente DEV; o PROD recebe pelas solucoes (tabela ja esta na BetinhosCore).
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$tabela = "new_parcelamultafolha"
$multas = "cr40f_multas"

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
    $corpo = @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata" }
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
  Add-ComponenteNaSolucao $col.MetadataId 2
}
if ([int] (Invoke-Dv "GET" $path).MaxValue -ne 12) { throw "PUT nao gravou MaxValue 12 em new_numero." }
Write-Step "OK: $tabela com new_multa, new_lancadoem e new_numero ate 12."
