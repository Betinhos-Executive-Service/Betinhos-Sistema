param(
  # Pecas separadas por virgula: app, sw ou app,sw.
  [string] $Pecas = 'app,sw',
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL,
  # Mostra o que seria publicado, sem rede, sem build e sem credenciais (usado no CI).
  [switch] $Simular
)

# Caminho do workflow Deploy (develop -> DEV): publica o app e o service worker com a conta de servico e grava
# "vX.Y.Z <sha>" na descricao de cada web resource (pendentes-dev.ps1 le esse registro). So atualiza web resource que ja
# existe: nao muda a AppBetinhos, entao nao precisa da distribuicao do Sistema. Peca nova entra pelo Sistema primeiro.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[push-front-dev] $Message" }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$catalogo = [ordered]@{
  app = @{ Nome = 'new_app-motoristas-v2'; Tipo = 1; Arquivo = (Join-Path $root (Join-Path 'dist' 'webresource-app-motoristas.html')) }
  sw  = @{ Nome = 'new_app-motoristas-v2-sw'; Tipo = 3; Arquivo = (Join-Path $root (Join-Path 'src' (Join-Path 'pwa' 'sw.js'))) }
}

# @(...) por fora: com uma peca so, o resultado viraria string e .Count falharia com StrictMode.
$pedidas = @($Pecas.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ } | Sort-Object -Unique)
if ($pedidas.Count -eq 0) { throw 'Nenhuma peca pedida.' }
foreach ($peca in $pedidas) { if (-not $catalogo.Contains($peca)) { throw "Peca desconhecida: $peca (validas: app, sw)." } }
# O app vai primeiro: Sort-Object ja deixa app antes de sw.
$alvos = @($pedidas | ForEach-Object { $catalogo[$_] })

if ($Simular) {
  foreach ($alvo in $alvos) { Write-Step "simulacao: $($alvo.Nome)" }
  Write-Host "SIMULACAO: $($alvos.Count) peca(s)"
  return
}

if ([string]::IsNullOrWhiteSpace($EnvironmentUrl)) { throw 'DV_ENVIRONMENT_URL ausente.' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
if ($env:GITHUB_SHA -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido: este script so roda no workflow Deploy.' }
foreach ($nome in @('DV_TENANT_ID', 'DV_CLIENT_ID', 'DV_CLIENT_SECRET')) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($nome))) { throw "$nome ausente (environment dev do GitHub)." }
}

$api = "$base/api/data/v9.2"
$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Falha ao obter token do DEV.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }

function Get-Linhas([string] $Caminho) { @((Invoke-RestMethod -Method Get -Uri "$api/$Caminho" -Headers $headers).value) }

$solucoes = @(Get-Linhas "solutions?`$select=solutionid&`$filter=uniquename eq 'BetinhosMotoristas'")
if ($solucoes.Count -ne 1) { throw 'Solucao BetinhosMotoristas nao encontrada no DEV.' }
$solucaoId = $solucoes[0].solutionid

# Confere tudo antes de gravar a primeira peca.
foreach ($alvo in $alvos) {
  $linhas = @(Get-Linhas "webresourceset?`$select=webresourceid,webresourcetype&`$filter=name eq '$($alvo.Nome)'")
  if ($linhas.Count -ne 1) { throw "$($alvo.Nome) ausente ou duplicado no DEV. Peca nova entra pelo Sistema primeiro." }
  if ($linhas[0].webresourcetype -ne $alvo.Tipo) { throw "$($alvo.Nome) com tipo $($linhas[0].webresourcetype), esperado $($alvo.Tipo)." }
  $alvo.Id = $linhas[0].webresourceid
  $naSolucao = @(Get-Linhas "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solucaoId and objectid eq $($alvo.Id) and componenttype eq 61")
  if ($naSolucao.Count -ne 1) {
    # O service worker ainda esta na BetinhosInterface: a mudanca de dono e do regras.json do Sistema.
    if ($alvo.Nome -eq 'new_app-motoristas-v2-sw') { Write-Warning "$($alvo.Nome) ainda fora da BetinhosMotoristas." }
    else { throw "$($alvo.Nome) fora da BetinhosMotoristas." }
  }
}

# Versao: sem registro na descricao, le do proprio app publicado. So o app tem build; o service worker e copia da fonte.
$nomeApp = $catalogo['app'].Nome
$comApp = $pedidas -contains 'app'
$registroApp = @(Get-Linhas "webresourceset?`$select=description,content&`$filter=name eq '$nomeApp'")
if ($registroApp.Count -ne 1) { throw "$nomeApp ausente ou duplicado no DEV." }
$versaoPublicada = ''
if ([string] $registroApp[0].description -match '^v(\d+\.\d+\.\d+)') { $versaoPublicada = $Matches[1] }
else {
  $html = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($registroApp[0].content))
  if ($html -match '__APP_BUILD_INFO=\{"version":"(\d+\.\d+\.\d+)"') { $versaoPublicada = $Matches[1] }
}
Write-Step "versao publicada no DEV: $(if ($versaoPublicada) { "v$versaoPublicada" } else { 'desconhecida' })"

if ($comApp) {
  $env:PUBLISHED_VERSION = $versaoPublicada
  Push-Location $root
  try { & pnpm build; if ($LASTEXITCODE -ne 0) { throw "pnpm build falhou ($LASTEXITCODE)." } }
  finally { Pop-Location; Remove-Item Env:PUBLISHED_VERSION -ErrorAction SilentlyContinue }
  $versao = ([IO.File]::ReadAllText((Join-Path $root 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json).version
}
else { $versao = $versaoPublicada }
if (-not $versao) { throw 'Versao do app desconhecida.' }
$descricaoNova = "v$versao $($env:GITHUB_SHA)"

# PATCH mesmo com o conteudo igual: a descricao precisa andar, senao a peca fica pendente para sempre.
foreach ($alvo in $alvos) {
  if (-not (Test-Path -LiteralPath $alvo.Arquivo)) { throw "Arquivo nao encontrado: $($alvo.Arquivo)" }
  $alvo.Conteudo = [Convert]::ToBase64String([IO.File]::ReadAllBytes($alvo.Arquivo))
  Write-Step "atualizando $($alvo.Nome)"
  $corpo = @{ content = $alvo.Conteudo; description = $descricaoNova } | ConvertTo-Json -Depth 3
  Invoke-RestMethod -Method Patch -Uri "$api/webresourceset($($alvo.Id))" -Headers ($headers + @{ 'If-Match' = '*' }) -ContentType 'application/json; charset=utf-8' -Body $corpo | Out-Null
}

$publishXml = '<importexportxml><webresources>' + (($alvos | ForEach-Object { "<webresource>$($_.Id)</webresource>" }) -join '') + '</webresources></importexportxml>'
Write-Step 'publicando'
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body (@{ ParameterXml = $publishXml } | ConvertTo-Json) | Out-Null

foreach ($alvo in $alvos) {
  $publicado = Invoke-RestMethod -Method Get -Uri "$api/webresourceset($($alvo.Id))?`$select=content,description" -Headers $headers
  if ($publicado.content -ne $alvo.Conteudo -or $publicado.description -ne $descricaoNova) { throw "Validacao pos-publicacao falhou em $($alvo.Nome)." }
}

Write-Host "PUSH CONCLUIDO: $descricaoNova - $(($alvos | ForEach-Object { $_.Nome }) -join ', ')"
# AppendAllText: no PowerShell 5.1, Out-File -Encoding utf8 pode gravar BOM e estragar a chave.
if ($env:GITHUB_OUTPUT) { [IO.File]::AppendAllText($env:GITHUB_OUTPUT, "versao=$versao`n", (New-Object Text.UTF8Encoding $false)) }
