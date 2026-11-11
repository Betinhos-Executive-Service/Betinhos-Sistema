# Testa inventario.ps1 (inventario da solucao e escolha do modo de import) com respostas simuladas, sem tocar no Dataverse.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'dataverse.ps1')
. (Join-Path $PSScriptRoot 'solucoes.ps1')
. (Join-Path $PSScriptRoot 'impressao.ps1')
. (Join-Path $PSScriptRoot 'inventario.ps1')

$falhas = 0
function Confere([bool] $ok, [string] $nome) { if ($ok) { Write-Host "ok    $nome" } else { Write-Host "FALHA $nome"; $script:falhas++ } }
function Inv([string[]] $Itens, [bool] $Incerto = $false) { return [pscustomobject]@{ itens = $Itens; incerto = $Incerto; motivos = @(if ($Incerto) { 'leitura falhou' }) } }

# --- Get-ModoDeImport ---
$dev = Inv @('c|1|t1', 'a|cr40f_x|cr40f_a', 'a|cr40f_x|cr40f_b')
$r = Get-ModoDeImport $dev (Inv @('c|1|t1', 'a|cr40f_x|cr40f_a'))
Confere ($r.modo -eq 'update' -and @($r.sobrando).Count -eq 0) 'modo: destino contido no DEV (so entrou coisa) vira update'
$r = Get-ModoDeImport $dev (Inv @('c|1|t1', 'a|cr40f_x|cr40f_a', 'a|cr40f_x|cr40f_velha'))
Confere ($r.modo -eq 'upgrade' -and @($r.sobrando) -contains 'a|cr40f_x|cr40f_velha' -and $r.motivo -like '1 item*') 'modo: coluna que saiu do DEV vira upgrade e aparece em sobrando'
$r = Get-ModoDeImport $dev (Inv @('c|1|t1', 'c|29|flow-apagado'))
Confere ($r.modo -eq 'upgrade') 'modo: componente que saiu da solucao vira upgrade'
Confere ((Get-ModoDeImport $dev (Inv @('c|1|t1')) $true).modo -eq 'upgrade') 'modo: importar_tudo fica no upgrade'
Confere ((Get-ModoDeImport $null (Inv @('c|1|t1'))).modo -eq 'upgrade') 'modo: sem inventario do DEV fica no upgrade'
Confere ((Get-ModoDeImport (Inv @('c|1|t1') $true) (Inv @('c|1|t1'))).modo -eq 'upgrade') 'modo: inventario do DEV incerto fica no upgrade'
Confere ((Get-ModoDeImport $dev (Inv @('c|1|t1') $true)).modo -eq 'upgrade') 'modo: inventario do destino incerto fica no upgrade'
Confere ((Get-ModoDeImport $dev $null).modo -eq 'upgrade') 'modo: sem inventario do destino fica no upgrade'
Confere ((Get-ModoDeImport (Inv @()) (Inv @())).modo -eq 'upgrade') 'modo: inventario do DEV vazio fica no upgrade'
# Inventario lido do pacote (JSON -> PSCustomObject), como no import.
$json = ConvertTo-Json -InputObject @{ itens = @('c|1|t1', 'a|cr40f_x|cr40f_a'); incerto = $false; motivos = @() } -Depth 4 | ConvertFrom-Json
Confere ((Get-ModoDeImport $json (Inv @('c|1|t1'))).modo -eq 'update') 'modo: inventario do DEV vindo do JSON do pacote'

# --- Get-ObservacaoDoModo ---
$antes = Inv @('c|1|t1', 'a|cr40f_x|cr40f_velha'); $depois = Inv @('c|1|t1')
Confere ((Get-ObservacaoDoModo 'update' $antes $depois).observacao -eq 'erro') 'observacao: escolheu update e o upgrade apagou algo = erro'
Confere ((Get-ObservacaoDoModo 'upgrade' $antes $depois).observacao -eq 'acerto') 'observacao: escolheu upgrade e o upgrade apagou algo = acerto'
Confere ((Get-ObservacaoDoModo 'update' $depois $depois).observacao -eq 'acerto') 'observacao: escolheu update e nada foi apagado = acerto'
Confere ((Get-ObservacaoDoModo 'upgrade' $depois $depois).observacao -eq 'conservador') 'observacao: escolheu upgrade e nada foi apagado = conservador'
Confere ((Get-ObservacaoDoModo 'update' $antes (Inv @() $true)).observacao -eq 'incerto') 'observacao: inventario incerto = incerto'
Confere (@((Get-ObservacaoDoModo 'upgrade' $antes $depois).apagados) -contains 'a|cr40f_x|cr40f_velha') 'observacao: lista o que o upgrade apagou'

# --- ConvertTo-LinhasDoInventario (respostas no formato da Web API) ---
$tabela = [pscustomobject]@{
  LogicalName = 'cr40f_x'
  Attributes = @([pscustomobject]@{ LogicalName = 'cr40f_a' }, [pscustomobject]@{ LogicalName = 'cr40f_b' })
  Keys = @([pscustomobject]@{ LogicalName = 'cr40f_chave' })
  OneToManyRelationships = @([pscustomobject]@{ SchemaName = 'cr40f_x_y' })
  ManyToOneRelationships = @()
  ManyToManyRelationships = @([pscustomobject]@{ SchemaName = 'cr40f_x_z' })
}
$l = @(ConvertTo-LinhasDoInventario 'cr40f_x' $tabela)
Confere ($l -contains 'a|cr40f_x|cr40f_b' -and $l -contains 'k|cr40f_x|cr40f_chave' -and $l -contains 'r|cr40f_x_y' -and $l -contains 'r|cr40f_x_z' -and $l.Count -eq 5) 'linhas: colunas, chave e relacionamentos da tabela'
$opcoes = [pscustomobject]@{ value = @([pscustomobject]@{ LogicalName = 'cr40f_status'; OptionSet = [pscustomobject]@{ Options = @([pscustomobject]@{ Value = 1 }, [pscustomobject]@{ Value = 2 }) } }) }
$l = @(ConvertTo-LinhasDoInventario 'cr40f_x' $opcoes)
Confere ($l -contains 'o|cr40f_x.cr40f_status|2' -and $l.Count -eq 2) 'linhas: opcoes de coluna de escolha'
Confere (@(ConvertTo-LinhasDoInventario 'cr40f_x' ([pscustomobject]@{ value = @() })).Count -eq 0) 'linhas: tabela sem coluna de escolha'
$l = @(ConvertTo-LinhasDoInventario 'global:g1' ([pscustomobject]@{ Options = @([pscustomobject]@{ Value = 7 }) }))
Confere ($l.Count -eq 1 -and $l[0] -eq 'o|global:g1|7') 'linhas: opcoes de escolha global'
Confere (@(ConvertTo-LinhasDoInventario 'global:g2' ([pscustomobject]@{ TrueOption = 1 })).Count -eq 0) 'linhas: escolha global sim/nao sem Options'
$l = @(ConvertTo-LinhasDoInventario 'papel:r1' ([pscustomobject]@{ RolePrivileges = @([pscustomobject]@{ PrivilegeId = 'AB-1'; Depth = 'Global' }) }))
Confere ($l.Count -eq 1 -and $l[0] -eq 'rp|r1|ab-1') 'linhas: privilegios do papel'

# --- Get-InventarioDaSolucao (leituras simuladas, no proprio escopo) ---
$script:ParaleloSequencial = $true
$dv = @{ Api = 'https://x/api/data/v9.2'; Url = 'https://org23b93544.crm2.dynamics.com'; Host = 'org23b93544.crm2.dynamics.com'; Headers = @{} }
$script:rotas = [ordered]@{}
function Invoke-RestMethod {
  param($Method, $Uri, $Headers, $Body, $ContentType)
  foreach ($k in $script:rotas.Keys) { if ($Uri -like $k) { $v = $script:rotas[$k]; if ($v -is [Exception]) { throw $v }; return $v } }
  throw "sem rota: $Uri"
}
function Lista($Itens) { return [pscustomobject]@{ value = @($Itens) } }
function Rotas-Base {
  $script:rotas = [ordered]@{}
  $script:rotas['*/solutions?*'] = Lista @([pscustomobject]@{ solutionid = 'S1' })
  $script:rotas['*/solutioncomponents?*'] = Lista @(
    [pscustomobject]@{ objectid = 'T1'; componenttype = 1; rootcomponentbehavior = 0 },
    [pscustomobject]@{ objectid = 'P1'; componenttype = 70; rootcomponentbehavior = 0 },
    [pscustomobject]@{ objectid = 'A1'; componenttype = 91; rootcomponentbehavior = 0 })
  $script:rotas['*/EntityDefinitions?$select=MetadataId,LogicalName'] = Lista @([pscustomobject]@{ MetadataId = 'T1'; LogicalName = 'cr40f_x' }, [pscustomobject]@{ MetadataId = 'T9'; LogicalName = 'outra' })
  # As de opcoes antes da tabela: no -like, o ? de '(t1)?' casa qualquer caractere, inclusive a barra de '(t1)/Attributes'.
  $script:rotas['*/EntityDefinitions(t1)/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata*'] = $opcoes
  $script:rotas['*/EntityDefinitions(t1)/Attributes/Microsoft.Dynamics.CRM.*'] = Lista @()
  $script:rotas['*/EntityDefinitions(t1)?*'] = $tabela
  $script:rotas['*/systemforms?*'] = Lista @([pscustomobject]@{ formid = 'F1'; objecttypecode = 'cr40f_x' }, [pscustomobject]@{ formid = 'F9'; objecttypecode = 'outra' })
  $script:rotas['*/savedqueries?*'] = Lista @([pscustomobject]@{ savedqueryid = 'V1'; returnedtypecode = 'cr40f_x' })
  $script:rotas['*/savedqueryvisualizations?*'] = Lista @()
  $script:rotas['*/workflows?*'] = Lista @()
  $script:rotas['*/fieldpermissions?*'] = Lista @([pscustomobject]@{ entityname = 'cr40f_x'; attributelogicalname = 'cr40f_a'; _fieldsecurityprofileid_value = 'P1' }, [pscustomobject]@{ entityname = 'cr40f_x'; attributelogicalname = 'cr40f_b'; _fieldsecurityprofileid_value = 'P9' })
  $script:rotas['*/pluginassemblies?*'] = Lista @()
  $script:rotas['*/plugintypes?*'] = Lista @([pscustomobject]@{ plugintypeid = 'PT1'; _pluginassemblyid_value = 'A1' }, [pscustomobject]@{ plugintypeid = 'PT9'; _pluginassemblyid_value = 'A9' })
}
Rotas-Base
$inv = Get-InventarioDaSolucao $dv 'BetinhosCore'
$i = @($inv.itens)
Confere (-not $inv.incerto) "inventario: certo com todas as leituras ($(@($inv.motivos) -join '; '))"
Confere ($i -contains 'c|1|t1' -and $i -contains 'c|70|p1' -and $i -contains 'c|91|a1') 'inventario: linhas da solucao'
Confere ($i -contains 'a|cr40f_x|cr40f_a' -and $i -contains 'o|cr40f_x.cr40f_status|1' -and $i -contains 'r|cr40f_x_y') 'inventario: metadata e opcoes da tabela'
Confere ($i -contains 's|systemforms|f1' -and $i -contains 's|savedqueries|v1' -and -not ($i -contains 's|systemforms|f9')) 'inventario: formularios e visoes so das tabelas da solucao'
Confere ($i -contains 'fp|p1|cr40f_x.cr40f_a' -and -not ($i -like 'fp|p9*')) 'inventario: permissoes so dos perfis da solucao'
Confere ($i -contains 'pt|a1|pt1' -and -not ($i -like '*pt9')) 'inventario: tipos de plugin so dos assemblies da solucao'
$script:rotas['*/EntityDefinitions(t1)?*'] = [Exception]::new('503 indisponivel')
$inv = Get-InventarioDaSolucao $dv 'BetinhosCore'
Confere ($inv.incerto -and (@($inv.motivos) -join ' ') -like '*503*') 'inventario: leitura que falha deixa incerto'
Rotas-Base
$script:rotas['*/solutions?*'] = Lista @()
Confere ((Get-InventarioDaSolucao $dv 'BetinhosCore').incerto) 'inventario: solucao ausente e incerto'

if ($falhas) { throw "$falhas teste(s) falharam" }
Write-Host "testa-inventario: tudo ok"
