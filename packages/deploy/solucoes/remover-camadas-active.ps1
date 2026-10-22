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
# Prefixo: o mesmo ambiente responde tambem por outros hosts (ex.: orgf261ae8e.api.crm2.dynamics.com).
if ($hostAlvo -like "orgf261ae8e.*") { throw "remover-camadas-active nao roda no PROD." }
$dv = Connect-Dataverse $EnvironmentUrl @($hostAlvo)

$solucao = @(Read-DvAll $dv "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$($SolutionUniqueName.Replace("'", "''"))'")
if ($solucao.Count -ne 1) { throw "Solucao $SolutionUniqueName ausente ou duplicada em $hostAlvo." }
# Na solucao nao gerenciada (DEV) a camada Active e a propria fonte: remove-la apagaria a customizacao.
if (-not $solucao[0].ismanaged) { throw "$SolutionUniqueName nao e gerenciada em $hostAlvo; a camada Active ali e a fonte." }
$solutionId = $solucao[0].solutionid

if (-not $Backup) { $Backup = Join-Path (Get-Location) "backup\solucoes\camadas-active\$hostAlvo" }
# Subpasta por rodada: uma nova camada Active no mesmo componente nao sobrescreve o backup anterior.
# Caminho absoluto: [IO.File] resolve relativo contra o diretorio do processo, nao o do PowerShell.
$Backup = (New-Item -ItemType Directory -Force (Join-Path $Backup (Get-Date -Format "yyyyMMdd-HHmmss"))).FullName

# componenttype -> nome em msdyn_componentlayers; o nome logico da entidade (RemoveActiveCustomization) e o mesmo em minusculas.
$tipos = [ordered]@{ 61 = "WebResource"; 29 = "Workflow"; 91 = "PluginAssembly"; 92 = "SdkMessageProcessingStep"; 60 = "SystemForm"; 80 = "AppModule"; 62 = "SiteMap" }
$alvos = @()
foreach ($t in $tipos.GetEnumerator()) {
  $componentes = @(Read-DvAll $dv "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $solutionId and componenttype eq $($t.Key)")
  foreach ($c in $componentes) {
    $camadas = @(Read-DvAll $dv "msdyn_componentlayers?`$filter=(msdyn_componentid eq '$($c.objectid)' and msdyn_solutioncomponentname eq '$($t.Value)')&`$select=msdyn_name,msdyn_order,msdyn_solutionname,msdyn_componentjson" | Sort-Object msdyn_order)
    if ($camadas.Count -lt 2 -or $camadas[-1].msdyn_solutionname -ne "Active") { continue }
    $alvos += [pscustomobject]@{ Tipo = $t.Value; Nome = $camadas[-1].msdyn_name; Id = [string] $c.objectid; Json = $camadas[-1].msdyn_componentjson }
  }
}
Write-Step "$SolutionUniqueName em ${hostAlvo}: $($alvos.Count) componentes com camada Active no topo"
$alvos | Group-Object Tipo | ForEach-Object { Write-Step ("  {0,3} {1}" -f $_.Count, $_.Name) }
if (-not $Aplicar) { Write-Step "simulacao: use -Aplicar para remover."; return }

$falhas = @()
foreach ($a in $alvos) {
  $arquivo = Join-Path $Backup (("{0}-{1}" -f $a.Tipo, $a.Id) + ".json")
  [IO.File]::WriteAllText($arquivo, [string] $a.Json, (New-Object Text.UTF8Encoding $false))
  try {
    Invoke-DvAction $dv "RemoveActiveCustomization" @{ LogicalName = $a.Tipo.ToLowerInvariant(); Id = $a.Id } | Out-Null
  }
  catch {
    # O erro da Web API traz a pilha .NET inteira; basta o comeco.
    $msg = "$($a.Tipo) $($a.Nome): $(Get-ErroDv $_)"
    $falhas += $msg.Substring(0, [Math]::Min(300, $msg.Length))
  }
}
$removidas = $alvos.Count - $falhas.Count
if ($removidas) { Invoke-DvAction $dv "PublishAllXml" @{} | Out-Null }
Write-Step "removidas: $removidas; falhas: $($falhas.Count); backup em $Backup"
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
