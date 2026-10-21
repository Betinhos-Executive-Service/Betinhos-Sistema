param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com",
  [string] $CaixaDeEntrada = "AppBetinhos",
  [switch] $Aplicar,
  [switch] $SomenteConferir
)

# Distribui os componentes da caixa de entrada (AppBetinhos no DEV) nas 4 solucoes pelas regras de regras.json.
# Sem -Aplicar so mostra o que faria. -SomenteConferir nao altera nada e sai com codigo 1 se algo estiver fora do lugar.
# So roda no DEV. Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
#
# AddSolutionComponent arrasta componentes relacionados (tabela de um appaction, valor de uma definicao de variavel,
# conector de uma referencia de conexao, app e entidades de uma busca do Dataverse). Por isso, depois de adicionar,
# o script remove das 4 solucoes o que nao e do dono (RemoveSolutionComponent) e o que e proibido (valor de variavel).
# Assembly dentro de pacote de plug-in nao entra sozinho: quem carrega e o pacote, que e distribuido normalmente.

if ($PSVersionTable.PSEdition -eq "Core") {
  $ps = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $argumentos = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-EnvironmentUrl", $EnvironmentUrl, "-CaixaDeEntrada", $CaixaDeEntrada)
  if ($Aplicar) { $argumentos += "-Aplicar" }
  if ($SomenteConferir) { $argumentos += "-SomenteConferir" }
  & $ps @argumentos
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")

$dv = Connect-Dataverse $EnvironmentUrl @("org23b93544.crm2.dynamics.com")
$regrasPath = Join-Path $PSScriptRoot "regras.json"
$regras = Read-JsonFile $regrasPath
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("solucoes-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null

$caixaId = Get-SolucaoId $dv $CaixaDeEntrada
if (-not $caixaId) { throw "Solucao $CaixaDeEntrada nao encontrada no DEV." }
$componentes = @(Get-ComponentesDaSolucao $dv $caixaId (Get-TiposPorEntidade $dv))
# A conferencia aprova entrada vazia (nada a cobrir): uma caixa vazia e erro de leitura, nunca sucesso.
if ($componentes.Count -eq 0) { throw "A caixa de entrada $CaixaDeEntrada voltou com 0 componentes. Nada a distribuir ou conferir; confira a solucao e a conexao." }
Write-JsonFile (Join-Path $tmp "componentes.json") $componentes
$saida = node (Join-Path $PSScriptRoot "classificar.mjs") (Join-Path $tmp "componentes.json") $regrasPath
if ($LASTEXITCODE -ne 0) { throw "classificar.mjs falhou." }
$classe = $saida | ConvertFrom-Json
foreach ($p in @($classe.proibidos)) { Write-Warning "PROIBIDO tipo $($p.tipo) '$($p.nome)' ($($p.id)): $($p.motivo)" }
foreach ($s in @($classe.semRegra)) { Write-Warning "SEM REGRA tipo $($s.tipo) entidade '$($s.entidade)' nome '$($s.nome)' ($($s.id))" }

# Assembly dentro de pacote de plug-in: o Dataverse recusa adicionar sozinho ("export the Package directly").
# Fica de fora da distribuicao e da conferencia, desde que o pacote dele esteja entre as atribuicoes.
$idsAtribuidos = @{}
foreach ($a in @($classe.atribuicoes)) { $idsAtribuidos[[string] $a.id] = $true }
$empacotados = @{}
foreach ($r in @(Read-DvAll $dv "pluginassemblies?`$select=pluginassemblyid,_packageid_value&`$filter=_packageid_value ne null")) {
  $pacote = ([string] $r._packageid_value).ToLowerInvariant()
  if ($idsAtribuidos.ContainsKey($pacote)) { $empacotados[([string] $r.pluginassemblyid).ToLowerInvariant()] = $pacote }
}
$atribuicoes = @($classe.atribuicoes | Where-Object { -not $empacotados.ContainsKey([string] $_.id) })
$caixa = @($componentes | Where-Object { -not $empacotados.ContainsKey([string] $_.id) } | ForEach-Object { [string] $_.id })
foreach ($c in @($componentes | Where-Object { $empacotados.ContainsKey([string] $_.id) })) { Write-Step "assembly empacotado (carregado pelo pacote $($empacotados[[string] $c.id])): '$($c.nome)' ($($c.id))" }

$donoEsperado = @{}
foreach ($a in $atribuicoes) { $donoEsperado[[string] $a.id] = [string] $a.solucao }
$tiposProibidos = @($regras.proibidos.PSObject.Properties.Name | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int] $_ })

# Linhas (id minusculo e tipo) de cada uma das 4 solucoes.
function Get-LinhasPorSolucao {
  $mapa = @{}
  foreach ($sol in $script:Solucoes) {
    $id = Get-SolucaoId $dv $sol
    $linhas = @()
    if ($id) { $linhas = @(Read-DvAll $dv "solutioncomponents?`$select=objectid,componenttype&`$filter=_solutionid_value eq $id" | ForEach-Object { @{ id = ([string] $_.objectid).ToLowerInvariant(); tipo = [int] $_.componenttype } }) }
    $mapa[$sol] = $linhas
  }
  return $mapa
}

function Get-IdsPorSolucao($Linhas) {
  $mapa = @{}
  foreach ($sol in $script:Solucoes) { $mapa[$sol] = @($Linhas[$sol] | ForEach-Object { $_.id }) }
  return $mapa
}

# O que esta numa solucao e nao deveria: tipo proibido, dono diferente, ou (fora da caixa) copia numa camada acima da primeira que o tem.
function Get-Excedentes($Linhas) {
  $primeira = @{}
  foreach ($sol in $regras.solucoes) { foreach ($l in $Linhas[$sol]) { if (-not $primeira.ContainsKey($l.id)) { $primeira[$l.id] = $sol } } }
  $lista = @()
  foreach ($sol in $regras.solucoes) {
    foreach ($l in $Linhas[$sol]) {
      $motivo = $null
      if ($tiposProibidos -contains $l.tipo) { $motivo = "tipo proibido (valor de variavel nao viaja)" }
      elseif ($donoEsperado.ContainsKey($l.id)) { if ($donoEsperado[$l.id] -ne $sol) { $motivo = "pertence a $($donoEsperado[$l.id])" } }
      elseif ($primeira[$l.id] -ne $sol) { $motivo = "fora da caixa, ja esta em $($primeira[$l.id])" }
      if ($motivo) { $lista += @{ solucao = $sol; id = $l.id; tipo = $l.tipo; motivo = $motivo } }
    }
  }
  return $lista
}

# Mensagem completa do Dataverse (Invoke-RestMethod no PS 5.1 esconde o corpo do erro).
function Get-ErroDv($Err) {
  $msg = [string] $Err.Exception.Message
  if ($Err.ErrorDetails -and $Err.ErrorDetails.Message) { return "$msg | $($Err.ErrorDetails.Message)" }
  $resp = $Err.Exception.PSObject.Properties["Response"]
  if ($resp -and $resp.Value) {
    try { $reader = New-Object IO.StreamReader($resp.Value.GetResponseStream()); $msg = "$msg | $($reader.ReadToEnd())" } catch { }
  }
  return $msg
}

$linhas = Get-LinhasPorSolucao
$porSolucao = Get-IdsPorSolucao $linhas
$falhas = @()

if (-not $SomenteConferir) {
  $faltam = @($atribuicoes | Where-Object { @($porSolucao[$_.solucao]) -notcontains $_.id })
  Write-Step "componentes na caixa de entrada: $($componentes.Count); empacotados: $($empacotados.Count); a distribuir: $($faltam.Count)"
  foreach ($g in ($faltam | Group-Object solucao)) { Write-Step "  $($g.Name): $($g.Count)" }
  if (@($classe.semRegra).Count -or @($classe.proibidos).Count) { throw "Ha componentes sem regra ou proibidos (avisos acima). Ajuste regras.json ou a caixa de entrada antes de distribuir." }
  if (-not $Aplicar) { Write-Step "DRY RUN: use -Aplicar para criar as solucoes que faltam e distribuir."; return }
  $publisher = [string] (Read-DvAll $dv "solutions?`$select=_publisherid_value&`$filter=solutionid eq $caixaId")[0]._publisherid_value
  foreach ($sol in $script:Solucoes) { if (New-SolucaoSeFaltar $dv $sol $publisher) { Write-Step "criada $sol" } }
  $total = 0
  $tiposComErro = @{}
  for ($passo = 1; $passo -le 3; $passo++) {
    $faltam = @($atribuicoes | Where-Object { @($porSolucao[$_.solucao]) -notcontains $_.id })
    $n = 0
    foreach ($a in $faltam) {
      if ($tiposComErro.ContainsKey([int] $a.tipo)) { continue }
      try { Add-ComponenteNaSolucao $dv $a $a.solucao }
      catch {
        $erro = Get-ErroDv $_
        if ($erro -match "0x80040217") {
          # Sumiu entre a leitura e a escrita (ex.: asset com hash trocado por um push no DEV): a proxima execucao le a caixa de novo.
          Write-Warning "SUMIU tipo $($a.tipo) '$($a.nome)' ($($a.id)): $erro"
          $falhas += "sumiu durante a execucao: tipo $($a.tipo) '$($a.nome)' ($($a.id)); rode de novo"
          continue
        }
        # Qualquer outro erro: nao adivinhar, parar este tipo e registrar o erro exato.
        $tiposComErro[[int] $a.tipo] = $erro
        $falhas += "tipo $($a.tipo) ($($a.entidade)) '$($a.nome)' ($($a.id)) -> $($a.solucao): $erro"
        Write-Warning "AddSolutionComponent rejeitou o tipo $($a.tipo): $erro"
        continue
      }
      $n++
      if ($n % 50 -eq 0) { Write-Step "  passo ${passo}: $n de $($faltam.Count)" }
    }
    $total += $n
    Write-Step "passo ${passo}: adicionados $n de $($faltam.Count)"
    $linhas = Get-LinhasPorSolucao
    $excedentes = @(Get-Excedentes $linhas)
    Write-Step "passo ${passo}: excedentes a remover (arrastados por AddSolutionComponent): $($excedentes.Count)"
    foreach ($g in ($excedentes | Group-Object { "$($_.solucao) tipo $($_.tipo)" })) { Write-Step "  $($g.Name): $($g.Count)" }
    foreach ($e in $excedentes) {
      try { Remove-ComponenteDaSolucao $dv $e.id $e.tipo $e.solucao }
      catch {
        # Linha que ja saiu junto com outra remocao (subcomponente) nao e erro; o resto fica registrado.
        if ($_.Exception.Message -match "achei 0") { continue }
        $erro = Get-ErroDv $_
        Write-Warning "RemoveSolutionComponent falhou: $($e.solucao) tipo $($e.tipo) ($($e.id)): $erro"
        $falhas += "remocao falhou: $($e.solucao) tipo $($e.tipo) ($($e.id)): $erro"
      }
    }
    $linhas = Get-LinhasPorSolucao
    $porSolucao = Get-IdsPorSolucao $linhas
    $restam = @($atribuicoes | Where-Object { @($porSolucao[$_.solucao]) -notcontains $_.id })
    if ($restam.Count -eq 0) { break }
  }
  Write-Step "distribuidos: $total"
}

$ausentes = @{}
foreach ($sol in $script:Solucoes) {
  $lista = @()
  if (Get-SolucaoId $dv $sol) { $lista = @(Get-DependenciasAusentes $dv $sol) }
  $ausentes[$sol] = $lista
}
$excedentesFinais = @(Get-Excedentes $linhas)
$valoresNasSolucoes = @($excedentesFinais | Where-Object { $tiposProibidos -contains $_.tipo })
Write-JsonFile (Join-Path $tmp "conferir.json") @{
  caixa = $caixa; porSolucao = $porSolucao
  atribuicoes = $atribuicoes; ausentes = $ausentes; permitidas = $regras.permitidas
}
$relatorio = (node (Join-Path $PSScriptRoot "conferir.mjs") (Join-Path $tmp "conferir.json")) | ConvertFrom-Json
$codigo = $LASTEXITCODE
Write-Step ("conferencia: sem dono {0}; em duas {1}; fora do lugar {2}; dependencias para cima {3}" -f @($relatorio.cobertura.semDono).Count, @($relatorio.cobertura.emDuas).Count, @($relatorio.cobertura.foraDoLugar).Count, @($relatorio.violacoes).Count)
Write-Step ("valores de variavel dentro das 4 solucoes: {0}; excedentes fora da caixa: {1}; assemblies empacotados: {2}" -f $valoresNasSolucoes.Count, ($excedentesFinais.Count - $valoresNasSolucoes.Count), $empacotados.Count)
Write-JsonFile (Join-Path $tmp "relatorio.json") $relatorio
Write-JsonFile (Join-Path $tmp "excedentes.json") $excedentesFinais
Write-Step "detalhes: $(Join-Path $tmp 'relatorio.json')"
if (@($classe.semRegra).Count -or @($classe.proibidos).Count -or $falhas.Count -or $excedentesFinais.Count) { $codigo = 1 }
foreach ($f in $falhas) { Write-Warning "FALHA $f" }
exit $codigo
