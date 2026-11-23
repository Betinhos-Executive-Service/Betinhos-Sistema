param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Modulo Projetos (#/projetos): acompanhamento de projetos pelo Renan e pelo gestor. Duas tabelas:
#   cr40f_projeto            - o projeto (status, andamento, prazo, link do PR, instrucoes de uso);
#   cr40f_projetoatualizacao - linha do tempo (autor Renan/Gestor/Agente, texto, "e prova"); anexos = notas (annotation).
# Agentes de IA gravam atualizacoes pelo Dataverse; so o Renan marca Concluido, e so com prova anexada (regra na tela).
# Valores das choices (contrato do shell, apps/shell/src/pages/projetos/domain/choices.ts): ordem fixa; so acrescentar no fim.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes (BetinhosCore).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$projeto = "cr40f_projeto"
$atualizacao = "cr40f_projetoatualizacao"
$papeis = @("Acesso-Betinhos-MDA", "DEV - Usu$([char]0xE1)rio")

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max, [string] $Formato = "Text") {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = $Formato }; return $c
}
function Memo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "TextArea"; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min, [int] $Max) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
}
function SoData([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
}
function DataHora([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateAndTime"; $c.DateTimeBehavior = @{ Value = "UserLocal" }; return $c
}
function SimNao([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "BooleanAttributeMetadata" $Schema $Nome $Desc; $c.DefaultValue = $false
  $c.OptionSet = @{ TrueOption = @{ Value = 1; Label = (Label "Sim") }; FalseOption = @{ Value = 0; Label = (Label (U "Não")) } }
  return $c
}
function Escolha([string] $Schema, [string] $Nome, [string] $Desc, [string[]] $Rotulos, [string] $Obrigatorio = "None") {
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc
  $c.RequiredLevel = @{ Value = $Obrigatorio }
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label (U $r)) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

$colunasProjeto = @(
  (Texto "cr40f_area" "Área/módulo" "Área ou módulo do sistema a que o projeto pertence." 100),
  (Escolha "cr40f_status" "Status" "Situação do projeto. Concluído só com prova anexada (regra na tela Projetos)." @("Ideia", "Em andamento", "Em validação", "Concluído", "Pausado") "ApplicationRequired"),
  (Texto "cr40f_responsavel" "Responsável" "Quem conduz o projeto (nome em texto)." 100),
  (SoData "cr40f_prazo" "Prazo" "Data-alvo de entrega."),
  (Inteiro "cr40f_andamento" "Andamento (%)" "Percentual de andamento, de 0 a 100." 0 100),
  (Texto "cr40f_linkpr" "Link do PR" "Link do pull request no GitHub." 500 "Url"),
  (Memo "cr40f_instrucoes" "Instruções de uso" "Como usar o que o projeto entregou (texto longo)." 100000)
)
$colunasAtualizacao = @(
  (DataHora "cr40f_data" "Data" "Quando a atualização aconteceu."),
  (Escolha "cr40f_autor" "Autor" "Quem registrou a atualização." @("Renan", "Gestor", "Agente") "ApplicationRequired"),
  (Memo "cr40f_texto" "Texto" "Texto da atualização." 20000),
  (SimNao "cr40f_eprova" "É prova" "Marca a atualização como prova/evidência (print, vídeo) que sustenta o Concluído.")
)

function Garantir-Tabela([string] $Logica, [string] $Schema, [string] $Nome, [string] $Plural, [string] $Desc, [bool] $Notas, $Colunas) {
  $achada = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$Logica'")
  if ($achada.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $Logica com $($Colunas.Count) colunas."; return $null }
    $primaria = Texto "cr40f_Name" "Nome" "Nome." 200
    $primaria.IsPrimaryName = $true
    $primaria.RequiredLevel = @{ Value = "ApplicationRequired" }
    Invoke-Dv "POST" "EntityDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName = $Schema
      DisplayName = (Label (U $Nome)); DisplayCollectionName = (Label (U $Plural)); Description = (Label (U $Desc))
      PrimaryNameAttribute = "cr40f_name"; OwnershipType = "OrganizationOwned"; HasActivities = $false; HasNotes = $Notas; IsActivity = $false
      Attributes = @($primaria)
    } | Out-Null
    $achada = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$Logica'")
    if ($achada.Count -ne 1) { throw "Tabela $Logica nao apareceu depois do POST." }
    Write-Step "criada a tabela $Logica"
  }
  foreach ($c in $Colunas) {
    $coluna = $c.SchemaName.ToLowerInvariant()
    if (Get-Coluna $Logica $coluna) { continue }
    if (-not $Apply) { Write-Step "DRY RUN criaria $Logica.$coluna."; continue }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$Logica')/Attributes" $c | Out-Null
    if (-not (Get-Coluna $Logica $coluna)) { throw "Coluna $coluna nao foi criada." }
    Write-Step "criada $Logica.$coluna"
  }
  return $achada[0]
}

$entProjeto = Garantir-Tabela $projeto "cr40f_Projeto" "Projeto" "Projetos" "Projeto acompanhado na tela Projetos do shell (status, andamento, provas e instruções de uso)." $false $colunasProjeto
# HasNotes: as provas (fotos, videos, prints) ficam como anexos (annotation) da atualizacao.
$entAtualizacao = Garantir-Tabela $atualizacao "cr40f_ProjetoAtualizacao" "Atualização de projeto" "Atualizações de projeto" "Linha do tempo de um projeto: o que mudou, quem registrou e as provas anexadas." $true $colunasAtualizacao

# Lookup da atualizacao para o projeto (Restrict: projeto com historico nao e apagado por engano).
$rel = "cr40f_projeto_cr40f_projetoatualizacao_projeto"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $atualizacao.cr40f_projeto (Restrict)." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = $projeto; ReferencedAttribute = "cr40f_projetoid"; ReferencingEntity = $atualizacao
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Restrict"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_Projeto"; DisplayName = (Label "Projeto"); Description = (Label (U "Projeto a que a atualização pertence.")); RequiredLevel = @{ Value = "ApplicationRequired" } }
    } | Out-Null
    Write-Step "criado lookup $atualizacao.cr40f_projeto"
  }
}
if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
if (-not (Get-Coluna $atualizacao "cr40f_projeto")) { throw "Lookup cr40f_projeto nao encontrado." }

foreach ($e in @($entProjeto, $entAtualizacao)) { Add-ComponenteNaSolucao $e.MetadataId 1 }
Publish-Tabela $projeto
Publish-Tabela $atualizacao

# Privilegios: tabelas da organizacao (profundidade Global) e anexos (annotation: criar proprio, ler tudo, anexar).
# So concede o que falta ou esta abaixo; nunca rebaixa nem remove.
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$pedido = [ordered]@{}
foreach ($t in @($projeto, $atualizacao)) {
  foreach ($p in @("Create", "Read", "Write", "Delete", "Append", "AppendTo")) { $pedido["prv$p$t"] = "Global" }
}
$pedido["prvCreateAnnotation"] = "Basic"; $pedido["prvReadAnnotation"] = "Global"
$pedido["prvAppendAnnotation"] = "Global"; $pedido["prvAppendToAnnotation"] = "Global"

$privs = @{}
foreach ($nome in $pedido.Keys) {
  $achado = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nome'")
  if ($achado.Count -ne 1) { throw "Privilegio $nome nao encontrado." }
  $privs[$nome] = [string] $achado[0].privilegeid
}
foreach ($nomePapel in $papeis) {
  $achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$($nomePapel.Replace("'", "''"))' and _parentroleid_value eq null")
  if ($achados.Count -ne 1) { throw "Papel '$nomePapel' nao encontrado (ou ambiguo) na unidade raiz: $($achados.Count)." }
  $papel = $achados[0]
  $atual = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $atual[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  $concessoes = @()
  foreach ($nome in $pedido.Keys) {
    $id = $privs[$nome]; $depth = $pedido[$nome]
    if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
    $concessoes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $papel._businessunitid_value; PrivilegeName = $nome }
  }
  if ($concessoes.Count -eq 0) { Write-Step "$nomePapel ja tem tudo: nada a conceder"; continue }
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $depois[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  foreach ($c in $concessoes) {
    if (-not $depois.ContainsKey($c.PrivilegeId) -or $depois[$c.PrivilegeId] -lt $ordem[$c.Depth]) { throw "$nomePapel ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$nomePapel concedido: $(($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ', ')"
}
Write-Step "OK: $projeto e $atualizacao na solucao $script:SolucaoDev."
