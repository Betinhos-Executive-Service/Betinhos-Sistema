# Testa Remove-ObsoleteChunks com respostas simuladas, em StrictMode, sem tocar no Dataverse.
param([string] $Script)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. $Script

$script:paginas = @()
$script:chamadas = 0
function Invoke-RestMethod {
  param($Method, $Uri, $Headers)
  if ($Method -ne 'Get') { throw "teste nao deveria chamar $Method" }
  $p = $script:paginas[$script:chamadas]
  $script:chamadas++
  return $p
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

# Caso 3: CSS das telas entra na limpeza; o mantido fica.
$script:paginas = @([pscustomobject]@{ value = @((Recurso 'p.pppppppp.css'), (Recurso 'q.qqqqqqqq.css'), (Recurso 'outro.css')) })
$script:chamadas = 0
$n = Remove-ObsoleteChunks 'https://x/api' @{} $prefix @("${prefix}p.pppppppp.css") -DryRun
if ($n -eq 1) { Write-Host 'ok    CSS com hash: 1 obsoleto, CSS sem hash ignorado' } else { Write-Host "FALHA CSS: n=$n"; $falhas++ }

if ($falhas) { exit 1 }
