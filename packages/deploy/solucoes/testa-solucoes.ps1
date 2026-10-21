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
