param(
  [string] $SolutionUniqueName = "AppBetinhos",
  [string] $DevUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $ProdUrl = "https://orgf261ae8e.crm2.dynamics.com/",
  [string] $AppWebResourceName = "new_app-motoristas-v2",
  [switch] $Apply,
  [switch] $SkipGitChecks
)

# Unico caminho de publicacao no PROD: solucao gerenciada exportada do DEV.
# 1. Pre-checagens: main limpa e igual a origin/main; DEV servindo a versao do package.json.
# 2. Sobe a versao da solucao no DEV, exporta a gerenciada e confere o ZIP.
# 3. Importa no PROD (stage-and-upgrade, publica, ativa plugins e fluxos).
# 4. Confere a versao servida no PROD e audita camadas que sombreiam a solucao.
# Sem -Apply, so mostra o plano. Nunca publica componente direto no PROD.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[deploy-prod] $Message" }
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$appVersion = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
function Get-Headers([string] $Url) {
  $scope = "$($Url.TrimEnd('/'))/user_impersonation"
  $token = try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken }
  return @{ Authorization = "Bearer $token"; Accept = "application/json" }
}
function Read-Dv([string] $Url, [string] $Path) { return Invoke-RestMethod -Method Get -Uri "$($Url.TrimEnd('/'))/api/data/v9.2/$Path" -Headers (Get-Headers $Url) }
function Get-ServedAppVersion([string] $Url) {
  $rows = @((Read-Dv $Url "webresourceset?`$select=content&`$filter=name eq '$AppWebResourceName'").value)
  if ($rows.Count -ne 1) { throw "Web resource $AppWebResourceName ausente em $Url." }
  return [regex]::Match([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($rows[0].content)), '\d+\.\d+\.\d+(?=["''])').Value
}
function Get-SolutionVersion([string] $Url) {
  $rows = @((Read-Dv $Url "solutions?`$select=version&`$filter=uniquename eq '$SolutionUniqueName'").value)
  if ($rows.Count -ne 1) { throw "Solucao $SolutionUniqueName ausente em $Url." }
  return [version]$rows[0].version
}
# A solucao nao leva configuracao segura: um import que recria o step deixa o plugin sem token
# (AppBetinhos 1.0.0.265, 15/10/2026: 196 falhas seguidas do flow do carro atual).
$secureSteps = [ordered]@{
  "Sincronizar veiculo atual pela Infleet" = "provision-current-vehicle.ps1"
  "Gerar link de acompanhamento" = "provision-current-vehicle.ps1 -LinkApiUrl <url do Worker>"
  "Revogar link de acompanhamento ao sair de Programado" = "provision-current-vehicle.ps1 -LinkApiUrl <url do Worker>"
  "Resolver veiculo do servico pela Infleet" = "provision-infleet-vehicle.ps1"
  "Organizar observacao do motorista" = "node scripts/configurar-chave-observacao-dev.mjs --prod --confirmo-prod --copiar-da-variavel (ou --arquivo <caminho>)"
}
# Devolve os steps sem configuracao segura (so leitura; nunca le o conteudo da configuracao).
function Get-StepsWithoutSecureConfig([string] $Url) {
  $missing = @()
  foreach ($name in $secureSteps.Keys) {
    $rows = @((Read-Dv $Url "sdkmessageprocessingsteps?`$select=_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$name'").value)
    if ($rows.Count -ne 1 -or -not $rows[0]._sdkmessageprocessingstepsecureconfigid_value) { $missing += "$name ($($rows.Count) step(s)) -> $($secureSteps[$name])" }
  }
  return $missing
}
function Select-PacProfile([string] $Url) {
  $targetHost = ([Uri]$Url).Host.ToLowerInvariant()
  $line = @(pac auth list | Where-Object { $_ -match [regex]::Escape($targetHost) }) | Select-Object -First 1
  if (-not $line -or $line -notmatch '^\[(\d+)\]') { throw "Nenhum perfil do pac para $targetHost. Rode: pac auth create --environment $Url" }
  pac auth select --index $Matches[1] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pac auth select falhou para $targetHost." }
}

# 1. Pre-checagens
if (-not $SkipGitChecks) {
  Push-Location $root
  try {
    $branch = (git branch --show-current).Trim()
    if ($branch -ne "main") { throw "Publique no PROD a partir da main (branch atual: $branch)." }
    if (git status --porcelain) { throw "Worktree com alteracoes; publique a partir da main limpa." }
    git fetch -q origin main
    if ((git rev-parse HEAD).Trim() -ne (git rev-parse origin/main).Trim()) { throw "HEAD diferente de origin/main; faca pull/push antes." }
  } finally { Pop-Location }
}
$devServed = Get-ServedAppVersion $DevUrl
if ($devServed -ne $appVersion) { throw "DEV serve o app $devServed, mas o package.json da main esta em $appVersion. Rode o push do DEV pela main antes." }
$devSolution = Get-SolutionVersion $DevUrl
$prodSolution = Get-SolutionVersion $ProdUrl
$prodServed = Get-ServedAppVersion $ProdUrl
$next = [version]::new($devSolution.Major, $devSolution.Minor, $devSolution.Build, $devSolution.Revision + 1)
Write-Step "app: DEV $devServed / PROD $prodServed; solucao: DEV $devSolution / PROD $prodSolution -> $next"
foreach ($line in (Get-StepsWithoutSecureConfig $ProdUrl)) { Write-Warning "PROD ja esta sem configuracao segura: $line" }
if (-not $Apply) { Write-Step "DRY RUN: use -Apply para exportar $next do DEV e importar no PROD."; return }

# 2. Versao, export e conferencia do ZIP
$outDir = Join-Path $root "backup\prod-deploy"
New-Item -ItemType Directory -Force $outDir | Out-Null
$zip = Join-Path $outDir ("{0}_{1}_managed.zip" -f $SolutionUniqueName, ($next.ToString() -replace '\.', '_'))
Select-PacProfile $DevUrl
pac solution online-version --solution-name $SolutionUniqueName --solution-version $next.ToString() | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao subir a versao da solucao no DEV." }
pac solution export --name $SolutionUniqueName --managed --path $zip --overwrite | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha no export gerenciado." }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
  $solutionXml = (New-Object IO.StreamReader($archive.GetEntry("solution.xml").Open())).ReadToEnd()
  if ($solutionXml -notmatch "<Version>$([regex]::Escape($next.ToString()))</Version>") { throw "ZIP sem a versao $next." }
  $appEntry = @($archive.Entries | Where-Object { $_.FullName -like "WebResources/$AppWebResourceName*" }) | Select-Object -First 1
  if (-not $appEntry) { throw "ZIP sem o web resource $AppWebResourceName." }
  $appHtml = (New-Object IO.StreamReader($appEntry.Open())).ReadToEnd()
  if ($appHtml -notmatch [regex]::Escape($appVersion)) { throw "ZIP sem o app $appVersion." }
} finally { $archive.Dispose() }
Write-Step "ZIP ok: $zip ($next, app $appVersion)"

# 3. Import no PROD
Select-PacProfile $ProdUrl
pac solution import --path $zip --stage-and-upgrade --publish-changes --activate-plugins --async --max-async-wait-time 60
if ($LASTEXITCODE -ne 0) { throw "Import no PROD falhou." }

# 4. Verificacao
$prodSolutionAfter = Get-SolutionVersion $ProdUrl
$prodServedAfter = Get-ServedAppVersion $ProdUrl
Write-Step "PROD: solucao $prodSolutionAfter; app servido $prodServedAfter"
$audit = & (Join-Path $PSScriptRoot "audit-prod-layers.ps1") -EnvironmentUrl $ProdUrl -SolutionUniqueName $SolutionUniqueName -OutFile (Join-Path $outDir "camadas-$($next.ToString()).csv")
if ($prodSolutionAfter -ne $next) { throw "PROD continua na solucao $prodSolutionAfter." }
if ($prodServedAfter -ne $appVersion) {
  throw "PROD serve o app $prodServedAfter, nao ${appVersion}: ha camada acima da $SolutionUniqueName no web resource (veja o CSV de camadas)."
}
$withoutSecret = @(Get-StepsWithoutSecureConfig $ProdUrl)
if ($withoutSecret.Count) {
  throw "Import deixou step(s) sem configuracao segura no PROD; o plugin falha ate repor o token. Rode cada script com -EnvironmentUrl $ProdUrl -Apply e BETINHOS_ALLOW_DIRECT_PROD=1:`n  $($withoutSecret -join "`n  ")"
}
Write-Step "PROD publicado: solucao $next, app $appVersion"
