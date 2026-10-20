# Grava o valor atual de UMA variável de ambiente do Dataverse (environmentvariablevalue) em um ambiente.
# Não mexe na solução nem publica nada: só cria ou atualiza o valor daquele ambiente.
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/set-variavel-ambiente.ps1 `
#     -EnvironmentUrl https://<org>.crm2.dynamics.com -Nome new_EmailAdminAvisos -Valor noreply@betinhos.onmicrosoft.com
# Requer `az login --use-device-code --allow-no-subscriptions --tenant <tenant>` com acesso ao ambiente.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com/?$')] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9]+_[A-Za-z0-9_]+$')] [string] $Nome,
  [Parameter(Mandatory = $true)] [string] $Valor
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = $EnvironmentUrl.TrimEnd('/')

$token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponível para $base (rode az login)." }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  $params = @{ Method = $Method; Uri = "$base/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$org = (Dv GET 'organizations?$select=name').value[0].name
$defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid,displayname&`$filter=schemaname eq '$Nome'").value)
if ($defs.Count -ne 1) { throw "Variável $Nome não encontrada (ou ambígua) em $org." }
$defId = $defs[0].environmentvariabledefinitionid

$vals = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)
if ($vals.Count -gt 1) { throw "Variável $Nome com mais de um valor em $org; corrija manualmente." }

Write-Host "Ambiente: $org ($base)"
Write-Host "Variável: $Nome ($($defs[0].displayname))"
$resposta = Read-Host "Gravar o novo valor? Digite SIM para confirmar"
if ($resposta -ne 'SIM') { Write-Host 'Cancelado. Nada foi alterado.'; exit 1 }

if ($vals.Count) {
  $valId = $vals[0].environmentvariablevalueid
  Dv PATCH "environmentvariablevalues($valId)" @{ value = $Valor } | Out-Null
} else {
  Dv POST environmentvariablevalues @{ value = $Valor; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } | Out-Null
  $valId = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)[0].environmentvariablevalueid
}

$gravado = Dv GET "environmentvariablevalues($valId)?`$select=value,modifiedon"
if ($gravado.value -ne $Valor) { throw "O valor gravado não confere." }
Write-Output "OK: $Nome gravada em $org em $($gravado.modifiedon)."
