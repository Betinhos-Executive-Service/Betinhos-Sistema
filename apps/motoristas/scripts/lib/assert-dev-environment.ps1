# Bloqueia publicacao direta de personalizacao fora do DEV.
# PROD recebe mudancas so pela solucao gerenciada AppBetinhos (scripts/deploy-prod.ps1): publicar direto no
# PROD cria camada "Active" nao gerenciada, que sombreia os imports seguintes e faz o PROD servir versao antiga.
# Excecao consciente (hotfix emergencial): defina BETINHOS_ALLOW_DIRECT_PROD=1 e leve a mesma mudanca ao DEV depois.
$script:BetinhosDevHosts = @("org23b93544.crm2.dynamics.com")

function Assert-DevEnvironment([string] $EnvironmentUrl) {
  if ([string]::IsNullOrWhiteSpace($EnvironmentUrl)) { throw "EnvironmentUrl ausente." }
  $targetHost = ([Uri] $EnvironmentUrl.Trim()).Host.ToLowerInvariant()
  if ($script:BetinhosDevHosts -contains $targetHost) { return }
  if ($env:BETINHOS_ALLOW_DIRECT_PROD -eq "1") {
    Write-Warning "Publicacao direta em $targetHost liberada por BETINHOS_ALLOW_DIRECT_PROD=1. Isso cria camada Active; remova-a depois do proximo import gerenciado."
    return
  }
  throw "Publicacao direta bloqueada em $targetHost. Este script so altera o DEV; o PROD recebe mudancas pela solucao gerenciada (scripts/deploy-prod.ps1)."
}
