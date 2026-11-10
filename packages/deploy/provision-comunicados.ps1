# Garante as Custom APIs new_AbrirComunicadoMotorista e new_RegistrarCienciaComunicado no desenho do TEST/PROD:
# customapiid FIXO, allowedcustomprocessingsteptype 0 (sem step customizado), plugintypeid do ComunicadoCommandPlugin
# (Betinhos.DriverRecordSharing) e todos os parametros, os originais com os ids do TEST/PROD e o new_EvidenciaJson
# (Fase 2, 10/11/2026) com os ids que o DEV ja usa. O segredo do carimbo do IP vem da tabela cr40f_segredo
# (comunicados.ip-stamp), nao da configuracao segura de um step: este script nao cria step.
#
# Regras:
# - API com o id certo: nunca exclui nem recria; so cria parametro/resposta que falta, corrige o plugintypeid e
#   inclui na AppBetinhos e na BetinhosAutomacao. Parametro existente com tipo/opcionalidade diferente: recusa.
# - API achada pelo uniquename com id diferente (DEV depois do provision antigo do app-motoristas-v2, 10/11/2026):
#   recusa, a menos que receba -MigrarIdsDoProd. Com ele: remove os steps das mensagens dela (e a configuracao
#   segura deles), exclui a API e recria com o id fixo, os parametros e as solucoes.
# - Antes de remover step com configuracao segura, exige comunicados.ip-stamp preenchido na tabela deste ambiente
#   (gravar-segredo.ps1, ou -CopiarSegredoParaTabela, que copia o valor da configuracao segura sem imprimir) e
#   igual ao da configuracao segura (hash). -DescartarConfigSegura pula essa trava.
# - So altera ambiente nao-PROD e componentes nao gerenciados. -Simular so le e mostra o plano (vale em qualquer
#   ambiente, inclusive TEST/PROD, para conferir).
# Uso (checkout principal, develop atualizada, depois do Deploy publicar o plugin):
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-comunicados.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Simular
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-comunicados.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -MigrarIdsDoProd
# Requer az login com conta Administrador do Sistema. Teste: packages/deploy/testa-provision-comunicados.ps1.
param(
  [ValidatePattern('^https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com/?$')] [string] $EnvironmentUrl,
  [switch] $Simular,
  [switch] $MigrarIdsDoProd,
  [switch] $CopiarSegredoParaTabela,
  [switch] $DescartarConfigSegura
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:ProdHost = 'orgf261ae8e.crm2.dynamics.com'
$script:PluginTypeId = '94ce6948-58b8-f111-aaae-7ced8da8c473'
$script:PluginTypeName = 'Betinhos.DriverRecordSharing.ComunicadoCommandPlugin'
$script:Solucoes = @('AppBetinhos', 'BetinhosAutomacao')
$script:SegredoNome = 'comunicados.ip-stamp'

function Param([string] $Id, [string] $Name, [int] $Type, [bool] $Optional) { [pscustomobject]@{ Id = $Id; Name = $Name; Type = $Type; Optional = $Optional } }
# Ids do TEST/PROD (gerenciados) e, para o new_EvidenciaJson, os do DEV de 10/11/2026.
$script:Apis = @(
  [pscustomobject]@{
    Name = 'new_AbrirComunicadoMotorista'; Id = '3f19909e-b0ad-4e4c-83b1-194c983e3af9'
    Request = @(
      (Param 'ac320da8-ecd7-4ee6-8a3e-9e88c4ca9da7' 'new_DestinatarioId' 12 $false),
      (Param '34ba7c69-21dd-f111-84ea-7ced8da8c473' 'new_EvidenciaJson' 10 $true))
    Response = @()
  },
  [pscustomobject]@{
    Name = 'new_RegistrarCienciaComunicado'; Id = 'e57c1043-d991-4b8d-bf50-ab252c49385c'
    Request = @(
      (Param 'fe5f82c9-ea85-4be3-95e9-cf0ea27d88d9' 'new_DestinatarioId' 12 $false),
      (Param '5dedb189-23ce-4987-ad3b-ae5780b14fd0' 'new_AssinaturaJson' 10 $false),
      (Param 'dc267b2e-24a0-48c7-b53e-32d7ca7396c8' 'new_Observacao' 10 $true),
      (Param '6e56966f-21dd-f111-84ea-7ced8da8c473' 'new_EvidenciaJson' 10 $true))
    Response = @()
  }
)

function Action([string] $Kind, [string] $Text, [hashtable] $Data = @{}) { [pscustomobject]@{ Kind = $Kind; Text = $Text; Data = $Data } }

# Plano puro (sem rede): $State = @{ Api; Request; Response; Steps; Solutions } do ambiente. Kind 'recusa' para tudo.
function Get-ApiPlan($Spec, $State, [bool] $Migrate) {
  $plan = New-Object System.Collections.Generic.List[object]
  $api = $State.Api
  $recreate = $false
  $created = $false
  if ($null -eq $api) {
    $plan.Add((Action 'criar-api' "criar $($Spec.Name) com id $($Spec.Id)"))
    $recreate = $true
  } elseif ([string]$api.customapiid -ne $Spec.Id) {
    if (-not $Migrate) {
      $plan.Add((Action 'recusa' "$($Spec.Name) existe com id $($api.customapiid), diferente do TEST/PROD ($($Spec.Id)). Rode com -MigrarIdsDoProd para excluir e recriar."))
      return $plan
    }
    if ([bool]$api.ismanaged) { $plan.Add((Action 'recusa' "$($Spec.Name) com id diferente e gerenciada: nao excluo componente gerenciado.")); return $plan }
    foreach ($step in @($State.Steps | Where-Object { $_.name -notlike "CustomApi '*' implementation" })) {
      $plan.Add((Action 'remover-step' "remover step '$($step.name)' ($($step.sdkmessageprocessingstepid), stage $($step.stage))" @{ Step = $step }))
    }
    $plan.Add((Action 'excluir-api' "excluir $($Spec.Name) $($api.customapiid) (leva parametros, respostas e a mensagem)" @{ Id = [string]$api.customapiid }))
    $plan.Add((Action 'criar-api' "recriar $($Spec.Name) com id $($Spec.Id), tipo 0 e plugintype ComunicadoCommandPlugin"))
    $recreate = $true
  } else {
    if ([bool]$api.ismanaged) { $plan.Add((Action 'recusa' "$($Spec.Name) e gerenciada neste ambiente: so a solucao altera. Nada a fazer aqui.")); return $plan }
    if ([int]$api.allowedcustomprocessingsteptype -ne 0) { $plan.Add((Action 'recusa' "$($Spec.Name) tem allowedcustomprocessingsteptype $($api.allowedcustomprocessingsteptype) (nao atualizavel); esperado 0.")); return $plan }
    if ([string]$api._plugintypeid_value -ne $script:PluginTypeId) {
      $plan.Add((Action 'ajustar-plugintype' "apontar $($Spec.Name) para o ComunicadoCommandPlugin ($($script:PluginTypeId))"))
    }
    foreach ($step in @($State.Steps | Where-Object { $_.name -notlike "CustomApi '*' implementation" })) {
      $plan.Add((Action 'aviso' "step customizado '$($step.name)' ($($step.sdkmessageprocessingstepid)) na mensagem de $($Spec.Name); nao removo com o id certo"))
    }
  }

  # O estado lido vem $null quando a API nao tem parametros ou respostas; em StrictMode, $_.uniquename sobre $null quebra.
  $kinds = @(@{ Kind = 'parametro'; Spec = $Spec.Request; Current = @($State.Request | Where-Object { $_ }); IdField = 'customapirequestparameterid' },
             @{ Kind = 'resposta'; Spec = $Spec.Response; Current = @($State.Response | Where-Object { $_ }); IdField = 'customapiresponsepropertyid' })
  foreach ($k in $kinds) {
    foreach ($p in @($k.Spec)) {
      $cur = if ($recreate) { $null } else { @($k.Current | Where-Object { $_.uniquename -eq $p.Name }) | Select-Object -First 1 }
      if ($null -eq $cur) { $created = $true; $plan.Add((Action "criar-$($k.Kind)" "criar $($k.Kind) $($Spec.Name).$($p.Name) (tipo $($p.Type), opcional $($p.Optional), id $($p.Id))" @{ Param = $p })); continue }
      $optional = if ($k.Kind -eq 'parametro') { [bool]$cur.isoptional } else { $p.Optional }
      if ([int]$cur.type -ne $p.Type -or $optional -ne $p.Optional) {
        $plan.Add((Action 'recusa' "$($k.Kind) $($Spec.Name).$($p.Name) com tipo $($cur.type)/opcional $optional; esperado $($p.Type)/$($p.Optional) (nao atualizavel)."))
      } elseif ([string]$cur.($k.IdField) -ne $p.Id) {
        $plan.Add((Action 'aviso' "$($k.Kind) $($Spec.Name).$($p.Name) com id $($cur.($k.IdField)) (TEST/PROD: $($p.Id)); mantido"))
      }
    }
    if (-not $recreate) {
      foreach ($extra in @($k.Current | Where-Object { $_.uniquename -notin @($k.Spec | ForEach-Object { $_.Name }) })) {
        $plan.Add((Action 'aviso' "$($k.Kind) $($Spec.Name).$($extra.uniquename) existe e nao esta no desenho; mantido"))
      }
    }
  }

  foreach ($sol in $script:Solucoes) {
    $missing = $recreate -or $created -or -not (@($State.Solutions) -contains "$sol|$($Spec.Id)")
    if ($missing) { $plan.Add((Action 'incluir-solucao' "incluir $($Spec.Name) (com parametros e respostas) na $sol" @{ Solution = $sol })) }
  }
  return $plan
}

function Get-Hash([string] $s) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s.Trim()))) } finally { $sha.Dispose() }
}

function Invoke-Main {
  if (-not $EnvironmentUrl) { throw 'Informe -EnvironmentUrl.' }
  $base = $EnvironmentUrl.TrimEnd('/')
  $hostName = ([Uri]$base).Host.ToLowerInvariant()
  if (-not $Simular -and $hostName -eq $script:ProdHost) { throw "$hostName e o PROD: este script so altera DEV (no PROD as APIs chegam pela solucao)." }
  $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponivel para $base (rode az login)." }
  $headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
  # Erros saem so com status e mensagem do Dataverse; o corpo nunca leva segredo (o PATCH do segredo trata a parte).
  function Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $Extra = @{}, [switch] $Quiet) {
    $p = @{ Method = $Method; Uri = "$base/api/data/v9.2/$Path"; Headers = ($headers + $Extra); TimeoutSec = 120 }
    if ($null -ne $Body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
    try { return Invoke-RestMethod @p }
    catch {
      $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
      $detail = if ($Quiet) { '' } else { try { (ConvertFrom-Json $_.ErrorDetails.Message).error.message } catch { $_.Exception.Message } }
      throw "Dataverse $status em $Method $($Path.Split('?')[0]) $detail"
    }
  }
  function Rows([string] $Path) { @((Dv GET $Path).value) }
  function Write-Step([string] $m) { Write-Host "[comunicados] $m" }

  $org = (Rows 'organizations?$select=name')[0].name
  Write-Step "ambiente $org ($hostName), $(if ($Simular) { 'SIMULACAO (so leitura)' } else { 'APLICANDO' })"
  $pluginType = @(Rows "plugintypes?`$select=plugintypeid,typename&`$filter=plugintypeid eq $($script:PluginTypeId)")
  if ($pluginType.Count -ne 1 -or $pluginType[0].typename -ne $script:PluginTypeName) { throw "Plugin type $($script:PluginTypeName) nao encontrado com id $($script:PluginTypeId)." }
  $solutionRows = @{}
  foreach ($sol in $script:Solucoes) {
    $r = @(Rows "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$sol'")
    if ($r.Count -ne 1) { throw "Solucao $sol nao encontrada neste ambiente." }
    if ([bool]$r[0].ismanaged -and -not $Simular) { throw "Solucao $sol e gerenciada neste ambiente: nada a alterar aqui." }
    $solutionRows[$sol] = $r[0].solutionid
  }

  $plans = @()
  foreach ($spec in $script:Apis) {
    $api = @(Rows "customapis?`$select=customapiid,uniquename,ismanaged,allowedcustomprocessingsteptype,_plugintypeid_value,_sdkmessageid_value&`$filter=uniquename eq '$($spec.Name)'") | Select-Object -First 1
    $state = @{ Api = $api; Request = @(); Response = @(); Steps = @(); Solutions = @() }
    if ($api) {
      $id = $api.customapiid
      $state.Request = Rows "customapirequestparameters?`$select=customapirequestparameterid,uniquename,type,isoptional&`$filter=_customapiid_value eq $id"
      $state.Response = Rows "customapiresponseproperties?`$select=customapiresponsepropertyid,uniquename,type&`$filter=_customapiid_value eq $id"
      if ($api._sdkmessageid_value) {
        $state.Steps = Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,stage,_sdkmessageprocessingstepsecureconfigid_value&`$filter=_sdkmessageid_value eq $($api._sdkmessageid_value)"
      }
      foreach ($sol in $script:Solucoes) {
        if (@(Rows "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solutionRows[$sol]) and objectid eq $id").Count) { $state.Solutions += "$sol|$id" }
      }
    }
    $plans += [pscustomobject]@{ Spec = $spec; Plan = @(Get-ApiPlan $spec $state ([bool]$MigrarIdsDoProd)) }
  }

  foreach ($p in $plans) {
    Write-Step "== $($p.Spec.Name)"
    if ($p.Plan.Count -eq 0) { Write-Step '   nada a fazer' }
    foreach ($a in $p.Plan) { Write-Step "   [$($a.Kind)] $($a.Text)" }
  }
  $refusals = @($plans | ForEach-Object { $_.Plan } | Where-Object { $_.Kind -eq 'recusa' })

  # Trava do segredo: step com configuracao segura so sai se o valor ja estiver na tabela (igual).
  $secureSteps = @($plans | ForEach-Object { $_.Plan } | Where-Object { $_.Kind -eq 'remover-step' -and $_.Data.Step._sdkmessageprocessingstepsecureconfigid_value })
  $copyFrom = $null
  if ($secureSteps.Count -and -not $DescartarConfigSegura) {
    $configs = @($secureSteps | ForEach-Object { (Dv GET "sdkmessageprocessingstepsecureconfigs($($_.Data.Step._sdkmessageprocessingstepsecureconfigid_value))?`$select=secureconfig" -Quiet).secureconfig } | Where-Object { $_ } | ForEach-Object { $_.Trim() })
    $hashes = @($configs | ForEach-Object { Get-Hash $_ } | Select-Object -Unique)
    if ($hashes.Count -gt 1) { throw 'Os steps tem configuracoes seguras diferentes entre si; resolva a mao (nenhum valor impresso).' }
    $tableValue = $null
    try { $tableValue = @(Rows "cr40f_segredos?`$select=cr40f_valor&`$filter=cr40f_name eq '$($script:SegredoNome)'") | Select-Object -First 1 | ForEach-Object { $_.cr40f_valor } }
    catch { throw "Tabela cr40f_segredo ilegivel neste ambiente ($($_.Exception.Message)); rode provision-tabela-segredos.ps1 antes." }
    if ($hashes.Count -eq 0) { Write-Step '   configuracao segura dos steps vazia: nada a preservar' }
    elseif ($tableValue -and (Get-Hash $tableValue) -eq $hashes[0]) { Write-Step "   segredo $($script:SegredoNome) na tabela confere com a configuracao segura (hash)" }
    elseif ($tableValue) { $refusals += Action 'recusa' "$($script:SegredoNome) na tabela difere da configuracao segura dos steps (hash). Confira qual o Worker usa; -DescartarConfigSegura pula." }
    elseif ($CopiarSegredoParaTabela) { $copyFrom = $configs[0]; Write-Step "   [copiar-segredo] copiar a configuracao segura para $($script:SegredoNome) na tabela (sem imprimir)" }
    else { $refusals += Action 'recusa' "steps com configuracao segura e $($script:SegredoNome) vazio na tabela: grave antes (gravar-segredo.ps1) ou use -CopiarSegredoParaTabela." }
    $configs = $null; $tableValue = $null
  }

  if ($refusals.Count) {
    foreach ($r in $refusals) { Write-Step "RECUSA: $($r.Text)" }
    if ($Simular) { Write-Step 'simulacao: com essas recusas o script pararia antes de alterar.'; return }
    throw 'Nada alterado: ha recusas no plano.'
  }
  if ($Simular) { Write-Step 'simulacao concluida; nada alterado.'; return }

  if ($copyFrom) {
    $key = "cr40f_segredos(cr40f_name='$($script:SegredoNome)')"
    $hash = Get-Hash $copyFrom
    Dv PATCH $key @{ cr40f_valor = $copyFrom; cr40f_descricao = 'Segredo do carimbo do IP (IP_STAMP_SECRET do Worker web-push); ComunicadoCommandPlugin' } -Quiet | Out-Null
    $copyFrom = $null
    $read = (Dv GET "$key`?`$select=cr40f_valor" -Quiet).cr40f_valor
    if (-not $read -or (Get-Hash $read) -ne $hash) { throw "Segredo $($script:SegredoNome) gravado mas a releitura nao confere; nada mais alterado." }
    $read = $null
    Write-Step "segredo $($script:SegredoNome) gravado e conferido por hash"
  }

  $typeCodes = @{}
  foreach ($logical in 'customapi', 'customapirequestparameter', 'customapiresponseproperty') {
    $typeCodes[$logical] = [int](Dv GET "EntityDefinitions(LogicalName='$logical')?`$select=ObjectTypeCode").ObjectTypeCode
  }
  function Add-Component([string] $Id, [string] $Logical, [string] $Solution) {
    Dv POST 'AddSolutionComponent' @{ ComponentId = $Id; ComponentType = $typeCodes[$Logical]; SolutionUniqueName = $Solution; AddRequiredComponents = $false; DoNotIncludeSubcomponents = $false } | Out-Null
  }

  foreach ($p in $plans) {
    $spec = $p.Spec
    foreach ($a in $p.Plan) {
      switch ($a.Kind) {
        'remover-step' {
          $step = $a.Data.Step
          Dv DELETE "sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" | Out-Null
          if ($step._sdkmessageprocessingstepsecureconfigid_value) {
            try { Dv DELETE "sdkmessageprocessingstepsecureconfigs($($step._sdkmessageprocessingstepsecureconfigid_value))" | Out-Null } catch { Write-Step "   configuracao segura ja removida com o step" }
          }
        }
        'excluir-api' { Dv DELETE "customapis($($a.Data.Id))" | Out-Null }
        'criar-api' {
          Dv POST 'customapis' @{
            customapiid = $spec.Id; uniquename = $spec.Name; name = $spec.Name; displayname = $spec.Name
            description = 'Acao transacional de comunicados do motorista'; bindingtype = 0; isfunction = $false; isprivate = $false
            allowedcustomprocessingsteptype = 0; executeprivilegename = 'prvReadnew_ComunicadoDestinatario'; workflowsdkstepenabled = $false
            'PluginTypeId@odata.bind' = "/plugintypes($($script:PluginTypeId))"
          } @{ 'MSCRM.SolutionUniqueName' = 'AppBetinhos' } | Out-Null
        }
        'ajustar-plugintype' { Dv PATCH "customapis($($spec.Id))" @{ 'PluginTypeId@odata.bind' = "/plugintypes($($script:PluginTypeId))" } | Out-Null }
        'criar-parametro' {
          $q = $a.Data.Param
          Dv POST 'customapirequestparameters' @{
            customapirequestparameterid = $q.Id; uniquename = $q.Name; name = "$($spec.Name).$($q.Name)"; displayname = $q.Name
            description = 'Parametro de comunicado'; type = $q.Type; isoptional = $q.Optional; 'CustomAPIId@odata.bind' = "/customapis($($spec.Id))"
          } @{ 'MSCRM.SolutionUniqueName' = 'AppBetinhos' } | Out-Null
        }
        'criar-resposta' {
          $q = $a.Data.Param
          Dv POST 'customapiresponseproperties' @{
            customapiresponsepropertyid = $q.Id; uniquename = $q.Name; name = "$($spec.Name).$($q.Name)"; displayname = $q.Name
            description = 'Resposta de comunicado'; type = $q.Type; 'CustomAPIId@odata.bind' = "/customapis($($spec.Id))"
          } @{ 'MSCRM.SolutionUniqueName' = 'AppBetinhos' } | Out-Null
        }
        'incluir-solucao' {
          Add-Component $spec.Id 'customapi' $a.Data.Solution
          foreach ($q in $spec.Request) { Add-Component $q.Id 'customapirequestparameter' $a.Data.Solution }
          foreach ($q in $spec.Response) { Add-Component $q.Id 'customapiresponseproperty' $a.Data.Solution }
        }
      }
    }
  }

  # Conferencia final.
  $falhas = @()
  foreach ($spec in $script:Apis) {
    $api = @(Rows "customapis?`$select=customapiid,allowedcustomprocessingsteptype,_plugintypeid_value,_sdkmessageid_value&`$filter=uniquename eq '$($spec.Name)'") | Select-Object -First 1
    if (-not $api -or $api.customapiid -ne $spec.Id -or [int]$api.allowedcustomprocessingsteptype -ne 0 -or $api._plugintypeid_value -ne $script:PluginTypeId) { $falhas += "$($spec.Name): id, tipo ou plugintype fora do desenho"; continue }
    foreach ($q in $spec.Request) {
      if (@(Rows "customapirequestparameters?`$select=customapirequestparameterid&`$filter=_customapiid_value eq $($spec.Id) and uniquename eq '$($q.Name)' and type eq $($q.Type)").Count -ne 1) { $falhas += "$($spec.Name).$($q.Name) ausente" }
    }
    $custom = @(Rows "sdkmessageprocessingsteps?`$select=name&`$filter=_sdkmessageid_value eq $($api._sdkmessageid_value)" | Where-Object { $_.name -notlike "CustomApi '*' implementation" })
    if ($custom.Count) { $falhas += "$($spec.Name): steps customizados restantes ($($custom.name -join ', '))" }
    foreach ($sol in $script:Solucoes) {
      if (-not @(Rows "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solutionRows[$sol]) and objectid eq $($spec.Id)").Count) { $falhas += "$($spec.Name) fora da $sol" }
    }
  }
  if ($falhas.Count) { throw "Conferencia falhou: $($falhas -join '; ')" }
  Write-Step 'conferencia ok: APIs com os ids do TEST/PROD, tipo 0, plugintype ComunicadoCommandPlugin, parametros e solucoes'
}

if ($MyInvocation.InvocationName -ne '.') { Invoke-Main }
