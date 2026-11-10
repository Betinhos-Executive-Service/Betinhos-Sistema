param(
  [string] $Ate = 'HEAD',
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL,
  # Linhas app=... e sw=... para $GITHUB_OUTPUT (sem: JSON).
  [switch] $GitHub
)

# Diz quais pecas do front o DEV ainda nao tem, pelo commit que o proprio DEV registra na descricao de cada web resource
# ("vX.Y.Z <sha>", gravada por push-front-dev.ps1). Pendente = sem commit registrado, commit fora do repositorio ou
# git diff <registrado> $Ate tocando a peca (regras em mudancas-dev.mjs). Comparar com o DEV, e nao com o push anterior,
# faz um deploy cancelado na fila nunca deixar peca para tras. Somente leitura no Dataverse.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($EnvironmentUrl)) { throw 'DV_ENVIRONMENT_URL ausente.' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mudancas = Join-Path $PSScriptRoot 'mudancas-dev.mjs'

$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

$ate = (git -C $root rev-parse "$Ate^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Commit desconhecido: $Ate" }

# Mudancas entre um commit registrado e $ate; $null quando o commit nao existe (nem buscando no origin).
function Get-Mudancas([string] $Sha) {
  # Continue: no Windows PowerShell 5.1, stderr de comando nativo com Stop vira excecao.
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    git -C $root cat-file -e "$Sha^{commit}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { git -C $root fetch --quiet --no-tags --depth=1 origin $Sha 2>&1 | Out-Null }
    git -C $root cat-file -e "$Sha^{commit}" 2>&1 | Out-Null
    $existe = ($LASTEXITCODE -eq 0)
  }
  finally { $ErrorActionPreference = $eap }
  if (-not $existe) { return $null }
  $json = (git -C $root diff --name-only $Sha $ate) -join "`n" | node $mudancas
  if ($LASTEXITCODE -ne 0) { throw 'mudancas-dev.mjs falhou.' }
  return ($json | ConvertFrom-Json)
}

$pecas = [ordered]@{ app = 'new_app-motoristas-v2'; sw = 'new_app-motoristas-v2-sw' }
$pendentes = [ordered]@{}
$motivos = New-Object System.Collections.Generic.List[string]

foreach ($peca in @($pecas.Keys)) {
  $nome = $pecas[$peca]
  $linhas = @((Invoke-RestMethod -Uri "$base/api/data/v9.2/webresourceset?`$select=description&`$filter=name eq '$nome'" -Headers $headers).value)
  $descricao = if ($linhas.Count -eq 1) { [string] $linhas[0].description } else { '' }
  if ($descricao -notmatch '^v\d+\.\d+\.\d+ ([0-9a-f]{40})$') {
    $pendentes[$peca] = $true
    $motivos.Add("${peca}: sem commit registrado no DEV")
    continue
  }
  $sha = $Matches[1]
  $m = Get-Mudancas $sha
  if ($null -eq $m) { $pendentes[$peca] = $true; $motivos.Add("${peca}: commit $($sha.Substring(0, 7)) do DEV fora do repositorio"); continue }
  $pendentes[$peca] = [bool] $m.$peca
  if ($pendentes[$peca]) { $motivos.Add("${peca}: DEV em $($sha.Substring(0, 7))") }
}

foreach ($linha in $motivos) { [Console]::Error.WriteLine("[pendentes] $linha") }
if ($GitHub) { foreach ($peca in @($pendentes.Keys)) { "$peca=$($pendentes[$peca].ToString().ToLowerInvariant())" } }
else { [pscustomobject]@{ ate = $ate; app = $pendentes['app']; sw = $pendentes['sw']; motivos = @($motivos) } | ConvertTo-Json -Compress }
