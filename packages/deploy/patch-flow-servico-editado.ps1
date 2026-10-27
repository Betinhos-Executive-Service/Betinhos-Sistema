# Corrige o "Flow Notificação Serviço Editado | Interno e Motoristas".
# Causas (provadas em 27/10/2026 no histórico do PROD):
#   1) filteringattributes do gatilho com espaços duplos e quebra de linha: o gatilho dispara em qualquer update
#      (troca de motorista, veículo, "visualização do motorista"...) e não só nas colunas de interesse;
#   2) Compose_campo lia só o último registro de auditoria e o primeiro atributo dele, sem relação com a edição
#      (ex.: avisava "cr40f_veiculo" para uma troca de veículo, e o nome técnico em vez do rótulo);
#   3) edições sem coluna relevante terminavam como Cancelled (33 de 50 execuções), poluindo o histórico.
# Depois do patch:
#   - filteringattributes limpo (inclui cr40f_cliente, que já constava na descrição do gatilho);
#   - Delay_auditoria espera 15 s (a auditoria grava depois do gatilho; sem isso a leitura vinha vazia) e
#     List_rows_auditoria olha só os registros de 3 s antes a 10 s depois do modifiedon (top 20);
#   - Select_changedata + Compose_campo listam TODAS as colunas de interesse alteradas, com rótulo em português;
#   - Condition_campo_relevante: sem coluna de interesse alterada, encerra como Succeeded sem notificar;
#   - Terminate_1 (fora da janela de horário) passa de Cancelled para Succeeded.
# Sem -Apply é DRY RUN. PROD exige -Apply e -ConfirmarProd. Antes de gravar, salva o clientdata em packages/deploy/flows/backup/. Reverter:
#   powershell -File packages/deploy/patch-flow-servico-editado.ps1 -Ambiente DEV -Apply -Restaurar <arquivo>
# Requer `az login` com acesso ao ambiente.
param(
  [Parameter(Mandatory = $true)][ValidateSet('DEV', 'PROD')][string] $Ambiente,
  [switch] $Apply,
  [switch] $ConfirmarProd,
  [string] $Restaurar = ''
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$urls = @{ DEV = 'https://org23b93544.crm2.dynamics.com'; PROD = 'https://orgf261ae8e.crm2.dynamics.com' }
$environmentUrl = $urls[$Ambiente]
$flowId = '3a12fce1-ec26-f111-88b4-7ced8da87663'
$flowName = 'Flow Notificação Serviço Editado | Interno e Motoristas'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if ($Ambiente -eq 'PROD' -and $Apply -and -not $ConfirmarProd) { throw 'PROD exige -ConfirmarProd junto com -Apply.' }
if ($Restaurar -and -not $Apply) { throw '-Restaurar grava no flow; use junto com -Apply.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse $Ambiente indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[servico-editado] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function AssertSemMojibake([string] $s, [string] $origem) {
  # "AMANHÃ" é texto legítimo do flow; só sequências típicas de UTF-8 lido como Latin-1 contam como corrupção.
  if ($s -cmatch 'Ã[-¿]|Â[ -¿]|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-ServicoEditado-$Ambiente-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[servico-editado] backup: $file"
}
# Flow ativo é desativado, gravado e reativado (mesmo se a gravação falhar); rascunho continua rascunho.
function Save($row, [string] $clientData) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -ne 1) { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null; return }
  Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    $after = Dv GET "workflows($id)?`$select=statecode"
    if ($after.statecode -ne 1) { throw "Flow não reativou (statecode $($after.statecode)). Restaure com -Restaurar." }
  }
}

$who = Dv GET WhoAmI
if (-not $who.OrganizationId) { throw 'A API não respondeu pela organização $Ambiente.' }
$flow = Dv GET "workflows($flowId)?`$select=workflowid,name,statecode,clientdata"
if ($flow.name -ne $flowName) { throw "O workflow $flowId não é '$flowName' no $Ambiente." }

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  if (-not ($text | ConvertFrom-Json).properties.definition.actions.Scope) { throw 'O arquivo não é um backup deste flow.' }
  Backup $flow
  Save $flow $text
  Write-Output "${Ambiente}: '$flowName' restaurado de $Restaurar (statecode original $($flow.statecode))."
  return
}

$cd = $flow.clientdata | ConvertFrom-Json
$def = $cd.properties.definition
$trigger = $def.triggers.'When_a_row_is_added,_modified_or_deleted'
$ifNode = $def.actions.Scope.actions.'Condition_é_pra_rodar'
$acts = $ifNode.actions
foreach ($n in 'List_rows_auditoria', 'Compose_campo', 'Compose_valor_antigo') {
  if (@($acts.PSObject.Properties.Name) -notcontains $n) { throw "O flow não está no formato esperado: ação '$n' ausente." }
}
if (@($acts.PSObject.Properties.Name) -contains 'Filter_auditoria') {
  Write-Output "${Ambiente}: '$flowName' já está no formato final; nada a alterar."
  return
}

# Colunas de interesse -> rótulo mostrado na notificação.
$colunas = [ordered]@{
  cr40f_cliente = 'Cliente'; cr40f_dataehorriodesada = 'Data e horário de saída'; cr40f_destino = 'Destino'
  cr40f_endereodesada = 'Endereço de saída'; cr40f_obsdeoperao = 'Observações da operação'
  cr40f_passageirosetelefonedecontato = 'Passageiros e telefone'; cr40f_horrioprevistoderetorno = 'Horário previsto de retorno'
  cr40f_receber = 'Receber'; cr40f_trajeto = 'Trajeto'
}
$lista = [string]::Join(',', @($colunas.Keys))
$trigger.inputs.parameters.'subscriptionRequest/filteringattributes' = $lista
$trigger.description = [string]::Join(', ', @($colunas.Keys))

# Auditoria: só os registros gravados de 3 s antes a 10 s depois do modifiedon que disparou o flow.
$mod = "triggerOutputs()?['body/modifiedon']"
# O conector devolvia 0 linhas com createdon no $filter (direto na API funciona); filtra a janela no flow.
$acts.List_rows_auditoria.inputs.parameters.'$filter' = "objecttypecode eq 'cr40f_reservadeveculos' and _objectid_value eq @{triggerOutputs()?['body/cr40f_reservadeveculosid']} and action eq 2"
$acts.List_rows_auditoria.inputs.parameters.'$top' = 20
if (@($acts.PSObject.Properties.Name) -contains 'Filter_auditoria') { $acts.PSObject.Properties.Remove('Filter_auditoria') }
$acts | Add-Member -NotePropertyName Filter_auditoria -NotePropertyValue ([pscustomobject]@{
    type = 'Query'
    inputs = [pscustomobject]@{
      from = "@outputs('List_rows_auditoria')?['body/value']"
      where = "@and(greaterOrEquals(ticks(item()?['createdon']), ticks(addSeconds($mod, -3))), lessOrEquals(ticks(item()?['createdon']), ticks(addSeconds($mod, 10))))"
    }
    runAfter = [pscustomobject]@{ List_rows_auditoria = @('Succeeded') }
  })

if (@($acts.PSObject.Properties.Name) -contains 'Delay_auditoria') { $acts.PSObject.Properties.Remove('Delay_auditoria') }
$acts | Add-Member -NotePropertyName Delay_auditoria -NotePropertyValue ([pscustomobject]@{
    type = 'Wait'
    inputs = [pscustomobject]@{ interval = [pscustomobject]@{ count = 15; unit = 'Second' } }
    runAfter = [pscustomobject]@{ Compose_App_ID = @('Succeeded') }
  })
$acts.List_rows_auditoria.runAfter = [pscustomobject]@{ Delay_auditoria = @('Succeeded') }
if (@($acts.PSObject.Properties.Name) -contains 'Select_changedata') { $acts.PSObject.Properties.Remove('Select_changedata'); $acts.PSObject.Properties.Remove('Condition_campo_relevante') }
$acts | Add-Member -NotePropertyName Select_changedata -NotePropertyValue ([pscustomobject]@{
    type = 'Select'
    inputs = [pscustomobject]@{ from = "@body('Filter_auditoria')"; select = "@item()?['changedata']" }
    runAfter = [pscustomobject]@{ Filter_auditoria = @('Succeeded') }
  })

$partes = ($colunas.GetEnumerator() | ForEach-Object { "if(contains(variables_texto, '""logicalName"":""$($_.Key)""'), '$($_.Value), ', '')" })
$texto = "join(body('Select_changedata'), ' ')"
$concat = "concat(" + (($partes -join ', ').Replace('variables_texto', $texto)) + ")"
$acts.Compose_campo.inputs = "@if(empty($concat), '', substring($concat, 0, sub(length($concat), 2)))"
$acts.Compose_campo.runAfter = [pscustomobject]@{ Select_changedata = @('Succeeded') }

$acts | Add-Member -NotePropertyName Condition_campo_relevante -NotePropertyValue ([pscustomobject]@{
    type = 'If'
    expression = [pscustomobject]@{ and = @([pscustomobject]@{ equals = @("@empty(outputs('Compose_campo'))", $true) }) }
    actions = [pscustomobject]@{
      Terminate_sem_campo = [pscustomobject]@{ type = 'Terminate'; inputs = [pscustomobject]@{ runStatus = 'Succeeded' } }
    }
    else = [pscustomobject]@{ actions = [pscustomobject]@{} }
    runAfter = [pscustomobject]@{ Compose_campo = @('Succeeded') }
  })
$acts.Compose_valor_antigo.runAfter = [pscustomobject]@{ Condition_campo_relevante = @('Succeeded') }

# Fora da janela de horário não é erro nem cancelamento.
$ifNode.else.actions.Terminate_1.inputs.runStatus = 'Succeeded'

Write-Output "${Ambiente}: '$flowName' (statecode $($flow.statecode)) - mudanças:"
Write-Output "  gatilho.filteringattributes : $lista"
Write-Output '  Delay_auditoria + List_rows_auditoria : espera 15 s; createdon de -3 s a +10 s do modifiedon, top 20'
Write-Output '  Select_changedata/Compose_campo : lista todas as colunas de interesse alteradas, com rótulo'
Write-Output '  Condition_campo_relevante   : sem coluna de interesse alterada -> Terminate Succeeded, sem notificar'
Write-Output '  Terminate_1                 : Cancelled -> Succeeded'
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
if (-not $Apply) { Write-Output 'DRY RUN: nada gravado. Rode com -Apply.'; return }
Backup $flow
Save $flow $novo
Write-Output "${Ambiente}: '$flowName' atualizado (statecode $($flow.statecode) mantido)."
