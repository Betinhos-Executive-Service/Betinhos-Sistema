param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Checklist manual pelo App Motoristas: acrescenta o parametro opcional de entrada new_ParaMim (Boolean) na Custom API
# new_SolicitarChecklistVeiculo (que ja existe e continua apontando para o mesmo plugin type). Com true, o plugin cria ou
# devolve o checklist aberto do carro para o proprio motorista que chamou, em vez de atribuir a quem esta com o carro.
# Parametro opcional omitido chega ao plugin como false, entao o shell (que nao envia o parametro) segue como antes.
# So acrescenta o parametro e o poe na AppBetinhos (a distribuicao do Deploy leva para a BetinhosAutomacao); nunca altera a API.
# Nao conflita com o plugin: quem le o parametro e o Betinhos.DriverRecordSharing publicado no mesmo Deploy, depois desta migration;
# plugin antigo ignora o parametro novo. Idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$ApiName = "new_SolicitarChecklistVeiculo"
$ParamName = "new_ParaMim"
# Id fixo para o DEV ficar estavel entre execucoes; TEST e PROD casam pelo uniquename.
$ParamId = "854fedf0-90c6-4343-9c4a-73ca86a34acb"

$api = @(Get-Rows "customapis" "customapiid" "uniquename eq '$ApiName'")
if ($api.Count -ne 1) { throw "Custom API $ApiName nao encontrada no DEV (ou duplicada)." }
$apiId = [string] $api[0].customapiid

$atual = @(Get-Rows "customapirequestparameters" "customapirequestparameterid,type,isoptional" "_customapiid_value eq $apiId and uniquename eq '$ParamName'")
if ($atual.Count -gt 1) { throw "$ApiName.$ParamName duplicado." }
if ($atual.Count -eq 1) {
  # type 0 = Boolean.
  if ([int] $atual[0].type -ne 0 -or -not [bool] $atual[0].isoptional) { throw "$ApiName.$ParamName existe fora do desenho (tipo Boolean, opcional). Confira antes de seguir." }
  $paramId = [string] $atual[0].customapirequestparameterid
  Write-Step "$ApiName.$ParamName ja existe"
} elseif (-not $Apply) {
  Write-Step "DRY RUN criaria o parametro opcional Boolean $ApiName.$ParamName."
  Write-Step "dry-run: nada gravado."
  return
} else {
  $paramId = $ParamId
  Invoke-Dv "POST" "customapirequestparameters" @{
    customapirequestparameterid = $ParamId; uniquename = $ParamName; name = "$ApiName.$ParamName"; displayname = $ParamName
    description = "true quando o motorista abre a propria vistoria pelo App (cria ou devolve o checklist aberto do carro para ele)"
    type = 0; isoptional = $true; "CustomAPIId@odata.bind" = "/customapis($apiId)"
  } | Out-Null
  Write-Step "criado o parametro $ApiName.$ParamName"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
$tipo = [int] (Invoke-Dv "GET" "EntityDefinitions(LogicalName='customapirequestparameter')?`$select=ObjectTypeCode").ObjectTypeCode
Add-ComponenteNaSolucao $paramId $tipo
Write-Step "OK: $ApiName.$ParamName na AppBetinhos"
