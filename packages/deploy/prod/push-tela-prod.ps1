# Hotfix da tela do Sistema Betinhos no PROD sem importar a AppBetinhos: envia o build de apps/shell/dist
# (chunks, HTML e loader) direto como WebResources e publica. Rode `pnpm --filter @betinhos/shell build` antes.
# Cria camada nao gerenciada (Active) sobre os WebResources gerenciados: antes do proximo import da AppBetinhos,
# remova essa camada, senao a tela importada nao aparece. Chunks antigos nao sao apagados (pertencem a solucao gerenciada).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
param([switch] $SomenteValidar)
. "$PSScriptRoot/_prod.ps1"

$resourceName = 'cr40f_SistemaBetinhos.html'
$loaderName = 'cr40f_SistemaBetinhosLoader.html'
$displayName = 'Sistema Betinhos'
$appRoot = Resolve-Path (Join-Path $PSScriptRoot '../../../apps/shell')
$dist = Join-Path $appRoot 'dist'
function Esc([string] $v) { $v.Replace("'", "''") }

$org = Dv GET 'organizations?$select=organizationid'
if ($org.value[0].organizationid -ne $script:ProdOrgId) { throw "Organizacao inesperada: $($org.value[0].organizationid). Abortado." }

$version = (Get-Content -Raw (Join-Path $appRoot 'package.json') | ConvertFrom-Json).version
$targets = @()
$chunkPrefix = 'cr40f_SistemaBetinhos/assets/'
foreach ($chunk in ([IO.File]::ReadAllText((Join-Path $dist 'webresource-assets.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json)) {
  if (-not $chunk.name.StartsWith($chunkPrefix) -or $chunk.name -notmatch '^[A-Za-z0-9_]+(/[A-Za-z0-9.]+)+\.js$') { throw "Chunk invalido: $($chunk.name)" }
  $targets += @{ Name = $chunk.name; Display = "$displayName - $($chunk.file)"; Path = (Join-Path $dist $chunk.file.Replace('/', '\')); Type = 3 }
}
$targets += @{ Name = $resourceName; Display = $displayName; Path = (Join-Path $dist 'webresource.html'); Type = 1; Description = "v$version" }
$loaderHtml = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../loader.template.html'), [Text.Encoding]::UTF8).Replace('{{RESOURCE}}', $resourceName).Replace('{{TITLE}}', $displayName)
$loaderPath = Join-Path $dist 'loader.html'
[IO.File]::WriteAllText($loaderPath, $loaderHtml, (New-Object Text.UTF8Encoding($false)))
$targets += @{ Name = $loaderName; Display = "$displayName (carregador)"; Path = $loaderPath; Type = 1 }

$plan = foreach ($t in $targets) {
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($t.Path))
  $found = @((Dv GET "webresourceset?`$select=webresourceid,webresourcetype,content&`$filter=name eq '$(Esc $t.Name)'").value)
  if ($found.Count -gt 1) { throw "Mais de um WebResource $($t.Name). Abortado." }
  if ($found.Count -eq 1 -and $found[0].webresourcetype -ne $t.Type) { throw "$($t.Name) existe com outro tipo. Abortado." }
  $acao = if ($found.Count -eq 0) { 'criar' } elseif ($found[0].content -eq $content) { 'igual' } else { 'atualizar' }
  [pscustomobject]@{ Name = $t.Name; Acao = $acao; Id = $(if ($found.Count) { $found[0].webresourceid }); Content = $content; T = $t }
}
$plan | Group-Object Acao | ForEach-Object { Write-Host "[prod] $($_.Name): $($_.Count)" }
if ($SomenteValidar) { Write-Host "[prod] somente validacao: nada gravado (v$version)"; return }

$ids = foreach ($p in $plan) {
  $fields = @{ displayname = $p.T.Display; content = $p.Content; isenabledformobileclient = $true }
  if ($p.T['Description']) { $fields.description = $p.T.Description }
  if ($p.Acao -eq 'criar') {
    $fields.name = $p.Name; $fields.webresourcetype = $p.T.Type
    Dv POST 'webresourceset' $fields | Out-Null
    @((Dv GET "webresourceset?`$select=webresourceid&`$filter=name eq '$(Esc $p.Name)'").value)[0].webresourceid
  }
  elseif ($p.Acao -eq 'atualizar') { Dv PATCH "webresourceset($($p.Id))" $fields | Out-Null; $p.Id }
  else { $p.Id }
}
$xml = '<importexportxml><webresources>' + (($ids | ForEach-Object { "<webresource>$_</webresource>" }) -join '') + '</webresources></importexportxml>'
Dv POST 'PublishXml' @{ ParameterXml = $xml } | Out-Null

foreach ($p in $plan) {
  $pub = @((Dv GET "webresourceset?`$select=content&`$filter=name eq '$(Esc $p.Name)'").value)
  if ($pub.Count -ne 1 -or $pub[0].content -ne $p.Content) { throw "Validacao pos-publicacao falhou em $($p.Name)." }
}
Write-Host "PUSH PROD CONCLUIDO: v$version - $($plan.Count) WebResources validados"
Write-Host "URL: $script:ProdUrl/WebResources/$loaderName"
