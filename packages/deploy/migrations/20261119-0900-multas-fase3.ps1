param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)
# Multas fase 3 (spec 2026-11-18-multas-fase3-app-design.md, secao 4). Tres datas em cr40f_multas e o limite de
# parcelas do termo de 3 para 12. Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function Dia([string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label $Nome)
    Description = (Label $Desc); RequiredLevel = @{ Value = "None" }; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
}
$multa = "cr40f_multas"
$colunas = @(
  (Dia "cr40f_ContestadaEm" "Contestada em" "Motorista respondeu N$([char]0xE3)o concordo no termo; limpa quando o respons$([char]0xE1)vel $([char]0xE9) decidido."),
  (Dia "cr40f_AceiteDeclaradoEm" "Aceite declarado em" "Motorista declarou no app que aceitou a indica$([char]0xE7)$([char]0xE3)o na CNH Digital."),
  (Dia "cr40f_UltimoLembreteAceiteEm" "$([char]0xDA)ltimo lembrete do aceite" "Dia do $([char]0xFA)ltimo push do aceite na CNH Digital (m$([char]0xE1)ximo 3).")
)
foreach ($c in $colunas) {
  $nome = $c.SchemaName.ToLowerInvariant()
  if (Get-Coluna $multa $nome) { Write-Step "ja existe $multa.$nome"; continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $multa.$nome"; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$multa')/Attributes" $c | Out-Null
  Write-Step "criada $multa.$nome"
}

# Limite de parcelas do termo: le a metadata inteira e devolve com MaxValue = 12 (mesmo padrao da migration do RH).
$path = "EntityDefinitions(LogicalName='new_termomulta')/Attributes(LogicalName='new_parcelas')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
$parcelas = Invoke-Dv "GET" $path
if (-not $parcelas) { throw "new_termomulta.new_parcelas nao existe; rode a base do termo antes." }
if ([int] $parcelas.MaxValue -ge 12) { Write-Step "new_termomulta.new_parcelas ja aceita 12" }
elseif (-not $Apply) { Write-Step "DRY RUN mudaria new_termomulta.new_parcelas MaxValue $($parcelas.MaxValue) -> 12" }
else {
  $corpo = @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata" }
  foreach ($p in $parcelas.PSObject.Properties) { if ($p.Name -notlike '@odata.*') { $corpo[$p.Name] = $p.Value } }
  $corpo["MaxValue"] = 12
  Invoke-Dv "PUT" "EntityDefinitions(LogicalName='new_termomulta')/Attributes($($parcelas.MetadataId))" $corpo | Out-Null
  Write-Step "new_termomulta.new_parcelas MaxValue = 12"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $multa
Publish-Tabela "new_termomulta"
foreach ($c in $colunas) {
  $col = Get-Coluna $multa $c.SchemaName.ToLowerInvariant()
  if (-not $col) { throw "Coluna $multa.$($c.SchemaName.ToLowerInvariant()) nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}
if ([int] (Invoke-Dv "GET" $path).MaxValue -ne 12) { throw "PUT nao gravou MaxValue 12 em new_parcelas." }
Write-Step "OK: $multa com as tres datas e new_termomulta.new_parcelas ate 12."
