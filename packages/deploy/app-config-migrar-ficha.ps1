# Carga única da configuração do App Motoristas (fase B2): leva para a tabela de exceções o que as colunas legadas da
# ficha (cr40f_funcionarios) ainda dizem. Para cada funcionário ativo com cr40f_podecobrarqrcode = Sim (chave
# services.qrCharge) ou cr40f_gerarrecibopersonalizado = Sim (chave services.personalReceipt) e SEM linha de exceção da
# chave (vigente ou encerrada), chama a Custom API cr40f_AppConfigDefinirPessoa com Ligado = true e o motivo
# "Migrado da ficha". Idempotente: depois da primeira carga a pessoa passa a ter linha e é pulada.
# Não limpa as colunas legadas. A transição já funciona sem esta carga (coluna Sim vale exceção implícita "ligado");
# a carga só deixa a exceção visível e editável na tela de Configuração do App.
# DRY-RUN por padrão: lista o que faria. -Apply grava. Rode em cada ambiente (DEV, PROD), quando o plugin Acesso da fase B2
# já estiver publicado nele; o PROD só pelo caminho normal de publicação (decisão do Renan), nunca antes das soluções.
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/app-config-migrar-ficha.ps1 `
#     -EnvironmentUrl https://<org>.crm2.dynamics.com [-Apply]
# Requer `az login` com conta no papel de gestão da configuração (a API exige gestor) e a Custom API publicada.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com/?$')] [string] $EnvironmentUrl,
  [switch] $Apply
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = $EnvironmentUrl.TrimEnd('/')
function Write-Step([string] $m) { Write-Host "[app-config-migrar-ficha] $m" }

# coluna legada da ficha -> chave do catálogo
$mapa = @(
  @{ Coluna = 'cr40f_podecobrarqrcode'; Chave = 'services.qrCharge' },
  @{ Coluna = 'cr40f_gerarrecibopersonalizado'; Chave = 'services.personalReceipt' }
)
$motivo = 'Migrado da ficha'

$token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponível para $base (rode az login)." }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
function Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $Extra = @{}) {
  $params = @{ Method = $Method; Uri = $(if ($Path.StartsWith('http')) { $Path } else { "$base/api/data/v9.2/$Path" }); Headers = ($headers + $Extra); TimeoutSec = 120 }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress)); $params.ContentType = 'application/json; charset=utf-8' }
  try { return Invoke-RestMethod @params }
  catch {
    $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    throw "Dataverse respondeu $status em $Method $($Path.Split('?')[0])."
  }
}
function DvTodos([string] $Path) {
  $linhas = @(); $url = $Path
  while ($url) {
    $r = Dv GET $url @{} @{ Prefer = 'odata.maxpagesize=500' }
    $linhas += @($r.value)
    $url = if ($r.PSObject.Properties.Name -contains '@odata.nextLink') { $r.'@odata.nextLink' } else { $null }
  }
  return $linhas
}

$org = (Dv GET 'organizations?$select=name').value[0].name
Write-Step "$org`: $(if ($Apply) { 'APLICANDO' } else { 'dry-run (nada será gravado; use -Apply)' })"

$fichas = DvTodos 'cr40f_funcionarioses?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_podecobrarqrcode,cr40f_gerarrecibopersonalizado&$filter=statecode eq 0 and cr40f_status eq 0 and (cr40f_podecobrarqrcode eq true or cr40f_gerarrecibopersonalizado eq true)'
Write-Step "$($fichas.Count) funcionário(s) ativo(s) com coluna legada = Sim."

$feitas = 0; $puladas = 0; $falhas = 0
foreach ($f in $fichas) {
  $id = $f.cr40f_funcionariosid
  foreach ($m in $mapa) {
    if ($f.($m.Coluna) -ne $true) { continue }
    $existentes = @((Dv GET "cr40f_appconfigpessoas?`$select=cr40f_appconfigpessoaid&`$top=1&`$filter=_cr40f_funcionario_value eq $id and cr40f_tipo eq 100000000 and cr40f_chave eq '$($m.Chave)'").value)
    if ($existentes.Count -gt 0) { $puladas++; Write-Step "pula $($f.cr40f_nomecompleto) / $($m.Chave): já tem linha de exceção."; continue }
    if (-not $Apply) { $feitas++; Write-Step "faria: $($f.cr40f_nomecompleto) / $($m.Chave) = ligado ('$motivo')."; continue }
    try {
      Dv POST 'cr40f_AppConfigDefinirPessoa' @{ Funcionario = $id; Tipo = 'excecao'; Chave = $m.Chave; Ligado = $true; Motivo = $motivo; Encerrar = $false } | Out-Null
      $feitas++; Write-Step "fez: $($f.cr40f_nomecompleto) / $($m.Chave) = ligado."
    } catch { $falhas++; Write-Step "FALHOU: $($f.cr40f_nomecompleto) / $($m.Chave): $($_.Exception.Message)" }
  }
}
Write-Step "$org`: $feitas $(if ($Apply) { 'gravada(s)' } else { 'a gravar' }), $puladas já migrada(s), $falhas falha(s)."
if ($falhas -gt 0) { exit 1 }
