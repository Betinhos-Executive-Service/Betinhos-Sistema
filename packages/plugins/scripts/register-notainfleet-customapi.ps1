param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV a Custom API new_NotaInfleet (unbound, sem parametro de entrada, resposta new_Result, sem step customizado) apontando para o
# plugin type Betinhos.DriverRecordSharing.NotaInfleetPlugin, e coloca API, parametro e resposta na AppBetinhos.
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); tipo de plugin e Custom API novos deste assembly continuam a mao, como as do app-motoristas-v2. O PROD recebe pelas solucoes.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar o assembly com a classe nova.
# Exige o segredo infleet.token na tabela cr40f_segredo do ambiente (packages/deploy/gravar-segredo.ps1): a Custom API nao tem step, entao nao ha configuracao segura.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-notainfleet-customapi.ps1 [-Apply]
# Usa o helper das migrations (_dv.ps1): Connect-Dv recusa host que nao seja o DEV.

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.NotaInfleetPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Api = [pscustomobject]@{ Id = "ed26be3f-0b65-463f-8fe8-fa58ea4edd9c"; Name = "new_NotaInfleet" }
$Response = [pscustomobject]@{ Id = "3c7febc4-cf4b-40e6-b38e-28ad45327985"; Name = "new_Result" }

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

# 1. Tipo de plugin
$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "NotaInfleetPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
}
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

# 2. Custom API, parametro e resposta
$apiAtual = @(Get-Rows "customapis" "customapiid,allowedcustomprocessingsteptype,bindingtype,_plugintypeid_value" "uniquename eq '$($Api.Name)'")
if ($apiAtual.Count -eq 1 -and [string]$apiAtual[0].customapiid -ne $Api.Id) { throw "$($Api.Name) existe com id $($apiAtual[0].customapiid), diferente do fixo $($Api.Id). Confira antes de seguir." }
if ($apiAtual.Count -eq 1 -and ([int]$apiAtual[0].allowedcustomprocessingsteptype -ne 0 -or [int]$apiAtual[0].bindingtype -ne 0)) { throw "$($Api.Name) existe fora do desenho (tipo de step ou binding)." }
if (-not $Apply) {
  Write-Step $(if ($apiAtual.Count -eq 1) { "DRY RUN $($Api.Name) ja existe; conferiria plugin type, parametro e resposta." } else { "DRY RUN criaria $($Api.Name) sem parametro de entrada e com $($Response.Name) (string)." })
  Write-Step "dry-run: nada gravado."
  return
}
if ($apiAtual.Count -eq 0) {
  Invoke-Dv "POST" "customapis" @{
    customapiid = $Api.Id; uniquename = $Api.Name; name = $Api.Name; displayname = "Nota Infleet do motorista"
    description = "Nota de conducao da Infleet do motorista logado (90 dias, comportamentos e 6 meses)."; bindingtype = 0; isfunction = $false; isprivate = $false
    allowedcustomprocessingsteptype = 0; workflowsdkstepenabled = $false; "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
  } | Out-Null
  Write-Step "criada $($Api.Name)"
} elseif ([string]$apiAtual[0]._plugintypeid_value -ne $typeId) {
  Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
  Write-Step "$($Api.Name) apontada para $TypeName"
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
foreach ($logical in "customapi", "customapiresponseproperty") {
  $codigos[$logical] = [int](Invoke-Dv "GET" "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
}
Add-ComponenteNaSolucao $Api.Id $codigos["customapi"]
Add-ComponenteNaSolucao $Response.Id $codigos["customapiresponseproperty"]
Write-Step "OK: $($Api.Name) -> $TypeName"
