# Limpeza dos chunks JS com hash (code splitting) que builds anteriores deixaram no Dataverse.
# Usado pelo push-dev.ps1 e pelo push-front-prod.ps1 (dot-source); o push-dev.ps1 tambem usa a leitura
# em lote (Get-WebResourcesByName) para conferir o que gravou. Mantem o build atual e o build que estava publicado antes
# do push, para a aba aberta com a versao anterior continuar achando os chunks ate recarregar.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:ChunkFilePattern = '[A-Za-z0-9_-]+\.[a-z0-9]{8}\.js'

function Get-WebResourceText([string] $ApiBaseUrl, [hashtable] $Headers, [string] $Name) {
  $escaped = $Name.Replace("'", "''")
  $found = @((Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/webresourceset?`$select=content&`$filter=name eq '$escaped'" -Headers $Headers).value)
  if ($found.Count -ne 1 -or -not $found[0].content) { return $null }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($found[0].content))
}

# Linhas de web resource de um filtro. Lanca se a resposta nao vier como objeto ou vier paginada.
function Get-WebResourceRows([string] $ApiBaseUrl, [hashtable] $Headers, [string] $Filter) {
  $page = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/webresourceset?`$select=webresourceid,name,webresourcetype,content&`$filter=$Filter" -Headers $Headers
  # No Windows PowerShell 5.1, JSON que nao converte volta como texto.
  if ($page -is [string]) { throw "resposta nao veio como JSON" }
  # Pagina cortada passaria por resposta completa, e a limpeza apagaria chunk em uso.
  if ($page.PSObject.Properties['@odata.nextLink']) { throw "resposta veio paginada" }
  return @($page.value)
}

# Varios web resources por nome em poucas consultas (era uma por recurso): devolve nome -> linha
# (webresourceid, name, webresourcetype, content). Nome que o ambiente nao tem fica fora do mapa.
# Lote que falha (resposta grande demais, por exemplo) e lido um a um, como era antes.
function Get-WebResourcesByName([string] $ApiBaseUrl, [hashtable] $Headers, [string[]] $Names) {
  $map = @{}
  # 15 por consulta: o conteudo vem junto, e lote maior faria respostas de varios MB.
  for ($i = 0; $i -lt $Names.Count; $i += 15) {
    $grupo = @($Names[$i..([Math]::Min($i + 15, $Names.Count) - 1)])
    $filtros = @($grupo | ForEach-Object { "name eq '" + $_.Replace("'", "''") + "'" })
    try { $rows = @(Get-WebResourceRows $ApiBaseUrl $Headers ($filtros -join ' or ')) }
    catch {
      Write-Warning "[chunks] leitura em lote falhou ($($_.Exception.Message)); lendo um a um"
      $rows = @($filtros | ForEach-Object { Get-WebResourceRows $ApiBaseUrl $Headers $_ })
    }
    foreach ($r in $rows) { $map[$r.name] = $r }
  }
  return $map
}

# Chunks do build publicado hoje: parte do HTML e segue os imports entre chunks, um nivel por vez
# (cada nivel em poucas consultas; era uma consulta por chunk).
function Get-PublishedChunkNames([string] $ApiBaseUrl, [hashtable] $Headers, [string] $ResourceName, [string] $ChunkPrefix) {
  $html = Get-WebResourceText $ApiBaseUrl $Headers $ResourceName
  if (-not $html) { return @() }
  $seen = @{}
  $nivel = @()
  foreach ($m in [regex]::Matches($html, '/WebResources/' + [regex]::Escape($ChunkPrefix) + '(' + $script:ChunkFilePattern + ')')) { $nivel += $ChunkPrefix + $m.Groups[1].Value }
  while ($nivel.Count) {
    $novos = @()
    foreach ($name in $nivel) { if (-not $seen.ContainsKey($name)) { $seen[$name] = $true; $novos += $name } }
    $nivel = @()
    $lidos = Get-WebResourcesByName $ApiBaseUrl $Headers $novos
    foreach ($name in $novos) {
      if (-not $lidos.ContainsKey($name) -or -not $lidos[$name].content) { continue }
      $code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($lidos[$name].content))
      foreach ($m in [regex]::Matches($code, $script:ChunkFilePattern)) {
        $next = $ChunkPrefix + $m.Value
        if (-not $seen.ContainsKey($next)) { $nivel += $next }
      }
    }
  }
  return @($seen.Keys)
}

# -SomenteNaoGerenciados (PROD): chunk que veio por solucao gerenciada nao pode ser apagado direto; so o import o retira.
function Remove-ObsoleteChunks([string] $ApiBaseUrl, [hashtable] $Headers, [string] $ChunkPrefix, [string[]] $Keep, [switch] $DryRun, [switch] $SomenteNaoGerenciados) {
  if (-not $Keep -or $Keep.Count -eq 0) { throw "Lista de chunks a manter vazia. Limpeza abortada." }
  $keepSet = @{}
  foreach ($k in $Keep) { $keepSet[$k] = $true }
  $prefix = $ChunkPrefix.Replace("'", "''")
  $filter = "startswith(name,'$prefix')"
  if ($SomenteNaoGerenciados) { $filter += " and ismanaged eq false" }
  $url = "$ApiBaseUrl/webresourceset?`$select=webresourceid,name&`$filter=$filter"
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
