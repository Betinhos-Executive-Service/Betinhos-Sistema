# Somente DEV. Cria (idempotente) a tabela cr40f_avaliacaoservico ("Avaliação do serviço") na solução AppBetinhos,
# publica e confere metadata e pertencimento. Guarda a avaliação que o cliente deixa no link de acompanhamento
# (Worker acompanhar-motorista); quem grava é o flow "Link | Registrar avaliação" (provision-flow-avaliacao.ps1),
# pela conexão do noreply. O app não grava nesta tabela, por isso não há privilégios a conceder aqui.
# Valores do choice cr40f_classificacao: 100000000 Elogio, 100000001 Sugestão, 100000002 Reclamação, 100000003 Sem comentário.
# Chave alternativa cr40f_linkidunico em cr40f_linkid: uma avaliação por link, mesmo com dois envios simultâneos.
# A tabela entra na AppBetinhos com subcomponentes (colunas, lookups e chave vão junto, como as demais tabelas);
# o distribuidor das 4 soluções leva o tipo 1 ao BetinhosCore e, se a chave aparecer como linha própria (tipo 14), também
# (regra "14" em solucoes/regras.json).
# Para conferir sem gravar nada (sintaxe, BOM, tabelas referenciadas e o que seria criado):
#   powershell -File packages/deploy/provision-avaliacao-schema.ps1 -SomenteValidar
# Requer `az login` com acesso ao DEV. Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).
param([switch] $SomenteValidar)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
function Write-Step([string] $m) { Write-Host "[avaliacao-schema] $m" }

# Autoconferência do arquivo: sem erro de sintaxe e com BOM (sem BOM o 5.1 corrompe os rótulos acentuados).
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref] $null, [ref] $erros) | Out-Null
if ($erros) { throw "Erros de sintaxe em ${PSCommandPath}: $($erros | ForEach-Object { $_.Message })" }
$inicio = [IO.File]::ReadAllBytes($PSCommandPath)[0..2]
if ($inicio[0] -ne 0xEF -or $inicio[1] -ne 0xBB -or $inicio[2] -ne 0xBF) { throw "$PSCommandPath sem BOM UTF-8." }
Write-Step 'arquivo: Parser::ParseFile sem erros e BOM UTF-8 presente'

$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }
function Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $Extra = @{}) {
  if ($SomenteValidar -and $Method -ne 'GET') { throw "Modo -SomenteValidar tentou gravar ($Method $Path)." }
  Write-Host "[avaliacao-schema] $Method $($Path.Split('?')[0])"
  $h = $headers.Clone(); foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
  $p = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $h; TimeoutSec = 180 }
  if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  $bytes = (Invoke-WebRequest @p -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return @((Dv GET $Path).value) }
$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @(Rows "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$solutionName'")
if ($solution.Count -ne 1 -or [bool]$solution[0].ismanaged) { throw "Solução $solutionName não é unmanaged única." }
$solutionId = $solution[0].solutionid

function Label([string] $t) { @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $t; LanguageCode = 1046 }) } }
function Base([string] $type, [string] $schema, [string] $nome, [string] $desc, [string] $req = 'None') {
  @{ '@odata.type' = "Microsoft.Dynamics.CRM.$type"; SchemaName = $schema; DisplayName = (Label $nome); Description = (Label $desc); RequiredLevel = @{ Value = $req; CanBeChanged = $true } }
}
function Opcoes([string[]] $nomes) { $i = 0; @($nomes | ForEach-Object { @{ Value = 100000000 + $i++; Label = (Label $_) } }) }
function GetEntity([string] $logical) {
  $r = @(Rows "EntityDefinitions?`$select=MetadataId,EntitySetName&`$filter=LogicalName eq '$logical'")
  if ($r.Count -eq 1) { return $r[0] } else { return $null }
}
function TemAtributo([string] $entidade, [string] $logical) {
  return @(Rows "EntityDefinitions(LogicalName='$entidade')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$logical'").Count -eq 1
}
function NaSolucao($tabela) {
  return Rows "solutioncomponents?`$select=rootcomponentbehavior&`$filter=_solutionid_value eq $solutionId and objectid eq $($tabela.MetadataId) and componenttype eq 1"
}

$entidade = 'cr40f_avaliacaoservico'
$CLASSIFICACOES = @('Elogio', 'Sugestão', 'Reclamação', 'Sem comentário')
$nota = Base 'IntegerAttributeMetadata' 'cr40f_Nota' 'Nota' 'Nota de 1 a 5 dada pelo cliente.' 'ApplicationRequired'
$nota.MinValue = 1; $nota.MaxValue = 5; $nota.Format = 'None'
$comentario = Base 'MemoAttributeMetadata' 'cr40f_Comentario' 'Comentário' 'Texto livre deixado pelo cliente.'
$comentario.MaxLength = 4000; $comentario.Format = 'TextArea'
$classificacao = Base 'PicklistAttributeMetadata' 'cr40f_Classificacao' 'Classificação' 'Tipo do comentário, escolhido pelo cliente.'
$classificacao.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = (Opcoes $CLASSIFICACOES) }
$linkId = Base 'StringAttributeMetadata' 'cr40f_LinkId' 'Id do link' 'Último segmento do link de acompanhamento (12 base62 ou 64 hex); uma avaliação por link.'
$linkId.MaxLength = 100; $linkId.FormatName = @{ Value = 'Text' }
$avaliadoEm = Base 'DateTimeAttributeMetadata' 'cr40f_AvaliadoEm' 'Avaliado em' 'Quando o cliente enviou a avaliação.'
$avaliadoEm.Format = 'DateAndTime'
$COLUNAS = @($nota, $comentario, $classificacao, $linkId, $avaliadoEm)

# Lookups: relacionamento, tabela referenciada, schema do lookup, rótulo, descrição. Excluir o alvo só limpa o lookup (RemoveLink).
$LOOKUPS = @(
  @('cr40f_reservadeveculos_cr40f_avaliacaoservico_reserva', 'cr40f_reservadeveculos', 'cr40f_Reserva', 'Reserva', 'Serviço avaliado (achado pelo link de acompanhamento).'),
  @('cr40f_funcionarios_cr40f_avaliacaoservico_motorista', 'cr40f_funcionarios', 'cr40f_Motorista', 'Motorista', 'Motorista da reserva no momento da avaliação.'),
  @('cr40f_veiculos_cr40f_avaliacaoservico_veiculo', 'cr40f_veiculos', 'cr40f_Veiculo', 'Veículo', 'Veículo da reserva no momento da avaliação.'),
  @('cr40f_boasideias_cr40f_avaliacaoservico_boaideia', 'cr40f_boasideias', 'cr40f_BoaIdeia', 'Boa ideia', 'Boa ideia criada a partir de uma sugestão do cliente.'),
  @('cr40f_errooperacional_cr40f_avaliacaoservico_erro', 'cr40f_errooperacional', 'cr40f_ErroOperacional', 'Erro operacional', 'Erro operacional criado a partir de uma reclamação do cliente.')
)
$relPath = 'RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'

foreach ($l in $LOOKUPS) { if (-not (GetEntity $l[1])) { throw "Tabela $($l[1]) ausente no DEV." } }
Write-Step "tabelas referenciadas presentes: $(($LOOKUPS | ForEach-Object { $_[1] }) -join ', ')"

$tabela = GetEntity $entidade
if ($tabela) { Write-Step "tabela $entidade já existe ($($tabela.EntitySetName))" }
elseif ($SomenteValidar) { Write-Step "VALIDAR: criaria a tabela $entidade (cr40f_name 200, obrigatório)" }
else {
  $primaria = Base 'StringAttributeMetadata' 'cr40f_Name' 'Nome' 'OS e nota, por exemplo "OS-1951 · nota 5".' 'ApplicationRequired'
  $primaria.MaxLength = 200; $primaria.FormatName = @{ Value = 'Text' }; $primaria.IsPrimaryName = $true
  Dv POST EntityDefinitions @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName = 'cr40f_AvaliacaoServico'; DisplayName = (Label 'Avaliação do serviço'); DisplayCollectionName = (Label 'Avaliações do serviço')
    Description = (Label 'Avaliação deixada pelo cliente no link de acompanhamento do serviço.'); PrimaryNameAttribute = 'cr40f_name'
    OwnershipType = 'UserOwned'; HasActivities = $false; HasNotes = $false; IsActivity = $false; Attributes = @($primaria)
  } | Out-Null
  $tabela = GetEntity $entidade
  if (-not $tabela) { throw "Tabela $entidade não apareceu depois do POST." }
  Write-Step "tabela criada $entidade"
}

if ($tabela) {
  # O Dataverse ignora MaxLength/RequiredLevel do primário no POST: acerta por PUT da metadata completa (padrão de provision-equipamentos).
  $nome = Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='cr40f_name')/Microsoft.Dynamics.CRM.StringAttributeMetadata"
  if ($nome.MaxLength -ne 200 -or $nome.RequiredLevel.Value -ne 'ApplicationRequired') {
    if ($SomenteValidar) { Write-Step 'VALIDAR: ajustaria cr40f_name para 200/ApplicationRequired' }
    else {
      foreach ($n in @($nome.PSObject.Properties | Where-Object { $_.Name -like '@odata.*' } | ForEach-Object { $_.Name })) { $nome.PSObject.Properties.Remove($n) }
      $nome | Add-Member -NotePropertyName '@odata.type' -NotePropertyValue 'Microsoft.Dynamics.CRM.StringAttributeMetadata' -Force
      $nome.MaxLength = 200; $nome.RequiredLevel.Value = 'ApplicationRequired'
      Dv PUT "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='cr40f_name')" $nome @{ 'MSCRM.MergeLabels' = 'true' } | Out-Null
      Write-Step 'cr40f_name com MaxLength 200 e ApplicationRequired'
    }
  }
}

foreach ($c in $COLUNAS) {
  $logical = $c.SchemaName.ToLower()
  if ($tabela -and (TemAtributo $entidade $logical)) { Write-Step "$entidade.$logical já existe"; continue }
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria $entidade.$logical ($($c.'@odata.type'.Split('.')[-1]))"; continue }
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Attributes" $c | Out-Null
  Write-Step "coluna criada $entidade.$logical"
}

foreach ($l in $LOOKUPS) {
  if (@(Rows "$relPath`?`$select=MetadataId&`$filter=SchemaName eq '$($l[0])'").Count -eq 1) { Write-Step "relacionamento $($l[0]) já existe"; continue }
  if ($SomenteValidar) { Write-Step "VALIDAR: criaria lookup $entidade.$($l[2].ToLower()) -> $($l[1]) (RemoveLink)"; continue }
  Dv POST RelationshipDefinitions @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'; SchemaName = $l[0]
    ReferencedEntity = $l[1]; ReferencedAttribute = "$($l[1])id"; ReferencingEntity = $entidade
    CascadeConfiguration = @{ Assign = 'NoCascade'; Delete = 'RemoveLink'; Merge = 'NoCascade'; Reparent = 'NoCascade'; Share = 'NoCascade'; Unshare = 'NoCascade' }
    Lookup = (Base 'LookupAttributeMetadata' $l[2] $l[3] $l[4])
  } | Out-Null
  Write-Step "lookup criado $entidade.$($l[2].ToLower())"
}

# Chave alternativa em cr40f_linkid: dois envios simultâneos do mesmo link não geram duas avaliações (o segundo POST
# recebe conflito e o flow responde duplicada). O índice é criado de forma assíncrona; a conferência espera ficar Active.
$chave = 'cr40f_linkidunico'
$temChave = $false
if ($tabela) { $temChave = @(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=LogicalName&`$filter=LogicalName eq '$chave'").Count -eq 1 }
if ($temChave) { Write-Step "chave alternativa $chave já existe" }
elseif ($SomenteValidar) { Write-Step "VALIDAR: criaria a chave alternativa $chave (cr40f_linkid)" }
else {
  Dv POST "EntityDefinitions(LogicalName='$entidade')/Keys" @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.EntityKeyMetadata'; SchemaName = 'cr40f_LinkIdUnico'; DisplayName = (Label 'Id do link único'); KeyAttributes = @('cr40f_linkid')
  } | Out-Null
  Write-Step "chave alternativa $chave criada (índice assíncrono)"
}

if ($SomenteValidar) {
  if ($tabela) { Write-Step "tabela na ${solutionName}: $(if (@(NaSolucao $tabela).Count) { 'sim' } else { 'não (seria incluída)' })" }
  Write-Output "VALIDAR OK: nada gravado no DEV; $(if ($tabela) { 'tabela já existe' } else { 'tabela ainda não existe (seria criada)' })."
  return
}

# Inclusão com subcomponentes (rootcomponentbehavior 0), como as demais tabelas da AppBetinhos.
if (-not @(NaSolucao $tabela).Count) {
  Dv POST AddSolutionComponent @{ ComponentId = $tabela.MetadataId; ComponentType = 1; SolutionUniqueName = $solutionName; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
  Write-Step "tabela incluída na $solutionName"
}
Dv POST PublishXml @{ ParameterXml = "<importexportxml><entities><entity>$entidade</entity></entities></importexportxml>" } | Out-Null

# Conferência por leitura de volta.
$set = (Dv GET "EntityDefinitions(LogicalName='$entidade')?`$select=EntitySetName").EntitySetName
if ($set -ne 'cr40f_avaliacaoservicos') { throw "EntitySetName inesperado: $set (o flow lê da metadata; confira a skill verificar-avaliacao)." }
$faltando = @(@('cr40f_name') + @($COLUNAS | ForEach-Object { $_.SchemaName.ToLower() }) + @($LOOKUPS | ForEach-Object { $_[2].ToLower() }) | Where-Object { -not (TemAtributo $entidade $_) })
if ($faltando.Count) { throw "Colunas ausentes após publicar: $($faltando -join ', ')" }
$n = Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='cr40f_nota')/Microsoft.Dynamics.CRM.IntegerAttributeMetadata?`$select=MinValue,MaxValue,RequiredLevel"
if ($n.MinValue -ne 1 -or $n.MaxValue -ne 5 -or $n.RequiredLevel.Value -ne 'ApplicationRequired') { throw "cr40f_nota ficou $($n.MinValue)-$($n.MaxValue)/$($n.RequiredLevel.Value) (esperado 1-5/ApplicationRequired)." }
$op = (Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='cr40f_classificacao')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)").OptionSet.Options
for ($i = 0; $i -lt $CLASSIFICACOES.Count; $i++) {
  $o = @($op | Where-Object { $_.Value -eq 100000000 + $i })
  if ($o.Count -ne 1 -or $o[0].Label.UserLocalizedLabel.Label -ne $CLASSIFICACOES[$i]) { throw "cr40f_classificacao sem $($CLASSIFICACOES[$i]) = $(100000000 + $i)." }
}
$status = ''
for ($i = 1; $i -le 20; $i++) {
  # A Web API não aceita Keys(LogicalName='...'); busca pela coleção filtrada.
  $status = "$(@(Rows "EntityDefinitions(LogicalName='$entidade')/Keys?`$select=LogicalName,EntityKeyIndexStatus&`$filter=LogicalName eq '$chave'") | Select-Object -First 1 -ExpandProperty EntityKeyIndexStatus)"
  if ($status -in 'Active', 'Failed') { break }
  Start-Sleep -Seconds 15
}
if ($status -ne 'Active') { throw "Chave $chave com índice $status (esperado Active). Confira no maker portal e rode de novo." }
$linha = @(NaSolucao $tabela)
if ($linha.Count -ne 1) { throw "Tabela $entidade não está na $solutionName." }
if ($linha[0].rootcomponentbehavior -ne 0) { Write-Step "AVISO: $entidade está na $solutionName sem subcomponentes (rootcomponentbehavior $($linha[0].rootcomponentbehavior))." }
Write-Output "DEV: $entidade ($set) criada, publicada e conferida na $solutionName. Próximo: provision-flow-avaliacao.ps1."
