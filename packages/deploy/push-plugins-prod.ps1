param([Parameter(Mandatory = $true)] [string] $Pasta)

# Caminho "plugin" do PROD (workflow Producao, so na main), segunda metade: troca o conteudo dos assemblies exportados do DEV
# por exportar-plugins-dev.ps1. So o codigo: step, Custom API ou registrador novo vai pelas solucoes, com ensaio no TEST.
# No PROD as solucoes sao gerenciadas: a troca vira camada Active, que o proximo publicar.yml remove depois de importar.
# O assembly precisa existir no PROD com o mesmo public key token. Reverter: publicar a versao anterior pelo mesmo caminho.
# So roda com a conta de servico e confere host e organizacao do PROD antes de gravar.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProdHost = 'orgf261ae8e.crm2.dynamics.com'
$ProdOrgId = '9e4ef53e-8bfc-f011-89f6-6045bd3ad1ec'
function Write-Step([string] $Message) { Write-Host "[plugins-prod] $Message" }

$base = $env:DV_ENVIRONMENT_URL.TrimEnd('/')
if (([Uri]$base).Host.ToLowerInvariant() -ne $ProdHost) { throw "Este script publica apenas no PROD ($ProdHost)." }
$commit = $env:GITHUB_SHA
if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido.' }
$api = "$base/api/data/v9.2"
$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
if (-not $token) { throw 'Falha ao obter token do PROD.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
$who = Invoke-RestMethod -Uri "$api/WhoAmI" -Headers $headers
if ($who.OrganizationId -ne $ProdOrgId) { throw 'A API nao respondeu pela organizacao PROD. Nada foi gravado.' }

$arquivos = @(Get-ChildItem -LiteralPath $Pasta -Filter '*.json')
if (-not $arquivos.Count) { throw "Nenhum assembly em $Pasta." }

# Confere todos antes de gravar o primeiro: nao deixa o PROD com metade dos plugins por um problema previsivel.
$alvos = @()
foreach ($f in $arquivos) {
  $a = [IO.File]::ReadAllText($f.FullName) | ConvertFrom-Json
  if ($a.commit -notmatch '^[0-9a-f]{40}$') { throw "$($a.name) sem commit registrado no DEV." }
  $rows = @((Invoke-RestMethod -Uri "$api/pluginassemblies?`$select=pluginassemblyid,publickeytoken,version&`$filter=name eq '$($a.name)'" -Headers $headers).value)
  if ($rows.Count -ne 1) { throw "$($a.name) ausente no PROD: plugin novo vai pelas solucoes." }
  if ($rows[0].publickeytoken -ne $a.publickeytoken) { throw "$($a.name): public key token do DEV ($($a.publickeytoken)) difere do PROD ($($rows[0].publickeytoken))." }
  $b64 = [IO.Path]::ChangeExtension($f.FullName, '.b64')
  if (-not (Test-Path -LiteralPath $b64 -PathType Leaf)) { throw "$($a.name) sem conteudo em $Pasta." }
  $alvos += @{ Id = $rows[0].pluginassemblyid; Assembly = $a; Antes = $rows[0].version; Conteudo = $b64 }
}

foreach ($alvo in $alvos) {
  $a = $alvo.Assembly
  if ($a.version -notmatch '^[0-9.]+$') { throw "$($a.name): versao invalida ($($a.version))." }
  $corpo = '{"content":"' + [IO.File]::ReadAllText($alvo.Conteudo) + '","version":"' + $a.version + '","description":"' + $commit + '"}'
  Invoke-RestMethod -Method Patch -Uri "$api/pluginassemblies($($alvo.Id))" -Headers ($headers + @{ 'If-Match' = '*' }) -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) | Out-Null
  $depois = Invoke-RestMethod -Uri "$api/pluginassemblies($($alvo.Id))?`$select=version,description" -Headers $headers
  if ($depois.description -ne $commit) { throw "$($a.name): gravacao nao confirmada." }
  Write-Step "$($a.name): $($alvo.Antes) -> $($depois.version)"
}
Write-Step "$($alvos.Count) assembly(ies) publicados no PROD"
