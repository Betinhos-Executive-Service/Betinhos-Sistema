param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com/?$')] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [string] $Arquivo,
  [switch] $Apply
)

# Carrega a rede CTF (cartao Sem Parar Combustivel) em new_postocombustivel, casando pelo CNPJ. Registros nao entram
# em solucao: rode em cada ambiente, depois que a coluna new_aceitactf existir nele (DEV: provision-postos-ctf.ps1;
# PROD: pelas solucoes). Dry-run por padrao. Requer az login.
# $Arquivo: JSON (UTF-8) gerado da "Lista de Postos" do portal Sem Parar, ja geocodificado, uma linha por CNPJ:
#   [{ cnpj, razao, nomeAnp, logradouro, numero, bairro, municipio, uf, cep, lat, lon, precisao: anp|rua|bairro|cidade|null }]
# Fica fora do repositorio (repositorio publico).
# - Posto novo: criado com endereco e coordenada; "Geocodificado" so com precisao anp ou rua, o resto fica "Pendente".
# - Posto existente: marca new_aceitactf; preenche coordenada so se o posto ainda estiver "Pendente" e a da lista for
#   anp ou rua. Nome, endereco e correcao manual do gestor nao sao tocados.
# - Posto marcado que saiu da lista: new_aceitactf volta para Nao.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
function Write-Step([string] $Message) { Write-Host "[postos-ctf] $Message" }

$StatusPendente = 100000000
$StatusGeocodificado = 100000001
$lista = @(Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8 | ConvertFrom-Json)
if ($lista.Count -eq 0) { throw "Arquivo sem postos: $Arquivo" }
$porCnpj = @{}
foreach ($p in $lista) {
  if ([string]$p.cnpj -notmatch '^\d{14}$') { throw "CNPJ invalido no arquivo: $($p.cnpj)" }
  $porCnpj[[string]$p.cnpj] = $p
}

$baseUrl = $EnvironmentUrl.TrimEnd("/")
$token = & az account get-access-token --resource "$baseUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponivel para $baseUrl (rode az login)." }
$apiBase = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "odata.maxpagesize=5000" }

function Invoke-Dv([string] $Method, [string] $Uri, $Body = $null) {
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
  }
  for ($tentativa = 1; ; $tentativa++) {
    try { return Invoke-RestMethod @params }
    catch {
      $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
      if (($status -eq 429 -or $status -ge 500) -and $tentativa -lt 5) { Start-Sleep -Seconds (5 * $tentativa); continue }
      $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
      throw "Dataverse $Method $($Uri.Split('?')[0]) falhou ($status): $detail"
    }
  }
}
function Cut($Value, [int] $Max) { $s = ([string]$Value).Trim(); if ($s.Length -gt $Max) { $s.Substring(0, $Max) } else { $s } }
function BoaCoordenada($p) { return $null -ne $p.lat -and $null -ne $p.lon -and ($p.precisao -eq "anp" -or $p.precisao -eq "rua") }

$org = (Invoke-Dv "GET" "$apiBase/organizations?`$select=name").value[0].name
$existentes = @{}
$uri = "$apiBase/new_postocombustivels?`$select=new_postocombustivelid,new_cnpj,new_statusgeo,new_aceitactf"
while ($uri) {
  $page = Invoke-Dv "GET" $uri
  foreach ($r in $page.value) { if ($r.new_cnpj) { $existentes[[string]$r.new_cnpj] = $r } }
  $uri = $page.'@odata.nextLink'
}

$novos = 0; $marcados = 0; $desmarcados = 0; $coordenadas = 0; $semCoordenada = 0
foreach ($cnpj in $porCnpj.Keys) {
  $p = $porCnpj[$cnpj]
  $atual = $existentes[$cnpj]
  if ($null -eq $atual) {
    $boa = BoaCoordenada $p
    $corpo = @{
      new_cnpj = $cnpj
      new_name = Cut $(if ($p.nomeAnp) { $p.nomeAnp } else { $p.razao }) 850
      new_logradouro = Cut $p.logradouro 200
      new_numero = Cut $p.numero 20
      new_bairro = Cut $p.bairro 100
      new_municipio = Cut $p.municipio 100
      new_uf = Cut $p.uf 2
      new_cep = Cut (([string]$p.cep) -replace '\D', '') 8
      new_aceitactf = $true
      new_statusgeo = $(if ($boa) { $StatusGeocodificado } else { $StatusPendente })
    }
    if ($null -ne $p.lat -and $null -ne $p.lon) { $corpo.new_latitude = [decimal]$p.lat; $corpo.new_longitude = [decimal]$p.lon; $corpo.new_precisaogeo = [string]$p.precisao }
    if (-not $boa) { $semCoordenada++ }
    if ($Apply) { Invoke-Dv "POST" "$apiBase/new_postocombustivels" $corpo | Out-Null }
    $novos++
    continue
  }
  $corpo = @{}
  if ($atual.new_aceitactf -ne $true) { $corpo.new_aceitactf = $true; $marcados++ }
  if ($atual.new_statusgeo -eq $StatusPendente -and (BoaCoordenada $p)) {
    $corpo.new_latitude = [decimal]$p.lat; $corpo.new_longitude = [decimal]$p.lon; $corpo.new_precisaogeo = [string]$p.precisao; $corpo.new_statusgeo = $StatusGeocodificado
    $coordenadas++
  }
  if ($Apply -and $corpo.Count -gt 0) { Invoke-Dv "PATCH" "$apiBase/new_postocombustivels($($atual.new_postocombustivelid))" $corpo | Out-Null }
}
foreach ($cnpj in $existentes.Keys) {
  if ($existentes[$cnpj].new_aceitactf -eq $true -and -not $porCnpj.ContainsKey($cnpj)) {
    if ($Apply) { Invoke-Dv "PATCH" "$apiBase/new_postocombustivels($($existentes[$cnpj].new_postocombustivelid))" @{ new_aceitactf = $false } | Out-Null }
    $desmarcados++
  }
}

$modo = if ($Apply) { "gravado" } else { "DRY RUN (use -Apply)" }
Write-Step "$org, ${modo}: $($porCnpj.Count) postos na lista; $novos novos ($semCoordenada ficam Pendentes); $marcados existentes marcados; $coordenadas pendentes ganharam coordenada; $desmarcados desmarcados."
