param(
  # Commit de referencia: no Deploy, o HEAD da develop; na trava do publicar.yml, o commit levado ao PROD.
  [string] $Ate = 'HEAD',
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL,
  # Linhas tela=... e plugins=a,b para $GITHUB_OUTPUT (sem: JSON).
  [switch] $GitHub
)

# Diz o que no DEV nao corresponde ao commit $Ate, pelo commit que o proprio DEV registra:
#  - tela: descricao do cr40f_SistemaBetinhos.html ("vX.Y.Z <sha>", push-dev.ps1);
#  - plugins: descricao de cada assembly Cr40f.<Nome>.Plugin (<sha>, gravada pelo registrador no CI).
# Pendente = sem commit registrado, assembly ausente no DEV, ou git diff <registrado> $Ate tocando a peca
# (regras em mudancas-dev.mjs). Comparar com o que o DEV tem, e nao com o push anterior, faz um deploy cancelado na fila
# (concurrency) ou uma publicacao local nunca deixar peca para tras. Somente leitura no Dataverse.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mudancas = Join-Path $PSScriptRoot 'mudancas-dev.mjs'

$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
function Get-Dv([string] $Path) { @((Invoke-RestMethod -Uri "$base/api/data/v9.2/$Path" -Headers $headers).value) }

$ate = (git -C $root rev-parse "$Ate^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Commit desconhecido: $Ate" }

# Arquivos mudados entre um commit registrado e $ate; $null quando o commit nao existe (nem buscando no origin).
$cacheDiff = @{}
function Get-Mudancas([string] $Sha) {
  if ($cacheDiff.ContainsKey($Sha)) { return $cacheDiff[$Sha] }
  # Continue: no Windows PowerShell 5.1, stderr de comando nativo com Stop vira excecao.
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    git -C $root cat-file -e "$Sha^{commit}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { git -C $root fetch --quiet --no-tags --depth=1 origin $Sha 2>&1 | Out-Null }
    git -C $root cat-file -e "$Sha^{commit}" 2>&1 | Out-Null
    $existe = ($LASTEXITCODE -eq 0)
  }
  finally { $ErrorActionPreference = $eap }
  $r = $null
  if ($existe) {
    $json = (git -C $root diff --name-only $Sha $ate) -join "`n" | node $mudancas
    if ($LASTEXITCODE -ne 0) { throw 'mudancas-dev.mjs falhou.' }
    $r = $json | ConvertFrom-Json
  }
  $cacheDiff[$Sha] = $r
  return $r
}

$motivos = New-Object System.Collections.Generic.List[string]

$tela = $false
$html = @(Get-Dv "webresourceset?`$select=description&`$filter=name eq 'cr40f_SistemaBetinhos.html'")
if ($html.Count -ne 1 -or "$($html[0].description)" -notmatch '^v\d+\.\d+\.\d+ ([0-9a-f]{40})') { $tela = $true; $motivos.Add('tela: sem commit registrado no DEV') }
else {
  $m = Get-Mudancas $Matches[1]
  if ($null -eq $m) { $tela = $true; $motivos.Add("tela: commit $($Matches[1].Substring(0,7)) do DEV fora do repositorio") }
  elseif ($m.tela) { $tela = $true; $motivos.Add("tela: DEV em $($Matches[1].Substring(0,7))") }
}

$plugins = New-Object System.Collections.Generic.List[string]
$assemblies = @{}
foreach ($a in Get-Dv "pluginassemblies?`$select=name,description&`$filter=startswith(name,'Cr40f.')") { $assemblies[$a.name] = "$($a.description)" }
foreach ($d in Get-ChildItem (Join-Path $root 'packages\plugins') -Directory | Sort-Object Name) {
  if ($d.Name -notmatch '^Cr40f\.([A-Za-z]+)\.Plugin$') { continue }
  $nome = $Matches[1].ToLowerInvariant()
  if (-not $assemblies.ContainsKey($d.Name)) { $plugins.Add($nome); $motivos.Add("${nome}: assembly ausente no DEV"); continue }
  if ($assemblies[$d.Name] -notmatch '^([0-9a-f]{40})$') { $plugins.Add($nome); $motivos.Add("${nome}: sem commit registrado no DEV (publicado fora do Deploy)"); continue }
  $sha = $Matches[1]
  $m = Get-Mudancas $sha
  if ($null -eq $m) { $plugins.Add($nome); $motivos.Add("${nome}: commit $($sha.Substring(0,7)) do DEV fora do repositorio") }
  elseif (@($m.plugins) -contains $nome) { $plugins.Add($nome); $motivos.Add("${nome}: DEV em $($sha.Substring(0,7))") }
}

foreach ($linha in $motivos) { [Console]::Error.WriteLine("[pendentes] $linha") }
if ($GitHub) { "tela=$($tela.ToString().ToLowerInvariant())"; "plugins=$($plugins -join ',')" }
else { [pscustomobject]@{ ate = $ate; tela = $tela; plugins = @($plugins); motivos = @($motivos) } | ConvertTo-Json -Compress }
