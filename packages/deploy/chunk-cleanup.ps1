# Limpeza dos chunks JS e CSS com hash (code splitting) que builds anteriores deixaram no Dataverse.
# Usado pelo push-dev.ps1 (dot-source). Mantem o build atual e o build que estava publicado antes
# do push, para a aba aberta com a versao anterior continuar achando os chunks ate recarregar.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:ChunkFilePattern = '[A-Za-z0-9_-]+\.[a-z0-9]{8}\.(js|css)'

function Get-WebResourceText([string] $ApiBaseUrl, [hashtable] $Headers, [string] $Name) {
  $escaped = $Name.Replace("'", "''")
  $found = @((Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/webresourceset?`$select=content&`$filter=name eq '$escaped'" -Headers $Headers).value)
  if ($found.Count -ne 1 -or -not $found[0].content) { return $null }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($found[0].content))
}

# Chunks do build publicado hoje: parte do HTML e segue os imports entre chunks.
function Get-PublishedChunkNames([string] $ApiBaseUrl, [hashtable] $Headers, [string] $ResourceName, [string] $ChunkPrefix) {
  $html = Get-WebResourceText $ApiBaseUrl $Headers $ResourceName
  if (-not $html) { return @() }
  $seen = @{}
  $pending = New-Object System.Collections.Queue
  foreach ($m in [regex]::Matches($html, '/WebResources/' + [regex]::Escape($ChunkPrefix) + '(' + $script:ChunkFilePattern + ')')) { $pending.Enqueue($ChunkPrefix + $m.Groups[1].Value) }
  while ($pending.Count) {
    $name = $pending.Dequeue()
    if ($seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    # CSS de tela nao importa outros chunks: nao precisa baixar.
    if ($name.EndsWith(".css")) { continue }
    $code = Get-WebResourceText $ApiBaseUrl $Headers $name
    if (-not $code) { continue }
    foreach ($m in [regex]::Matches($code, $script:ChunkFilePattern)) {
      $next = $ChunkPrefix + $m.Value
      if (-not $seen.ContainsKey($next)) { $pending.Enqueue($next) }
    }
  }
  return @($seen.Keys)
}

function Remove-ObsoleteChunks([string] $ApiBaseUrl, [hashtable] $Headers, [string] $ChunkPrefix, [string[]] $Keep, [switch] $DryRun) {
  if (-not $Keep -or $Keep.Count -eq 0) { throw "Lista de chunks a manter vazia. Limpeza abortada." }
  $keepSet = @{}
  foreach ($k in $Keep) { $keepSet[$k] = $true }
  $prefix = $ChunkPrefix.Replace("'", "''")
  $url = "$ApiBaseUrl/webresourceset?`$select=webresourceid,name&`$filter=startswith(name,'$prefix')"
  $all = @()
  while ($url) {
    $page = Invoke-RestMethod -Method Get -Uri $url -Headers ($Headers + @{ Prefer = "odata.maxpagesize=500" })
    $all += @($page.value)
    # A ultima pagina nao traz @odata.nextLink; com Set-StrictMode, ler a propriedade ausente lanca erro.
    $next = $page.PSObject.Properties['@odata.nextLink']
    $url = if ($next) { $next.Value } else { $null }
  }
  $obsolete = @($all | Where-Object { $_.name.StartsWith($ChunkPrefix, [StringComparison]::Ordinal) -and $_.name -match ('/' + $script:ChunkFilePattern + '$') -and -not $keepSet.ContainsKey($_.name) })
  Write-Host "[chunks] $($all.Count) no ambiente, $($keepSet.Count) mantidos, $($obsolete.Count) obsoletos"
  $removed = 0
  foreach ($chunk in $obsolete) {
    if ($DryRun) { Write-Host "[chunks] removeria $($chunk.name)"; continue }
    try {
      Invoke-RestMethod -Method Delete -Uri "$ApiBaseUrl/webresourceset($($chunk.webresourceid))" -Headers $Headers | Out-Null
      $removed++
    }
    catch { Write-Warning "[chunks] nao removeu $($chunk.name): $($_.Exception.Message)" }
  }
  if (-not $DryRun) { Write-Host "[chunks] removidos: $removed" }
  return $obsolete.Count
}
