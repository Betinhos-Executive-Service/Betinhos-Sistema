param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  [Parameter(Mandatory = $true)] [string] $Foto,
  [Parameter(Mandatory = $true)] [string] $Saida,
  [Parameter(Mandatory = $true)] [string] $FotoDev,
  [string] $AceitarTabelas = ""
)

# Ponto sem volta da retirada (workflow retirar-caixa.yml): com a foto do alvo e a foto do DEV da mesma janela, roda a
# conferencia da retirada (conferir-retirada.mjs --dev: o que esta so na caixa tem de ter saido do DEV de proposito, e tabela
# com registros so passa se aceita) e, se passar, desinstala AppBetinhos e gerarpagantes, nessa ordem, provando pela ausencia.
# Nao faz upgrade da AppBetinhos antes: no TEST (30/10/2026) o upgrade caiu duas vezes com erro de transporte SQL do servidor.
# Grava o resultado em $Saida.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  # Argumento vazio some com -File: so passa -AceitarTabelas quando houver lista.
  $extra = @(); if ($AceitarTabelas) { $extra += @("-AceitarTabelas", $AceitarTabelas) }
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Alvo $Alvo -Foto $Foto -Saida $Saida -FotoDev $FotoDev @extra
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$Saida = Initialize-ArquivoDeSaida $Saida
$Foto = (Resolve-Path -LiteralPath $Foto).Path
$FotoDev = (Resolve-Path -LiteralPath $FotoDev).Path
$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
if (([string] (Read-JsonFile $Foto).ambiente).TrimEnd("/") -ne $dv.Url) { throw "A foto $Foto e de outro ambiente." }

# Barreira: processo filho do node; codigo 1 = a retirada apagaria algo (soNaCaixa) ou ha componente em duas das 4.
$conferencia = & node (Join-Path $PSScriptRoot "conferir-retirada.mjs") $Foto --dev $FotoDev --aceitar-tabelas $AceitarTabelas
if ($LASTEXITCODE -ne 0) { Write-Host ($conferencia -join "`n"); throw "conferir-retirada reprovou a foto (codigo $LASTEXITCODE): nada foi desinstalado." }
Write-Host ($conferencia -join "`n")
Write-Step "conferencia da retirada: ok"

$resultado = @()
foreach ($nome in $script:Caixas) {
  $inicio = Get-Date
  $r = Remove-SolucaoGerenciada $dv $Alvo $nome
  $resultado += [ordered]@{ solucao = $nome; jaAusente = $r.JaAusente; minutos = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1); pacPerdeuConexao = $r.PacPerdeuConexao }
}
Write-JsonFile $Saida @($resultado)
Write-Step "retirada concluida em ${Alvo}: $(($resultado | ForEach-Object { $_.solucao }) -join ', ')"
