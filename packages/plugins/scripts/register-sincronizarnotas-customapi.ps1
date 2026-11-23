param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV a Custom API new_SincronizarNotasInfleet (unbound, 3 parametros de entrada opcionais Meses, Dias e Ate, resposta new_Result, sem step customizado)
# apontando para o plugin type Betinhos.DriverRecordSharing.SincronizarNotasInfleetPlugin, e coloca API, parametros e resposta na AppBetinhos.
# O Deploy so troca o conteudo do assembly (push-driverrecordsharing-plugin.ps1); tipo de plugin e Custom API novos deste assembly continuam a mao, como as do app-motoristas-v2. O PROD recebe pelas solucoes.
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar o assembly com a classe nova.
# Exige a tabela new_notamotorista (migration 20261119-2000) e o segredo infleet.token na tabela cr40f_segredo do ambiente (packages/deploy/gravar-segredo.ps1): a Custom API nao tem step, entao nao ha configuracao segura.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-sincronizarnotas-customapi.ps1 [-Apply]
# Usa o helper das migrations (_dv.ps1): Connect-Dv recusa host que nao seja o DEV.

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.SincronizarNotasInfleetPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Api = [pscustomobject]@{ Id = "feb226e2-e24e-4159-aa4d-8fb2c9704875"; Name = "new_SincronizarNotasInfleet" }
$Response = [pscustomobject]@{ Id = "be61793d-ae7e-40cd-9037-c36ab3a86d49"; Name = "new_Result" }

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

# 1. Tipo de plugin
$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "SincronizarNotasInfleetPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
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
  Write-Step $(if ($apiAtual.Count -eq 1) { "DRY RUN $($Api.Name) ja existe; conferiria plugin type, parametros e resposta." } else { "DRY RUN criaria $($Api.Name) com 3 parametros de entrada opcionais e $($Response.Name) (string)." })
  Write-Step "dry-run: nada gravado."
  return
}
if ($apiAtual.Count -eq 0) {
  Invoke-Dv "POST" "customapis" @{
    customapiid = $Api.Id; uniquename = $Api.Name; name = $Api.Name; displayname = "Sincronizar notas dos motoristas (Infleet)"
    description = "Grava em new_notamotorista a nota de conducao da Infleet de cada motorista (90 dias, meses e dias). Chamada pelo flow das 05:00 e pela carga retroativa."; bindingtype = 0; isfunction = $false; isprivate = $false
    allowedcustomprocessingsteptype = 0; workflowsdkstepenabled = $false; "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
  } | Out-Null
  Write-Step "criada $($Api.Name)"
} elseif ([string]$apiAtual[0]._plugintypeid_value -ne $typeId) {
  Invoke-Dv "PATCH" "customapis($($Api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
  Write-Step "$($Api.Name) apontada para $TypeName"
}
$Params = @(
  [pscustomobject]@{ Id = "a616f15e-b4ea-4f76-aa53-9d5db01e4343"; Name = "Meses"; Type = 7; Desc = "Meses fechados a regravar (padrao 2)." },
  [pscustomobject]@{ Id = "8f892090-e46b-4b63-9a63-9c4598de9554"; Name = "Dias"; Type = 7; Desc = "Dias a regravar ate Ate (padrao 3)." },
  [pscustomobject]@{ Id = "aaa372bf-9064-4ff7-8e9a-28b5d482d5b1"; Name = "Ate"; Type = 1; Desc = "Ultimo dia (Sao Paulo); vazio = ontem, com a linha 90 dias." }
)
foreach ($p in $Params) {
  if (@(Get-Rows "customapirequestparameters" "customapirequestparameterid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($p.Name)'").Count -eq 0) {
    Invoke-Dv "POST" "customapirequestparameters" @{
      customapirequestparameterid = $p.Id; uniquename = $p.Name; name = "$($Api.Name).$($p.Name)"; displayname = $p.Name
      description = $p.Desc; type = $p.Type; isoptional = $true; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
    } | Out-Null
    Write-Step "criado o parametro $($p.Name)"
  }
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
foreach ($p in $Params) { Add-ComponenteNaSolucao $p.Id $codigos["customapirequestparameter"] }
Add-ComponenteNaSolucao $Response.Id $codigos["customapiresponseproperty"]
Write-Step "OK: $($Api.Name) -> $TypeName"
