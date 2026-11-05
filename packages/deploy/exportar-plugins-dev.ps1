param(
  [Parameter(Mandatory = $true)] [string] $Plugins,
  [Parameter(Mandatory = $true)] [string] $Pasta,
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL
)

# Caminho "plugin" do PROD (workflow Producao), primeira metade: le do DEV o assembly ja publicado de cada plugin e grava em
# $Pasta para push-plugins-prod.ps1. O que vai ao PROD e o que o Deploy publicou e o DEV ja usa, sem compilar de novo e sem
# chave de assinatura no environment do PROD. A trava e a mesma do publicar.yml: plugin do DEV diferente deste commit recusa.
# Somente leitura no Dataverse. Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
$commit = $env:GITHUB_SHA
if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido.' }
$pedidos = @($Plugins.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if (-not $pedidos.Count) { throw 'Nenhum plugin pedido.' }

$saida = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'pendentes-dev.ps1') -Ate $commit
if ($LASTEXITCODE -ne 0) { throw 'pendentes-dev.ps1 falhou.' }
$pendentes = @(($saida | ConvertFrom-Json).plugins)
$bloqueados = @($pedidos | Where-Object { $pendentes -contains $_ })
if ($bloqueados.Count) { throw "Plugin do DEV difere deste commit: $($bloqueados -join ', '). Espere o Deploy da develop terminar e publique de novo." }

$tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
$token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

$Pasta = (New-Item -ItemType Directory -Force -Path $Pasta).FullName
$pastas = @{}
foreach ($d in Get-ChildItem (Join-Path $PSScriptRoot '..\plugins') -Directory) { if ($d.Name -match '^Cr40f\.([A-Za-z]+)\.Plugin$') { $pastas[$Matches[1].ToLowerInvariant()] = $d.Name } }
foreach ($nome in $pedidos) {
  if (-not $pastas.ContainsKey($nome)) { throw "Plugin desconhecido: $nome" }
  $assembly = $pastas[$nome]
  $rows = @((Invoke-RestMethod -Uri "$base/api/data/v9.2/pluginassemblies?`$select=name,version,publickeytoken,content,description&`$filter=name eq '$assembly'" -Headers $headers).value)
  if ($rows.Count -ne 1) { throw "$assembly ausente ou duplicado no DEV." }
  if (-not $rows[0].content) { throw "$assembly sem conteudo no DEV." }
  # Conteudo em arquivo proprio: ConvertFrom-Json do PowerShell 5.1 recusa string grande.
  [IO.File]::WriteAllText((Join-Path $Pasta "$assembly.b64"), [string]$rows[0].content, (New-Object Text.ASCIIEncoding))
  $json = [ordered]@{ name = $rows[0].name; version = $rows[0].version; publickeytoken = $rows[0].publickeytoken; commit = $rows[0].description } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $Pasta "$assembly.json"), $json, (New-Object Text.UTF8Encoding $false))
  Write-Host "[plugins-prod] $assembly $($rows[0].version) (DEV em $(([string]$rows[0].description).Substring(0, 7)))"
}
