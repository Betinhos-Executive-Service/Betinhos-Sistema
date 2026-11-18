param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Registra no DEV as Custom APIs da fase 3 de multas (o motorista resolve a multa no App Motoristas) apontando para o plugin type
# Betinhos.DriverRecordSharing.TermoMultaCommandPlugin, e completa as duas APIs do termo que ja existem (new_ExpirarTermoMulta e
# new_LembrarTermoMulta) com a saida new_Expirou / new_Lembrou e a entrada opcional new_Automatico.
# Todas vao para a AppBetinhos; a distribuicao do proximo Deploy leva para a BetinhosAutomacao (regras.json).
# Rode do checkout principal na develop atualizada, DEPOIS que o Deploy publicar a DLL com as classes novas. Nunca de worktree nem sessao cloud.
# Idempotente: confere o que existe antes de criar; nunca exclui. Sem -Apply so mostra o plano. Somente DEV.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/register-multas-fase3-customapis.ps1 [-Apply]
# Usa o helper das migrations (_dv.ps1): Connect-Dv recusa host que nao seja o DEV.
# Tipos de parametro da Custom API: Boolean 0, DateTime 1, String 10, Guid 12.

. "$PSScriptRoot\..\..\deploy\migrations\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$Assembly = "Betinhos.DriverRecordSharing"
$TypeName = "Betinhos.DriverRecordSharing.TermoMultaCommandPlugin"
# Ids fixos: o TEST e o PROD casam pelo uniquename, mas o DEV fica estavel entre execucoes.
$Apis = @(
  [pscustomobject]@{ Id = "1d211c62-8ded-49dd-bb00-aa92b133ce20"; Name = "new_MinhasMultas"; Display = "Minhas multas"; Function = $true; Description = "Multas do motorista logado que esperam acao no App Motoristas."; Request = @(); Response = @([pscustomobject]@{ Id = "ca7b7407-6748-43f1-b4c2-3f4696a55c29"; Name = "new_MultasJson"; Type = 10 }) },
  [pscustomobject]@{ Id = "ba714b01-12c2-4410-b379-782a880aee6f"; Name = "new_DeclararAceiteMulta"; Display = "Declarar aceite da multa"; Function = $false; Description = "Motorista declara que aceitou a indicacao na CNH Digital."; Request = @([pscustomobject]@{ Id = "228d6cfb-1bee-497b-a8b2-b0ee418931a1"; Name = "new_MultaId"; Type = 12 }); Response = @() },
  [pscustomobject]@{ Id = "983d24e1-16f7-43d1-8ca8-91010cf2eeda"; Name = "new_LembrarAceiteMulta"; Display = "Lembrar aceite da multa"; Function = $false; Description = "Flow diario: grava o lembrete do aceite na CNH Digital quando devido."; Request = @([pscustomobject]@{ Id = "8bc1736e-11a9-491a-8d4c-46148ab0f78b"; Name = "new_MultaId"; Type = 12 }); Response = @([pscustomobject]@{ Id = "36b583b8-5761-4925-b8f4-a09a3f55e262"; Name = "new_Lembrou"; Type = 0 }) },
  [pscustomobject]@{ Id = "b72d43cf-c465-46df-991b-70d9ab3d6c2f"; Name = "new_GerarAditivoMotorista"; Display = "Gerar aditivo do motorista"; Function = $false; Description = "Gera o PDF do aditivo para assinatura no gov.br."; Request = @([pscustomobject]@{ Id = "27a5cdbc-48ee-4d48-a8a0-103b3146840e"; Name = "new_FuncionarioId"; Type = 12 }); Response = @([pscustomobject]@{ Id = "b083c510-18b0-4e3f-a10e-3198053740f8"; Name = "new_PdfBase64"; Type = 10 }, [pscustomobject]@{ Id = "b3521375-a30b-4639-a64c-693b2039b883"; Name = "new_NomeArquivo"; Type = 10 }) },
  [pscustomobject]@{ Id = "9436c1a1-34eb-461b-907b-aab45dfd04fb"; Name = "new_RegistrarAditivoMotorista"; Display = "Registrar aditivo do motorista"; Function = $false; Description = "Confere e anexa o aditivo assinado no gov.br ao funcionario."; Request = @([pscustomobject]@{ Id = "dca254c0-0049-4347-8a6d-e49e96bf77a0"; Name = "new_FuncionarioId"; Type = 12 }, [pscustomobject]@{ Id = "368c6de0-68b3-4156-94c4-21208bd54798"; Name = "new_PdfBase64"; Type = 10 }, [pscustomobject]@{ Id = "d798e5e9-cfbc-415e-9f01-1f203d71acc5"; Name = "new_AssinadoEm"; Type = 1 }); Response = @() }
)
# APIs ja existentes (registradas antes): so ganham os parametros novos.
$Existentes = @(
  [pscustomobject]@{ Name = "new_ExpirarTermoMulta"; Request = @(); Response = @([pscustomobject]@{ Id = "1a159758-861d-4e59-a7fa-743f33d8027e"; Name = "new_Expirou"; Type = 0 }) },
  [pscustomobject]@{ Name = "new_LembrarTermoMulta"; Request = @([pscustomobject]@{ Id = "64d6ed95-53db-4692-9565-57dfc10d4166"; Name = "new_Automatico"; Type = 0 }); Response = @([pscustomobject]@{ Id = "2274bea7-f56c-4464-93c1-09bba47429bb"; Name = "new_Lembrou"; Type = 0 }) }
)

$codigos = @{}
foreach ($logical in "customapi", "customapirequestparameter", "customapiresponseproperty") {
  $codigos[$logical] = [int](Invoke-Dv "GET" "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
}

$assemblyAtual = @(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq '$Assembly'")
if ($assemblyAtual.Count -ne 1) { throw "Assembly $Assembly nao encontrado no DEV." }

# 1. Tipo de plugin (ja existe, pois o termo usa; cria so se faltar)
$type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
if ($type.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria o plugin type $TypeName (exige o assembly publicado com a classe)." }
  else {
    Invoke-Dv "POST" "plugintypes" @{ typename = $TypeName; name = $TypeName; friendlyname = "TermoMultaCommandPlugin"; "pluginassemblyid@odata.bind" = "/pluginassemblies($($assemblyAtual[0].pluginassemblyid))" } | Out-Null
    $type = @(Get-Rows "plugintypes" "plugintypeid" "typename eq '$TypeName'")
    if ($type.Count -ne 1) { throw "Plugin type $TypeName nao apareceu depois do POST." }
    Write-Step "criado o plugin type $TypeName"
  }
}
$typeId = if ($type.Count -eq 1) { [string]$type[0].plugintypeid } else { $null }

function Ensure-Parametro([string] $ApiId, [string] $ApiName, $Param, [string] $Tabela, [string] $Logical, [string] $Bind, [bool] $Opcional) {
  $existe = @(Get-Rows $Tabela "$($Logical)id" "_customapiid_value eq $ApiId and uniquename eq '$($Param.Name)'")
  if ($existe.Count -gt 0) { return }
  if (-not $Apply) { Write-Step "DRY RUN criaria $ApiName.$($Param.Name) (tipo $($Param.Type))."; return }
  $corpo = @{ uniquename = $Param.Name; name = "$ApiName.$($Param.Name)"; displayname = $Param.Name; description = $Param.Name; type = $Param.Type; "CustomAPIId@odata.bind" = "/customapis($ApiId)" }
  $corpo["$($Logical)id"] = $Param.Id
  if ($Logical -eq "customapirequestparameter") { $corpo["isoptional"] = $Opcional }
  Invoke-Dv "POST" $Tabela $corpo | Out-Null
  Write-Step "criado $ApiName.$($Param.Name)"
  Add-ComponenteNaSolucao $Param.Id $codigos[$Logical]
}

# 2. APIs novas
foreach ($api in $Apis) {
  $atual = @(Get-Rows "customapis" "customapiid,allowedcustomprocessingsteptype,bindingtype,isfunction,_plugintypeid_value" "uniquename eq '$($api.Name)'")
  if ($atual.Count -eq 1 -and [string]$atual[0].customapiid -ne $api.Id) { throw "$($api.Name) existe com id $($atual[0].customapiid), diferente do fixo $($api.Id). Confira antes de seguir." }
  if ($atual.Count -eq 1 -and ([int]$atual[0].allowedcustomprocessingsteptype -ne 0 -or [int]$atual[0].bindingtype -ne 0 -or [bool]$atual[0].isfunction -ne $api.Function)) { throw "$($api.Name) existe fora do desenho (tipo de step, binding ou function)." }
  if ($atual.Count -eq 0) {
    if (-not $Apply -or $null -eq $typeId) { Write-Step "DRY RUN criaria $($api.Name) (function: $($api.Function), entradas: $($api.Request.Count), saidas: $($api.Response.Count))."; continue }
    Invoke-Dv "POST" "customapis" @{
      customapiid = $api.Id; uniquename = $api.Name; name = $api.Name; displayname = $api.Display; description = $api.Description
      bindingtype = 0; isfunction = $api.Function; isprivate = $false; allowedcustomprocessingsteptype = 0; workflowsdkstepenabled = $false
      "PluginTypeId@odata.bind" = "/plugintypes($typeId)"
    } | Out-Null
    Write-Step "criada $($api.Name)"
  } elseif ($Apply -and [string]$atual[0]._plugintypeid_value -ne $typeId) {
    Invoke-Dv "PATCH" "customapis($($api.Id))" @{ "PluginTypeId@odata.bind" = "/plugintypes($typeId)" } | Out-Null
    Write-Step "$($api.Name) apontada para $TypeName"
  }
  if ($Apply) { Add-ComponenteNaSolucao $api.Id $codigos["customapi"] }
  foreach ($p in $api.Request) { Ensure-Parametro $api.Id $api.Name $p "customapirequestparameters" "customapirequestparameter" "" $false }
  foreach ($p in $api.Response) { Ensure-Parametro $api.Id $api.Name $p "customapiresponseproperties" "customapiresponseproperty" "" $false }
}

# 3. APIs existentes: parametros novos (entrada opcional, para o chamador antigo continuar valendo)
foreach ($api in $Existentes) {
  $atual = @(Get-Rows "customapis" "customapiid" "uniquename eq '$($api.Name)'")
  if ($atual.Count -ne 1) { Write-Step "ATENCAO: $($api.Name) nao existe no DEV; nada a completar."; continue }
  $id = [string]$atual[0].customapiid
  foreach ($p in $api.Request) { Ensure-Parametro $id $api.Name $p "customapirequestparameters" "customapirequestparameter" "" $true }
  foreach ($p in $api.Response) { Ensure-Parametro $id $api.Name $p "customapiresponseproperties" "customapiresponseproperty" "" $false }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado." } else { Write-Step "OK: Custom APIs da fase 3 de multas registradas." }
