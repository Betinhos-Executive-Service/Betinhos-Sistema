param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $TenantId = "organizations",
  [string] $ClientId = "",
  [switch] $DeviceCode,
  [switch] $NoPublish
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[publish-webresource] $Message" }
function Escape-OData([string] $Value) { return $Value.Replace("'", "''") }
function Publish-XmlWithRetry([hashtable] $Headers, [string] $ApiBaseUrl, [string] $ParameterXml, [string] $Label) {
  for ($attempt = 1; $attempt -le 7; $attempt++) {
    try {
      Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/PublishXml" -Headers $Headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $ParameterXml } | ConvertTo-Json) -ErrorAction Stop | Out-Null
      return
    }
    catch {
      $message = $_.Exception.Message
      if ($message -notmatch "0x80071151|another \[Import\] running" -or $attempt -eq 7) { throw }
      Write-Step "$Label bloqueado por importação concorrente; nova tentativa em 10s ($attempt/6)"
      Start-Sleep -Seconds 10
    }
  }
}
function Update-RecordWithRetry([hashtable] $Headers, [string] $Uri, [string] $Body, [string] $Label) {
  for ($attempt = 1; $attempt -le 7; $attempt++) {
    try {
      Invoke-RestMethod -Method Patch -Uri $Uri -Headers $Headers -ContentType "application/json; charset=utf-8" -Body $Body -ErrorAction Stop | Out-Null
      return
    }
    catch {
      $message = $_.Exception.Message
      if ($message -notmatch "0x80071151|0x80048543|another \[Import\] running|currently being imported" -or $attempt -eq 7) { throw }
      Write-Step "$Label bloqueado por importação concorrente; nova tentativa em 10s ($attempt/6)"
      Start-Sleep -Seconds 10
    }
  }
}

function Get-ResponseStatusCode($ErrorRecord) {
  try { return [int] $ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

function New-DataverseLabel([string] $Text) {
  return @{
    "@odata.type" = "Microsoft.Dynamics.CRM.Label"
    LocalizedLabels = @(@{
      "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"
      Label = $Text
      LanguageCode = 1046
    })
  }
}

function Get-EntityMetadata([hashtable] $Headers, [string] $ApiBaseUrl, [string] $LogicalName) {
  $escapedName = Escape-OData $LogicalName
  try {
    return Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$escapedName')?`$select=MetadataId,LogicalName,EntitySetName,PrimaryNameAttribute" -Headers $Headers -ErrorAction Stop
  }
  catch {
    if ((Get-ResponseStatusCode $_) -eq 404) { return $null }
    throw
  }
}

function Invoke-MetadataPost([hashtable] $Headers, [string] $Uri, [string] $Body, [string] $Label) {
  for ($attempt = 1; $attempt -le 7; $attempt++) {
    try {
      return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json; charset=utf-8" -Body $Body -ErrorAction Stop
    }
    catch {
      $message = $_.Exception.Message
      if ($message -notmatch "0x80040216|0x80060891|0x80071151|another customization operation|another \[Import\] running|currently being imported" -or $attempt -eq 7) { throw }
      Write-Step "$Label aguardando propagação de metadata; nova tentativa em 5s ($attempt/6)"
      Start-Sleep -Seconds 5
    }
  }
}

function Wait-EntityMetadata([hashtable] $Headers, [string] $ApiBaseUrl, [string] $LogicalName) {
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    $metadata = Get-EntityMetadata -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $LogicalName
    if ($metadata) { return $metadata }
    Start-Sleep -Seconds 3
  }
  throw "Metadata da tabela $LogicalName não ficou disponível após a criação."
}

function Ensure-PlannerTable([hashtable] $Headers, [string] $ApiBaseUrl, [string] $LogicalName, [string] $SchemaName, [string] $PrimaryName, [string] $DisplayName, [string] $CollectionName, [string] $EntitySetName) {
  $metadata = Get-EntityMetadata -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $LogicalName
  if (-not $metadata) {
    Write-Step "criando tabela $LogicalName na solution $solutionUniqueName"
    $body = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
      SchemaName = $SchemaName
      DisplayName = New-DataverseLabel $DisplayName
      DisplayCollectionName = New-DataverseLabel $CollectionName
      Description = New-DataverseLabel "Tabela própria do Planner interno."
      OwnershipType = "OrganizationOwned"
      HasActivities = $false
      HasNotes = $false
      IsActivity = $false
      PrimaryNameAttribute = $PrimaryName.ToLowerInvariant()
      Attributes = @(@{
        "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        SchemaName = $PrimaryName
        DisplayName = New-DataverseLabel "Nome"
        RequiredLevel = @{ Value = "ApplicationRequired" }
        MaxLength = 100
        IsPrimaryName = $true
      })
    } | ConvertTo-Json -Depth 12
    try {
      Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions" -Body $body -Label $LogicalName | Out-Null
    }
    catch {
      $metadata = Get-EntityMetadata -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $LogicalName
      if (-not $metadata) { throw }
    }
    $metadata = Wait-EntityMetadata -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $LogicalName
  }

  if ($metadata.PrimaryNameAttribute -ne $PrimaryName.ToLowerInvariant()) {
    throw "Tabela $LogicalName já existe, mas usa atributo principal '$($metadata.PrimaryNameAttribute)' em vez de '$($PrimaryName.ToLowerInvariant())'. Deploy abortado."
  }
  if ($EntitySetName -and $metadata.EntitySetName -ne $EntitySetName) {
    throw "Tabela $LogicalName já existe, mas EntitySetName é '$($metadata.EntitySetName)' em vez de '$EntitySetName'. Deploy abortado."
  }
  return $metadata
}

function Get-PlannerRelationships([hashtable] $Headers, [string] $ApiBaseUrl, [string] $ReferencingEntity) {
  $escapedEntity = Escape-OData $ReferencingEntity
  $relationships = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$escapedEntity')/ManyToOneRelationships?`$select=SchemaName,ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName" -Headers $Headers -ErrorAction Stop
  return @($relationships.value)
}

function Get-PlannerRelationship([hashtable] $Headers, [string] $ApiBaseUrl, [string] $ReferencingEntity, [string] $ReferencingAttribute, [string] $ReferencedEntity) {
  return @(Get-PlannerRelationships -Headers $Headers -ApiBaseUrl $ApiBaseUrl -ReferencingEntity $ReferencingEntity) | Where-Object {
    $_.ReferencingAttribute -ieq $ReferencingAttribute -and $_.ReferencedEntity -ieq $ReferencedEntity
  } | Select-Object -First 1
}

function Ensure-PlannerRelationship([hashtable] $Headers, [string] $ApiBaseUrl, [string] $SchemaName, [string] $ReferencingEntity, [string] $ReferencingAttribute, [string] $ReferencedEntity, [string] $DisplayName) {
  $relationships = Get-PlannerRelationships -Headers $Headers -ApiBaseUrl $ApiBaseUrl -ReferencingEntity $ReferencingEntity
  $existingForAttribute = @($relationships) | Where-Object { $_.ReferencingAttribute -ieq $ReferencingAttribute } | Select-Object -First 1
  if ($existingForAttribute -and $existingForAttribute.ReferencedEntity -ine $ReferencedEntity) {
    throw "Lookup $ReferencingEntity.$($ReferencingAttribute.ToLowerInvariant()) já aponta para '$($existingForAttribute.ReferencedEntity)', mas o contrato exige '$ReferencedEntity'. Deploy abortado; não altere nem apague o lookup existente automaticamente."
  }
  $existing = @($relationships) | Where-Object {
    $_.ReferencingAttribute -ieq $ReferencingAttribute -and $_.ReferencedEntity -ieq $ReferencedEntity
  } | Select-Object -First 1
  if ($existing) { return }

  Write-Step "criando relacionamento $SchemaName"
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
    SchemaName = $SchemaName
    ReferencedEntity = $ReferencedEntity
    ReferencingEntity = $ReferencingEntity
    Lookup = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
      SchemaName = $ReferencingAttribute
      DisplayName = New-DataverseLabel $DisplayName
      RequiredLevel = @{ Value = "None" }
    }
    CascadeConfiguration = @{
      Delete = "RemoveLink"
      Assign = "NoCascade"
      Share = "NoCascade"
      Unshare = "NoCascade"
      Merge = "NoCascade"
      Reparent = "NoCascade"
    }
  } | ConvertTo-Json -Depth 12
  try {
    Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/RelationshipDefinitions" -Body $body -Label $SchemaName | Out-Null
  }
  catch {
    $existing = Get-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -ReferencingEntity $ReferencingEntity -ReferencingAttribute $ReferencingAttribute -ReferencedEntity $ReferencedEntity
    if (-not $existing) { throw }
  }
}

function Get-PlannerAttribute([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $LogicalName) {
  $escapedEntity = Escape-OData $Entity
  $escapedAttribute = Escape-OData $LogicalName
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$escapedEntity')/Attributes(LogicalName='$escapedAttribute')?`$select=LogicalName" -Headers $Headers -ErrorAction Stop
    }
    catch {
      $status = Get-ResponseStatusCode $_
      if ($status -eq 404) { return $null }
      if ($attempt -eq 3 -or ($status -ne 0 -and $status -ne 429 -and $status -lt 500)) { throw }
      Write-Step "falha temporária ao consultar $Entity.$LogicalName; nova tentativa ($attempt/2)"
      Start-Sleep -Seconds (2 * $attempt)
    }
  }
}

function Ensure-PlannerStringAttribute([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $SchemaName, [string] $DisplayName, [int] $MaxLength = 500) {
  $logicalName = $SchemaName.ToLowerInvariant()
  if (Get-PlannerAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $Entity -LogicalName $logicalName) { return }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
    SchemaName = $SchemaName
    DisplayName = New-DataverseLabel $DisplayName
    RequiredLevel = @{ Value = "None" }
    MaxLength = $MaxLength
  } | ConvertTo-Json -Depth 10
  Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" -Body $body -Label "$Entity.$logicalName" | Out-Null
}

function Ensure-PlannerDateAttribute([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $SchemaName, [string] $DisplayName, [string] $Format = "DateAndTime") {
  $logicalName = $SchemaName.ToLowerInvariant()
  if (Get-PlannerAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $Entity -LogicalName $logicalName) { return }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
    SchemaName = $SchemaName
    DisplayName = New-DataverseLabel $DisplayName
    RequiredLevel = @{ Value = "None" }
    Format = $Format
    DateTimeBehavior = @{ Value = if ($Format -eq "DateOnly") { "DateOnly" } else { "UserLocal" } }
  } | ConvertTo-Json -Depth 10
  Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" -Body $body -Label "$Entity.$logicalName" | Out-Null
}

function Ensure-PlannerMemoAttribute([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $SchemaName, [string] $DisplayName) {
  $logicalName = $SchemaName.ToLowerInvariant()
  if (Get-PlannerAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $Entity -LogicalName $logicalName) { return }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"
    SchemaName = $SchemaName
    DisplayName = New-DataverseLabel $DisplayName
    RequiredLevel = @{ Value = "None" }
    Format = "TextArea"
    MaxLength = 1048576
  } | ConvertTo-Json -Depth 10
  Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" -Body $body -Label "$Entity.$logicalName" | Out-Null
}

function Ensure-PlannerBooleanAttribute([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $SchemaName, [string] $DisplayName) {
  $logicalName = $SchemaName.ToLowerInvariant()
  if (Get-PlannerAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $Entity -LogicalName $logicalName) { return }
  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
    SchemaName = $SchemaName
    DisplayName = New-DataverseLabel $DisplayName
    RequiredLevel = @{ Value = "None" }
    OptionSet = @{
      "@odata.type" = "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"
      TrueOption = @{ Value = 1; Label = New-DataverseLabel "Sim" }
      FalseOption = @{ Value = 0; Label = New-DataverseLabel "Não" }
      DefaultValue = $false
    }
  } | ConvertTo-Json -Depth 10
  Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$Entity')/Attributes" -Body $body -Label "$Entity.$logicalName" | Out-Null
}

function Ensure-QuoteScenarioSchema([hashtable] $Headers, [string] $ApiBaseUrl) {
  $option = "cr40f_cotacaoopcao"
  $item = "cr40f_cotacaoopcaoitem"
  $version = "cr40f_cotacaopropostaversao"
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $option -SchemaName "cr40f_CotacaoOpcao" -PrimaryName "cr40f_Nome" -DisplayName "Opção de cotação" -CollectionName "Opções de cotação" -EntitySetName "" | Out-Null
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $item -SchemaName "cr40f_CotacaoOpcaoItem" -PrimaryName "cr40f_Nome" -DisplayName "Veículo da opção" -CollectionName "Veículos das opções" -EntitySetName "" | Out-Null
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName $version -SchemaName "cr40f_CotacaoPropostaVersao" -PrimaryName "cr40f_Nome" -DisplayName "Versão da proposta" -CollectionName "Versões das propostas" -EntitySetName "" | Out-Null
  Ensure-PlannerMemoAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $option -SchemaName "cr40f_Conteudo" -DisplayName "Dados da opção"
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $option -SchemaName "cr40f_Revisao" -DisplayName "Revisão atual" -MaxLength 36
  Ensure-PlannerMemoAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $item -SchemaName "cr40f_Conteudo" -DisplayName "Dados do veículo"
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $item -SchemaName "cr40f_Revisao" -DisplayName "Revisão atual" -MaxLength 36
  Ensure-PlannerMemoAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $version -SchemaName "cr40f_Conteudo" -DisplayName "Conteúdo enviado"
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $version -SchemaName "cr40f_AutorNome" -DisplayName "Autor da versão" -MaxLength 200
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $version -SchemaName "cr40f_AutorId" -DisplayName "Identificador do autor" -MaxLength 100
  Ensure-PlannerDateAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity $version -SchemaName "cr40f_EnviadoEm" -DisplayName "Registrado em"
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity "cr40f_pedidodecotacao" -SchemaName "cr40f_OpcoesVersao" -DisplayName "Revisão das opções" -MaxLength 36
  Ensure-PlannerStringAttribute -Headers $Headers -ApiBaseUrl $ApiBaseUrl -Entity "cr40f_pedidodecotacao" -SchemaName "cr40f_OpcaoAceitaId" -DisplayName "Identificador da opção aceita" -MaxLength 100
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_CotacaoOpcao_Pedido" -ReferencingEntity $option -ReferencingAttribute "cr40f_PedidoCotacao" -ReferencedEntity "cr40f_pedidodecotacao" -DisplayName "Cotação"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_CotacaoOpcaoItem_Opcao" -ReferencingEntity $item -ReferencingAttribute "cr40f_Opcao" -ReferencedEntity $option -DisplayName "Opção"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_CotacaoPropostaVersao_Pedido" -ReferencingEntity $version -ReferencingAttribute "cr40f_PedidoCotacao" -ReferencedEntity "cr40f_pedidodecotacao" -DisplayName "Cotação"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PedidoCotacao_OpcaoAceita" -ReferencingEntity "cr40f_pedidodecotacao" -ReferencingAttribute "cr40f_OpcaoAceita" -ReferencedEntity $option -DisplayName "Opção aceita"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PedidoCotacao_VersaoAceita" -ReferencingEntity "cr40f_pedidodecotacao" -ReferencingAttribute "cr40f_VersaoPropostaAceita" -ReferencedEntity $version -DisplayName "Versão aceita"
}

function Ensure-PlannerAlternateKey([hashtable] $Headers, [string] $ApiBaseUrl, [string] $Entity, [string] $SchemaName, [string] $DisplayName, [string] $Attribute) {
  $escapedEntity = Escape-OData $Entity
  $keys = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$escapedEntity')/Keys?`$select=SchemaName,KeyAttributes" -Headers $Headers -ErrorAction Stop
  $existing = @($keys.value) | Where-Object { @($_.KeyAttributes) -contains $Attribute.ToLowerInvariant() } | Select-Object -First 1
  if ($existing) { return }
  $body = @{
    SchemaName = $SchemaName
    DisplayName = New-DataverseLabel $DisplayName
    KeyAttributes = @($Attribute.ToLowerInvariant())
  } | ConvertTo-Json -Depth 10
  Invoke-MetadataPost -Headers $Headers -Uri "$ApiBaseUrl/EntityDefinitions(LogicalName='$escapedEntity')/Keys" -Body $body -Label "$Entity.$Attribute" | Out-Null
}

function Ensure-PlannerSchemaAttributes([hashtable] $Headers, [string] $ApiBaseUrl) {
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl "cr40f_pedidodecotacao" "cr40f_MotivoPerda" "Motivo da perda" 1000
  $team = "cr40f_plannerequipe"
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $team "cr40f_Icone" "Ícone da equipe" 100
  $task = "cr40f_plannertarefa"
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $task "cr40f_ChecklistJson" "Checklist importado" 4000
  $notification = "cr40f_plannernotificacao"
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $notification "cr40f_Titulo" "Título" 200
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $notification "cr40f_Mensagem" "Mensagem" 2000
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $notification "cr40f_Tipo" "Tipo" 100
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $notification "cr40f_ChaveDedupe" "Chave de deduplicação" 500
  Ensure-PlannerDateAttribute $Headers $ApiBaseUrl $notification "cr40f_OcorridoEm" "Ocorrido em"
  Ensure-PlannerDateAttribute $Headers $ApiBaseUrl $notification "cr40f_LidoEm" "Lido em"
  Ensure-PlannerDateAttribute $Headers $ApiBaseUrl $notification "cr40f_DataReferencia" "Data de referência" "DateOnly"
  Ensure-PlannerRelationship $Headers $ApiBaseUrl "cr40f_PlannerNotificacao_Tarefa" $notification "cr40f_Tarefa" "cr40f_plannertarefa" "Tarefa"
  Ensure-PlannerRelationship $Headers $ApiBaseUrl "cr40f_PlannerNotificacao_Destinatario" $notification "cr40f_Destinatario" "cr40f_funcionarios" "Destinatário"
  Ensure-PlannerRelationship $Headers $ApiBaseUrl "cr40f_PlannerNotificacao_Evento" $notification "cr40f_EventoOrigem" "cr40f_plannertarefaevento" "Evento de origem"
  Ensure-PlannerAlternateKey $Headers $ApiBaseUrl $notification "cr40f_PlannerNotificacao_DedupeKey" "Chave de deduplicação" "cr40f_chavededupe"

  $dispatch = "cr40f_plannerdisparo"
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_DestinatarioTexto" "Destinatário" 200
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_Canal" "Canal" 100
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_Categoria" "Categoria" 100
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_ChaveIdempotente" "Chave idempotente" 500
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_StatusTexto" "Status" 100
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_Erro" "Erro" 2000
  Ensure-PlannerStringAttribute $Headers $ApiBaseUrl $dispatch "cr40f_IdentificadorExterno" "Identificador externo" 500
  Ensure-PlannerDateAttribute $Headers $ApiBaseUrl $dispatch "cr40f_EnviadoEm" "Enviado em"
  Ensure-PlannerAlternateKey $Headers $ApiBaseUrl $dispatch "cr40f_PlannerDisparo_IdempotencyKey" "Chave idempotente" "cr40f_chaveidempotente"
}

function Ensure-PlannerSchema([hashtable] $Headers, [string] $ApiBaseUrl) {
  Ensure-QuoteScenarioSchema -Headers $Headers -ApiBaseUrl $ApiBaseUrl
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName "cr40f_plannerequipe" -SchemaName "cr40f_PlannerEquipe" -PrimaryName "cr40f_Nome" -DisplayName "Equipe do Planner" -CollectionName "Equipes do Planner" -EntitySetName "cr40f_plannerequipes" | Out-Null
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerEquipe_ResponsavelPrincipal" -ReferencingEntity "cr40f_plannerequipe" -ReferencingAttribute "cr40f_ResponsavelPrincipal" -ReferencedEntity "cr40f_funcionarios" -DisplayName "Responsável principal"
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName "cr40f_plannerequipemembro" -SchemaName "cr40f_PlannerEquipeMembro" -PrimaryName "cr40f_Name" -DisplayName "Membro da Equipe do Planner" -CollectionName "Membros das Equipes do Planner" -EntitySetName "cr40f_plannerequipemembros" | Out-Null
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerEquipeMembro_Equipe" -ReferencingEntity "cr40f_plannerequipemembro" -ReferencingAttribute "cr40f_Equipe" -ReferencedEntity "cr40f_plannerequipe" -DisplayName "Equipe"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerEquipeMembro_Funcionario" -ReferencingEntity "cr40f_plannerequipemembro" -ReferencingAttribute "cr40f_Funcionario" -ReferencedEntity "cr40f_funcionarios" -DisplayName "Funcionário"
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName "cr40f_plannertarefaequipe" -SchemaName "cr40f_PlannerTarefaEquipe" -PrimaryName "cr40f_Name" -DisplayName "Equipe da tarefa Planner" -CollectionName "Equipes das tarefas Planner" -EntitySetName "cr40f_plannertarefaequipes" | Out-Null
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerTarefaEquipe_Tarefa" -ReferencingEntity "cr40f_plannertarefaequipe" -ReferencingAttribute "cr40f_Tarefa" -ReferencedEntity "cr40f_plannertarefa" -DisplayName "Tarefa"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerTarefaEquipe_Equipe" -ReferencingEntity "cr40f_plannertarefaequipe" -ReferencingAttribute "cr40f_Equipe" -ReferencedEntity "cr40f_plannerequipe" -DisplayName "Equipe"
  Ensure-PlannerRelationship -Headers $Headers -ApiBaseUrl $ApiBaseUrl -SchemaName "cr40f_PlannerTarefa_EquipePlanner" -ReferencingEntity "cr40f_plannertarefa" -ReferencingAttribute "cr40f_EquipePlanner" -ReferencedEntity "cr40f_plannerequipe" -DisplayName "Equipe do Planner"
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName "cr40f_plannernotificacao" -SchemaName "cr40f_PlannerNotificacao" -PrimaryName "cr40f_Name" -DisplayName "Notificação do Planner" -CollectionName "Notificações do Planner" -EntitySetName "cr40f_plannernotificacaos" | Out-Null
  Ensure-PlannerTable -Headers $Headers -ApiBaseUrl $ApiBaseUrl -LogicalName "cr40f_plannerdisparo" -SchemaName "cr40f_PlannerDisparo" -PrimaryName "cr40f_Name" -DisplayName "Disparo do Planner" -CollectionName "Disparos do Planner" -EntitySetName "cr40f_plannerdisparos" | Out-Null
  Ensure-PlannerSchemaAttributes -Headers $Headers -ApiBaseUrl $ApiBaseUrl
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$environmentBaseUrl = $EnvironmentUrl.TrimEnd("/")
$apiBaseUrl = "$environmentBaseUrl/api/data/v9.2"
$solutionUniqueName = "AppBetinhos"
$resourceName = "new_TelaPlanner.html"
$resourcePath = Join-Path $root "dist\webresource.html"
$redirectResourceName = "new_TelaPlanner_redirect.html"
$redirectResourcePath = Join-Path $root "dist\redirect.html"
$sitemapId = "787c8fda-53d0-f011-8543-6045bd3a51ea"
$operationalGroupId = "group_16b0a016"
$plannerSubAreaId = "subarea_tela_planner"

$configuredClientId = [Environment]::GetEnvironmentVariable("DV_CLIENT_ID")
if ([string]::IsNullOrWhiteSpace($ClientId) -and -not [string]::IsNullOrWhiteSpace($configuredClientId)) {
  $ClientId = $configuredClientId
}
if ([string]::IsNullOrWhiteSpace($ClientId)) {
  $ClientId = "51f81489-12ee-4a9e-aaae-a2591f45987d"
}
$clientIdGuid = [Guid]::Empty
if (-not [Guid]::TryParse($ClientId, [ref] $clientIdGuid)) {
  throw "ClientId inválido: '$ClientId'. Informe um GUID Azure AD em -ClientId."
}
$ClientId = $clientIdGuid.ToString()

if (-not (Test-Path -LiteralPath $resourcePath)) { throw "Webresource não encontrado: $resourcePath. Execute npm run build primeiro." }
if (-not (Test-Path -LiteralPath $redirectResourcePath)) { throw "Redirect bridge não encontrado: $redirectResourcePath. Execute npm run build primeiro." }
if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Módulo MSAL.PS não encontrado. Instale com: Install-Module MSAL.PS -Scope CurrentUser" }
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
if (-not (Get-Command Import-PowerShellDataFile -ErrorAction SilentlyContinue)) {
  function global:Import-PowerShellDataFile([string] $Path) {
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref] $tokens, [ref] $parseErrors)
    if ($parseErrors.Count) { throw "Manifest PowerShell inválido: $Path" }
    $hash = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.HashtableAst] }, $true)
    if (-not $hash) { throw "Manifest PowerShell sem Hashtable: $Path" }
    $result = @{}
    foreach ($pair in $hash.KeyValuePairs) { $result[$pair.Item1.Value] = $pair.Item2.SafeGetValue() }
    return $result
  }
}
Import-Module MSAL.PS -ErrorAction Stop

Write-Step "validando solution $solutionUniqueName"
$scope = "$environmentBaseUrl/user_impersonation"
$clientApplication = New-MsalClientApplication -ClientId $ClientId -TenantId $TenantId -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $clientApplication
try { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -Silent }
catch {
  if ($DeviceCode) { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -DeviceCode }
  else { $tokenResult = Get-MsalToken -PublicClientApplication $clientApplication -Scopes $scope -Interactive }
}
if ([string]::IsNullOrWhiteSpace($tokenResult.AccessToken)) { throw "Falha ao obter token MSAL para $scope" }

$headers = @{
  Authorization = "Bearer $($tokenResult.AccessToken)"
  Accept = "application/json"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
  "MSCRM.SolutionUniqueName" = $solutionUniqueName
}
$solutionFilter = Escape-OData $solutionUniqueName
$solution = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/solutions?`$select=solutionid,uniquename&`$filter=uniquename eq '$solutionFilter'" -Headers $headers
if (-not $solution.value -or $solution.value.Count -eq 0) { throw "Solution $solutionUniqueName não encontrada. Deploy abortado." }
if ($solution.value.Count -gt 1) { throw "Mais de uma solution $solutionUniqueName encontrada. Deploy abortado." }

Write-Step "validando schema do Planner"
Ensure-PlannerSchema -Headers $headers -ApiBaseUrl $apiBaseUrl

$escapedName = Escape-OData $resourceName
$lookupUri = "$apiBaseUrl/webresourceset?`$select=webresourceid,name,displayname,webresourcetype&`$filter=name eq '$escapedName'"
$lookup = Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers
if ($lookup.value -and $lookup.value.Count -gt 1) { throw "Mais de um WebResource encontrado para $resourceName. Deploy abortado." }

$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($resourcePath))
$body = @{ name = $resourceName; displayname = "Tela Planner"; webresourcetype = 1; content = $content } | ConvertTo-Json -Depth 4
$webResourceId = $null

if (-not $lookup.value -or $lookup.value.Count -eq 0) {
  Write-Step "criando $resourceName na solution $solutionUniqueName"
  Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/webresourceset" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body | Out-Null
  $lookup = Invoke-RestMethod -Method Get -Uri $lookupUri -Headers $headers
  $webResourceId = $lookup.value[0].webresourceid
}
else {
  $webResourceId = $lookup.value[0].webresourceid
  if ($lookup.value[0].webresourcetype -ne 1) { throw "$resourceName já existe, mas não é HTML. Deploy abortado." }
  Write-Step "atualizando $resourceName"
  Update-RecordWithRetry -Headers $headers -Uri "$apiBaseUrl/webresourceset($webResourceId)" -Body (@{ displayname = "Tela Planner"; content = $content } | ConvertTo-Json) -Label $resourceName
}

$escapedRedirectName = Escape-OData $redirectResourceName
$redirectLookupUri = "$apiBaseUrl/webresourceset?`$select=webresourceid,name,displayname,webresourcetype&`$filter=name eq '$escapedRedirectName'"
$redirectLookup = Invoke-RestMethod -Method Get -Uri $redirectLookupUri -Headers $headers
if ($redirectLookup.value -and $redirectLookup.value.Count -gt 1) { throw "Mais de um WebResource encontrado para $redirectResourceName. Deploy abortado." }

$redirectContent = [Convert]::ToBase64String([IO.File]::ReadAllBytes($redirectResourcePath))
$redirectBody = @{ name = $redirectResourceName; displayname = "Tela Planner - MSAL redirect"; webresourcetype = 1; content = $redirectContent } | ConvertTo-Json -Depth 4
$redirectResourceId = $null

if (-not $redirectLookup.value -or $redirectLookup.value.Count -eq 0) {
  Write-Step "criando $redirectResourceName na solution $solutionUniqueName"
  Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/webresourceset" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $redirectBody | Out-Null
  $redirectLookup = Invoke-RestMethod -Method Get -Uri $redirectLookupUri -Headers $headers
  $redirectResourceId = $redirectLookup.value[0].webresourceid
}
else {
  $redirectResourceId = $redirectLookup.value[0].webresourceid
  if ($redirectLookup.value[0].webresourcetype -ne 1) { throw "$redirectResourceName já existe, mas não é HTML. Deploy abortado." }
  Write-Step "atualizando $redirectResourceName"
  Update-RecordWithRetry -Headers $headers -Uri "$apiBaseUrl/webresourceset($redirectResourceId)" -Body (@{ displayname = "Tela Planner - MSAL redirect"; content = $redirectContent } | ConvertTo-Json) -Label $redirectResourceName
}

if (-not $NoPublish) {
  Write-Step "publicando $resourceName"
  $publishXml = "<importexportxml><webresources><webresource>$webResourceId</webresource></webresources></importexportxml>"
  Publish-XmlWithRetry -Headers $headers -ApiBaseUrl $apiBaseUrl -ParameterXml $publishXml -Label $resourceName

  Write-Step "publicando $redirectResourceName"
  $redirectPublishXml = "<importexportxml><webresources><webresource>$redirectResourceId</webresource></webresources></importexportxml>"
  Publish-XmlWithRetry -Headers $headers -ApiBaseUrl $apiBaseUrl -ParameterXml $redirectPublishXml -Label $redirectResourceName

  Write-Step "validando navegação do app Model Driven Betinhos"
  $sitemap = Invoke-RestMethod -Method Get -Uri "$apiBaseUrl/sitemaps($sitemapId)?`$select=sitemapxml" -Headers $headers
  $sitemapXml = [string] $sitemap.sitemapxml
  if ([string]::IsNullOrWhiteSpace($sitemapXml)) { throw "Sitemap $sitemapId não retornou XML. Deploy abortado." }

  if ($sitemapXml -notmatch [regex]::Escape("Id=`"$plannerSubAreaId`"")) {
    $groupPattern = '(<Group\b[^>]*\bId="' + $operationalGroupId + '"[^>]*>[\s\S]*?)(</Group>)'
    $groupMatch = [regex]::Match($sitemapXml, $groupPattern)
    if (-not $groupMatch.Success) { throw "Grupo Operacional não encontrado no sitemap. Deploy abortado." }

    $plannerSubArea = '<SubArea Id="subarea_tela_planner" ResourceId="SitemapDesigner.NewSubArea" VectorIcon="/WebResources/cr40f_sitemap_clipboard_list.svg" Icon="/_imgs/imagestrips/transparent_spacer.gif" Url="$webresource:new_TelaPlanner.html" Client="All,Outlook,OutlookLaptopClient,OutlookWorkstationClient,Web" AvailableOffline="true" PassParams="false" Sku="All,OnPremise,Live,SPLA"><Titles><Title LCID="1046" Title="Planner" /></Titles></SubArea>'
    $replacement = $groupMatch.Groups[1].Value + $plannerSubArea + $groupMatch.Groups[2].Value
    $updatedSitemapXml = $sitemapXml.Remove($groupMatch.Index, $groupMatch.Length).Insert($groupMatch.Index, $replacement)
    Update-RecordWithRetry -Headers $headers -Uri "$apiBaseUrl/sitemaps($sitemapId)" -Body (@{ sitemapxml = $updatedSitemapXml } | ConvertTo-Json) -Label "Sitemap"
    Write-Step "Planner adicionado ao grupo Operacional"
  }
  else {
    Write-Step "Planner já está no grupo Operacional; nenhuma duplicação feita"
  }

  Write-Step "publicando sitemap do app"
  $sitemapPublishXml = "<importexportxml><sitemaps><sitemap>$sitemapId</sitemap></sitemaps></importexportxml>"
  Publish-XmlWithRetry -Headers $headers -ApiBaseUrl $apiBaseUrl -ParameterXml $sitemapPublishXml -Label "Sitemap"
}

Write-Step "concluído: $resourceName ($webResourceId) e $redirectResourceName ($redirectResourceId)"
