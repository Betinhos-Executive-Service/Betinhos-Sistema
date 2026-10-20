param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $ChecklistId = ""
)
# Smoke somente leitura: cada Custom API deve responder com a validacao do plugin para identificador vazio.
# Com -ChecklistId (checklist pendente do usuario autenticado, no DEV), conclui-o de verdade: o primeiro item
# OK / Nao OK recebe "nok" com o primeiro problema da lista e uma foto de teste, os demais okNok recebem "ok",
# e confere new_temproblema = true e new_qtdproblemas = 1. Sem item okNok, so conclui e nao exige as colunas novas.
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
