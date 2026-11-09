# Testa impressao.ps1 (paralelo, impressao digital do DEV e decisao de export) com respostas simuladas, sem tocar no Dataverse.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'dataverse.ps1')
. (Join-Path $PSScriptRoot 'solucoes.ps1')
. (Join-Path $PSScriptRoot 'impressao.ps1')

$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }
$carregar = @((Join-Path $PSScriptRoot 'dataverse.ps1'), (Join-Path $PSScriptRoot 'solucoes.ps1'))

# --- Invoke-EmParalelo (runspaces reais) ---
$inicio = Get-Date
$r = @(Invoke-EmParalelo -Itens (1..16) -Bloco { param($n, $fator) Start-Sleep -Milliseconds 400; $n * $fator } -Argumentos @(3) -Limite 8)
$segundos = ((Get-Date) - $inicio).TotalSeconds
Confere ($r.Count -eq 16 -and $r[0].Resultado -eq 3 -and $r[15].Resultado -eq 48 -and @($r | Where-Object { $_.Erro }).Count -eq 0) 'paralelo: resultados na ordem dos itens'
# 16 itens de 0,4 s: sequencial seria 6,4 s; com 8 de cada vez, duas levas (>= 0,8 s); sem limite, uma leva so (~0,4 s).
Confere ($segundos -lt 4 -and $segundos -ge 0.75) "paralelo: no maximo 8 por vez ($([math]::Round($segundos, 2)) s)"
$r = @(Invoke-EmParalelo -Itens @(1, 2, 3) -Bloco { param($n) if ($n -eq 2) { throw "falhou $n" }; $n })
Confere ($r[0].Resultado -eq 1 -and $r[1].Erro -like '*falhou 2*' -and $r[2].Resultado -eq 3) 'paralelo: erro de um item nao para os outros'
$r = @(Invoke-EmParalelo -Itens @('a', 'b') -Bloco { param($x) (Get-Command Read-DvAll).Name + (Get-Command Get-Sha256Hex).Name + $x } -Carregar $carregar)
Confere ($r[1].Resultado -eq 'Read-DvAllGet-Sha256Hexb' -and -not $r[1].Erro) 'paralelo: cada runspace carrega os scripts pedidos'
$r = @(Invoke-EmParalelo -Itens @() -Bloco { param($x) $x })
Confere ($r.Count -eq 0) 'paralelo: lista vazia'

# --- Respostas simuladas por rota (padrao -like sobre a URI), para Read-DvAll e para o texto cru ---
$script:ParaleloSequencial = $true
$script:rotas = [ordered]@{}
$script:textos = [ordered]@{}
function Invoke-RestMethod {
  param($Method, $Uri, $Headers, $Body, $ContentType)
  foreach ($k in $script:rotas.Keys) { if ($Uri -like $k) { $v = $script:rotas[$k]; if ($v -is [Exception]) { throw $v }; return [pscustomobject]@{ value = @($v) } } }
  throw "sem rota: $Uri"
}
function Invoke-WebRequest {
  param($Method, $Uri, $Headers, [switch] $UseBasicParsing)
  foreach ($k in $script:textos.Keys) { if ($Uri -like $k) { $v = $script:textos[$k]; if ($v -is [Exception]) { throw $v }; return [pscustomobject]@{ Content = $v } } }
  throw "sem texto: $Uri"
}
$dv = @{ Api = 'https://x/api/data/v9.2'; Url = 'https://org23b93544.crm2.dynamics.com'; Host = 'org23b93544.crm2.dynamics.com'; Headers = @{} }
function Linha($o) { return [pscustomobject] $o }
function Cenario {
  $script:rotas = [ordered]@{
    "*/solutions*uniquename eq 'BetinhosCore'*" = @(Linha @{ solutionid = 'sid' })
    '*/solutioncomponentdefinitions*'           = @(Linha @{ solutioncomponenttype = 10050; primaryentityname = 'customapi' })
    '*/solutioncomponents*sid*'                 = @(
      (Linha @{ objectid = 'T1'; componenttype = 1; rootcomponentbehavior = 0 }), (Linha @{ objectid = 'w1'; componenttype = 61; rootcomponentbehavior = 0 }),
      (Linha @{ objectid = 'r1'; componenttype = 20; rootcomponentbehavior = 0 }), (Linha @{ objectid = 'o1'; componenttype = 9; rootcomponentbehavior = 0 }),
      (Linha @{ objectid = 'c1'; componenttype = 10050; rootcomponentbehavior = 0 }))
    '*/customapis*'                             = @(Linha @{ customapiid = 'c1'; modifiedon = '2026-11-01T10:00:00Z' })
    '*/webresourceset*'                         = @((Linha @{ webresourceid = 'w1'; modifiedon = '2026-11-01T10:00:00Z' }), (Linha @{ webresourceid = 'w9'; modifiedon = '2026-11-02T10:00:00Z' }))
    '*/roles*'                                  = @(Linha @{ roleid = 'r1'; modifiedon = '2026-11-01T10:00:00Z' })
    '*/EntityDefinitions*'                      = @((Linha @{ MetadataId = 't1'; LogicalName = 'cr40f_x'; EntitySetName = 'cr40f_xs'; PrimaryIdAttribute = 'cr40f_xid' }), (Linha @{ MetadataId = 't2'; LogicalName = 'cr40f_y'; EntitySetName = 'cr40f_ys'; PrimaryIdAttribute = 'cr40f_yid' }), (Linha @{ MetadataId = 't3'; LogicalName = 'customapi'; EntitySetName = 'customapis'; PrimaryIdAttribute = 'customapiid' }))
    '*/systemforms*'                            = @((Linha @{ formid = 'f1'; objecttypecode = 'cr40f_x'; modifiedon = '2026-11-01T10:00:00Z' }), (Linha @{ formid = 'f2'; objecttypecode = 'cr40f_y'; modifiedon = '2026-11-01T10:00:00Z' }))
    '*/savedqueryvisualizations*'               = @()
    '*/savedqueries*'                           = @(Linha @{ savedqueryid = 'v1'; returnedtypecode = 'cr40f_x'; modifiedon = '2026-11-01T10:00:00Z' })
    '*/workflows*'                              = @()
  }
  $script:textos = [ordered]@{
    '*/EntityDefinitions(t1)*'                  = 'meta-t1'
    '*/GlobalOptionSetDefinitions(o1)*'         = 'opcoes-o1'
    '*RetrieveRolePrivilegesRole*'              = 'privilegios-r1'
  }
}

Cenario
$base = Get-ImpressaoDigital $dv 'BetinhosCore'
Confere (-not $base.incerto -and $base.valor -match '^[0-9a-f]{64}$') "impressao: certa e com hash ($(@($base.motivos) -join '; '))"
Cenario
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -eq $base.valor) 'impressao: mesma entrada, mesmo valor'
Cenario; $script:rotas['*/webresourceset*'] = @(Linha @{ webresourceid = 'w1'; modifiedon = '2026-11-03T10:00:00Z' })
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: WebResource alterado muda o valor'
Cenario; $script:textos['*/EntityDefinitions(t1)*'] = 'meta-t1-coluna-nova'
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: metadata da tabela (coluna, opcao, relacionamento) muda o valor'
Cenario; $script:rotas['*/systemforms*'] = @(Linha @{ formid = 'f1'; objecttypecode = 'cr40f_x'; modifiedon = '2026-11-04T10:00:00Z' })
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: formulario da tabela alterado muda o valor'
Cenario; $script:textos['*RetrieveRolePrivilegesRole*'] = 'privilegios-r1-mais-um'
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: privilegio do papel muda o valor'
Cenario; $script:textos['*/GlobalOptionSetDefinitions(o1)*'] = 'opcoes-o1-nova'
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: escolha global muda o valor'
Cenario; $script:rotas['*/customapis*'] = @(Linha @{ customapiid = 'c1'; modifiedon = '2026-11-05T10:00:00Z' })
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: componente de tabela (>= 10000) alterado muda o valor'
Cenario; $script:rotas['*/solutioncomponents*sid*'] = @($script:rotas['*/solutioncomponents*sid*'] | Select-Object -Skip 1)
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -ne $base.valor) 'impressao: componente a menos na solucao muda o valor'
Cenario; $script:rotas['*/systemforms*'] = @((Linha @{ formid = 'f1'; objecttypecode = 'cr40f_x'; modifiedon = '2026-11-01T10:00:00Z' }), (Linha @{ formid = 'f2'; objecttypecode = 'cr40f_y'; modifiedon = '2026-11-09T10:00:00Z' }))
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').valor -eq $base.valor) 'impressao: formulario de tabela fora da solucao nao conta'

Cenario; $script:rotas['*/solutioncomponents*sid*'] = @($script:rotas['*/solutioncomponents*sid*']) + @(Linha @{ objectid = 'z1'; componenttype = 999; rootcomponentbehavior = 0 })
$i = Get-ImpressaoDigital $dv 'BetinhosCore'
Confere ($i.incerto -and (@($i.motivos) -join ' ') -like '*tipo 999*') 'impressao: tipo sem leitor fica incerta'
Cenario; $script:textos['*/GlobalOptionSetDefinitions(o1)*'] = New-Object Exception 'rede caiu'
$i = Get-ImpressaoDigital $dv 'BetinhosCore'
Confere ($i.incerto -and (@($i.motivos) -join ' ') -like '*rede caiu*') 'impressao: leitura que falha fica incerta'
Cenario; $script:rotas['*/webresourceset*'] = @()
$i = Get-ImpressaoDigital $dv 'BetinhosCore'
Confere ($i.incerto -and (@($i.motivos) -join ' ') -like '*w1*') 'impressao: componente sem registro fica incerto'
Cenario; $script:rotas['*/roles*'] = New-Object Exception 'sem permissao'
$i = Get-ImpressaoDigital $dv 'BetinhosCore'
Confere ($i.incerto -and (@($i.motivos) -join ' ') -like '*sem permissao*') 'impressao: consulta em lote que falha fica incerta'
Cenario; $script:rotas['*/solutioncomponents*sid*'] = @(Linha @{ objectid = 'a1'; componenttype = 2; rootcomponentbehavior = 0 })
Confere ((Get-ImpressaoDigital $dv 'BetinhosCore').incerto) 'impressao: coluna solta (tipo 2) fica incerta'
$script:ParaleloSequencial = $false

# --- Get-DecisaoDeExport: so pula ou reaproveita com impressao certa e igual; na duvida, exporta ---
$imp = @{ valor = 'IMP'; incerto = $false; motivos = @() }
function Reg($s, $v, $h, $i) { return [pscustomobject]@{ solucao = $s; versao = $v; hash = $h; impressao = $i } }
$pubTest = @(Reg 'BetinhosCore' '1.0.0.5' 'H' 'IMP'); $pubProd = @(Reg 'BetinhosCore' '1.0.0.5' 'H' 'IMP')
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = $pubTest; Prod = $pubProd } $null '1.0.0.6'
Confere ($d.acao -eq 'pular' -and $d.hash -eq 'H') 'decisao: igual a ultima publicacao em todos os alvos pula'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = $pubTest; Prod = @() } $null '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: alvo sem registro exporta'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = $pubTest; Prod = @(Reg 'BetinhosCore' '1.0.0.4' 'H2' 'IMP') } $null '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: alvos com conteudos diferentes exportam'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = @(Reg 'BetinhosCore' '1.0.0.5' 'H' 'OUTRA') } $null '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: impressao diferente da publicada exporta'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = @([pscustomobject]@{ solucao = 'BetinhosCore'; versao = '1.0.0.5'; hash = 'H' }) } $null '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: registro antigo, sem impressao, exporta'
$incerta = @{ valor = 'IMP'; incerto = $true; motivos = @('tipo 999') }
$d = Get-DecisaoDeExport 'BetinhosCore' $incerta @{ Test = $pubTest } $null '1.0.0.6'
Confere ($d.acao -eq 'exportar' -and $d.motivo -like '*tipo 999*') 'decisao: impressao incerta exporta'
$cache = [pscustomobject]@{ solucao = 'BetinhosCore'; versao = '1.0.0.6'; arquivo = 'BetinhosCore_managed.zip'; hash = 'HC'; impressao = 'IMP' }
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{} $cache '1.0.0.6'
Confere ($d.acao -eq 'cache' -and $d.hash -eq 'HC' -and $d.arquivo -eq 'BetinhosCore_managed.zip') 'decisao: pacote do Deploy com a mesma impressao e a versao do DEV e reaproveitado'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{} $cache '1.0.0.7'
Confere ($d.acao -eq 'exportar') 'decisao: DEV em outra versao (houve export depois do Deploy) exporta'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{} ([pscustomobject]@{ solucao = 'BetinhosCore'; versao = '1.0.0.6'; arquivo = 'x.zip'; hash = 'HC'; impressao = 'VELHA' }) '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: DEV mudou depois do Deploy exporta'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{ Test = $pubTest } $cache '1.0.0.6'
Confere ($d.acao -eq 'pular') 'decisao: pular vem antes do pacote do Deploy'
$d = Get-DecisaoDeExport 'BetinhosCore' $imp @{} ([pscustomobject]@{ solucao = 'BetinhosCore'; versao = '1.0.0.6'; arquivo = $null; hash = 'HC'; impressao = 'IMP'; origem = 'pulada' }) '1.0.0.6'
Confere ($d.acao -eq 'exportar') 'decisao: entrada pulada do cache (sem arquivo) nao serve'

# Observacao (modo observar): o export fresco prova se a decisao teria acertado
Confere ((Get-ObservacaoDaDecisao @{ acao = 'pular'; hash = 'H' } 'H') -eq 'acerto') 'observacao: hash igual e acerto'
Confere ((Get-ObservacaoDaDecisao @{ acao = 'cache'; hash = 'H' } 'X') -eq 'erro') 'observacao: hash diferente e erro'
Confere ($null -eq (Get-ObservacaoDaDecisao @{ acao = 'exportar' } 'X')) 'observacao: decisao de exportar nao tem o que provar'

# Registro da publicacao leva a impressao do manifesto
$reg = New-RegistroPublicado ([pscustomobject]@{ solucao = 'BetinhosCore'; hash = 'H'; impressao = 'IMP' }) '1.0.0.6'
Confere ($reg.solucao -eq 'BetinhosCore' -and $reg.versao -eq '1.0.0.6' -and $reg.hash -eq 'H' -and $reg.impressao -eq 'IMP') 'registro: solucao, versao, hash e impressao'
$reg = New-RegistroPublicado ([pscustomobject]@{ solucao = 'BetinhosCore'; versao = '1.0.0.5'; hash = 'H' }) '1.0.0.5'
Confere ($null -eq $reg.impressao) 'registro: sem impressao no item fica nula'

# Camada Active no topo (remover-camadas-active.ps1)
$camadas = @((Linha @{ msdyn_order = 2; msdyn_solutionname = 'Active'; msdyn_name = 'n'; msdyn_componentjson = 'j' }), (Linha @{ msdyn_order = 1; msdyn_solutionname = 'BetinhosCore'; msdyn_name = 'n'; msdyn_componentjson = 'g' }))
$c = Get-CamadaActiveNoTopo $camadas
Confere ($null -ne $c -and $c.msdyn_componentjson -eq 'j') 'camadas: Active por cima da gerenciada e alvo'
Confere ($null -eq (Get-CamadaActiveNoTopo @($camadas[0]))) 'camadas: so a Active (componente nao gerenciado) fica'
Confere ($null -eq (Get-CamadaActiveNoTopo @((Linha @{ msdyn_order = 1; msdyn_solutionname = 'Active'; msdyn_name = 'n'; msdyn_componentjson = 'j' }), (Linha @{ msdyn_order = 2; msdyn_solutionname = 'BetinhosCore'; msdyn_name = 'n'; msdyn_componentjson = 'g' })))) 'camadas: gerenciada no topo fica'

if ($falhas) { throw "$falhas teste(s) falharam" }
Write-Host 'todos os testes de impressao passaram'
