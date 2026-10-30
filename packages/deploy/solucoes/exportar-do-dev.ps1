param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  [string] $Solucoes = "",
  [Parameter(Mandatory = $true)] [string] $Pasta,
  [switch] $Caixa
)

# Etapa 1 dos workflows publicar.yml e retirar-caixa.yml, no DEV: conferencia das 4 solucoes (barreira), versao seguinte de
# cada solucao escolhida (pac solution online-version) e export gerenciado conferido. Grava os ZIPs e manifesto.json em $Pasta.
# -Caixa: exporta a AppBetinhos (upgrade que antecede a retirada) em vez das 4; a conferencia e a mesma.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  # Switch por splat: com -File, "-Caixa:True" (como o Core serializa) e recusado pelo Windows PowerShell.
  $extra = @(); if ($Caixa) { $extra += "-Caixa" }
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Solucoes $Solucoes -Pasta $Pasta @extra
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @($script:HostDev)
$escolhidas = if ($Caixa) { @("AppBetinhos") } else { @(Get-SolucoesEscolhidas $Solucoes) }
Write-Step "solucoes: $($escolhidas -join ', ')"

# Barreira: nada sai do DEV com componente sem dono, em duas solucoes ou com dependencia fora das 4.
# Processo filho: o distribuidor termina com exit, que encerraria este script.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "distribuir-solucoes.ps1") -EnvironmentUrl $EnvironmentUrl -SomenteConferir
if ($LASTEXITCODE -ne 0) { throw "Conferencia das 4 solucoes no DEV nao zerou (codigo $LASTEXITCODE). Rode distribuir-solucoes.ps1 -Aplicar (skill verificar-solucoes) antes de publicar." }

# Caminho absoluto: o .NET (Write-JsonFile, ZipFile) resolveria pelo diretorio do processo.
if (-not [IO.Path]::IsPathRooted($Pasta)) { $Pasta = Join-Path $PWD $Pasta }
$Pasta = (New-Item -ItemType Directory -Force -Path $Pasta).FullName
$manifesto = @()
foreach ($nome in $escolhidas) {
  $atual = Get-VersaoInstalada $dv $nome
  if (-not $atual) { throw "Solucao $nome nao existe no DEV." }
  $nova = Get-VersaoSeguinte $atual
  Write-Step "$nome $atual -> $nova"
  Invoke-Pac $dv.Url @("solution", "online-version", "--solution-name", $nome, "--solution-version", $nova) | Out-Null
  $r = Export-SolucaoGerenciada $dv $nome (Join-Path $Pasta "$($nome)_managed.zip")
  $manifesto += [ordered]@{ solucao = $nome; versao = $r.Versao; arquivo = (Split-Path $r.Caminho -Leaf); hash = (Get-HashDoPacote $r.Caminho) }
}
Write-JsonFile (Join-Path $Pasta "manifesto.json") @($manifesto)
Write-Step "export concluido: $($manifesto.Count) solucao(oes)"
