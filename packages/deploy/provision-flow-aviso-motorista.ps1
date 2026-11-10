param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [switch] $Apply
)

# Somente DEV: o PROD recebe os flows pelas solucoes (BetinhosAutomacao).
if (([Uri]$EnvironmentUrl).Host -ne "org23b93544.crm2.dynamics.com") { throw "Somente DEV." }

# Flows do aviso ao motorista (ver apps/motoristas/docs/virada-aviso-motorista.md e vigia-janela-saida.md). O plugin
# grava new_avisomotorista na transacao da reserva; estes flows so entregam e vigiam. Nenhum deles le a tabela audit.
# - "Flow Aviso Motorista | Enviar": aviso em Pendente -> push (Power Apps + Web Push) -> Enviado, Falhou ou Sem app.
# - "Flow Aviso Motorista | Vigia": a cada 10 min concilia Visto/Cancelado, reenvia o push ao motorista 4 h antes da
#   saida e alerta a operacao 3 h antes (reenvio = volta o aviso para Pendente, assim o texto do push mora so no Enviar).
# Flow novo nasce DESLIGADO; flow ligado continua ligado (a definicao e regravada desligando e religando).
# O workflow Deploy roda este script com -Apply quando ele muda (packages/deploy/flows-dev.mjs).
# Dry-run por padrao. Idempotente. Requer az login com acesso ao DEV.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sendName = "Flow Aviso Motorista | Enviar"
$watchName = "Flow Aviso Motorista | Vigia"
$tz = "E. South America Standard Time"
$table = "new_avisomotoristas"
$servicesTable = "cr40f_reservadeveculoses"
$employeesTable = "cr40f_funcionarioses"
$subscriptionsTable = "new_inscricaopushmotoristas"
$tipoNovo = 100000000
$pendente = 100000000
$enviado = 100000001
$falhou = 100000002
$semApp = 100000003
$visto = 100000004
$cancelado = 100000005
$programado = 202410005

function Write-Step([string] $Message) { Write-Host "[aviso-motorista-flows] $Message" }

$baseUrl = $EnvironmentUrl.TrimEnd("/")
$token = & az account get-access-token --resource "$baseUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token do Dataverse DEV indisponivel (rode az login)." }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "MSCRM.SolutionUniqueName" = $SolutionUniqueName }

function Read-Dv([string] $Path) { return Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers }
function Write-Dv([string] $Method, [string] $Path, $Payload) {
  $writeHeaders = $headers.Clone()
  if ($Method -eq "PATCH") { $writeHeaders["If-Match"] = "*" }
  $body = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 100 -Compress))
  try { return Invoke-RestMethod -Method $Method -Uri "$api/$Path" -Headers $writeHeaders -ContentType "application/json; charset=utf-8" -Body $body }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $Path falhou: $detail"
  }
}
function Get-Flow([string] $Name) {
  $filter = [Uri]::EscapeDataString("name eq '$Name' and category eq 5")
  $rows = @((Read-Dv "workflows?`$select=workflowid,name,statecode,clientdata&`$filter=$filter").value)
  if ($rows.Count -gt 1) { throw "Flow duplicado: $Name" }
  return $rows
}
function Get-SourceFlow([string] $Filter) {
  $rows = @((Read-Dv "workflows?`$select=name,clientdata&`$filter=$([Uri]::EscapeDataString("$Filter and category eq 5"))").value)
  if ($rows.Count -ne 1) { throw "Flow de origem nao encontrado de forma unica: $Filter" }
  return ($rows[0].clientdata | ConvertFrom-Json)
}
function Assert-Reference($Reference, [string] $Label) {
  if (-not $Reference -or -not $Reference.connection.connectionReferenceLogicalName) { throw "Referencia de conexao ausente: $Label." }
}

# Reaproveita as referencias de conexao dos flows atuais; ler a definicao funciona com o flow ligado ou desligado.
$pushSource = Get-SourceFlow "contains(name,'Novo Servi') and contains(name,'Motoristas')"
$operationSource = Get-SourceFlow "contains(name,'Sem Motorista Designado')"
$webPushApi = "shared_new-5fapp-20motoristas-20web-20push-5f30e351431b40001e"
$dvReference = $pushSource.properties.connectionReferences.shared_commondataserviceforapps
$pushReference = $pushSource.properties.connectionReferences.'shared_powerappsnotificationv2-1'
$mailReference = $pushSource.properties.connectionReferences.shared_office365
$webPushReference = $pushSource.properties.connectionReferences.$webPushApi
$operationPushReference = $operationSource.properties.connectionReferences.shared_powerappsnotificationv2
Assert-Reference $dvReference "Dataverse"
Assert-Reference $pushReference "Power Apps Notification"
Assert-Reference $mailReference "Office 365"
Assert-Reference $webPushReference "Web Push"
Assert-Reference $operationPushReference "Power Apps Notification (Interno)"
$internalAppParameter = "ID App Betinhos Interno (new_IDAppBetinhosInterno)"
$internalApp = $operationSource.properties.definition.parameters.$internalAppParameter
if (-not $internalApp) { throw "Parametro $internalAppParameter ausente no flow de origem." }
# Mesmos destinatarios do e-mail de erro de "Novo Servico": e-mails de pessoas nao ficam versionados.
$errorRecipients = [string]$pushSource.properties.definition.actions.Scope_1.actions.'Send_an_email_(V2)'.inputs.parameters.'emailMessage/To'
if (-not $errorRecipients) { throw "Destinatarios do e-mail de erro ausentes no flow de origem." }

$tableRows = @((Read-Dv "EntityDefinitions?`$select=LogicalName&`$filter=LogicalName eq 'new_avisomotorista'").value)
if ($tableRows.Count -ne 1) {
  if ($Apply) { throw "Tabela new_avisomotorista ausente: rode provision-aviso-motorista.ps1 -Apply antes." }
  Write-Step "AVISO: tabela new_avisomotorista ainda nao existe; -Apply vai recusar ate rodar provision-aviso-motorista.ps1 -Apply."
} else {
  # A Vigia le new_reenviadoem: sem a coluna o $select falharia em toda rodada. Recusa antes de gravar.
  $reenvioColumn = @((Read-Dv "EntityDefinitions(LogicalName='new_avisomotorista')/Attributes?`$select=LogicalName&`$filter=LogicalName eq 'new_reenviadoem'").value)
  if ($reenvioColumn.Count -ne 1) {
    if ($Apply) { throw "Coluna new_reenviadoem ausente: rode provision-aviso-motorista.ps1 -Apply antes." }
    Write-Step "AVISO: coluna new_reenviadoem ainda nao existe; -Apply vai recusar ate rodar provision-aviso-motorista.ps1 -Apply."
  }
}
$apps = @((Read-Dv "appmodules?`$select=uniquename,name&`$filter=uniquename eq 'new_AppMotoristasv2'").value)
if ($apps.Count -ne 1) { throw "App Motoristas v2 ausente ou duplicado." }
$solutions = @((Read-Dv "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$SolutionUniqueName'").value)
if ($solutions.Count -ne 1 -or $solutions[0].ismanaged) { throw "Solucao $SolutionUniqueName ausente ou gerenciada." }

$dvHost = @{ apiId = "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"; connectionName = "shared_commondataserviceforapps" }
$auth = '@parameters(''$authentication'')'
$retry = @{ type = "exponential"; count = 3; interval = "PT30S" }
$schema = "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#"

function Dv([string] $Operation, [hashtable] $Parameters, [hashtable] $RunAfter = @{}) {
  return @{ type = "OpenApiConnection"; runAfter = $RunAfter; inputs = @{ host = ($dvHost + @{ operationId = $Operation }); parameters = $Parameters; authentication = $auth } }
}
function Compose([string] $Expression, [hashtable] $RunAfter = @{}) { return @{ type = "Compose"; runAfter = $RunAfter; inputs = $Expression } }
function Filter-Array([string] $From, [string] $Where, [hashtable] $RunAfter) { return @{ type = "Query"; runAfter = $RunAfter; inputs = @{ from = $From; where = $Where } } }
function Update-Notice([string] $Id, [hashtable] $Fields, [hashtable] $RunAfter = @{}) {
  return Dv "UpdateOnlyRecord" (@{ entityName = $table; recordId = $Id } + $Fields) $RunAfter
}
function Ok([string] $Name) { return @{ $Name = @("Succeeded") } }

function Mail-Action([string] $Subject, [string] $Body) {
  return @{
    type = "OpenApiConnection"
    runAfter = @{}
    inputs = @{
      host = @{ apiId = "/providers/Microsoft.PowerApps/apis/shared_office365"; connectionName = "shared_office365"; operationId = "SendEmailV2" }
      parameters = @{ "emailMessage/To" = $errorRecipients; "emailMessage/Subject" = $Subject; "emailMessage/Body" = $Body; "emailMessage/From" = "noreply@betinhos.com.br"; "emailMessage/Importance" = "Normal" }
      authentication = $auth
    }
  }
}

# E-mail de erro no padrao dos flows atuais.
function Error-Scope([string] $Title) {
  return @{
    type = "Scope"
    runAfter = @{ Scope = @("TimedOut", "Skipped", "Failed") }
    actions = @{
      Send_an_email = (Mail-Action "ERRO NO FLOW - $Title" "<p>ERRO NO FLOW - $Title</p>")
      Terminate = @{ type = "Terminate"; runAfter = (Ok "Send_an_email"); inputs = @{ runStatus = "Failed" } }
    }
  }
}

# ---------- Enviar ----------
$noticeId = "@triggerOutputs()?['body/new_avisomotoristaid']"
$reservaId = "@outputs('Get_aviso')?['body/_new_reserva_value']"
$reservaIdInline = "@{outputs('Get_aviso')?['body/_new_reserva_value']}"
$email = "outputs('Get_funcionario')?['body/cr40f_emailmicrosoft']"
$isNovo = "equals(outputs('Get_aviso')?['body/new_tipo'], $tipoNovo)"
$stillValid = "or(not($isNovo), and(equals(outputs('Get_reserva')?['body/cr40f_status'], $programado), equals(outputs('Get_reserva')?['body/_cr40f_motorista_value'], outputs('Get_aviso')?['body/_new_funcionario_value'])))"
$attempts = "@add(coalesce(outputs('Get_aviso')?['body/new_tentativas'], 0), 1)"
# Rotulo de dia igual ao do "Novo Servico": HOJE/AMANHA/ONTEM as HH:mm, no fuso de Sao Paulo.
$departureUtc = "outputs('Get_reserva')?['body/cr40f_dataehorriodesada']"
$departureDay = "formatDateTime(convertFromUtc($departureUtc, '$tz'), 'yyyy-MM-dd')"
$time = "formatDateTime(convertFromUtc($departureUtc, '$tz'), 'HH:mm')"
$today = "convertFromUtc(utcNow(), '$tz')"
$day = "if(empty($departureUtc), 'horário a definir', if(equals($departureDay, formatDateTime($today, 'yyyy-MM-dd')), concat('HOJE às ', $time), if(equals($departureDay, formatDateTime(addDays($today, 1), 'yyyy-MM-dd')), concat('AMANHÃ às ', $time), if(equals($departureDay, formatDateTime(addDays($today, -1), 'yyyy-MM-dd')), concat('ONTEM às ', $time), formatDateTime(convertFromUtc($departureUtc, '$tz'), 'dd/MM/yyyy HH:mm')))))"
$message = "@{if($isNovo, 'NOVO SERVIÇO para ', 'O Serviço de ')}@{$day}@{if($isNovo, ' foi adicionado na sua agenda pelo gestor!', ' foi RETIRADO DA SUA AGENDA pelo gestor!')}`nID: @{outputs('Get_reserva')?['body/cr40f_id']}`nConfira a sua agenda atualizada!"

$sendPush = @{
  type = "OpenApiConnection"
  runAfter = @{}
  retryPolicy = $retry
  inputs = @{
    host = @{ apiId = "/providers/Microsoft.PowerApps/apis/shared_powerappsnotificationv2"; connectionName = "shared_powerappsnotificationv2-1"; operationId = "SendPushNotificationV2" }
    parameters = @{
      "payload/playerType" = "PowerApps"
      "payload/recipients" = @("@$email")
      "payload/message" = "@outputs('Compose_mensagem')"
      "payload/openApp" = $true
      "payload/app" = (@{ type = "AppModule"; displayName = [string]$apps[0].name; appIdentifier = [string]$apps[0].uniquename } | ConvertTo-Json -Compress)
      "payload/dynamicParams/entityLogicalName" = "cr40f_reservadeveculos"
      "payload/dynamicParams/recordId" = $reservaId
    }
    authentication = $auth
  }
}
$worker = @{
  type = "OpenApiConnection"
  runAfter = @{}
  retryPolicy = $retry
  inputs = @{
    host = @{ apiId = "/providers/Microsoft.PowerApps/apis/$webPushApi"; connectionName = $webPushApi; operationId = "EnviarPush" }
    parameters = @{
      "body/subscriptions" = "@select(outputs('List_subs')?['body/value'], json(concat('{`"endpoint`":`"', item()?['new_endpoint'], '`",`"p256dh`":`"', item()?['new_chavep256dh'], '`",`"auth`":`"', item()?['new_chaveauth'], '`"}')))"
      "body/payload/title" = "App Motoristas"
      "body/payload/body" = "@outputs('Compose_mensagem')"
      "body/payload/url" = "/WebResources/new_app-motoristas-v2?servicoId=$reservaIdInline"
      "body/payload/tag" = "cr40f_reservadeveculos-$reservaIdInline"
    }
    authentication = $auth
  }
}
$hasSubscriptions = @{
  type = "If"
  runAfter = (Ok "List_subs")
  expression = @{ greater = @("@length(outputs('List_subs')?['body/value'])", 0) }
  actions = @{
    Worker = $worker
    Filter_gone = (Filter-Array "@outputs('Worker')?['body/results']" "@equals(item()?['gone'], true)" (Ok "Worker"))
    Select_gone = @{ type = "Select"; runAfter = (Ok "Filter_gone"); inputs = @{ from = "@body('Filter_gone')"; select = "@item()?['endpoint']" } }
    Filter_subs = (Filter-Array "@outputs('List_subs')?['body/value']" "@contains(body('Select_gone'), item()?['new_endpoint'])" (Ok "Select_gone"))
    Delete_each = @{
      type = "Foreach"
      runAfter = (Ok "Filter_subs")
      foreach = "@body('Filter_subs')"
      actions = @{ Delete_row = (Dv "DeleteRecord" @{ entityName = $subscriptionsTable; recordId = "@items('Delete_each')?['new_inscricaopushmotoristaid']" }) }
    }
  }
  else = @{ actions = @{} }
}
# Em paralelo ao push do Power Apps, como nos flows antigos: falha de um canal nao impede o outro.
$webPush = @{
  type = "Scope"
  runAfter = @{}
  actions = @{
    List_subs = (Dv "ListRecords" @{ entityName = $subscriptionsTable; '$top' = 50; '$select' = "new_inscricaopushmotoristaid,new_endpoint,new_chavep256dh,new_chaveauth"; '$filter' = "_new_funcionario_value eq @{outputs('Get_aviso')?['body/_new_funcionario_value']}" })
    Has_subs = $hasSubscriptions
  }
}
$hasEmail = @{
  type = "If"
  runAfter = (Ok "Compose_mensagem")
  expression = @{ equals = @("@empty($email)", $false) }
  actions = @{
    Send_push = $sendPush
    Marcar_enviado = (Update-Notice $noticeId @{ "item/new_situacao" = $enviado; "item/new_enviadoem" = "@utcNow()"; "item/new_tentativas" = $attempts; "item/new_erro" = "@null" } (Ok "Send_push"))
    Marcar_falhou = (Update-Notice $noticeId @{ "item/new_situacao" = $falhou; "item/new_tentativas" = $attempts; "item/new_erro" = "@{take(string(coalesce(outputs('Send_push')?['body'], actions('Send_push')?['error'], 'Falha no envio do push')), 2000)}" } @{ Send_push = @("Failed", "TimedOut") })
    # Nome da convencao de provision-web-push-flows.ps1: com outro nome aquele script acrescentaria um 2o Web Push.
    Web_Push_Send_push = $webPush
  }
  else = @{ actions = @{ Marcar_sem_app = (Update-Notice $noticeId @{ "item/new_situacao" = $semApp }) } }
}
$sendScope = @{
  type = "Scope"
  runAfter = @{}
  actions = @{
    Get_aviso = (Dv "GetItem" @{ entityName = $table; recordId = $noticeId; '$select' = "new_situacao,new_tipo,new_tentativas,_new_reserva_value,_new_funcionario_value" })
    # O aviso pode ter virado Cancelado entre a criacao e este passo: so entrega o que ainda esta Pendente.
    Condition_pendente = @{
      type = "If"
      runAfter = (Ok "Get_aviso")
      expression = @{ equals = @("@outputs('Get_aviso')?['body/new_situacao']", $pendente) }
      actions = @{
        Get_reserva = (Dv "GetItem" @{ entityName = $servicesTable; recordId = $reservaId; '$select' = "cr40f_id,cr40f_dataehorriodesada,cr40f_status,_cr40f_motorista_value" })
        # Novo so vale se o servico segue Programado com este motorista: limpar o motorista ou sair de Programado nao
        # cancela o aviso no plugin, e o reenvio da Vigia pode gravar Pendente a partir de uma leitura antiga.
        Condition_vigente = @{
          type = "If"
          runAfter = (Ok "Get_reserva")
          expression = @{ equals = @("@$stillValid", $true) }
          actions = @{
            Get_funcionario = (Dv "GetItem" @{ entityName = $employeesTable; recordId = "@outputs('Get_aviso')?['body/_new_funcionario_value']"; '$select' = "cr40f_emailmicrosoft" })
            Compose_mensagem = (Compose $message (Ok "Get_funcionario"))
            Condition_tem_email = $hasEmail
          }
          else = @{ actions = @{ Marcar_cancelado = (Update-Notice $noticeId @{ "item/new_situacao" = $cancelado }) } }
        }
      }
      else = @{ actions = @{} }
    }
  }
}

$sendTriggerKey = "When_aviso_is_pending"
$sendTriggerName = ""
$existingSend = @(Get-Flow $sendName)
if ($existingSend.Count -eq 1 -and $existingSend[0].clientdata) {
  $previousTrigger = ($existingSend[0].clientdata | ConvertFrom-Json).properties.definition.triggers.PSObject.Properties[$sendTriggerKey]
  if ($previousTrigger) { $sendTriggerName = [string]$previousTrigger.Value.inputs.parameters.'subscriptionRequest/name' }
}
if (-not $sendTriggerName) { $sendTriggerName = "$([guid]::NewGuid()):MTA" }
# Create ou Update (message 4): filteringattributes vale so para o Update. O Create em Pendente dispara o envio; o
# Update de new_situacao para Pendente e o reenvio pedido pela Vigia. "Sem app" nasce fora do filtro e nao dispara.
$sendTrigger = @{
  type = "OpenApiConnectionWebhook"
  inputs = @{
    host = ($dvHost + @{ operationId = "SubscribeWebhookTrigger" })
    parameters = @{
      "subscriptionRequest/message" = 4
      "subscriptionRequest/entityname" = "new_avisomotorista"
      "subscriptionRequest/scope" = 4
      "subscriptionRequest/filterexpression" = "new_situacao eq $pendente"
      "subscriptionRequest/filteringattributes" = "new_situacao"
      "subscriptionRequest/name" = $sendTriggerName
    }
    authentication = $auth
  }
}
$baseParameters = @{ '$connections' = @{ defaultValue = @{}; type = "Object" }; '$authentication' = @{ defaultValue = @{}; type = "SecureObject" } }
$sendDefinition = @{
  '$schema' = $schema
  contentVersion = "1.0.0.0"
  parameters = $baseParameters
  triggers = @{ $sendTriggerKey = $sendTrigger }
  actions = @{ Scope = $sendScope; Scope_erro = (Error-Scope $sendName) }
  outputs = @{}
}
$sendClientData = @{
  properties = @{
    connectionReferences = @{
      shared_commondataserviceforapps = $dvReference
      'shared_powerappsnotificationv2-1' = $pushReference
      shared_office365 = $mailReference
      $webPushApi = $webPushReference
    }
    definition = $sendDefinition
  }
  schemaVersion = "1.0.0.0"
} | ConvertTo-Json -Depth 100 -Compress

# ---------- Vigia ----------
$reserva = "item()?['new_Reserva']"
$sameDriver = "equals(${reserva}?['_cr40f_motorista_value'], item()?['_new_funcionario_value'])"
$stillProgrammed = "equals(${reserva}?['cr40f_status'], $programado)"
$current = "and($stillProgrammed, $sameDriver)"
$driverName = "item()?['_new_funcionario_value@OData.Community.Display.V1.FormattedValue']"
$reservaExpand = 'new_Reserva($select=cr40f_id,cr40f_status,cr40f_dataehorriodesada,_cr40f_motorista_value,new_visualizacaodomotorista)'
$noticeColumns = "new_avisomotoristaid,new_situacao,new_tipo,new_prazovisualizacao,new_alertadoem,new_reenviadoem,_new_funcionario_value,_new_reserva_value"
$pendingFilter = "@concat('new_alertadoem eq null and (new_situacao eq $falhou or new_situacao eq $semApp or (new_situacao eq $pendente and modifiedon lt ', formatDateTime(addMinutes(utcNow(), -5), 'yyyy-MM-ddTHH:mm:ssZ'), '))')"
# Janela da saida (docs/vigia-janela-saida.md): reenvio ao motorista 4 h antes, alerta a operacao 3 h antes, nunca antes
# do prazo do aviso (new_prazovisualizacao, gravado pelo plugin). Horario entre 22h e 6h vai para a vespera: 20h o
# reenvio, 21h o alerta. Sem saida, vale o prazo. Os coalesce evitam addHours sobre nulo (o if do Logic Apps nao e
# preguicoso); prazo nulo nunca vence, como antes.
$prazo = "coalesce(item()?['new_prazovisualizacao'], '9000-01-01T00:00:00Z')"
function Window-Due([int] $HoursBefore, [int] $EveningHour) {
  $start = "addHours(coalesce(${reserva}?['cr40f_dataehorriodesada'], addHours($prazo, $HoursBefore)), -$HoursBefore)"
  $local = "convertFromUtc($start, '$tz')"
  $hour = "int(formatDateTime($local, 'HH'))"
  $night = "or(greaterOrEquals($hour, 22), less($hour, 6))"
  $evening = "convertToUtc(concat(formatDateTime(if(less($hour, 6), addDays($local, -1), $local), 'yyyy-MM-dd'), 'T${EveningHour}:00:00'), '$tz')"
  $window = "if($night, $evening, $start)"
  return "and(lessOrEquals(ticks($prazo), ticks(utcNow())), lessOrEquals(ticks($window), ticks(utcNow())))"
}
$resendDue = Window-Due 4 20
$alertDue = Window-Due 3 21
$saida = "if(empty(${reserva}?['cr40f_dataehorriodesada']), 'a definir', formatDateTime(convertFromUtc(${reserva}?['cr40f_dataehorriodesada'], '$tz'), 'dd/MM HH:mm'))"

$overdueAlert = @{
  aviso = "@item()?['new_avisomotoristaid']"
  reserva = "@item()?['_new_reserva_value']"
  # Ainda sem reenvio (aviso em cima da hora): o alerta reenvia junto. Ja reenviado: so marca o alerta.
  novaSituacao = "@if(empty(item()?['new_reenviadoem']), $pendente, $enviado)"
  titulo = "Serviço não visualizado pelo motorista"
  corpo = "@concat('O serviço ', ${reserva}?['cr40f_id'], ' (saída ', $saida, ') ainda não foi visualizado por ', $driverName, '. O push foi reenviado.')"
}
$pendingAlert = @{
  aviso = "@item()?['new_avisomotoristaid']"
  reserva = "@item()?['_new_reserva_value']"
  novaSituacao = "@item()?['new_situacao']"
  titulo = "Aviso ao motorista não entregue"
  corpo = "@concat('Aviso ', item()?['new_tipo@OData.Community.Display.V1.FormattedValue'], ' do serviço ', coalesce(${reserva}?['cr40f_id'], ''), ' para ', $driverName, ': ', item()?['new_situacao@OData.Community.Display.V1.FormattedValue'], '.')"
}

$alertLoop = @{
  type = "Foreach"
  runAfter = @{}
  foreach = "@outputs('Compose_alertas')"
  actions = @{
    Add_notificacao = (Dv "CreateRecord" @{
      entityName = "appnotifications"
      "item/title" = "@items('For_each_alerta')?['titulo']"
      "item/body" = "@items('For_each_alerta')?['corpo']"
      "item/AppModuleId@odata.bind" = "/appmodules(@{parameters('$internalAppParameter')})"
      "item/ttlinseconds" = 86400
      "item/icontype" = 100000003
      "item/priority" = 200000001
      "item/ownerid@odata.bind" = "/systemusers(@{first(outputs('List_systemuser')?['body/value'])?['systemuserid']})"
    })
    Send_push_operacao = @{
      type = "OpenApiConnection"
      runAfter = (Ok "Add_notificacao")
      retryPolicy = $retry
      inputs = @{
        host = @{ apiId = "/providers/Microsoft.PowerApps/apis/shared_powerappsnotificationv2"; connectionName = "shared_powerappsnotificationv2"; operationId = "SendPushNotificationV2" }
        parameters = @{
          "payload/playerType" = "PowerApps"
          "payload/app" = '{"appIdentifier":"cr40f_ModelDrivenBetinhos","displayName":"App Betinhos Interno","type":"AppModule"}'
          "payload/recipients" = @("@items('For_each_operador')?['cr40f_emailmicrosoft']")
          "payload/message" = "@items('For_each_alerta')?['corpo']"
          "payload/openApp" = $true
          "payload/dynamicParams/entityLogicalName" = "cr40f_reservadeveculos"
          "payload/dynamicParams/entityPage" = '{"id":"0a8e5497-fa18-f111-8341-6045bd3c7605","displayName":"View - Visualização Mobile","type":"entitylist","viewType":1039}'
          "payload/dynamicParams/recordId" = "@items('For_each_alerta')?['reserva']"
        }
        authentication = $auth
      }
    }
    # O push de um operador (sem licenca, por exemplo) nao pode travar a rodada: sem isto ninguem seria marcado como
    # alertado, os alertas repetiriam a cada 10 min e o reenvio ao motorista nunca sairia. A notificacao no app fica.
    Push_operacao_concluido = (Compose "@items('For_each_alerta')?['aviso']" @{ Send_push_operacao = @("Succeeded", "Failed", "TimedOut") })
  }
}
$operatorLoop = @{
  type = "Foreach"
  runAfter = @{}
  foreach = "@outputs('List_operadores')?['body/value']"
  actions = @{
    List_systemuser = (Dv "ListRecords" @{ entityName = "systemusers"; '$select' = "systemuserid"; '$top' = 1; '$filter' = "internalemailaddress eq '@{items('For_each_operador')?['cr40f_emailmicrosoft']}'" })
    Condition_tem_usuario = @{
      type = "If"
      runAfter = (Ok "List_systemuser")
      expression = @{ greater = @("@length(outputs('List_systemuser')?['body/value'])", 0) }
      actions = @{ For_each_alerta = $alertLoop }
      else = @{ actions = @{} }
    }
  }
}
$hasAlerts = @{
  type = "If"
  runAfter = (Ok "Compose_alertas")
  expression = @{ greater = @("@length(outputs('Compose_alertas'))", 0) }
  actions = @{
    List_operadores = (Dv "ListRecords" @{ entityName = $employeesTable; '$select' = "cr40f_emailmicrosoft"; '$filter' = "new_notificacoesoperacionais eq true" })
    Condition_tem_operador = @{
      type = "If"
      runAfter = (Ok "List_operadores")
      expression = @{ greater = @("@length(outputs('List_operadores')?['body/value'])", 0) }
      actions = @{
        For_each_operador = $operatorLoop
        # So depois de avisar a operacao: se a notificacao no app falhar, a proxima rodada alerta de novo.
        Marcar_alertados = @{
          type = "Foreach"
          runAfter = (Ok "For_each_operador")
          foreach = "@outputs('Compose_alertas')"
          actions = @{ Marcar_alertado = (Update-Notice "@items('Marcar_alertados')?['aviso']" @{ "item/new_alertadoem" = "@utcNow()"; "item/new_situacao" = "@items('Marcar_alertados')?['novaSituacao']" }) }
        }
      }
      else = @{ actions = @{
        Email_sem_operador = (Mail-Action "AVISO: nenhum funcionário com notificações operacionais" "<p>Flow Aviso Motorista | Vigia tem alertas e nenhum funcionário com new_notificacoesoperacionais = true.</p>")
      } }
    }
  }
  else = @{ actions = @{} }
}
$unseen = "and($current, empty(${reserva}?['new_visualizacaodomotorista']), equals(item()?['new_situacao'], $enviado), empty(item()?['new_alertadoem']))"
$watchScope = @{
  type = "Scope"
  runAfter = @{}
  actions = @{
    # Primeiro concilia (Cancelado e Visto) para nao alertar a operacao sobre o que ja se resolveu.
    List_novos = (Dv "ListRecords" @{ entityName = $table; '$select' = $noticeColumns; '$expand' = $reservaExpand; '$orderby' = "createdon desc"; '$top' = 500; '$filter' = "new_tipo eq $tipoNovo and (new_situacao eq $pendente or new_situacao eq $enviado or new_situacao eq $falhou or new_situacao eq $semApp)" })
    Filter_cancelar = (Filter-Array "@outputs('List_novos')?['body/value']" "@not($current)" (Ok "List_novos"))
    Cancelar = @{
      type = "Foreach"
      runAfter = (Ok "Filter_cancelar")
      foreach = "@body('Filter_cancelar')"
      actions = @{ Marcar_cancelado = (Update-Notice "@items('Cancelar')?['new_avisomotoristaid']" @{ "item/new_situacao" = $cancelado }) }
    }
    Filter_vistos = (Filter-Array "@outputs('List_novos')?['body/value']" "@and($current, not(empty(${reserva}?['new_visualizacaodomotorista'])))" (Ok "Cancelar"))
    Marcar_vistos = @{
      type = "Foreach"
      runAfter = (Ok "Filter_vistos")
      foreach = "@body('Filter_vistos')"
      actions = @{ Marcar_visto = (Update-Notice "@items('Marcar_vistos')?['new_avisomotoristaid']" @{ "item/new_situacao" = $visto; "item/new_vistoem" = "@items('Marcar_vistos')?['new_Reserva']?['new_visualizacaodomotorista']" }) }
    }
    # Reenvio so ao motorista; o que ja esta na hora do alerta fica para o alerta, que reenvia junto.
    Filter_reenviar = (Filter-Array "@outputs('List_novos')?['body/value']" "@and($unseen, empty(item()?['new_reenviadoem']), $resendDue, not($alertDue))" (Ok "Marcar_vistos"))
    Reenviar = @{
      type = "Foreach"
      runAfter = (Ok "Filter_reenviar")
      foreach = "@body('Filter_reenviar')"
      actions = @{ Marcar_reenviado = (Update-Notice "@items('Reenviar')?['new_avisomotoristaid']" @{ "item/new_reenviadoem" = "@utcNow()"; "item/new_situacao" = $pendente }) }
    }
    Filter_vencidos = (Filter-Array "@outputs('List_novos')?['body/value']" "@and($unseen, $alertDue)" (Ok "Reenviar"))
    Select_vencidos = @{ type = "Select"; runAfter = (Ok "Filter_vencidos"); inputs = @{ from = "@body('Filter_vencidos')"; select = $overdueAlert } }
    List_pendencias = (Dv "ListRecords" @{ entityName = $table; '$select' = $noticeColumns; '$expand' = $reservaExpand; '$top' = 200; '$filter' = $pendingFilter } (Ok "Select_vencidos"))
    # Falhou e Sem app de aviso Novo esperam a hora do alerta; Retirado e Pendente parado alertam na hora.
    Filter_pendencias = (Filter-Array "@outputs('List_pendencias')?['body/value']" "@or(equals(item()?['new_situacao'], $pendente), not(equals(item()?['new_tipo'], $tipoNovo)), $alertDue)" (Ok "List_pendencias"))
    Select_pendencias = @{ type = "Select"; runAfter = (Ok "Filter_pendencias"); inputs = @{ from = "@body('Filter_pendencias')"; select = $pendingAlert } }
    Compose_alertas = (Compose "@union(body('Select_vencidos'), body('Select_pendencias'))" (Ok "Select_pendencias"))
    Condition_tem_alerta = $hasAlerts
  }
}
$watchDefinition = @{
  '$schema' = $schema
  contentVersion = "1.0.0.0"
  parameters = ($baseParameters + @{ $internalAppParameter = $internalApp })
  # Uma rodada por vez: rodada lenta sobreposta alertaria e reenviaria em dobro o que ainda nao foi marcado.
  triggers = @{ Recurrence = @{ type = "Recurrence"; recurrence = @{ frequency = "Minute"; interval = 10; timeZone = $tz; startTime = "2017-03-04T15:00:00Z" }; runtimeConfiguration = @{ concurrency = @{ runs = 1 } } } }
  actions = @{ Scope = $watchScope; Scope_erro = (Error-Scope $watchName) }
  outputs = @{}
}
$watchClientData = @{
  properties = @{
    connectionReferences = @{
      shared_commondataserviceforapps = $dvReference
      shared_powerappsnotificationv2 = $operationPushReference
      shared_office365 = $mailReference
    }
    definition = $watchDefinition
  }
  schemaVersion = "1.0.0.0"
} | ConvertTo-Json -Depth 100 -Compress

$flows = @(
  @{ Name = $sendName; Description = "Entrega o aviso de serviço novo ou retirado ao motorista (new_avisomotorista). Não lê a audit."; ClientData = $sendClientData },
  @{ Name = $watchName; Description = "A cada 10 min concilia os avisos, reenvia o push ao motorista 4 h antes da saída e alerta a operação 3 h antes."; ClientData = $watchClientData }
)

if (-not $Apply) {
  foreach ($flow in $flows) {
    $existing = @(Get-Flow $flow.Name)
    Write-Step "DRY RUN: $(if ($existing.Count) { "atualizaria (statecode $($existing[0].statecode))" } else { 'criaria desligado' }) $($flow.Name) ($($flow.ClientData.Length) caracteres de definicao)"
  }
  return
}

foreach ($flow in $flows) {
  $existing = @(Get-Flow $flow.Name)
  $wasActive = $existing.Count -eq 1 -and [int]$existing[0].statecode -eq 1
  if ($existing.Count -eq 0) {
    Write-Dv "POST" "workflows" @{ name = $flow.Name; category = 5; type = 1; primaryentity = "none"; description = $flow.Description; clientdata = $flow.ClientData } | Out-Null
    $existing = @(Get-Flow $flow.Name)
  } else {
    # Flow ligado nao aceita troca de definicao: desliga, grava e religa mesmo se a gravacao falhar, senao o aviso
    # ficaria sem entrega depois da virada.
    if ($wasActive) { Write-Dv "PATCH" "workflows($($existing[0].workflowid))" @{ statecode = 0 } | Out-Null }
    try { Write-Dv "PATCH" "workflows($($existing[0].workflowid))" @{ clientdata = $flow.ClientData; description = $flow.Description } | Out-Null }
    finally { if ($wasActive) { Write-Dv "PATCH" "workflows($($existing[0].workflowid))" @{ statecode = 1 } | Out-Null } }
  }
  if ($existing.Count -ne 1) { throw "Flow nao confirmado apos escrita: $($flow.Name)" }
  $id = [guid]$existing[0].workflowid
  $component = @((Read-Dv "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solutions[0].solutionid) and componenttype eq 29 and objectid eq $id").value)
  if ($component.Count -eq 0) { Write-Dv "POST" "AddSolutionComponent" @{ ComponentId = $id; ComponentType = 29; SolutionUniqueName = $SolutionUniqueName; AddRequiredComponents = $false } | Out-Null }
  $verified = Read-Dv "workflows($id)?`$select=statecode,clientdata"
  $verifiedDefinition = ($verified.clientdata | ConvertFrom-Json).properties.definition
  if (-not $verifiedDefinition.actions.Scope -or (([int]$verified.statecode -eq 1) -ne $wasActive)) { throw "Flow '$($flow.Name)' com contrato inesperado." }
  Write-Step "$($flow.Name): gravado na solucao, statecode $($verified.statecode)"
}

# A Vigia substitui o flow antigo, que repetia o alerta 1 h antes da saida (decisao do Renan, 10/11/2026). So desliga com
# a Vigia ligada, para nunca ficar sem nenhum dos dois. O PROD recebe o estado pelas solucoes.
$legacyName = "Flow Notificação Serviço Não Visualizado | Interno e Motoristas"
$legacy = @(Get-Flow $legacyName)
$watch = @(Get-Flow $watchName)
if ($legacy.Count -eq 1 -and [int]$legacy[0].statecode -eq 1 -and $watch.Count -eq 1 -and [int]$watch[0].statecode -eq 1) {
  Write-Dv "PATCH" "workflows($($legacy[0].workflowid))" @{ statecode = 0 } | Out-Null
  Write-Step "$($legacyName): desligado"
}
