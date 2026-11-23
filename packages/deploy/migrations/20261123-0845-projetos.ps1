param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Modulo Projetos (#/projetos), v2: projeto com etapas. Tres tabelas:
#   cr40f_projeto            - o projeto (codigo PRJ-n por autonumber, area, responsavel, briefing do gestor, instrucoes de uso);
#   cr40f_projetoetapa       - etapa do projeto (codigo PRJ-n.m, chave alternativa cr40f_codigo; status, prazo, andamento, PR, publicado no PROD);
#   cr40f_projetoatualizacao - linha do tempo (autor Renan/Gestor/Agente, texto, "e prova", transcricao do audio); anexos = notas (annotation).
# Atualizacao sem etapa = briefing/comentario do projeto. So o Renan muda status e marca Concluida, e so com prova da etapa (regra na tela).
# Valores das choices (contrato do shell, apps/shell/src/pages/projetos/domain/choices.ts): ordem fixa; so acrescentar no fim.
# Acesso: papel "Projetos" (Renan, gestor, conta dos agentes); os membros sao atribuidos a mao em cada ambiente.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes (tabelas, chave e papel vao para a BetinhosCore).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$projeto = "cr40f_projeto"
$etapa = "cr40f_projetoetapa"
$atualizacao = "cr40f_projetoatualizacao"
$nomePapel = "Projetos"

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc, [string] $Obrigatorio = "None") {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = $Obrigatorio } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max, [string] $Formato = "Text", [string] $Obrigatorio = "None") {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc $Obrigatorio; $c.MaxLength = $Max; $c.FormatName = @{ Value = $Formato }; return $c
}
function Memo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "TextArea"; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min, [int] $Max, [string] $Obrigatorio = "None") {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc $Obrigatorio; $c.Format = "None"; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
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
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc $Obrigatorio
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label (U $r)) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

# Codigo do projeto: autonumber PRJ-1, PRJ-2... (o Dataverse preenche no create; a tela e os agentes so leem).
$codigoProjeto = Texto "cr40f_codigo" "Código" "Código do projeto (PRJ-n), gerado pelo Dataverse. Agentes citam este código no PR." 20
$codigoProjeto.AutoNumberFormat = "PRJ-{SEQNUM:1}"

$colunasProjeto = @(
  $codigoProjeto,
  (Texto "cr40f_area" "Área/módulo" "Área ou módulo do sistema a que o projeto pertence." 100),
  (Texto "cr40f_responsavel" "Responsável" "Quem conduz o projeto (nome em texto)." 100),
  (Memo "cr40f_briefing" "Briefing" "Pedido do gestor em texto. Prints e áudios ficam nas atualizações sem etapa." 100000),
  (Memo "cr40f_instrucoes" "Instruções de uso" "Como usar o que o projeto entregou (texto longo)." 100000)
)
$colunasEtapa = @(
  (Inteiro "cr40f_numero" "Número" "Sequencial da etapa dentro do projeto (m de PRJ-n.m), calculado por quem cria: maior + 1." 1 100000 "ApplicationRequired"),
  (Texto "cr40f_codigo" "Código" "Código da etapa (PRJ-n.m), único. Agentes citam este código no PR." 20 "Text" "ApplicationRequired"),
  (Escolha "cr40f_status" "Status" "Situação da etapa. Concluída só pelo Renan e com prova da etapa (regra na tela Projetos)." @("Ideia", "Em andamento", "Em validação", "Concluída", "Pausada") "ApplicationRequired"),
  (Memo "cr40f_descricao" "Descrição" "O que a etapa entrega." 20000),
  (SoData "cr40f_prazo" "Prazo" "Data-alvo de entrega da etapa."),
  (Inteiro "cr40f_andamento" "Andamento (%)" "Percentual de andamento da etapa, de 0 a 100." 0 100),
  (Texto "cr40f_linkpr" "Link do PR" "Link do pull request no GitHub." 500 "Url"),
  (DataHora "cr40f_publicadoprod" "Publicado no PROD" "Quando o workflow Produção publicou o PR da etapa no PROD.")
)
$colunasAtualizacao = @(
  (DataHora "cr40f_data" "Data" "Quando a atualização aconteceu."),
  (Escolha "cr40f_autor" "Autor" "Quem registrou a atualização." @("Renan", "Gestor", "Agente") "ApplicationRequired"),
  (Memo "cr40f_texto" "Texto" "Texto da atualização." 20000),
  (SimNao "cr40f_eprova" "É prova" "Marca a atualização como prova (print, vídeo) da etapa; sustenta o Concluída."),
  (Memo "cr40f_transcricao" "Transcrição" "Texto do áudio anexado, gravado pelo plugin de transcrição." 100000)
)

function Garantir-Tabela([string] $Logica, [string] $Schema, [string] $Nome, [string] $Plural, [string] $Desc, [bool] $Notas, $Colunas) {
  $achada = @(Get-Rows "EntityDefinitions" "MetadataId,LogicalName" "LogicalName eq '$Logica'")
  if ($achada.Count -eq 0) {
    if (-not $Apply) { Write-Step "DRY RUN criaria a tabela $Logica com $($Colunas.Count) colunas."; return $null }
    $primaria = Texto "cr40f_Name" "Nome" "Nome." 200 "Text" "ApplicationRequired"
    $primaria.IsPrimaryName = $true
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

# Lookup N:1 com exclusao Restrict (registro com historico nao e apagado por engano).
function Garantir-Lookup([string] $Rel, [string] $Referenciada, [string] $Referenciando, [string] $Schema, [string] $Nome, [string] $Desc, [string] $Obrigatorio) {
  if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$Rel'").Count -gt 0) { return }
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $Referenciando.$($Schema.ToLowerInvariant()) (Restrict)."; return }
  Invoke-Dv "POST" "RelationshipDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $Rel
    ReferencedEntity = $Referenciada; ReferencedAttribute = "${Referenciada}id"; ReferencingEntity = $Referenciando
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "Restrict"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = $Obrigatorio } }
  } | Out-Null
  if (-not (Get-Coluna $Referenciando $Schema.ToLowerInvariant())) { throw "Lookup $Referenciando.$Schema nao encontrado depois do POST." }
  Write-Step "criado lookup $Referenciando.$($Schema.ToLowerInvariant())"
}

$entProjeto = Garantir-Tabela $projeto "cr40f_Projeto" "Projeto" "Projetos" "Projeto acompanhado na tela Projetos do shell: briefing, etapas, provas e instruções de uso." $false $colunasProjeto
$entEtapa = Garantir-Tabela $etapa "cr40f_ProjetoEtapa" "Etapa de projeto" "Etapas de projeto" "Etapa de um projeto (PRJ-n.m): status, prazo, andamento, PR e publicação no PROD." $false $colunasEtapa
# HasNotes: prints, videos e audios ficam como anexos (annotation) da atualizacao.
$entAtualizacao = Garantir-Tabela $atualizacao "cr40f_ProjetoAtualizacao" "Atualização de projeto" "Atualizações de projeto" "Linha do tempo de um projeto e das etapas: o que mudou, quem registrou, provas e áudios anexados." $true $colunasAtualizacao

if ($Apply -or ($entProjeto -and $entEtapa)) {
  Garantir-Lookup "cr40f_projeto_cr40f_projetoetapa_projeto" $projeto $etapa "cr40f_Projeto" "Projeto" "Projeto a que a etapa pertence." "ApplicationRequired"
}
if ($Apply -or ($entProjeto -and $entAtualizacao)) {
  Garantir-Lookup "cr40f_projeto_cr40f_projetoatualizacao_projeto" $projeto $atualizacao "cr40f_Projeto" "Projeto" "Projeto a que a atualização pertence." "ApplicationRequired"
}
if ($Apply -or ($entEtapa -and $entAtualizacao)) {
  Garantir-Lookup "cr40f_projetoetapa_cr40f_projetoatualizacao_etapa" $etapa $atualizacao "cr40f_Etapa" "Etapa" "Etapa a que a atualização pertence (vazio = briefing ou comentário do projeto)." "None"
}
if (-not $Apply) { Write-Step "dry-run: nada gravado (chave, solucao e papel so com -Apply)."; return }

# Chave alternativa da etapa: impede PRJ-n.m repetido (dois criando ao mesmo tempo) e indexa a busca dos agentes pelo codigo.
$chaves = @(@((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$etapa')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq "cr40f_codigo" })
if ($chaves.Count -eq 0) {
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$etapa')/Keys" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = "cr40f_codigo"
    DisplayName = (Label (U "Código da etapa")); KeyAttributes = @("cr40f_codigo")
  } | Out-Null
  $chaves = @(@((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$etapa')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq "cr40f_codigo" })
  if ($chaves.Count -ne 1) { throw "Chave alternativa cr40f_codigo nao apareceu depois do POST." }
  Write-Step "criada a chave alternativa $etapa.cr40f_codigo (indice montado em segundo plano)"
}
if ($chaves[0].EntityKeyIndexStatus -eq "Failed") { throw "Chave cr40f_codigo com indice em falha (codigo repetido?); corrija os registros e reative no maker portal." }

foreach ($e in @($entProjeto, $entEtapa, $entAtualizacao)) { Add-ComponenteNaSolucao $e.MetadataId 1 }
Add-ComponenteNaSolucao $chaves[0].MetadataId 14
Publish-Tabela $projeto
Publish-Tabela $etapa
Publish-Tabela $atualizacao

# Papel "Projetos" na unidade raiz: tabelas da organizacao com profundidade Global; anotacao no minimo que a tela usa
# (criar e anexar as proprias, ler todas para ver as provas dos outros; o Dataverse nao limita a leitura de notas por tabela).
# Sem Delete em projeto e etapa; Delete na atualizacao porque a tela desfaz a atualizacao quando um anexo falha.
# So concede o que falta ou esta abaixo; nunca rebaixa nem remove. A v1 dava estes privilegios a Acesso-Betinhos-MDA e
# DEV - Usuario; nunca foi aplicada, entao nao ha o que retirar deles.
$ordem = @{ Basic = 1; Local = 2; Deep = 4; Global = 8 }
$pedido = [ordered]@{}
foreach ($t in @($projeto, $etapa, $atualizacao)) {
  foreach ($p in @("Create", "Read", "Write", "Append", "AppendTo")) { $pedido["prv$p$t"] = "Global" }
}
$pedido["prvDelete$atualizacao"] = "Global"
$pedido["prvCreateAnnotation"] = "Basic"; $pedido["prvReadAnnotation"] = "Global"; $pedido["prvAppendAnnotation"] = "Basic"

$privs = @{}
foreach ($nome in $pedido.Keys) {
  $achado = @(Get-Rows "privileges" "privilegeid,name" "name eq '$nome'")
  if ($achado.Count -ne 1) { throw "Privilegio $nome nao encontrado." }
  $privs[$nome] = [string] $achado[0].privilegeid
}

$raiz = @(Get-Rows "businessunits" "businessunitid" "_parentbusinessunitid_value eq null")
if ($raiz.Count -ne 1) { throw "Unidade de negocio raiz nao encontrada (ou ambigua): $($raiz.Count)." }
$bu = [string] $raiz[0].businessunitid
$achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$nomePapel' and _businessunitid_value eq $bu")
if ($achados.Count -gt 1) { throw "Papel '$nomePapel' duplicado na unidade raiz." }
if ($achados.Count -eq 0) {
  Invoke-Dv "POST" "roles" @{ name = $nomePapel; description = (U "Módulo Projetos (#/projetos): Renan, gestor e conta dos agentes."); "businessunitid@odata.bind" = "/businessunits($bu)" } | Out-Null
  $achados = @(Get-Rows "roles" "roleid,name,_businessunitid_value" "name eq '$nomePapel' and _businessunitid_value eq $bu")
  if ($achados.Count -ne 1) { throw "Papel '$nomePapel' nao apareceu depois do POST." }
  Write-Step "criado o papel $nomePapel"
}
$papel = $achados[0]
Add-ComponenteNaSolucao $papel.roleid 20

$atual = @{}
foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $atual[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
$concessoes = @()
foreach ($nome in $pedido.Keys) {
  $id = $privs[$nome]; $depth = $pedido[$nome]
  if ($atual.ContainsKey($id) -and $atual[$id] -ge $ordem[$depth]) { continue }
  $concessoes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.RolePrivilege"; PrivilegeId = $id; Depth = $depth; BusinessUnitId = $bu; PrivilegeName = $nome }
}
if ($concessoes.Count -eq 0) { Write-Step "$nomePapel ja tem tudo: nada a conceder" }
else {
  Invoke-Dv "POST" "roles($($papel.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" @{ Privileges = $concessoes } | Out-Null
  $depois = @{}
  foreach ($rp in @(Get-Rows "roleprivilegescollection" "privilegeid,privilegedepthmask" "roleid eq $($papel.roleid)")) { $depois[[string] $rp.privilegeid] = [int] $rp.privilegedepthmask }
  foreach ($c in $concessoes) {
    if (-not $depois.ContainsKey($c.PrivilegeId) -or $depois[$c.PrivilegeId] -lt $ordem[$c.Depth]) { throw "$nomePapel ficou sem $($c.PrivilegeName) na profundidade $($c.Depth)." }
  }
  Write-Step "$nomePapel concedido: $(($concessoes | ForEach-Object { "$($_.PrivilegeName)=$($_.Depth)" }) -join ', ')"
}
Write-Step "OK: $projeto, $etapa e $atualizacao, chave cr40f_codigo e papel $nomePapel na solucao $script:SolucaoDev. Atribua o papel ao Renan, ao gestor e a conta dos agentes."
