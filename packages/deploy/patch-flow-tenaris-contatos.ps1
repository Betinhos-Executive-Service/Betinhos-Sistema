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
#     (Filter_Falhas + Select_Falhas sobre result() da condição e dos dois loops);
#   - o cadastro de passageiros é lido só da Tenaris e o dedup/busca comparam o nome sem
#     maiúsculas nem espaços nas pontas (duplicados criados no mesmo lote e homônimo de outro cliente).
# Solicitante do serviço = Responsável da linha (era o passageiro 1) e passageiro reconhecido também pelo e-mail.
# Desempenho: Update_BD_Existente só roda quando algo muda no cadastro (Condition_BD_Mudou) e List_rows_Cliente
# lê só a Tenaris.
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
$elseBD = $loop.Condition_nome_nao_existe_ainda.else.actions
$temSoMudou = @($elseBD.PSObject.Properties.Name) -contains 'Condition_BD_Mudou'
$update = $(if ($temSoMudou) { $elseBD.Condition_BD_Mudou.actions.Update_BD_Existente } else { $elseBD.Update_BD_Existente }).inputs.parameters
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
$listaBD = $cond.List_rows_BancodeDados_Completo
$condUnico = $cond.Loop_Dedup.actions.Condition_unico
$criaPax = $cond.Loop_Servicos.actions.Loop_Create_Pax.actions.Condition_TemGUID
if (-not $condUnico.actions.Append_to_array_variable_varNomesVistos -or -not $criaPax.actions.Filter_FindGUID -or -not $criaPax.else.actions.Filter_FindGUID_PorNome) {
  throw 'O flow não está no formato esperado: Condition_unico, Filter_FindGUID ou Filter_FindGUID_PorNome ausente.'
}
$temIdentificacao = @($listaBD.inputs.parameters.PSObject.Properties.Name) -contains '$filter'
$solicitante = $cond.Loop_Servicos.actions.Filter_array_Solicitante_First
$mapaUpdate = $elseBD.Append_to_array_variable_varGUIDMap_2
$listaCliente = $cond.List_rows_Cliente
if (-not $listaCliente) { throw 'O flow não está no formato esperado: List_rows_Cliente ausente.' }
$temClienteFiltro = @($listaCliente.inputs.parameters.PSObject.Properties.Name) -contains '$filter'
if (-not $solicitante -or -not $mapaUpdate) { throw 'O flow não está no formato esperado: Filter_array_Solicitante_First ou Append_to_array_variable_varGUIDMap_2 ausente.' }
$temSolicitante = $solicitante.inputs.where -like "*Responsável - Nome*"
$temEmail = $loop.Filter_BDLocal.inputs.where -like "*cr40f_email*"
if ($temOcorrencias -and -not $gravaPax -and -not $paxJsonConcat -and $temFalhas -and $temIdentificacao -and $temSolicitante -and $temEmail -and $temSoMudou -and $temClienteFiltro) {
  Write-Output "${Ambiente}: '$flowName' já está no formato final (ocorrências, passageiros sem json(concat), e-mail com as falhas, cadastro só da Tenaris, solicitante = responsável, passageiro reconhecido pelo e-mail, update só quando muda); nada a alterar."
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

# Identificação do passageiro (18/08/2026: Maria Gabrielly Silva e Vitoria Maria Coelho Pereira criadas em dobro):
#   - a busca olhava o cadastro de todos os clientes e o update grava Cliente = Tenaris, então um homônimo de outro
#     cliente mudava de dono; passa a ler só o cadastro da Tenaris (688 em 11/2026; o List rows sem paginação para em
#     5.000 e a licença do dono do flow não aceita paginação acima disso);
#   - a mesma pessoa com GUIDs diferentes (ou com e sem GUID) passava duas vezes pelo dedup e, como a lista é lida
#     antes do loop, era criada duas vezes; o dedup passa a barrar também o nome já visto (sem maiúsculas/espaços);
#   - o vínculo do serviço procura a pessoa pelo GUID ou pelo nome, já que o GUID repetido não entra no mapa.
if (-not $temIdentificacao) {
  $nome = { param($x) "toLower(trim(coalesce($x, '')))" }
  $listaBD.inputs.parameters | Add-Member -NotePropertyName '$filter' -NotePropertyValue "_cr40f_cliente_value eq @{first(body('Filter_array_Tenaris'))?['cr40f_clientes1id']}"
  $loop.Filter_BDLocal.inputs.where = "@equals($(& $nome "item()?['cr40f_nomedopassageiro']"), $(& $nome "items('Loop_UpsertBD')?['nome']"))"
  $nomeDedup = & $nome "items('Loop_Dedup')?['nome']"
  $condUnico.expression.and[0].equals[0] = "@and(or(empty(trim(coalesce(items('Loop_Dedup')?['nome'], ''))), not(contains(variables('varNomesVistos'), $nomeDedup))), or(empty(items('Loop_Dedup')?['guid']), not(contains(variables('varGUIDsVistos'), items('Loop_Dedup')?['guid']))))"
  $condUnico.actions.Append_to_array_variable_varNomesVistos.inputs.value = "@$nomeDedup"
  $mesmoNome = "equals($(& $nome "item()?['guidNome']"), $(& $nome "items('Loop_Create_Pax')?['nome']"))"
  $criaPax.actions.Filter_FindGUID.inputs.where = "@or(equals(item()?['guidTenaris'], items('Loop_Create_Pax')?['guid']), $mesmoNome)"
  $criaPax.else.actions.Filter_FindGUID_PorNome.inputs.where = "@$mesmoNome"
  Write-Output '  List_rows_BancodeDados_Completo: só cliente Tenaris; Filter_BDLocal, Condition_unico e Filter_FindGUID*: nome sem maiúsculas/espaços'
} else { Write-Output '  Identificação: cadastro já filtrado pela Tenaris; sem mudança.' }

# Solicitante do serviço: era o passageiro 1 (first(Filter_PaxValidos)); passa a ser o Responsável da linha, pelo GUID
# Tenaris ou pelo nome sem maiúsculas/espaços. Linha sem Responsável continua com o passageiro 1.
if (-not $temSolicitante) {
  $norm = { param($x) "toLower(trim(coalesce($x, '')))" }
  $respGuid = "trim(coalesce(items('Loop_Servicos')?['Responsável - GUID'], ''))"
  $respNome = & $norm "items('Loop_Servicos')?['Responsável - Nome']"
  $guidNome = & $norm "item()?['guidNome']"
  $pax1 = "if(empty(body('Filter_PaxValidos')), false, equals($guidNome, $(& $norm "first(body('Filter_PaxValidos'))?['nome']")))"
  $solicitante.inputs.where = "@if(and(empty($respGuid), empty($respNome)), $pax1, or(and(not(empty($respGuid)), equals(item()?['guidTenaris'], $respGuid)), and(not(empty($respNome)), equals($guidNome, $respNome))))"
  Write-Output '  Filter_array_Solicitante_First: Responsável da linha (GUID ou nome); sem Responsável, passageiro 1'
} else { Write-Output '  Solicitante: já é o Responsável; sem mudança.' }

# Mesma pessoa com o nome escrito de outro jeito ("Rodrigo G. Lucca" e "Rodrigo Galves de Lucca") virava cadastro novo:
# Filter_BDLocal passa a achar também pelo e-mail (consolidado em Compose_Email). O Update mantém o nome do cadastro,
# para os dois jeitos não se alternarem, e o mapa guarda o nome do lote, que é o que o vínculo e o solicitante procuram.
if (-not $temEmail) {
  $norm = { param($x) "toLower(trim(coalesce($x, '')))" }
  $mesmoNome = "equals($(& $norm "item()?['cr40f_nomedopassageiro']"), $(& $norm "items('Loop_UpsertBD')?['nome']"))"
  $loop.Filter_BDLocal.inputs.where = "@or($mesmoNome, and(not(empty(outputs('Compose_Email'))), equals($(& $norm "item()?['cr40f_email']"), toLower(outputs('Compose_Email')))))"
  $update.'item/cr40f_nomedopassageiro' = "@coalesce(first(body('Filter_BDLocal'))?['cr40f_nomedopassageiro'], items('Loop_UpsertBD')?['nome'])"
  $mapaUpdate.inputs.value.guidNome = "@{items('Loop_UpsertBD')?['nome']}"
  Write-Output '  Filter_BDLocal: nome ou e-mail; Update_BD_Existente mantém o nome do cadastro; varGUIDMap guarda o nome do lote'
} else { Write-Output '  Reconhecimento por e-mail: já aplicado; sem mudança.' }

# Desempenho: o Loop_UpsertBD (sequencial) regravava todo passageiro já cadastrado a cada sync. Update_BD_Existente
# passa a rodar só quando o que ele gravaria difere do cadastro (telefone, e-mail, departamento preenchidos no lote,
# classificação ou nome vazio); o mapa usa o id do Filter_BDLocal, que existe com ou sem update.
if (-not $temSoMudou) {
  $bd = "first(body('Filter_BDLocal'))"
  $difere = foreach ($c in @(@('Telefone', 'cr40f_telefone'), @('Email', 'cr40f_email'), @('Departamento', 'cr40f_departamento'))) {
    "and(not(empty(outputs('Compose_$($c[0])'))), not(equals(outputs('Compose_$($c[0])'), coalesce(${bd}?['$($c[1])'], ''))))"
  }
  $mudou = "@or($($difere -join ', '), not(equals(${bd}?['cr40f_classificacao'], 202410000)), empty(coalesce(${bd}?['cr40f_nomedopassageiro'], '')))"
  $updAcao = $elseBD.Update_BD_Existente
  $elseBD.PSObject.Properties.Remove('Update_BD_Existente')
  $elseBD | Add-Member -NotePropertyName Condition_BD_Mudou -NotePropertyValue ([pscustomobject]@{
      type = 'If'; expression = $mudou; runAfter = [pscustomobject]@{}
      actions = [pscustomobject]@{ Update_BD_Existente = $updAcao }; else = [pscustomobject]@{ actions = [pscustomobject]@{} } })
  $mapaUpdate.runAfter = After 'Condition_BD_Mudou'
  $mapaUpdate.inputs.value.guidNativo = "@{${bd}?['cr40f_bancodedadosid']}"
  $selBD = $listaBD.inputs.parameters
  if ($selBD.'$select' -notlike '*cr40f_classificacao*') { $selBD.'$select' += ',cr40f_classificacao' }
  Write-Output '  Loop_UpsertBD: Update_BD_Existente só quando muda (Condition_BD_Mudou); varGUIDMap usa o id do Filter_BDLocal; $select + cr40f_classificacao'
} else { Write-Output '  Update só quando muda: já aplicado; sem mudança.' }

# Desempenho: List_rows_Cliente lia a tabela inteira de clientes, com todas as colunas, para achar a Tenaris.
if (-not $temClienteFiltro) {
  $listaCliente.inputs.parameters | Add-Member -NotePropertyName '$select' -NotePropertyValue 'cr40f_clientes1id,cr40f_nomedocliente' -Force
  $listaCliente.inputs.parameters | Add-Member -NotePropertyName '$filter' -NotePropertyValue "contains(cr40f_nomedocliente,'Tenaris')"
  Write-Output "  List_rows_Cliente: `$filter contains(cr40f_nomedocliente,'Tenaris') e `$select do id e do nome"
} else { Write-Output '  List_rows_Cliente: já filtrado; sem mudança.' }

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
  @(($conf.clientdata | ConvertFrom-Json).properties.definition.actions.Scope.actions.Scope_1_1.actions.PSObject.Properties.Name) -notcontains 'Select_Falhas' -or
  @($condSalvo.List_rows_BancodeDados_Completo.inputs.parameters.PSObject.Properties.Name) -notcontains '$filter' -or
  $condSalvo.Loop_Servicos.actions.Filter_array_Solicitante_First.inputs.where -notlike "*Responsável - Nome*" -or
  $condSalvo.Loop_UpsertBD.actions.Filter_BDLocal.inputs.where -notlike "*cr40f_email*" -or
  -not $condSalvo.Loop_UpsertBD.actions.Condition_nome_nao_existe_ainda.else.actions.Condition_BD_Mudou -or
  @($condSalvo.List_rows_Cliente.inputs.parameters.PSObject.Properties.Name) -notcontains '$filter') {
  throw 'A gravação não persistiu: Filter_Ocorrencias, Compose_PaxDoServico em array, Select_Falhas, filtro da Tenaris, solicitante pelo Responsável, busca por e-mail, Condition_BD_Mudou ou filtro do List_rows_Cliente ausente, ou Upsert_Geral ainda grava o campo de passageiros.'
}
Write-Output "${Ambiente}: '$flowName' atualizado (statecode $($conf.statecode))."
