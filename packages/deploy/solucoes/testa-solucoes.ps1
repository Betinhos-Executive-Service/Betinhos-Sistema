# Testa dataverse.ps1 e solucoes.ps1 com respostas simuladas, em StrictMode, sem tocar no Dataverse.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'dataverse.ps1')
. (Join-Path $PSScriptRoot 'solucoes.ps1')

$script:respostas = @()
$script:chamadas = @()
function Invoke-RestMethod {
  param($Method, $Uri, $Headers, $Body, $ContentType)
  $script:chamadas += [pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $Body }
  $r = $script:respostas[0]
  $script:respostas = @($script:respostas | Select-Object -Skip 1)
  return $r
}
$dv = @{ Api = 'https://x/api/data/v9.2'; Url = 'https://x'; Host = 'x'; Headers = @{} }
$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }

# Read-DvAll: uma pagina sem nextLink e duas paginas com nextLink
$script:respostas = @([pscustomobject]@{ value = @(1, 2) })
Confere ((Read-DvAll $dv 'a').Count -eq 2) 'pagina unica sem nextLink'
$script:respostas = @([pscustomobject]@{ value = @(1); '@odata.nextLink' = 'https://x/n' }, [pscustomobject]@{ value = @(2, 3) })
$script:chamadas = @()
Confere ((Read-DvAll $dv 'a').Count -eq 3 -and $script:chamadas[1].Uri -eq 'https://x/n') 'segue nextLink'

# Add-ComponenteNaSolucao: subcomponentes conforme o comportamento
$script:respostas = @($null); $script:chamadas = @()
Add-ComponenteNaSolucao $dv @{ id = 'abc'; tipo = 1; comportamento = 0 } 'BetinhosCore'
$b = $script:chamadas[0].Body | ConvertFrom-Json
Confere ($b.ComponentType -eq 1 -and $b.DoNotIncludeSubcomponents -eq $false -and $b.AddRequiredComponents -eq $false -and $b.SolutionUniqueName -eq 'BetinhosCore') 'tabela com subcomponentes'
$script:respostas = @($null); $script:chamadas = @()
Add-ComponenteNaSolucao $dv @{ id = 'def'; tipo = 1; comportamento = 1 } 'BetinhosCore'
Confere (($script:chamadas[0].Body | ConvertFrom-Json).DoNotIncludeSubcomponents -eq $true) 'tabela sem subcomponentes'

# Remove-ComponenteDaSolucao: a Web API recebe o objectid do componente em SolutionComponent.solutioncomponentid
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ solutionid = 'sid' }) }, [pscustomobject]@{ value = @([pscustomobject]@{ solutioncomponentid = 'linha' }) }, [pscustomobject]@{}); $script:chamadas = @()
Remove-ComponenteDaSolucao $dv 'abc' 381 'BetinhosCore'
$b = $script:chamadas[2].Body | ConvertFrom-Json
Confere ($script:chamadas[2].Uri -like '*/RemoveSolutionComponent' -and $b.SolutionComponent.solutioncomponentid -eq 'abc' -and $b.ComponentType -eq 381 -and $b.SolutionUniqueName -eq 'BetinhosCore') 'remover usa o objectid, o tipo e a solucao'
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ solutionid = 'sid' }) }, [pscustomobject]@{ value = @() }); $script:chamadas = @()
$falhouSemLinha = $false
try { Remove-ComponenteDaSolucao $dv 'abc' 381 'BetinhosCore' } catch { $falhouSemLinha = ($_.Exception.Message -like '*achei 0*') }
Confere ($falhouSemLinha -and $script:chamadas.Count -eq 2) 'remover sem linha na solucao falha sem chamar a acao'

# Remove-ComponenteDaSolucao recusa a caixa de entrada e qualquer solucao fora das 4, sem chamar a API
$script:respostas = @(); $script:chamadas = @()
$recusou = $false
try { Remove-ComponenteDaSolucao $dv 'abc' 381 'AppBetinhos' } catch { $recusou = ($_.Exception.Message -like '*AppBetinhos*') }
Confere ($recusou -and $script:chamadas.Count -eq 0) 'remover da AppBetinhos e recusado antes de chamar a API'
$recusou = $false
try { Remove-ComponenteDaSolucao $dv 'abc' 381 'Default' } catch { $recusou = $true }
Confere ($recusou -and $script:chamadas.Count -eq 0) 'remover de solucao fora das 4 e recusado'

# Get-ExcedentesDasSolucoes: decisao pura do que remover depois que AddSolutionComponent arrasta componentes
$ordem = @('BetinhosCore', 'BetinhosAutomacao', 'BetinhosInterface', 'BetinhosMotoristas')
$linhasExc = @{
  BetinhosCore       = @(@{ id = 'a'; tipo = 1 }, @{ id = 'v'; tipo = 381 }, @{ id = 'x'; tipo = 10161 }, @{ id = 'm'; tipo = 29 })
  BetinhosAutomacao  = @(@{ id = 'f'; tipo = 29 }, @{ id = 'm'; tipo = 29 })
  BetinhosInterface  = @(@{ id = 'a'; tipo = 1 }, @{ id = 'x'; tipo = 10161 }, @{ id = 'y'; tipo = 10161 })
  BetinhosMotoristas = @(@{ id = 'y'; tipo = 10161 })
  AppBetinhos        = @(@{ id = 'a'; tipo = 1 }, @{ id = 'z'; tipo = 61 }, @{ id = 'v'; tipo = 381 })
}
$donoExc = @{ a = 'BetinhosCore'; f = 'BetinhosAutomacao'; m = 'BetinhosCore' }
$exc = @(Get-ExcedentesDasSolucoes $linhasExc $donoExc $ordem @(381))
function Marcado([string] $Solucao, [string] $Id) { return (@($exc | Where-Object { $_.solucao -eq $Solucao -and $_.id -eq $Id }).Count -eq 1) }
Confere (-not (Marcado 'BetinhosCore' 'a') -and -not (Marcado 'BetinhosAutomacao' 'f')) 'dono mantem o componente'
Confere ((Marcado 'BetinhosInterface' 'a') -and (Marcado 'BetinhosAutomacao' 'm') -and -not (Marcado 'BetinhosCore' 'm')) 'quem nao e dono e marcado para remover'
Confere ((Marcado 'BetinhosCore' 'v') -and (@($exc | Where-Object { $_.id -eq 'v' })[0].motivo -like '*proibido*')) 'valor de variavel (381) e marcado mesmo sem dono'
Confere ((Marcado 'BetinhosInterface' 'x') -and -not (Marcado 'BetinhosCore' 'x') -and (Marcado 'BetinhosMotoristas' 'y') -and -not (Marcado 'BetinhosInterface' 'y')) 'copia fora da caixa mantem a camada mais baixa'
Confere (@($exc | Where-Object { $_.solucao -eq 'AppBetinhos' }).Count -eq 0 -and $exc.Count -eq 5) 'AppBetinhos nunca e candidata a remocao'
$recusou = $false
try { Get-ExcedentesDasSolucoes $linhasExc $donoExc @('BetinhosCore', 'AppBetinhos') @(381) | Out-Null } catch { $recusou = ($_.Exception.Message -like '*AppBetinhos*') }
Confere $recusou 'ordem com a AppBetinhos e recusada'

# Get-HashDoPacote: ignora solution.xml e a ordem das entradas; muda quando o conteudo muda
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Novo-Zip([string] $Caminho, [object[]] $Entradas) {
  if (Test-Path $Caminho) { Remove-Item $Caminho }
  $z = [IO.Compression.ZipFile]::Open($Caminho, 'Create')
  try { foreach ($e in $Entradas) { $w = New-Object IO.StreamWriter($z.CreateEntry($e[0]).Open()); $w.Write($e[1]); $w.Dispose() } } finally { $z.Dispose() }
}
$tmp = [IO.Path]::GetTempPath()
Novo-Zip "$tmp\h1.zip" @(@('solution.xml', '<v>1</v>'), @('customizations.xml', 'A'), @('WebResources/x', 'B'))
Novo-Zip "$tmp\h2.zip" @(@('WebResources/x', 'B'), @('customizations.xml', 'A'), @('solution.xml', '<v>2</v>'))
Novo-Zip "$tmp\h3.zip" @(@('solution.xml', '<v>1</v>'), @('customizations.xml', 'A'), @('WebResources/x', 'C'))
Confere ((Get-HashDoPacote "$tmp\h1.zip") -eq (Get-HashDoPacote "$tmp\h2.zip")) 'hash ignora versao e ordem'
Confere ((Get-HashDoPacote "$tmp\h1.zip") -ne (Get-HashDoPacote "$tmp\h3.zip")) 'hash muda com o conteudo'

if ($falhas) { throw "$falhas teste(s) falharam" }
