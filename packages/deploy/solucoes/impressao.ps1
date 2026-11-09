# Leituras em paralelo, impressao digital de uma solucao no DEV e decisao de export (exportar-do-dev.ps1).
# Dot-source depois de dataverse.ps1 e solucoes.ps1. Testes: testa-impressao.ps1.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

# --- Paralelo (PowerShell 5.1: runspaces, sem ThreadJob) ---
# Roda $Bloco para cada item em ate $Limite runspaces. Cada runspace carrega os scripts de $Carregar (dot-source) e recebe
# o item e $Argumentos. Devolve, na ordem dos itens, [pscustomobject]@{ Item; Resultado; Erro }: o erro de um nao para os outros.
# $script:ParaleloSequencial (testes): roda no proprio escopo, onde as respostas simuladas valem.
$script:ParaleloSequencial = $false
function Invoke-EmParalelo([object[]] $Itens, [scriptblock] $Bloco, [object[]] $Argumentos = @(), [string[]] $Carregar = @(), [int] $Limite = 8) {
  $Itens = @($Itens)
  if ($script:ParaleloSequencial -or $Itens.Count -le 1) {
    return @(foreach ($i in $Itens) {
        try { [pscustomobject]@{ Item = $i; Resultado = (& $Bloco $i @Argumentos); Erro = $null } }
        catch { [pscustomobject]@{ Item = $i; Resultado = $null; Erro = "$($_.Exception.Message)" } }
      })
  }
  $carga = @($Carregar | ForEach-Object { ". '$($_.Replace("'", "''"))'" }) -join "`n"
  $texto = "$carga`n`$ErrorActionPreference = 'Stop'`nSet-StrictMode -Version Latest`n& {`n$($Bloco.ToString())`n} @args"
  $pool = [runspacefactory]::CreateRunspacePool(1, $Limite)
  $pool.Open()
  try {
    $tarefas = @(foreach ($i in $Itens) {
        $ps = [powershell]::Create()
        $ps.RunspacePool = $pool
        [void] $ps.AddScript($texto).AddArgument($i)
        foreach ($a in $Argumentos) { [void] $ps.AddArgument($a) }
        @{ Item = $i; Ps = $ps; Async = $ps.BeginInvoke() }
      })
    return @(foreach ($t in $tarefas) {
        try {
          $saida = @($t.Ps.EndInvoke($t.Async))
          $valor = if ($saida.Count -eq 0) { $null } elseif ($saida.Count -eq 1) { $saida[0] } else { $saida }
          [pscustomobject]@{ Item = $t.Item; Resultado = $valor; Erro = $null }
        }
        catch {
          $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
          [pscustomobject]@{ Item = $t.Item; Resultado = $null; Erro = $e.Message }
        }
        finally { $t.Ps.Dispose() }
      })
  }
  finally { $pool.Close(); $pool.Dispose() }
}

# Campo de hashtable ou de objeto do JSON; $null se nao existir (StrictMode recusa propriedade ausente).
function Get-Campo($Objeto, [string] $Nome) {
  if ($null -eq $Objeto) { return $null }
  if ($Objeto -is [Collections.IDictionary]) { if ($Objeto.Contains($Nome)) { return $Objeto[$Nome] }; return $null }
  $p = $Objeto.PSObject.Properties[$Nome]
  if ($p) { return $p.Value }
  return $null
}

# --- Impressao digital ---
# Resume o conteudo de uma solucao no DEV sem exportar. Criterio: o valor muda quando muda qualquer coisa que o export levaria;
# quando nao ha como saber (tipo sem leitor, leitura que falhou, componente sem registro), a impressao fica "incerta" e a solucao
# e exportada. Entra no valor:
#  - cada linha de solutioncomponents (id, tipo, comportamento): componente incluido ou retirado;
#  - tabela (1): o JSON da metadata (colunas, chaves, relacionamentos e as opcoes de cada coluna de escolha, sim/nao, estado e
#    status) e o modifiedon de formularios, visoes, graficos e regras de negocio da tabela (subcomponentes vao no export);
#  - escolha global (9): o JSON da definicao; papel (20): modifiedon e o JSON dos privilegios; perfil de seguranca de coluna (70):
#    modifiedon do perfil e das permissoes;
#  - tipos com registro proprio ($LeitoresPorTipo) e componentes de tabela (tipo >= 10000, ex. Custom API): modifiedon.
# Lacunas conhecidas (por isso o modo observar antes de confiar): faixa de opcoes classica (RibbonDiffXml) e o que nao atualiza
# modifiedon nem a metadata. Coluna, relacionamento ou chave soltos (2, 10, 14) ficam incertos.
$script:LeitoresPorTipo = @{
  20 = @("roles", "roleid"); 26 = @("savedqueries", "savedqueryid"); 29 = @("workflows", "workflowid")
  59 = @("savedqueryvisualizations", "savedqueryvisualizationid"); 60 = @("systemforms", "formid"); 61 = @("webresourceset", "webresourceid")
  62 = @("sitemaps", "sitemapid"); 70 = @("fieldsecurityprofiles", "fieldsecurityprofileid"); 80 = @("appmodules", "appmoduleid")
  90 = @("plugintypes", "plugintypeid"); 91 = @("pluginassemblies", "pluginassemblyid"); 92 = @("sdkmessageprocessingsteps", "sdkmessageprocessingstepid")
  300 = @("canvasapps", "canvasappid"); 372 = @("connectors", "connectorid"); 380 = @("environmentvariabledefinitions", "environmentvariabledefinitionid")
  431 = @("attributeimageconfigs", "attributeimageconfigid"); 432 = @("entityimageconfigs", "entityimageconfigid")
}
# Subcomponentes da tabela: conjunto, chave, coluna com o nome logico da tabela e filtro.
$script:SubcomponentesDaTabela = @(
  @("systemforms", "formid", "objecttypecode", ""), @("savedqueries", "savedqueryid", "returnedtypecode", ""),
  @("savedqueryvisualizations", "savedqueryvisualizationid", "primaryentitytypecode", ""), @("workflows", "workflowid", "primaryentity", "category eq 2")
)
$script:ColunasDeOpcao = @("PicklistAttributeMetadata", "MultiSelectPicklistAttributeMetadata", "StateAttributeMetadata", "StatusAttributeMetadata", "BooleanAttributeMetadata")

function Get-ImpressaoDigital($Dv, [string] $Nome) {
  $motivos = New-Object Collections.Generic.List[string]
  $linhas = New-Object Collections.Generic.List[string]
  $sid = Get-SolucaoId $Dv $Nome
  if (-not $sid) { throw "Solucao $Nome nao existe em $($Dv.Host)." }
  $componentes = @(Get-LinhasDaSolucao $Dv $sid)
  foreach ($c in $componentes) { $linhas.Add("c|$($c.id)|$($c.tipo)|$($c.comportamento)") }
  $porTipo = @{}
  foreach ($c in $componentes) { if (-not $porTipo.ContainsKey($c.tipo)) { $porTipo[$c.tipo] = @() }; $porTipo[$c.tipo] += $c.id }

  # Consulta em lote: id -> modifiedon (e a coluna extra, se houver). Falha vira motivo, nunca aprovacao.
  $lote = {
    param([string] $Caminho, [string] $Chave, [string] $Extra)
    $mapa = @{}
    try {
      foreach ($r in @(Read-DvAll $Dv $Caminho)) { $mapa[([string] $r.$Chave).ToLowerInvariant()] = @{ data = [string] $r.modifiedon; extra = if ($Extra) { [string] $r.$Extra } else { "" } } }
      return $mapa
    }
    catch { $motivos.Add("leitura de $($Caminho.Split('?')[0]) falhou: $(Get-ErroDv $_)"); return $null }
  }
  $porData = {
    param([int] $Tipo, [string] $Conjunto, [string] $Chave)
    $mapa = & $lote "$Conjunto`?`$select=$Chave,modifiedon" $Chave ""
    if ($null -eq $mapa) { return }
    foreach ($id in $porTipo[$Tipo]) {
      if ($mapa.ContainsKey($id)) { $linhas.Add("r|$Tipo|$id|$($mapa[$id].data)") } else { $motivos.Add("tipo $Tipo $id sem registro em $Conjunto") }
    }
  }

  $textos = @()
  $tabelas = $null; $tiposEntidade = $null
  $precisaTabelas = $porTipo.ContainsKey(1) -or @($porTipo.Keys | Where-Object { $_ -ge 10000 }).Count
  if ($precisaTabelas) {
    try { $tabelas = @(Read-DvAll $Dv "EntityDefinitions?`$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute") }
    catch { $motivos.Add("leitura das tabelas falhou: $(Get-ErroDv $_)") }
  }
  foreach ($tipo in @($porTipo.Keys | Sort-Object)) {
    $ids = @($porTipo[$tipo])
    if ($tipo -eq 1) {
      if ($null -eq $tabelas) { continue }
      $nomes = @{}
      foreach ($id in $ids) {
        $t = @($tabelas | Where-Object { ([string] $_.MetadataId).ToLowerInvariant() -eq $id })
        if ($t.Count -ne 1) { $motivos.Add("tabela $id sem metadata"); continue }
        $nomes[[string] $t[0].LogicalName] = $id
        $textos += "EntityDefinitions($id)?`$expand=Attributes,Keys,ManyToOneRelationships,OneToManyRelationships,ManyToManyRelationships"
        foreach ($cast in $script:ColunasDeOpcao) { $textos += "EntityDefinitions($id)/Attributes/Microsoft.Dynamics.CRM.$cast`?`$select=LogicalName&`$expand=OptionSet" }
      }
      foreach ($s in $script:SubcomponentesDaTabela) {
        $filtro = if ($s[3]) { "&`$filter=$($s[3])" } else { "" }
        $mapa = & $lote "$($s[0])?`$select=$($s[1]),$($s[2]),modifiedon$filtro" $s[1] $s[2]
        if ($null -eq $mapa) { continue }
        foreach ($k in $mapa.Keys) { if ($nomes.ContainsKey($mapa[$k].extra)) { $linhas.Add("s|$($nomes[$mapa[$k].extra])|$($s[0])|$k|$($mapa[$k].data)") } }
      }
    }
    elseif ($tipo -eq 9) { foreach ($id in $ids) { $textos += "GlobalOptionSetDefinitions($id)" } }
    elseif ($script:LeitoresPorTipo.ContainsKey($tipo)) {
      & $porData $tipo $script:LeitoresPorTipo[$tipo][0] $script:LeitoresPorTipo[$tipo][1]
      if ($tipo -eq 20) { foreach ($id in $ids) { $textos += "RetrieveRolePrivilegesRole(RoleId=@p)?@p=$id" } }
      if ($tipo -eq 70) {
        $mapa = & $lote "fieldpermissions?`$select=fieldpermissionid,_fieldsecurityprofileid_value,modifiedon" "fieldpermissionid" "_fieldsecurityprofileid_value"
        if ($null -ne $mapa) { foreach ($k in $mapa.Keys) { if ($ids -contains $mapa[$k].extra.ToLowerInvariant()) { $linhas.Add("p|$($mapa[$k].extra)|$k|$($mapa[$k].data)") } } }
      }
    }
    elseif ($tipo -ge 10000 -and $null -ne $tabelas) {
      if ($null -eq $tiposEntidade) { $tiposEntidade = Get-TiposPorEntidade $Dv }
      $entidade = $tiposEntidade[$tipo]
      $t = @($tabelas | Where-Object { [string] $_.LogicalName -eq $entidade })
      if (-not $entidade -or $t.Count -ne 1) { $motivos.Add("tipo $tipo sem tabela conhecida ($($ids.Count) componente(s))"); continue }
      & $porData $tipo ([string] $t[0].EntitySetName) ([string] $t[0].PrimaryIdAttribute)
    }
    elseif ($tipo -lt 10000) { $motivos.Add("tipo $tipo sem leitor ($($ids.Count) componente(s))") }
  }

  # Textos (metadata, escolhas globais, privilegios): 8 leituras por vez, hash calculado no runspace.
  $carregar = @((Join-Path $PSScriptRoot "dataverse.ps1"), (Join-Path $PSScriptRoot "solucoes.ps1"))
  $lidos = Invoke-EmParalelo -Itens $textos -Argumentos @($Dv) -Carregar $carregar -Bloco {
    param([string] $Caminho, $Dv)
    $r = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($Dv.Api)/$Caminho" -Headers $Dv.Headers
    Get-Sha256Hex ([Text.Encoding]::UTF8.GetBytes([string] $r.Content))
  }
  foreach ($l in $lidos) {
    if ($l.Erro) { $motivos.Add("leitura de $($l.Item) falhou: $($l.Erro)") } else { $linhas.Add("m|$($l.Item)|$($l.Resultado)") }
  }
  $ordenadas = @($linhas | Sort-Object)
  return @{
    valor = Get-Sha256Hex ([Text.Encoding]::UTF8.GetBytes(($ordenadas -join "`n")))
    incerto = ($motivos.Count -gt 0); motivos = @($motivos); componentes = $componentes.Count
  }
}

# --- Decisao de export (pura) ---
# $Publicadas: alvo -> registros da tag solucoes-<alvo> (so os alvos desta execucao). $Cache: entrada do manifesto do ultimo
# pacote do Deploy (ou $null). Ordem e criterio:
#  1. impressao incerta -> exportar;
#  2. pular: em TODOS os alvos a ultima publicacao que passou registrou esta mesma impressao e o mesmo hash. O import ainda
#     confere a versao instalada (Test-PodePular) e falha se o alvo estiver em outra (pac admin copy): nada e pulado as cegas;
#  3. cache: o pacote do Deploy tem esta impressao e a versao atual do DEV (ninguem exportou depois; versao maior que a de
#     qualquer alvo, porque o DEV e sempre o mais alto);
#  4. senao, exportar.
function Get-DecisaoDeExport([string] $Nome, $Impressao, [hashtable] $Publicadas, $Cache, [string] $VersaoDev) {
  if (-not $Impressao -or $Impressao.incerto -or -not $Impressao.valor) {
    return @{ acao = "exportar"; motivo = "impressao incerta: $(@(Get-Campo $Impressao 'motivos') -join '; ')" }
  }
  if ($Publicadas -and $Publicadas.Count) {
    $hashes = @(); $faltou = @()
    foreach ($alvo in @($Publicadas.Keys | Sort-Object)) {
      $r = @(@($Publicadas[$alvo]) | Where-Object { $_ -and (Get-Campo $_ 'solucao') -eq $Nome })
      if ($r.Count -eq 1 -and (Get-Campo $r[0] 'impressao') -eq $Impressao.valor -and (Get-Campo $r[0] 'hash')) { $hashes += [string] (Get-Campo $r[0] 'hash') }
      else { $faltou += $alvo }
    }
    if (-not $faltou.Count -and @($hashes | Select-Object -Unique).Count -eq 1) {
      return @{ acao = "pular"; hash = $hashes[0]; motivo = "sem mudanca desde a ultima publicacao em $(@($Publicadas.Keys | Sort-Object) -join ' e ')" }
    }
  }
  if ($Cache -and (Get-Campo $Cache 'arquivo') -and (Get-Campo $Cache 'impressao') -eq $Impressao.valor -and [string] (Get-Campo $Cache 'versao') -eq $VersaoDev -and (Get-Campo $Cache 'hash')) {
    return @{ acao = "cache"; hash = [string] $Cache.hash; arquivo = [string] $Cache.arquivo; motivo = "pacote do Deploy $(Get-Campo $Cache 'commit') sem mudanca no DEV desde entao" }
  }
  return @{ acao = "exportar"; motivo = "mudou desde a ultima publicacao e o pacote do Deploy nao serve" }
}

# Modo observar: com o export fresco em maos, a decisao que teria sido tomada acertou?
function Get-ObservacaoDaDecisao($Decisao, [string] $HashNovo) {
  if (@("pular", "cache") -notcontains $Decisao.acao) { return $null }
  if ([string] $Decisao.hash -eq $HashNovo) { return "acerto" }
  return "erro"
}

# Linha da tag solucoes-<alvo> (importar-solucoes.ps1): a impressao vai junto para a proxima decisao de export.
function New-RegistroPublicado($Item, [string] $Versao) {
  return [ordered]@{ solucao = [string] (Get-Campo $Item 'solucao'); versao = $Versao; hash = (Get-Campo $Item 'hash'); impressao = (Get-Campo $Item 'impressao') }
}

# Camada Active no topo de um componente gerenciado (remover-camadas-active.ps1): devolve a camada ou $null.
function Get-CamadaActiveNoTopo($Camadas) {
  $ordenadas = @(@($Camadas) | Sort-Object { [int] $_.msdyn_order })
  if ($ordenadas.Count -lt 2 -or $ordenadas[-1].msdyn_solutionname -ne "Active") { return $null }
  return $ordenadas[-1]
}
