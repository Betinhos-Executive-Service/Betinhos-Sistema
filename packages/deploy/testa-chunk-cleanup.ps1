# Testa Remove-ObsoleteChunks, Get-WebResourcesByName e Get-PublishedChunkNames com respostas simuladas,
# em StrictMode, sem tocar no Dataverse.
param([string] $Script)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. $Script

$script:paginas = @()
$script:chamadas = 0
# Com $script:banco (nome -> texto), a resposta sai do filtro "name eq" da consulta; sem ele, da fila de paginas.
$script:banco = $null
# 'erro', 'texto' ou 'pagina': como a consulta com mais de um nome falha (excecao, JSON que volta como texto,
# ou resposta cortada com @odata.nextLink).
$script:loteRuim = ''
function Invoke-RestMethod {
  param($Method, $Uri, $Headers)
  if ($Method -ne 'Get') { throw "teste nao deveria chamar $Method" }
  $script:chamadas++
  if ($null -eq $script:banco) { return $script:paginas[$script:chamadas - 1] }
  $nomes = @([regex]::Matches($Uri, "name eq '((?:[^']|'')+)'") | ForEach-Object { $_.Groups[1].Value.Replace("''", "'") })
  if ($nomes.Count -gt 1 -and $script:loteRuim -eq 'erro') { throw 'lote recusado' }
  if ($nomes.Count -gt 1 -and $script:loteRuim -eq 'texto') { return '{"value":[' }
  $linhas = @($nomes | Where-Object { $script:banco.ContainsKey($_) } | ForEach-Object {
      [pscustomobject]@{ webresourceid = [guid]::NewGuid(); name = $_; webresourcetype = 3; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:banco[$_])) }
    })
  if ($nomes.Count -gt 1 -and $script:loteRuim -eq 'pagina') { return [pscustomobject]@{ value = @($linhas[0]); '@odata.nextLink' = 'https://x/api/next' } }
  return [pscustomobject]@{ value = $linhas }
}

$prefix = 'cr40f_SistemaBetinhos/assets/'
function Recurso($nome) { [pscustomobject]@{ name = "$prefix$nome"; webresourceid = [guid]::NewGuid() } }
$falhas = 0

# Caso 1: uma pagina so, sem @odata.nextLink (o que quebrava no CI).
$script:paginas = @([pscustomobject]@{ value = @((Recurso 'a.aaaaaaaa.js'), (Recurso 'b.bbbbbbbb.js')) })
$script:chamadas = 0
$n = Remove-ObsoleteChunks 'https://x/api' @{} $prefix @("${prefix}a.aaaaaaaa.js") -DryRun
if ($n -eq 1 -and $script:chamadas -eq 1) { Write-Host 'ok    pagina unica sem nextLink: 1 obsoleto' } else { Write-Host "FALHA pagina unica: n=$n chamadas=$($script:chamadas)"; $falhas++ }

# Caso 2: duas paginas, a primeira com @odata.nextLink.
$script:paginas = @(
  [pscustomobject]@{ value = @((Recurso 'a.aaaaaaaa.js')); '@odata.nextLink' = 'https://x/api/next' },
  [pscustomobject]@{ value = @((Recurso 'c.cccccccc.js'), (Recurso 'd.dddddddd.js')) }
)
$script:chamadas = 0
$n = Remove-ObsoleteChunks 'https://x/api' @{} $prefix @("${prefix}a.aaaaaaaa.js") -DryRun
if ($n -eq 2 -and $script:chamadas -eq 2) { Write-Host 'ok    duas paginas seguindo nextLink: 2 obsoletos' } else { Write-Host "FALHA duas paginas: n=$n chamadas=$($script:chamadas)"; $falhas++ }

# Caso 3: build publicado seguido por nivel de import, com ciclo (b -> a) e chunk citado que o ambiente nao tem (z).
$script:banco = @{
  'cr40f_SistemaBetinhos.html' = "<script type=`"module`" src=`"/WebResources/${prefix}a.aaaaaaaa.js`"></script>"
  "${prefix}a.aaaaaaaa.js"     = 'import "./b.bbbbbbbb.js"; import("./c.cccccccc.js")'
  "${prefix}b.bbbbbbbb.js"     = 'import "./d.dddddddd.js"; import "./a.aaaaaaaa.js"'
  "${prefix}c.cccccccc.js"     = ''
  "${prefix}d.dddddddd.js"     = 'import "./z.zzzzzzzz.js"'
  "${prefix}fora.ffffffff.js"  = 'de outro build'
}
$script:chamadas = 0
$nomes = @(Get-PublishedChunkNames 'https://x/api' @{} 'cr40f_SistemaBetinhos.html' $prefix | Sort-Object)
$esperado = @('a.aaaaaaaa.js', 'b.bbbbbbbb.js', 'c.cccccccc.js', 'd.dddddddd.js', 'z.zzzzzzzz.js' | ForEach-Object { "$prefix$_" })
# HTML + 4 niveis (a; b e c; d; z): 5 consultas. Uma por chunk seriam 6.
if (($nomes -join ',') -eq ($esperado -join ',') -and $script:chamadas -eq 5) { Write-Host 'ok    build publicado por nivel: 5 chunks em 5 consultas' } else { Write-Host "FALHA build publicado: $($nomes -join ',') chamadas=$($script:chamadas)"; $falhas++ }

# Caso 4: HTML ausente no ambiente = nenhum chunk, uma consulta.
$script:chamadas = 0
$nomes = @(Get-PublishedChunkNames 'https://x/api' @{} 'nao-existe.html' $prefix)
if ($nomes.Count -eq 0 -and $script:chamadas -eq 1) { Write-Host 'ok    HTML ausente: nenhum chunk' } else { Write-Host "FALHA HTML ausente: n=$($nomes.Count) chamadas=$($script:chamadas)"; $falhas++ }

# Caso 5: 32 nomes em lotes de 15 = 3 consultas; apostrofo no nome e escapado; nome ausente fica fora do mapa.
$script:banco = @{}
$pedidos = @(1..31 | ForEach-Object { "${prefix}n$_.aaaaaaaa.js" }) + @("${prefix}d'agua.js")
foreach ($n in $pedidos) { $script:banco[$n] = "// $n" }
$script:banco.Remove("${prefix}n7.aaaaaaaa.js")
$script:chamadas = 0
$mapa = Get-WebResourcesByName 'https://x/api' @{} $pedidos
$texto = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($mapa["${prefix}d'agua.js"].content))
if ($mapa.Count -eq 31 -and $script:chamadas -eq 3 -and -not $mapa.ContainsKey("${prefix}n7.aaaaaaaa.js") -and $texto -eq "// ${prefix}d'agua.js") { Write-Host 'ok    32 nomes em 3 consultas' } else { Write-Host "FALHA lotes: n=$($mapa.Count) chamadas=$($script:chamadas)"; $falhas++ }

# Casos 6 a 8: lote que falha (excecao, JSON devolvido como texto, ou resposta paginada) e relido um a um,
# sem perder recurso.
foreach ($modo in 'erro', 'texto', 'pagina') {
  $script:loteRuim = $modo
  $script:chamadas = 0
  $mapa = Get-WebResourcesByName 'https://x/api' @{} @($pedidos[0..3]) 3>$null
  # Lote de 4: 1 consulta que falha + 4 individuais.
  if ($mapa.Count -eq 4 -and $script:chamadas -eq 5) { Write-Host "ok    lote com falha ($modo): relido um a um" } else { Write-Host "FALHA lote com falha ($modo): n=$($mapa.Count) chamadas=$($script:chamadas)"; $falhas++ }
}
$script:loteRuim = ''

if ($falhas) { exit 1 }
