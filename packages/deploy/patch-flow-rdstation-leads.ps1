# Corrige, no "Flow API RD Station BD para Leads", a falha com passageiro sem cliente (cr40f_bancodedados.cr40f_cliente
# vazio). Antes, Get_a_row_by_ID buscava o cliente com recordId vazio, falhava (WorkflowOperationParametersRuntimeMissingValue),
# o lead não ia ao RD e o flow mandava "ERRO NO FLOW" (Carly Shedlick, Deny Dos Santos e Dave Danyluk, 06 a 12/11/2026).
# Depois do patch:
#   - Initialize_empresa (nível superior) cria a variável empresa vazia; Condition_tem_email roda depois dela;
#   - dentro de Condition_tem_email, Condition_tem_cliente só chama Get_a_row_by_ID e Set_empresa quando há cliente;
#   - Initialize_empresa herda o runAfter de Condition_tem_email e Condition_tem_cliente o de Get_a_row_by_ID;
#   - quem rodava depois de Get_a_row_by_ID (HTTP_Obter_Token) roda depois de Condition_tem_cliente e o campo company do lead usa variables('empresa').
# Sem cliente, o lead vai ao RD com company vazio. O resto do flow (token, conversão, ativar/desativar, e-mail de erro)
# não muda. Já no formato final, não faz nada. Sem -Apply é DRY RUN.
#
# O clientdata deste flow tem credenciais do RD: o backup fica em packages/deploy/flows/backup/ (fora do git) e nada
# do clientdata é impresso. Para reverter:
#   pwsh -File packages/deploy/patch-flow-rdstation-leads.ps1 -Ambiente DEV -Apply -Restaurar <arquivo>
# PROD exige -Apply e -ConfirmarProd. Requer `az login` com acesso ao ambiente.
# Sem Dataverse (teste local): -Arquivo <clientdata.json> -Saida <resultado.json> só transforma o arquivo.
param(
  [Parameter(Mandatory = $true)][ValidateSet('DEV', 'PROD')][string] $Ambiente,
  [switch] $Apply,
  [switch] $ConfirmarProd,
  [string] $Restaurar = '',
  [string] $Arquivo = '',
  [string] $Saida = ''
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$urls = @{ DEV = 'https://org23b93544.crm2.dynamics.com'; PROD = 'https://orgf261ae8e.crm2.dynamics.com' }
$environmentUrl = $urls[$Ambiente]
$flowId = '0fce14c4-4a34-f111-88b4-6045bd3c4061'
$flowName = 'Flow API RD Station BD para Leads'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if ($Ambiente -eq 'PROD' -and $Apply -and -not $ConfirmarProd) { throw 'PROD exige -ConfirmarProd junto com -Apply.' }
if ($Restaurar -and -not $Apply) { throw '-Restaurar grava no flow; use junto com -Apply.' }
if ($Arquivo -and ($Apply -or $Restaurar -or -not $Saida)) { throw '-Arquivo é só local: use com -Saida, sem -Apply nem -Restaurar.' }

if (-not $Arquivo) {
  $dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw "Token do Dataverse $Ambiente indisponível (rode az login)." }
  $headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
}

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[rdstation-leads] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã[-¿]|Â[ -¿]|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Backup($row) {
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-RDStationLeads-$Ambiente-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[rdstation-leads] backup: $file"
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
function Nomes($obj) { @($obj.PSObject.Properties | ForEach-Object Name) }
function RunAfter($acao) { if ((Nomes $acao) -contains 'runAfter') { $acao.runAfter } else { [pscustomobject]@{} } }

if ($Arquivo) {
  $flow = [pscustomobject]@{ clientdata = [IO.File]::ReadAllText((Resolve-Path $Arquivo), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF); statecode = 1 }
} else {
  $who = Dv GET WhoAmI
  if (-not $who.OrganizationId) { throw "A API não respondeu pela organização $Ambiente." }
  $flow = Dv GET "workflows($flowId)?`$select=workflowid,name,statecode,clientdata"
  if ($flow.name -ne $flowName) { throw "O workflow $flowId não é '$flowName' no $Ambiente." }
}

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  try { $ehBackup = (Nomes ($text | ConvertFrom-Json).properties.definition.actions) -contains 'Condition_tem_email' } catch { $ehBackup = $false }
  if (-not $ehBackup) { throw 'O arquivo não é um backup deste flow.' }
  Backup $flow
  Save $flow $text
  Write-Output "${Ambiente}: '$flowName' restaurado de $Restaurar (statecode original $($flow.statecode))."
  return
}

$cd = $flow.clientdata | ConvertFrom-Json
$def = $cd.properties.definition
$cond = $def.actions.Condition_tem_email
$acts = $cond.actions
if ((Nomes $acts) -contains 'Condition_tem_cliente') { Write-Output "${Ambiente}: '$flowName' já está no formato final; nada a alterar."; return }
foreach ($n in 'Get_a_row_by_ID', 'HTTP_Obter_Token', 'HTTP_Criar_Lead_Campo_Originais') {
  if ((Nomes $acts) -notcontains $n) { throw "O flow não está no formato esperado: ação '$n' ausente." }
}
$payload = $acts.HTTP_Criar_Lead_Campo_Originais.inputs.body.payload
$companyAntigo = "@{outputs('Get_a_row_by_ID')?['body/cr40f_nomedocliente']}"
if ($payload.company -ne $companyAntigo) { throw 'O campo company do lead não está no formato esperado.' }
if ((Nomes $def.actions) -contains 'Initialize_empresa') { throw 'Initialize_empresa já existe sem Condition_tem_cliente; revise o flow à mão.' }
$get = $acts.Get_a_row_by_ID
if ("$($get.inputs.parameters.recordId)" -notmatch '_cr40f_cliente_value') { throw 'Get_a_row_by_ID não busca pelo _cr40f_cliente_value do gatilho; revise o flow à mão.' }
if ((Nomes (RunAfter $acts.HTTP_Obter_Token)) -notcontains 'Get_a_row_by_ID') { throw 'HTTP_Obter_Token não roda depois de Get_a_row_by_ID; revise o flow à mão.' }

$def.actions | Add-Member -NotePropertyName Initialize_empresa -NotePropertyValue ([pscustomobject]@{
    type = 'InitializeVariable'
    inputs = [pscustomobject]@{ variables = @([pscustomobject]@{ name = 'empresa'; type = 'string'; value = '' }) }
    runAfter = (RunAfter $cond)
  })
$cond | Add-Member -NotePropertyName runAfter -NotePropertyValue ([pscustomobject]@{ Initialize_empresa = @('Succeeded') }) -Force

$getRunAfter = RunAfter $get
$get | Add-Member -NotePropertyName runAfter -NotePropertyValue ([pscustomobject]@{}) -Force
$acts.PSObject.Properties.Remove('Get_a_row_by_ID')
$acts | Add-Member -NotePropertyName Condition_tem_cliente -NotePropertyValue ([pscustomobject]@{
    type = 'If'
    expression = [pscustomobject]@{ and = @([pscustomobject]@{ not = [pscustomobject]@{ equals = @("@empty(triggerOutputs()?['body/_cr40f_cliente_value'])", $true) } }) }
    actions = [pscustomobject]@{
      Get_a_row_by_ID = $get
      Set_empresa = [pscustomobject]@{
        type = 'SetVariable'
        inputs = [pscustomobject]@{ name = 'empresa'; value = "@{outputs('Get_a_row_by_ID')?['body/cr40f_nomedocliente']}" }
        runAfter = [pscustomobject]@{ Get_a_row_by_ID = @('Succeeded') }
      }
    }
    else = [pscustomobject]@{ actions = [pscustomobject]@{} }
    runAfter = $getRunAfter
  })
# Quem rodava depois de Get_a_row_by_ID (HTTP_Obter_Token e outros) passa a rodar depois de Condition_tem_cliente, com os mesmos estados.
foreach ($p in @($acts.PSObject.Properties)) {
  $ra = RunAfter $p.Value
  if ((Nomes $ra) -notcontains 'Get_a_row_by_ID') { continue }
  $estados = $ra.Get_a_row_by_ID
  $ra.PSObject.Properties.Remove('Get_a_row_by_ID')
  $ra | Add-Member -NotePropertyName Condition_tem_cliente -NotePropertyValue $estados -Force
}
$payload.company = "@{variables('empresa')}"
$novo = $cd | ConvertTo-Json -Depth 90 -Compress
$dentro = [regex]::Matches(($acts.Condition_tem_cliente | ConvertTo-Json -Depth 90 -Compress), 'Get_a_row_by_ID').Count
if ([regex]::Matches($novo, 'Get_a_row_by_ID').Count -ne $dentro) { throw 'Outra ação ainda usa Get_a_row_by_ID fora de Condition_tem_cliente (sem cliente ela seria pulada); revise o flow à mão.' }

Write-Output "${Ambiente}: '$flowName' (statecode $($flow.statecode)) - mudanças:"
Write-Output '  Initialize_empresa         : variável empresa vazia; Condition_tem_email roda depois dela'
Write-Output '  Condition_tem_cliente      : Get_a_row_by_ID + Set_empresa só com _cr40f_cliente_value preenchido'
Write-Output "  HTTP_Obter_Token           : runAfter Condition_tem_cliente"
Write-Output "  company do lead            : $companyAntigo -> @{variables('empresa')}"

if ($Arquivo) {
  AssertSemMojibake $novo 'resultado'
  [IO.File]::WriteAllText($Saida, $novo, (New-Object Text.UTF8Encoding $false))
  Write-Output "ARQUIVO: resultado em $Saida (nada foi gravado no Dataverse)."
  return
}
if (-not $Apply) { Write-Output 'DRY RUN: nada foi gravado. Rode com -Apply para aplicar.'; return }
Backup $flow
Save $flow $novo
$conf = Dv GET "workflows($flowId)?`$select=clientdata,statecode"
$salvo = ($conf.clientdata | ConvertFrom-Json).properties.definition.actions.Condition_tem_email.actions
if ((Nomes $salvo) -notcontains 'Condition_tem_cliente' -or $salvo.HTTP_Criar_Lead_Campo_Originais.inputs.body.payload.company -ne "@{variables('empresa')}") {
  throw 'A gravação não persistiu: Condition_tem_cliente ausente ou company ainda lê Get_a_row_by_ID.'
}
Write-Output "${Ambiente}: '$flowName' atualizado (statecode $($conf.statecode))."
