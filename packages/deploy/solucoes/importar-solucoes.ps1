param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Pasta,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo
)

# Etapa 2 dos workflows publicar.yml e retirar-caixa.yml: importa os ZIPs de manifesto.json na ordem das 4 (camada mais baixa
# primeiro; a AppBetinhos, so no manifesto da retirada, vai por ultimo), com --stage-and-upgrade. O alvo e explicito e a conexao
# so aceita o host dele. Fotos e comparacao ficam no workflow.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Pasta $Pasta -Alvo $Alvo
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$Pasta = (Resolve-Path -LiteralPath $Pasta).Path
$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
$manifesto = @(Read-JsonFile (Join-Path $Pasta "manifesto.json"))
$nomes = @($manifesto | ForEach-Object { $_.solucao })
$permitidas = @($script:Solucoes) + @("AppBetinhos")
$estranhas = @($nomes | Where-Object { $permitidas -notcontains $_ })
if ($estranhas.Count) { throw "Manifesto com solucao fora do permitido: $($estranhas -join ', ')." }
$ordem = @($permitidas | Where-Object { $nomes -contains $_ })
$resultado = @()
foreach ($nome in $ordem) {
  $item = @($manifesto | Where-Object { $_.solucao -eq $nome })[0]
  $antes = Get-VersaoInstalada (Update-DvToken $dv) $nome
  Write-Step "importando $nome $($item.versao) em $Alvo (instalada: $antes)"
  $inicio = Get-Date
  $r = Import-SolucaoGerenciada $dv (Join-Path $Pasta $item.arquivo) $Alvo 60 $permitidas
  $resultado += [ordered]@{ solucao = $nome; antes = $antes; depois = $r.Versao; minutos = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1); pacPerdeuConexao = $r.PacPerdeuConexao }
}
Write-JsonFile (Join-Path $Pasta "importados.json") @($resultado)
Write-Step "import concluido: $($resultado.Count) solucao(oes)"
