param(
  # nome=url separados por virgula, a referencia primeiro. Ex.: -Ambientes "prod=https://orgf261ae8e.crm2.dynamics.com,test=<url do TEST>,dev=https://org23b93544.crm2.dynamics.com"
  [Parameter(Mandatory = $true)] [string] $Ambientes,
  [string] $Assembly = "Betinhos.DriverRecordSharing",
  [string] $Solucao = "BetinhosAutomacao"
)

# Auditoria SOMENTE LEITURA (so GET) das Custom APIs entre ambientes, antes de um "Publicar solucoes".
# Entram as APIs ligadas a um plugin type do -Assembly e as da -Solucao com allowedcustomprocessingsteptype 2 (step customizado).
# Compara pelo uniquename com o primeiro ambiente (referencia):
# - BLOQUEIA (codigo 1): campo imutavel diferente (allowedcustomprocessingsteptype, bindingtype, boundentitylogicalname, isfunction,
#   isprivate), plugintype diferente, parametro/resposta ausente ou com tipo/isoptional/entidade diferente, step customizado
#   ausente ou com stage/mode/plugintype diferente, componente nao gerenciado fora do DEV (ambiente de nome "dev"), API ausente.
#   E o desenho que quebrou o import da BetinhosAutomacao no TEST em 10/11/2026 (tipo 0 virou 2 no DEV).
# - INFO: ids diferentes (o import casa Custom API e parametro pelo uniquename, nao pelo id: no TEST e no PROD as mesmas APIs
#   importadas do mesmo pacote tem ids diferentes) e presenca de configuracao segura (nao viaja na solucao).
# Nunca le o valor da configuracao segura: so se o step tem uma. Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Estado([string] $Url) {
  $base = $Url.TrimEnd("/")
  $token = & az account get-access-token --resource "$base/" --query accessToken -o tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token indisponivel para $base (rode az login)." }
  $headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-Version" = "4.0"; "OData-MaxVersion" = "4.0" }
  $rows = {
    param([string] $Path)
    $all = @(); $uri = "$base/api/data/v9.2/$Path"
    while ($uri) {
      $r = Invoke-RestMethod -Method GET -Uri $uri -Headers $headers -TimeoutSec 120
      $all += @($r.value)
      $uri = if ($r.PSObject.Properties["@odata.nextLink"]) { $r."@odata.nextLink" } else { $null }
    }
    return $all
  }
  $tipos = @{}
  foreach ($t in & $rows "plugintypes?`$select=plugintypeid,typename,assemblyname") { $tipos[[string]$t.plugintypeid] = $t }
  $doAssembly = @($tipos.Values | Where-Object { $_.assemblyname -eq $Assembly } | ForEach-Object { [string]$_.plugintypeid })
  $naSolucao = @{}
  $sol = @(& $rows "solutions?`$select=solutionid&`$filter=uniquename eq '$Solucao'")
  if ($sol.Count) { foreach ($c in & $rows "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $($sol[0].solutionid)") { $naSolucao[[string]$c.objectid] = $true } }
  $nomeTipo = { param($id) if ($id -and $tipos.ContainsKey([string]$id)) { $tipos[[string]$id].typename } else { "" } }

  $apis = @{}
  foreach ($a in & $rows "customapis?`$select=customapiid,uniquename,allowedcustomprocessingsteptype,bindingtype,boundentitylogicalname,isfunction,isprivate,_plugintypeid_value,_sdkmessageid_value,ismanaged") {
    $doPlugin = $doAssembly -contains [string]$a._plugintypeid_value
    $tipo2 = $naSolucao.ContainsKey([string]$a.customapiid) -and [int]$a.allowedcustomprocessingsteptype -eq 2
    if (-not ($doPlugin -or $tipo2)) { continue }
    $params = @{}
    foreach ($p in & $rows "customapirequestparameters?`$select=customapirequestparameterid,uniquename,type,isoptional,logicalentityname,ismanaged&`$filter=_customapiid_value eq $($a.customapiid)") {
      $params["parametro $($p.uniquename)"] = [pscustomobject]@{ Id = $p.customapirequestparameterid; Desenho = "tipo $($p.type), opcional $($p.isoptional), entidade '$($p.logicalentityname)'"; Gerenciado = [bool]$p.ismanaged }
    }
    foreach ($p in & $rows "customapiresponseproperties?`$select=customapiresponsepropertyid,uniquename,type,logicalentityname,ismanaged&`$filter=_customapiid_value eq $($a.customapiid)") {
      $params["resposta $($p.uniquename)"] = [pscustomobject]@{ Id = $p.customapiresponsepropertyid; Desenho = "tipo $($p.type), entidade '$($p.logicalentityname)'"; Gerenciado = [bool]$p.ismanaged }
    }
    $steps = @{}
    if ($a._sdkmessageid_value) {
      foreach ($s in & $rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,stage,mode,_eventhandler_value,_sdkmessageprocessingstepsecureconfigid_value,ismanaged&`$filter=_sdkmessageid_value eq $($a._sdkmessageid_value)") {
        if ($s.name -like "CustomApi '*' implementation") { continue }
        $steps[[string]$s.sdkmessageprocessingstepid] = [pscustomobject]@{ Nome = $s.name; Desenho = "stage $($s.stage), mode $($s.mode), $(& $nomeTipo $s._eventhandler_value)"; Seguro = [bool]$s._sdkmessageprocessingstepsecureconfigid_value; Gerenciado = [bool]$s.ismanaged }
      }
    }
    $apis[$a.uniquename] = [pscustomobject]@{
      Id = [string]$a.customapiid; Gerenciado = [bool]$a.ismanaged; Params = $params; Steps = $steps
      Desenho = "tipo $($a.allowedcustomprocessingsteptype), binding $($a.bindingtype) '$($a.boundentitylogicalname)', funcao $($a.isfunction), privada $($a.isprivate), plugin '$(& $nomeTipo $a._plugintypeid_value)'"
    }
  }
  return $apis
}

$estados = [ordered]@{}
foreach ($par in ($Ambientes -split ",")) {
  $nome, $url = $par -split "=", 2
  if (-not $url) { throw "Use nome=url em -Ambientes ($par)." }
  $estados[$nome] = Get-Estado $url
  if (-not $estados[$nome].Count) { throw "Nenhuma Custom API lida em $nome (assembly $Assembly, solucao $Solucao)." }
  Write-Host "[auditoria] $nome : $($estados[$nome].Count) Custom APIs"
}
$nomes = @($estados.Keys)
$ref = $nomes[0]
$bloqueios = New-Object System.Collections.Generic.List[string]
$infos = New-Object System.Collections.Generic.List[string]
$todas = @($nomes | ForEach-Object { $estados[$_].Keys } | Sort-Object -Unique)

foreach ($api in $todas) {
  $r = $estados[$ref][$api]
  foreach ($amb in $nomes) {
    $c = $estados[$amb][$api]
    if (-not $c) { $bloqueios.Add("$api ausente em $amb"); continue }
    if ($amb -ne "dev" -and -not $c.Gerenciado) { $bloqueios.Add("$api nao gerenciada em $amb") }
    if (-not $r -or $amb -eq $ref) { continue }
    if ($c.Desenho -ne $r.Desenho) { $bloqueios.Add("$api em ${amb}: $($c.Desenho); em ${ref}: $($r.Desenho)") }
    if ($c.Id -ne $r.Id) { $infos.Add("$api id em ${amb} $($c.Id), em $ref $($r.Id)") }
    foreach ($k in @(@($r.Params.Keys) + @($c.Params.Keys) | Sort-Object -Unique)) {
      $pr = $r.Params[$k]; $pc = $c.Params[$k]
      if (-not $pc) { $bloqueios.Add("$api $k ausente em $amb"); continue }
      if (-not $pr) { $bloqueios.Add("$api $k existe em $amb e nao em $ref"); continue }
      if ($pc.Desenho -ne $pr.Desenho) { $bloqueios.Add("$api $k em ${amb}: $($pc.Desenho); em ${ref}: $($pr.Desenho)") }
      if ($amb -ne "dev" -and -not $pc.Gerenciado) { $bloqueios.Add("$api $k nao gerenciado em $amb") }
      if ($pc.Id -ne $pr.Id) { $infos.Add("$api $k id em ${amb} $($pc.Id), em $ref $($pr.Id)") }
    }
    foreach ($id in @(@($r.Steps.Keys) + @($c.Steps.Keys) | Sort-Object -Unique)) {
      $sr = $r.Steps[$id]; $sc = $c.Steps[$id]
      if (-not $sc) { $bloqueios.Add("$api step $id ($($sr.Nome)) ausente em $amb"); continue }
      if (-not $sr) { $bloqueios.Add("$api step $id ($($sc.Nome)) existe em $amb e nao em $ref"); continue }
      if ($sc.Desenho -ne $sr.Desenho) { $bloqueios.Add("$api step $id em ${amb}: $($sc.Desenho); em ${ref}: $($sr.Desenho)") }
      if ($amb -ne "dev" -and -not $sc.Gerenciado) { $bloqueios.Add("$api step $id nao gerenciado em $amb") }
      if ($sc.Seguro -ne $sr.Seguro) { $infos.Add("$api step $id configuracao segura: $amb $(if ($sc.Seguro) { 'sim' } else { 'nao' }), $ref $(if ($sr.Seguro) { 'sim' } else { 'nao' })") }
    }
  }
}

Write-Host "[auditoria] INFO ($($infos.Count)): ids e configuracao segura nao viajam na solucao."
$infos | Where-Object { $_ -match "configuracao segura" } | ForEach-Object { Write-Host "  $_" }
Write-Host "  ids diferentes: $(@($infos | Where-Object { $_ -notmatch 'configuracao segura' }).Count) (detalhe com -Verbose)"
$infos | Where-Object { $_ -notmatch "configuracao segura" } | ForEach-Object { Write-Verbose $_ }
if ($bloqueios.Count) {
  Write-Host "[auditoria] BLOQUEIOS ($($bloqueios.Count)): o import da solucao pode falhar ou mudar o comportamento."
  $bloqueios | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "[auditoria] sem divergencia de desenho entre $($nomes -join ', ')."
