param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Saida,
  [string[]] $Solucoes = @("AppBetinhos", "gerarpagantes", "BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")
)

# Somente leitura (so GET, em qualquer ambiente). Grava em JSON o estado que a migracao nao pode perder: registros por
# tabela, fluxos, steps, configuracao segura, hash dos valores de variaveis, solucoes de cada componente e versoes servidas.
# Nunca grava o valor de variavel, so o hash SHA-256. Ids sempre em minusculo.
# -Solucoes aceita lista separada por virgula ("A,B"): com -File o PowerShell entrega uma string so.
# A lista vai para $alvos antes do dot-source: solucoes.ps1 atribui $script:Solucoes (as 4 novas) e esconderia o parametro.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

# .NET resolve caminho relativo pelo diretorio do processo, nao pelo $PWD: resolve antes de qualquer uso.
$Saida = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Saida)
$alvos = @($Solucoes | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Saida $Saida -Solucoes ($alvos -join ",")
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
$dv = Connect-Dataverse $EnvironmentUrl $null

# Valor ausente (ou nulo) nao tem hash: a variavel sem valor fica null na foto.
function Get-Sha256($Texto) {
  if ($null -eq $Texto) { return $null }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string] $Texto)) | ForEach-Object { $_.ToString("x2") }) }
  finally { $sha.Dispose() }
}

$foto = [ordered]@{ ambiente = $dv.Url; quando = (Get-Date).ToString("s"); registros = [ordered]@{}; aproximados = @(); fluxos = @{}; steps = @{}; variaveis = @{}; componentes = @{}; versoes = @{} }

# Registros: contagem exata por FetchXML; acima do limite de agregacao (50.000) conta paginando os ids (tambem exata).
# Qualquer outro erro de contagem interrompe a foto: nao existe contagem aproximada. `aproximados` fica na foto, vazio.
$paginadas = @()
foreach ($e in @(Read-DvAll $dv "EntityDefinitions?`$select=LogicalName,EntitySetName,PrimaryIdAttribute,IsCustomEntity,IsIntersect" | Where-Object { $_.IsCustomEntity -and -not $_.IsIntersect -and $_.LogicalName -match '^(cr40f|new)_' } | Sort-Object LogicalName)) {
  $contagem = Get-ContagemRegistros $dv $e
  $foto.registros[$e.LogicalName] = $contagem.Total
  if ($contagem.Paginada) { $paginadas += $e.LogicalName; Write-Step "$($e.LogicalName): acima do limite de agregacao, contado por paginacao ($($contagem.Total))" }
}

# Componentes por solucao (so as solucoes que existem neste ambiente).
$fluxoIds = @{}; $stepIds = @{}
foreach ($sol in $alvos) {
  $id = Get-SolucaoId $dv $sol
  if (-not $id) { continue }
  foreach ($c in @(Read-DvAll $dv "solutioncomponents?`$select=objectid,componenttype&`$filter=_solutionid_value eq $id")) {
    $oid = ([string] $c.objectid).ToLowerInvariant()
    if (-not $foto.componentes.ContainsKey($oid)) { $foto.componentes[$oid] = @() }
    if ($foto.componentes[$oid] -notcontains $sol) { $foto.componentes[$oid] += $sol }
    if ([int] $c.componenttype -eq 29) { $fluxoIds[$oid] = $true }
    if ([int] $c.componenttype -eq 92) { $stepIds[$oid] = $true }
  }
}
# estado = statecode bruto (fluxo: 1 ativado; step: 0 habilitado). O comparador decide o que e perda.
foreach ($w in @(Read-DvAll $dv "workflows?`$select=workflowid,name,statecode&`$filter=type eq 1")) {
  $oid = ([string] $w.workflowid).ToLowerInvariant()
  if ($fluxoIds.ContainsKey($oid)) { $foto.fluxos[$oid] = @{ nome = [string] $w.name; estado = [int] $w.statecode } }
}
# "seguro" = o step tem configuracao segura; o comparador acusa perda quando um step que tinha deixa de ter.
foreach ($s in @(Read-DvAll $dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,_sdkmessageprocessingstepsecureconfigid_value&`$filter=customizationlevel eq 1")) {
  $oid = ([string] $s.sdkmessageprocessingstepid).ToLowerInvariant()
  if ($stepIds.ContainsKey($oid)) {
    $foto.steps[$oid] = @{ nome = [string] $s.name; estado = [int] $s.statecode; seguro = [bool] $s._sdkmessageprocessingstepsecureconfigid_value }
  }
}
foreach ($v in @(Read-DvAll $dv "environmentvariabledefinitions?`$select=schemaname&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)")) {
  if ([string] $v.schemaname -notmatch '^(cr40f|new)_') { continue }
  $valores = @($v.environmentvariabledefinition_environmentvariablevalue)
  $foto.variaveis[[string] $v.schemaname] = if ($valores.Count) { Get-Sha256 $valores[0].value } else { $null }
}

$sb = @(Read-DvAll $dv "webresourceset?`$select=description&`$filter=name eq 'cr40f_SistemaBetinhos.html'")
$foto.versoes["sistemaBetinhos"] = if ($sb.Count) { [string] $sb[0].description } else { "" }
$am = @(Read-DvAll $dv "webresourceset?`$select=content&`$filter=name eq 'new_app-motoristas-v2'")
$foto.versoes["appMotoristas"] = ""
if ($am.Count) {
  # Versao do build vem de window.__APP_BUILD_INFO; sem ele, a primeira versao entre aspas do bundle.
  $js = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($am[0].content))
  $m = [regex]::Match($js, '__APP_BUILD_INFO=\{"version":"(\d+\.\d+\.\d+)"')
  $foto.versoes["appMotoristas"] = if ($m.Success) { $m.Groups[1].Value } else { [regex]::Match($js, '\d+\.\d+\.\d+(?=["''])').Value }
}

$pasta = Split-Path -Parent $Saida
if ($pasta -and -not (Test-Path -LiteralPath $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
Write-JsonFile $Saida $foto
Write-Step ("foto gravada em {0}: {1} tabelas ({6} contadas por paginacao), {2} fluxos, {3} steps, {4} variaveis, {5} componentes" -f $Saida, $foto.registros.Count, $foto.fluxos.Count, $foto.steps.Count, $foto.variaveis.Count, $foto.componentes.Count, $paginadas.Count)
