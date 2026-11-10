# Testa segredos.ps1 (trava de segredos dos pacotes) com ZIPs sinteticos e segredos falsos, sem tocar no Dataverse.
# Os segredos falsos sao montados em tempo de execucao para o proprio repositorio nao conter nada que pareca segredo.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'segredos.ps1')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }
function Falha-Com([scriptblock] $Bloco) { try { & $Bloco | Out-Null; return $null } catch { return "$($_.Exception.Message)" } }

$raiz = Join-Path ([IO.Path]::GetTempPath()) ("testa-segredos-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $raiz | Out-Null

function Novo-Zip([string] $Caminho, [hashtable] $Entradas) {
  $fs = [IO.File]::Open($Caminho, [IO.FileMode]::Create)
  $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($k in $Entradas.Keys) {
      $s = $zip.CreateEntry($k).Open()
      $b = if ($Entradas[$k] -is [byte[]]) { $Entradas[$k] } else { [Text.Encoding]::UTF8.GetBytes([string] $Entradas[$k]) }
      try { $s.Write($b, 0, $b.Length) } finally { $s.Dispose() }
    }
  } finally { $zip.Dispose(); $fs.Dispose() }
}
function Bytes-Do-Zip([hashtable] $Entradas) { $c = Join-Path $raiz "interno.zip"; Novo-Zip $c $Entradas; $b = [IO.File]::ReadAllBytes($c); Remove-Item $c; return ,$b }

$skAnt = 'sk-' + 'ant-' + 'api03-' + ('x' * 40)
$sig = 'sig=' + ('A1b2C3d4' * 4)
$apikey = 'apikey_' + ('0123456789abcdef' * 2).Substring(0, 20)
$entra = 'abc8Q' + '~' + ('Zz9_.-' * 6)
$varXml = { param($valor) "<environmentvariabledefinition schemaname=`"x`"><defaultvalue>$valor</defaultvalue></environmentvariabledefinition>" }

try {
  # Pacote limpo
  $p = Join-Path $raiz "limpo"; New-Item -ItemType Directory $p | Out-Null
  Novo-Zip (Join-Path $p "BetinhosCore_managed.zip") @{
    "solution.xml" = "<ImportExportXml/>"
    "environmentvariabledefinitions/new_AnthropicKeyFrota/environmentvariabledefinition.xml" = (& $varXml "")
    "environmentvariabledefinitions/new_URLBase/environmentvariabledefinition.xml" = (& $varXml "https://exemplo")
    "WebResources/new_tela1" = "fetch('https://exemplo/api?sig=curta')"
  }
  Confere (@(Find-SegredosNoPacote (Join-Path $p "BetinhosCore_managed.zip")).Count -eq 0) 'pacote limpo: nenhum achado'
  Confere ($null -eq (Falha-Com { Assert-PacotesSemSegredo $p (Join-Path $raiz "nao-existe.json") })) 'pacote limpo passa na trava'

  # Cada padrao, inclusive em ZIP dentro do ZIP (msapp) e em UTF-16 (literal de DLL)
  $s = Join-Path $raiz "sujo"; New-Item -ItemType Directory $s | Out-Null
  Novo-Zip (Join-Path $s "BetinhosCore_managed.zip") @{
    "environmentvariabledefinitions/new_AnthropicKeyAgentes/environmentvariabledefinition.xml" = (& $varXml $skAnt)
    "environmentvariabledefinitions/new_SenhaPortal/environmentvariabledefinition.xml" = (& $varXml "segredo-qualquer")
    "Workflows/fluxo.json" = "{`"uri`":`"https://x/invoke?api-version=1&$sig`"}"
    "PluginAssemblies/a.dll" = [Text.Encoding]::Unicode.GetBytes("const " + $entra)
  }
  Novo-Zip (Join-Path $s "BetinhosInterface_managed.zip") @{
    "WebResources/new_TelaCurriculo1234" = "u='https://x?$sig'"
    "CanvasApps/app.msapp" = (Bytes-Do-Zip @{ "Src/App.pa.yaml" = "k: $apikey" })
  }
  $core = @(Find-SegredosNoPacote (Join-Path $s "BetinhosCore_managed.zip"))
  $tipos = @($core | ForEach-Object { "$($_.arquivo)|$($_.tipo)" })
  Confere ($tipos -contains 'environmentvariabledefinitions/new_AnthropicKeyAgentes/environmentvariabledefinition.xml|sk-ant') 'sk-ant no valor padrao'
  Confere ($tipos -contains 'environmentvariabledefinitions/new_AnthropicKeyAgentes/environmentvariabledefinition.xml|variavel-secreta') 'variavel com Key e valor padrao'
  Confere ($tipos -contains 'environmentvariabledefinitions/new_SenhaPortal/environmentvariabledefinition.xml|variavel-secreta') 'variavel com Senha e valor padrao'
  Confere ($tipos -contains 'Workflows/fluxo.json|sig') 'sig= longa em fluxo'
  Confere ($tipos -contains 'PluginAssemblies/a.dll|entra') 'segredo do Entra em UTF-16 dentro de DLL'
  Confere ($core.Count -eq 5 -and @($core | Where-Object { $_.solucao -ne 'BetinhosCore' }).Count -eq 0) 'solucao pelo nome do arquivo, 5 achados'
  $int = @(Find-SegredosNoPacote (Join-Path $s "BetinhosInterface_managed.zip"))
  Confere (@($int | Where-Object { $_.arquivo -eq 'CanvasApps/app.msapp!/Src/App.pa.yaml' -and $_.tipo -eq 'apikey' }).Count -eq 1) 'apikey_ dentro do msapp (ZIP no ZIP)'

  # SAS do Azure Storage: vencida nao conta, vigente conta; URL de flow sem se= sempre conta
  $sasVencida = "https://x.blob.core.windows.net/c/a.png?skt=2026-04-29T14%3A23%3A40Z&sv=2023-01-03&se=2026-04-30T14%3A38%3A40Z&sr=b&sp=r&$sig"
  $sasVigente = "https://x.blob.core.windows.net/c/a.png?sv=2023-01-03&se=2999-01-01T00:00:00Z&sr=b&sp=r&$sig"
  Confere (-not (Test-SigVigente "{`"Path`":`"$sasVencida`"}")) 'SAS vencida nao conta'
  Confere (Test-SigVigente "{`"Path`":`"$sasVigente`"}") 'SAS vigente conta'
  Confere (Test-SigVigente "{`"a`":`"$sasVencida`",`"b`":`"https://f/invoke?api-version=1&$sig`"}") 'URL de flow ao lado de SAS vencida conta'

  # A falha lista solucao / arquivo / tipo e nunca o valor
  $saida = @(& { try { Assert-PacotesSemSegredo $s (Join-Path $raiz "nao-existe.json") } catch { "THROW $($_.Exception.Message)" } } 6>&1 | ForEach-Object { [string] $_ }) -join "`n"
  Confere ($saida -match 'THROW Trava de segredos: 7 achado') 'trava falha com 7 achados sem excecoes'
  Confere ($saida -match 'BetinhosCore / environmentvariabledefinitions/new_AnthropicKeyAgentes/environmentvariabledefinition.xml / sk-ant') 'lista solucao / arquivo / tipo'
  Confere (-not $saida.Contains($skAnt) -and -not $saida.Contains($sig) -and -not $saida.Contains($apikey) -and -not $saida.Contains($entra) -and -not $saida.Contains('segredo-qualquer')) 'nenhum valor na saida'

  # Excecoes: sig da tela legada permitida; o resto continua bloqueando
  $perm = Join-Path $raiz "permitidos.json"
  '[{"solucao":"BetinhosInterface","arquivo":"WebResources/new_TelaCurriculo*","tipo":"sig","motivo":"teste","ate":"2999-01-01"}]' | Set-Content -Encoding UTF8 $perm
  $saida = @(& { try { Assert-PacotesSemSegredo $s $perm } catch { "THROW $($_.Exception.Message)" } } 6>&1 | ForEach-Object { [string] $_ }) -join "`n"
  Confere ($saida -match 'THROW Trava de segredos: 6 achado' -and $saida -match 'excecao: BetinhosInterface / WebResources/new_TelaCurriculo1234 / sig') 'excecao tira so a entrada permitida'
  $soInterface = Join-Path $raiz "so-interface"; New-Item -ItemType Directory $soInterface | Out-Null
  Novo-Zip (Join-Path $soInterface "BetinhosInterface_managed.zip") @{ "WebResources/new_TelaCurriculo1234" = "u='https://x?$sig'" }
  Confere ($null -eq (Falha-Com { Assert-PacotesSemSegredo $soInterface $perm })) 'pacote so com a excecao passa'
  '[{"solucao":"BetinhosCore","arquivo":"WebResources/new_TelaCurriculo*","tipo":"sig","motivo":"teste","ate":"2999-01-01"}]' | Set-Content -Encoding UTF8 $perm
  Confere ($null -ne (Falha-Com { Assert-PacotesSemSegredo $soInterface $perm })) 'excecao de outra solucao nao vale'
  '[{"solucao":"BetinhosInterface","arquivo":"WebResources/new_TelaCurriculo*","tipo":"sig","motivo":"teste","ate":"2000-01-01"}]' | Set-Content -Encoding UTF8 $perm
  Confere ($null -ne (Falha-Com { Assert-PacotesSemSegredo $soInterface $perm })) 'excecao vencida nao vale'
  foreach ($t in @('sk-ant', 'entra')) {
    "[{`"solucao`":`"BetinhosCore`",`"arquivo`":`"*`",`"tipo`":`"$t`",`"motivo`":`"teste`",`"ate`":`"2999-01-01`"}]" | Set-Content -Encoding UTF8 $perm
    Confere ((Falha-Com { Get-SegredosPermitidos $perm }) -like "*nunca pode ser permitido*") "$t nunca pode ser permitido"
  }
  '[{"solucao":"BetinhosCore","arquivo":"*","tipo":"sig","ate":"2999-01-01"}]' | Set-Content -Encoding UTF8 $perm
  Confere ((Falha-Com { Get-SegredosPermitidos $perm }) -like "*sem 'motivo'*") 'excecao sem motivo e recusada'

  # A lista versionada e valida e so tem sig
  $versionada = @(Get-SegredosPermitidos (Join-Path $PSScriptRoot 'segredos-permitidos.json') ([datetime] '2026-11-10'))
  Confere ($versionada.Count -eq 2 -and @($versionada | Where-Object { $_.tipo -ne 'sig' }).Count -eq 0) 'segredos-permitidos.json: 2 excecoes sig'
}
finally { Remove-Item -Recurse -Force $raiz -ErrorAction SilentlyContinue }

if ($falhas) { Write-Host "$falhas falha(s)"; exit 1 }
Write-Host "todos os testes de segredos passaram"
