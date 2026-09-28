param(
  [Parameter(Mandatory=$true)][Guid] $AttachmentId,
  [Parameter(Mandatory=$true)][Guid] $AttemptId,
  [switch] $InvalidContent
)
$ErrorActionPreference = 'Stop'
# Only explicitly identified QA attachments on the fixed DEV Flow are accepted.
$qaAttachments = @('c1f0abbc-6cbb-f111-aaaf-7ced8da8c473','d8f0abbc-6cbb-f111-aaaf-7ced8da8c473','dbf0abbc-6cbb-f111-aaaf-7ced8da8c473','ff418c77-f454-45ee-bf8f-bb39d781254d')
if ($AttachmentId.ToString() -notin $qaAttachments) { throw 'Use somente os comprovantes QA DEV identificados neste script.' }
$flowToken = az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Autenticacao Flow DEV indisponivel.' }
$callback = Invoke-RestMethod -Method POST -Uri 'https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/25a2ab78-cf07-ee41-a124-457aa2c29aea/flows/d4ee3edf-47b0-cc14-716b-955fe696a353/triggers/manual/listCallbackUrl?api-version=2016-11-01' -Headers @{Authorization="Bearer $flowToken"} -Body '{}' -ContentType application/json -TimeoutSec 30
$content = if ($InvalidContent) { 'conteudo-invalido-qa' } else { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('Comprovante exclusivo de teste DEV. Sem valor operacional.')) }
$body = @{attachmentId=$AttachmentId.ToString();attemptId=$AttemptId.ToString();conteudoBase64=$content} | ConvertTo-Json -Compress
$timer = [Diagnostics.Stopwatch]::StartNew()
try {
  $response = Invoke-WebRequest -Method POST -Uri $callback.response.value -ContentType application/json -Body $body -SkipHttpErrorCheck -TimeoutSec 115
  Write-Output (@{attachmentId=$AttachmentId;status=$response.StatusCode;durationMs=$timer.ElapsedMilliseconds} | ConvertTo-Json -Compress)
} catch { throw 'Resposta de aceitação indisponível. Consulte o registro DEV antes de repetir o envio QA.' }
