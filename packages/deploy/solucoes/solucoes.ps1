# Operacoes de solucao para a segmentacao da AppBetinhos (dot-source depois do dataverse.ps1).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:Solucoes = @("BetinhosCore", "BetinhosAutomacao", "BetinhosInterface", "BetinhosMotoristas")
# BetinhosMotoristas continua nas 4 (distribuicao e conferencia), mas e publicada so pelo repositorio app-motoristas-v2.
$script:SolucoesPublicadasAqui = @("BetinhosCore", "BetinhosAutomacao", "BetinhosInterface")
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
# A metadata (todas as tabelas com todos os atributos) e grande: lida uma vez por ambiente e reaproveitada entre as solucoes.
$script:MetadataPorHost = @{}
function Resolve-TabelaPaiDasDependencias($Dv, $Dependencias) {
  foreach ($d in @($Dependencias)) {
    if ($d.pai -or @(2, 26, 60) -notcontains $d.tipo) { continue }
    if (-not $script:MetadataPorHost.ContainsKey($Dv.Host)) {
      $tabelas = @{}
      $atributos = @{}
      foreach ($e in @(Read-DvAll $Dv "EntityDefinitions?`$select=LogicalName,MetadataId&`$expand=Attributes(`$select=LogicalName,MetadataId)")) {
        $idTabela = ([string] $e.MetadataId).ToLowerInvariant()
        $tabelas[[string] $e.LogicalName] = $idTabela
        foreach ($a in @($e.Attributes)) { $atributos[([string] $a.MetadataId).ToLowerInvariant()] = $idTabela }
      }
      $script:MetadataPorHost[$Dv.Host] = @{ Tabelas = $tabelas; Atributos = $atributos }
    }
    $meta = $script:MetadataPorHost[$Dv.Host]
    $logico = $null
    if ($d.tipo -eq 2) { if ($meta.Atributos.ContainsKey($d.requerido)) { $d.pai = $meta.Atributos[$d.requerido] } }
    elseif ($d.tipo -eq 26) { $logico = @(Read-DvAll $Dv "savedqueries?`$select=returnedtypecode&`$filter=savedqueryid eq $($d.requerido)" | ForEach-Object { [string] $_.returnedtypecode }) }
    else { $logico = @(Read-DvAll $Dv "systemforms?`$select=objecttypecode&`$filter=formid eq $($d.requerido)" | ForEach-Object { [string] $_.objecttypecode }) }
    if ($logico -and $logico.Count -eq 1 -and $meta.Tabelas.ContainsKey($logico[0])) { $d.pai = $meta.Tabelas[$logico[0]] }
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
    # Uma linha "nome<TAB>hash do conteudo" por entrada: sem fronteira entre nome e conteudo, entradas diferentes colidiriam.
    foreach ($e in ($zip.Entries | Where-Object { @("solution.xml", "[Content_Types].xml") -notcontains $_.FullName } | Sort-Object FullName)) {
      $conteudo = New-Object IO.MemoryStream
      $s = $e.Open()
      try { $s.CopyTo($conteudo) } finally { $s.Dispose() }
      $linha = [Text.Encoding]::UTF8.GetBytes("$($e.FullName)`t$(Get-Sha256Hex ($conteudo.ToArray()))`n")
      $buffer.Write($linha, 0, $linha.Length)
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
# Pode pular o import: o ambiente esta na versao registrada na ultima publicacao que passou e o pacote tem o mesmo conteudo
# dela. A versao protege de ambiente sobrescrito (pac admin copy) ou mexido fora do fluxo: nesse caso importa.
function Test-PodePular($Item, [string] $Instalada, $Publicadas) {
  if (-not $Instalada -or -not $Item.hash) { return $false }
  $ultimo = @(@($Publicadas) | Where-Object { $_ -and $_.solucao -eq $Item.solucao })
  return ($ultimo.Count -eq 1 -and [string] $ultimo[0].versao -eq $Instalada -and [string] $ultimo[0].hash -eq [string] $Item.hash)
}

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
# Excecao: tabela recem-criada pelo import responde 404 "Resource not found for the segment" (0x80060888) por alguns minutos,
# ate a Web API conhecer o EntitySetName (PROD, 09/11/2026, new_inscricaopushmotorista). Espera e tenta de novo; persistindo,
# falha alto como os outros erros.
$script:TentativasTabelaNova = 10
$script:SegundosTabelaNova = 30
function Get-ContagemRegistros($Dv, $Entidade) {
  $nome = [string] $Entidade.LogicalName
  $fetch = "<fetch aggregate='true'><entity name='$nome'><attribute name='$($Entidade.PrimaryIdAttribute)' alias='n' aggregate='count'/></entity></fetch>"
  $tentativa = 0
  do {
    $tentativa++
    $erro = $null
    try { $resposta = Invoke-RestMethod -Method Get -Uri "$($Dv.Api)/$($Entidade.EntitySetName)?fetchXml=$([uri]::EscapeDataString($fetch))" -Headers $Dv.Headers }
    catch { $erro = Get-ErroDv $_ }
    if ($erro -and $erro -match '0x80060888|Resource not found for the segment' -and $tentativa -lt $script:TentativasTabelaNova) {
      Write-Step "contagem de ${nome}: tabela ainda desconhecida pela Web API (tentativa $tentativa); de novo em $($script:SegundosTabelaNova) s"
      Start-Sleep -Seconds $script:SegundosTabelaNova
      continue
    }
    break
  } while ($true)
  if ($erro) {
    if ($erro -notmatch 'AggregateQueryRecordLimit|0x8004E023') { throw "Contagem de $nome falhou: $erro" }
    try { return @{ Total = @(Read-DvAll $Dv "$($Entidade.EntitySetName)?`$select=$($Entidade.PrimaryIdAttribute)").Count; Paginada = $true } }
    catch { throw "Contagem paginada de $nome falhou: $(Get-ErroDv $_)" }
  }
  # A analise fica fora do try: resposta fora do formato tambem falha alto.
  $linhas = @(if ($resposta -and $resposta.PSObject.Properties['value']) { $resposta.value })
  if ($linhas.Count -ne 1 -or -not $linhas[0].PSObject.Properties['n']) { throw "Contagem de $nome voltou num formato inesperado: $(ConvertTo-Json -InputObject $resposta -Depth 4 -Compress)" }
  return @{ Total = [int] $linhas[0].n; Paginada = $false }
}

# --- Publicacao no TEST e no PROD (workflows publicar.yml e retirar-caixa.yml) ---

$script:HostTest = "appbetinhostest.crm2.dynamics.com"
$script:HostProd = "orgf261ae8e.crm2.dynamics.com"
$script:HostsAlvo = @{ Test = $script:HostTest; Prod = $script:HostProd }
# Solucoes que a retirada desinstala (caixa de entrada do DEV e a antiga de pagantes), na ordem.
$script:Caixas = @("AppBetinhos", "gerarpagantes")
$script:SegundosEntreTentativas = 120

# Toda escrita fora do DEV exige o alvo explicito ('Test' ou 'Prod') e a conexao no host desse alvo: nenhum script chega ao
# PROD por engano com a URL errada, e o DEV nunca e alvo de import, retirada ou mudanca de estado.
function Assert-HostAlvo($Dv, [string] $Alvo) {
  if (-not $script:HostsAlvo.ContainsKey($Alvo)) { throw "Alvo '$Alvo' desconhecido (use Test ou Prod)." }
  $esperado = $script:HostsAlvo[$Alvo]
  if ([string] $Dv.Host -ne $esperado) { throw "Operacao com alvo $Alvo so e permitida em $esperado; recebi '$($Dv.Host)'." }
}
function Assert-HostTest($Dv) { Assert-HostAlvo $Dv "Test" }

# Estado de fluxo ($Conjunto "workflows": 1 = ativado) ou de step ("sdkmessageprocessingsteps": 0 = habilitado, 1 = desabilitado).
# Os dois conjuntos usam o mesmo par statecode/statuscode, que o Dataverse exige juntos: 0 -> 0/1, 1 -> 1/2.
function Set-EstadoDv($Dv, [string] $Alvo, [string] $Conjunto, [string] $Id, [int] $Estado) {
  Assert-HostAlvo $Dv $Alvo
  $corpo = if ($Estado -eq 1) { @{ statecode = 1; statuscode = 2 } } else { @{ statecode = 0; statuscode = 1 } }
  Invoke-RestMethod -Method Patch -Uri "$($Dv.Api)/$($Conjunto)($Id)" -Headers $Dv.Headers -Body (ConvertTo-Json $corpo -Compress) -ContentType "application/json" | Out-Null
}

# Devolve o estado ligado/desligado de cada fluxo e step de uma foto ao que a foto registrou (o import com --activate-plugins
# liga o que o ambiente tinha desligado de proposito). So toca em id que existe nos dois lados; o que a foto nao tem fica como esta.
# -DesligarNovos (TEST travado): fluxo de nuvem e step das solucoes rastreadas (as 4 e as caixas) que nao estao na foto e chegaram
# ligados sao desligados, para o ensaio nao mandar e-mail, WhatsApp nem cobranca a clientes reais (regra de negocio e BPF,
# categorias 2 e 4, ficam). O que esta fora dessas solucoes (AutoNumberGuard, acoes do sistema...) nao e "novo" e fica como esta.
# Devolve a lista das mudancas feitas e das falhas.
function Restore-Estados($Dv, [string] $Alvo, $Foto, [switch] $DesligarNovos) {
  Assert-HostAlvo $Dv $Alvo
  $mudancas = @(); $falhas = @()
  $fluxosAgora = @{}; $categorias = @{}; $nomes = @{}
  foreach ($w in @(Read-DvAll $Dv "workflows?`$select=workflowid,name,statecode,category&`$filter=type eq 1")) {
    $id = ([string] $w.workflowid).ToLowerInvariant()
    $fluxosAgora[$id] = [int] $w.statecode; $categorias[$id] = [int] $w.category; $nomes[$id] = [string] $w.name
  }
  $stepsAgora = @{}
  foreach ($s in @(Read-DvAll $Dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode&`$filter=customizationlevel eq 1")) {
    $id = ([string] $s.sdkmessageprocessingstepid).ToLowerInvariant()
    $stepsAgora[$id] = [int] $s.statecode; $nomes[$id] = [string] $s.name
  }
  $naFoto = @{}
  foreach ($p in $Foto.fluxos.PSObject.Properties) {
    $id = $p.Name.ToLowerInvariant(); $antes = [int] $p.Value.estado; $naFoto[$id] = $true
    if (-not $fluxosAgora.ContainsKey($id) -or $fluxosAgora[$id] -eq $antes) { continue }
    try { Set-EstadoDv $Dv $Alvo "workflows" $id $antes; $mudancas += [ordered]@{ tipo = "fluxo"; id = $id; nome = [string] $p.Value.nome; de = $fluxosAgora[$id]; para = $antes } }
    catch { $falhas += "fluxo $($p.Value.nome) ($id): $(Get-ErroDv $_)" }
  }
  foreach ($p in $Foto.steps.PSObject.Properties) {
    $id = $p.Name.ToLowerInvariant(); $antes = [int] $p.Value.estado; $naFoto[$id] = $true
    if (-not $stepsAgora.ContainsKey($id) -or $stepsAgora[$id] -eq $antes) { continue }
    try { Set-EstadoDv $Dv $Alvo "sdkmessageprocessingsteps" $id $antes; $mudancas += [ordered]@{ tipo = "step"; id = $id; nome = [string] $p.Value.nome; de = $stepsAgora[$id]; para = $antes } }
    catch { $falhas += "step $($p.Value.nome) ($id): $(Get-ErroDv $_)" }
  }
  if ($DesligarNovos) {
    # "Novo" = fluxo (29) ou step (92) das solucoes rastreadas que a foto nao tem; a foto so cobre essas solucoes.
    $rastreados = @{}
    foreach ($sol in @($script:Solucoes) + $script:Caixas) {
      $sid = Get-SolucaoId $Dv $sol
      if (-not $sid) { continue }
      foreach ($l in @(Get-LinhasDaSolucao $Dv $sid)) { if ($l.tipo -eq 29 -or $l.tipo -eq 92) { $rastreados[$l.id] = $true } }
    }
    foreach ($id in @($fluxosAgora.Keys | Where-Object { $rastreados.ContainsKey($_) -and -not $naFoto.ContainsKey($_) -and $fluxosAgora[$_] -eq 1 -and @(2, 4) -notcontains $categorias[$_] })) {
      try { Set-EstadoDv $Dv $Alvo "workflows" $id 0; $mudancas += [ordered]@{ tipo = "fluxo novo"; id = $id; nome = $nomes[$id]; de = 1; para = 0 } }
      catch { $falhas += "fluxo novo $($nomes[$id]) ($id): $(Get-ErroDv $_)" }
    }
    foreach ($id in @($stepsAgora.Keys | Where-Object { $rastreados.ContainsKey($_) -and -not $naFoto.ContainsKey($_) -and $stepsAgora[$_] -eq 0 })) {
      try { Set-EstadoDv $Dv $Alvo "sdkmessageprocessingsteps" $id 1; $mudancas += [ordered]@{ tipo = "step novo"; id = $id; nome = $nomes[$id]; de = 0; para = 1 } }
      catch { $falhas += "step novo $($nomes[$id]) ($id): $(Get-ErroDv $_)" }
    }
  }
  return @{ Mudancas = $mudancas; Falhas = $falhas }
}

# Espera ate $Minutos a solucao sumir do ambiente (desinstalacao que continua no servidor depois de o pac perder a conexao).
# Desinstalacao da AppBetinhos com os 430 componentes legados passou de 75 min no TEST (30/10/2026): espera padrao de 3 h.
function Wait-SolucaoRemovida($Dv, [string] $Nome, [int] $Minutos = 180, [int] $IntervaloSegundos = 60) {
  $limite = (Get-Date).AddMinutes($Minutos)
  do {
    if ($null -eq (Get-VersaoInstalada (Update-DvToken $Dv) $Nome)) { return $true }
    if ((Get-Date) -ge $limite) { return $false }
    Start-Sleep -Seconds $IntervaloSegundos
  } while ($true)
}

# Desinstala uma solucao gerenciada da caixa (AppBetinhos ou gerarpagantes) e prova pela ausencia. Nunca as 4 novas.
function Remove-SolucaoGerenciada($Dv, [string] $Alvo, [string] $Nome, [int] $MinutosDeEspera = 180) {
  Assert-HostAlvo $Dv $Alvo
  if ($script:Caixas -notcontains $Nome) { throw "Remove-SolucaoGerenciada so desinstala $($script:Caixas -join ' e '); recebi '$Nome'." }
  if ($null -eq (Get-VersaoInstalada $Dv $Nome)) { Write-Step "$Nome ja nao existe em $($Dv.Host)"; return @{ Nome = $Nome; JaAusente = $true; PacPerdeuConexao = $false } }
  $erroPac = $null
  try { Invoke-Pac $Dv.Url @("solution", "delete", "--solution-name", $Nome) | Out-Null }
  catch {
    $erroPac = "$($_.Exception.Message)"
    # "Uninstall ja em andamento" (ensaio de 22/10) tambem e sinal de que a operacao segue no servidor.
    if (-not (Test-PacPerdeuConexao $erroPac) -and $erroPac -notmatch 'already in progress|em andamento') { throw "Desinstalacao de $Nome falhou em $($Dv.Host): $erroPac" }
    Write-Step "pac perdeu a conexao ($erroPac); conferindo se $Nome saiu"
  }
  $minutos = if ($erroPac) { $MinutosDeEspera } else { 0 }
  if (-not (Wait-SolucaoRemovida $Dv $Nome $minutos)) { throw "$Nome continua instalada em $($Dv.Host). $erroPac" }
  return @{ Nome = $Nome; JaAusente = $false; PacPerdeuConexao = [bool] $erroPac }
}

# Proxima revisao (1.0.0.4 -> 1.0.0.5): o import com --stage-and-upgrade exige versao maior que a instalada, e o DEV
# (origem de tudo que o TEST recebe) sempre esta na versao mais alta.
function Get-VersaoSeguinte([string] $Versao) {
  $partes = @($Versao.Split("."))
  if ($partes.Count -ne 4 -or @($partes | Where-Object { $_ -notmatch '^\d+$' }).Count) { throw "Versao '$Versao' fora do formato a.b.c.d." }
  $partes[3] = [string] ([int64] $partes[3] + 1)
  return ($partes -join ".")
}

# Lista do workflow ("BetinhosCore,BetinhosInterface"; vazia = as 4) na ordem de import (camada mais baixa primeiro).
function Get-SolucoesEscolhidas([string] $Lista) {
  $pedidas = @($Lista -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($pedidas.Count -eq 0) { return $script:SolucoesPublicadasAqui }
  if ($pedidas -contains "BetinhosMotoristas") { throw "BetinhosMotoristas e publicada pelo repositorio app-motoristas-v2." }
  $estranhas = @($pedidas | Where-Object { $script:SolucoesPublicadasAqui -notcontains $_ })
  if ($estranhas.Count) { throw "Solucao fora do Sistema: $($estranhas -join ', ') (validas: $($script:SolucoesPublicadasAqui -join ', '))." }
  return @($script:SolucoesPublicadasAqui | Where-Object { $pedidas -contains $_ })
}

# Componentes publicados pelo app-motoristas-v2 (ids em minusculo): os da BetinhosMotoristas e o service worker, que no PROD
# ainda esta na BetinhosInterface. A camada Active deles e a versao que o app publicou, nao um hotfix a remover.
function Get-IdsDoApp($Dv) {
  $ids = @{}
  $solucaoId = Get-SolucaoId $Dv "BetinhosMotoristas"
  if ($solucaoId) { foreach ($linha in @(Get-LinhasDaSolucao $Dv $solucaoId)) { $ids[$linha.id] = $true } }
  foreach ($sw in @(Read-DvAll $Dv "webresourceset?`$select=webresourceid&`$filter=name eq 'new_app-motoristas-v2-sw'")) {
    $ids[([string] $sw.webresourceid).ToLowerInvariant()] = $true
  }
  return $ids
}

function Get-VersaoInstalada($Dv, [string] $Nome) {
  $linhas = @(Read-DvAll $Dv "solutions?`$select=version&`$filter=uniquename eq '$Nome'")
  if ($linhas.Count -eq 0) { return $null }
  return [string] $linhas[0].version
}

# O pac perde a conexao em operacoes longas e o import continua no servidor: a prova e a versao instalada.
# Espera ate $Minutos a solucao chegar na versao; devolve $true se chegou.
# Token de uma hora: numa espera longa ele vence (401 aos 60 min da conexao, duas vezes no ensaio de 30/10/2026). Renova o
# cabecalho aos 40 min contados de ConectadoEm (carimbado pelo Connect-Dataverse); a hashtable e atualizada no lugar, entao quem
# chamou continua com a mesma conexao.
function Update-DvToken($Dv) {
  if (-not $Dv.ContainsKey("ConectadoEm")) { $Dv.ConectadoEm = Get-Date }
  if (((Get-Date) - $Dv.ConectadoEm).TotalMinutes -ge 40) {
    $novo = Connect-Dataverse $Dv.Url @($Dv.Host)
    $Dv.Headers = $novo.Headers; $Dv.ConectadoEm = Get-Date
  }
  return $Dv
}

# O pac so merece espera quando perdeu a conexao com a operacao (que continua no servidor). Falha declarada pelo servidor
# ("statuscode of Failed", manifesto, dependencia) e definitiva: esperar so atrasa e vence o token.
function Test-PacPerdeuConexao([string] $Erro) {
  if ($Erro -match 'statuscode of Failed|FAILURE|Failed within') { return $false }
  return [bool] ($Erro -match 'sending the request|timed out|time out|timeout|connection|Unable to connect|ServiceUnavailable|Gateway')
}

# Falha transitoria do proprio servidor no meio de uma operacao longa (ensaio de 30/10/2026: "Connection State is closed"
# aos 31 min do upgrade da AppBetinhos no TEST, sem deixar solucao de retencao). Merece uma nova tentativa, nao espera.
function Test-FalhaTransitoriaDoServidor([string] $Erro) {
  return [bool] ($Erro -match 'Connection State is closed|SQL timeout|Generic SQL error|deadlock|try again later')
}

# Primeira instalacao vai sem --stage-and-upgrade: o Dataverse recusa a solucao de retencao sem base ("Cannot create a
# holding solution for missing base"). Com versao instalada, upgrade com stage, que e o que apaga o que saiu da solucao.
function Get-ArgumentosDeImport([string] $Caminho, [string] $VersaoInstalada, [string] $Configuracao = "") {
  $args = @("solution", "import", "--path", $Caminho)
  if ($VersaoInstalada) { $args += "--stage-and-upgrade" }
  if ($Configuracao) { $args += @("--settings-file", $Configuracao) }
  return $args + @("--publish-changes", "--activate-plugins", "--async", "--max-async-wait-time", "180")
}

function Wait-VersaoInstalada($Dv, [string] $Nome, [string] $Versao, [int] $Minutos = 60, [int] $IntervaloSegundos = 60) {
  $limite = (Get-Date).AddMinutes($Minutos)
  do {
    if ((Get-VersaoInstalada (Update-DvToken $Dv) $Nome) -eq $Versao) { return $true }
    if ((Get-Date) -ge $limite) { return $false }
    Start-Sleep -Seconds $IntervaloSegundos
  } while ($true)
}

# "Novo Servico" e "Retirado" usam a referencia do Web Push (BetinhosAutomacao). Sem conexao, o flow nao religa (0x80060467, ensaio
# de 06/11/2026) e o PROD ficaria sem aviso ao motorista. A referencia so existe depois do import, entao a conexao entra por ele.
$script:ReferenciaWebPush = "new_webpushmotoristas"
# O conector personalizado tem o mesmo nome em todo ambiente, mas o id interno ganha um sufixo por ambiente (DEV ...5f30e351431b40001e,
# PROD ...5f10c3aafe51dca724). Por isso o id do --settings-file e lido no ambiente de destino, na hora do import.
$script:NomeConectorWebPush = "new_app-20motoristas-20web-20push"
function Get-ConectorWebPush($Dv) {
  $linhas = @(Read-DvAll $Dv "connectors?`$select=connectorinternalid&`$filter=name eq '$($script:NomeConectorWebPush)'" | Where-Object { $_.connectorinternalid })
  if ($linhas.Count -ne 1) { throw "Conector $($script:NomeConectorWebPush) nao encontrado (ou repetido: $($linhas.Count)) no ambiente de destino; sem ele o vinculo do Web Push nao pode ser montado." }
  return "/providers/Microsoft.PowerApps/apis/$($linhas[0].connectorinternalid)"
}

# O vinculo por --settings-file exige que a conta do CI possa usar a conexao (ConnectionAuthorizationFailed no ensaio de
# 09/11/2026), e o Power Platform nao deixa compartilhar a conexao com service principal. Mas a permissao so e cobrada quando o
# vinculo muda: com a referencia ja ligada a mesma conexao, o import passa. Por isso o primeiro vinculo de um ambiente e feito
# por quem e dono da conexao, depois do import, e a variavel WEBPUSH_VINCULAR_DEPOIS=true do environment pula o --settings-file
# nessa publicacao. Depois do vinculo, apague a variavel: as publicacoes seguintes voltam a mandar o mesmo vinculo.
function Get-ConexaoWebPushDoImport([string] $Conexao, [string] $VincularDepois) {
  if ($VincularDepois -eq "true") { return "" }
  return $Conexao
}

# PROD sem a conexao nao comeca: recusa antes do primeiro import, para nao deixar a publicacao pela metade.
function Assert-ConexaoWebPush([string[]] $Solucoes, [string] $Alvo, [string] $Conexao, [string] $VincularDepois = "") {
  if ($Alvo -eq "Prod" -and $Solucoes -contains "BetinhosAutomacao" -and -not $Conexao -and $VincularDepois -ne "true") {
    throw "BetinhosAutomacao no PROD exige a variavel CONEXAO_WEBPUSH do environment prod (ou WEBPUSH_VINCULAR_DEPOIS=true no primeiro vinculo). Publique so a BetinhosCore, crie a conexao e grave o id dela."
  }
}

# Grava o arquivo de --settings-file da BetinhosAutomacao. Sem conexao (TEST sem Web Push), nao ha arquivo.
function New-ConfiguracaoDeImport([string] $Pasta, [string] $Solucao, [string] $Conexao, [string] $Conector) {
  if ($Solucao -ne "BetinhosAutomacao" -or -not $Conexao) { return "" }
  if (-not $Conector) { throw "Vinculo do Web Push sem o id do conector do ambiente de destino (Get-ConectorWebPush)." }
  $caminho = Join-Path $Pasta "configuracao-$Solucao.json"
  $corpo = [ordered]@{ EnvironmentVariables = @(); ConnectionReferences = @([ordered]@{ LogicalName = $script:ReferenciaWebPush; ConnectionId = $Conexao; ConnectorId = $Conector }) }
  [IO.File]::WriteAllText($caminho, (ConvertTo-Json $corpo -Depth 4), (New-Object Text.UTF8Encoding $false))
  return $caminho
}

# Importa o ZIP gerenciado com upgrade e prova pela versao instalada. Pac com erro nao e falha se a versao chegou.
# $Alvo: Test ou Prod (explicito). $Permitidas: as 4 por padrao; a retirada passa tambem AppBetinhos (upgrade antes de desinstalar).
function Import-SolucaoGerenciada($Dv, [string] $Caminho, [string] $Alvo = "Test", [int] $MinutosDeEspera = 60, [string[]] $Permitidas = $script:Solucoes, [string] $Configuracao = "") {
  Assert-HostAlvo $Dv $Alvo
  $m = Get-ManifestoDoPacote $Caminho
  if (-not $m.Managed) { throw "$Caminho nao e gerenciada." }
  if ($Permitidas -notcontains $m.UniqueName) { throw "$Caminho e '$($m.UniqueName)', fora de: $($Permitidas -join ', ')." }
  $erroPac = $null
  $tentativas = 0
  do {
    $tentativas++
    $erroPac = $null
    try { Invoke-Pac $Dv.Url (Get-ArgumentosDeImport $Caminho (Get-VersaoInstalada (Update-DvToken $Dv) $m.UniqueName) $Configuracao) | Out-Null }
    catch {
      $erroPac = "$($_.Exception.Message)"
      if ($tentativas -lt 2 -and (Test-FalhaTransitoriaDoServidor $erroPac) -and (Get-VersaoInstalada (Update-DvToken $Dv) $m.UniqueName) -ne $m.Version) {
        Write-Step "falha transitoria do servidor no import de $($m.UniqueName) (tentativa $tentativas): $erroPac. Tentando de novo em 2 min."
        Start-Sleep -Seconds $script:SegundosEntreTentativas
        continue
      }
      if (-not (Test-PacPerdeuConexao $erroPac)) { throw "Import de $($m.UniqueName) falhou em $($Dv.Host): $erroPac" }
      Write-Step "pac perdeu a conexao ($erroPac); conferindo a versao instalada de $($m.UniqueName)"
    }
    break
  } while ($true)
  $minutos = if ($erroPac) { $MinutosDeEspera } else { 0 }
  if (-not (Wait-VersaoInstalada $Dv $m.UniqueName $m.Version $minutos)) {
    throw "$($m.UniqueName) nao chegou a versao $($m.Version) em $($Dv.Host). $erroPac"
  }
  return @{ Nome = $m.UniqueName; Versao = $m.Version; PacPerdeuConexao = [bool] $erroPac }
}
