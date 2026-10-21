param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $ChecklistId = "",
  # Grava no DEV: troca o carro atual do funcionario (origem Infleet) e espera o checklist de troca. Exige os tres.
  [switch] $SimularTroca,
  [string] $FuncionarioId = "",
  [string] $VeiculoId = ""
)
# Smoke somente leitura: cada Custom API deve responder com a validacao do plugin para identificador vazio.
# Com -ChecklistId (checklist pendente do usuario autenticado, no DEV), conclui-o de verdade: o primeiro item
# OK / Nao OK recebe "nok" com o primeiro problema da lista e uma foto de teste, os demais okNok recebem "ok",
# e confere new_temproblema = true e new_qtdproblemas = 1. Sem item okNok, so conclui e nao exige as colunas novas.
# Sempre confere (somente leitura) o schema e o step da troca: new_origem = 100000002, new_entreguepor, new_trocadetectadaem
# e o step assincrono do HandoverChecklistPlugin. Com -SimularTroca -FuncionarioId -VeiculoId (grava no DEV), dispara uma troca.
$ErrorActionPreference = "Stop"
$baseUrl = $EnvironmentUrl.TrimEnd("/")
Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = (Get-MsalToken -PublicClientApplication $client -Scopes "$baseUrl/user_impersonation" -Silent).AccessToken
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0" }
$api = "$baseUrl/api/data/v9.2"
foreach ($case in @(
  @{ Name = "new_SolicitarChecklistVeiculo"; Key = "new_VeiculoId" },
  @{ Name = "new_ReatribuirChecklistVeiculo"; Key = "new_ChecklistId" },
  @{ Name = "new_ConcluirChecklistVeiculo"; Key = "new_ChecklistId" },
  @{ Name = "new_CancelarChecklistVeiculo"; Key = "new_ChecklistId" },
  @{ Name = "new_ReenviarPushChecklist"; Key = "new_ChecklistId" }
)) {
  $payload = @{}
  $payload[$case.Key] = [guid]::Empty.ToString("D")
  if ($case.Name -eq "new_ConcluirChecklistVeiculo") { $payload.new_RespostasJson = "[]" }
  try {
    Invoke-RestMethod -Method Post -Uri "$api/$($case.Name)" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($payload | ConvertTo-Json) | Out-Null
    throw "API $($case.Name) aceitou identificador vazio."
  } catch {
    if ($_.Exception.Message -match "aceitou identificador vazio") { throw }
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    if ($detail -notmatch "Identificador do checklist inv") { throw "API $($case.Name) nao retornou validacao do plugin: $detail" }
    Write-Output "API com plugin ativo: $($case.Name)"
  }
}
$pluginType = Invoke-RestMethod -Method Get -Uri "$api/plugintypes?`$select=plugintypeid&`$filter=typename eq 'Betinhos.DriverRecordSharing.ChecklistCommandPlugin'" -Headers $headers
if (@($pluginType.value).Count -ne 1) { throw "Plugin de checklists ausente ou duplicado." }
$typeId = [guid]$pluginType.value[0].plugintypeid
$steps = Invoke-RestMethod -Method Get -Uri "$api/sdkmessageprocessingsteps?`$select=name,stage,mode,statecode,filteringattributes&`$filter=_eventhandler_value eq $typeId and stage eq 10" -Headers $headers
$guard = @($steps.value | Where-Object { $_.name -eq 'Checklists - bloquear edicao apos encerramento' })
if ($guard.Count -ne 1 -or [int]$guard[0].statecode -ne 0 -or [int]$guard[0].mode -ne 0 -or $guard[0].filteringattributes -notmatch 'new_respostasjson') { throw "Trava de edicao do checklist ausente ou inativa." }
Write-Output "Trava de edicao do checklist ativa no DEV"

# --- Troca detectada pela Infleet: schema e step (somente leitura)
$origem = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='new_checklistveiculo')/Attributes(LogicalName='new_origem')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)" -Headers $headers
if (@($origem.OptionSet.Options | Where-Object { [int]$_.Value -eq 100000002 }).Count -ne 1) { throw "Opcao new_origem = 100000002 (Troca) ausente." }
foreach ($coluna in @("new_entreguepor", "new_trocadetectadaem")) {
  $attr = Invoke-RestMethod -Method Get -Uri "$api/EntityDefinitions(LogicalName='new_checklistveiculo')/Attributes?`$select=LogicalName&`$filter=LogicalName eq '$coluna'" -Headers $headers
  if (@($attr.value).Count -ne 1) { throw "Coluna new_checklistveiculo.$coluna ausente." }
}
$handoverType = Invoke-RestMethod -Method Get -Uri "$api/plugintypes?`$select=plugintypeid&`$filter=typename eq 'Betinhos.DriverRecordSharing.HandoverChecklistPlugin'" -Headers $headers
if (@($handoverType.value).Count -ne 1) { throw "PluginType HandoverChecklistPlugin ausente ou duplicado." }
$handoverTypeId = [guid]$handoverType.value[0].plugintypeid
$handoverSteps = Invoke-RestMethod -Method Get -Uri "$api/sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,stage,mode,statecode,filteringattributes,asyncautodelete,_sdkmessageprocessingstepsecureconfigid_value&`$filter=_eventhandler_value eq $handoverTypeId" -Headers $headers
$handoverStep = @($handoverSteps.value | Where-Object { $_.name -eq 'Checklists - checklist de recebimento na troca (Infleet)' })
if ($handoverStep.Count -ne 1) { throw "Step da troca ausente ou duplicado." }
$h = $handoverStep[0]
if ([int]$h.statecode -ne 0 -or [int]$h.stage -ne 40 -or [int]$h.mode -ne 1 -or [string]$h.filteringattributes -ne 'cr40f_veiculoatual') { throw "Step da troca com contrato divergente (stage/mode/filtro/estado)." }
if (-not $h._sdkmessageprocessingstepsecureconfigid_value) { throw "Step da troca sem configuracao segura (token Infleet)." }
$handoverImages = Invoke-RestMethod -Method Get -Uri "$api/sdkmessageprocessingstepimages?`$select=entityalias,attributes,imagetype&`$filter=_sdkmessageprocessingstepid_value eq $($h.sdkmessageprocessingstepid) and entityalias eq 'pre'" -Headers $headers
$pre = @($handoverImages.value)
if ($pre.Count -ne 1 -or [int]$pre[0].imagetype -ne 0 -or [string]$pre[0].attributes -ne 'cr40f_veiculoatual') { throw "Pre-imagem 'pre' do step da troca ausente ou divergente." }
Write-Output "Step da troca ativo no DEV"

if ($SimularTroca) {
  if (-not $FuncionarioId -or -not $VeiculoId) { throw "-SimularTroca exige -FuncionarioId e -VeiculoId." }
  $funcionario = [guid]::Parse($FuncionarioId).ToString("D")
  $veiculo = [guid]::Parse($VeiculoId).ToString("D")
  $antes = (Get-Date).ToUniversalTime()
  $patch = @{
    "cr40f_veiculoatual@odata.bind" = "/cr40f_veiculoses($veiculo)"
    new_veiculoatualdesde = $antes.ToString("yyyy-MM-ddTHH:mm:ssZ")
    new_origemveiculoatual = 100000000
  }
  Invoke-RestMethod -Method Patch -Uri "$api/cr40f_funcionarioses($funcionario)" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes(($patch | ConvertTo-Json))) | Out-Null
  Write-Output "Troca simulada no DEV: funcionario $funcionario, veiculo $veiculo. Aguardando o checklist (ate 120 s)."
  $criado = $null
  for ($tentativa = 0; $tentativa -lt 12 -and -not $criado; $tentativa++) {
    Start-Sleep -Seconds 10
    $consulta = "new_checklistveiculos?`$select=new_checklistveiculoid,new_name,new_estado,new_pushstatus,new_pusherro,new_erroatribuicao,_new_motorista_value,_new_entreguepor_value,new_trocadetectadaem,new_solicitadoem&`$filter=new_origem eq 100000002 and _new_veiculo_value eq $veiculo and new_solicitadoem gt $($antes.ToString('yyyy-MM-ddTHH:mm:ssZ'))&`$orderby=new_solicitadoem desc&`$top=1"
    $achados = @((Invoke-RestMethod -Method Get -Uri "$api/$consulta" -Headers $headers).value)
    if ($achados.Count -gt 0) { $criado = $achados[0] }
  }
  if ($criado) {
    Write-Output "Checklist de troca criado: $($criado.new_checklistveiculoid) estado=$($criado.new_estado) motorista=$($criado._new_motorista_value) entreguePor=$($criado._new_entreguepor_value) trocaDetectadaEm=$($criado.new_trocadetectadaem) push=$($criado.new_pushstatus) erroPush=$($criado.new_pusherro) erroAtribuicao=$($criado.new_erroatribuicao)"
  } else {
    $operacoes = Invoke-RestMethod -Method Get -Uri "$api/asyncoperations?`$select=statuscode,message,friendlymessage,createdon&`$filter=_owningextensionid_value eq $($h.sdkmessageprocessingstepid) and createdon gt $($antes.ToString('yyyy-MM-ddTHH:mm:ssZ'))&`$orderby=createdon desc&`$top=1" -Headers $headers
    $operacao = @($operacoes.value)
    if ($operacao.Count -gt 0) { throw "Nenhum checklist de troca em 120 s. asyncoperation do step: statuscode=$($operacao[0].statuscode) message=$($operacao[0].message)" }
    throw "Nenhum checklist de troca em 120 s e nenhuma asyncoperation do step: o step nao disparou (confira filtro, origem e veiculo)."
  }
}

if ($ChecklistId) {
  $id = [guid]::Parse($ChecklistId).ToString("D")
  $antes = Invoke-RestMethod -Method Get -Uri "$api/new_checklistveiculos($id)?`$select=new_estado,new_itensjson" -Headers $headers
  $parsed = ConvertFrom-Json $antes.new_itensjson
  $itens = @($parsed | ForEach-Object { $_ })
  $fotoTeste = @{ link = "https://example.com/smoke-checklist.jpg"; caminho = "Checklists/smoke"; nomeArquivo = "smoke.jpg" }
  $okNokItens = @($itens | Where-Object { $_.tipo -eq "okNok" })
  $respostas = @()
  $problemaUsado = $null
  foreach ($item in $itens) {
    if ($item.tipo -eq "foto") { $respostas += @{ chave = $item.chave; fotos = @($fotoTeste) } }
    elseif ($item.tipo -eq "numero") { $respostas += @{ chave = $item.chave; valor = "1" } }
    elseif ($item.tipo -eq "texto") { $respostas += @{ chave = $item.chave; valor = "Smoke DEV" } }
    elseif ($item.tipo -eq "okNok") {
      if ($item.chave -eq $okNokItens[0].chave) {
        $problemaUsado = @($item.opcoesProblema)[0]
        if (-not $problemaUsado) { throw "Item okNok '$($item.rotulo)' sem opcoesProblema no new_itensjson." }
        $respostas += @{ chave = $item.chave; valor = "nok"; problemas = @($problemaUsado); observacao = "Smoke DEV"; fotos = @($fotoTeste) }
      } else {
        $respostas += @{ chave = $item.chave; valor = "ok" }
      }
    }
  }
  $body = @{ new_ChecklistId = $id; new_RespostasJson = (ConvertTo-Json -InputObject @($respostas) -Depth 6 -Compress) }
  Invoke-RestMethod -Method Post -Uri "$api/new_ConcluirChecklistVeiculo" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))) | Out-Null
  if ($okNokItens.Count -gt 0) {
    $depois = Invoke-RestMethod -Method Get -Uri "$api/new_checklistveiculos($id)?`$select=new_estado,new_temproblema,new_qtdproblemas" -Headers $headers
    if ($depois.new_temproblema -ne $true -or [int]$depois.new_qtdproblemas -ne 1) { throw "Resumo do Nao OK incorreto: new_temproblema=$($depois.new_temproblema), new_qtdproblemas=$($depois.new_qtdproblemas)." }
    Write-Output "Checklist concluido com 1 Nao OK ('$problemaUsado'): new_temproblema = true e new_qtdproblemas = 1."
  } else {
    Write-Output "Checklist concluido (modelo sem item OK / Nao OK; resumo de problemas nao verificado)."
  }
}
