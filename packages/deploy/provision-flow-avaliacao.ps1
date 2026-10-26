# Somente DEV. Cria (ou atualiza) o flow HTTP "Link | Registrar avaliação" e a variável de ambiente
# new_URLFlowRegistrarAvaliacao, na solução AppBetinhos. Chamado pelo Worker do link de acompanhamento quando o cliente
# avalia o serviço. O Worker não conhece os ids da reserva: manda só
#   { linkId, titulo (ex. "Embarque OS-1951"), nota (1-5), comentario, classificacao, avaliadoEm }
# com classificacao "elogio" | "sugestao" | "reclamacao" | "sem_comentario". O flow:
#   - valida a entrada (linkId com 12 ou 64 caracteres, nota 1-5, classificação conhecida) e responde 400 se inválida;
#   - idempotência: já existe cr40f_avaliacaoservico com o mesmo cr40f_linkid → 200 { ok, duplicada: true } sem criar nada.
#     Dois envios simultâneos: a chave alternativa cr40f_linkidunico recusa o segundo POST e o flow responde duplicada;
#   - acha a reserva por new_linkacompanhamento terminando em "/<linkId>" e pega dela cr40f_id (OS), o motorista
#     (_cr40f_motorista_value) e o veículo (new_veiculoreal, "Veículo utilizado no serviço", senão cr40f_veiculo).
#     Sem reserva, a avaliação nasce sem lookups e com o título no nome;
#   - cria cr40f_avaliacaoservico ("OS-1951 · nota 5") e liga reserva/motorista/veículo quando houver;
#   - sugestao com comentário → cr40f_boasideias (status Nova) ligada na avaliação;
#   - reclamacao com comentário → cr40f_errooperacional (Atendimento ao passageiro, Média, origem Passageiro/Cliente,
#     status Novo, lookups da reserva) ligado na avaliação;
#   - elogio → e-mail à operação; nota ≤ 2 sem comentário → e-mail à operação (não cria Erro Operacional);
#   - responde 200 { ok: true, avaliacaoId }; erro → 500 { ok: false, erro }.
# Comentário e título vêm do cliente: no e-mail entram com &, <, > e " escapados.
# E-mail pelo Office 365 Outlook da conexão do noreply (mesmas connection references do provision-flow-termo-multa.ps1).
# A URL do gatilho (com sig) é segredo: vai só para a variável de ambiente, nunca para o log.
# Antes de alterar um flow existente, salva o clientdata em packages/deploy/flows/backup/. Para reverter:
#   powershell -File packages/deploy/provision-flow-avaliacao.ps1 -Restaurar <arquivo de backup>
# Para conferir sem gravar (sintaxe, BOM, definição, metadata e conexões; checkFlowErrors se o flow já existir):
#   powershell -File packages/deploy/provision-flow-avaliacao.ps1 -SomenteValidar
# Pré-requisito para gravar: provision-avaliacao-schema.ps1 rodado. Requer `az login` com acesso ao DEV e ao Power Automate.
# Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos). Idempotente.
param(
  [switch] $SomenteValidar,
  [string] $Restaurar = '',
  # Caixa que recebe elogios e notas baixas. Não fica no repositório: -EmailOperacao ou a variável BETINHOS_EMAIL_OPERACAO.
  [string] $EmailOperacao = $env:BETINHOS_EMAIL_OPERACAO,
  [string] $ReferenciaDataverse = 'new_sharedcommondataserviceforapps_5696d',
  [string] $ReferenciaOutlook = 'new_sharedoffice365_f87d5'
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$environmentId = '25a2ab78-cf07-ee41-a124-457aa2c29aea'
$solutionName = 'AppBetinhos'
$flowName = 'Link | Registrar avaliação'
$envVarName = 'new_URLFlowRegistrarAvaliacao'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
if (-not $Restaurar -and $EmailOperacao -notmatch '^[^@\s]+@[^@\s]+$') { throw 'Informe o e-mail da operação: -EmailOperacao <email> ou a variável BETINHOS_EMAIL_OPERACAO.' }
function Write-Step([string] $m) { Write-Host "[flow-avaliacao] $m" }

# Autoconferência do arquivo: sem erro de sintaxe e com BOM.
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref] $null, [ref] $erros) | Out-Null
if ($erros) { throw "Erros de sintaxe em ${PSCommandPath}: $($erros | ForEach-Object { $_.Message })" }
$inicio = [IO.File]::ReadAllBytes($PSCommandPath)[0..2]
if ($inicio[0] -ne 0xEF -or $inicio[1] -ne 0xBB -or $inicio[2] -ne 0xBF) { throw "$PSCommandPath sem BOM UTF-8." }
Write-Step 'arquivo: Parser::ParseFile sem erros e BOM UTF-8 presente'

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$baseHeaders = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
# $SemSolucao: o valor da variável de ambiente (tipo 381) nunca entra na solução; cada ambiente mantém o seu.
function Dv([string] $Method, [string] $Path, $Body = $null, [switch] $SemSolucao) {
  if ($SomenteValidar -and $Method -ne 'GET') { throw "Modo -SomenteValidar tentou gravar ($Method $($Path.Split('?')[0]))." }
  Write-Host "[flow-avaliacao] $Method $($Path.Split('?')[0])"
  $h = $baseHeaders.Clone(); if (-not $SemSolucao) { $h['MSCRM.SolutionUniqueName'] = $solutionName }
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $h; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Rows([string] $Path) { return @((Dv GET $Path).value) }
function AssertSemMojibake([string] $s, [string] $origem) {
  if ($s -cmatch 'Ã|Â|â€') { throw "Texto com acentuação corrompida em ${origem}; nada foi gravado." }
}
function Backup($row) {
  if ($row.clientdata -match 'sig=') { throw 'O clientdata contém URL assinada (sig=); revise antes de continuar.' }
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  $stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
  $file = Join-Path $backupDir ("Link-Registrar-avaliacao-$stamp.json")
  if (Test-Path $file) { throw "Backup $file já existe; rode de novo em instantes." }
  [IO.File]::WriteAllText($file, $row.clientdata, (New-Object Text.UTF8Encoding $false))
  Write-Step "backup: $file"
}
function Apply($row, [string] $clientData, [string] $description) {
  AssertSemMojibake $clientData 'clientdata a gravar'
  $id = $row.workflowid
  if ($row.statecode -eq 1) { Dv PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  # Mesmo que a gravação falhe, o flow volta a ficar ativo (com a definição anterior) e o erro sobe.
  try { Dv PATCH "workflows($id)" @{ clientdata = $clientData; description = $description } | Out-Null }
  finally {
    Dv PATCH "workflows($id)" @{ statecode = 1 } | Out-Null
    if ((Dv GET "workflows($id)?`$select=statecode").statecode -ne 1) { throw 'Flow não reativou. Restaure com -Restaurar.' }
  }
}
function GetFlows { return Rows "workflows?`$select=workflowid,statecode,clientdata,description,resourceid&`$filter=name eq '$flowName' and category eq 5" }

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @(Rows "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'")
if ($solution.Count -ne 1) { throw "Solução $solutionName ausente ou ambígua." }
$solutionId = $solution[0].solutionid

if ($Restaurar) {
  if ($SomenteValidar) { throw '-Restaurar e -SomenteValidar não combinam.' }
  $text = [IO.File]::ReadAllText((Resolve-Path $Restaurar), [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
  if (-not ($text | ConvertFrom-Json).properties.definition.triggers.manual.inputs.schema.properties.linkId) { throw 'O arquivo não é um backup deste flow.' }
  $rows = @(GetFlows)
  if ($rows.Count -ne 1) { throw "Flow '$flowName' ausente ou duplicado no DEV." }
  Backup $rows[0]
  Apply $rows[0] $text $rows[0].description
  Write-Output "DEV: '$flowName' restaurado de $Restaurar e ativo."
  return
}

# ---------- Metadata (lida, não suposta) ----------
function Entidade([string] $logical) {
  $r = @(Rows "EntityDefinitions?`$select=EntitySetName&`$filter=LogicalName eq '$logical'")
  if ($r.Count -ne 1) { return $null }
  return $r[0].EntitySetName
}
function Atributos([string] $entidade) { return Rows "EntityDefinitions(LogicalName='$entidade')/Attributes?`$select=LogicalName,RequiredLevel,IsValidForCreate,AttributeOf" }
function ExigeAtributos([string] $entidade, [string[]] $nomes) {
  $tem = @((Atributos $entidade) | ForEach-Object { $_.LogicalName })
  $faltam = @($nomes | Where-Object { $tem -notcontains $_ })
  if ($faltam.Count) { throw "$entidade sem as colunas: $($faltam -join ', ')." }
}
# Nome de navegação de um lookup (o que vai antes de @odata.bind no conector).
function Nav([string] $entidade, [string] $lookup, [string] $alvo) {
  $r = @(Rows "EntityDefinitions(LogicalName='$entidade')/ManyToOneRelationships?`$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity" | Where-Object { $_.ReferencingAttribute -eq $lookup })
  if ($r.Count -ne 1) { return $null }
  if ($r[0].ReferencedEntity -ne $alvo) { throw "$entidade.$lookup aponta para $($r[0].ReferencedEntity), não para $alvo." }
  return $r[0].ReferencingEntityNavigationPropertyName
}
function ExigeOpcao([string] $entidade, [string] $coluna, [int] $valor, [string] $rotulo) {
  $ops = (Dv GET "EntityDefinitions(LogicalName='$entidade')/Attributes(LogicalName='$coluna')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)").OptionSet.Options
  $o = @($ops | Where-Object { $_.Value -eq $valor })
  if ($o.Count -ne 1 -or $o[0].Label.UserLocalizedLabel.Label -ne $rotulo) { throw "$entidade.$coluna sem $valor = '$rotulo'." }
}

$setReserva = Entidade 'cr40f_reservadeveculos'
$setBoas = Entidade 'cr40f_boasideias'
$setErro = Entidade 'cr40f_errooperacional'
$setFunc = Entidade 'cr40f_funcionarios'
$setVeic = Entidade 'cr40f_veiculos'
if (-not ($setReserva -and $setBoas -and $setErro -and $setFunc -and $setVeic)) { throw 'Tabela referenciada ausente no DEV (reserva, boas ideias, erro operacional, funcionários ou veículos).' }
ExigeAtributos 'cr40f_reservadeveculos' @('cr40f_id', 'new_linkacompanhamento', 'cr40f_motorista', 'cr40f_veiculo', 'new_veiculoreal')
if (-not (Nav 'cr40f_reservadeveculos' 'cr40f_motorista' 'cr40f_funcionarios') -or -not (Nav 'cr40f_reservadeveculos' 'cr40f_veiculo' 'cr40f_veiculos') -or -not (Nav 'cr40f_reservadeveculos' 'new_veiculoreal' 'cr40f_veiculos')) { throw 'Lookups de motorista/veículo da reserva não encontrados.' }
ExigeAtributos 'cr40f_boasideias' @('cr40f_name', 'cr40f_detalhes', 'cr40f_status')
ExigeOpcao 'cr40f_boasideias' 'cr40f_status' 100000000 'Nova'
ExigeOpcao 'cr40f_errooperacional' 'cr40f_categoria' 100000004 'Atendimento ao passageiro'
ExigeOpcao 'cr40f_errooperacional' 'cr40f_gravidade' 100000001 'Média'
ExigeOpcao 'cr40f_errooperacional' 'cr40f_origem' 100000002 'Passageiro/Cliente'
ExigeOpcao 'cr40f_errooperacional' 'cr40f_status' 100000000 'Novo'
# Toda coluna obrigatória do Erro Operacional precisa vir do flow.
$preenchidasErro = @('cr40f_titulo', 'cr40f_descricao', 'cr40f_categoria', 'cr40f_gravidade', 'cr40f_origem', 'cr40f_status', 'cr40f_dataocorrencia')
$obrigatorias = @((Atributos 'cr40f_errooperacional') | Where-Object { $_.IsValidForCreate -and $_.RequiredLevel.Value -in 'ApplicationRequired', 'SystemRequired' -and -not $_.AttributeOf -and $_.LogicalName -notin 'ownerid', 'owneridtype', 'cr40f_errooperacionalid' } | ForEach-Object { $_.LogicalName })
$semValor = @($obrigatorias | Where-Object { $preenchidasErro -notcontains $_ })
if ($semValor.Count) { throw "cr40f_errooperacional exige colunas que o flow não preenche: $($semValor -join ', ')." }
$navErroReserva = Nav 'cr40f_errooperacional' 'cr40f_reserva' 'cr40f_reservadeveculos'
$navErroMotorista = Nav 'cr40f_errooperacional' 'cr40f_motorista' 'cr40f_funcionarios'
$navErroVeiculo = Nav 'cr40f_errooperacional' 'cr40f_veiculo' 'cr40f_veiculos'
if (-not ($navErroReserva -and $navErroMotorista -and $navErroVeiculo)) { throw 'Lookups reserva/motorista/veículo do Erro Operacional não encontrados.' }
Write-Step "metadata conferida: reserva ($setReserva), boas ideias ($setBoas), erro operacional ($setErro; obrigatórias $($obrigatorias -join ', '))"

$setAval = Entidade 'cr40f_avaliacaoservico'
if ($setAval) {
  ExigeAtributos 'cr40f_avaliacaoservico' @('cr40f_name', 'cr40f_nota', 'cr40f_comentario', 'cr40f_classificacao', 'cr40f_linkid', 'cr40f_avaliadoem')
  $navA = @{
    reserva = Nav 'cr40f_avaliacaoservico' 'cr40f_reserva' 'cr40f_reservadeveculos'; motorista = Nav 'cr40f_avaliacaoservico' 'cr40f_motorista' 'cr40f_funcionarios'
    veiculo = Nav 'cr40f_avaliacaoservico' 'cr40f_veiculo' 'cr40f_veiculos'; boaideia = Nav 'cr40f_avaliacaoservico' 'cr40f_boaideia' 'cr40f_boasideias'
    erro = Nav 'cr40f_avaliacaoservico' 'cr40f_errooperacional' 'cr40f_errooperacional'
  }
  $semNav = @($navA.Keys | Where-Object { -not $navA[$_] })
  if ($semNav.Count) { throw "cr40f_avaliacaoservico sem os lookups: $($semNav -join ', '). Rode provision-avaliacao-schema.ps1." }
  ExigeOpcao 'cr40f_avaliacaoservico' 'cr40f_classificacao' 100000002 'Reclamação'
}
elseif ($SomenteValidar) {
  # Tabela ainda não criada: valida com os nomes que provision-avaliacao-schema.ps1 cria (o flow real só é montado depois dela).
  Write-Step 'AVISO: cr40f_avaliacaoservico ainda não existe; validando com os nomes previstos (rode provision-avaliacao-schema.ps1 antes de gravar).'
  $setAval = 'cr40f_avaliacaoservicos'
  $navA = @{ reserva = 'cr40f_Reserva'; motorista = 'cr40f_Motorista'; veiculo = 'cr40f_Veiculo'; boaideia = 'cr40f_BoaIdeia'; erro = 'cr40f_ErroOperacional' }
}
else { throw 'Tabela cr40f_avaliacaoservico ausente no DEV. Rode provision-avaliacao-schema.ps1 antes.' }

$refs = @(Rows "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0")
foreach ($par in @(@($ReferenciaDataverse, 'shared_commondataserviceforapps'), @($ReferenciaOutlook, 'shared_office365'))) {
  if (@($refs | Where-Object { $_.connectionreferencelogicalname -eq $par[0] -and $_.connectorid -like "*/$($par[1])" }).Count -ne 1) {
    throw "Connection reference '$($par[0])' ($($par[1])) não encontrada."
  }
}
Write-Step "connection references: $ReferenciaDataverse, $ReferenciaOutlook"

# ---------- Definição ----------
$definitionText = @'
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" }
  },
  "triggers": {
    "manual": {
      "type": "Request", "kind": "Http",
      "inputs": {
        "triggerAuthenticationType": "All",
        "schema": {
          "type": "object",
          "properties": {
            "linkId": { "type": "string" }, "titulo": { "type": "string" }, "nota": { "type": "integer" },
            "comentario": { "type": "string" }, "classificacao": { "type": "string" }, "avaliadoEm": { "type": "string" }
          },
          "required": ["linkId", "nota", "classificacao"]
        }
      }
    }
  },
  "actions": {
    "Registrar": {
      "type": "Scope", "runAfter": {},
      "actions": {
        "Entrada": {
          "type": "Compose", "runAfter": {},
          "inputs": {
            "linkId": "@{trim(coalesce(triggerBody()?['linkId'], ''))}",
            "titulo": "@{take(trim(coalesce(triggerBody()?['titulo'], '')), 150)}",
            "nota": "@if(equals(triggerBody()?['nota'], null), 0, int(triggerBody()?['nota']))",
            "comentario": "@{take(trim(coalesce(triggerBody()?['comentario'], '')), 4000)}",
            "classificacao": "@{toLower(trim(coalesce(triggerBody()?['classificacao'], '')))}",
            "avaliadoEm": "@{if(empty(trim(coalesce(triggerBody()?['avaliadoEm'], ''))), utcNow(), trim(triggerBody()?['avaliadoEm']))}"
          }
        },
        "Mapa_classificacao": {
          "type": "Compose", "runAfter": { "Entrada": ["Succeeded"] },
          "inputs": { "elogio": 100000000, "sugestao": 100000001, "reclamacao": 100000002, "sem_comentario": 100000003 }
        },
        "Invalida": {
          "type": "If", "runAfter": { "Mapa_classificacao": ["Succeeded"] },
          "expression": { "or": [
            { "not": { "or": [ { "equals": [ "@length(outputs('Entrada')?['linkId'])", 12 ] }, { "equals": [ "@length(outputs('Entrada')?['linkId'])", 64 ] } ] } },
            { "contains": [ "@outputs('Entrada')?['linkId']", "'" ] },
            { "contains": [ "@outputs('Entrada')?['linkId']", "/" ] },
            { "less": [ "@outputs('Entrada')?['nota']", 1 ] },
            { "greater": [ "@outputs('Entrada')?['nota']", 5 ] },
            { "equals": [ "@empty(string(coalesce(outputs('Mapa_classificacao')?[outputs('Entrada')?['classificacao']], '')))", true ] }
          ] },
          "actions": {
            "Resposta_400": {
              "type": "Response", "kind": "Http", "runAfter": {},
              "inputs": { "statusCode": 400, "headers": { "Content-Type": "application/json" }, "body": { "ok": false, "erro": "Avaliação inválida." } }
            },
            "Fim_400": { "type": "Terminate", "runAfter": { "Resposta_400": ["Succeeded"] }, "inputs": { "runStatus": "Succeeded" } }
          },
          "else": { "actions": {} }
        },
        "Existente": {
          "type": "OpenApiConnection", "runAfter": { "Invalida": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": { "entityName": "__SET_AVAL__", "$select": "cr40f_avaliacaoservicoid", "$filter": "cr40f_linkid eq '@{outputs('Entrada')?['linkId']}'", "$top": 1 },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Duplicada": {
          "type": "If", "runAfter": { "Existente": ["Succeeded"] },
          "expression": { "and": [ { "greater": [ "@length(body('Existente')?['value'])", 0 ] } ] },
          "actions": {
            "Resposta_duplicada": {
              "type": "Response", "kind": "Http", "runAfter": {},
              "inputs": { "statusCode": 200, "headers": { "Content-Type": "application/json" }, "body": { "ok": true, "duplicada": true, "avaliacaoId": "@{first(body('Existente')?['value'])?['cr40f_avaliacaoservicoid']}" } }
            },
            "Fim_duplicada": { "type": "Terminate", "runAfter": { "Resposta_duplicada": ["Succeeded"] }, "inputs": { "runStatus": "Succeeded" } }
          },
          "else": { "actions": {} }
        },
        "Reserva": {
          "type": "OpenApiConnection", "runAfter": { "Duplicada": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": {
              "entityName": "__SET_RESERVA__",
              "$select": "cr40f_reservadeveculosid,cr40f_id,_cr40f_motorista_value,_cr40f_veiculo_value,_new_veiculoreal_value",
              "$filter": "endswith(new_linkacompanhamento, '/@{outputs('Entrada')?['linkId']}')",
              "$top": 1
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Dados": {
          "type": "Compose", "runAfter": { "Reserva": ["Succeeded"] },
          "inputs": {
            "reservaId": "@{coalesce(first(body('Reserva')?['value'])?['cr40f_reservadeveculosid'], '')}",
            "motoristaId": "@{coalesce(first(body('Reserva')?['value'])?['_cr40f_motorista_value'], '')}",
            "motoristaNome": "@{coalesce(first(body('Reserva')?['value'])?['_cr40f_motorista_value@OData.Community.Display.V1.FormattedValue'], 'não informado')}",
            "veiculoId": "@{coalesce(first(body('Reserva')?['value'])?['_new_veiculoreal_value'], first(body('Reserva')?['value'])?['_cr40f_veiculo_value'], '')}",
            "os": "@{coalesce(first(body('Reserva')?['value'])?['cr40f_id'], if(empty(outputs('Entrada')?['titulo']), 'Serviço sem OS', outputs('Entrada')?['titulo']))}"
          }
        },
        "Html": {
          "type": "Compose", "runAfter": { "Dados": ["Succeeded"] },
          "inputs": {
            "comentario": "@{replace(replace(replace(replace(outputs('Entrada')?['comentario'], '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\"', '&quot;')}",
            "os": "@{replace(replace(replace(replace(outputs('Dados')?['os'], '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\"', '&quot;')}",
            "motorista": "@{replace(replace(replace(replace(outputs('Dados')?['motoristaNome'], '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '\"', '&quot;')}",
            "detalhe": "@{concat(if(empty(outputs('Entrada')?['comentario']), '(sem comentário)', outputs('Entrada')?['comentario']), decodeUriComponent('%0A%0A'), 'Nota do cliente: ', string(outputs('Entrada')?['nota']), '/5', decodeUriComponent('%0A'), 'Avaliado em: ', outputs('Entrada')?['avaliadoEm'], decodeUriComponent('%0A'), 'Link: ', outputs('Entrada')?['linkId'])}"
          }
        },
        "Criar_avaliacao": {
          "type": "OpenApiConnection", "runAfter": { "Html": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
            "parameters": {
              "entityName": "__SET_AVAL__",
              "item/cr40f_name": "@{take(concat(outputs('Dados')?['os'], ' · nota ', string(outputs('Entrada')?['nota'])), 200)}",
              "item/cr40f_nota": "@outputs('Entrada')?['nota']",
              "item/cr40f_comentario": "@{outputs('Entrada')?['comentario']}",
              "item/cr40f_classificacao": "@outputs('Mapa_classificacao')?[outputs('Entrada')?['classificacao']]",
              "item/cr40f_linkid": "@{outputs('Entrada')?['linkId']}",
              "item/cr40f_avaliadoem": "@{outputs('Entrada')?['avaliadoEm']}"
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Concorrente": {
          "type": "OpenApiConnection", "runAfter": { "Criar_avaliacao": ["Failed"] },
          "inputs": {
            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
            "parameters": { "entityName": "__SET_AVAL__", "$select": "cr40f_avaliacaoservicoid", "$filter": "cr40f_linkid eq '@{outputs('Entrada')?['linkId']}'", "$top": 1 },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Duplicada_concorrente": {
          "type": "If", "runAfter": { "Concorrente": ["Succeeded"] },
          "expression": { "and": [ { "greater": [ "@length(body('Concorrente')?['value'])", 0 ] } ] },
          "actions": {
            "Resposta_concorrente": {
              "type": "Response", "kind": "Http", "runAfter": {},
              "inputs": { "statusCode": 200, "headers": { "Content-Type": "application/json" }, "body": { "ok": true, "duplicada": true, "avaliacaoId": "@{first(body('Concorrente')?['value'])?['cr40f_avaliacaoservicoid']}" } }
            },
            "Fim_concorrente": { "type": "Terminate", "runAfter": { "Resposta_concorrente": ["Succeeded"] }, "inputs": { "runStatus": "Succeeded" } }
          },
          "else": { "actions": {
            "Resposta_falha_criar": {
              "type": "Response", "kind": "Http", "runAfter": {},
              "inputs": { "statusCode": 500, "headers": { "Content-Type": "application/json" }, "body": { "ok": false, "erro": "Não foi possível registrar a avaliação." } }
            },
            "Fim_falha_criar": { "type": "Terminate", "runAfter": { "Resposta_falha_criar": ["Succeeded"] }, "inputs": { "runStatus": "Failed", "runError": { "code": "CriarAvaliacao", "message": "CreateRecord da avaliação falhou e não há avaliação com o mesmo cr40f_linkid." } } }
          } }
        },
        "AvaliacaoId": {
          "type": "Compose", "runAfter": { "Criar_avaliacao": ["Succeeded"] },
          "inputs": "@body('Criar_avaliacao')?['cr40f_avaliacaoservicoid']"
        },
        "Ligar_reserva": {
          "type": "If", "runAfter": { "AvaliacaoId": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['reservaId']", "" ] } } ] },
          "actions": {
            "Avaliacao_reserva": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                "parameters": { "entityName": "__SET_AVAL__", "recordId": "@outputs('AvaliacaoId')", "item/__NAV_A_RESERVA__@odata.bind": "@concat('/__SET_RESERVA__(', outputs('Dados')?['reservaId'], ')')" },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "else": { "actions": {} }
        },
        "Ligar_motorista": {
          "type": "If", "runAfter": { "Ligar_reserva": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['motoristaId']", "" ] } } ] },
          "actions": {
            "Avaliacao_motorista": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                "parameters": { "entityName": "__SET_AVAL__", "recordId": "@outputs('AvaliacaoId')", "item/__NAV_A_MOTORISTA__@odata.bind": "@concat('/__SET_FUNC__(', outputs('Dados')?['motoristaId'], ')')" },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "else": { "actions": {} }
        },
        "Ligar_veiculo": {
          "type": "If", "runAfter": { "Ligar_motorista": ["Succeeded"] },
          "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['veiculoId']", "" ] } } ] },
          "actions": {
            "Avaliacao_veiculo": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                "parameters": { "entityName": "__SET_AVAL__", "recordId": "@outputs('AvaliacaoId')", "item/__NAV_A_VEICULO__@odata.bind": "@concat('/__SET_VEIC__(', outputs('Dados')?['veiculoId'], ')')" },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "else": { "actions": {} }
        },
        "Por_classificacao": {
          "type": "Switch", "runAfter": { "Ligar_veiculo": ["Succeeded"] },
          "expression": "@outputs('Entrada')?['classificacao']",
          "cases": {
            "Sugestao": {
              "case": "sugestao",
              "actions": {
                "Sugestao_com_texto": {
                  "type": "If", "runAfter": {},
                  "expression": { "and": [ { "not": { "equals": [ "@outputs('Entrada')?['comentario']", "" ] } } ] },
                  "actions": {
                    "Criar_boa_ideia": {
                      "type": "OpenApiConnection", "runAfter": {},
                      "inputs": {
                        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
                        "parameters": {
                          "entityName": "__SET_BOAS__",
                          "item/cr40f_name": "@{take(concat('Sugestão de cliente · ', outputs('Dados')?['os']), 200)}",
                          "item/cr40f_detalhes": "@{outputs('Html')?['detalhe']}",
                          "item/cr40f_status": 100000000
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    },
                    "Avaliacao_boa_ideia": {
                      "type": "OpenApiConnection", "runAfter": { "Criar_boa_ideia": ["Succeeded"] },
                      "inputs": {
                        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                        "parameters": { "entityName": "__SET_AVAL__", "recordId": "@outputs('AvaliacaoId')", "item/__NAV_A_BOAIDEIA__@odata.bind": "@concat('/__SET_BOAS__(', body('Criar_boa_ideia')?['cr40f_boasideiasid'], ')')" },
                        "authentication": "@parameters('$authentication')"
                      }
                    }
                  },
                  "else": { "actions": {} }
                }
              }
            },
            "Reclamacao": {
              "case": "reclamacao",
              "actions": {
                "Reclamacao_com_texto": {
                  "type": "If", "runAfter": {},
                  "expression": { "and": [ { "not": { "equals": [ "@outputs('Entrada')?['comentario']", "" ] } } ] },
                  "actions": {
                    "Criar_erro": {
                      "type": "OpenApiConnection", "runAfter": {},
                      "inputs": {
                        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord" },
                        "parameters": {
                          "entityName": "__SET_ERRO__",
                          "item/cr40f_titulo": "@{take(concat('Reclamação de cliente · ', outputs('Dados')?['os']), 200)}",
                          "item/cr40f_descricao": "@{outputs('Html')?['detalhe']}",
                          "item/cr40f_categoria": 100000004,
                          "item/cr40f_gravidade": 100000001,
                          "item/cr40f_origem": 100000002,
                          "item/cr40f_status": 100000000,
                          "item/cr40f_dataocorrencia": "@{outputs('Entrada')?['avaliadoEm']}"
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    },
                    "Erro_reserva": {
                      "type": "If", "runAfter": { "Criar_erro": ["Succeeded"] },
                      "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['reservaId']", "" ] } } ] },
                      "actions": {
                        "Erro_ligar_reserva": {
                          "type": "OpenApiConnection", "runAfter": {},
                          "inputs": {
                            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                            "parameters": { "entityName": "__SET_ERRO__", "recordId": "@body('Criar_erro')?['cr40f_errooperacionalid']", "item/__NAV_E_RESERVA__@odata.bind": "@concat('/__SET_RESERVA__(', outputs('Dados')?['reservaId'], ')')" },
                            "authentication": "@parameters('$authentication')"
                          }
                        }
                      },
                      "else": { "actions": {} }
                    },
                    "Erro_motorista": {
                      "type": "If", "runAfter": { "Erro_reserva": ["Succeeded"] },
                      "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['motoristaId']", "" ] } } ] },
                      "actions": {
                        "Erro_ligar_motorista": {
                          "type": "OpenApiConnection", "runAfter": {},
                          "inputs": {
                            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                            "parameters": { "entityName": "__SET_ERRO__", "recordId": "@body('Criar_erro')?['cr40f_errooperacionalid']", "item/__NAV_E_MOTORISTA__@odata.bind": "@concat('/__SET_FUNC__(', outputs('Dados')?['motoristaId'], ')')" },
                            "authentication": "@parameters('$authentication')"
                          }
                        }
                      },
                      "else": { "actions": {} }
                    },
                    "Erro_veiculo": {
                      "type": "If", "runAfter": { "Erro_motorista": ["Succeeded"] },
                      "expression": { "and": [ { "not": { "equals": [ "@outputs('Dados')?['veiculoId']", "" ] } } ] },
                      "actions": {
                        "Erro_ligar_veiculo": {
                          "type": "OpenApiConnection", "runAfter": {},
                          "inputs": {
                            "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                            "parameters": { "entityName": "__SET_ERRO__", "recordId": "@body('Criar_erro')?['cr40f_errooperacionalid']", "item/__NAV_E_VEICULO__@odata.bind": "@concat('/__SET_VEIC__(', outputs('Dados')?['veiculoId'], ')')" },
                            "authentication": "@parameters('$authentication')"
                          }
                        }
                      },
                      "else": { "actions": {} }
                    },
                    "Avaliacao_erro": {
                      "type": "OpenApiConnection", "runAfter": { "Erro_veiculo": ["Succeeded"] },
                      "inputs": {
                        "host": { "apiId": "__DV__", "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord" },
                        "parameters": { "entityName": "__SET_AVAL__", "recordId": "@outputs('AvaliacaoId')", "item/__NAV_A_ERRO__@odata.bind": "@concat('/__SET_ERRO__(', body('Criar_erro')?['cr40f_errooperacionalid'], ')')" },
                        "authentication": "@parameters('$authentication')"
                      }
                    }
                  },
                  "else": { "actions": {} }
                }
              }
            },
            "Elogio": {
              "case": "elogio",
              "actions": {
                "Email_elogio": {
                  "type": "OpenApiConnection", "runAfter": {},
                  "inputs": {
                    "host": { "apiId": "__OUTLOOK__", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
                    "parameters": {
                      "emailMessage/To": "__EMAIL_OPERACAO__",
                      "emailMessage/Subject": "Elogio de cliente · @{outputs('Dados')?['os']}",
                      "emailMessage/Body": "<p>Um cliente elogiou o serviço no link de acompanhamento.</p><ul><li><b>Serviço:</b> @{outputs('Html')?['os']}</li><li><b>Nota:</b> @{outputs('Entrada')?['nota']}/5</li><li><b>Motorista:</b> @{outputs('Html')?['motorista']}</li><li><b>Comentário:</b> @{if(empty(outputs('Html')?['comentario']), '(sem comentário)', outputs('Html')?['comentario'])}</li></ul>",
                      "emailMessage/Importance": "Normal"
                    },
                    "authentication": "@parameters('$authentication')"
                  }
                }
              }
            }
          },
          "default": { "actions": {} }
        },
        "Nota_baixa_sem_comentario": {
          "type": "If", "runAfter": { "Por_classificacao": ["Succeeded"] },
          "expression": { "and": [ { "lessOrEquals": [ "@outputs('Entrada')?['nota']", 2 ] }, { "equals": [ "@outputs('Entrada')?['comentario']", "" ] } ] },
          "actions": {
            "Email_nota_baixa": {
              "type": "OpenApiConnection", "runAfter": {},
              "inputs": {
                "host": { "apiId": "__OUTLOOK__", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
                "parameters": {
                  "emailMessage/To": "__EMAIL_OPERACAO__",
                  "emailMessage/Subject": "Nota baixa sem comentário · @{outputs('Dados')?['os']}",
                  "emailMessage/Body": "<p>Um cliente deu nota baixa no link de acompanhamento e não deixou comentário. Vale um contato para entender o que houve.</p><ul><li><b>Serviço:</b> @{outputs('Html')?['os']}</li><li><b>Nota:</b> @{outputs('Entrada')?['nota']}/5</li><li><b>Motorista:</b> @{outputs('Html')?['motorista']}</li></ul>",
                  "emailMessage/Importance": "High"
                },
                "authentication": "@parameters('$authentication')"
              }
            }
          },
          "else": { "actions": {} }
        },
        "Resposta_ok": {
          "type": "Response", "kind": "Http", "runAfter": { "Nota_baixa_sem_comentario": ["Succeeded"] },
          "inputs": { "statusCode": 200, "headers": { "Content-Type": "application/json" }, "body": { "ok": true, "avaliacaoId": "@{outputs('AvaliacaoId')}" } }
        }
      }
    },
    "Falha": {
      "type": "Response", "kind": "Http", "runAfter": { "Registrar": ["Failed", "TimedOut"] },
      "inputs": { "statusCode": 500, "headers": { "Content-Type": "application/json" }, "body": { "ok": false, "erro": "Não foi possível registrar a avaliação." } }
    },
    "Fim_falha": {
      "type": "Terminate", "runAfter": { "Falha": ["Succeeded", "Failed"] },
      "inputs": { "runStatus": "Failed", "runError": { "code": "RegistrarAvaliacao", "message": "Falha ao registrar a avaliação; veja a ação com erro no escopo Registrar." } }
    }
  },
  "outputs": {}
}
'@

$tokens = [ordered]@{
  '__DV__' = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'; '__OUTLOOK__' = '/providers/Microsoft.PowerApps/apis/shared_office365'
  '__SET_AVAL__' = $setAval; '__SET_RESERVA__' = $setReserva; '__SET_BOAS__' = $setBoas; '__SET_ERRO__' = $setErro; '__SET_FUNC__' = $setFunc; '__SET_VEIC__' = $setVeic
  '__NAV_A_RESERVA__' = $navA.reserva; '__NAV_A_MOTORISTA__' = $navA.motorista; '__NAV_A_VEICULO__' = $navA.veiculo; '__NAV_A_BOAIDEIA__' = $navA.boaideia; '__NAV_A_ERRO__' = $navA.erro
  '__NAV_E_RESERVA__' = $navErroReserva; '__NAV_E_MOTORISTA__' = $navErroMotorista; '__NAV_E_VEICULO__' = $navErroVeiculo
  '__EMAIL_OPERACAO__' = $EmailOperacao
}
$raw = $definitionText
foreach ($k in $tokens.Keys) { $raw = $raw.Replace($k, [string]$tokens[$k]) }
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json
if (-not $definition.triggers.manual -or -not $definition.actions.Registrar.actions.Criar_avaliacao) { throw 'Definição do flow sem gatilho ou sem Criar_avaliacao.' }
AssertSemMojibake ($definition | ConvertTo-Json -Depth 90 -Compress) 'definição do script'
Write-Step "definição carregada como JSON ($(@($definition.actions.Registrar.actions.PSObject.Properties).Count) ações no escopo Registrar)"

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $ReferenciaOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress
$flowDescription = 'Recebe do Worker do link de acompanhamento a avaliação do cliente, grava em cr40f_avaliacaoservico (uma por link), cria Boa ideia (sugestão) ou Erro operacional (reclamação) e avisa a operação por e-mail (elogio e nota baixa sem comentário).'

$flows = @(GetFlows)
if ($flows.Count -gt 1) { throw "Flow '$flowName' duplicado no DEV." }

function FlowToken {
  $t = & az account get-access-token --resource https://service.flow.microsoft.com/ --query accessToken -o tsv
  if (-not $t) { throw 'Token do Power Automate indisponível.' }
  return $t
}

if ($SomenteValidar) {
  if ($flows.Count) {
    # checkFlowErrors do Power Automate com a definição nova sobre o flow existente (não grava).
    $flowApi = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flows[0].workflowid)"
    $ft = FlowToken
    $props = (Invoke-RestMethod -Uri "$flowApi`?api-version=2016-11-01&`$expand=properties.definition,properties.connectionreferences" -Headers @{ Authorization = "Bearer $ft" }).properties
    $props.definition = $definition
    $body = [Text.Encoding]::UTF8.GetBytes((@{ properties = $props } | ConvertTo-Json -Depth 90 -Compress))
    $r = Invoke-WebRequest -Method POST -Uri "$flowApi/checkFlowErrors?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $ft" } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
    $check = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    Write-Output "checkFlowErrors: $check"
    if ($check.Trim() -ne '[]') { throw 'A definição montada tem erros.' }
  }
  else { Write-Step "flow '$flowName' ainda não existe no DEV (checkFlowErrors roda depois de criado)" }
  $ev = @(Rows "environmentvariabledefinitions?`$select=schemaname&`$filter=schemaname eq '$envVarName'")
  Write-Step "variável $envVarName no DEV: $(if ($ev.Count) { 'existe' } else { 'ainda não existe (seria criada)' })"
  Write-Output "VALIDAR OK: nada gravado no DEV; '$flowName' $(if ($flows.Count) { 'seria atualizado se mudou' } else { 'seria criado' })."
  return
}

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

if ($flows.Count) {
  $flowId = $flows[0].workflowid
  AssertSemMojibake $flows[0].clientdata 'clientdata atual'
  # O Dataverse normaliza o clientdata; compara só definição e referências, normalizadas igual.
  $norm = { param($o) ($o | ConvertTo-Json -Depth 90 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 90 -Compress) }
  $g = $flows[0].clientdata | ConvertFrom-Json; $n = $clientData | ConvertFrom-Json
  $mudou = (& $norm $g.properties.definition) -ne (& $norm $n.properties.definition) -or (& $norm $g.properties.connectionReferences) -ne (& $norm $n.properties.connectionReferences) -or $flows[0].description -ne $flowDescription
  if ($mudou) { Backup $flows[0]; Apply $flows[0] $clientData $flowDescription }
  Write-Output "'$flowName': definição $(if ($mudou) { 'atualizada' } else { 'já igual' })."
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = $flowDescription } | Out-Null
  $flowId = @(GetFlows)[0].workflowid
  Write-Output "'$flowName': criado ($flowId)."
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=resourceid,statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }

# URL do gatilho (com sig): só para a variável de ambiente; nunca no console.
$ft = FlowToken
$callback = $null
for ($i = 1; $i -le 3 -and -not $callback; $i++) {
  try {
    $callback = (Invoke-RestMethod -Method POST -Uri "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$($flow.resourceid)/triggers/manual/listCallbackUrl?api-version=2016-11-01" -Headers @{ Authorization = "Bearer $ft" } -ContentType 'application/json' -Body '{}' -TimeoutSec 30).response.value
  } catch { if ($i -eq 3) { throw 'listCallbackUrl falhou (detalhe omitido para não expor a URL).' }; Start-Sleep -Seconds 3 }
}
if (-not $callback) { throw 'URL do gatilho indisponível.' }

$defs = @(Rows "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'")
if (-not $defs.Count) {
  Dv POST environmentvariabledefinitions @{ schemaname = $envVarName; displayname = 'URL Flow Registrar Avaliação'; type = 100000000; description = 'URL do gatilho HTTP do flow "Link | Registrar avaliação" (segredo: contém sig).' } | Out-Null
  $defs = @(Rows "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$envVarName'")
}
$defId = $defs[0].environmentvariabledefinitionid
Include $defId 380
# Valor atual NÃO entra na solução (tipo 381): sem o cabeçalho da solução; cada ambiente mantém o seu.
$vals = @(Rows "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId")
if ($vals.Count -gt 1) { throw "Variável $envVarName com valores ambíguos." }
if ($vals.Count) { Dv PATCH "environmentvariablevalues($($vals[0].environmentvariablevalueid))" @{ value = $callback } -SemSolucao | Out-Null }
else { Dv POST environmentvariablevalues @{ value = $callback; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } -SemSolucao | Out-Null }
$valor = @(Rows "environmentvariablevalues?`$select=value&`$filter=_environmentvariabledefinitionid_value eq $defId")
if ($valor.Count -ne 1 -or $valor[0].value -ne $callback) { throw "Variável $envVarName não ficou com a URL do gatilho." }
$callback = $null
Write-Output "DEV: '$flowName' ativo ($($flow.resourceid)); URL do gatilho criada e gravada em $envVarName (valor não exibido); tudo na $solutionName."
