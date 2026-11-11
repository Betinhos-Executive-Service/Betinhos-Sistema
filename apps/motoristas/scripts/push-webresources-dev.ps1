param(
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL,
  # So le o DEV e mostra o que mudaria (token do az login quando nao ha DV_CLIENT_SECRET). Nada e gravado.
  [switch] $DryRun
)

# Caminho do workflow Deploy (develop -> DEV) para os web resources avulsos do App Motoristas (apps/motoristas/webresources):
#  - new_appmotoristas_push_redirect.js: OnLoad dos forms de push (abre o App no registro);
#  - new_exchange_lifecycle_commands.js e new_exchange_lifecycle_dialog.html: barra de comandos do form da troca de carro.
# So atualiza web resource que ja existe, com o id que TEST e PROD tambem usam (nunca cria: peca nova entra pela solucao).
# Conteudo: PATCH so quando difere (CRLF e LF contam como iguais). A descricao termina com o commit ("<texto> <sha>"), que
# pendentes-dev.ps1 e a trava do PROD leem; ela so e gravada depois do PublishXml, e o PublishXml inclui todo recurso cuja
# descricao ainda nao tem o commit: uma execucao que falhou no meio nunca deixa conteudo salvo sem publicar.
# A forma (OnLoad dos forms, form "App Motoristas (push)" e o app) e da migration 20261110-1700-push-redirect-forms.ps1.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $Message) { Write-Host "[motoristas-wr] $Message" }

if ([string]::IsNullOrWhiteSpace($EnvironmentUrl)) { $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com' }
$base = $EnvironmentUrl.TrimEnd('/')
if (([Uri]$base).Host -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $base" }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($DryRun) { $sha = (git -C $root rev-parse HEAD).Trim() }
else {
  if ($env:GITHUB_SHA -notmatch '^[0-9a-f]{40}$') { throw 'GITHUB_SHA invalido: este script so roda no workflow Deploy (use -DryRun para conferir).' }
  $sha = $env:GITHUB_SHA
}

# Ids iguais em DEV, TEST e PROD (lidos em 10/11/2026); Solucao = regras.json (packages/deploy/solucoes).
$catalogo = @(
  @{ Nome = 'new_appmotoristas_push_redirect.js'; Id = '831aea98-9cc9-f111-a05c-7ced8da8c473'; Tipo = 3; Solucao = 'BetinhosCore'
     Texto = 'OnLoad dos forms de push: abre o App Motoristas v2 no registro (comunicado, checklist, termo de multa, treinamento, despesa ou servico).' }
  @{ Nome = 'new_exchange_lifecycle_commands.js'; Id = 'feb44845-679a-f111-b8db-7ced8da8c473'; Tipo = 3; Solucao = 'BetinhosInterface'
     Texto = 'Comandos do ciclo de troca de carro (concluir, cancelar, reverter).' }
  @{ Nome = 'new_exchange_lifecycle_dialog.html'; Id = 'd20a6453-679a-f111-b8db-7ced8da8c473'; Tipo = 1; Solucao = 'BetinhosInterface'
     Texto = 'Dialogo do ciclo de troca de carro.' }
)

if ($env:DV_CLIENT_SECRET) {
  $tokenBody = @{ grant_type = 'client_credentials'; client_id = $env:DV_CLIENT_ID; client_secret = $env:DV_CLIENT_SECRET; scope = "$base/.default" }
  $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$env:DV_TENANT_ID/oauth2/v2.0/token" -Body $tokenBody).access_token
}
elseif ($DryRun) { $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv }
else { throw 'DV_CLIENT_SECRET ausente (environment dev do GitHub).' }
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Falha ao obter token do DEV.' }
$api = "$base/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
function Get-Linhas([string] $Caminho) { @((Invoke-RestMethod -Method Get -Uri "$api/$Caminho" -Headers $headers).value) }

function Get-Texto([byte[]] $Bytes) { [Text.Encoding]::UTF8.GetString($Bytes).Replace("`r`n", "`n") }

# Confere tudo antes de gravar o primeiro.
$solucoes = @{}
foreach ($s in Get-Linhas "solutions?`$select=solutionid,uniquename&`$filter=uniquename eq 'BetinhosCore' or uniquename eq 'BetinhosInterface'") { $solucoes[$s.uniquename] = $s.solutionid }
foreach ($w in $catalogo) {
  $w.Arquivo = Join-Path $root (Join-Path 'webresources' $w.Nome)
  if (-not (Test-Path -LiteralPath $w.Arquivo)) { throw "Arquivo nao encontrado: $($w.Arquivo)" }
  $linhas = @(Get-Linhas "webresourceset?`$select=webresourceid,webresourcetype,ismanaged,description,content&`$filter=name eq '$($w.Nome)'")
  if ($linhas.Count -ne 1) { throw "$($w.Nome) ausente ou duplicado no DEV. Peca nova entra pela solucao." }
  $atual = $linhas[0]
  if ("$($atual.webresourceid)" -ne $w.Id) { throw "$($w.Nome) com id $($atual.webresourceid) no DEV, esperado $($w.Id) (o de TEST e PROD)." }
  if ([int]$atual.webresourcetype -ne $w.Tipo) { throw "$($w.Nome) com tipo $($atual.webresourcetype), esperado $($w.Tipo)." }
  if ([bool]$atual.ismanaged) { throw "$($w.Nome) gerenciado no DEV." }
  if (-not $solucoes.ContainsKey($w.Solucao) -or @(Get-Linhas "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solucoes[$w.Solucao]) and objectid eq $($w.Id) and componenttype eq 61").Count -ne 1) {
    Write-Warning "$($w.Nome) fora da $($w.Solucao) (regras.json); a distribuicao nas solucoes corrige."
  }
  $bytes = [IO.File]::ReadAllBytes($w.Arquivo)
  $w.Conteudo = [Convert]::ToBase64String($bytes)
  $w.MudaConteudo = (Get-Texto $bytes) -ne (Get-Texto ([Convert]::FromBase64String("$($atual.content)")))
  $w.Descricao = "$($w.Texto) $sha"
  $w.MudaDescricao = "$($atual.description)" -ne $w.Descricao
  $o = if ($w.MudaConteudo) { 'conteudo muda' } else { 'conteudo sem mudanca' }
  $d = if ($w.MudaDescricao) { 'descricao recebe o commit' } else { 'descricao sem mudanca' }
  Write-Step "$($w.Nome): $o; $d"
}

$publicar = @($catalogo | Where-Object { $_.MudaConteudo -or $_.MudaDescricao })
if ($DryRun) {
  Write-Host "DRY RUN: nada gravado. Publicaria (PublishXml): $(if ($publicar.Count) { ($publicar | ForEach-Object { $_.Nome }) -join ', ' } else { 'nenhum' })"
  return
}

function Set-WebResource($W, [hashtable] $Corpo) {
  Invoke-RestMethod -Method Patch -Uri "$api/webresourceset($($W.Id))" -Headers ($headers + @{ 'If-Match' = '*' }) -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($Corpo | ConvertTo-Json -Compress))) | Out-Null
}

foreach ($w in @($catalogo | Where-Object { $_.MudaConteudo })) { Write-Step "atualizando $($w.Nome)"; Set-WebResource $w @{ content = $w.Conteudo } }
if ($publicar.Count) {
  $xml = '<importexportxml><webresources>' + (($publicar | ForEach-Object { "<webresource>{$($_.Id)}</webresource>" }) -join '') + '</webresources></importexportxml>'
  Write-Step 'publicando'
  Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body (@{ ParameterXml = $xml } | ConvertTo-Json) | Out-Null
}
foreach ($w in @($catalogo | Where-Object { $_.MudaDescricao })) { Set-WebResource $w @{ description = $w.Descricao } }

foreach ($w in $catalogo) {
  $publicado = Invoke-RestMethod -Method Get -Uri "$api/webresourceset($($w.Id))?`$select=content,description" -Headers $headers
  if ((Get-Texto ([Convert]::FromBase64String("$($publicado.content)"))) -ne (Get-Texto ([IO.File]::ReadAllBytes($w.Arquivo))) -or $publicado.description -ne $w.Descricao) { throw "Validacao pos-publicacao falhou em $($w.Nome)." }
}
Write-Host "PUSH CONCLUIDO: $sha - publicados: $(if ($publicar.Count) { ($publicar | ForEach-Object { $_.Nome }) -join ', ' } else { 'nenhum' })"
