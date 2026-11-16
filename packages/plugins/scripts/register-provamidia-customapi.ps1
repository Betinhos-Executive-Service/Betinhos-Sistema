param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV a Custom API new_ProvaMidia (unbound, new_Command -> new_Result, sem step customizado) apontando para o
# plugin type Betinhos.DriverRecordSharing.ProvaMidiaPlugin, e coloca API, parametro e resposta na AppBetinhos.
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); tipo de plugin e Custom API novos deste assembly continuam a mao, como as do app-motoristas-v2. O PROD recebe pelas solucoes.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar o assembly com a classe nova.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-provamidia-customapi.ps1 [-Apply]
# Usa o helper das migrations (_dv.ps1): Connect-Dv recusa host que nao seja o DEV.

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.ProvaMidiaPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Api = [pscustomobject]@{ Id = "30d16ebf-db60-48e8-92f4-5ab4b26107d5"; Name = "new_ProvaMidia" }
$Request = [pscustomobject]@{ Id = "f65138e3-ee54-425c-8e45-29d68c18c619"; Name = "new_Command" }
$Response = [pscustomobject]@{ Id = "b3726f1f-8d01-4df8-9ed5-d6ad69ee1f4f"; Name = "new_Result" }

$assembly = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assembly.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

# 1. Tipo de plugin
$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "ProvaMidiaPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assembly[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
}
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

# 2. Custom API, parametro e resposta
$api = @(Get-Rows "customapis" "customapiid,allowedcustomprocessingsteptype,bindingtype,_plugintypeid_value" "uniquename eq '$($Api.Name)'")
if ($api.Count -eq 1 -and [string]$api[0].customapiid -ne $Api.Id) { throw "$($Api.Name) existe com id $($api[0].customapiid), diferente do fixo $($Api.Id). Confira antes de seguir." }
if ($api.Count -eq 1 -and ([int]$api[0].allowedcustomprocessingsteptype -ne 0 -or [int]$api[0].bindingtype -ne 0)) { throw "$($Api.Name) existe fora do desenho (tipo de step ou binding)." }
if (-not $Apply) {
  Write-Step $(if ($api.Count -eq 1) { "DRY RUN $($Api.Name) ja existe; conferiria plugin type, parametro e resposta." } else { "DRY RUN criaria $($Api.Name) com $($Request.Name) (string) e $($Response.Name) (string)." })
  Write-Step "dry-run: nada gravado."
  return
}
if ($api.Count -eq 0) {
  Invoke-Dv "POST" "customapis" @{
    customapiid = $Api.Id; uniquename = $Api.Name; name = $Api.Name; displayname = "Prova de m$([char]0xED)dia"
    description = "Prova de captura das fotos e videos do App Motoristas (emitir, registrar)."; bindingtype = 0; isfunction = $false; isprivate = $false
    allowedcustomprocessingsteptype = 0; workflowsdkstepenabled = $false; "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
  } | Out-Null
  Write-Step "criada $($Api.Name)"
} elseif ([string]$api[0]._plugintypeid_value -ne $typeId) {
  Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
  Write-Step "$($Api.Name) apontada para $TypeName"
}
if (@(Get-Rows "customapirequestparameters" "customapirequestparameterid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Request.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapirequestparameters" @{
    customapirequestparameterid = $Request.Id; uniquename = $Request.Name; name = "$($Api.Name).$($Request.Name)"; displayname = $Request.Name
    description = "Comando JSON (acao emitir ou registrar)"; type = 10; isoptional = $false; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criado o parametro $($Request.Name)"
}
if (@(Get-Rows "customapiresponseproperties" "customapiresponsepropertyid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Response.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapiresponseproperties" @{
    customapiresponsepropertyid = $Response.Id; uniquename = $Response.Name; name = "$($Api.Name).$($Response.Name)"; displayname = $Response.Name
    description = "Resultado JSON"; type = 10; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criada a resposta $($Response.Name)"
}

# 3. Solucao: AppBetinhos (idempotente); a distribuicao do proximo Deploy leva para a BetinhosAutomacao (regras.json).
$codigos = @{}
foreach ($logical in "customapi", "customapirequestparameter", "customapiresponseproperty") {
  $codigos[$logical] = [int](Invoke-Dv "GET" "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
}
Add-ComponenteNaSolucao $Api.Id $codigos["customapi"]
Add-ComponenteNaSolucao $Request.Id $codigos["customapirequestparameter"]
Add-ComponenteNaSolucao $Response.Id $codigos["customapiresponseproperty"]
Write-Step "OK: $($Api.Name) -> $TypeName"
