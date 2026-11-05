param(
  # Nomes separados por virgula (frota,acesso) ou "todos". Vazio: nada a fazer.
  [string] $Plugins = '',
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL
)

# Publica no DEV os plugins pedidos, pelo workflow Deploy (develop -> DEV). Cada um vai pelo seu
# packages/plugins/scripts/push-<nome>-plugin.ps1 com -SemTestes (os testes rodaram no PR), na conta de servico
# (DV_CLIENT_ID/DV_CLIENT_SECRET) e com a chave de assinatura que vem do secret PLUGIN_SNK_<NOME> (base64 do .snk).
# O registrador grava o commit (GITHUB_SHA) na descricao do assembly; o publicar.yml usa isso na trava do PROD.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $EnvironmentUrl) { throw 'DV_ENVIRONMENT_URL ausente.' }
if (([Uri]$EnvironmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $EnvironmentUrl" }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pastas = @{}
foreach ($d in Get-ChildItem (Join-Path $root 'packages\plugins') -Directory) {
  if ($d.Name -match '^Cr40f\.([A-Za-z]+)\.Plugin$') { $pastas[$Matches[1].ToLowerInvariant()] = $Matches[1] }
}

$pedidos = if ($Plugins.Trim() -eq 'todos') { @($pastas.Keys | Sort-Object) }
           else { @($Plugins.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }) }
if (-not $pedidos.Count) { Write-Host '[plugins] nada a publicar'; exit 0 }

foreach ($nome in $pedidos) {
  if (-not $pastas.ContainsKey($nome)) { throw "Plugin desconhecido: $nome (validos: $(($pastas.Keys | Sort-Object) -join ', '))" }
  if (-not (Test-Path (Join-Path $PSScriptRoot "..\plugins\scripts\push-$nome-plugin.ps1"))) { throw "Sem script de publicacao: push-$nome-plugin.ps1" }
}

$chaves = Join-Path $env:USERPROFILE '.codex\keys'
[IO.Directory]::CreateDirectory($chaves) | Out-Null
foreach ($nome in $pedidos) {
  $snk = Join-Path $chaves "Cr40f.$($pastas[$nome]).Plugin.snk"
  $b64 = [Environment]::GetEnvironmentVariable("PLUGIN_SNK_$($nome.ToUpperInvariant())")
  if ($b64) { [IO.File]::WriteAllBytes($snk, [Convert]::FromBase64String($b64)) }
  elseif ($env:GITHUB_ACTIONS -eq 'true') { throw "Secret PLUGIN_SNK_$($nome.ToUpperInvariant()) ausente no environment dev." }
}

foreach ($nome in $pedidos) {
  Write-Host "::group::plugin $nome"
  $inicio = Get-Date
  & (Join-Path $PSScriptRoot "..\plugins\scripts\push-$nome-plugin.ps1") -EnvironmentUrl $EnvironmentUrl -EnvironmentName dev -SemTestes
  Write-Host "::endgroup::"
  Write-Host ("[plugins] {0} publicado em {1:n0} s" -f $nome, ((Get-Date) - $inicio).TotalSeconds)
}
