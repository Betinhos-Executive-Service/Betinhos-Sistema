# Migra as fotos de passageiros (cr40f_bancodedados.new_linkdafoto) que ainda apontam para o OneDrive
# (-my.sharepoint.com) para o SharePoint: site BetinhosGestoInterna, biblioteca "Documentos Compartilhados",
# pasta Passageiros/Fotos/<DEV|PROD>/<id>.<ext>, com link de visualização da organização, e grava o link novo em
# new_linkdafoto. Não apaga nada no OneDrive. Quem já aponta para betinhos.sharepoint.com é ignorado (idempotente).
# Sem -Apply só lista (DRY RUN). PROD exige -Apply e -ConfirmarProd.
#
# Requer `az login` (Dataverse) e login interativo no Graph (Connect-MgGraph, módulo Microsoft.Graph.Authentication),
# porque o token do az não tem escopo de arquivos. O CSV com url antiga/nova/status fica em packages/deploy/flows/backup/.
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
$sitePath = 'betinhos.sharepoint.com:/sites/BetinhosGestoInterna'
# Biblioteca "Documentos Compartilhados" pelo id da lista (o nome no Graph varia com o idioma: Documents/Documentos).
$libraryListId = '0e524da8-15af-47ff-9b34-7116ac32763f'
$folder = "Passageiros/Fotos/$Ambiente"
$chunk = 4MB
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
function Upload([string] $siteId, [string] $driveId, [string] $name, [byte[]] $bytes) {
  $path = [Uri]::EscapeDataString("$folder/$name").Replace('%2F', '/')
  $base = "https://graph.microsoft.com/v1.0/sites/$siteId/drives/$driveId/root:/${path}"
  if ($bytes.Length -le $chunk) {
    return Invoke-MgGraphRequest -Method PUT -Uri "${base}:/content" -Body $bytes -ContentType 'application/octet-stream'
  }
  $session = Invoke-MgGraphRequest -Method POST -Uri "${base}:/createUploadSession" -Body (@{ item = @{ '@microsoft.graph.conflictBehavior' = 'replace' } } | ConvertTo-Json) -ContentType 'application/json'
  $offset = 0
  $result = $null
  while ($offset -lt $bytes.Length) {
    $len = [Math]::Min($chunk, $bytes.Length - $offset)
    $part = New-Object byte[] $len
    [Array]::Copy($bytes, $offset, $part, 0, $len)
    # A URL da sessão já é pré-autorizada; enviar Authorization nela é rejeitado.
    $resp = Invoke-WebRequest -Method PUT -Uri $session.uploadUrl -Body $part -UseBasicParsing -TimeoutSec 300 -Headers @{ 'Content-Range' = "bytes $offset-$($offset + $len - 1)/$($bytes.Length)" }
    if ($resp.StatusCode -in 200, 201) { $result = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json }
    $offset += $len
  }
  if (-not $result) { throw 'Upload em partes terminou sem o item criado.' }
  return $result
}

$who = Dv GET WhoAmI
if (-not $who.OrganizationId) { throw "A API não respondeu pela organização $Ambiente." }

# Registros com foto ainda no OneDrive (paginação pelo @odata.nextLink).
$registros = New-Object System.Collections.Generic.List[object]
$next = "${entitySet}?`$select=$idCol,cr40f_nomedopassageiro,$linkCol&`$filter=contains($linkCol,'-my.sharepoint.com')"
while ($next) {
  $page = Dv GET $next
  foreach ($r in $page.value) { $registros.Add($r) }
  $next = if ($page.PSObject.Properties.Name -contains '@odata.nextLink') { $page.'@odata.nextLink' } else { $null }
}
$alvo = @($registros | Where-Object { $_.$linkCol -notmatch '://betinhos\.sharepoint\.com/' })
if ($Limite -gt 0) { $alvo = @($alvo | Select-Object -First $Limite) }
Write-Host "[fotos] $Ambiente`: $($registros.Count) com foto no OneDrive; processando $($alvo.Count)."
if (-not $alvo.Count) { Write-Output 'Nada a migrar.'; return }

Import-Module Microsoft.Graph.Authentication
if ($DeviceCode) { Connect-MgGraph -Scopes Files.Read.All, Sites.ReadWrite.All -NoWelcome -UseDeviceCode } else { Connect-MgGraph -Scopes Files.Read.All, Sites.ReadWrite.All -NoWelcome }
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sitePath`?`$select=id"
$driveId = (Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists/$libraryListId/drive?`$select=id").id

New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('yyyyMMdd-HHmmss')
$modo = if ($Apply) { 'apply' } else { 'dryrun' }
$csvFile = Join-Path $backupDir "fotos-passageiros-$Ambiente-$modo-$stamp.csv"
[IO.File]::WriteAllText($csvFile, '"id","nome","arquivo","tamanho","urlAntiga","urlNova","status"' + "`r`n", (New-Object Text.UTF8Encoding $false))

$cont = @{ ok = 0; erro = 0; migrado = 0 }
foreach ($r in $alvo) {
  $id = ([string]$r.$idCol).ToLower()
  $old = [string]$r.$linkCol
  $linha = [ordered]@{ id = $id; nome = $r.cr40f_nomedopassageiro; arquivo = ''; tamanho = ''; urlAntiga = $old; urlNova = ''; status = '' }
  try {
    $item = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/shares/$(ShareId $old)/driveItem?`$select=id,name,size,file,parentReference"
    $linha.arquivo = $item.name
    $linha.tamanho = $item.size
    $ext = [IO.Path]::GetExtension([string]$item.name).TrimStart('.').ToLower()
    if (-not $ext) { $ext = 'jpg' }
    if ($Apply) {
      $tmp = [IO.Path]::GetTempFileName()
      try {
        Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/drives/$($item.parentReference.driveId)/items/$($item.id)/content" -OutputFilePath $tmp
        $bytes = [IO.File]::ReadAllBytes($tmp)
      } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
      $novo = Upload $site.id $driveId "$id.$ext" $bytes
      $link = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/$($novo.id)/createLink" -Body '{"type":"view","scope":"organization"}' -ContentType 'application/json'
      $linha.urlNova = $link.link.webUrl
      if (-not $linha.urlNova) { throw 'createLink não devolveu webUrl.' }
      Dv PATCH "$entitySet($id)" @{ $linkCol = $linha.urlNova } | Out-Null
      $linha.status = 'migrado'
      $cont.migrado++
    } else {
      $linha.status = 'ok'
    }
    $cont.ok++
  } catch {
    $linha.status = "erro: $($_.Exception.Message -replace '[\r\n]+', ' ')"
    $cont.erro++
  }
  Csv $csvFile ([pscustomobject]$linha)
  Write-Output ('{0} | {1} | {2} | {3} bytes | {4}' -f $id, $linha.nome, $linha.arquivo, $linha.tamanho, $linha.status)
}

Write-Output "Resumo $Ambiente ($modo): $($alvo.Count) processados; ok $($cont.ok); migrados $($cont.migrado); erros $($cont.erro). CSV: $csvFile"
if (-not $Apply) {
  $extra = ''
  if ($Ambiente -eq 'PROD') { $extra = ' -ConfirmarProd' }
  Write-Output "DRY RUN: nada gravado. Rode com -Apply$extra para migrar."
}
