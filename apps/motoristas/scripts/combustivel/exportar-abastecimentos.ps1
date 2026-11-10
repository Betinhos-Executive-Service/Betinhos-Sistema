param(
  [Parameter(Mandatory)] [string] $EnvironmentUrl,
  [int] $Meses = 6,
  [switch] $DeviceCode,
  # Pula o download dos cupons (Graph). Use quando o ClientId nao tem consentimento de Files.Read.All (AADSTS65002).
  [switch] $SemCupons,
  # ClientId de um app próprio com Files.Read.All delegado, usado só para baixar os cupons no Graph.
  [string] $GraphClientId = "",
  # Tenant do app de -GraphClientId (app de um tenant só não aceita "organizations").
  [string] $GraphTenantId = "bed8b3ad-d487-4193-a748-09e16f0e0327",
  # Nomes lógicos dos lookups da despesa (confirmados em scripts/import-despesas-operacionais-csv.ps1, linha 508).
  [string] $LkMotorista = "cr40f_motorista",
  [string] $LkCategoria = "cr40f_categoria",
  [string] $LkVeiculo = "cr40f_veiculo",
  [string] $LkCidade = "cr40f_cidade"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
# Somente leitura: nenhuma chamada POST/PATCH/DELETE neste arquivo (a leitura pode ser no PROD, decisão G0).
$out = Join-Path $env:USERPROFILE ".betinhos\combustivel"
$cupons = Join-Path $out "cupons"
New-Item -ItemType Directory -Force -Path $cupons | Out-Null

if (-not (Get-Module -ListAvailable MSAL.PS)) { throw "Modulo MSAL.PS nao encontrado." }
Import-Module MSAL.PS -ErrorAction Stop

$baseUrl = $EnvironmentUrl.TrimEnd("/")
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client

function Get-Token([string] $Scope) {
  if ($DeviceCode) { return (Get-MsalToken -PublicClientApplication $client -Scopes $Scope -DeviceCode).AccessToken }
  try { return (Get-MsalToken -PublicClientApplication $client -Scopes $Scope -Silent).AccessToken }
  catch { return (Get-MsalToken -PublicClientApplication $client -Scopes $Scope).AccessToken }
}

$token = Get-Token "$baseUrl/user_impersonation"
if (-not $token) { throw "Token Dataverse nao obtido." }
# Token Graph pelo mesmo app. Se o consentimento de Files.Read.All não existir para este ClientId, falha aqui, antes de ler dados.
$graphToken = $null
if (-not $SemCupons) {
  if ($GraphClientId) {
    # App próprio do Betinhos com Files.Read.All delegado (o app do Power Platform não tem pré-autorização para o Graph).
    $graphClient = New-MsalClientApplication -ClientId $GraphClientId -TenantId $GraphTenantId -RedirectUri ([Uri] "http://localhost")
    Enable-MsalTokenCacheOnDisk -PublicClientApplication $graphClient
    $graphToken = (Get-MsalToken -PublicClientApplication $graphClient -Scopes "https://graph.microsoft.com/Files.Read.All" -DeviceCode).AccessToken
  } else {
    $graphToken = Get-Token "https://graph.microsoft.com/Files.Read.All"
  }
  if (-not $graphToken) { throw "Token Graph (Files.Read.All) nao obtido." }
}
$apiBase = "$baseUrl/api/data/v9.2"

function Invoke-Dv([string] $Path) {
  $headers = @{
    Authorization = "Bearer $token"
    Accept = "application/json"
    "OData-MaxVersion" = "4.0"
    "OData-Version" = "4.0"
    Prefer = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
  }
  $uri = if ($Path -like "http*") { $Path } else { "$apiBase/$Path" }
  try { return Invoke-RestMethod -Method GET -Uri $uri -Headers $headers }
  catch {
    $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse GET $Path falhou: $detail"
  }
}

function Get-Rows([string] $Set, [string] $Select, [string] $Filter = "") {
  $path = "${Set}?`$select=$Select"
  if ($Filter) { $path += "&`$filter=$([uri]::EscapeDataString($Filter))" }
  $rows = @()
  while ($path) {
    $page = Invoke-Dv $path
    $rows += @($page.value)
    $next = $page.PSObject.Properties["@odata.nextLink"]
    $path = if ($next) { $next.Value } else { $null }
  }
  return $rows
}

$desde = (Get-Date).AddMonths(-$Meses).ToString("yyyy-MM-dd")

$cat = Get-Rows "cr40f_categoriadespesaoperacionals" "cr40f_categoriadespesaoperacionalid,cr40f_nome"
$abast = @($cat | Where-Object { ($_.cr40f_nome -replace '[^\p{L}]', '').ToLowerInvariant() -match "^(abastecimento|combust)" })
if ($abast.Count -eq 0) { throw "Categoria Abastecimento não encontrada." }
$catId = $abast[0].cr40f_categoriadespesaoperacionalid

# Modelo do veículo em consulta separada (evita $expand, que exige o nome da navigation property).
$modelos = @{}
foreach ($v in (Get-Rows "cr40f_veiculoses" "cr40f_veiculosid,cr40f_modelo")) { $modelos[$v.cr40f_veiculosid] = $v.cr40f_modelo }

$select = "cr40f_despesaoperacionalid,cr40f_datagasto,cr40f_valor,cr40f_litros,cr40f_kminformado,cr40f_estabelecimento,createdon,_${LkMotorista}_value,_${LkVeiculo}_value,_${LkCidade}_value"
$filter = "_${LkCategoria}_value eq $catId and cr40f_datagasto ge $desde"
$despesas = Get-Rows "cr40f_despesaoperacionals" $select $filter

$linhas = foreach ($d in $despesas) {
  $id = $d.cr40f_despesaoperacionalid
  $arquivo = ""
  $anexo = @()
  if (-not $SemCupons) { $anexo = @(Get-Rows "cr40f_anexodespesaoperacionals" "cr40f_sharelink,cr40f_urlsharepoint,cr40f_mimetype" "_cr40f_despesa_value eq $id and cr40f_tipo eq 100000000" | Select-Object -First 1) }
  if ($anexo.Count -gt 0 -and $anexo[0].cr40f_sharelink) {
    $share = "u!" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($anexo[0].cr40f_sharelink)).TrimEnd('=').Replace('/', '_').Replace('+', '-'))
    $ext = if ($anexo[0].cr40f_mimetype -like "*png*") { "png" } else { "jpg" }
    $arquivo = Join-Path $cupons "$id.$ext"
    if (-not (Test-Path $arquivo)) {
      # Um cupom apagado ou sem permissão não deve derrubar a exportação inteira: segue sem arquivo.
      try { Invoke-WebRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/shares/$share/driveItem/content" -Headers @{ Authorization = "Bearer $graphToken" } -OutFile $arquivo -ErrorAction Stop }
      catch { Write-Warning "Cupom da despesa $id nao baixado: $($_.Exception.Message)"; Remove-Item -LiteralPath $arquivo -Force -ErrorAction SilentlyContinue }
    }
    if (-not (Test-Path $arquivo)) { $arquivo = "" }
  }
  $veiculoId = $d."_${LkVeiculo}_value"
  [pscustomobject]@{
    despesaId = $id; dataGasto = $d.cr40f_datagasto; valor = $d.cr40f_valor; litros = $d.cr40f_litros; km = $d.cr40f_kminformado
    motoristaId = $d."_${LkMotorista}_value"; veiculoId = $veiculoId; modelo = if ($veiculoId) { $modelos[$veiculoId] } else { "" }
    estabelecimento = $d.cr40f_estabelecimento; cidade = $d."_${LkCidade}_value@OData.Community.Display.V1.FormattedValue"; createdOn = $d.createdon; arquivo = $arquivo
  }
}
$linhas = @($linhas | Where-Object { $_ })
$linhas | Export-Csv -Path (Join-Path $out "abastecimentos.csv") -NoTypeInformation -Encoding UTF8
Write-Host "[combustivel] $($linhas.Count) abastecimentos; $(@($linhas | Where-Object { $_.arquivo }).Count) com cupom baixado em $cupons"
