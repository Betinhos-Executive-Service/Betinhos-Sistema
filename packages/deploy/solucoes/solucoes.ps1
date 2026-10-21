# Operacoes de solucao para a segmentacao da AppBetinhos (dot-source depois do dataverse.ps1).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:Solucoes = @("BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")
$script:HostDev = "org23b93544.crm2.dynamics.com"
$script:IdVazio = "00000000-0000-0000-0000-000000000000"

# Escrita em solucao (incluir, remover, criar) so no DEV: TEST e PROD recebem as solucoes por import, nunca por estas funcoes.
function Assert-HostDev($Dv, [string] $Operacao) {
  if ([string] $Dv.Host -ne $script:HostDev) { throw "$Operacao so e permitido no DEV ($($script:HostDev)); recebi '$($Dv.Host)'." }
}

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

# Linhas de uma solucao: id minusculo, tipo e comportamento (rootcomponentbehavior; 0 = com subcomponentes).
function Get-LinhasDaSolucao($Dv, [string] $SolucaoId) {
  Read-DvAll $Dv "solutioncomponents?`$select=objectid,componenttype,rootcomponentbehavior&`$filter=_solutionid_value eq $SolucaoId" | ForEach-Object {
    @{ id = ([string] $_.objectid).ToLowerInvariant(); tipo = [int] $_.componenttype; comportamento = [int] $_.rootcomponentbehavior }
  }
}

# Assembly dentro de pacote de plug-in -> pacote que o carrega (ids em minusculo).
function Get-PacoteDosAssemblies($Dv) {
  $map = @{}
  foreach ($r in @(Read-DvAll $Dv "pluginassemblies?`$select=pluginassemblyid,_packageid_value&`$filter=_packageid_value ne null")) {
    $map[([string] $r.pluginassemblyid).ToLowerInvariant()] = ([string] $r._packageid_value).ToLowerInvariant()
  }
  return $map
}

function Get-Mapa($Dv, [string] $Set, [string] $Chave, [string] $Valor) {
  $map = @{}
  foreach ($r in Read-DvAll $Dv "$Set`?`$select=$Chave,$Valor") { $map[([string] $r.$Chave).ToLowerInvariant()] = [string] $r.$Valor }
  return $map
}

# Componentes raiz da solucao, com o que o classificador precisa: nome, entidade (tipos >= 10000), app pai, se e tabela de BPF
# e a categoria do workflow (tipo 29).
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
  # Busca do Dataverse: o dvtablesearch se chama M365_Primary_model_<app> e so existe numa solucao junto com o app;
  # as dvtablesearchentity seguem o dvtablesearch pai. Por isso herdam o app, como as configuracoes e elementos de app.
  $appPorBusca = @{}
  foreach ($r in Read-DvAll $Dv "dvtablesearchs?`$select=dvtablesearchid,name") {
    if (([string] $r.name) -match '^M365_Primary_model_(.+)$' -and $apps.ContainsValue($Matches[1])) {
      $idBusca = ([string] $r.dvtablesearchid).ToLowerInvariant()
      $appPorBusca[$idBusca] = $Matches[1]
      $paiDoApp[$idBusca] = $Matches[1]
    }
  }
  foreach ($r in Read-DvAll $Dv "dvtablesearchentities?`$select=dvtablesearchentityid,_dvtablesearch_value") {
    $pai = ([string] $r._dvtablesearch_value).ToLowerInvariant()
    if ($appPorBusca.ContainsKey($pai)) { $paiDoApp[([string] $r.dvtablesearchentityid).ToLowerInvariant()] = $appPorBusca[$pai] }
  }
  # Workflows (tipo 29): category 2 = regra de negocio (acompanha a tabela no Core), 5 = fluxo moderno, 4 = BPF etc.
  $categorias = @{}
  foreach ($r in Read-DvAll $Dv "workflows?`$select=workflowid,category") { $categorias[([string] $r.workflowid).ToLowerInvariant()] = [int] $r.category }
  $bpf = @{}
  foreach ($e in Read-DvAll $Dv "EntityDefinitions?`$select=MetadataId,IsBPFEntity") { if ($e.IsBPFEntity) { $bpf[([string] $e.MetadataId).ToLowerInvariant()] = $true } }
  $resumo = @{}
  foreach ($r in Read-DvAll $Dv "msdyn_solutioncomponentsummaries?`$select=msdyn_objectid,msdyn_name&`$filter=msdyn_solutionid eq $SolucaoId") {
    $resumo[([string] $r.msdyn_objectid).ToLowerInvariant()] = [string] $r.msdyn_name
  }
  foreach ($l in @(Get-LinhasDaSolucao $Dv $SolucaoId)) {
    $id = $l.id
    $tipo = $l.tipo
    $nome = if ($nomes.ContainsKey($tipo) -and $nomes[$tipo].ContainsKey($id)) { $nomes[$tipo][$id] } elseif ($resumo.ContainsKey($id)) { $resumo[$id] } else { "" }
    @{
      id = $id; tipo = $tipo; nome = $nome; comportamento = $l.comportamento
      entidade = if ($tipo -ge 10000) { $TiposPorEntidade[$tipo] } else { $null }
      app = if ($paiDoApp.ContainsKey($id)) { $paiDoApp[$id] } else { $null }
      bpf = ($tipo -eq 1 -and $bpf.ContainsKey($id))
      categoria = if ($tipo -eq 29 -and $categorias.ContainsKey($id)) { $categorias[$id] } else { $null }
    }
  }
}

function Add-ComponenteNaSolucao($Dv, $Componente, [string] $Solucao) {
  Assert-HostDev $Dv "AddSolutionComponent"
  Invoke-DvAction $Dv "AddSolutionComponent" @{
    ComponentId = $Componente.id; ComponentType = [int] $Componente.tipo; SolutionUniqueName = $Solucao
    AddRequiredComponents = $false; DoNotIncludeSubcomponents = ([int] $Componente.comportamento -ne 0); IncludedComponentSettingsValues = $null
  } | Out-Null
}

# Tira o componente de UMA solucao nao gerenciada (o componente em si nao e apagado).
# Na Web API o parametro SolutionComponent leva o objectid do componente em solutioncomponentid (nao o id da linha de solutioncomponents).
function Remove-ComponenteDaSolucao($Dv, [string] $ComponentId, [int] $Tipo, [string] $Solucao) {
  Assert-HostDev $Dv "RemoveSolutionComponent"
  # Nunca remover da caixa de entrada (AppBetinhos) nem de solucao de fora das 4: o alvo e sempre uma das 4 novas.
  if ($script:Solucoes -notcontains $Solucao) { throw "Remover componente so e permitido nas solucoes $($script:Solucoes -join ', '); recebi '$Solucao'." }
  $solucaoId = Get-SolucaoId $Dv $Solucao
  if (-not $solucaoId) { throw "Solucao $Solucao nao encontrada." }
  $linhas = @(Read-DvAll $Dv "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solucaoId and objectid eq $ComponentId and componenttype eq $Tipo")
  if ($linhas.Count -ne 1) { throw "Esperava 1 linha de solutioncomponents para $ComponentId (tipo $Tipo) em $Solucao, achei $($linhas.Count)." }
  Invoke-DvAction $Dv "RemoveSolutionComponent" @{
    SolutionComponent = @{ "@odata.type" = "Microsoft.Dynamics.CRM.solutioncomponent"; solutioncomponentid = $ComponentId }
    ComponentType = $Tipo; SolutionUniqueName = $Solucao
  } | Out-Null
}

# Decisao pura (sem API): o que remover das 4 solucoes depois de AddSolutionComponent arrastar componentes.
# $Linhas: solucao -> @(@{ id; tipo }); $DonoEsperado: id -> solucao dona (so o que esta na caixa); $Ordem: as 4 da camada mais baixa para a mais alta;
# $TiposProibidos: tipos que nunca ficam em solucao (valor de variavel, 381). Devolve @{ solucao; id; tipo; motivo }.
# So olha as solucoes de $Ordem, que precisam ser as 4: a caixa de entrada nunca e candidata a remocao.
function Get-ExcedentesDasSolucoes($Linhas, [hashtable] $DonoEsperado, [string[]] $Ordem, [int[]] $TiposProibidos) {
  foreach ($sol in $Ordem) { if ($script:Solucoes -notcontains $sol) { throw "Get-ExcedentesDasSolucoes so aceita as 4 solucoes novas; recebi '$sol'." } }
  $primeira = @{}
  foreach ($sol in $Ordem) { foreach ($l in @($Linhas[$sol])) { if (-not $primeira.ContainsKey($l.id)) { $primeira[$l.id] = $sol } } }
  foreach ($sol in $Ordem) {
    foreach ($l in @($Linhas[$sol])) {
      $motivo = $null
      if ($TiposProibidos -contains $l.tipo) { $motivo = "tipo proibido (valor de variavel nao viaja)" }
      elseif ($DonoEsperado.ContainsKey($l.id)) { if ($DonoEsperado[$l.id] -ne $sol) { $motivo = "pertence a $($DonoEsperado[$l.id])" } }
      elseif ($primeira[$l.id] -ne $sol) { $motivo = "fora da caixa, ja esta em $($primeira[$l.id])" }
      if ($motivo) { @{ solucao = $sol; id = $l.id; tipo = $l.tipo; motivo = $motivo } }
    }
  }
}

function New-SolucaoSeFaltar($Dv, [string] $UniqueName, [string] $PublisherId) {
  Assert-HostDev $Dv "Criar solucao"
  if (Get-SolucaoId $Dv $UniqueName) { return $false }
  $body = @{ uniquename = $UniqueName; friendlyname = $UniqueName; version = "1.0.0.0"; "publisherid@odata.bind" = "/publishers($PublisherId)" }
  Invoke-DvAction $Dv "solutions" $body | Out-Null
  return $true
}

# Dependencias ausentes da solucao, com a base do requerido (solucao Active = componente proprio do ambiente; outra =
# sistema ou gerenciada), o componente que exige e a tabela pai (subcomponente nao tem linha propria nas solucoes).
function Get-DependenciasAusentes($Dv, [string] $Solucao) {
  $deps = @(Read-DvAll $Dv "RetrieveMissingDependencies(SolutionUniqueName='$Solucao')" | ForEach-Object {
      $pai = ([string] $_.requiredcomponentparentid).ToLowerInvariant()
      @{
        requerido = ([string] $_.requiredcomponentobjectid).ToLowerInvariant(); tipo = [int] $_.requiredcomponenttype
        base = ([string] $_.requiredcomponentbasesolutionid).ToLowerInvariant()
        pai = if ($pai -and $pai -ne $script:IdVazio) { $pai } else { $null }
        dependente = ([string] $_.dependentcomponentobjectid).ToLowerInvariant(); tipoDependente = [int] $_.dependentcomponenttype
      }
    })
  Resolve-TabelaPaiDasDependencias $Dv $deps
  return $deps
}

# O Dataverse informa a tabela pai em requiredcomponentparentid, mas para alguns atributos (2), visoes (26) e formularios (60)
# vem vazio: esses sao resolvidos pela metadata (a lista de tabelas so e lida se algum precisar). Relacionamento (10) ou outro
# subcomponente sem pai fica sem pai e, sendo componente proprio, a conferencia acusa: nao adivinhar.
function Resolve-TabelaPaiDasDependencias($Dv, $Dependencias) {
  $tabelas = $null
  $atributos = $null
  foreach ($d in @($Dependencias)) {
    if ($d.pai -or @(2, 26, 60) -notcontains $d.tipo) { continue }
    if ($null -eq $tabelas) {
      $tabelas = @{}
      $atributos = @{}
      foreach ($e in @(Read-DvAll $Dv "EntityDefinitions?`$select=LogicalName,MetadataId&`$expand=Attributes(`$select=LogicalName)")) {
        $idTabela = ([string] $e.MetadataId).ToLowerInvariant()
        $tabelas[[string] $e.LogicalName] = $idTabela
        foreach ($a in @($e.Attributes)) { $atributos[([string] $a.MetadataId).ToLowerInvariant()] = $idTabela }
      }
    }
    $logico = $null
    if ($d.tipo -eq 2) { if ($atributos.ContainsKey($d.requerido)) { $d.pai = $atributos[$d.requerido] } }
    elseif ($d.tipo -eq 26) { $logico = @(Read-DvAll $Dv "savedqueries?`$select=returnedtypecode&`$filter=savedqueryid eq $($d.requerido)" | ForEach-Object { [string] $_.returnedtypecode }) }
    else { $logico = @(Read-DvAll $Dv "systemforms?`$select=objecttypecode&`$filter=formid eq $($d.requerido)" | ForEach-Object { [string] $_.objecttypecode }) }
    if ($logico -and $logico.Count -eq 1 -and $tabelas.ContainsKey($logico[0])) { $d.pai = $tabelas[$logico[0]] }
  }
}

function Get-Sha256Hex([byte[]] $Bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString("x2") }) }
  finally { $sha.Dispose() }
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
    return Get-Sha256Hex ($buffer.ToArray())
  }
  finally { $zip.Dispose() }
}

# pac: o perfil selecionado (pac auth select) e global, compartilhado por todas as sessoes da maquina, e nunca decide o alvo.
# Todo comando do pac que le ou escreve num ambiente passa por Invoke-Pac, que confere o host com `pac org who --environment`
# e acrescenta --environment <url> ao comando.
function Assert-PacAmbiente([string] $Url) {
  $esperado = ([Uri] $Url).Host.ToLowerInvariant()
  $saida = @(pac org who --environment $Url | ForEach-Object { [string] $_ })
  if ($LASTEXITCODE -ne 0) { throw "pac org who --environment $Url falhou (codigo $LASTEXITCODE): $($saida -join ' | ')" }
  $hosts = @([regex]::Matches(($saida -join "`n"), 'https://([A-Za-z0-9.-]+)') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() } | Select-Object -Unique)
  if ($hosts.Count -ne 1 -or $hosts[0] -ne $esperado) { throw "pac org who --environment $Url respondeu outro ambiente (esperado $esperado; recebi '$($hosts -join ', ')'). Nada foi executado." }
}

function Invoke-Pac([string] $Url, [string[]] $Argumentos) {
  if (@($Argumentos | Where-Object { @("--environment", "-env") -contains $_ }).Count) { throw "Invoke-Pac acrescenta --environment sozinho; tire dos argumentos." }
  Assert-PacAmbiente $Url
  $saida = @(pac @Argumentos --environment $Url | ForEach-Object { Write-Host $_; [string] $_ })
  if ($LASTEXITCODE -ne 0) { throw "pac $($Argumentos -join ' ') falhou em $Url (codigo $LASTEXITCODE): $(($saida | Select-Object -Last 5) -join ' | ')" }
  return $saida
}

# UniqueName, versao e se e gerenciada, lidos do solution.xml do ZIP.
function Get-ManifestoDoPacote([string] $ZipPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $entrada = @($zip.Entries | Where-Object { $_.FullName -eq "solution.xml" })
    if ($entrada.Count -ne 1) { throw "$ZipPath nao tem solution.xml." }
    $leitor = New-Object IO.StreamReader($entrada[0].Open())
    try { [xml] $xml = $leitor.ReadToEnd() } finally { $leitor.Dispose() }
    $m = $xml.ImportExportXml.SolutionManifest
    return @{ UniqueName = [string] $m.UniqueName; Version = [string] $m.Version; Managed = ([string] $m.Managed -eq "1") }
  }
  finally { $zip.Dispose() }
}

# Exporta a solucao gerenciada e prova que o ZIP e novo e e o certo: apaga o destino antes (--overwrite nao apaga o antigo e o
# export pode sair com 0 sem gerar arquivo), exige o arquivo e confere no solution.xml o UniqueName, a versao atual no ambiente
# e Managed. Devolve @{ Caminho; Versao }.
function Export-SolucaoGerenciada($Dv, [string] $Nome, [string] $Caminho) {
  $linhas = @(Read-DvAll $Dv "solutions?`$select=version&`$filter=uniquename eq '$Nome'")
  if ($linhas.Count -ne 1) { throw "Solucao $Nome nao encontrada em $($Dv.Host)." }
  $versao = [string] $linhas[0].version
  $destino = Initialize-ArquivoDeSaida $Caminho
  Invoke-Pac $Dv.Url @("solution", "export", "--name", $Nome, "--managed", "--path", $destino, "--async") | Out-Null
  if (-not (Test-Path -LiteralPath $destino -PathType Leaf)) { throw "pac solution export de $Nome saiu com 0 mas nao gerou $destino." }
  $m = Get-ManifestoDoPacote $destino
  if ($m.UniqueName -ne $Nome -or $m.Version -ne $versao -or -not $m.Managed) {
    throw "ZIP $destino nao e o esperado: UniqueName '$($m.UniqueName)' (esperado $Nome), versao '$($m.Version)' (esperada $versao), gerenciada $($m.Managed)."
  }
  return @{ Caminho = $destino; Versao = $versao }
}

# Situacao de cada step sensivel pelo nome: quantos existem e se o unico tem configuracao segura.
function Get-SituacaoStepsSeguros($Dv, [string[]] $Nomes) {
  $situacao = [ordered]@{}
  foreach ($nome in $Nomes) {
    $rows = @(Read-DvAll $Dv "sdkmessageprocessingsteps?`$select=_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$($nome.Replace("'", "''"))'")
    $situacao[$nome] = [ordered]@{ existe = ($rows.Count -gt 0); steps = $rows.Count; seguro = ($rows.Count -eq 1 -and [bool] $rows[0]._sdkmessageprocessingstepsecureconfigid_value) }
  }
  return $situacao
}

function Get-StepsSemConfigSegura($Dv, [string[]] $Nomes) {
  $situacao = Get-SituacaoStepsSeguros $Dv $Nomes
  return @($situacao.Keys | Where-Object { -not $situacao[$_].seguro } | ForEach-Object { "$_ ($($situacao[$_].steps) step(s))" })
}

# A foto confere a propria cobertura: cada fluxo (29) e step (92) das solucoes lidas precisa ter estado na foto, e uma foto
# sem nenhum componente (nenhuma solucao pedida existe) nao prova nada.
function Assert-CoberturaDaFoto($Foto, [hashtable] $FluxoIds, [hashtable] $StepIds) {
  $problemas = @()
  if ($Foto.componentes.Count -eq 0) { $problemas += "a foto ficou com 0 componentes (nenhuma das solucoes pedidas existe neste ambiente)" }
  $fluxos = @($FluxoIds.Keys | Where-Object { -not $Foto.fluxos.ContainsKey($_) } | Sort-Object)
  if ($fluxos.Count) { $problemas += "fluxos das solucoes sem estado na foto ($($fluxos.Count)): $($fluxos -join ', ')" }
  $steps = @($StepIds.Keys | Where-Object { -not $Foto.steps.ContainsKey($_) } | Sort-Object)
  if ($steps.Count) { $problemas += "steps das solucoes sem estado na foto ($($steps.Count)): $($steps -join ', ')" }
  if ($problemas.Count) { throw "Foto incompleta: $($problemas -join '; ')" }
}

# Contagem EXATA de registros de uma tabela ($Entidade: LogicalName, EntitySetName, PrimaryIdAttribute).
# FetchXML agregado; so o erro de limite de agregacao do Dataverse (50.000: AggregateQueryRecordLimit / 0x8004E023) cai na
# contagem paginada de ids, que tambem e exata. Qualquer outro erro (401/403, 429, 5xx, timeout) sobe com a tabela e o corpo
# da resposta: contagem aproximada escondida desligaria a deteccao de perda do comparar-fotos. Devolve @{ Total; Paginada }.
function Get-ContagemRegistros($Dv, $Entidade) {
  $nome = [string] $Entidade.LogicalName
  $fetch = "<fetch aggregate='true'><entity name='$nome'><attribute name='$($Entidade.PrimaryIdAttribute)' alias='n' aggregate='count'/></entity></fetch>"
  try { $resposta = Invoke-RestMethod -Method Get -Uri "$($Dv.Api)/$($Entidade.EntitySetName)?fetchXml=$([uri]::EscapeDataString($fetch))" -Headers $Dv.Headers }
  catch {
    $erro = Get-ErroDv $_
    if ($erro -notmatch 'AggregateQueryRecordLimit|0x8004E023') { throw "Contagem de $nome falhou: $erro" }
    try { return @{ Total = @(Read-DvAll $Dv "$($Entidade.EntitySetName)?`$select=$($Entidade.PrimaryIdAttribute)").Count; Paginada = $true } }
    catch { throw "Contagem paginada de $nome falhou: $(Get-ErroDv $_)" }
  }
  # A analise fica fora do try: resposta fora do formato tambem falha alto.
  $linhas = @(if ($resposta -and $resposta.PSObject.Properties['value']) { $resposta.value })
  if ($linhas.Count -ne 1 -or -not $linhas[0].PSObject.Properties['n']) { throw "Contagem de $nome voltou num formato inesperado: $(ConvertTo-Json -InputObject $resposta -Depth 4 -Compress)" }
  return @{ Total = [int] $linhas[0].n; Paginada = $false }
}
