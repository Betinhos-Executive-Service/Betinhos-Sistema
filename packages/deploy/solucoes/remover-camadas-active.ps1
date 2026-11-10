param(
  [Parameter(Mandatory = $true)] [string] $EnvironmentUrl,
  # Nao se chama $Solucoes: solucoes.ps1 atribui $script:Solucoes no mesmo escopo (ver exportar-do-dev.ps1).
  [Alias("Solucoes")] [string] $Pedido = "AppBetinhos,BetinhosCore,BetinhosAutomacao,BetinhosMotoristas,BetinhosInterface",
  [string] $Backup = "",
  [switch] $Aplicar,
  [switch] $PermitirProd
)

# Remove a camada "Active" (nao gerenciada) de todo componente da solucao gerenciada que a tenha no topo:
# WebResource, Workflow, SdkMessageProcessingStep, PluginAssembly, SystemForm, AppModule e SiteMap.
# Sem a remocao, o import da solucao nao altera o que o ambiente serve nesses componentes.
# Inclui o App Motoristas (BetinhosMotoristas e o service worker): desde a fase 3 da migracao ele sai deste repositorio, e a camada
# Active dele no PROD e a do caminho rapido, que a versao importada substitui.
# Guarda antes o JSON da camada Active de cada componente em -Backup. Sem -Aplicar, so lista.
# Leituras de camadas e remocoes rodam 8 por vez (Invoke-EmParalelo); a remocao que falhar tem uma segunda tentativa, uma por
# vez (conflito de customizacao simultanea no servidor), antes de contar como falha.
# PROD so com -PermitirProd (workflow publicar.yml, depois do import das 4, com a main ja contendo todos os hotfixes):
# a camada Active do PROD guarda os hotfixes publicados direto la, e remove-la devolve o componente a versao gerenciada.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "dataverse.ps1")
. (Join-Path $PSScriptRoot "solucoes.ps1")
. (Join-Path $PSScriptRoot "impressao.ps1")

$hostAlvo = ([Uri] $EnvironmentUrl).Host
# Prefixo: o mesmo ambiente responde tambem por outros hosts (ex.: orgf261ae8e.api.crm2.dynamics.com).
if ($hostAlvo -like "orgf261ae8e.*" -and -not $PermitirProd) { throw "remover-camadas-active no PROD exige -PermitirProd." }
$dv = Connect-Dataverse $EnvironmentUrl @($hostAlvo)

# -Solucoes: lista separada por virgula; as que nao existem no ambiente (ex.: AppBetinhos depois da retirada) sao ignoradas.
$ids = @()
foreach ($nome in @($Pedido -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  $solucao = @(Read-DvAll $dv "solutions?`$select=solutionid,ismanaged&`$filter=uniquename eq '$($nome.Replace("'", "''"))'")
  if ($solucao.Count -eq 0) { Write-Step "$nome nao existe em $hostAlvo; ignorada"; continue }
  # Na solucao nao gerenciada (DEV) a camada Active e a propria fonte: remove-la apagaria a customizacao.
  if (-not $solucao[0].ismanaged) { throw "$nome nao e gerenciada em $hostAlvo; a camada Active ali e a fonte." }
  $ids += [string] $solucao[0].solutionid
}
if ($ids.Count -eq 0) { throw "Nenhuma das solucoes ($Pedido) existe em $hostAlvo." }

if (-not $Backup) { $Backup = Join-Path (Get-Location) "backup\solucoes\camadas-active\$hostAlvo" }
# Subpasta por rodada: uma nova camada Active no mesmo componente nao sobrescreve o backup anterior.
# Caminho absoluto: [IO.File] resolve relativo contra o diretorio do processo, nao o do PowerShell.
$Backup = (New-Item -ItemType Directory -Force (Join-Path $Backup (Get-Date -Format "yyyyMMdd-HHmmss"))).FullName

# componenttype -> nome em msdyn_componentlayers; o nome logico da entidade (RemoveActiveCustomization) e o mesmo em minusculas.
$tipos = [ordered]@{ 61 = "WebResource"; 29 = "Workflow"; 91 = "PluginAssembly"; 92 = "SdkMessageProcessingStep"; 60 = "SystemForm"; 80 = "AppModule"; 62 = "SiteMap" }
$pares = @(); $vistos = @{}
foreach ($t in $tipos.GetEnumerator()) {
  $componentes = @(foreach ($solutionId in $ids) { Read-DvAll $dv "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $solutionId and componenttype eq $($t.Key)" })
  foreach ($c in $componentes) {
    # O mesmo componente esta na AppBetinhos e numa das 4: uma consulta de camadas por componente.
    if ($vistos.ContainsKey([string] $c.objectid)) { continue }
    $vistos[[string] $c.objectid] = $true
    $pares += [pscustomobject]@{ Tipo = $t.Value; Id = [string] $c.objectid }
  }
}
$carregar = @((Join-Path $PSScriptRoot "dataverse.ps1"), (Join-Path $PSScriptRoot "solucoes.ps1"), (Join-Path $PSScriptRoot "impressao.ps1"))
$lidas = Invoke-EmParalelo -Itens $pares -Argumentos @($dv) -Carregar $carregar -Bloco {
  param($Par, $Dv)
  $topo = Get-CamadaActiveNoTopo @(Read-DvAll $Dv "msdyn_componentlayers?`$filter=(msdyn_componentid eq '$($Par.Id)' and msdyn_solutioncomponentname eq '$($Par.Tipo)')&`$select=msdyn_name,msdyn_order,msdyn_solutionname,msdyn_componentjson")
  if ($topo) { [pscustomobject]@{ Tipo = $Par.Tipo; Nome = $topo.msdyn_name; Id = $Par.Id; Json = $topo.msdyn_componentjson } }
}
# Leitura que falha derruba a rodada, como antes: sem saber as camadas, nada e removido.
$errosLeitura = @($lidas | Where-Object { $_.Erro })
if ($errosLeitura.Count) { throw "Leitura de camadas falhou em $($errosLeitura.Count) componente(s): $(@($errosLeitura | Select-Object -First 3 | ForEach-Object { "$($_.Item.Tipo) $($_.Item.Id): $($_.Erro)" }) -join ' | ')" }
$alvos = @($lidas | Where-Object { $_.Resultado } | ForEach-Object { $_.Resultado })
Write-Step "$Pedido em ${hostAlvo}: $($alvos.Count) componentes com camada Active no topo"
$alvos | Group-Object Tipo | ForEach-Object { Write-Step ("  {0,3} {1}" -f $_.Count, $_.Name) }
if (-not $Aplicar) { Write-Step "simulacao: use -Aplicar para remover."; return }

foreach ($a in $alvos) {
  $arquivo = Join-Path $Backup (("{0}-{1}" -f $a.Tipo, $a.Id) + ".json")
  [IO.File]::WriteAllText($arquivo, [string] $a.Json, (New-Object Text.UTF8Encoding $false))
}
# Devolve a mensagem de erro (ate 300 caracteres; a da Web API traz a pilha .NET inteira) ou nada.
$remover = {
  param($A, $Dv)
  try { Invoke-DvAction $Dv "RemoveActiveCustomization" @{ LogicalName = $A.Tipo.ToLowerInvariant(); Id = $A.Id } | Out-Null }
  catch { $msg = "$($A.Tipo) $($A.Nome): $(Get-ErroDv $_)"; $msg.Substring(0, [Math]::Min(300, $msg.Length)) }
}
$falhou = { param($R) [bool] ($R.Erro -or $R.Resultado) }
$primeira = @(Invoke-EmParalelo -Itens $alvos -Argumentos @($dv) -Carregar $carregar -Bloco $remover | Where-Object { & $falhou $_ })
$segunda = @(Invoke-EmParalelo -Itens @($primeira | ForEach-Object { $_.Item }) -Argumentos @($dv) -Carregar $carregar -Bloco $remover -Limite 1 | Where-Object { & $falhou $_ })
if ($primeira.Count) { Write-Step "segunda tentativa: $($primeira.Count) componente(s); $($segunda.Count) falharam de novo" }
$falhas = @($segunda | ForEach-Object { if ($_.Erro) { "$($_.Item.Tipo) $($_.Item.Nome): $($_.Erro)" } else { [string] $_.Resultado } })
$removidas = $alvos.Count - $falhas.Count
if ($removidas) { Invoke-DvAction $dv "PublishAllXml" @{} | Out-Null }
Write-Step "removidas: $removidas; falhas: $($falhas.Count); backup em $Backup"
$falhas | ForEach-Object { Write-Warning $_ }
if ($falhas.Count) { exit 1 }
