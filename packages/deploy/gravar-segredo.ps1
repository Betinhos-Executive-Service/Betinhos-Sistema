# Grava (upsert pela chave alternativa cr40f_name) UM segredo na tabela cr40f_segredo de um ambiente. O valor vem de
# arquivo (salvo por campo seguro, nunca digitado no comando), é aparado (Trim) e nunca é impresso; a conferência é por
# hash SHA-256 do valor relido. Registros não entram em solução: rode em cada ambiente (DEV, TEST, PROD).
# -LimparVariavel <schemaname>: depois de gravar e conferir, apaga o valor atual (environmentvariablevalue) da variável
# de ambiente legada e esvazia o padrão da definição, para a chave sair do alcance de quem lê variáveis. Só use quando
# todos os consumidores (plugins e flows) já lerem a tabela; lista em CLAUDE.md ("Segredos").
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/gravar-segredo.ps1 `
#     -EnvironmentUrl https://<org>.crm2.dynamics.com -Nome anthropic.combustivel -ArquivoValor <caminho> `
#     [-Descricao 'Chave Anthropic dos insights de combustível (Betinhos.DriverRecordSharing)'] [-LimparVariavel new_AnthropicKeyCombustivel]
# Requer `az login --allow-no-subscriptions --tenant <tenant>` com conta Administrador do Sistema (ou membro do perfil
# "Segredos – automação" com privilégio na tabela). Arquivo salvo com BOM (Windows PowerShell 5.1 lê os acentos).
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com/?$')] [string] $EnvironmentUrl,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9]+([.-][a-z0-9]+)*$')] [string] $Nome,
  [Parameter(Mandatory = $true)] [string] $ArquivoValor,
  [string] $Descricao,
  [ValidatePattern('^[a-z0-9]+_[A-Za-z0-9_]+$')] [string] $LimparVariavel
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = $EnvironmentUrl.TrimEnd('/')
function Write-Step([string] $m) { Write-Host "[gravar-segredo] $m" }
function Hash([string] $s) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))) } finally { $sha.Dispose() }
}

if (-not (Test-Path -LiteralPath $ArquivoValor -PathType Leaf)) { throw "Arquivo do valor não encontrado: $ArquivoValor" }
$valor = ([IO.File]::ReadAllText((Resolve-Path -LiteralPath $ArquivoValor).Path, [Text.Encoding]::UTF8)).Trim()
if (-not $valor) { throw 'Arquivo do valor está vazio.' }
if ($valor.Length -gt 4000) { throw "Valor com $($valor.Length) caracteres; o limite de cr40f_valor é 4000." }
$hashEsperado = Hash $valor

$token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponível para $base (rode az login)." }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }
# Erros do Dataverse saem só com status e código: o corpo da resposta de um PATCH pode ecoar o valor enviado.
function Dv([string] $Method, [string] $Path, $Body = $null, [hashtable] $Extra = @{}) {
  $params = @{ Method = $Method; Uri = "$base/api/data/v9.2/$Path"; Headers = ($headers + $Extra); TimeoutSec = 60 }
  if ($null -ne $Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress)); $params.ContentType = 'application/json; charset=utf-8' }
  try { return Invoke-RestMethod @params }
  catch {
    $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    throw "Dataverse respondeu $status em $Method $($Path.Split('?')[0])."
  }
}

$org = (Dv GET 'organizations?$select=name').value[0].name
$chave = "cr40f_segredos(cr40f_name='$Nome')"
$corpo = @{ cr40f_valor = $valor }
if ($PSBoundParameters.ContainsKey('Descricao')) { $corpo.cr40f_descricao = $Descricao }
Dv PATCH $chave $corpo | Out-Null
$valor = $null; $corpo = $null
$lido = (Dv GET "$chave`?`$select=cr40f_valor").cr40f_valor
if (-not $lido) { throw "Segredo $Nome gravado em $org, mas a releitura veio sem valor: a conta não lê a coluna (perfil 'Segredos – automação' ou Administrador do Sistema)." }
if ((Hash $lido.Trim()) -ne $hashEsperado) { throw "Segredo $Nome em $org não confere com o arquivo (hash diferente)." }
$lido = $null
Write-Step "$org`: segredo $Nome gravado e conferido por hash."

if ($LimparVariavel) {
  $defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$LimparVariavel'").value)
  if ($defs.Count -ne 1) { throw "Variável $LimparVariavel não encontrada em $org (segredo já gravado)." }
  $defId = $defs[0].environmentvariabledefinitionid
  foreach ($v in @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)) {
    Dv DELETE "environmentvariablevalues($($v.environmentvariablevalueid))" | Out-Null
  }
  try { Dv PATCH "environmentvariabledefinitions($defId)" @{ defaultvalue = $null } | Out-Null; Write-Step "$org`: $LimparVariavel sem valor atual nem padrão." }
  catch { Write-Step "ATENÇÃO: valor atual de $LimparVariavel apagado, mas o padrão da definição não pôde ser esvaziado ($($_.Exception.Message)); esvazie no DEV e publique as soluções." }
}
