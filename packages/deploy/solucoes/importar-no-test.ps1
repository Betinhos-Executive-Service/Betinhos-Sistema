param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Pasta
)

# Etapa 2 do workflow publicar-test.yml, no TEST: importa os ZIPs de manifesto.json na ordem das 4 (camada mais baixa
# primeiro), com --stage-and-upgrade. Recusa qualquer ambiente que nao seja o TEST. Fotos e comparacao ficam no workflow.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Pasta $Pasta
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$Pasta = (Resolve-Path -LiteralPath $Pasta).Path
$dv = Connect-Dataverse $EnvironmentUrl @($script:HostTest)
Assert-HostTest $dv
$manifesto = @(Read-JsonFile (Join-Path $Pasta "manifesto.json"))
$ordem = @(Get-SolucoesEscolhidas (($manifesto | ForEach-Object { $_.solucao }) -join ","))
$resultado = @()
foreach ($nome in $ordem) {
  $item = @($manifesto | Where-Object { $_.solucao -eq $nome })[0]
  $antes = Get-VersaoInstalada $dv $nome
  Write-Step "importando $nome $($item.versao) (instalada: $antes)"
  $inicio = Get-Date
  $r = Import-SolucaoGerenciada $dv (Join-Path $Pasta $item.arquivo)
  $resultado += [ordered]@{ solucao = $nome; antes = $antes; depois = $r.Versao; minutos = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1); pacPerdeuConexao = $r.PacPerdeuConexao }
}
Write-JsonFile (Join-Path $Pasta "importados.json") @($resultado)
Write-Step "import concluido: $($resultado.Count) solucao(oes)"
