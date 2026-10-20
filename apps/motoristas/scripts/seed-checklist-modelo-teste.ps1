param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $Nome = "Vistoria r$([char]0x00E1)pida",
  [switch] $SubstituirPadrao,
  [switch] $Apply
)

# Cadastra no DEV o modelo de checklist de teste (fotos externas + itens OK / Nao OK) e o marca como padrao da rotina quinzenal.
# Idempotente: se o modelo ja existe, so confere. Dry-run por padrao.
# -SubstituirPadrao: desmarca o modelo padrao atual (continua ativo) antes de criar o novo como padrao.
# Sem o switch, a presenca de um modelo padrao ativo continua sendo erro.
. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$api = "$baseUrl/api/data/v9.2"
$nome = $Nome
Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$token = (Get-MsalToken -PublicClientApplication $client -Scopes "$baseUrl/user_impersonation" -Silent).AccessToken
if (-not $token) { throw "Token DEV indisponivel." }
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "return=representation" }
function Read-Dv([string] $Path) { return Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers }
function Post-Dv([string] $Path, $Body) {
  $json = $Body | ConvertTo-Json -Depth 10
  return Invoke-RestMethod -Method Post -Uri "$api/$Path" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json))
}
function Patch-Dv([string] $Path, $Body) {
  $json = $Body | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Patch -Uri "$api/$Path" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json)) | Out-Null
}

$foto = 100000000; $texto = 100000002; $okNok = 100000003
$itens = @(
  @{ nome = "Frente do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Traseira do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Lateral esquerda"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "" },
  @{ nome = "Lateral direita"; tipo = $foto; obrigatorio = $true; opcoes = ""; instrucao = "" },
  @{ nome = "Pneus"; tipo = $okNok; obrigatorio = $true; opcoes = "Murcho`nCareca`nFurado`nOutro"; instrucao = "" },
  @{ nome = "Far$([char]0x00F3)is e lanternas"; tipo = $okNok; obrigatorio = $true; opcoes = "Queimado`nQuebrado`nOutro"; instrucao = "" },
  @{ nome = "Para-brisa e vidros"; tipo = $okNok; obrigatorio = $true; opcoes = "Trincado`nRiscado`nOutro"; instrucao = "" },
  @{ nome = "Luzes de alerta no painel"; tipo = $okNok; obrigatorio = $true; opcoes = "Inje$([char]0x00E7)$([char]0x00E3)o`nFreio`n$([char]0x00D3)leo`nBateria`nOutra"; instrucao = "Ligue o carro e confira se alguma luz de alerta fica acesa." },
  @{ nome = "Limpeza interna"; tipo = $okNok; obrigatorio = $true; opcoes = "Sujo`nCom lixo`nCom cheiro`nOutro"; instrucao = "" },
  @{ nome = "Limpeza externa"; tipo = $okNok; obrigatorio = $true; opcoes = "Sujo`nOutro"; instrucao = "" },
  @{ nome = "Combust$([char]0x00ED)vel acima de 1/4"; tipo = $okNok; obrigatorio = $true; opcoes = "Abaixo de 1/4`nNa reserva"; instrucao = "" },
  @{ nome = "Estepe, macaco e tri$([char]0x00E2)ngulo"; tipo = $okNok; obrigatorio = $true; opcoes = "Faltando`nEstepe murcho`nOutro"; instrucao = "" },
  @{ nome = "Documento do ve$([char]0x00ED)culo"; tipo = $okNok; obrigatorio = $true; opcoes = "Faltando`nVencido"; instrucao = "" },
  @{ nome = "Observa$([char]0x00E7)$([char]0x00F5)es"; tipo = $texto; obrigatorio = $false; opcoes = ""; instrucao = "O que mais a opera$([char]0x00E7)$([char]0x00E3)o precisa saber." }
)

function Count-Itens($ModeloId) { return @((Read-Dv "new_checklistmodeloitems?`$select=new_checklistmodeloitemid&`$filter=_new_modelo_value eq $ModeloId and statecode eq 0").value).Count }
# Troca o padrao sem deixar o DEV pior: o modelo novo so vira padrao depois de completo; se marcar o novo falhar, o antigo e restaurado.
function Promover-Padrao($NovoId, $Antigos) {
  $desmarcados = @()
  try {
    foreach ($padrao in $Antigos) {
      Patch-Dv "new_checklistmodelos($($padrao.new_checklistmodeloid))" @{ new_padraoquinzenal = $false }
      $desmarcados += $padrao
      Write-Output "Padrao anterior '$($padrao.new_name)' desmarcado (continua ativo)."
    }
    Patch-Dv "new_checklistmodelos($NovoId)" @{ new_padraoquinzenal = $true }
  } catch {
    $erro = $_
    foreach ($padrao in $desmarcados) {
      try { Patch-Dv "new_checklistmodelos($($padrao.new_checklistmodeloid))" @{ new_padraoquinzenal = $true }; Write-Output "Padrao anterior '$($padrao.new_name)' restaurado." }
      catch { Write-Warning "ATENCAO: nao foi possivel restaurar o padrao '$($padrao.new_name)' ($($padrao.new_checklistmodeloid)). Marque-o pela Gestao de Checklists." }
    }
    throw $erro
  }
}

$padroes = @((Read-Dv "new_checklistmodelos?`$select=new_checklistmodeloid,new_name&`$filter=new_padraoquinzenal eq true and new_ativo eq true and statecode eq 0").value)
$existentes = @((Read-Dv "new_checklistmodelos?`$select=new_checklistmodeloid,new_name,new_padraoquinzenal&`$filter=new_name eq '$($nome.Replace("'", "''"))'").value)
if ($existentes.Count -gt 1) { throw "Modelo '$nome' duplicado." }
if ($existentes.Count -eq 1) {
  $id = $existentes[0].new_checklistmodeloid
  $n = Count-Itens $id
  if ($n -ne $itens.Count) { throw "Modelo '$nome' incompleto: $n de $($itens.Count) itens ativos. Confira ou ajuste pela Tela Gestao de Checklists antes de repetir o seed." }
  $outros = @($padroes | Where-Object { $_.new_checklistmodeloid -ne $id })
  $jaPadrao = ($existentes[0].new_padraoquinzenal -eq $true)
  Write-Output "Modelo '$nome' ja existe ($n itens). Padroes ativos: $($padroes.Count)."
  if ($jaPadrao -or -not $SubstituirPadrao) { return }
  if (-not $Apply) {
    foreach ($padrao in $outros) { Write-Output "DRY RUN: desmarcaria o padrao atual '$($padrao.new_name)' ($($padrao.new_checklistmodeloid)); ele continuaria ativo." }
    Write-Output "DRY RUN: marcaria o modelo existente '$nome' como padrao da rotina quinzenal."
    return
  }
  Promover-Padrao $id $outros
  Write-Output "Modelo '$nome' ($id) marcado como padrao quinzenal."
  return
}
if ($padroes.Count -gt 0 -and -not $SubstituirPadrao) { throw "Ja existe modelo padrao ativo: $($padroes[0].new_name). Use -SubstituirPadrao ou ajuste pela Tela Gestao de Checklists." }
if (-not $Apply) {
  Write-Output "DRY RUN: criaria '$nome' com $($itens.Count) itens, ainda nao padrao; so depois de conferir os itens o marcaria como padrao da rotina quinzenal (15 dias)."
  foreach ($padrao in $padroes) { Write-Output "DRY RUN: nesse momento desmarcaria o padrao atual '$($padrao.new_name)' ($($padrao.new_checklistmodeloid)); ele continuaria ativo e seria restaurado se a troca falhasse." }
  return
}

# O schema novo (new_opcoesproblema e a opcao OK / Nao OK) precisa existir antes de criar qualquer coisa.
$coluna = @((Read-Dv "EntityDefinitions(LogicalName='new_checklistmodeloitem')/Attributes?`$select=LogicalName&`$filter=LogicalName eq 'new_opcoesproblema'").value)
if ($coluna.Count -ne 1) { throw "Coluna new_opcoesproblema ausente no DEV. Rode provision-checklists.ps1 -Apply antes." }
$opcaoOkNok = @((Read-Dv "EntityDefinitions(LogicalName='new_checklistmodeloitem')/Attributes(LogicalName='new_tipo')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)").OptionSet.Options | Where-Object { [int]$_.Value -eq $okNok })
if ($opcaoOkNok.Count -ne 1) { throw "Opcao 100000003 (OK / Nao OK) ausente em new_tipo. Rode provision-checklists.ps1 -Apply antes." }

# 1) Cria o modelo fora do padrao e os itens; o padrao atual nao e tocado ate o novo estar completo.
$modelo = Post-Dv "new_checklistmodelos" @{
  new_name = $nome
  new_descricao = "Vistoria r$([char]0x00E1)pida: 4 fotos externas, 9 itens OK / N$([char]0x00E3)o OK e observa$([char]0x00E7)$([char]0x00F5)es."
  new_ativo = $true
  new_padraoquinzenal = $false
  new_periodicidadedias = 15
}
$id = $modelo.new_checklistmodeloid
$ordem = 0
foreach ($item in $itens) {
  $ordem += 1
  Post-Dv "new_checklistmodeloitems" @{
    new_name = $item.nome
    new_ordem = $ordem
    new_tipo = $item.tipo
    new_obrigatorio = $item.obrigatorio
    new_unidade = ""
    new_opcoesproblema = $item.opcoes
    new_instrucao = $item.instrucao
    "new_Modelo@odata.bind" = "/new_checklistmodelos($id)"
  } | Out-Null
}
$criados = Count-Itens $id
if ($criados -ne $itens.Count) { throw "Modelo '$nome' ($id) criado fora do padrao com $criados de $($itens.Count) itens; padrao atual intacto. Repita o seed apos conferir pela Gestao de Checklists." }

# 2) So agora troca o padrao.
Promover-Padrao $id $padroes
Write-Output "Modelo '$nome' criado ($id) com $criados itens e marcado como padrao quinzenal."
