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
  # Erro simulado: Exception ou ErrorRecord (este leva o corpo da resposta em ErrorDetails, como o Invoke-RestMethod real).
  if ($r -is [Exception] -or $r -is [Management.Automation.ErrorRecord]) { throw $r }
  return $r
}
$dv = @{ Api = 'https://x/api/data/v9.2'; Url = 'https://org23b93544.crm2.dynamics.com'; Host = 'org23b93544.crm2.dynamics.com'; Headers = @{} }
$dvTest = @{ Api = 'https://t/api/data/v9.2'; Url = 'https://appbetinhostest.crm2.dynamics.com'; Host = 'appbetinhostest.crm2.dynamics.com'; Headers = @{} }
$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }
function Falha-Com([scriptblock] $Bloco) { try { & $Bloco | Out-Null; return $null } catch { return "$($_.Exception.Message)" } }

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
Confere ((Falha-Com { Remove-ComponenteDaSolucao $dv 'abc' 381 'BetinhosCore' }) -like '*achei 0*' -and $script:chamadas.Count -eq 2) 'remover sem linha na solucao falha sem chamar a acao'

# Remove-ComponenteDaSolucao recusa a caixa de entrada e qualquer solucao fora das 4, sem chamar a API
$script:respostas = @(); $script:chamadas = @()
Confere ((Falha-Com { Remove-ComponenteDaSolucao $dv 'abc' 381 'AppBetinhos' }) -like '*AppBetinhos*' -and $script:chamadas.Count -eq 0) 'remover da AppBetinhos e recusado antes de chamar a API'
Confere ($null -ne (Falha-Com { Remove-ComponenteDaSolucao $dv 'abc' 381 'Default' }) -and $script:chamadas.Count -eq 0) 'remover de solucao fora das 4 e recusado'

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
Confere ((Falha-Com { Get-ExcedentesDasSolucoes $linhasExc $donoExc @('BetinhosCore', 'AppBetinhos') @(381) }) -like '*AppBetinhos*') 'ordem com a AppBetinhos e recusada'

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
Novo-Zip "$tmp\h4.zip" @(, @('a', 'bX'))
Novo-Zip "$tmp\h5.zip" @(, @('ab', 'X'))
Confere ((Get-HashDoPacote "$tmp\h4.zip") -ne (Get-HashDoPacote "$tmp\h5.zip")) 'hash separa o nome da entrada do conteudo'

# Get-ContagemRegistros: FetchXML exato; so o limite de agregacao cai na contagem paginada (exata); o resto falha alto
function Novo-Erro([string] $Mensagem, [string] $Corpo) {
  $er = New-Object Management.Automation.ErrorRecord (New-Object Exception $Mensagem), 'http', 'NotSpecified', $null
  if ($Corpo) { $er.ErrorDetails = New-Object Management.Automation.ErrorDetails $Corpo }
  return $er
}
$ent = [pscustomobject]@{ LogicalName = 'cr40f_x'; EntitySetName = 'cr40f_xs'; PrimaryIdAttribute = 'cr40f_xid' }

$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ n = 42 }) }); $script:chamadas = @()
$c = Get-ContagemRegistros $dv $ent
$fx = [uri]::UnescapeDataString($script:chamadas[0].Uri)
Confere ($c.Total -eq 42 -and $c.Total -is [int] -and -not $c.Paginada -and $script:chamadas.Count -eq 1) 'contagem: resposta normal devolve o numero'
Confere ($fx -like 'https://x/api/data/v9.2/cr40f_xs?fetchXml=*' -and $fx -like "*<entity name='cr40f_x'>*" -and $fx -like "*<attribute name='cr40f_xid' alias='n' aggregate='count'/>*") 'contagem: FetchXML agregado na tabela certa'
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ n = 0 }) })
Confere ((Get-ContagemRegistros $dv $ent).Total -eq 0) 'contagem: tabela vazia devolve 0'

$script:respostas = @((Novo-Erro 'AggregateQueryRecordLimit exceeded. Cannot perform this operation.' ''), [pscustomobject]@{ value = @(1..5000); '@odata.nextLink' = 'https://x/n' }, [pscustomobject]@{ value = @(1..1234) }); $script:chamadas = @()
$c = Get-ContagemRegistros $dv $ent
Confere ($c.Total -eq 6234 -and $c.Paginada -and $script:chamadas.Count -eq 3 -and $script:chamadas[1].Uri -eq 'https://x/api/data/v9.2/cr40f_xs?$select=cr40f_xid' -and $script:chamadas[2].Uri -eq 'https://x/n') 'contagem: limite de agregacao (mensagem) conta paginando os ids, exato'
$script:respostas = @((Novo-Erro 'O servidor remoto retornou um erro: (400) Solicitacao Incorreta.' '{"error":{"code":"0x8004E023","message":"The maximum record limit is exceeded."}}'), [pscustomobject]@{ value = @(1..7) }); $script:chamadas = @()
$c = Get-ContagemRegistros $dv $ent
Confere ($c.Total -eq 7 -and $c.Paginada -and $script:chamadas.Count -eq 2) 'contagem: limite de agregacao (codigo 0x8004E023 no corpo) tambem pagina'

$script:respostas = @((Novo-Erro 'O servidor remoto retornou um erro: (403) Proibido.' '{"error":{"code":"0x80040220","message":"Principal user is missing prvReadcr40f_x privilege"}}'), [pscustomobject]@{ value = @(1..7) }); $script:chamadas = @()
$msg = Falha-Com { Get-ContagemRegistros $dv $ent }
Confere ($msg -like '*cr40f_x*' -and $msg -like '*(403)*' -and $msg -like '*prvReadcr40f_x*' -and $script:chamadas.Count -eq 1) 'contagem: 403 falha com tabela e corpo, sem cair na paginacao'
foreach ($ruim in @((Novo-Erro 'O servidor remoto retornou um erro: (429) Muitas solicitacoes.' '{"error":{"message":"Number of requests exceeded the limit"}}'), (Novo-Erro 'O servidor remoto retornou um erro: (503) Servico indisponivel.' ''), (New-Object Exception 'A operacao atingiu o tempo limite'))) {
  $script:respostas = @($ruim, [pscustomobject]@{ value = @(1..7) }); $script:chamadas = @()
  $msg = Falha-Com { Get-ContagemRegistros $dv $ent }
  $rotulo = if ($ruim -is [Management.Automation.ErrorRecord]) { $ruim.Exception.Message } else { $ruim.Message }
  Confere ($msg -like 'Contagem de cr40f_x falhou:*' -and $script:chamadas.Count -eq 1) "contagem: erro '$rotulo' falha alto, sem paginar"
}

foreach ($forma in @([pscustomobject]@{ foo = 1 }, [pscustomobject]@{ value = @() }, [pscustomobject]@{ value = @([pscustomobject]@{ x = 1 }) }, [pscustomobject]@{ value = @([pscustomobject]@{ n = 1 }, [pscustomobject]@{ n = 2 }) }, $null)) {
  $script:respostas = @($forma); $script:chamadas = @()
  $msg = Falha-Com { Get-ContagemRegistros $dv $ent }
  Confere ($msg -like 'Contagem de cr40f_x voltou num formato inesperado*') "contagem: resposta fora do formato falha alto ($(if ($null -eq $forma) { 'nula' } else { ConvertTo-Json -InputObject $forma -Depth 3 -Compress }))"
}

$script:respostas = @((Novo-Erro 'AggregateQueryRecordLimit exceeded.' ''), (Novo-Erro 'O servidor remoto retornou um erro: (500) Erro interno.' '{"error":{"message":"boom"}}')); $script:chamadas = @()
$msg = Falha-Com { Get-ContagemRegistros $dv $ent }
Confere ($msg -like 'Contagem paginada de cr40f_x falhou:*' -and $msg -like '*boom*') 'contagem: erro durante a paginacao falha alto com tabela e corpo'

# Escritas em solucao so no DEV: com outro host, recusa antes de qualquer chamada
foreach ($escrita in @(
    @{ nome = 'incluir'; bloco = { Add-ComponenteNaSolucao $dvTest @{ id = 'abc'; tipo = 1; comportamento = 0 } 'BetinhosCore' } },
    @{ nome = 'remover'; bloco = { Remove-ComponenteDaSolucao $dvTest 'abc' 1 'BetinhosCore' } },
    @{ nome = 'criar solucao'; bloco = { New-SolucaoSeFaltar $dvTest 'BetinhosCore' 'pub' } })) {
  $script:respostas = @([pscustomobject]@{ value = @() }, $null); $script:chamadas = @()
  $msg = Falha-Com $escrita.bloco
  Confere ($msg -like '*so e permitido no DEV*appbetinhostest*' -and $script:chamadas.Count -eq 0) "escrita fora do DEV recusada sem chamar a API: $($escrita.nome)"
}

# Get-DependenciasAusentes: base, dependente e tabela pai (do Dataverse ou resolvida pela metadata, lida uma vez so)
$active = 'FD140AAE-4DF4-11DD-BD17-0019B9312238'
$zero = '00000000-0000-0000-0000-000000000000'
function Nova-Dep($Req, $Tipo, $Pai, $Base) { [pscustomobject]@{ requiredcomponentobjectid = $Req; requiredcomponenttype = $Tipo; requiredcomponentparentid = $Pai; requiredcomponentbasesolutionid = $Base; dependentcomponentobjectid = 'DEP'; dependentcomponenttype = 92 } }
$script:respostas = @(
  [pscustomobject]@{ value = @((Nova-Dep 'A1' 2 'T1' $active), (Nova-Dep 'A2' 2 $zero $active), (Nova-Dep 'F1' 60 $zero $active), (Nova-Dep 'R1' 10 $zero $active), (Nova-Dep 'X1' 1 $zero 'FD140AAD-4DF4-11DD-BD17-0019B9312238'), (Nova-Dep 'A9' 2 $zero $active)) },
  [pscustomobject]@{ value = @([pscustomobject]@{ LogicalName = 'cr40f_t2'; MetadataId = 'T2'; Attributes = @([pscustomobject]@{ LogicalName = 'cr40f_a2'; MetadataId = 'A2' }) }) },
  [pscustomobject]@{ value = @([pscustomobject]@{ objecttypecode = 'cr40f_t2' }) })
$script:chamadas = @()
$deps = @(Get-DependenciasAusentes $dv 'BetinhosAutomacao')
function Dep([string] $Id) { return @($deps | Where-Object { $_.requerido -eq $Id })[0] }
Confere ($deps.Count -eq 6 -and (Dep 'a1').base -eq 'fd140aae-4df4-11dd-bd17-0019b9312238' -and (Dep 'a1').dependente -eq 'dep' -and (Dep 'a1').tipoDependente -eq 92) 'dependencias: ids em minusculo, base e dependente'
Confere ((Dep 'a1').pai -eq 't1' -and $script:chamadas[1].Uri -like '*EntityDefinitions*') 'dependencias: pai informado pelo Dataverse e usado'
Confere ((Dep 'a2').pai -eq 't2' -and (Dep 'f1').pai -eq 't2' -and $script:chamadas[2].Uri -like '*systemforms*formid eq f1*') 'dependencias: atributo e formulario sem pai resolvidos pela metadata'
Confere ($null -eq (Dep 'r1').pai -and $null -eq (Dep 'x1').pai -and $null -eq (Dep 'a9').pai -and (Dep 'x1').base -eq 'fd140aad-4df4-11dd-bd17-0019b9312238') 'dependencias: relacionamento sem pai e atributo desconhecido ficam sem pai'
Confere ($script:chamadas.Count -eq 3) 'dependencias: metadata das tabelas lida uma vez so'
$script:respostas = @([pscustomobject]@{ value = @((Nova-Dep 'A2' 2 $zero $active)) }); $script:chamadas = @()
$deps = @(Get-DependenciasAusentes $dv 'BetinhosInterface')
Confere ($deps[0].pai -eq 't2' -and $script:chamadas.Count -eq 1) 'dependencias: metadata reaproveitada entre solucoes do mesmo ambiente'
# Cache zerado: com ele cheio, ler a metadata sem precisar passaria despercebido.
$script:MetadataPorHost = @{}
$script:respostas = @([pscustomobject]@{ value = @((Nova-Dep 'T9' 1 $zero $active)) }); $script:chamadas = @()
$deps = @(Get-DependenciasAusentes $dv 'BetinhosCore')
Confere ($deps.Count -eq 1 -and $script:chamadas.Count -eq 1) 'dependencias: sem subcomponente sem pai, nao le a metadata'

# Initialize-ArquivoDeSaida: caminho absoluto pelo $PWD, arquivo antigo apagado, pasta criada
$base = Join-Path ([IO.Path]::GetTempPath()) ("testa-solucoes-" + [guid]::NewGuid())
New-Item -ItemType Directory $base | Out-Null
Push-Location $base
try {
  $saida = Initialize-ArquivoDeSaida 'sub\foto.json'
  Confere ($saida -eq (Join-Path $base 'sub\foto.json') -and (Test-Path -LiteralPath (Join-Path $base 'sub') -PathType Container) -and -not (Test-Path -LiteralPath $saida)) 'saida: relativo resolvido pelo $PWD e pasta criada'
  [IO.File]::WriteAllText($saida, 'velho')
  $saida = Initialize-ArquivoDeSaida 'sub\foto.json'
  Confere (-not (Test-Path -LiteralPath $saida)) 'saida: arquivo antigo apagado antes de gravar'
  Confere ((Falha-Com { Initialize-ArquivoDeSaida 'sub' }) -like '*e uma pasta*') 'saida: pasta no lugar do arquivo falha'
} finally { Pop-Location }

# pac: alvo sempre por --environment, conferido com pac org who; o perfil global nunca decide
$script:pac = @()
$script:pacWho = @('Connected as noreply', '  Org URL:                    https://org23b93544.crm2.dynamics.com/')
$script:pacWhoCodigo = 0
$script:pacCodigo = 0
$script:pacExport = 'gera'
$script:pacManifesto = @('BetinhosCore', '1.0.0.3', '1')
function Manifesto([string[]] $M) { return "<ImportExportXml><SolutionManifest><UniqueName>$($M[0])</UniqueName><Version>$($M[1])</Version><Managed>$($M[2])</Managed></SolutionManifest></ImportExportXml>" }
function pac {
  $script:pac += , @($args | ForEach-Object { [string] $_ })
  if ($args[0] -eq 'org') { $global:LASTEXITCODE = $script:pacWhoCodigo; return $script:pacWho }
  if ($args[0] -eq 'solution' -and $args[1] -eq 'export') {
    $caminho = $args[[array]::IndexOf($args, '--path') + 1]
    if ($script:pacExport -eq 'gera') { Novo-Zip $caminho @(@('solution.xml', (Manifesto $script:pacManifesto)), @('customizations.xml', 'A')) }
    $global:LASTEXITCODE = if ($script:pacExport -eq 'falha') { 1 } else { 0 }
    return 'export'
  }
  $global:LASTEXITCODE = $script:pacCodigo
  return 'saida simulada do pac'
}
$devUrl = 'https://org23b93544.crm2.dynamics.com'
Confere ($null -eq (Falha-Com { Assert-PacAmbiente $devUrl }) -and ($script:pac[0] -join ' ') -eq "org who --environment $devUrl") 'pac: org who com --environment confere o host'
$script:pacWho = @('Connected as noreply', '  Org URL:                    https://orgf261ae8e.crm2.dynamics.com/')
Confere ((Falha-Com { Assert-PacAmbiente $devUrl }) -like '*outro ambiente*orgf261ae8e*') 'pac: org who de outro ambiente falha'
$script:pacWho = @('Connected as noreply')
Confere ((Falha-Com { Assert-PacAmbiente $devUrl }) -like '*outro ambiente*') 'pac: org who sem URL falha'
$script:pacWho = @('Error: sem perfil'); $script:pacWhoCodigo = 1
Confere ((Falha-Com { Assert-PacAmbiente $devUrl }) -like '*falhou (codigo 1)*') 'pac: org who com erro falha'
$script:pacWhoCodigo = 0
$script:pacWho = @('Connected as noreply', '  Org URL:                    https://orgf261ae8e.crm2.dynamics.com/'); $script:pac = @()
Confere ((Falha-Com { Invoke-Pac $devUrl @('solution', 'delete', '--solution-name', 'AppBetinhos') }) -like '*outro ambiente*' -and $script:pac.Count -eq 1) 'pac: comando nao roda se o org who apontar outro ambiente'
$script:pacWho = @('  Org URL: https://org23b93544.crm2.dynamics.com/'); $script:pac = @()
Invoke-Pac $devUrl @('solution', 'online-version', '--solution-name', 'BetinhosCore', '--solution-version', '1.0.0.4') | Out-Null
Confere ($script:pac.Count -eq 2 -and ($script:pac[1] -join ' ') -eq "solution online-version --solution-name BetinhosCore --solution-version 1.0.0.4 --environment $devUrl") 'pac: comando recebe --environment da URL'
$script:pac = @()
Confere ((Falha-Com { Invoke-Pac $devUrl @('solution', 'delete', '--environment', 'https://orgf261ae8e.crm2.dynamics.com', '--solution-name', 'X') }) -like '*acrescenta --environment sozinho*' -and $script:pac.Count -eq 0) 'pac: --environment nos argumentos e recusado sem chamar o pac'
$script:pacCodigo = 1
Confere ((Falha-Com { Invoke-Pac $devUrl @('solution', 'delete', '--solution-name', 'X') }) -like '*falhou em*codigo 1*') 'pac: codigo diferente de 0 falha'
$script:pacCodigo = 0

# Export-SolucaoGerenciada: apaga o ZIP antigo, exige o arquivo novo e confere UniqueName, versao e Managed
$zipExp = Join-Path $base 'zips\BetinhosCore_managed.zip'
$versaoDv = [pscustomobject]@{ value = @([pscustomobject]@{ version = '1.0.0.3' }) }
New-Item -ItemType Directory (Split-Path $zipExp) | Out-Null
Novo-Zip $zipExp @(, @('solution.xml', (Manifesto @('BetinhosCore', '1.0.0.3', '1'))))
$script:pacExport = 'nada'; $script:respostas = @($versaoDv); $script:pac = @()
$msg = Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }
Confere ($msg -like '*saiu com 0 mas nao gerou*' -and -not (Test-Path -LiteralPath $zipExp)) 'export: ZIP antigo apagado; export que sai 0 sem arquivo falha'
$script:pacExport = 'gera'; $script:respostas = @($versaoDv); $script:pac = @()
$r = Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp
Confere ($r.Versao -eq '1.0.0.3' -and $r.Caminho -eq $zipExp -and ($script:pac[1] -join ' ') -eq "solution export --name BetinhosCore --managed --path $zipExp --async --environment $devUrl") 'export: ZIP certo passa, com --managed e --environment'
$script:pacManifesto = @('BetinhosCore', '1.0.0.2', '1'); $script:respostas = @($versaoDv)
Confere ((Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }) -like '*versao*1.0.0.2*esperada 1.0.0.3*') 'export: versao diferente da do ambiente falha'
$script:pacManifesto = @('BetinhosAutomacao', '1.0.0.3', '1'); $script:respostas = @($versaoDv)
Confere ((Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }) -like '*UniqueName*BetinhosAutomacao*') 'export: outra solucao no ZIP falha'
$script:pacManifesto = @('BetinhosCore', '1.0.0.3', '0'); $script:respostas = @($versaoDv)
Confere ((Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }) -like '*gerenciada False*') 'export: ZIP nao gerenciado falha'
$script:pacManifesto = @('BetinhosCore', '1.0.0.3', '1'); $script:pacExport = 'falha'; $script:respostas = @($versaoDv)
Confere ((Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }) -like '*falhou em*') 'export: pac com erro falha'
$script:pacExport = 'gera'; $script:respostas = @([pscustomobject]@{ value = @() }); $script:pac = @()
Confere ((Falha-Com { Export-SolucaoGerenciada $dv 'BetinhosCore' $zipExp }) -like '*nao encontrada*' -and $script:pac.Count -eq 0) 'export: solucao inexistente falha antes do pac'
Remove-Item -LiteralPath $base -Recurse -Force

# Steps sensiveis: situacao por nome (existe, quantos, seguro)
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ _sdkmessageprocessingstepsecureconfigid_value = 'cfg' }) }, [pscustomobject]@{ value = @([pscustomobject]@{ _sdkmessageprocessingstepsecureconfigid_value = $null }) }, [pscustomobject]@{ value = @() }, [pscustomobject]@{ value = @([pscustomobject]@{ _sdkmessageprocessingstepsecureconfigid_value = 'a' }, [pscustomobject]@{ _sdkmessageprocessingstepsecureconfigid_value = 'b' }) })
$sit = Get-SituacaoStepsSeguros $dv @('ok', 'sem', 'falta', 'dois')
Confere ($sit['ok'].existe -and $sit['ok'].seguro -and $sit['sem'].existe -and -not $sit['sem'].seguro -and -not $sit['falta'].existe -and $sit['falta'].steps -eq 0 -and $sit['dois'].steps -eq 2 -and -not $sit['dois'].seguro) 'steps sensiveis: existe, quantos e seguro por nome'
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ _sdkmessageprocessingstepsecureconfigid_value = 'cfg' }) }, [pscustomobject]@{ value = @() })
$sem = @(Get-StepsSemConfigSegura $dv @('ok', 'falta'))
Confere ($sem.Count -eq 1 -and $sem[0] -eq 'falta (0 step(s))') 'steps sem configuracao segura listados com a contagem'

# Assert-CoberturaDaFoto: todo fluxo e step das solucoes com estado na foto; foto sem componentes falha
$fotoOk = @{ componentes = @{ c1 = @('BetinhosCore') }; fluxos = @{ f1 = @{} }; steps = @{ s1 = @{} } }
Confere ($null -eq (Falha-Com { Assert-CoberturaDaFoto $fotoOk @{ f1 = $true } @{ s1 = $true } })) 'foto: cobertura completa passa'
$msg = Falha-Com { Assert-CoberturaDaFoto $fotoOk @{ f1 = $true; f2 = $true } @{ s1 = $true; s9 = $true } }
Confere ($msg -like '*fluxos*(1): f2*' -and $msg -like '*steps*(1): s9*') 'foto: fluxo e step sem estado falham com os ids'
Confere ((Falha-Com { Assert-CoberturaDaFoto @{ componentes = @{}; fluxos = @{}; steps = @{} } @{} @{} }) -like '*0 componentes*') 'foto: 0 componentes falha'

# Publicacao no TEST: versao seguinte, solucoes escolhidas na ordem de import e import so no TEST
Confere ((Get-VersaoSeguinte '1.0.0.4') -eq '1.0.0.5' -and (Get-VersaoSeguinte '2.1.0.99') -eq '2.1.0.100') 'versao seguinte sobe a revisao'
Confere ((Falha-Com { Get-VersaoSeguinte '1.0' }) -like '*fora do formato*') 'versao fora do formato falha'
Confere ((@(Get-SolucoesEscolhidas '') -join ',') -eq 'BetinhosCore,BetinhosAutomacao,BetinhosInterface,BetinhosMotoristas') 'lista vazia = as 4 na ordem'
Confere ((@(Get-SolucoesEscolhidas ' BetinhosMotoristas, BetinhosCore ') -join ',') -eq 'BetinhosCore,BetinhosMotoristas') 'lista escolhida volta na ordem de import'
Confere ((Falha-Com { Get-SolucoesEscolhidas 'AppBetinhos' }) -like '*fora das 4*AppBetinhos*') 'solucao fora das 4 falha'
Confere ($null -eq (Falha-Com { Assert-HostTest $dvTest })) 'import: host do TEST passa'
Confere ((Falha-Com { Assert-HostTest @{ Host = 'orgf261ae8e.crm2.dynamics.com' } }) -like '*so e permitido no TEST*') 'import: PROD recusado'
Confere ((Falha-Com { Assert-HostTest $dv }) -like '*so e permitido no TEST*') 'import: DEV recusado'
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ version = '1.0.0.4' }) }, [pscustomobject]@{ value = @([pscustomobject]@{ version = '1.0.0.5' }) })
Confere (Wait-VersaoInstalada $dvTest 'BetinhosCore' '1.0.0.5' 1 0) 'espera a versao chegar depois de o pac perder a conexao'
$script:respostas = @([pscustomobject]@{ value = @([pscustomobject]@{ version = '1.0.0.4' }) })
Confere (-not (Wait-VersaoInstalada $dvTest 'BetinhosCore' '1.0.0.5' 0 0)) 'versao que nao chega devolve falso'
$script:respostas = @([pscustomobject]@{ value = @() })
Confere ($null -eq (Get-VersaoInstalada $dvTest 'BetinhosCore')) 'solucao ausente: versao nula'

if ($falhas) { throw "$falhas teste(s) falharam" }
