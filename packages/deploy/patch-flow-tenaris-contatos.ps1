# Corrige, no "Flow Novo Sistema Tenaris -> Dataverse", o telefone/e-mail/departamento de passageiro que some do
# cadastro (cr40f_bancodedados). Causa: o lote junta Responsável e Passageiros 1-4 e o dedup guarda a primeira
# ocorrência; o Responsável vem sem telefone, e o Update_BD_Existente gravava o vazio por cima do número.
# Depois do patch, dentro do Loop_UpsertBD (sequencial):
#   - Filter_Ocorrencias junta todas as ocorrências da pessoa no lote (mesmo GUID Tenaris ou mesmo nome);
#   - Compose_Telefone/Email/Departamento pegam o primeiro valor preenchido entre elas (passageiros antes do Responsável);
#   - Update_BD_Existente mantém o valor do Dataverse quando o lote vem vazio; Add_a_new_row_BD_1 grava null no vazio.
# Também garante a ordem do union (passageiros antes do Responsável) e o $select do cadastro com telefone, e-mail e
# departamento, e tira do Upsert_Geral a gravação de cr40f_passageirosetelefonedecontato (dono único: plugin
# DriverRecordSharing, que monta o campo a partir dos vínculos; antes os dois alternavam o formato a cada sync).
# Issue #350 (falhas sem detalhe em 06/11 e 09/11/2026):
#   - Compose_PaxDoServico deixa de montar o JSON com json(concat(...)), que quebrava com aspas, barra ou quebra de
#     linha no nome do passageiro; passa a ser um array de objetos com os mesmos campos (guid, nome, ordem);
#   - o e-mail de erro (Scope_1_1) passa a trazer o link da execução e as ações que falharam com a mensagem
#     (Filter_Falhas + Select_Falhas sobre result() da condição e dos dois loops).
# O resto do flow não muda. Já no formato final, não faz nada. Sem -Apply é DRY RUN.
#
# Antes de alterar, salva o clientdata atual em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/patch-flow-tenaris-contatos.ps1 -Ambiente DEV -Apply -Restaurar <arquivo>
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
$flowId = 'cbcd9564-1b1e-f111-88b1-7ced8da87540'
$flowName = 'Flow Novo Sistema Tenaris -> Dataverse'
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
  Write-Host "[tenaris-contatos] $Method $($Path.Split('?')[0])"
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
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Flow-Tenaris-$Ambiente-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Host "[tenaris-contatos] backup: $file"
}
# Grava o clientdata. Flow ativo é desativado, gravado e reativado (mesmo se a gravação falhar); rascunho fica rascunho.
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
function Query([string] $from, [string] $where, $runAfter) {
  return [pscustomobject]@{ type = 'Query'; inputs = [pscustomobject]@{ from = $from; where = $where }; runAfter = $runAfter }
}
function After([string] $name) { return [pscustomobject]@{ $name = @('Succeeded') } }

if ($Arquivo) {
  $flow = [pscustomobject]@{ statecode = 'arquivo'; clientdata = [IO.File]::ReadAllText((Resolve-Path $Arquivo), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) }
} else {
  $who = Dv GET WhoAmI
  if (-not $who.OrganizationId) { throw "A API não respondeu pela organização $Ambiente." }
  $flow = Dv GET "workflows($flowId)?`$select=workflowid,name,statecode,clientdata"
  if ($flow.name -ne $flowName) { throw "O workflow $flowId não é '$flowName' no $Ambiente." }
}

if ($Restaurar) {
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  $props = ($text | ConvertFrom-Json).properties.definition.triggers.manual.inputs.schema.properties
  if (-not $props -or -not ($props.PSObject.Properties.Name -contains 'ultimaSyncAntes')) { throw 'O arquivo não é um backup deste flow.' }
  Backup $flow
  Save $flow $text
  Write-Output "${Ambiente}: '$flowName' restaurado de $Restaurar (statecode original $($flow.statecode))."
  return
}

$clientData = $flow.clientdata | ConvertFrom-Json
$cond = $clientData.properties.definition.actions.Scope.actions.Condition_linhas_mais_que_0.actions
foreach ($n in 'Compose_TodasPessoas', 'Filter_SemVazios', 'List_rows_BancodeDados_Completo', 'Loop_UpsertBD') {
  if (@($cond.PSObject.Properties.Name) -notcontains $n) { throw "O flow não está no formato esperado: ação '$n' ausente." }
}
$loop = $cond.Loop_UpsertBD.actions
$update = $loop.Condition_nome_nao_existe_ainda.else.actions.Update_BD_Existente.inputs.parameters
$create = $loop.Condition_nome_nao_existe_ainda.actions.Add_a_new_row_BD_1.inputs.parameters
if (@($loop.PSObject.Properties.Name) -notcontains 'Filter_BDLocal' -or -not $update -or -not $create) {
  throw 'O flow não está no formato esperado: Filter_BDLocal, Update_BD_Existente ou Add_a_new_row_BD_1 ausente no Loop_UpsertBD.'
}
$upsert = $cond.Loop_Servicos.actions.Upsert_Geral.inputs.parameters
$campoPax = 'item/cr40f_passageirosetelefonedecontato'
$temOcorrencias = @($loop.PSObject.Properties.Name) -contains 'Filter_Ocorrencias'
$gravaPax = @($upsert.PSObject.Properties.Name) -contains $campoPax
$paxDoServico = $cond.Loop_Servicos.actions.Compose_PaxDoServico
$scopeErro = $clientData.properties.definition.actions.Scope.actions.Scope_1_1.actions
if (-not $paxDoServico -or -not $scopeErro -or @($scopeErro.PSObject.Properties.Name) -notcontains 'Send_an_email_(V2)_2') {
  throw 'O flow não está no formato esperado: Compose_PaxDoServico ou Scope_1_1/Send_an_email_(V2)_2 ausente.'
}
$paxJsonConcat = $paxDoServico.inputs -is [string]
$temFalhas = @($scopeErro.PSObject.Properties.Name) -contains 'Select_Falhas'
if ($temOcorrencias -and -not $gravaPax -and -not $paxJsonConcat -and $temFalhas) {
  Write-Output "${Ambiente}: '$flowName' já está no formato final (ocorrências, passageiros sem json(concat), e-mail com as falhas); nada a alterar."
  return
}
Write-Output "${Ambiente}: '$flowName' (statecode $($flow.statecode)) - mudanças:"

# #350: o JSON montado por concatenação quebrava com aspas, barra ou quebra de linha no nome. O array de objetos
# tem os mesmos campos; "@{...}" de valor nulo vira '' como no concat, então Filter_PaxValidos não muda.
if ($paxJsonConcat) {
  $paxDoServico.inputs = @(1..4 | ForEach-Object {
      [pscustomobject]@{
        guid = "@{items('Loop_Servicos')?['Passageiro $_ - GUID']}"
        nome = "@{items('Loop_Servicos')?['Passageiro $_ - Nome']}"
        ordem = $_
      } })
  Write-Output '  Compose_PaxDoServico: json(concat(...)) -> array de 4 objetos (guid, nome, ordem)'
} else { Write-Output '  Compose_PaxDoServico: já é array; sem mudança.' }

# #350: o e-mail de erro ia sem detalhe. result() traz as ações de primeiro nível da condição e de cada iteração
# dos loops; o e-mail sai mesmo se o filtro falhar (runAfter com todos os estados).
if (-not $temFalhas) {
  $email = $scopeErro.'Send_an_email_(V2)_2'
  $todos = @('Succeeded', 'Failed', 'Skipped', 'TimedOut')
  $scopeErro | Add-Member -NotePropertyName Filter_Falhas -NotePropertyValue (Query "@union(result('Condition_linhas_mais_que_0'), result('Loop_UpsertBD'), result('Loop_Servicos'))" "@equals(item()?['status'], 'Failed')" ([pscustomobject]@{}))
  $scopeErro | Add-Member -NotePropertyName Select_Falhas -NotePropertyValue ([pscustomobject]@{
      type = 'Select'; runAfter = (After 'Filter_Falhas')
      inputs = [pscustomobject]@{
        from = "@body('Filter_Falhas')"
        select = [pscustomobject]@{ acao = "@item()?['name']"; codigo = "@item()?['code']"; mensagem = "@take(coalesce(item()?['error']?['message'], ''), 500)" }
      } })
  $email | Add-Member -NotePropertyName runAfter -NotePropertyValue ([pscustomobject]@{ Select_Falhas = $todos }) -Force
  $run = "workflow()?['run']?['name']"
  $email.inputs.parameters.'emailMessage/Body' = '<p class="editor-paragraph">ERRO NO FLOW - Novo Sistema Tenaris -&gt; Dataverse</p>' +
    "<p>Execução: <a href=""https://make.powerautomate.com/environments/@{workflow()?['tags']?['environmentName']}/flows/@{workflow()?['name']}/runs/@{$run}"">@{$run}</a></p>" +
    "<p>Ações que falharam:</p><pre>@{replace(replace(string(body('Select_Falhas')), '&', '&amp;'), '<', '&lt;')}</pre>"
  Write-Output '  Scope_1_1: + Filter_Falhas, Select_Falhas; e-mail com o link da execução e as ações que falharam'
} else { Write-Output '  Scope_1_1: e-mail já traz as falhas; sem mudança.' }

# cr40f_passageirosetelefonedecontato é derivado de cr40f_servicosporpassageiro + cr40f_bancodedados e tem um dono
# só: o plugin DriverRecordSharing (ServicePassengerViewSynchronizer). O texto da planilha continua no snapshot.
if ($gravaPax) {
  Write-Output "  Upsert_Geral.$campoPax : removido (era $($upsert.$campoPax.Substring(0, 60))...)"
  $upsert.PSObject.Properties.Remove($campoPax)
}
if ($temOcorrencias) { Write-Output '  Loop_UpsertBD: já junta as ocorrências; sem mudança.' }
else {
$union = "@union(body('Select_Pax_1'),body('Select_Pax_2'),body('Select_Pax_3'),body('Select_Pax_4'),body('Select_Responsável'))"
$select = 'cr40f_bancodedadosid,cr40f_nomedopassageiro,cr40f_telefone,cr40f_email,cr40f_departamento'
$campos = [ordered]@{ Telefone = @('telefone', 'cr40f_telefone'); Email = @('email', 'cr40f_email'); Departamento = @('departamento', 'cr40f_departamento') }

Write-Output "  Compose_TodasPessoas: $($cond.Compose_TodasPessoas.inputs) -> $union"
Write-Output "  List_rows_BancodeDados_Completo.`$select: $($cond.List_rows_BancodeDados_Completo.inputs.parameters.'$select') -> $select"
$cond.Compose_TodasPessoas.inputs = $union
$cond.List_rows_BancodeDados_Completo.inputs.parameters.'$select' = $select

# Ocorrências da pessoa no lote inteiro: mesmo GUID Tenaris (quando há) ou mesmo nome, sem diferenciar maiúsculas.
$mesmaPessoa = "@or(and(not(empty(items('Loop_UpsertBD')?['guid'])), equals(item()?['guid'], items('Loop_UpsertBD')?['guid'])), equals(toLower(trim(coalesce(item()?['nome'], ''))), toLower(trim(coalesce(items('Loop_UpsertBD')?['nome'], '')))))"
$loop | Add-Member -NotePropertyName Filter_Ocorrencias -NotePropertyValue (Query "@body('Filter_SemVazios')" $mesmaPessoa ([pscustomobject]@{}))
$anterior = 'Filter_Ocorrencias'
foreach ($c in $campos.GetEnumerator()) {
  $campo = $c.Value[0]; $coluna = $c.Value[1]
  $loop | Add-Member -NotePropertyName "Filter_Ocorr_$($c.Key)" -NotePropertyValue (Query "@body('Filter_Ocorrencias')" "@not(empty(trim(coalesce(item()?['$campo'], ''))))" (After $anterior))
  $loop | Add-Member -NotePropertyName "Compose_$($c.Key)" -NotePropertyValue ([pscustomobject]@{
      type = 'Compose'; inputs = "@trim(coalesce(first(body('Filter_Ocorr_$($c.Key)'))?['$campo'], ''))"; runAfter = (After "Filter_Ocorr_$($c.Key)") })
  $anterior = "Compose_$($c.Key)"
  $novoUpdate = "@if(empty(outputs('Compose_$($c.Key)')), first(body('Filter_BDLocal'))?['$coluna'], outputs('Compose_$($c.Key)'))"
  $novoCreate = "@if(empty(outputs('Compose_$($c.Key)')), null, outputs('Compose_$($c.Key)'))"
  Write-Output "  Update_BD_Existente.$coluna : $($update."item/$coluna") -> $novoUpdate"
  Write-Output "  Add_a_new_row_BD_1.$coluna : $($create."item/$coluna") -> $novoCreate"
  $update."item/$coluna" = $novoUpdate
  $create."item/$coluna" = $novoCreate
}
# Filter_BDLocal era a primeira ação do loop; passa a rodar depois dos Composes.
$loop.Filter_BDLocal | Add-Member -NotePropertyName runAfter -NotePropertyValue (After $anterior) -Force
Write-Output "  Loop_UpsertBD: + Filter_Ocorrencias, Filter_Ocorr_*/Compose_* (Telefone, Email, Departamento); Filter_BDLocal depois de $anterior"
}

$novo = $clientData | ConvertTo-Json -Depth 90 -Compress
if ($Arquivo) {
  AssertSemMojibake $novo 'resultado'
  [IO.File]::WriteAllText($Saida, $novo, (New-Object Text.UTF8Encoding $false))
  Write-Output "ARQUIVO: resultado em $Saida (nada foi gravado no Dataverse)."
  return
}
if (-not $Apply) { Write-Output 'DRY RUN: nada foi gravado. Rode com -Apply para aplicar.'; return }
Backup $flow
Save $flow $novo
$conf = (Dv GET "workflows($flowId)?`$select=clientdata,statecode")
$condSalvo = ($conf.clientdata | ConvertFrom-Json).properties.definition.actions.Scope.actions.Condition_linhas_mais_que_0.actions
if (@($condSalvo.Loop_UpsertBD.actions.PSObject.Properties.Name) -notcontains 'Filter_Ocorrencias' -or
  @($condSalvo.Loop_Servicos.actions.Upsert_Geral.inputs.parameters.PSObject.Properties.Name) -contains $campoPax -or
  $condSalvo.Loop_Servicos.actions.Compose_PaxDoServico.inputs -is [string] -or
  @(($conf.clientdata | ConvertFrom-Json).properties.definition.actions.Scope.actions.Scope_1_1.actions.PSObject.Properties.Name) -notcontains 'Select_Falhas') {
  throw 'A gravação não persistiu: Filter_Ocorrencias, Compose_PaxDoServico em array ou Select_Falhas ausente, ou Upsert_Geral ainda grava o campo de passageiros.'
}
Write-Output "${Ambiente}: '$flowName' atualizado (statecode $($conf.statecode))."
