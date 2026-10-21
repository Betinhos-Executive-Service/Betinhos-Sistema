# Correções dos flows de multa "Flow  Notificar Condutor Multas" e "Flow Gerar Contrato" (21/10/2026). Carregado por
# provision-flow-multas.ps1 (DEV) e prod/patch-flow-multas-prod.ps1 (PROD); só transforma o clientdata já lido, não fala
# com o Dataverse.
#
# Os dois gravavam na pasta do colaborador pelo OneDrive, a partir de cr40f_folderid. Nunca funcionou: a conexão OneDrive
# (noreply) só enxerga o OneDrive do próprio noreply e as pastas dos colaboradores ficam numa biblioteca do SharePoint
# (GetFileMetadata dá 404 mesmo com cr40f_folderid preenchido; 44 de 59 colaboradores ativos no PROD nem têm o campo).
# As duas execuções do Notificar no PROD (28/09 e 21/10) falharam aí. Agora os arquivos vão para o SharePoint
# BetinhosGestoInterna, na pasta do colaborador usada pela tela de Funcionários (Documentos Compartilhados/
# Funcionarios[/DEV]/<id do funcionário>/Multas/<id da multa>), pela mesma conexão do "Flow - Salvar arquivo no
# SharePoint"; os links são para a organização, como no flow de comprovantes de despesas.
#
# Notificar: Create_file_2 gravava o AUTO_2 na pasta calculada no ramo do AUTO_1; multa com motorista nulo caía no ramo
# de envio (a condição comparava o lookup com '').
# Gerar Contrato: o Word Online só converte para PDF arquivo do OneDrive do noreply, então o .docx passa por
# /Contratos de Multa (temporários) no OneDrive (sobrescrito a cada geração da mesma multa) e o .docx e o .pdf finais vão
# para o SharePoint.
# Os dois: o e-mail de erro ia para financeiro@betinhos.com..br (endereço inválido, o próprio aviso falhava) e o chamador
# ficava sem resposta HTTP. Agora o aviso sai e o flow responde 500 antes de encerrar como falha.
$script:NotificarFlowName = 'Flow  Notificar Condutor Multas'
$script:ContratoFlowName = 'Flow Gerar Contrato'
$script:NotificacaoTo = 'junior@betinhos.com.br;noreply@betinhos.onmicrosoft.com; deborah.keila@betinhos.com.br'
$script:SiteSharePoint = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$script:BibliotecaId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$script:ConexaoSharePoint = 'new_sharedsharepointonline_30d17'
$script:PastaTemporariaContrato = '/Contratos de Multa (temporários)'

# $raiz: 'Funcionarios' no PROD, 'Funcionarios/DEV' no DEV (pastaFuncionario em apps/shell/.../funcionarios/data/sharepoint.ts).
function PastaMultaExpr([string] $raiz, [string] $acaoMulta) {
  return "@concat('/Documentos Compartilhados/$raiz/', toLower(outputs('$acaoMulta')?['body/_cr40f_motorista_value']), '/Multas/', outputs('$acaoMulta')?['body/cr40f_id_multa'])"
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
function SalvarNoSharePoint([string] $nome, $body, [string] $depoisDe) {
  return SharePoint 'CreateFile' ([pscustomobject]@{ dataset = $script:SiteSharePoint; folderPath = "@outputs('Compose_PastaMulta')"; name = $nome; body = $body }) (RunAfter $depoisDe)
}
function LinkSharePoint([string] $arquivo, [string] $tipo, [string] $depoisDe = $arquivo) {
  return SharePoint 'CreateSharingLink' ([pscustomobject]@{
    dataset = $script:SiteSharePoint
    table = $script:BibliotecaId
    id = "@body('$arquivo')?['ItemId']"
    'permission/type' = $tipo
    'permission/scope' = 'organization'
  }) (RunAfter $depoisDe)
}
function Set-Prop($obj, [string] $name, $value) { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }

function Add-RefSharePoint($cd) {
  Set-Prop $cd.properties.connectionReferences 'shared_sharepointonline' ([pscustomobject]@{
    runtimeSource = 'embedded'
    connection = [pscustomobject]@{ connectionReferenceLogicalName = $script:ConexaoSharePoint }
    api = [pscustomobject]@{ name = 'shared_sharepointonline' }
  })
}

function Corrigir-Erro($defn, [string] $mensagem) {
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
      body = [pscustomobject]@{ success = $false; code = 'ERRO'; message = $mensagem }
    }
  })
  $erro.Terminate_1.runAfter = RunAfter 'Response_erro' @('Succeeded', 'Failed')
}

function Conferir-Comum($cd) {
  if ($cd.properties.connectionReferences.shared_sharepointonline.connection.connectionReferenceLogicalName -ne $script:ConexaoSharePoint) { throw 'Referência de conexão do SharePoint não confere.' }
  $erro = $cd.properties.definition.actions.Scope_1.actions
  if ([string]$erro.'Send_an_email_(V2)_1'.inputs.parameters.'emailMessage/To' -match '\.\.br') { throw "E-mail de erro ainda com '..br'." }
  if (-not (Has $erro 'Response_erro') -or $erro.Response_erro.inputs.statusCode -ne 500) { throw 'Falta a resposta 500 no tratamento de erro.' }
}

function Corrigir-NotificarCondutor($cd, [string] $raiz, [string] $emailPara = '') {
  $defn = $cd.properties.definition
  $cd.properties.connectionReferences.PSObject.Properties.Remove('shared_onedriveforbusiness')
  Add-RefSharePoint $cd

  $mot = $defn.actions.Scope.actions.Apply_to_each_GUID.actions.Condition_Mot_Vazio
  $mot.expression = [pscustomobject]@{ and = @([pscustomobject]@{ equals = @("@empty(outputs('Get_a_row_by_ID_Multa')?['body/_cr40f_motorista_value'])", $true) }) }

  $env = $mot.else.actions
  if (-not (Has $env 'Compose_PastaMulta') -or -not (Has $env 'Condition_auto_1') -or -not (Has $env 'Condition_auto_2')) { throw 'Ramo de envio sem Compose_PastaMulta/Condition_auto_1/Condition_auto_2; formato inesperado.' }
  $env.Compose_PastaMulta.inputs = PastaMultaExpr $raiz 'Get_a_row_by_ID_Multa'
  $env.Compose_PastaMulta.runAfter = RunAfter 'Get_a_row_by_ID_Infração'

  $email = $env.'Send_an_email_(V2)'.inputs.parameters
  foreach ($n in @(@('Condition_auto_1', '', 'Compose_NomeAuto1', 'Download_a_file_or_an_image_Auto'), @('Condition_auto_2', '_2', 'Compose_NomeAuto2', 'Download_a_file_or_an_image_Auto_2'))) {
    $sim = $env.($n[0]).actions
    foreach ($velha in @("Get_file_metadata_por_FolderID$($n[1])", "Compose_FolderPath_Multa$($n[1])")) { $sim.PSObject.Properties.Remove($velha) }
    $arquivo = "Create_file$($n[1])"; $link = "Create_share_link$($n[1])"
    Set-Prop $sim $arquivo (SalvarNoSharePoint "@outputs('$($n[2])')" "@base64ToBinary(body('$($n[3])')?['`$content'])" $n[2])
    Set-Prop $sim $link (LinkSharePoint $arquivo 'view')
    $email.'emailMessage/Body' = ([string]$email.'emailMessage/Body').Replace("outputs('$link')?['body/WebUrl']", "body('$link')?['link']?['webUrl']")
  }
  if ($emailPara) { $email.'emailMessage/To' = $emailPara }
  Corrigir-Erro $defn 'Não foi possível notificar o condutor. A equipe recebeu o aviso por e-mail.'
}

function Conferir-NotificarCondutor($cd, [string] $raiz, [string] $emailPara = '') {
  Conferir-Comum $cd
  $defn = $cd.properties.definition
  if (($defn | ConvertTo-Json -Depth 90 -Compress) -match 'shared_onedriveforbusiness') { throw 'Ainda há ação do OneDrive.' }
  $mot = $defn.actions.Scope.actions.Apply_to_each_GUID.actions.Condition_Mot_Vazio
  if ($mot.expression.and[0].equals[0] -notmatch '^@empty\(') { throw 'Condição de multa sem motorista não usa empty().' }
  $env = $mot.else.actions
  if ($env.Compose_PastaMulta.inputs -ne (PastaMultaExpr $raiz 'Get_a_row_by_ID_Multa')) { throw 'Compose_PastaMulta não confere.' }
  $email = $env.'Send_an_email_(V2)'.inputs.parameters
  foreach ($n in @(@('Condition_auto_1', ''), @('Condition_auto_2', '_2'))) {
    $sim = $env.($n[0]).actions
    if ($sim."Create_file$($n[1])".inputs.host.operationId -ne 'CreateFile' -or $sim."Create_file$($n[1])".inputs.parameters.folderPath -ne "@outputs('Compose_PastaMulta')") { throw "Create_file$($n[1]) não confere." }
    if ($sim."Create_share_link$($n[1])".inputs.host.operationId -ne 'CreateSharingLink') { throw "Create_share_link$($n[1]) não confere." }
    if ($email.'emailMessage/Body' -notmatch [regex]::Escape("body('Create_share_link$($n[1])')?['link']?['webUrl']")) { throw "Corpo do e-mail sem o link de Create_share_link$($n[1])." }
  }
  $esperado = if ($emailPara) { $emailPara } else { $script:NotificacaoTo }
  if ($email.'emailMessage/To' -ne $esperado) { throw 'Destinatário da notificação não confere.' }
}

function Corrigir-GerarContrato($cd, [string] $raiz) {
  $defn = $cd.properties.definition
  Add-RefSharePoint $cd
  $s = $defn.actions.Scope.actions
  foreach ($a in 'Compose_PastaMulta', 'Create_file', 'Convert_Word_Document_to_PDF', 'Create_file_1', 'Create_share_link', 'Update_a_row', 'Response') { if (-not (Has $s $a)) { throw "Scope sem $a; formato inesperado." } }
  foreach ($velha in 'Get_file_metadata_por_FolderID', 'Compose_FolderPath_Multa') { $s.PSObject.Properties.Remove($velha) }
  $s.Compose_PastaMulta.inputs = PastaMultaExpr $raiz 'Get_a_row_by_ID_Multas'

  $nome = "Contrato de Multa - @{outputs('Get_a_row_by_ID_Multas')?['body/cr40f_id_multa']}"
  # O .docx temporário fica no OneDrive do noreply só para o Word Online converter.
  $s.Create_file.inputs.parameters.folderPath = $script:PastaTemporariaContrato
  $s.Create_file.runAfter = RunAfter 'Compose_PastaMulta'
  Set-Prop $s 'Create_file_1' (SalvarNoSharePoint "$nome.pdf" "@body('Convert_Word_Document_to_PDF')" 'Convert_Word_Document_to_PDF')
  Set-Prop $s 'Salvar_docx_SharePoint' (SalvarNoSharePoint "$nome.docx" "@body('Populate_a_Microsoft_Word_template')" 'Create_file_1')
  Set-Prop $s 'Create_share_link' (LinkSharePoint 'Create_file_1' 'edit' 'Salvar_docx_SharePoint')
  $s.Response.inputs.body.shareUrl = "@{body('Create_share_link')?['link']?['webUrl']}"
  Corrigir-Erro $defn 'Não foi possível gerar o contrato. A equipe recebeu o aviso por e-mail.'
}

function Conferir-GerarContrato($cd, [string] $raiz) {
  Conferir-Comum $cd
  $s = $cd.properties.definition.actions.Scope.actions
  if ($s.Compose_PastaMulta.inputs -ne (PastaMultaExpr $raiz 'Get_a_row_by_ID_Multas')) { throw 'Compose_PastaMulta não confere.' }
  if (Has $s 'Get_file_metadata_por_FolderID') { throw 'Ainda resolve a pasta por cr40f_folderid.' }
  if ($s.Create_file.inputs.parameters.folderPath -ne $script:PastaTemporariaContrato) { throw 'Create_file não grava na pasta temporária.' }
  foreach ($a in 'Create_file_1', 'Salvar_docx_SharePoint') {
    if ($s.$a.inputs.host.operationId -ne 'CreateFile' -or $s.$a.inputs.parameters.folderPath -ne "@outputs('Compose_PastaMulta')") { throw "$a não confere." }
  }
  if ($s.Create_share_link.inputs.host.operationId -ne 'CreateSharingLink') { throw 'Create_share_link não confere.' }
  if ($s.Response.inputs.body.shareUrl -ne "@{body('Create_share_link')?['link']?['webUrl']}") { throw 'Response sem o link do SharePoint.' }
}
