# Funções comuns dos provision-flow-* que só atualizam flow que já existe no DEV a partir de um JSON versionado em
# packages/deploy/flows/ (definição exportada do DEV). Dot-source: . (Join-Path $PSScriptRoot 'flows\sincronizar-flow.ps1')
# - O JSON guarda só a definição. Connection references e o "subscriptionRequest/name" dos gatilhos Dataverse
#   (gerado pela plataforma por flow) vêm do flow existente em tempo de execução.
# - String igual a '<preservado do DEV>' no JSON (e-mail, nome de pessoa) também vem do flow existente.
# - Comparação semântica (ordem das propriedades não importa). Igual = nada gravado.
# - Gravação: desliga, grava, restaura a definição anterior se falhar e devolve o estado ligado/desligado de antes.

$script:DevHost = 'org23b93544.crm2.dynamics.com'

function Assert-SomenteDev([string] $EnvironmentUrl) {
  # Sem bypass: o PROD recebe estes flows pelas soluções.
  if (([Uri] $EnvironmentUrl).Host.ToLowerInvariant() -ne $script:DevHost) { throw "Somente DEV ($script:DevHost)." }
}

function New-DvSessao([string] $EnvironmentUrl) {
  $base = $EnvironmentUrl.TrimEnd('/')
  $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
  return @{ Api = "$base/api/data/v9.2"; Headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' } }
}

function Invoke-DvSessao($Sessao, [string] $Method, [string] $Path, $Payload = $null) {
  $params = @{ Method = $Method; Uri = "$($Sessao.Api)/$Path"; Headers = $Sessao.Headers.Clone(); TimeoutSec = 60; UseBasicParsing = $true }
  if ($Method -eq 'PATCH') { $params.Headers['If-Match'] = '*' }
  if ($null -ne $Payload) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 100 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  try { $bytes = (Invoke-WebRequest @params).RawContentStream.ToArray() }
  catch {
    $detalhe = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Dataverse $Method $($Path.Split('?')[0]) falhou: $detalhe"
  }
  # Resposta sem charset: decodifica UTF-8 para não corromper acentos no PowerShell 5.1.
  if (-not $bytes.Length) { return $null }
  return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

# Objeto com as chaves em ordem ordinal, recursivo; arrays mantêm a ordem.
function ConvertTo-Canonico($Valor) {
  if ($null -eq $Valor) { return $null }
  if ($Valor -is [Management.Automation.PSCustomObject]) {
    $o = New-Object Collections.Specialized.OrderedDictionary ([StringComparer]::Ordinal)
    $nomes = [string[]] @($Valor.PSObject.Properties | ForEach-Object { $_.Name })
    [Array]::Sort($nomes, [StringComparer]::Ordinal)
    foreach ($nome in $nomes) {
      $o[$nome] = ConvertTo-Canonico $Valor.$nome
    }
    return $o
  }
  if ($Valor -is [Collections.IList]) { return , @(foreach ($item in $Valor) { , (ConvertTo-Canonico $item) }) }
  return $Valor
}
function ConvertTo-JsonCanonico($Valor) { return (ConvertTo-Json -InputObject (ConvertTo-Canonico $Valor) -Depth 100 -Compress) }

# Caminhos que diferem entre dois objetos vindos de ConvertFrom-Json (para o relatório do dry run).
function Get-Diferencas($A, $B, [string] $Caminho = '') {
  $ja = ConvertTo-JsonCanonico $A; $jb = ConvertTo-JsonCanonico $B
  if ($ja -eq $jb) { return @() }
  if ($A -is [Management.Automation.PSCustomObject] -and $B -is [Management.Automation.PSCustomObject]) {
    $nomes = @(@($A.PSObject.Properties | ForEach-Object { $_.Name }) + @($B.PSObject.Properties | ForEach-Object { $_.Name }) | Sort-Object -Unique)
    return @(foreach ($n in $nomes) {
      $temA = $null -ne $A.PSObject.Properties[$n]; $temB = $null -ne $B.PSObject.Properties[$n]
      if (-not $temA) { "$Caminho/$n (só no repositório)" } elseif (-not $temB) { "$Caminho/$n (só no DEV)" } else { Get-Diferencas $A.$n $B.$n "$Caminho/$n" }
    })
  }
  return @("$Caminho (valor diferente)")
}

function Get-FlowExistente($Sessao, [string] $Nome) {
  $filtro = [Uri]::EscapeDataString("name eq '$Nome' and category eq 5")
  $linhas = @((Invoke-DvSessao $Sessao GET "workflows?`$select=workflowid,statecode,ismanaged,clientdata&`$filter=$filtro").value)
  if ($linhas.Count -eq 0) { throw "Flow '$Nome' não existe no DEV: a criação é manual (CLAUDE.md, flow novo)." }
  if ($linhas.Count -gt 1) { throw "Flow '$Nome' duplicado no DEV." }
  if ($linhas[0].ismanaged) { throw "Flow '$Nome' é gerenciado no DEV: recusado." }
  return $linhas[0]
}

# Valor que não pode ir ao repositório público (e-mail, nome de pessoa): no JSON fica esta marca e o script usa a
# string que o flow existente tem no mesmo caminho. Sem valor lá, falha em vez de gravar a marca.
$script:ValorDoDev = '<preservado do DEV>'
function Resolve-ValoresDoDev($Repo, $Vivo, [string] $Caminho) {
  if ($Repo -is [Collections.IList]) {
    for ($i = 0; $i -lt $Repo.Count; $i++) {
      # Atribuição direta: "$v = if (...) {...}" desenrolaria array de um elemento.
      $v = $null; if ($Vivo -is [Collections.IList] -and $i -lt $Vivo.Count) { $v = $Vivo[$i] }
      Resolve-ValoresDoDev $Repo[$i] $v "$Caminho/$i"
    }
    return
  }
  if ($Repo -isnot [Management.Automation.PSCustomObject]) { return }
  foreach ($p in $Repo.PSObject.Properties) {
    $v = $null; if ($Vivo -is [Management.Automation.PSCustomObject] -and $Vivo.PSObject.Properties[$p.Name]) { $v = $Vivo.($p.Name) }
    if ($p.Value -is [string] -and $p.Value -eq $script:ValorDoDev) {
      if ($v -isnot [string] -or -not $v -or $v -eq $script:ValorDoDev) { throw "$Caminho/$($p.Name): valor a preservar ausente no flow existente." }
      $p.Value = $v
    } else { Resolve-ValoresDoDev $p.Value $v "$Caminho/$($p.Name)" }
  }
}

# clientdata nova: definição do JSON + connection references, nome de assinatura dos gatilhos e valores marcados do flow existente.
function New-ClientDataDoJson([string] $ClientDataAtual, [string] $CaminhoJson) {
  $atual = $ClientDataAtual | ConvertFrom-Json
  $definicao = [IO.File]::ReadAllText($CaminhoJson, [Text.Encoding]::UTF8) | ConvertFrom-Json
  Resolve-ValoresDoDev $definicao $atual.properties.definition ''
  foreach ($gatilho in $definicao.triggers.PSObject.Properties) {
    $vivo = $atual.properties.definition.triggers.PSObject.Properties[$gatilho.Name]
    $inputs = if ($vivo) { $vivo.Value.PSObject.Properties['inputs'] } else { $null }
    $parametros = if ($inputs) { $inputs.Value.PSObject.Properties['parameters'] } else { $null }
    $assinatura = if ($parametros) { $parametros.Value.PSObject.Properties['subscriptionRequest/name'] } else { $null }
    if ($assinatura) { $gatilho.Value.inputs.parameters | Add-Member -NotePropertyName 'subscriptionRequest/name' -NotePropertyValue $assinatura.Value -Force }
  }
  $refs = $atual.properties.connectionReferences
  foreach ($r in $refs.PSObject.Properties) {
    if (-not $r.Value.connection.connectionReferenceLogicalName) { throw "Connection reference '$($r.Name)' do flow existente sem nome lógico." }
  }
  return (@{ properties = @{ connectionReferences = $refs; definition = $definicao }; schemaVersion = $atual.schemaVersion } | ConvertTo-Json -Depth 100 -Compress)
}

function Sync-FlowExistente($Sessao, [string] $Nome, [string] $CaminhoJson, [switch] $Apply, [string] $Prefixo = 'flow') {
  $flow = Get-FlowExistente $Sessao $Nome
  $novo = New-ClientDataDoJson $flow.clientdata $CaminhoJson
  $diferencas = @(Get-Diferencas ($novo | ConvertFrom-Json) ($flow.clientdata | ConvertFrom-Json))
  if ($diferencas.Count -eq 0) { Write-Output "[$Prefixo] '$Nome': sem mudança (definição igual à do DEV)."; return }
  Write-Output "[$Prefixo] '$Nome': $($diferencas.Count) diferença(s) com o DEV:"
  $diferencas | ForEach-Object { Write-Output "  $_" }
  if (-not $Apply) { Write-Output "[$Prefixo] DRY RUN: '$Nome' seria atualizado (use -Apply)."; return }

  $id = $flow.workflowid
  $estavaLigado = [int] $flow.statecode -eq 1
  if ($estavaLigado) { Invoke-DvSessao $Sessao PATCH "workflows($id)" @{ statecode = 0 } | Out-Null }
  try {
    try { Invoke-DvSessao $Sessao PATCH "workflows($id)" @{ clientdata = $novo } | Out-Null }
    catch {
      $erro = $_
      Invoke-DvSessao $Sessao PATCH "workflows($id)" @{ clientdata = $flow.clientdata } | Out-Null
      throw "'$Nome': gravação falhou e a definição anterior foi restaurada. $erro"
    }
  } finally {
    if ($estavaLigado) { Invoke-DvSessao $Sessao PATCH "workflows($id)" @{ statecode = 1 } | Out-Null }
  }
  $conferido = Invoke-DvSessao $Sessao GET "workflows($id)?`$select=statecode,clientdata"
  if (@(Get-Diferencas ($novo | ConvertFrom-Json) ($conferido.clientdata | ConvertFrom-Json)).Count) { throw "'$Nome': definição gravada difere da enviada." }
  if (([int] $conferido.statecode -eq 1) -ne $estavaLigado) { throw "'$Nome': estado ligado/desligado não voltou ao anterior." }
  Write-Output "[$Prefixo] '$Nome': atualizado, statecode $($conferido.statecode) (igual ao anterior)."
}
