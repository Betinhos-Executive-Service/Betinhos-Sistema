param([string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/", [switch] $Apply)
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

# Passageiro (cr40f_bancodedados): Cliente passa a obrigatorio (ApplicationRequired). Vale para formularios e para o shell
# (que ja exige no validateForm); a API (flows, Claude, Formulario Geral) nao e barrada pelo nivel. Passageiro sem cliente
# fazia o "Flow API RD Station BD para Leads" falhar (Carly Shedlick e outros, 06 a 12/11/2026).

$tabela = "cr40f_bancodedados"
$coluna = "cr40f_cliente"
$c = Get-Coluna $tabela $coluna
if (-not $c) { throw "Coluna $tabela.$coluna nao existe." }
$path = "EntityDefinitions(LogicalName='$tabela')/Attributes($($c.MetadataId))/Microsoft.Dynamics.CRM.LookupAttributeMetadata"
$meta = Invoke-Dv "GET" $path
if ($meta.RequiredLevel.Value -in @("ApplicationRequired", "SystemRequired")) { Write-Step "$tabela.$coluna ja e obrigatoria ($($meta.RequiredLevel.Value))."; return }
if (-not $Apply) { Write-Step "DRY RUN mudaria $tabela.$coluna de $($meta.RequiredLevel.Value) para ApplicationRequired. Use -Apply para aplicar."; return }

$meta.RequiredLevel.Value = "ApplicationRequired"
$corpo = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata" }
foreach ($p in $meta.PSObject.Properties) { if ($p.Name -notlike "@odata.*" -and $p.Name -ne "Targets") { $corpo[$p.Name] = $p.Value } }
Invoke-Dv "PUT" "EntityDefinitions(LogicalName='$tabela')/Attributes($($c.MetadataId))" $corpo | Out-Null
Publish-Tabela $tabela
$depois = Invoke-Dv "GET" "$path`?`$select=RequiredLevel"
if ($depois.RequiredLevel.Value -ne "ApplicationRequired") { throw "RequiredLevel nao persistiu ($($depois.RequiredLevel.Value))." }
Write-Step "OK: $tabela.$coluna obrigatoria."
