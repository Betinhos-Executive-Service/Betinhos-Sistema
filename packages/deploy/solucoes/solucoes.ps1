# Operacoes de solucao para a segmentacao da AppBetinhos (dot-source depois do dataverse.ps1).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:Solucoes = @("BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")

function Get-SolucaoId($Dv, [string] $UniqueName) {
  $rows = @(Read-DvAll $Dv "solutions?`$select=solutionid&`$filter=uniquename eq '$UniqueName'")
  if ($rows.Count -eq 0) { return $null }
  return [string] $rows[0].solutionid
}

function Get-TiposPorEntidade($Dv) {
  $map = @{}
  foreach ($d in Read-DvAll $Dv "solutioncomponentdefinitions?`$select=solutioncomponenttype,primaryentityname&`$filter=solutioncomponenttype ge 10000") {
    $map[[int] $d.solutioncomponenttype] = [string] $d.primaryentityname
  }
  return $map
}

function Get-Mapa($Dv, [string] $Set, [string] $Chave, [string] $Valor) {
  $map = @{}
  foreach ($r in Read-DvAll $Dv "$Set`?`$select=$Chave,$Valor") { $map[([string] $r.$Chave).ToLowerInvariant()] = [string] $r.$Valor }
  return $map
}

# Componentes raiz da solucao, com o que o classificador precisa: nome, entidade (tipos >= 10000), app pai e se e tabela de BPF.
function Get-ComponentesDaSolucao($Dv, [string] $SolucaoId, [hashtable] $TiposPorEntidade) {
  $nomes = @{
    61  = Get-Mapa $Dv "webresourceset" "webresourceid" "name"
    80  = Get-Mapa $Dv "appmodules" "appmoduleid" "uniquename"
    62  = Get-Mapa $Dv "sitemaps" "sitemapid" "sitemapnameunique"
    300 = Get-Mapa $Dv "canvasapps" "canvasappid" "name"
  }
  $apps = $nomes[80]
  $paiDoApp = @{}
  foreach ($par in @(@("appsettings", "appsettingid"), @("appelements", "appelementid"))) {
    foreach ($r in Read-DvAll $Dv "$($par[0])?`$select=$($par[1]),_parentappmoduleid_value") {
      $pai = [string] $r._parentappmoduleid_value
      if ($pai) { $paiDoApp[([string] $r.($par[1])).ToLowerInvariant()] = $apps[$pai.ToLowerInvariant()] }
    }
  }
  $bpf = @{}
  foreach ($e in Read-DvAll $Dv "EntityDefinitions?`$select=MetadataId,IsBPFEntity") { if ($e.IsBPFEntity) { $bpf[([string] $e.MetadataId).ToLowerInvariant()] = $true } }
  $resumo = @{}
  foreach ($r in Read-DvAll $Dv "msdyn_solutioncomponentsummaries?`$select=msdyn_objectid,msdyn_name&`$filter=msdyn_solutionid eq $SolucaoId") {
    $resumo[([string] $r.msdyn_objectid).ToLowerInvariant()] = [string] $r.msdyn_name
  }
  $lista = @()
  foreach ($c in Read-DvAll $Dv "solutioncomponents?`$select=objectid,componenttype,rootcomponentbehavior&`$filter=_solutionid_value eq $SolucaoId") {
    $id = ([string] $c.objectid).ToLowerInvariant()
    $tipo = [int] $c.componenttype
    $nome = if ($nomes.ContainsKey($tipo) -and $nomes[$tipo].ContainsKey($id)) { $nomes[$tipo][$id] } elseif ($resumo.ContainsKey($id)) { $resumo[$id] } else { "" }
    $lista += @{
      id = $id; tipo = $tipo; nome = $nome; comportamento = [int] $c.rootcomponentbehavior
      entidade = if ($tipo -ge 10000) { $TiposPorEntidade[$tipo] } else { $null }
      app = if ($paiDoApp.ContainsKey($id)) { $paiDoApp[$id] } else { $null }
      bpf = ($tipo -eq 1 -and $bpf.ContainsKey($id))
    }
  }
  return $lista
}

function Add-ComponenteNaSolucao($Dv, $Componente, [string] $Solucao) {
  Invoke-DvAction $Dv "AddSolutionComponent" @{
    ComponentId = $Componente.id; ComponentType = [int] $Componente.tipo; SolutionUniqueName = $Solucao
    AddRequiredComponents = $false; DoNotIncludeSubcomponents = ([int] $Componente.comportamento -ne 0); IncludedComponentSettingsValues = $null
  } | Out-Null
}

function New-SolucaoSeFaltar($Dv, [string] $UniqueName, [string] $PublisherId) {
  if (Get-SolucaoId $Dv $UniqueName) { return $false }
  $body = @{ uniquename = $UniqueName; friendlyname = $UniqueName; version = "1.0.0.0"; "publisherid@odata.bind" = "/publishers($PublisherId)" }
  Invoke-RestMethod -Method Post -Uri "$($Dv.Api)/solutions" -Headers $Dv.Headers -Body (ConvertTo-Json -InputObject $body) -ContentType "application/json; charset=utf-8" | Out-Null
  return $true
}

function Get-DependenciasAusentes($Dv, [string] $Solucao) {
  return @(Read-DvAll $Dv "RetrieveMissingDependencies(SolutionUniqueName='$Solucao')" | ForEach-Object {
      @{ requerido = ([string] $_.requiredcomponentobjectid).ToLowerInvariant(); tipo = [int] $_.requiredcomponenttype }
    })
}

# Hash do conteudo do pacote, sem solution.xml (versao) nem [Content_Types].xml: igual se nada mudou.
function Get-HashDoPacote([string] $ZipPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $buffer = New-Object IO.MemoryStream
    foreach ($e in ($zip.Entries | Where-Object { @("solution.xml", "[Content_Types].xml") -notcontains $_.FullName } | Sort-Object FullName)) {
      $nome = [Text.Encoding]::UTF8.GetBytes($e.FullName)
      $buffer.Write($nome, 0, $nome.Length)
      $s = $e.Open()
      try { $s.CopyTo($buffer) } finally { $s.Dispose() }
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    return -join ($sha.ComputeHash($buffer.ToArray()) | ForEach-Object { $_.ToString("x2") })
  }
  finally { $zip.Dispose() }
}

function Select-PacProfile([string] $Url) {
  $targetHost = ([Uri] $Url).Host.ToLowerInvariant()
  $line = @(pac auth list | Where-Object { $_ -match [regex]::Escape($targetHost) }) | Select-Object -First 1
  if (-not $line -or $line -notmatch '^\[(\d+)\]') { throw "Nenhum perfil do pac para $targetHost. Rode: pac auth create --environment $Url" }
  pac auth select --index $Matches[1] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pac auth select falhou para $targetHost." }
}

function Get-StepsSemConfigSegura($Dv, [string[]] $Nomes) {
  $faltando = @()
  foreach ($nome in $Nomes) {
    $rows = @(Read-DvAll $Dv "sdkmessageprocessingsteps?`$select=_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$($nome.Replace("'", "''"))'")
    if ($rows.Count -ne 1 -or -not $rows[0]._sdkmessageprocessingstepsecureconfigid_value) { $faltando += "$nome ($($rows.Count) step(s))" }
  }
  return $faltando
}
