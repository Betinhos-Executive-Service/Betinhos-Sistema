param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Cadastra no DEV um modelo de checklist de teste e o marca como padrao da rotina quinzenal.
# Idempotente: se o modelo ja existe, so confere. Dry-run por padrao.
. (Join-Path $PSScriptRoot "lib/assert-dev-environment.ps1")
Assert-DevEnvironment $EnvironmentUrl

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$api = "$baseUrl/api/data/v9.2"
$nome = "Vistoria quinzenal (teste)"
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

$foto = 100000000; $numero = 100000001; $texto = 100000002
$itens = @(
  @{ nome = "Frente do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; unidade = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Traseira do ve$([char]0x00ED)culo"; tipo = $foto; obrigatorio = $true; unidade = ""; instrucao = "Enquadre o carro inteiro, com a placa leg$([char]0x00ED)vel." },
  @{ nome = "Lateral esquerda"; tipo = $foto; obrigatorio = $true; unidade = ""; instrucao = "" },
  @{ nome = "Lateral direita"; tipo = $foto; obrigatorio = $true; unidade = ""; instrucao = "" },
  @{ nome = "Painel ligado"; tipo = $foto; obrigatorio = $true; unidade = ""; instrucao = "Mostre o hod$([char]0x00F4)metro e o n$([char]0x00ED)vel de combust$([char]0x00ED)vel." },
  @{ nome = "Quilometragem"; tipo = $numero; obrigatorio = $true; unidade = "km"; instrucao = "Confira o n$([char]0x00FA)mero do painel." },
  @{ nome = "Combust$([char]0x00ED)vel"; tipo = $numero; obrigatorio = $false; unidade = "%"; instrucao = "N$([char]0x00ED)vel aproximado do tanque." },
  @{ nome = "Observa$([char]0x00E7)$([char]0x00F5)es"; tipo = $texto; obrigatorio = $false; unidade = ""; instrucao = "Avarias, limpeza, itens faltando ou o que mais a opera$([char]0x00E7)$([char]0x00E3)o precisa saber." }
)

$padroes = @((Read-Dv "new_checklistmodelos?`$select=new_checklistmodeloid,new_name&`$filter=new_padraoquinzenal eq true and new_ativo eq true and statecode eq 0").value)
$existentes = @((Read-Dv "new_checklistmodelos?`$select=new_checklistmodeloid,new_name&`$filter=new_name eq '$($nome.Replace("'", "''"))'").value)
if ($existentes.Count -gt 1) { throw "Modelo '$nome' duplicado." }
if ($existentes.Count -eq 1) {
  $id = $existentes[0].new_checklistmodeloid
  $n = @((Read-Dv "new_checklistmodeloitems?`$select=new_checklistmodeloitemid&`$filter=_new_modelo_value eq $id and statecode eq 0").value).Count
  Write-Output "Modelo '$nome' ja existe ($n itens). Padroes ativos: $($padroes.Count)."
  return
}
if ($padroes.Count -gt 0) { throw "Ja existe modelo padrao ativo: $($padroes[0].new_name). Ajuste pela Tela Gestao de Checklists." }
if (-not $Apply) { Write-Output "DRY RUN: criaria '$nome' com $($itens.Count) itens e o marcaria como padrao da rotina quinzenal (15 dias)."; return }

$modelo = Post-Dv "new_checklistmodelos" @{
  new_name = $nome
  new_descricao = "Modelo de teste: fotos externas, painel, quilometragem e observa$([char]0x00E7)$([char]0x00F5)es."
  new_ativo = $true
  new_padraoquinzenal = $true
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
    new_unidade = $item.unidade
    new_instrucao = $item.instrucao
    "new_Modelo@odata.bind" = "/new_checklistmodelos($id)"
  } | Out-Null
}
$criados = @((Read-Dv "new_checklistmodeloitems?`$select=new_name,new_ordem&`$filter=_new_modelo_value eq $id&`$orderby=new_ordem").value)
if ($criados.Count -ne $itens.Count) { throw "Esperados $($itens.Count) itens, encontrados $($criados.Count)." }
Write-Output "Modelo '$nome' criado ($id) com $($criados.Count) itens e marcado como padrao quinzenal."
