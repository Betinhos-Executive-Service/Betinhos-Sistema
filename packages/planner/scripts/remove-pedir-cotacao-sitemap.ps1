param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com',
  [switch] $ConfirmProd,
  [switch] $WhatIf
)

# Cotações V1.1: a Tela Pedir Cotação foi aposentada (o Planner é a única
# entrada). Remove a SubArea que aponta para cr40f_TelaPedirCotacao.html do
# sitemap do app Model Driven Betinhos e publica. Idempotente; o WebResource
# não é excluído. DEV por padrão; PROD só com -ConfirmProd.

$ErrorActionPreference = 'Stop'
$prod = 'https://orgf261ae8e.crm2.dynamics.com'
$url = $EnvironmentUrl.TrimEnd('/')
if ($url -eq $prod -and -not $ConfirmProd) { throw 'PROD exige -ConfirmProd.' }
if ($url -notin @('https://org23b93544.crm2.dynamics.com', $prod)) { throw "Ambiente não reconhecido: $url" }

$token = az account get-access-token --resource $url --query accessToken -o tsv
if (-not $token) { throw "Azure CLI não retornou token para $url." }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json; charset=utf-8' }
$api = "$url/api/data/v9.2"

$filter = [uri]::EscapeDataString("contains(sitemapxml,'cr40f_TelaPedirCotacao')")
$maps = @((Invoke-RestMethod -Uri "$api/sitemaps?`$select=sitemapid,sitemapxml&`$filter=$filter" -Headers $headers).value)
if (-not $maps.Count) { Write-Output 'Nenhum sitemap referencia cr40f_TelaPedirCotacao; nada a fazer.'; exit 0 }

foreach ($map in $maps) {
  $xml = [string] $map.sitemapxml
  $pattern = '<SubArea\b[^>]*Url="\$webresource:cr40f_TelaPedirCotacao\.html"[^>]*>[\s\S]*?</SubArea>'
  $matches = [regex]::Matches($xml, $pattern)
  if ($matches.Count -ne 1) { throw "Sitemap $($map.sitemapid): esperada 1 SubArea da Tela Pedir Cotação; encontradas $($matches.Count)." }
  if ($WhatIf) { Write-Output "WhatIf: removeria do sitemap $($map.sitemapid): $($matches[0].Value.Substring(0, 120))..."; continue }
  $updated = $xml.Remove($matches[0].Index, $matches[0].Length)
  Invoke-RestMethod -Method Patch -Uri "$api/sitemaps($($map.sitemapid))" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes((@{ sitemapxml = $updated } | ConvertTo-Json))) | Out-Null
  $publish = "<importexportxml><sitemaps><sitemap>$($map.sitemapid)</sitemap></sitemaps></importexportxml>"
  Invoke-RestMethod -Method Post -Uri "$api/PublishXml" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes((@{ ParameterXml = $publish } | ConvertTo-Json))) | Out-Null
  Write-Output "SubArea 'Pedir Cotação' removida e sitemap $($map.sitemapid) publicado."
}
