param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Pasta,
  [Parameter(Mandatory = $true)] [ValidateSet("Test", "Prod")] [string] $Alvo,
  # JSON da ultima publicacao que passou neste ambiente (tag solucoes-<alvo>). Vazio ou invalido: importa tudo.
  [string] $Publicadas = "",
  [switch] $ImportarTudo,
  # Ensaio (so TEST): solucoes separadas por virgula, ou "todas", importadas como update, sem --stage-and-upgrade. Mede quanto
  # o upgrade custa; o PROD recusa.
  [string] $SemUpgrade = ""
)

# Etapa 2 dos workflows publicar.yml e retirar-caixa.yml: importa os ZIPs de manifesto.json na ordem das 4 (camada mais baixa
# primeiro; a AppBetinhos, so no manifesto da retirada, vai por ultimo), com --stage-and-upgrade. O alvo e explicito e a conexao
# so aceita o host dele. Fotos e comparacao ficam no workflow.
# Pula a solucao cujo conteudo e igual ao da ultima publicacao que passou no ambiente (Test-PodePular): reinstalar as 4 custa
# ~24 min por ambiente, e em geral so uma mudou. Grava publicadas.json em $Pasta para o workflow registrar depois da comparacao.
# Entrada "pulada" do manifesto (exportar-do-dev.ps1 viu pela impressao digital que nada mudou e nao exportou) nao tem ZIP: so
# passa se Test-PodePular confirmar a versao e o hash registrados neste ambiente; senao falha e pede importar_tudo.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  # Switch por splat: com -File, "-ImportarTudo:True" (como o Core serializa) e recusado pelo Windows PowerShell.
  $extra = @(); if ($ImportarTudo) { $extra += "-ImportarTudo" }
  if ($Publicadas) { $extra += @("-Publicadas", $Publicadas) }
  if ($SemUpgrade) { $extra += @("-SemUpgrade", $SemUpgrade) }
  & $ps -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -EnvironmentUrl $EnvironmentUrl -Pasta $Pasta -Alvo $Alvo @extra
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
. (Join-Path $PSScriptRoot "impressao.ps1")

$Pasta = (Resolve-Path -LiteralPath $Pasta).Path
$dv = Connect-Dataverse $EnvironmentUrl @($script:HostsAlvo[$Alvo])
Assert-HostAlvo $dv $Alvo
$manifesto = @(Read-JsonFile (Join-Path $Pasta "manifesto.json"))
$nomes = @($manifesto | ForEach-Object { $_.solucao })
$permitidas = @($script:Solucoes) + @("AppBetinhos")
$estranhas = @($nomes | Where-Object { $permitidas -notcontains $_ })
if ($estranhas.Count) { throw "Manifesto com solucao fora do permitido: $($estranhas -join ', ')." }
$ordem = @($permitidas | Where-Object { $nomes -contains $_ })
$semUpgradeLista = @($SemUpgrade -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($semUpgradeLista.Count -and $Alvo -ne "Test") { throw "-SemUpgrade e so ensaio no TEST; o $Alvo sempre importa com --stage-and-upgrade." }
if ($semUpgradeLista -contains "todas") { $semUpgradeLista = @($permitidas) }
$foraDoPermitido = @($semUpgradeLista | Where-Object { $permitidas -notcontains $_ })
if ($foraDoPermitido.Count) { throw "-SemUpgrade com solucao desconhecida: $($foraDoPermitido -join ', ')." }
if ($semUpgradeLista.Count) { Write-Step "ENSAIO: import como update (sem --stage-and-upgrade) em $($semUpgradeLista -join ', ')" }
Assert-ConexaoWebPush $nomes $Alvo $env:CONEXAO_WEBPUSH $env:WEBPUSH_VINCULAR_DEPOIS
$conexaoWebPush = Get-ConexaoWebPushDoImport $env:CONEXAO_WEBPUSH $env:WEBPUSH_VINCULAR_DEPOIS
$conectorWebPush = if ($conexaoWebPush -and $nomes -contains "BetinhosAutomacao") { Get-ConectorWebPush $dv } else { "" }
if ($conectorWebPush) { Write-Step "Web Push: conector do ambiente $conectorWebPush" }
if ($env:WEBPUSH_VINCULAR_DEPOIS -eq "true") { Write-Step "WEBPUSH_VINCULAR_DEPOIS: import sem --settings-file; vincule $($script:ReferenciaWebPush) e religue os flows dele em seguida" }
$anteriores = @()
if ($Publicadas -and -not $ImportarTudo -and (Test-Path -LiteralPath $Publicadas -PathType Leaf)) {
  try { $anteriores = @(Read-JsonFile $Publicadas) }
  catch { Write-Step "registro da ultima publicacao ilegivel ($($_.Exception.Message)); importa tudo" }
}
$resultado = @()
$registro = @($anteriores | Where-Object { $_ -and $nomes -notcontains $_.solucao } | ForEach-Object { New-RegistroPublicado $_ ([string] $_.versao) })
foreach ($nome in $ordem) {
  $item = @($manifesto | Where-Object { $_.solucao -eq $nome })[0]
  $antes = Get-VersaoInstalada (Update-DvToken $dv) $nome
  $semPacote = ((Get-Campo $item 'origem') -eq "pulada")
  if ($semPacote -and -not (Test-PodePular $item $antes $anteriores)) {
    throw "$nome veio sem pacote (pulada no export), mas $Alvo nao esta na versao e no conteudo da ultima publicacao registrada (instalada: $antes). Rode o Publicar solucoes com importar_tudo."
  }
  if (Test-PodePular $item $antes $anteriores) {
    Write-Step "pulando $nome em ${Alvo}: conteudo igual ao da versao instalada ($antes)"
    $resultado += [ordered]@{ solucao = $nome; antes = $antes; depois = $antes; modo = "pulada"; minutos = 0; pacPerdeuConexao = $false; pulada = $true }
    $registro += New-RegistroPublicado $item $antes
    continue
  }
  $semUpgrade = [bool] ($antes -and $semUpgradeLista -contains $nome)
  $modo = if (-not $antes) { "instalacao" } elseif ($semUpgrade) { "update" } else { "upgrade" }
  Write-Step "importando $nome $($item.versao) em $Alvo (instalada: $antes; modo: $modo)"
  $inicio = Get-Date
  $r = Import-SolucaoGerenciada $dv (Join-Path $Pasta $item.arquivo) $Alvo 60 $permitidas (New-ConfiguracaoDeImport $Pasta $nome $conexaoWebPush $conectorWebPush) $semUpgrade
  $resultado += [ordered]@{ solucao = $nome; antes = $antes; depois = $r.Versao; modo = $modo; minutos = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1); pacPerdeuConexao = $r.PacPerdeuConexao; pulada = $false }
  $registro += New-RegistroPublicado $item $r.Versao
}
Write-JsonFile (Join-Path $Pasta "importados.json") @($resultado)
Write-JsonFile (Join-Path $Pasta "publicadas.json") @($registro)
$puladas = @($resultado | Where-Object { $_.pulada }).Count
Write-Step "import concluido: $($resultado.Count - $puladas) importada(s), $puladas pulada(s)"
