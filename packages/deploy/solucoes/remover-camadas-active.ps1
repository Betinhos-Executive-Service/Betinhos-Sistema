param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [string] $SolutionUniqueName = "AppBetinhos",
  [string] $Backup = "",
  [switch] $Aplicar
)

# Remove a camada "Active" (nao gerenciada) de todo componente da solucao gerenciada que a tenha no topo:
# WebResource, Workflow, SdkMessageProcessingStep, PluginAssembly, SystemForm, AppModule e SiteMap.
# Sem a remocao, o import da solucao nao altera o que o ambiente serve nesses componentes.
# Guarda antes o JSON da camada Active de cada componente em -Backup. Sem -Aplicar, so lista.
# Recusa o PROD: la a remocao e decisao da Fase 4, componente a componente.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")

$hostAlvo = ([Uri] $EnvironmentUrl).Host
if ($hostAlvo -eq "orgf261ae8e.crm2.dynamics.com") { throw "remover-camadas-active nao roda no PROD." }
$dv = Connect-Dataverse $EnvironmentUrl @($hostAlvo)
if (-not $Backup) { $Backup = Join-Path (Get-Location) "backup\solucoes\camadas-active\$hostAlvo" }
# Caminho absoluto: [IO.File] resolve relativo contra o diretorio do processo, nao o do PowerShell.
$Backup = (New-Item -ItemType Directory -Force $Backup).FullName

$solucao = @(Read-DvAll $dv "solutions?`$select=solutionid&`$filter=uniquename eq '$SolutionUniqueName'")
if ($solucao.Count -ne 1) { throw "Solucao $SolutionUniqueName ausente ou duplicada em $hostAlvo." }
$solutionId = $solucao[0].solutionid

# componenttype -> nome em msdyn_componentlayers e nome logico da entidade (RemoveActiveCustomization).
$tipos = @(
  @{ Tipo = 61; Nome = "WebResource"; Entidade = "webresource" }, @{ Tipo = 29; Nome = "Workflow"; Entidade = "workflow" },
  @{ Tipo = 91; Nome = "PluginAssembly"; Entidade = "pluginassembly" }, @{ Tipo = 92; Nome = "SdkMessageProcessingStep"; Entidade = "sdkmessageprocessingstep" },
  @{ Tipo = 60; Nome = "SystemForm"; Entidade = "systemform" }, @{ Tipo = 80; Nome = "AppModule"; Entidade = "appmodule" }, @{ Tipo = 62; Nome = "SiteMap"; Entidade = "sitemap" }
)
$alvos = @()
foreach ($t in $tipos) {
  $componentes = @(Read-DvAll $dv "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $solutionId and componenttype eq $($t.Tipo)")
  foreach ($c in $componentes) {
    $camadas = @(Read-DvAll $dv "msdyn_componentlayers?`$filter=(msdyn_componentid eq '$($c.objectid)' and msdyn_solutioncomponentname eq '$($t.Nome)')&`$select=msdyn_name,msdyn_order,msdyn_solutionname,msdyn_componentjson" | Sort-Object msdyn_order)
    if ($camadas.Count -lt 2 -or $camadas[-1].msdyn_solutionname -ne "Active") { continue }
    $alvos += [pscustomobject]@{ Tipo = $t.Nome; Entidade = $t.Entidade; Nome = $camadas[-1].msdyn_name; Id = [string] $c.objectid; Camadas = (($camadas | ForEach-Object { $_.msdyn_solutionname }) -join " > "); Json = $camadas[-1].msdyn_componentjson }
  }
}
Write-Step "$SolutionUniqueName em ${hostAlvo}: $($alvos.Count) componentes com camada Active no topo"
$alvos | Group-Object Tipo | ForEach-Object { Write-Step ("  {0,3} {1}" -f $_.Count, $_.Name) }
if (-not $Aplicar) { Write-Step "simulacao: use -Aplicar para remover."; return }

$removidos = 0; $falhas = @()
foreach ($a in $alvos) {
  $arquivo = Join-Path $Backup (("{0}-{1}" -f $a.Tipo, $a.Id) + ".json")
  [IO.File]::WriteAllText($arquivo, [string] $a.Json, (New-Object Text.UTF8Encoding $false))
  try {
    Invoke-DvAction $dv "RemoveActiveCustomization" @{ LogicalName = $a.Entidade; Id = $a.Id } | Out-Null
    $removidos++
  }
  catch { $falhas += "$($a.Tipo) $($a.Nome): $((Get-ErroDv $_) -replace '\\r\\n.*$', '')".Substring(0, [Math]::Min(300, "$($a.Tipo) $($a.Nome): $((Get-ErroDv $_) -replace '\\r\\n.*$', '')".Length)) }
}
Invoke-DvAction $dv "PublishAllXml" @{} | Out-Null
Write-Step "removidas: $removidos; falhas: $($falhas.Count); backup em $Backup"
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
