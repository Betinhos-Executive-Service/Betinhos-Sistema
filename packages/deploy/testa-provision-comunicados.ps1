# Testa o plano do provision-comunicados.ps1 (Get-ApiPlan) com estados simulados, em StrictMode, sem tocar no Dataverse.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/testa-provision-comunicados.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'provision-comunicados.ps1')

$falhas = 0
function Check([string] $Nome, [bool] $Ok, [string] $Detalhe = '') {
  if ($Ok) { Write-Host "ok    $Nome" } else { Write-Host "FALHA $Nome $Detalhe"; $script:falhas++ }
}
function Kinds($Plan) { @($Plan | ForEach-Object { $_.Kind }) -join ',' }
function Row([hashtable] $h) { [pscustomobject]$h }

$abrir = $script:Apis | Where-Object { $_.Name -eq 'new_AbrirComunicadoMotorista' }
$ciencia = $script:Apis | Where-Object { $_.Name -eq 'new_RegistrarCienciaComunicado' }
$pt = $script:PluginTypeId

function ApiRow([string] $Id, [int] $StepType = 0, $PluginType = $pt, [bool] $Managed = $false) {
  Row @{ customapiid = $Id; ismanaged = $Managed; allowedcustomprocessingsteptype = $StepType; _plugintypeid_value = $PluginType; _sdkmessageid_value = [guid]::NewGuid().ToString() }
}
function Req($p, [string] $Id = $p.Id) { Row @{ customapirequestparameterid = $Id; uniquename = $p.Name; type = $p.Type; isoptional = $p.Optional } }
function InSolutions([string] $Id) { @("AppBetinhos|$Id", "BetinhosAutomacao|$Id") }

# 1. Desenho completo (como o TEST/PROD mais o new_EvidenciaJson): nada a fazer.
$state = @{ Api = (ApiRow $abrir.Id); Request = @($abrir.Request | ForEach-Object { Req $_ }); Response = @(); Steps = @(); Solutions = (InSolutions $abrir.Id) }
$plan = @(Get-ApiPlan $abrir $state $false)
Check 'desenho completo: plano vazio' ($plan.Count -eq 0) (Kinds $plan)

# 2. Id certo sem o new_EvidenciaJson (TEST/PROD hoje): so cria o parametro e reinclui nas solucoes; nunca exclui.
$state = @{ Api = (ApiRow $ciencia.Id); Request = @($ciencia.Request | Where-Object { $_.Name -ne 'new_EvidenciaJson' } | ForEach-Object { Req $_ }); Response = @(); Steps = @(); Solutions = (InSolutions $ciencia.Id) }
$plan = @(Get-ApiPlan $ciencia $state $false)
Check 'id certo sem evidencia: cria so o parametro' ((Kinds $plan) -eq 'criar-parametro,incluir-solucao,incluir-solucao') (Kinds $plan)
Check 'id certo sem evidencia: parametro com id fixo' ($plan[0].Data.Param.Id -eq '6e56966f-21dd-f111-84ea-7ced8da8c473')
Check 'id certo: nunca exclui' (-not ($plan | Where-Object { $_.Kind -in 'excluir-api', 'remover-step' }))

# 3. DEV de hoje (id novo, tipo 2, sem plugintype, step stage 40): sem o switch, recusa.
$devApi = ApiRow '1dba7c69-21dd-f111-84ea-7ced8da8c473' 2 $null
$devStep = Row @{ sdkmessageprocessingstepid = '3cba7c69-21dd-f111-84ea-7ced8da8c473'; name = 'Comunicados - abrir (carimbo do IP)'; stage = 40; _sdkmessageprocessingstepsecureconfigid_value = 'x' }
$devState = @{ Api = $devApi; Request = @((Req $abrir.Request[0] '2dba7c69-21dd-f111-84ea-7ced8da8c473'), (Req $abrir.Request[1])); Response = @(); Steps = @($devStep); Solutions = (InSolutions $devApi.customapiid) }
$plan = @(Get-ApiPlan $abrir $devState $false)
Check 'id diferente sem -MigrarIdsDoProd: recusa' ((Kinds $plan) -eq 'recusa') (Kinds $plan)

# 4. Com o switch: remove o step, exclui, recria com id fixo, todos os parametros e as duas solucoes.
$plan = @(Get-ApiPlan $abrir $devState $true)
Check 'migracao: ordem das acoes' ((Kinds $plan) -eq 'remover-step,excluir-api,criar-api,criar-parametro,criar-parametro,incluir-solucao,incluir-solucao') (Kinds $plan)
Check 'migracao: recria new_EvidenciaJson' (@($plan | Where-Object { $_.Kind -eq 'criar-parametro' -and $_.Data.Param.Name -eq 'new_EvidenciaJson' }).Count -eq 1)
Check 'migracao: DestinatarioId com id do PROD' (@($plan | Where-Object { $_.Kind -eq 'criar-parametro' -and $_.Data.Param.Id -eq 'ac320da8-ecd7-4ee6-8a3e-9e88c4ca9da7' }).Count -eq 1)
Check 'migracao: solucoes AppBetinhos e BetinhosAutomacao' ((@($plan | Where-Object { $_.Kind -eq 'incluir-solucao' } | ForEach-Object { $_.Data.Solution }) -join ',') -eq 'AppBetinhos,BetinhosAutomacao')

# 5. Step de implementacao do sistema nao e removido a mao.
$impl = Row @{ sdkmessageprocessingstepid = 'i'; name = "CustomApi 'new_AbrirComunicadoMotorista' implementation"; stage = 30; _sdkmessageprocessingstepsecureconfigid_value = $null }
$devState.Steps = @($impl)
$plan = @(Get-ApiPlan $abrir $devState $true)
Check 'migracao: ignora step de implementacao' (-not ($plan | Where-Object { $_.Kind -eq 'remover-step' }))

# 6. Gerenciada com id diferente: recusa mesmo com o switch.
$devState.Api = ApiRow 'aaaaaaaa-0000-0000-0000-000000000000' 0 $pt $true
$plan = @(Get-ApiPlan $abrir $devState $true)
Check 'gerenciada com id diferente: recusa' ((Kinds $plan) -eq 'recusa') (Kinds $plan)

# 7. Id certo, gerenciada (TEST/PROD): recusa sem alterar.
$state = @{ Api = (ApiRow $abrir.Id 0 $pt $true); Request = @($abrir.Request[0] | ForEach-Object { Req $_ }); Response = @(); Steps = @(); Solutions = @() }
$plan = @(Get-ApiPlan $abrir $state $false)
Check 'id certo gerenciada: recusa' ((Kinds $plan) -eq 'recusa') (Kinds $plan)

# 8. Id certo com tipo 2: recusa (allowedcustomprocessingsteptype nao e atualizavel).
$state = @{ Api = (ApiRow $abrir.Id 2); Request = @(); Response = @(); Steps = @(); Solutions = @() }
$plan = @(Get-ApiPlan $abrir $state $false)
Check 'id certo tipo 2: recusa' ((Kinds $plan) -eq 'recusa') (Kinds $plan)

# 9. Id certo sem plugintype: corrige o vinculo.
$state = @{ Api = (ApiRow $abrir.Id 0 $null); Request = @($abrir.Request | ForEach-Object { Req $_ }); Response = @(); Steps = @(); Solutions = (InSolutions $abrir.Id) }
$plan = @(Get-ApiPlan $abrir $state $false)
Check 'id certo sem plugintype: ajusta' ((Kinds $plan) -eq 'ajustar-plugintype') (Kinds $plan)

# 10. Parametro com tipo diferente: recusa; parametro extra: so aviso.
$wrong = Row @{ customapirequestparameterid = 'p'; uniquename = 'new_EvidenciaJson'; type = 12; isoptional = $true }
$extra = Row @{ customapirequestparameterid = 'e'; uniquename = 'new_Outro'; type = 10; isoptional = $true }
$state = @{ Api = (ApiRow $abrir.Id); Request = @((Req $abrir.Request[0]), $wrong, $extra); Response = @(); Steps = @(); Solutions = (InSolutions $abrir.Id) }
$plan = @(Get-ApiPlan $abrir $state $false)
Check 'parametro com tipo errado: recusa; extra: aviso' ((Kinds $plan) -eq 'recusa,aviso') (Kinds $plan)

# 11. API ausente: cria com id fixo.
$state = @{ Api = $null; Request = @(); Response = @(); Steps = @(); Solutions = @() }
$plan = @(Get-ApiPlan $ciencia $state $false)
Check 'ausente: cria api, 4 parametros e solucoes' ((Kinds $plan) -eq 'criar-api,criar-parametro,criar-parametro,criar-parametro,criar-parametro,incluir-solucao,incluir-solucao') (Kinds $plan)

if ($falhas) { throw "$falhas teste(s) falharam" }
Write-Host 'todos os testes passaram'
