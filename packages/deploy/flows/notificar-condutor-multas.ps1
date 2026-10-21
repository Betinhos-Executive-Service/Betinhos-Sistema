# Correções do "Flow  Notificar Condutor Multas" (21/10/2026). Carregado por provision-flow-notificar-condutor-multas.ps1
# (DEV) e prod/patch-flow-notificar-condutor-multas-prod.ps1 (PROD); só transforma o clientdata já lido, não fala com o
# Dataverse.
#
# - Os autos iam para o OneDrive pela pasta em cr40f_folderid. Nunca funcionou: a conexão OneDrive (noreply) só enxerga o
#   OneDrive do próprio noreply e as pastas dos colaboradores ficam numa biblioteca do SharePoint (GetFileMetadata dá 404
#   mesmo com cr40f_folderid preenchido; 44 de 59 colaboradores ativos no PROD nem têm o campo). As duas execuções do
#   PROD (28/09 e 21/10) falharam aí. Agora os autos vão para o SharePoint BetinhosGestoInterna, na pasta do colaborador
#   usada pela tela de Funcionários (Documentos Compartilhados/Funcionarios[/DEV]/<id do funcionário>/Multas/<id da
#   multa>), pela mesma conexão do "Flow - Salvar arquivo no SharePoint"; o link no e-mail é de visualização para a
#   organização, como no flow de comprovantes de despesas.
# - Create_file_2 gravava o AUTO_2 na pasta calculada no ramo do AUTO_1; os dois usam agora Compose_PastaMulta.
# - Multa sem motorista: a condição comparava o lookup com '' e um valor nulo caía no ramo de envio.
# - Erro: o e-mail ia para financeiro@betinhos.com..br (endereço inválido, o próprio aviso falhava) e o chamador ficava sem
#   resposta HTTP. Agora o aviso sai e o flow responde 500 antes de encerrar como falha.
$script:NotificarFlowName = 'Flow  Notificar Condutor Multas'
$script:NotificacaoTo = 'junior@betinhos.com.br;noreply@betinhos.onmicrosoft.com; deborah.keila@betinhos.com.br'
$script:SiteSharePoint = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$script:BibliotecaId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$script:ConexaoSharePoint = 'new_sharedsharepointonline_30d17'
function PastaMultaExpr([string] $raiz) {
  return "@concat('/Documentos Compartilhados/$raiz/', toLower(outputs('Get_a_row_by_ID_Multa')?['body/_cr40f_motorista_value']), '/Multas/', outputs('Get_a_row_by_ID_Multa')?['body/cr40f_id_multa'])"
}

function Has($obj, [string] $name) { return ($null -ne $obj) -and ($null -ne $obj.PSObject.Properties[$name]) }
function RunAfter([string] $acao, [string[]] $status = @('Succeeded')) { return [pscustomobject]@{ $acao = $status } }
function SharePoint([string] $operationId, $parameters, $runAfter) {
  return [pscustomobject]@{
    runAfter = $runAfter
    type = 'OpenApiConnection'
    inputs = [pscustomobject]@{
      parameters = $parameters
      host = [pscustomobject]@{ apiId = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'; operationId = $operationId; connectionName = 'shared_sharepointonline' }
      retryPolicy = [pscustomobject]@{ type = 'fixed'; count = 2; interval = 'PT5S' }
    }
  }
}
function Set-Prop($obj, [string] $name, $value) { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }

# $raiz: 'Funcionarios' no PROD, 'Funcionarios/DEV' no DEV (pastaFuncionario em apps/shell/.../funcionarios/data/sharepoint.ts).
function Corrigir-NotificarCondutor($cd, [string] $raiz, [string] $emailPara = '') {
  $defn = $cd.properties.definition
  $refs = $cd.properties.connectionReferences
  $refs.PSObject.Properties.Remove('shared_onedriveforbusiness')
  Set-Prop $refs 'shared_sharepointonline' ([pscustomobject]@{
    runtimeSource = 'embedded'
    connection = [pscustomobject]@{ connectionReferenceLogicalName = $script:ConexaoSharePoint }
    api = [pscustomobject]@{ name = 'shared_sharepointonline' }
  })

  $mot = $defn.actions.Scope.actions.Apply_to_each_GUID.actions.Condition_Mot_Vazio
  $mot.expression = [pscustomobject]@{ and = @([pscustomobject]@{ equals = @("@empty(outputs('Get_a_row_by_ID_Multa')?['body/_cr40f_motorista_value'])", $true) }) }

  $env = $mot.else.actions
  if (-not (Has $env 'Compose_PastaMulta') -or -not (Has $env 'Condition_auto_1') -or -not (Has $env 'Condition_auto_2')) { throw 'Ramo de envio sem Compose_PastaMulta/Condition_auto_1/Condition_auto_2; formato inesperado.' }
  $env.Compose_PastaMulta.inputs = PastaMultaExpr $raiz
  $env.Compose_PastaMulta.runAfter = RunAfter 'Get_a_row_by_ID_Infração'

  $email = $env.'Send_an_email_(V2)'.inputs.parameters
  foreach ($n in @(@('Condition_auto_1', '', 'Compose_NomeAuto1', 'Download_a_file_or_an_image_Auto'), @('Condition_auto_2', '_2', 'Compose_NomeAuto2', 'Download_a_file_or_an_image_Auto_2'))) {
    $sim = $env.($n[0]).actions
    foreach ($velha in @("Get_file_metadata_por_FolderID$($n[1])", "Compose_FolderPath_Multa$($n[1])")) { $sim.PSObject.Properties.Remove($velha) }
    $arquivo = "Create_file$($n[1])"; $link = "Create_share_link$($n[1])"
    Set-Prop $sim $arquivo (SharePoint 'CreateFile' ([pscustomobject]@{
      dataset = $script:SiteSharePoint
      folderPath = "@outputs('Compose_PastaMulta')"
      name = "@outputs('$($n[2])')"
      body = "@base64ToBinary(body('$($n[3])')?['`$content'])"
    }) (RunAfter $n[2]))
    Set-Prop $sim $link (SharePoint 'CreateSharingLink' ([pscustomobject]@{
      dataset = $script:SiteSharePoint
      table = $script:BibliotecaId
      id = "@body('$arquivo')?['ItemId']"
      'permission/type' = 'view'
      'permission/scope' = 'organization'
    }) (RunAfter $arquivo))
    $email.'emailMessage/Body' = ([string]$email.'emailMessage/Body').Replace("outputs('$link')?['body/WebUrl']", "body('$link')?['link']?['webUrl']")
  }
  if ($emailPara) { $email.'emailMessage/To' = $emailPara }

  $erro = $defn.actions.Scope_1.actions
  $p = $erro.'Send_an_email_(V2)_1'.inputs.parameters
  $p.'emailMessage/To' = ([string]$p.'emailMessage/To').Replace('betinhos.com..br', 'betinhos.com.br')
  Set-Prop $erro 'Response_erro' ([pscustomobject]@{
    runAfter = RunAfter 'Send_an_email_(V2)_1' @('Succeeded', 'Failed', 'Skipped', 'TimedOut')
    type = 'Response'
    kind = 'Http'
    inputs = [pscustomobject]@{
      statusCode = 500
      headers = [pscustomobject]@{ 'Content-Type' = 'application/json; charset=utf-8' }
      body = [pscustomobject]@{ success = $false; code = 'ERRO'; message = 'Não foi possível notificar o condutor. A equipe recebeu o aviso por e-mail.' }
    }
  })
  $erro.Terminate_1.runAfter = RunAfter 'Response_erro' @('Succeeded', 'Failed')
}

# Conferências sobre o clientdata lido de volta (ou montado).
function Conferir-NotificarCondutor($cd, [string] $raiz, [string] $emailPara = '') {
  $defn = $cd.properties.definition
  $json = $defn | ConvertTo-Json -Depth 90 -Compress
  if ($json -match 'shared_onedriveforbusiness') { throw 'Ainda há ação do OneDrive.' }
  if ($cd.properties.connectionReferences.shared_sharepointonline.connection.connectionReferenceLogicalName -ne $script:ConexaoSharePoint) { throw 'Referência de conexão do SharePoint não confere.' }
  $mot = $defn.actions.Scope.actions.Apply_to_each_GUID.actions.Condition_Mot_Vazio
  if ($mot.expression.and[0].equals[0] -notmatch '^@empty\(') { throw 'Condição de multa sem motorista não usa empty().' }
  $env = $mot.else.actions
  if ($env.Compose_PastaMulta.inputs -ne (PastaMultaExpr $raiz)) { throw 'Compose_PastaMulta não confere.' }
  foreach ($n in @(@('Condition_auto_1', ''), @('Condition_auto_2', '_2'))) {
    $sim = $env.($n[0]).actions
    if ($sim."Create_file$($n[1])".inputs.host.operationId -ne 'CreateFile' -or $sim."Create_file$($n[1])".inputs.parameters.folderPath -ne "@outputs('Compose_PastaMulta')") { throw "Create_file$($n[1]) não confere." }
    if ($sim."Create_share_link$($n[1])".inputs.host.operationId -ne 'CreateSharingLink') { throw "Create_share_link$($n[1]) não confere." }
  }
  $email = $env.'Send_an_email_(V2)'.inputs.parameters
  foreach ($link in 'Create_share_link', 'Create_share_link_2') {
    if ($email.'emailMessage/Body' -notmatch [regex]::Escape("body('$link')?['link']?['webUrl']")) { throw "Corpo do e-mail sem o link de $link." }
  }
  $esperado = if ($emailPara) { $emailPara } else { $script:NotificacaoTo }
  if ($email.'emailMessage/To' -ne $esperado) { throw 'Destinatário da notificação não confere.' }
  $erro = $defn.actions.Scope_1.actions
  if ([string]$erro.'Send_an_email_(V2)_1'.inputs.parameters.'emailMessage/To' -match '\.\.br') { throw "E-mail de erro ainda com '..br'." }
  if (-not (Has $erro 'Response_erro') -or $erro.Response_erro.inputs.statusCode -ne 500) { throw 'Falta a resposta 500 no tratamento de erro.' }
}
