# Troca, no "Flow Salvar Foto BD - Onedrive" (usado pelo Formulário Geral, uploadPassengerPhoto), a gravação da foto
# do passageiro no OneDrive do noreply ("/Banco de Dados/<Nome> - <Cliente>.<ext>") pela gravação no SharePoint
# (site BetinhosGestoInterna, biblioteca "Documentos Compartilhados", pasta Passageiros/Fotos/<DEV|PROD>, nome
# <passengerId minúsculo>.<ext>, sobrescreve). Não cria link de compartilhamento: remove o CreateShareLinkV2 (OneDrive)
# ou o CreateSharingLink (SharePoint, versão anterior deste patch) e devolve em webUrl a URL com caminho
# https://<tenant>.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/<amb>/<id>.<ext>,
# que o Formulário Geral converte em preview/download. A pasta vem da variável de ambiente new_PastaFotosPassageiros
# (valor por ambiente, fora da solução; sem valor vale a do PROD), para o flow importado no PROD não gravar na do DEV. Parte do estado original (OneDrive) ou do intermediário
# (SharePoint + CreateSharingLink); já no SharePoint com a pasta fixa, só troca a pasta pela variável; no formato final, não faz nada. Gatilho, contrato da resposta
# (webUrl, driveItemId, fileName, uploadedAt) e o catch (e-mail + Terminate) não mudam. Sem -Apply é DRY RUN.
#
# Antes de alterar, salva o clientdata atual em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-salvar-foto.ps1 -Ambiente DEV -Apply -Restaurar <arquivo>
# PROD exige -Apply e -ConfirmarProd. Requer `az login` com acesso ao ambiente.
param(
  [ValidateSet('DEV', 'PROD')][string] $Ambiente = 'DEV',
  [switch] $Apply,
  [switch] $ConfirmarProd,
  [string] $Restaurar = ''
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ambientes = @{
  DEV  = @{ Url = 'https://org23b93544.crm2.dynamics.com'; FlowId = '7af1b60f-ed5d-f111-a825-70a8a5a95b84'; SpRef = 'new_sharedsharepointonline_30d17' }
  PROD = @{ Url = 'https://orgf261ae8e.crm2.dynamics.com'; FlowId = ''; SpRef = '' }
}
$cfg = $ambientes[$Ambiente]
$environmentUrl = $cfg.Url
$solutionName = 'AppBetinhos'
$flowName = 'Flow Salvar Foto BD - Onedrive'
$refFlowName = 'Flow - Salvar arquivo no SharePoint'
$siteUrl = 'https://betinhos.sharepoint.com/sites/BetinhosGestoInterna'
$library = 'Documentos Compartilhados'
$libraryId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
$pastaSchema = 'new_PastaFotosPassageiros'
$pastaParam = "Pasta das fotos de passageiro ($pastaSchema)"
$pastaValor = "/$library/Passageiros/Fotos/$Ambiente"
$folder = "@parameters('$pastaParam')"
if ($Ambiente -eq 'PROD' -and $Apply -and -not $ConfirmarProd) { throw 'PROD exige -ConfirmarProd junto com -Apply.' }
if ($Restaurar -and -not $Apply) { throw '-Restaurar grava no flow; use junto com -Apply.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw "Token do Dataverse $Ambiente indisponível (rode az login)." }
# Sem MSCRM.SolutionUniqueName: o valor da variável (381) não pode entrar na AppBetinhos; a definição entra por AddSolutionComponent.
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[foto-sharepoint] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Redact([string] $s) { return ($s -replace 'sig=[^&"\s]+', 'sig=REDACTED') }
function Flow() {
  if ($cfg.FlowId) { $filter = "workflowid eq $($cfg.FlowId) and category eq 5" } else { $filter = "name eq '$flowName' and category eq 5" }
  $rows = @((Dv GET "workflows?`$select=workflowid,name,statecode,clientdata&`$filter=$filter").value)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no $Ambiente." }
  return $rows[0]
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); o backup redigido não serviria para restaurar. Revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-Salvar-Foto-BD-$Ambiente-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, (Redact $row.clientdata), (New-Object Text.UTF8Encoding $false))
  Write-Host "[foto-sharepoint] backup: $file"
}
function Save($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -eq 1) { Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode,statuscode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
  }
}
function Resumo([string] $label, $action) {
  $p = $action.inputs.parameters
  $campos = ($p.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '
  Write-Output ('  {0} [{1}/{2}] {3}' -f $label, $action.inputs.host.connectionName, $action.inputs.host.operationId, $campos)
}
# Variável da pasta: definição (padrão = pasta do PROD) na AppBetinhos do DEV; valor atual fora da solução, um por ambiente.
# No PROD a definição chega pelo import; só o valor é gravado. Sem -Gravar só confere.
function Pasta([switch] $Gravar) {
  $padrao = "/$library/Passageiros/Fotos/PROD"
  $sel = "environmentvariabledefinitions?`$select=environmentvariabledefinitionid,defaultvalue&`$filter=schemaname eq '$pastaSchema'"
  $defs = @((Dv GET $sel).value)
  if (-not $defs.Count -and $Ambiente -ne 'DEV') { throw "Variável $pastaSchema ausente no $Ambiente; ela chega pelo import das soluções." }
  if (-not $Gravar) { Write-Output "  ${pastaSchema}: $(if ($defs.Count) { 'existe' } else { 'será criada' }); valor atual -> '$pastaValor'"; return }
  if (-not $defs.Count) {
    Dv POST environmentvariabledefinitions @{ schemaname = $pastaSchema; displayname = 'Pasta das fotos de passageiro'; type = 100000000; defaultvalue = $padrao } | Out-Null
    $defs = @((Dv GET $sel).value)
  }
  $defId = $defs[0].environmentvariabledefinitionid
  if ($Ambiente -eq 'DEV') {
    if ($defs[0].defaultvalue -ne $padrao) { Dv PATCH "environmentvariabledefinitions($defId)" @{ defaultvalue = $padrao } | Out-Null }
    $solucao = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
    if ($solucao.Count -ne 1) { throw "Solução $solutionName ausente ou ambígua." }
    $filtro = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solucao[0].solutionid) and componenttype eq 380 and objectid eq $defId"
    if (-not @((Dv GET $filtro).value).Count) {
      Dv POST AddSolutionComponent @{ ComponentId = $defId; ComponentType = 380; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
    }
  }
  $vals = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)
  if ($vals.Count -gt 1) { throw "Variável $pastaSchema com valores ambíguos." }
  if ($vals.Count) { Dv PATCH "environmentvariablevalues($($vals[0].environmentvariablevalueid))" @{ value = $pastaValor } | Out-Null }
  else { Dv POST environmentvariablevalues @{ value = $pastaValor; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } | Out-Null }
  Write-Output "  ${pastaSchema}: valor atual '$pastaValor' gravado no $Ambiente."
}

$who = Dv GET WhoAmI
if (-not $who.OrganizationId) { throw "A API não respondeu pela organização $Ambiente." }
$flow = Flow

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  $props = ($text | ConvertFrom-Json).properties.definition.triggers.manual.inputs.schema.properties
  if (-not $props -or -not ($props.PSObject.Properties.Name -contains 'passengerId') -or -not ($props.PSObject.Properties.Name -contains 'base64')) { throw 'O arquivo não é um backup deste flow.' }
  Backup $flow
  Save $flow $text
  Write-Output "${Ambiente}: '$flowName' restaurado de $Restaurar e ativo."
  return
}

$clientData = $flow.clientdata | ConvertFrom-Json
$scope = $clientData.properties.definition.actions.Scope.actions
$names = @($scope.PSObject.Properties.Name)
foreach ($n in 'PastaDestino', 'FileName', 'Create_file', 'Response') {
  if ($names -notcontains $n) { throw "O flow não está no formato esperado: ação '$n' ausente no Scope." }
}
$temLink = $names -contains 'Create_share_link'
$jaSharePoint = $scope.Create_file.inputs.host.apiId -like '*shared_sharepointonline'
$migrar = -not ($jaSharePoint -and -not $temLink)
if (-not $migrar -and $scope.PastaDestino.inputs -eq $folder) {
  Write-Output "${Ambiente}: '$flowName' já grava no SharePoint na pasta de $pastaSchema; o flow não muda."
  Pasta -Gravar:$Apply
  return
}
Write-Output "${Ambiente}: '$flowName' ($($flow.workflowid), statecode $($flow.statecode)) - mudanças:"
Write-Output "  PastaDestino: '$($scope.PastaDestino.inputs)' -> '$folder' ($pastaSchema = '$pastaValor')"
$scope.PastaDestino.inputs = $folder
$clientData.properties.definition.parameters | Add-Member -Force -NotePropertyName $pastaParam -NotePropertyValue ([pscustomobject]@{
    defaultValue = "/$library/Passageiros/Fotos/PROD"
    type = 'String'
    metadata = [pscustomobject]@{ schemaName = $pastaSchema; description = 'Pasta do SharePoint onde o flow grava a foto do passageiro.' }
  })

if ($migrar) {
  $opLink = if ($temLink) { $scope.Create_share_link.inputs.host.operationId } else { '' }
  $esperado = if ($jaSharePoint) { 'CreateSharingLink' } else { 'CreateShareLinkV2' }
  if ($scope.Create_file.inputs.host.operationId -ne 'CreateFile' -or $opLink -ne $esperado) {
    throw "O flow não está no formato esperado (CreateFile + $esperado); link atual: '$opLink'."
  }

  # Connection reference do SharePoint: DEV fixa; PROD pela usada no flow ativo de referência.
  $spRef = $cfg.SpRef
  if (-not $spRef) {
    $src = @((Dv GET "workflows?`$select=clientdata&`$filter=name eq '$refFlowName' and category eq 5 and statecode eq 1").value)
    $achadas = @($src | ForEach-Object {
        $refs = ($_.clientdata | ConvertFrom-Json).properties.connectionReferences
        $refs.PSObject.Properties | Where-Object { $_.Value.api.name -eq 'shared_sharepointonline' } | ForEach-Object { $_.Value.connection.connectionReferenceLogicalName }
      } | Where-Object { $_ } | Sort-Object -Unique)
    if ($achadas.Count -ne 1) {
      $todas = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectionid&`$filter=connectorid eq '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'").value |
          ForEach-Object { "$($_.connectionreferencelogicalname) (conexão $($_.connectionid))" })
      throw "Connection reference do SharePoint ambígua no $Ambiente (flows '$refFlowName' ativos: $($src.Count); refs: $($achadas -join ', ')). Disponíveis: $($todas -join '; ')"
    }
    $spRef = $achadas[0]
  }
  $existe = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectionid&`$filter=connectionreferencelogicalname eq '$spRef'").value)
  if ($existe.Count -ne 1 -or -not $existe[0].connectionid) { throw "Connection reference '$spRef' ausente ou sem conexão no $Ambiente." }

  $host_ = { param($op) [pscustomobject]@{ apiId = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'; connectionName = 'shared_sharepointonline'; operationId = $op } }
  $retry = [pscustomobject]@{ type = 'fixed'; count = 2; interval = 'PT5S' }
  $ext = "if(greater(length(split(coalesce(triggerBody()?['fileName'], ''), '.')), 1), toLower(last(split(triggerBody()?['fileName'], '.'))), 'jpg')"
  $fileExpr = "@concat(toLower(trim(coalesce(triggerBody()?['passengerId'], guid()))), '.', $ext)"

  Write-Output "  FileName antes : $($scope.FileName.inputs)"
  Write-Output "  FileName depois: $fileExpr"
  Resumo 'Create_file antes        ' $scope.Create_file
  Resumo 'Create_share_link antes  ' $scope.Create_share_link
  Write-Output "  Response.body.webUrl antes: $($scope.Response.inputs.body.webUrl)"

  $scope.FileName.inputs = $fileExpr
  $scope.Create_file.inputs = [pscustomobject]@{
    host = & $host_ 'CreateFile'
    parameters = [pscustomobject]@{
      dataset = $siteUrl
      folderPath = "@outputs('PastaDestino')"
      name = "@outputs('FileName')"
      body = "@base64ToBinary(triggerBody()?['base64'])"
    }
    authentication = "@parameters('`$authentication')"
    retryPolicy = $retry
  }
  # Remove o link de compartilhamento; quem rodava depois dele passa a rodar depois do que o antecedia (Create_file).
  $depoisDoLink = $scope.Create_share_link.runAfter
  $scope.PSObject.Properties.Remove('Create_share_link')
  foreach ($a in $scope.PSObject.Properties) {
    if ($a.Value.PSObject.Properties.Name -notcontains 'runAfter') { continue }
    $ra = $a.Value.runAfter
    if ($ra -and ($ra.PSObject.Properties.Name -contains 'Create_share_link')) {
      $ra.PSObject.Properties.Remove('Create_share_link')
      foreach ($d in $depoisDoLink.PSObject.Properties) { $ra | Add-Member -NotePropertyName $d.Name -NotePropertyValue $d.Value -Force }
    }
  }
  # CreateFile devolve Path = "/Documentos Compartilhados/Passageiros/Fotos/<amb>/<id>.<ext>" (igual ao caminho na URL).
  $webUrlExpr = "@{concat('https://', uriHost('$siteUrl'), '/:i:/r', uriPath('$siteUrl'), replace(uriComponent(body('Create_file')?['Path']), '%2F', '/'))}"
  $scope.Response.inputs.body = [pscustomobject]@{
    webUrl = $webUrlExpr
    driveItemId = "@{body('Create_file')?['ItemId']}"
    fileName = "@{body('Create_file')?['Name']}"
    uploadedAt = '@{utcNow()}'
  }
  Resumo 'Create_file depois       ' $scope.Create_file
  Write-Output '  Create_share_link: removida (sem link de compartilhamento)'
  Write-Output "  Response.body.webUrl depois: $webUrlExpr"
  Write-Output "  Response.runAfter depois: $($scope.Response.PSObject.Properties['runAfter'].Value | ConvertTo-Json -Compress)"

  $refs = $clientData.properties.connectionReferences
  if (-not ($refs.PSObject.Properties.Name -contains 'shared_sharepointonline')) {
    $refs | Add-Member -NotePropertyName shared_sharepointonline -NotePropertyValue ([pscustomobject]@{
        api = [pscustomobject]@{ name = 'shared_sharepointonline' }
        connection = [pscustomobject]@{ connectionReferenceLogicalName = $spRef }
        runtimeSource = 'embedded'
      })
  }
  # A referência do OneDrive deixa de ser usada pelas ações, mas fica no clientdata para não mexer na solução.
  Write-Output "  connectionReferences: + shared_sharepointonline -> $spRef (OneDrive mantida, sem uso)"
}

if (-not $Apply) {
  $extra = ''
  if ($Ambiente -eq 'PROD') { $extra = ' -ConfirmarProd' }
  Pasta
  Write-Output "DRY RUN: nada gravado. Rode com -Apply$extra para aplicar."
  return
}

# Backup antes da variável: se o clientdata tiver sig=, nada é gravado. A variável vem antes do Save (o flow a referencia).
Backup $flow
Pasta -Gravar
Save $flow ($clientData | ConvertTo-Json -Depth 90 -Compress)

$check = ((Flow).clientdata | ConvertFrom-Json).properties.definition.actions.Scope.actions
if ($check.Create_file.inputs.host.connectionName -ne 'shared_sharepointonline' -or ($check.PSObject.Properties.Name -contains 'Create_share_link') -or $check.Response.inputs.body.webUrl -notmatch '/:i:/r' -or $check.PastaDestino.inputs -ne $folder) { throw 'A definição gravada não confere. Restaure com -Restaurar.' }
Write-Output "${Ambiente}: '$flowName' ativo, gravando em $pastaValor/<passengerId>.<ext> no SharePoint ($pastaSchema)."
