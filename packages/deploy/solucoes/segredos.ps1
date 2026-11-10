# Trava de segredos dos pacotes de solucao. O repositorio e publico e qualquer conta do GitHub baixa artefatos: nenhum ZIP
# sai do runner (artefato ou cache) sem passar por aqui. Varre todas as entradas de cada ZIP (e ZIPs dentro dele: .msapp,
# .nupkg, .zip) e devolve solucao / arquivo / tipo. Nunca devolve nem imprime o valor encontrado.
# Excecao temporaria: segredos-permitidos.json (solucao + arquivo + tipo + motivo + ate). sk-ant e entra nunca sao permitidos.
# So funcoes (dot-source). Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:PadroesSegredo = [ordered]@{
  "sk-ant" = 'sk-ant-[A-Za-z0-9_-]{10,}'
  "sig"    = 'sig=[A-Za-z0-9_%-]{20,}'
  "apikey" = 'apikey_[0-9a-f]{20}'
  "entra"  = 'Q~[A-Za-z0-9_~.-]{30,}'
}
$script:TiposNuncaPermitidos = @("sk-ant", "entra")
$script:NomeVariavelSecreta = '(?i)key|secret|token|senha'
$script:ExtensoesZip = '(?i)\.(zip|msapp|nupkg)$'

# sig= que ainda vale. SAS do Azure Storage com expiracao (se=) no passado nao da acesso a nada: os .msapp guardam em
# References\Resources.json SAS de leitura de 1 dia gerados quando o app foi salvo. URL de flow (sem se=) sempre conta.
function Test-SigVigente([string] $Texto, [datetime] $Agora = [datetime]::UtcNow) {
  # A URL e recortada a mao em volta do sig= (no maximo 4 KB de cada lado): um [^...]* na frente do regex volta atras em
  # cada posicao de um binario grande e a varredura de um ZIP real passava de 2 minutos.
  $limites = [char[]] " `t`r`n`"'<>\"
  foreach ($m in [regex]::Matches($Texto, 'sig=[A-Za-z0-9_%-]{20,}')) {
    $ini = [Math]::Max(0, $m.Index - 4096)
    $antes = $Texto.LastIndexOfAny($limites, $m.Index, $m.Index - $ini)
    $ini = if ($antes -ge 0) { $antes + 1 } else { $ini }
    $fim = $Texto.IndexOfAny($limites, $m.Index, [Math]::Min(4096, $Texto.Length - $m.Index))
    if ($fim -lt 0) { $fim = [Math]::Min($Texto.Length, $m.Index + 4096) }
    $url = $Texto.Substring($ini, $fim - $ini)
    $se = [regex]::Match($url,'[?&]se=(\d{4}-\d{2}-\d{2}T\d{2}(?:%3A|:)\d{2}(?:%3A|:)\d{2}Z)')
    if (-not $se.Success) { return $true }
    $fim = [datetime]::ParseExact(($se.Groups[1].Value -replace '%3A', ':'), "yyyy-MM-ddTHH:mm:ssZ", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
    if ($fim -gt $Agora) { return $true }
  }
  return $false
}

# Bytes como texto duas vezes: Latin1 (1 byte = 1 caractere, pega ASCII/UTF-8) e UTF-16LE (literais de string em DLL .NET).
function Get-AchadosNoConteudo([byte[]] $Bytes, [string] $Arquivo) {
  $tipos = @()
  $textos = @([Text.Encoding]::GetEncoding(28591).GetString($Bytes), [Text.Encoding]::Unicode.GetString($Bytes))
  foreach ($p in $script:PadroesSegredo.GetEnumerator()) {
    $achou = if ($p.Key -eq "sig") { @($textos | Where-Object { Test-SigVigente $_ }).Count } else { @($textos | Where-Object { $_ -match $p.Value }).Count }
    if ($achou) { $tipos += $p.Key }
  }
  # Variavel de ambiente com nome de segredo e valor padrao: o valor padrao viaja na solucao para todo ambiente.
  if ($Arquivo -match '(?i)(^|/)environmentvariabledefinitions/([^/]+)/environmentvariabledefinition\.xml$' -and $Matches[2] -match $script:NomeVariavelSecreta) {
    if ($textos[0] -match '(?i)<defaultvalue>\s*[^<\s][^<]*</defaultvalue>') { $tipos += "variavel-secreta" }
  }
  return $tipos
}

function Find-SegredosNoZip([IO.Compression.ZipArchive] $Zip, [string] $Solucao, [string] $Prefixo) {
  $achados = @()
  foreach ($e in $Zip.Entries) {
    if (-not $e.Name) { continue }
    $nome = "$Prefixo$($e.FullName)"
    $ms = New-Object IO.MemoryStream
    $s = $e.Open()
    try { $s.CopyTo($ms) } finally { $s.Dispose() }
    if ($e.FullName -match $script:ExtensoesZip) {
      $ms.Position = 0
      $interno = $null
      try { $interno = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Read) } catch { $interno = $null }
      if ($interno) {
        try { $achados += @(Find-SegredosNoZip $interno $Solucao "$nome!/") } finally { $interno.Dispose() }
        continue
      }
    }
    foreach ($t in @(Get-AchadosNoConteudo ($ms.ToArray()) $e.FullName)) {
      $achados += [pscustomobject]@{ solucao = $Solucao; arquivo = $nome; tipo = $t }
    }
  }
  return $achados
}

# Solucao pelo nome do arquivo (<Nome>_managed.zip, como o export grava).
function Find-SegredosNoPacote([string] $ZipPath) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $solucao = [IO.Path]::GetFileNameWithoutExtension($ZipPath) -replace '_managed$', ''
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try { return @(Find-SegredosNoZip $zip $solucao "") } finally { $zip.Dispose() }
}

# Le e valida a lista de excecoes. Entrada vencida (ate < hoje) nao vale. sk-ant e entra recusam a lista inteira.
function Get-SegredosPermitidos([string] $Arquivo, [datetime] $Hoje = (Get-Date).Date) {
  if (-not $Arquivo -or -not (Test-Path -LiteralPath $Arquivo -PathType Leaf)) { return @() }
  # Em duas linhas: no 5.1, @(... | ConvertFrom-Json) de um array JSON vira um item so (o array inteiro).
  $json = ConvertFrom-Json (Get-Content -Raw -Encoding UTF8 -LiteralPath $Arquivo)
  $lista = @($json)
  $validas = @()
  foreach ($p in $lista) {
    foreach ($campo in @("solucao", "arquivo", "tipo", "motivo", "ate")) {
      if (-not ($p.PSObject.Properties.Name -contains $campo) -or -not [string] $p.$campo) { throw "segredos-permitidos: entrada sem '$campo'." }
    }
    if ($script:TiposNuncaPermitidos -contains [string] $p.tipo) { throw "segredos-permitidos: tipo '$($p.tipo)' nunca pode ser permitido ($($p.solucao) / $($p.arquivo))." }
    if (-not $script:PadroesSegredo.Contains([string] $p.tipo) -and [string] $p.tipo -ne "variavel-secreta") { throw "segredos-permitidos: tipo desconhecido '$($p.tipo)'." }
    $ate = [datetime]::ParseExact([string] $p.ate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
    if ($ate -lt $Hoje) { Write-Host "[segredos] excecao vencida em $($p.ate), nao vale: $($p.solucao) / $($p.arquivo) / $($p.tipo)"; continue }
    $validas += $p
  }
  return $validas
}

function Test-SegredoPermitido($Achado, $Permitidos) {
  return [bool] @(@($Permitidos) | Where-Object { $_ -and $_.solucao -eq $Achado.solucao -and $_.tipo -eq $Achado.tipo -and $Achado.arquivo -like $_.arquivo }).Count
}

# Varre todo *.zip de $Pasta. Falha (throw) com a lista solucao / arquivo / tipo se sobrar achado fora das excecoes.
function Assert-PacotesSemSegredo([string] $Pasta, [string] $Permitidos = (Join-Path $PSScriptRoot "segredos-permitidos.json")) {
  $excecoes = @(Get-SegredosPermitidos $Permitidos)
  $bloqueios = @(); $tolerados = 0; $zips = @(Get-ChildItem -LiteralPath $Pasta -Filter *.zip -File)
  foreach ($z in $zips) {
    foreach ($a in @(Find-SegredosNoPacote $z.FullName)) {
      if (Test-SegredoPermitido $a $excecoes) { $tolerados++; Write-Host "[segredos] excecao: $($a.solucao) / $($a.arquivo) / $($a.tipo)" }
      else { $bloqueios += $a }
    }
  }
  foreach ($b in $bloqueios) { Write-Host "::error title=Segredo no pacote::$($b.solucao) / $($b.arquivo) / $($b.tipo)" }
  if ($bloqueios.Count) {
    throw "Trava de segredos: $($bloqueios.Count) achado(s) nos pacotes (lista acima, sem valores). Tire o segredo do DEV (valor padrao de variavel vira valor atual em cada ambiente) e exporte de novo. Nada foi enviado."
  }
  Write-Host "[segredos] $($zips.Count) pacote(s) sem segredo; $tolerados excecao(oes) de segredos-permitidos.json"
}
