# Regrava cr40f_bancodedados.new_linkdafoto que ainda guarda link de compartilhamento do SharePoint
# (https://betinhos.sharepoint.com/:i:/s/BetinhosGestoInterna/<token>) como URL com caminho
# (https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/<amb>/<id>.<ext>),
# que o Formulário Geral consegue exibir, e remove do arquivo as permissões de link com escopo "organization".
# Idempotente: quem já tem /:i:/r/ não entra no filtro. Erro em um item não para o lote. Arquivo inexistente
# (comum no DEV) é só reportado. Sem -Apply só lista (DRY RUN). PROD exige -Apply e -ConfirmarProd.
#
# Requer `az login` (Dataverse) e login interativo no Graph (Connect-MgGraph, módulo Microsoft.Graph.Authentication).
# O CSV com url antiga/nova/permissões/status fica em packages/deploy/flows/backup/.
param(
  [Parameter(Mandatory = $true)][ValidateSet('DEV', 'PROD')][string] $Ambiente,
  [switch] $Apply,
  [switch] $ConfirmarProd,
  [int] $Limite = 0,
  # Login por código (navegador em qualquer dispositivo): o WAM falha em terminal sem janela.
  [switch] $DeviceCode
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$urls = @{ DEV = 'https://org23b93544.crm2.dynamics.com'; PROD = 'https://orgf261ae8e.crm2.dynamics.com' }
$environmentUrl = $urls[$Ambiente]
$entitySet = 'cr40f_bancodedadoses'
$idCol = 'cr40f_bancodedadosid'
$linkCol = 'new_linkdafoto'
$backupDir = Join-Path $PSScriptRoot 'flows/backup'
if ($Ambiente -eq 'PROD' -and $Apply -and -not $ConfirmarProd) { throw 'PROD exige -ConfirmarProd junto com -Apply.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw "Token do Dataverse $Ambiente indisponível (rode az login)." }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; Prefer = 'odata.maxpagesize=500' }

function Dv([string] $Method, [string] $Uri, $Body = $null) {
  if ($Uri -notmatch '^https://') { $Uri = "$environmentUrl/api/data/v9.2/$Uri" }
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  # O Dataverse responde sem charset; o PowerShell 5.1 leria como Latin-1 e corromperia os acentos. Decodifica UTF-8.
  $bytes = (Invoke-WebRequest @params -UseBasicParsing).RawContentStream.ToArray()
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function ShareId([string] $url) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($url)).TrimEnd('=').Replace('/', '_').Replace('+', '-')
  return "u!$b64"
}
function Csv([string] $file, $row) {
  $line = ($row | ConvertTo-Csv -NoTypeInformation)[1]
  [IO.File]::AppendAllText($file, $line + "`r`n", (New-Object Text.UTF8Encoding $false))
}
# webUrl do driveItem (https://<host>/sites/<site>/<biblioteca>/<pasta>/<arquivo>, já codificado) -> /:i:/r/<caminho>.
function UrlComCaminho([string] $webUrl) {
  $u = [Uri]$webUrl
  if ($u.Host -notmatch '\.sharepoint\.com$' -or $u.AbsolutePath -notmatch '^/sites/') { throw "webUrl inesperado: $webUrl" }
  return "https://$($u.Host)/:i:/r$($u.AbsolutePath)"
}

$who = Dv GET WhoAmI
if (-not $who.OrganizationId) { throw "A API não respondeu pela organização $Ambiente." }

# Registros com link de compartilhamento (/:x:/s/) do SharePoint (paginação pelo @odata.nextLink).
$registros = New-Object System.Collections.Generic.List[object]
$next = "${entitySet}?`$select=$idCol,cr40f_nomedopassageiro,$linkCol&`$filter=contains($linkCol,'betinhos.sharepoint.com/:')"
while ($next) {
  $page = Dv GET $next
  foreach ($r in $page.value) { $registros.Add($r) }
  $next = if ($page.PSObject.Properties.Name -contains '@odata.nextLink') { $page.'@odata.nextLink' } else { $null }
}
$alvo = @($registros | Where-Object { $_.$linkCol -match '^https://betinhos\.sharepoint\.com/:[a-z]:/s/' })
if ($Limite -gt 0) { $alvo = @($alvo | Select-Object -First $Limite) }
Write-Host "[links-fotos] $Ambiente`: $($registros.Count) com link do SharePoint; $($alvo.Count) com link de compartilhamento a regravar."
if (-not $alvo.Count) { Write-Output 'Nada a regravar.'; return }

Import-Module Microsoft.Graph.Authentication
if ($DeviceCode) { Connect-MgGraph -Scopes Files.ReadWrite.All, Sites.ReadWrite.All -NoWelcome -UseDeviceCode } else { Connect-MgGraph -Scopes Files.ReadWrite.All, Sites.ReadWrite.All -NoWelcome }

New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
$modo = if ($Apply) { 'apply' } else { 'dryrun' }
$csvFile = Join-Path $backupDir "links-fotos-$Ambiente-$modo-$stamp.csv"
[IO.File]::WriteAllText($csvFile, '"id","nome","arquivo","urlAntiga","urlNova","permissoesOrg","status"' + "`r`n", (New-Object Text.UTF8Encoding $false))

$cont = @{ ok = 0; regravado = 0; inexistente = 0; erro = 0 }
foreach ($r in $alvo) {
  $id = ([string]$r.$idCol).ToLower()
  $old = [string]$r.$linkCol
  $linha = [ordered]@{ id = $id; nome = $r.cr40f_nomedopassageiro; arquivo = ''; urlAntiga = $old; urlNova = ''; permissoesOrg = ''; status = '' }
  try {
    try {
      $item = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/shares/$(ShareId $old)/driveItem?`$select=id,name,webUrl,parentReference"
    } catch {
      if ($_.Exception.Message -match '404|NotFound|itemNotFound') { $linha.status = 'arquivo inexistente'; $cont.inexistente++; continue }
      throw
    }
    $linha.arquivo = $item.name
    $linha.urlNova = UrlComCaminho $item.webUrl
    $driveId = $item.parentReference.driveId
    $perms = @((Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/$($item.id)/permissions").value |
        Where-Object { $_.ContainsKey('link') -and $_.link -and $_.link.scope -eq 'organization' })
    $linha.permissoesOrg = ($perms | ForEach-Object { $_.id }) -join ';'
    if ($Apply) {
      Dv PATCH "$entitySet($id)" @{ $linkCol = $linha.urlNova } | Out-Null
      foreach ($p in $perms) { Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/$($item.id)/permissions/$($p.id)" | Out-Null }
      $linha.status = 'regravado'
      $cont.regravado++
    } else {
      $linha.status = 'ok'
    }
    $cont.ok++
  } catch {
    $linha.status = "erro: $($_.Exception.Message -replace '[\r\n]+', ' ')"
    $cont.erro++
  } finally {
    Csv $csvFile ([pscustomobject]$linha)
    Write-Output ('{0} | {1} | {2} | perms org: {3} | {4}' -f $id, $linha.nome, $linha.urlNova, @($linha.permissoesOrg -split ';' | Where-Object { $_ }).Count, $linha.status)
  }
}

Write-Output "Resumo $Ambiente ($modo): $($alvo.Count) processados; ok $($cont.ok); regravados $($cont.regravado); arquivo inexistente $($cont.inexistente); erros $($cont.erro). CSV: $csvFile"
if (-not $Apply) {
  $extra = ''
  if ($Ambiente -eq 'PROD') { $extra = ' -ConfirmarProd' }
  Write-Output "DRY RUN: nada gravado. Rode com -Apply$extra para regravar."
}
