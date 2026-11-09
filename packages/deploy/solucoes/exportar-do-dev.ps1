param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  # Nao se chama $Solucoes: solucoes.ps1 atribui $script:Solucoes (as 4 novas) no mesmo escopo do script e, com a
  # restricao [string] do parametro, a lista virava "BetinhosCore BetinhosAutomacao ..." (export falhou no CI em 30/10/2026).
  [Alias("Solucoes")] [string] $Pedido = "",
  [Parameter(Mandatory = $true)] [string] $Pasta,
  [switch] $Caixa,
  # Registros da ultima publicacao que passou em cada alvo desta execucao: "test=arquivo.json,prod=arquivo.json" (tags
  # solucoes-<alvo>). Arquivo ausente = alvo sem registro (nao pula). Vazio = nunca pula.
  [string] $Publicadas = "",
  # Pasta com o ultimo pacote do Deploy (ZIPs + manifesto.json). Vazio ou sem manifesto = sem reaproveitamento.
  [string] $Cache = "",
  # Sem -Confiar (modo observar, o padrao): exporta tudo como antes e so registra o que a impressao digital teria decidido,
  # provando a decisao contra o pacote fresco. Com -Confiar: pula ou reaproveita de verdade.
  [switch] $Confiar
)

# Etapa 1 dos workflows publicar.yml e retirar-caixa.yml, e fim do deploy.yml (pacote para o publicar), no DEV: conferencia
# das 4 solucoes (barreira), impressao digital de cada solucao escolhida (impressao.ps1) e, conforme Get-DecisaoDeExport:
#  - pular: sem mudanca desde a ultima publicacao em todos os alvos; vai ao manifesto como "pulada", sem ZIP e sem subir versao;
#  - cache: copia o ZIP do ultimo Deploy, conferido (hash, UniqueName, versao atual do DEV e Managed);
#  - exportar: versao seguinte (pac solution online-version) e export gerenciado conferido.
# Grava os ZIPs e manifesto.json (solucao, versao, arquivo, hash, impressao, origem, decisao, observacao, commit) em $Pasta.
# -Caixa: exporta a AppBetinhos (upgrade que antecede a retirada) em vez das 4; a conferencia e a mesma; sem impressao.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  # Switch por splat: com -File, "-Caixa:True" (como o Core serializa) e recusado pelo Windows PowerShell.
  $extra = @(); if ($Caixa) { $extra += "-Caixa" }; if ($Confiar) { $extra += "-Confiar" }
  if ($Publicadas) { $extra += @("-Publicadas", $Publicadas) }
  if ($Cache) { $extra += @("-Cache", $Cache) }
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Solucoes $Pedido -Pasta $Pasta @extra
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
. (Join-Path $PSScriptRoot "impressao.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @($script:HostDev)
$escolhidas = if ($Caixa) { @("AppBetinhos") } else { @(Get-SolucoesEscolhidas $Pedido) }
Write-Step "solucoes: $($escolhidas -join ', ')"

# Barreira: nada sai do DEV com componente sem dono, em duas solucoes ou com dependencia fora das 4.
# Processo filho: o distribuidor termina com exit, que encerraria este script.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "distribuir-solucoes.ps1") -EnvironmentUrl $EnvironmentUrl -SomenteConferir
if ($LASTEXITCODE -ne 0) { throw "Conferencia das 4 solucoes no DEV nao zerou (codigo $LASTEXITCODE). Rode distribuir-solucoes.ps1 -Aplicar (skill verificar-solucoes) antes de publicar." }

# Caminho absoluto: o .NET (Write-JsonFile, ZipFile) resolveria pelo diretorio do processo.
if (-not [IO.Path]::IsPathRooted($Pasta)) { $Pasta = Join-Path $PWD $Pasta }
$Pasta = (New-Item -ItemType Directory -Force -Path $Pasta).FullName
$registros = @{}
foreach ($par in @($Publicadas -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  $alvo, $arquivo = $par -split "=", 2
  $registros[$alvo] = @()
  if ($arquivo -and (Test-Path -LiteralPath $arquivo -PathType Leaf) -and (Get-Item -LiteralPath $arquivo).Length) {
    try { $registros[$alvo] = @(Read-JsonFile $arquivo) } catch { Write-Step "registro de $alvo ilegivel ($($_.Exception.Message)); nao pula" }
  }
}
$doCache = @()
if ($Cache -and (Test-Path -LiteralPath (Join-Path $Cache "manifesto.json"))) {
  try { $doCache = @(Read-JsonFile (Join-Path $Cache "manifesto.json")) } catch { Write-Step "manifesto do cache ilegivel ($($_.Exception.Message)); exporta" }
}

$manifesto = @()
foreach ($nome in $escolhidas) {
  $atual = Get-VersaoInstalada $dv $nome
  if (-not $atual) { throw "Solucao $nome nao existe no DEV." }
  $decisao = @{ acao = "exportar"; motivo = "retirada" }; $impressao = $null
  if (-not $Caixa) {
    # Falha inesperada na impressao nunca barra o export: vira incerta e exporta como antes.
    try { $impressao = Get-ImpressaoDigital $dv $nome }
    catch { $impressao = @{ valor = $null; incerto = $true; motivos = @("impressao falhou: $(Get-ErroDv $_)") } }
    if ($impressao.incerto) { Write-Step "$nome impressao incerta: $(@($impressao.motivos | Select-Object -First 5) -join '; ')" }
    $cacheItem = @($doCache | Where-Object { (Get-Campo $_ 'solucao') -eq $nome } | Select-Object -First 1)
    $decisao = Get-DecisaoDeExport $nome $impressao $registros $(if ($cacheItem.Count) { $cacheItem[0] } else { $null }) $atual
  }
  $valorImpressao = if ($impressao -and -not $impressao.incerto) { $impressao.valor } else { $null }
  Write-Step "$nome decisao: $($decisao.acao) ($($decisao.motivo))$(if (-not $Confiar -and $decisao.acao -ne 'exportar') { '; modo observar: exporta assim mesmo' })"
  $entrada = [ordered]@{ solucao = $nome; versao = $null; arquivo = $null; hash = $null; impressao = $valorImpressao; origem = "exportado"; decisao = $decisao.acao; motivo = $decisao.motivo; observacao = $null; commit = $env:GITHUB_SHA }

  if ($Confiar -and $decisao.acao -eq "pular") {
    $entrada.hash = $decisao.hash; $entrada.origem = "pulada"
    $manifesto += $entrada; continue
  }
  if ($Confiar -and $decisao.acao -eq "cache") {
    $origem = Join-Path $Cache $decisao.arquivo
    $destino = Join-Path $Pasta "$($nome)_managed.zip"
    $conferido = $false
    if (Test-Path -LiteralPath $origem -PathType Leaf) {
      Copy-Item -LiteralPath $origem -Destination $destino -Force
      $m = Get-ManifestoDoPacote $destino
      $conferido = ($m.UniqueName -eq $nome -and $m.Version -eq $atual -and $m.Managed -and (Get-HashDoPacote $destino) -eq $decisao.hash)
    }
    if ($conferido) {
      $entrada.versao = $atual; $entrada.arquivo = Split-Path $destino -Leaf; $entrada.hash = $decisao.hash; $entrada.origem = "cache"
      $manifesto += $entrada; continue
    }
    Write-Step "$nome pacote do Deploy nao conferiu; exportando"
  }
  $nova = Get-VersaoSeguinte $atual
  Write-Step "$nome $atual -> $nova"
  Invoke-Pac $dv.Url @("solution", "online-version", "--solution-name", $nome, "--solution-version", $nova) | Out-Null
  $r = Export-SolucaoGerenciada $dv $nome (Join-Path $Pasta "$($nome)_managed.zip")
  $entrada.versao = $r.Versao; $entrada.arquivo = Split-Path $r.Caminho -Leaf; $entrada.hash = Get-HashDoPacote $r.Caminho
  $entrada.observacao = Get-ObservacaoDaDecisao $decisao $entrada.hash
  if ($entrada.observacao -eq "erro") {
    Write-Host "::warning title=Impressao digital::$nome - a impressao disse '$($decisao.acao)', mas o pacote novo tem outro conteudo. Nao ligue SOLUCOES_IMPRESSAO=confiar; veja a skill verificar-solucoes."
  }
  $manifesto += $entrada
}
Write-JsonFile (Join-Path $Pasta "manifesto.json") @($manifesto)
Write-Step "export concluido: $(@($manifesto | Where-Object { $_.origem -eq 'exportado' }).Count) exportada(s), $(@($manifesto | Where-Object { $_.origem -eq 'cache' }).Count) do Deploy, $(@($manifesto | Where-Object { $_.origem -eq 'pulada' }).Count) pulada(s)"
