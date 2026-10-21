param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Saida,
  [string[]] $Solucoes = @("AppBetinhos", "gerarpagantes", "BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")
)

# Somente leitura (so GET, em qualquer ambiente). Grava em JSON o estado que a migracao nao pode perder: registros por
# tabela, fluxos (com categoria), steps, configuracao segura, hash dos valores de variaveis, solucoes e tipo de cada
# componente, pacote de cada assembly, situacao dos steps sensiveis de regras.json e versoes servidas.
# Nunca grava o valor de variavel, so o hash SHA-256. Ids sempre em minusculo.
# -Solucoes aceita lista separada por virgula ("A,B"): com -File o PowerShell entrega uma string so.
# A lista vai para $alvos antes do dot-source: solucoes.ps1 atribui $script:Solucoes (as 4 novas) e esconderia o parametro.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "dataverse.ps1")
# Caminho absoluto pelo $PWD, foto anterior apagada ja aqui (se esta execucao falhar, nao sobra foto velha) e pasta criada.
$Saida = Initialize-ArquivoDeSaida $Saida
$alvos = @($Solucoes | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Saida $Saida -Solucoes ($alvos -join ",")
  exit $LASTEXITCODE
}

Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "solucoes.ps1")
$regras = Read-JsonFile (Join-Path $PSScriptRoot "regras.json")
$dv = Connect-Dataverse $EnvironmentUrl $null

$prefixoProprio = '^(cr40f|new)_'

# Valor ausente (ou nulo) nao tem hash: a variavel sem valor fica null na foto.
function Get-Sha256($Texto) {
  if ($null -eq $Texto) { return $null }
  return Get-Sha256Hex ([Text.Encoding]::UTF8.GetBytes([string] $Texto))
}

$foto = [ordered]@{
  ambiente = $dv.Url; quando = (Get-Date).ToString("s"); registros = [ordered]@{}; aproximados = @(); fluxos = @{}; steps = @{}
  variaveis = @{}; componentes = @{}; tipos = @{}; pacotes = @{}; stepsSeguros = $null; versoes = @{}
}

# Registros: contagem exata por FetchXML; acima do limite de agregacao (50.000) conta paginando os ids (tambem exata).
# Qualquer outro erro de contagem interrompe a foto: nao existe contagem aproximada. `aproximados` fica vazio, so pelo formato da foto
# (o comparar-fotos nao o le: queda de registros e sempre perda).
$paginadas = @()
foreach ($e in @(Read-DvAll $dv "EntityDefinitions?`$select=LogicalName,EntitySetName,PrimaryIdAttribute,IsCustomEntity,IsIntersect" | Where-Object { $_.IsCustomEntity -and -not $_.IsIntersect -and $_.LogicalName -match $prefixoProprio } | Sort-Object LogicalName)) {
  $contagem = Get-ContagemRegistros $dv $e
  $foto.registros[$e.LogicalName] = $contagem.Total
  if ($contagem.Paginada) { $paginadas += $e.LogicalName; Write-Step "$($e.LogicalName): acima do limite de agregacao, contado por paginacao ($($contagem.Total))" }
}

# Componentes por solucao (so as solucoes que existem neste ambiente), com o tipo de cada um.
$fluxoIds = @{}; $stepIds = @{}; $ausentes = @()
foreach ($sol in $alvos) {
  $id = Get-SolucaoId $dv $sol
  if (-not $id) { $ausentes += $sol; continue }
  foreach ($l in @(Get-LinhasDaSolucao $dv $id)) {
    if (-not $foto.componentes.ContainsKey($l.id)) { $foto.componentes[$l.id] = @() }
    if ($foto.componentes[$l.id] -notcontains $sol) { $foto.componentes[$l.id] += $sol }
    $foto.tipos[$l.id] = $l.tipo
    if ($l.tipo -eq 29) { $fluxoIds[$l.id] = $true }
    if ($l.tipo -eq 92) { $stepIds[$l.id] = $true }
  }
}
if ($ausentes.Count) { Write-Step "solucoes que nao existem neste ambiente: $($ausentes -join ', ')" }
# Assembly dentro de pacote de plug-in: quem o carrega e o pacote (conferir-retirada.mjs usa isso).
$foto.pacotes = Get-PacoteDosAssemblies $dv
# estado = statecode bruto (fluxo: 1 ativado; step: 0 habilitado); categoria do workflow (2 regra de negocio, 4 BPF, 5 fluxo
# de nuvem...). O comparador decide o que e perda.
foreach ($w in @(Read-DvAll $dv "workflows?`$select=workflowid,name,statecode,category&`$filter=type eq 1")) {
  $oid = ([string] $w.workflowid).ToLowerInvariant()
  if ($fluxoIds.ContainsKey($oid)) { $foto.fluxos[$oid] = @{ nome = [string] $w.name; estado = [int] $w.statecode; categoria = [int] $w.category } }
}
# "seguro" = o step tem configuracao segura; o comparador acusa perda quando um step que tinha deixa de ter.
foreach ($s in @(Read-DvAll $dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,_sdkmessageprocessingstepsecureconfigid_value&`$filter=customizationlevel eq 1")) {
  $oid = ([string] $s.sdkmessageprocessingstepid).ToLowerInvariant()
  if ($stepIds.ContainsKey($oid)) {
    $foto.steps[$oid] = @{ nome = [string] $s.name; estado = [int] $s.statecode; seguro = [bool] $s._sdkmessageprocessingstepsecureconfigid_value }
  }
}
Assert-CoberturaDaFoto $foto $fluxoIds $stepIds
# Os steps sensiveis de regras.json, pelo nome, a parte das solucoes: existe e tem configuracao segura.
$foto.stepsSeguros = Get-SituacaoStepsSeguros $dv @($regras.stepsSeguros)
foreach ($v in @(Read-DvAll $dv "environmentvariabledefinitions?`$select=schemaname&`$expand=environmentvariabledefinition_environmentvariablevalue(`$select=value)")) {
  if ([string] $v.schemaname -notmatch $prefixoProprio) { continue }
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

Write-JsonFile $Saida $foto
$semSeguro = @($foto.stepsSeguros.Keys | Where-Object { -not $foto.stepsSeguros[$_].seguro })
Write-Step ("foto gravada em {0}: {1} tabelas ({6} contadas por paginacao), {2} fluxos, {3} steps, {4} variaveis, {5} componentes; steps sensiveis sem configuracao segura: {7}" -f $Saida, $foto.registros.Count, $foto.fluxos.Count, $foto.steps.Count, $foto.variaveis.Count, $foto.componentes.Count, $paginadas.Count, $semSeguro.Count)
