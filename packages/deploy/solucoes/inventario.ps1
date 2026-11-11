# Inventario de uma solucao e escolha do modo de import (update ou upgrade). Dot-source depois de dataverse.ps1, solucoes.ps1 e
# impressao.ps1 (Invoke-EmParalelo, Get-Campo). Testes: testa-inventario.ps1.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.
#
# Por que: o --stage-and-upgrade monta uma solucao de espera e desinstala a versao antiga, o que custa ~12 min no BetinhosCore
# (ensaio de 11/11/2026: 12,1 min com upgrade, 3,0 min como update). O update troca o que veio no pacote, mas nao apaga o que
# saiu da solucao. Entao: update so quando o destino nao tem nada que o DEV deixou de ter.
#
# O inventario e o conjunto do que o upgrade apagaria se sumisse do pacote. O export grava o do DEV (o mesmo conteudo do ZIP;
# o grupo dataverse-dev impede mudanca no meio) e o import le o do destino antes de importar. Itens:
#  - c|tipo|id: cada linha de solutioncomponents (componente que saiu da solucao); tipo >= 10000 vira e:<tabela>, porque o
#    numero desses tipos muda de um ambiente para outro;
#  - tabela (1): a|tabela|coluna, k|tabela|chave, r|relacionamento, o|tabela.coluna|valor (opcoes de escolha, escolha multipla
#    e status) e s|conjunto|id de formularios, visoes, graficos e regras de negocio da tabela;
#  - escolha global (9): o|global:id|valor; papel (20): rp|papel|privilegio; perfil de seguranca de coluna (70):
#    fp|perfil|tabela.coluna; assembly (91) e pacote de plugin: pa|pacote|assembly e pt|assembly|tipo.
# Nomes logicos e ids de metadata e componentes sao os mesmos em todo ambiente (o import gerenciado preserva os ids).
# Leitura que falha deixa o inventario "incerto", e incerto sempre vira upgrade (o comportamento de antes).
# Diferenca que nao e remocao (componente que so o destino tem, de outra solucao instalada la) tambem vira upgrade: o erro
# possivel e so ficar lento como antes.

$script:CastsComOpcoes = @("PicklistAttributeMetadata", "MultiSelectPicklistAttributeMetadata", "StatusAttributeMetadata")

function Get-InventarioDaSolucao($Dv, [string] $Nome) {
  $motivos = New-Object Collections.Generic.List[string]
  $itens = New-Object 'Collections.Generic.HashSet[string]'
  $sid = Get-SolucaoId $Dv $Nome
  if (-not $sid) { return @{ itens = @(); incerto = $true; motivos = @("solucao $Nome nao existe em $($Dv.Host)") } }
  $componentes = @(Get-LinhasDaSolucao $Dv $sid)
  # Tipo >= 10000 (componente de tabela: appsetting, Custom API...) e numerado por ambiente: o mesmo componente e 10091 no DEV e
  # 10092 no TEST (observado em 11/11/2026, execucao 43061491630). No inventario entra o nome da tabela, igual em todo ambiente.
  $tabelaDoTipo = @{}
  if (@($componentes | Where-Object { $_.tipo -ge 10000 }).Count) {
    try { $tabelaDoTipo = Get-TiposPorEntidade $Dv } catch { $motivos.Add("leitura dos tipos de componente falhou: $(Get-ErroDv $_)") }
  }
  $porTipo = @{}
  foreach ($c in $componentes) {
    $tipo = [string] $c.tipo
    if ($c.tipo -ge 10000) {
      if ($tabelaDoTipo.ContainsKey($c.tipo) -and $tabelaDoTipo[$c.tipo]) { $tipo = "e:$($tabelaDoTipo[$c.tipo])" }
      else { $motivos.Add("tipo $($c.tipo) sem tabela conhecida") }
    }
    [void] $itens.Add("c|$tipo|$($c.id)")
    if (-not $porTipo.ContainsKey($c.tipo)) { $porTipo[$c.tipo] = @() }
    $porTipo[$c.tipo] += $c.id
  }
  $ids = @{}; foreach ($c in $componentes) { $ids[$c.id] = $true }
  $lista = {
    param([string] $Caminho)
    try { return @(Read-DvAll $Dv $Caminho) } catch { $motivos.Add("leitura de $($Caminho.Split('?')[0]) falhou: $(Get-ErroDv $_)"); return $null }
  }

  # Tabelas: metadata e opcoes em paralelo (8 por vez); cada leitura devolve as linhas do inventario.
  $leituras = @()
  $nomesDasTabelas = @{}
  if ($porTipo.ContainsKey(1)) {
    $tabelas = & $lista "EntityDefinitions?`$select=MetadataId,LogicalName"
    if ($null -ne $tabelas) {
      foreach ($id in $porTipo[1]) {
        $t = @($tabelas | Where-Object { ([string] $_.MetadataId).ToLowerInvariant() -eq $id })
        if ($t.Count -ne 1) { $motivos.Add("tabela $id sem metadata"); continue }
        $logico = [string] $t[0].LogicalName
        $nomesDasTabelas[$logico] = $true
        $leituras += [pscustomobject]@{ Tabela = $logico; Caminho = "EntityDefinitions($id)?`$select=LogicalName&`$expand=Attributes(`$select=LogicalName),Keys(`$select=LogicalName),OneToManyRelationships(`$select=SchemaName),ManyToOneRelationships(`$select=SchemaName),ManyToManyRelationships(`$select=SchemaName)" }
        foreach ($cast in $script:CastsComOpcoes) {
          $leituras += [pscustomobject]@{ Tabela = $logico; Caminho = "EntityDefinitions($id)/Attributes/Microsoft.Dynamics.CRM.$cast`?`$select=LogicalName&`$expand=OptionSet" }
        }
      }
    }
  }
  foreach ($id in @($porTipo[9] | Where-Object { $_ })) { $leituras += [pscustomobject]@{ Tabela = "global:$id"; Caminho = "GlobalOptionSetDefinitions($id)" } }
  foreach ($id in @($porTipo[20] | Where-Object { $_ })) { $leituras += [pscustomobject]@{ Tabela = "papel:$id"; Caminho = "RetrieveRolePrivilegesRole(RoleId=@p)?@p=$id" } }

  $carregar = @("dataverse.ps1", "solucoes.ps1", "impressao.ps1", "inventario.ps1" | ForEach-Object { Join-Path $PSScriptRoot $_ })
  $lidas = Invoke-EmParalelo -Itens $leituras -Argumentos @($Dv) -Carregar $carregar -Bloco {
    param($L, $Dv)
    ConvertTo-LinhasDoInventario $L.Tabela (Invoke-RestMethod -Method Get -Uri "$($Dv.Api)/$($L.Caminho)" -Headers $Dv.Headers)
  }
  foreach ($l in $lidas) {
    if ($l.Erro) { $motivos.Add("leitura de $($l.Item.Caminho.Split('?')[0]) falhou: $($l.Erro)"); continue }
    foreach ($linha in @($l.Resultado)) { if ($linha) { [void] $itens.Add([string] $linha) } }
  }

  # Subcomponentes da tabela (mesma lista da impressao digital): o conjunto inteiro, filtrado pelas tabelas da solucao.
  if ($nomesDasTabelas.Count) {
    foreach ($s in $script:SubcomponentesDaTabela) {
      $filtro = if ($s[3]) { "&`$filter=$($s[3])" } else { "" }
      $linhas = & $lista "$($s[0])?`$select=$($s[1]),$($s[2])$filtro"
      if ($null -eq $linhas) { continue }
      foreach ($r in $linhas) { if ($nomesDasTabelas.ContainsKey([string] $r.($s[2]))) { [void] $itens.Add("s|$($s[0])|$(([string] $r.($s[1])).ToLowerInvariant())") } }
    }
  }
  if ($porTipo.ContainsKey(70)) {
    $linhas = & $lista "fieldpermissions?`$select=entityname,attributelogicalname,_fieldsecurityprofileid_value"
    if ($null -ne $linhas) {
      foreach ($r in $linhas) {
        $perfil = ([string] $r._fieldsecurityprofileid_value).ToLowerInvariant()
        if ($ids.ContainsKey($perfil)) { [void] $itens.Add("fp|$perfil|$($r.entityname).$($r.attributelogicalname)") }
      }
    }
  }
  # Assemblies da solucao, direto (91) ou dentro de um pacote de plugin da solucao; e os tipos de cada um.
  $assemblies = @{}
  foreach ($id in @($porTipo[91] | Where-Object { $_ })) { $assemblies[$id] = $true }
  $pacotes = $null
  try { $pacotes = Get-PacoteDosAssemblies $Dv } catch { $motivos.Add("leitura dos pacotes de plugin falhou: $(Get-ErroDv $_)") }
  if ($pacotes) {
    foreach ($a in $pacotes.Keys) { if ($ids.ContainsKey($pacotes[$a])) { [void] $itens.Add("pa|$($pacotes[$a])|$a"); $assemblies[$a] = $true } }
  }
  if ($assemblies.Count) {
    $linhas = & $lista "plugintypes?`$select=plugintypeid,_pluginassemblyid_value"
    if ($null -ne $linhas) {
      foreach ($r in $linhas) {
        $a = ([string] $r._pluginassemblyid_value).ToLowerInvariant()
        if ($assemblies.ContainsKey($a)) { [void] $itens.Add("pt|$a|$(([string] $r.plugintypeid).ToLowerInvariant())") }
      }
    }
  }
  return @{ itens = @($itens | Sort-Object); incerto = ($motivos.Count -gt 0); motivos = @($motivos) }
}

# Linhas do inventario a partir de uma resposta de metadata (pura; roda no runspace).
function ConvertTo-LinhasDoInventario([string] $Tabela, $Resposta) {
  $saida = New-Object Collections.Generic.List[string]
  if ($Tabela -like "papel:*") {
    $papel = $Tabela.Substring(6)
    foreach ($p in @(Get-Campo $Resposta 'RolePrivileges')) { if ($p) { $saida.Add("rp|$papel|$(([string] $p.PrivilegeId).ToLowerInvariant())") } }
    return @($saida)
  }
  if ($Tabela -like "global:*") {
    foreach ($o in @(Get-Campo $Resposta 'Options')) { if ($o) { $saida.Add("o|$Tabela|$($o.Value)") } }
    return @($saida)
  }
  $atributos = Get-Campo $Resposta 'value'
  if ($null -ne $atributos) {
    # Colunas de escolha (cast): cada opcao de cada coluna.
    foreach ($a in @($atributos)) {
      if (-not $a) { continue }
      $conjunto = Get-Campo $a 'OptionSet'
      foreach ($o in @(Get-Campo $conjunto 'Options')) { if ($o) { $saida.Add("o|$Tabela.$($a.LogicalName)|$($o.Value)") } }
    }
    return @($saida)
  }
  foreach ($a in @(Get-Campo $Resposta 'Attributes')) { if ($a) { $saida.Add("a|$Tabela|$($a.LogicalName)") } }
  foreach ($k in @(Get-Campo $Resposta 'Keys')) { if ($k) { $saida.Add("k|$Tabela|$($k.LogicalName)") } }
  foreach ($nome in @('OneToManyRelationships', 'ManyToOneRelationships', 'ManyToManyRelationships')) {
    foreach ($r in @(Get-Campo $Resposta $nome)) { if ($r) { $saida.Add("r|$($r.SchemaName)") } }
  }
  return @($saida)
}

# --- Escolha do modo (pura) ---
# update so com os dois inventarios certos e nada no destino que o DEV nao tenha; importar_tudo, primeira instalacao (sem
# inventario no destino) e qualquer duvida ficam no upgrade.
function Get-ModoDeImport($InventarioDev, $InventarioAlvo, [bool] $ImportarTudo = $false) {
  $upgrade = { param([string] $Motivo, $Sobrando = @()) @{ modo = "upgrade"; motivo = $Motivo; sobrando = @($Sobrando) } }
  if ($ImportarTudo) { return & $upgrade "importar_tudo" }
  if ($null -eq $InventarioDev) { return & $upgrade "sem inventario do DEV no pacote" }
  if (Get-Campo $InventarioDev 'incerto') { return & $upgrade "inventario do DEV incerto: $(@(Get-Campo $InventarioDev 'motivos' | Select-Object -First 3) -join '; ')" }
  if ($null -eq $InventarioAlvo) { return & $upgrade "sem inventario do destino" }
  if (Get-Campo $InventarioAlvo 'incerto') { return & $upgrade "inventario do destino incerto: $(@(Get-Campo $InventarioAlvo 'motivos' | Select-Object -First 3) -join '; ')" }
  $dev = New-Object 'Collections.Generic.HashSet[string]'
  foreach ($i in @(Get-Campo $InventarioDev 'itens')) { if ($i) { [void] $dev.Add([string] $i) } }
  if ($dev.Count -eq 0) { return & $upgrade "inventario do DEV vazio" }
  $sobrando = @(@(Get-Campo $InventarioAlvo 'itens') | Where-Object { $_ -and -not $dev.Contains([string] $_) })
  if ($sobrando.Count) { return & $upgrade "$($sobrando.Count) item(ns) no destino que o DEV nao tem (o upgrade apaga)" $sobrando }
  return @{ modo = "update"; motivo = "nada saiu da solucao desde a versao instalada"; sobrando = @() }
}

# Modo observar: o import foi upgrade; o que ele apagou prova se a escolha teria acertado.
#  acerto: escolheu update e o upgrade nao apagou nada, ou escolheu upgrade e ele apagou algo;
#  conservador: escolheu upgrade e nada foi apagado (so perdeu tempo);
#  erro: escolheu update e o upgrade apagou algo (o update teria deixado lixo no ambiente). Nao ligue o modo escolher.
function Get-ObservacaoDoModo([string] $Escolhido, $Antes, $Depois) {
  if ($null -eq $Antes -or $null -eq $Depois -or (Get-Campo $Antes 'incerto') -or (Get-Campo $Depois 'incerto')) { return @{ observacao = "incerto"; apagados = @() } }
  $ficou = New-Object 'Collections.Generic.HashSet[string]'
  foreach ($i in @(Get-Campo $Depois 'itens')) { if ($i) { [void] $ficou.Add([string] $i) } }
  $apagados = @(@(Get-Campo $Antes 'itens') | Where-Object { $_ -and -not $ficou.Contains([string] $_) })
  $obs = if ($Escolhido -eq "update") { if ($apagados.Count) { "erro" } else { "acerto" } } elseif ($apagados.Count) { "acerto" } else { "conservador" }
  return @{ observacao = $obs; apagados = $apagados }
}
