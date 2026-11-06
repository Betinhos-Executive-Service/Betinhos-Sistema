param(
  [Parameter(Mandatory = $true)] [ValidateSet("Entrar", "Sair")] [string] $Acao,
  [Parameter(Mandatory = $true)] [ValidateSet("dev", "test", "prod")] [string] $Ambiente,
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL,
  # Identifica o run: repositorio e id. Sair so solta a trava deste mesmo dono.
  [string] $Dono = "$($env:GITHUB_REPOSITORY)/$($env:GITHUB_RUN_ID)",
  # Maior que o timeout do job: um import nao perde a trava no meio.
  [int] $Minutos = 30,
  [int] $EsperaMinutos = 20
)

# Pega ou solta a trava de publicacao de um ambiente (trava.ps1). No workflow, Sair vai em passo com if: always().
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
. (Join-Path $PSScriptRoot "trava.ps1")

if ($Dono -eq "/") { throw "Dono ausente: fora do GitHub Actions, passe -Dono." }
$hosts = @{ dev = $script:HostDev; test = $script:HostTest; prod = $script:HostProd }
$dv = Connect-Dataverse $EnvironmentUrl @($hosts[$Ambiente])
if ($Acao -eq "Entrar") {
  Enter-Trava $dv $Ambiente $Dono $Minutos ($EsperaMinutos * 60)
  Write-Step "trava $Ambiente com $Dono por $Minutos minutos"
}
elseif (Exit-Trava $dv $Ambiente $Dono) { Write-Step "trava $Ambiente solta" }
else { Write-Step "trava $Ambiente nao e de $Dono; nada a soltar" }
