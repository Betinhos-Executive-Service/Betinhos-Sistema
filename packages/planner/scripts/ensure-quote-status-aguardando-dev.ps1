# Garante a opção "Aguardando informação" (100004002) em cr40f_pedidodecotacao.cr40f_statuscotacao no DEV.
# O Planner (apps/shell/src/pages/planner/data/dataverse.ts, QUOTE_STATUS_VALUES) grava esse valor e a API recusa se a opção não existe.
# Só insere: não altera nem renomeia nenhuma opção existente (100004007 "Convertida em serviço" fica como está).
# Rodar uma vez, à mão, do checkout principal na develop atualizada. O PROD recebe a opção pela publicação das soluções, nunca por este script.
# -WhatIf mostra o que faria sem gravar.
[CmdletBinding(SupportsShouldProcess)]
param([switch] $DeviceCode)

$ErrorActionPreference = "Stop"
$environmentUrl = "https://org23b93544.crm2.dynamics.com"
$api = "$environmentUrl/api/data/v9.2"
$entity = "cr40f_pedidodecotacao"
$attribute = "cr40f_statuscotacao"
$solution = "AppBetinhos"
$optionValue = 100004002
$optionLabel = "Aguardando informação"

if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "MSAL.PS não encontrado." }
Import-Module MSAL.PS -ErrorAction Stop
$clientId = [Environment]::GetEnvironmentVariable("DV_CLIENT_ID")
if (-not $clientId) { $clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d" }
$app = New-MsalClientApplication -ClientId $clientId -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $app
try { $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -Silent }
catch {
  if (-not $DeviceCode) { throw "Sem sessão MSAL em cache para o DEV. Execute este script com -DeviceCode." }
  $token = Get-MsalToken -PublicClientApplication $app -Scopes "$environmentUrl/user_impersonation" -DeviceCode
}
$headers = @{
  Authorization = "Bearer $($token.AccessToken)"
  Accept = "application/json"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
  "MSCRM.SolutionUniqueName" = $solution
}

$solutionRows = Invoke-RestMethod -Method Get -Uri "$api/solutions?`$select=solutionid&`$filter=uniquename eq '$solution'" -Headers $headers
if ($solutionRows.value.Count -ne 1) { throw "Solution $solution não encontrada no DEV." }

# Lê a coluna e o conjunto de opções (local ou global).
$choiceUri = "$api/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$attribute')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet"
$choice = Invoke-RestMethod -Method Get -Uri $choiceUri -Headers $headers
$optionSet = $choice.OptionSet
$options = @($optionSet.Options)
$isGlobal = [bool] $optionSet.IsGlobal
function Get-OptionLabel($o) { (@($o.Label.LocalizedLabels | Where-Object { $_.LanguageCode -eq 1046 } | Select-Object -First 1)[0]).Label }
Write-Host ("Coluna {0}.{1}: choice {2}{3}." -f $entity, $attribute, $(if ($isGlobal) { "global" } else { "local" }), $(if ($isGlobal) { " '" + $optionSet.Name + "'" } else { "" }))

$existing = @($options | Where-Object { $_.Value -eq $optionValue })
if ($existing.Count -gt 0) {
  Write-Host "Opção $optionValue já existe no DEV (rótulo '$(Get-OptionLabel $existing[0])'). Nada a fazer."
  return
}
$sameLabel = @($options | Where-Object { (Get-OptionLabel $_) -eq $optionLabel })
if ($sameLabel.Count -gt 0) { throw "O rótulo '$optionLabel' já existe com outro valor ($($sameLabel[0].Value)). Revise antes de inserir." }

# Global: a ação recebe OptionSetName; local: EntityLogicalName + AttributeLogicalName.
$label = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; LocalizedLabels = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; Label = $optionLabel; LanguageCode = 1046 }) }
$payload = @{ Value = $optionValue; Label = $label; SolutionUniqueName = $solution }
if ($isGlobal) { $payload.OptionSetName = $optionSet.Name }
else { $payload.EntityLogicalName = $entity; $payload.AttributeLogicalName = $attribute }

if (-not $PSCmdlet.ShouldProcess("$entity.$attribute (DEV)", "InsertOptionValue $optionValue '$optionLabel'")) { return }
Invoke-RestMethod -Method Post -Uri "$api/InsertOptionValue" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 10))) | Out-Null
Write-Host "Opção $optionValue '$optionLabel' criada no DEV."

# Confere por leitura de volta.
$check = Invoke-RestMethod -Method Get -Uri $choiceUri -Headers $headers
$created = @($check.OptionSet.Options | Where-Object { $_.Value -eq $optionValue })
if ($created.Count -ne 1 -or (Get-OptionLabel $created[0]) -ne $optionLabel) { throw "Conferência falhou: opção $optionValue não voltou com o rótulo esperado." }

$xml = "<importexportxml><entities><entity>$entity</entity></entities></importexportxml>"
Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType "application/json; charset=utf-8" -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
Write-Host "Metadata da cotação publicada no DEV."
