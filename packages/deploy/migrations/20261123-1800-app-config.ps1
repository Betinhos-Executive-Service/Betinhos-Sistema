param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Configuracao do App Motoristas (fase A, base): duas tabelas na BetinhosCore, pertencentes a organizacao, com auditoria do Dataverse.
#   cr40f_appconfigversao - uma linha por versao da matriz (estado Rascunho/Publicada/Substituida, conteudo JSON, chave alternativa cr40f_numero);
#   cr40f_appconfigpessoa - uma linha por excecao ou por entrada no grupo piloto (nunca excluida: encerrar grava cr40f_encerradoem).
# Sem privilegio de Create, Write ou Delete para nenhum papel: so o Cr40f.Acesso.Plugin grava (como SYSTEM). Esta migration nao cria papel nem
# concede Read a ninguem: o Administrador do Sistema le (o Dataverse da todos os privilegios da tabela nova a esse papel).
# Valores das choices (contrato do plugin e da tela): ordem fixa; so acrescentar no fim.
# Registros sao dado de cada ambiente e nao entram em solucao; esta migration nao grava registro nenhum.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes (tabelas e chave vao para a BetinhosCore).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

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

$versao = "cr40f_appconfigversao"
$pessoa = "cr40f_appconfigpessoa"

$colunasVersao = @(
  (Inteiro "cr40f_numero" "Número" "Número da versão (1, 2, 3...). Vazio no rascunho; o primeiro Publicar cria a versão 1." 1 1000000),
  (Escolha "cr40f_estado" "Estado" "Rascunho, Publicada ou Substituída. No máximo um rascunho e uma publicada." @("Rascunho", "Publicada", "Substituída") "ApplicationRequired"),
  (Memo "cr40f_conteudo" "Conteúdo" "Matriz em JSON: { proprio: { chave: true|false }, terceiro: { ... } }. Administrador não entra: é sempre ligado." 100000),
  (Texto "cr40f_nota" "Nota" "Nota da publicação." 500),
  (DataHora "cr40f_publicadoem" "Publicado em" "Quando a versão foi publicada.")
)
$colunasPessoa = @(
  (Escolha "cr40f_tipo" "Tipo" "Exceção de uma chave ou entrada no grupo piloto." @("Exceção", "Piloto") "ApplicationRequired"),
  (Texto "cr40f_chave" "Chave" "Chave do catálogo da exceção (vazio no piloto)." 100),
  (SimNao "cr40f_ligado" "Ligado" "Valor da exceção: ligado (Sim) ou desligado (Não)."),
  (Texto "cr40f_motivo" "Motivo" "Por que a exceção existe. Obrigatório na exceção." 500),
  (SoData "cr40f_validade" "Validade" "Último dia em que a exceção vale (America/Sao_Paulo). Vazio = sem validade."),
  (DataHora "cr40f_encerradoem" "Encerrado em" "Quando a exceção ou a entrada no piloto foi encerrada. Linhas nunca são excluídas.")
)

$entVersao = Garantir-Tabela $versao "cr40f_AppConfigVersao" "Versão da configuração do App" "Versões da configuração do App" "Versão da matriz de módulos e funções do App Motoristas por perfil (rascunho, publicada, substituída)." $false $colunasVersao
$entPessoa = Garantir-Tabela $pessoa "cr40f_AppConfigPessoa" "Exceção da configuração do App" "Exceções da configuração do App" "Exceção de um motorista a uma chave da configuração do App Motoristas, ou entrada dele no grupo piloto." $false $colunasPessoa

# Lookups (Restrict). Funcionario e obrigatorio; os usuarios (systemuser) guardam quem publicou, alterou, criou e encerrou.
if ($Apply -or $entPessoa) {
  Garantir-Lookup "cr40f_funcionarios_cr40f_appconfigpessoa_funcionario" "cr40f_funcionarios" $pessoa "cr40f_Funcionario" "Funcionário" "Motorista da exceção ou do grupo piloto." "ApplicationRequired"
  Garantir-Lookup "cr40f_systemuser_appconfigpessoa_criadopor" "systemuser" $pessoa "cr40f_CriadoPor" "Criado por" "Quem criou a exceção." "None"
  Garantir-Lookup "cr40f_systemuser_appconfigpessoa_encerradopor" "systemuser" $pessoa "cr40f_EncerradoPor" "Encerrado por" "Quem encerrou a exceção." "None"
}
if ($Apply -or $entVersao) {
  Garantir-Lookup "cr40f_systemuser_appconfigversao_publicadopor" "systemuser" $versao "cr40f_PublicadoPor" "Publicado por" "Quem publicou a versão." "None"
  Garantir-Lookup "cr40f_systemuser_appconfigversao_alteradopor" "systemuser" $versao "cr40f_AlteradoPor" "Alterado por" "Quem alterou o rascunho por último." "None"
}
if (-not $Apply) { Write-Step "dry-run: nada gravado (chave, auditoria e solucao so com -Apply)."; return }

# Chave alternativa do numero da versao: impede duas versoes com o mesmo numero (duas publicacoes ao mesmo tempo: a segunda falha).
$chaves = @(@((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$versao')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq "cr40f_numero" })
if ($chaves.Count -eq 0) {
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$versao')/Keys" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = "cr40f_numero"
    DisplayName = (Label (U "Número da versão")); KeyAttributes = @("cr40f_numero")
  } | Out-Null
  $chaves = @(@((Invoke-Dv "GET" "EntityDefinitions(LogicalName='$versao')/Keys?`$select=MetadataId,SchemaName,EntityKeyIndexStatus").value) | Where-Object { $_.SchemaName -eq "cr40f_numero" })
  if ($chaves.Count -ne 1) { throw "Chave alternativa cr40f_numero nao apareceu depois do POST." }
  Write-Step "criada a chave alternativa $versao.cr40f_numero (indice montado em segundo plano)"
}
if ($chaves[0].EntityKeyIndexStatus -eq "Failed") { throw "Chave cr40f_numero com indice em falha; corrija os registros e reative no maker portal." }

# Auditoria da tabela (as colunas novas ja nascem auditaveis). A auditoria da organizacao nao e tocada.
function Ligar-Auditoria([string] $Tabela) {
  $path = "EntityDefinitions(LogicalName='$Tabela')"
  $meta = Invoke-Dv "GET" $path
  if ($meta.IsAuditEnabled.Value) { return }
  $meta.IsAuditEnabled.Value = $true
  $corpo = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata" }
  foreach ($p in $meta.PSObject.Properties) { if ($p.Name -notlike "@odata.*") { $corpo[$p.Name] = $p.Value } }
  Invoke-Dv "PUT" "EntityDefinitions($($meta.MetadataId))" $corpo | Out-Null
  if (-not (Invoke-Dv "GET" "$path`?`$select=IsAuditEnabled").IsAuditEnabled.Value) { throw "Auditoria nao ligou em $Tabela." }
  Write-Step "auditoria ligada em $Tabela"
}
Ligar-Auditoria $versao
Ligar-Auditoria $pessoa

$entidades = @($entVersao, $entPessoa)
foreach ($e in $entidades) { Add-ComponenteNaSolucao $e.MetadataId 1 }
Add-ComponenteNaSolucao $chaves[0].MetadataId 14
Publish-Tabela $versao
Publish-Tabela $pessoa
Write-Step "OK: $versao (chave cr40f_numero) e $pessoa na solucao $script:SolucaoDev, com auditoria. Nenhum papel recebeu privilegio."
