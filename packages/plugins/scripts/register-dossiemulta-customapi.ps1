param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV a Custom API new_DossieMulta (unbound, new_MultaId Guid -> new_DossieJson string, sem step customizado)
# apontando para o plugin type Betinhos.DriverRecordSharing.DossieMultaPlugin, e coloca API, parametro e resposta na AppBetinhos.
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); tipo de plugin e Custom API novos deste
# assembly continuam a mao, como a new_ProvaMidia. O PROD recebe pelas solucoes.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar o assembly com a classe nova.
# A API exige o privilegio de gravar multa (prvWritecr40f_multas, o mesmo da cr40f_PassoMulta): o plugin le agenda, funcionarios
# e InFleet como SYSTEM, entao so quem pode editar multa recebe o dossie. O nome exato vem do Dataverse; se nao houver um unico, falha.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-dossiemulta-customapi.ps1 [-Apply]

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.DossieMultaPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Api = [pscustomobject]@{ Id = "d0edc9b5-8387-4e82-9b72-67cd48ce0b54"; Name = "new_DossieMulta" }
$Request = [pscustomobject]@{ Id = "09947544-efe3-4219-a662-bcf2ed2ee2d0"; Name = "new_MultaId" }
$Response = [pscustomobject]@{ Id = "145eec65-d3aa-4804-bb09-65becb61ab80"; Name = "new_DossieJson" }

$Privilegio = "prvWritecr40f_multas"
$privilegioAtual = @(Get-Rows "privileges" "name" "name eq '$Privilegio'")
if ($privilegioAtual.Count -ne 1) { throw "Privilegio $Privilegio nao encontrado (esperado exatamente um, achou $($privilegioAtual.Count)). A tabela cr40f_multas existe neste ambiente?" }
$Privilegio = [string]$privilegioAtual[0].name

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "DossieMultaPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
}
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

$apiAtual = @(Get-Rows "customapis" "customapiid,allowedcustomprocessingsteptype,bindingtype,_plugintypeid_value,executeprivilegename" "uniquename eq '$($Api.Name)'")
if ($apiAtual.Count -eq 1 -and [string]$apiAtual[0].customapiid -ne $Api.Id) { throw "$($Api.Name) existe com id $($apiAtual[0].customapiid), diferente do fixo $($Api.Id)." }
if ($apiAtual.Count -eq 1 -and ([int]$apiAtual[0].allowedcustomprocessingsteptype -ne 0 -or [int]$apiAtual[0].bindingtype -ne 0)) { throw "$($Api.Name) existe fora do desenho (tipo de step ou binding)." }
if (-not $Apply) {
  Write-Step $(if ($apiAtual.Count -eq 1) { "DRY RUN $($Api.Name) ja existe; conferiria plugin type, parametro e resposta. Privilegio de execucao: atual '$($apiAtual[0].executeprivilegename)', esperado '$Privilegio'$(if ([string]$apiAtual[0].executeprivilegename -ne $Privilegio) { ' -> corrigiria' } else { ' -> ok' })." } else { "DRY RUN criaria $($Api.Name) com $($Request.Name) (Guid) e $($Response.Name) (string)." })
  Write-Step "dry-run: nada gravado."
  return
}
if ($apiAtual.Count -eq 0) {
  Invoke-Dv "POST" "customapis" @{
    customapiid = $Api.Id; uniquename = $Api.Name; name = $Api.Name; displayname = "Multas | Dossi$([char]0xEA) para o WhatsApp"
    description = "Servico da agenda, viagens do InFleet e dados da notificacao da multa. Somente leitura."; bindingtype = 0; isfunction = $false; isprivate = $false
    allowedcustomprocessingsteptype = 0; executeprivilegename = $Privilegio; workflowsdkstepenabled = $false; "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
  } | Out-Null
  Write-Step "criada $($Api.Name)"
} else {
  if ([string]$apiAtual[0]._plugintypeid_value -ne $typeId) {
    Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
    Write-Step "$($Api.Name) apontada para $TypeName"
  }
  # API ja existente com privilegio nulo ou diferente (nasceu aberta): passa a exigir o privilegio. Nada e excluido.
  if ([string]$apiAtual[0].executeprivilegename -ne $Privilegio) {
    Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ executeprivilegename = $Privilegio } | Out-Null
    Write-Step "$($Api.Name) passa a exigir o privilegio $Privilegio (antes: '$($apiAtual[0].executeprivilegename)')"
  }
}
if (@(Get-Rows "customapirequestparameters" "customapirequestparameterid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Request.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapirequestparameters" @{
    customapirequestparameterid = $Request.Id; uniquename = $Request.Name; name = "$($Api.Name).$($Request.Name)"; displayname = $Request.Name
    description = "Id da multa (cr40f_multas)"; type = 12; isoptional = $false; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criado o parametro $($Request.Name)"
}
if (@(Get-Rows "customapiresponseproperties" "customapiresponsepropertyid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($Response.Name)'").Count -eq 0) {
  Invoke-Dv "POST" "customapiresponseproperties" @{
    customapiresponsepropertyid = $Response.Id; uniquename = $Response.Name; name = "$($Api.Name).$($Response.Name)"; displayname = $Response.Name
    description = "Dossie JSON: multa, servicos e infleet"; type = 10; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
  } | Out-Null
  Write-Step "criada a resposta $($Response.Name)"
}

$codigos = @{}
foreach ($logical in "customapi", "customapirequestparameter", "customapiresponseproperty") {
  $codigos[$logical] = [int](Invoke-Dv "GET" "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
}
Add-ComponenteNaSolucao $Api.Id $codigos["customapi"]
Add-ComponenteNaSolucao $Request.Id $codigos["customapirequestparameter"]
Add-ComponenteNaSolucao $Response.Id $codigos["customapiresponseproperty"]
Write-Step "OK: $($Api.Name) -> $TypeName"
