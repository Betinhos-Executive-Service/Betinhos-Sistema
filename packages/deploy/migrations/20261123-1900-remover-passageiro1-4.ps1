param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# destrutiva: cr40f_reservadeveculos.cr40f_passageiro1 - passageiros so por cr40f_servicosporpassageiro (decisao do Renan, 23/11/2026)
# destrutiva: cr40f_reservadeveculos.cr40f_passageiro2 - passageiros so por cr40f_servicosporpassageiro (decisao do Renan, 23/11/2026)
# destrutiva: cr40f_reservadeveculos.cr40f_passageiro3 - passageiros so por cr40f_servicosporpassageiro (decisao do Renan, 23/11/2026)
# destrutiva: cr40f_reservadeveculos.cr40f_passageiro4 - passageiros so por cr40f_servicosporpassageiro (decisao do Renan, 23/11/2026)

# Remove os lookups cr40f_passageiro1..4 de cr40f_reservadeveculos. O codigo parou de usa-los (PRs #662 e #664), o backfill para
# cr40f_servicosporpassageiro foi feito e nenhum flow do DEV os referencia. Ordem (tudo idempotente, so DEV):
#   1. formulario principal "Informacoes": tira a <cell> de cada control datafieldname=cr40f_passageiroN (o nome aparece 2x por
#      control: no atributo id e no datafieldname, 8 ocorrencias no total) e a <row> que ficar sem celulas;
#   2. views "Localizacao Rapida" (quick find) e "A receber": tira <attribute>, <condition>, <order> e <cell> da coluna; <filter>
#      que ficar sem filhos sai; views pessoais (userqueries) do DEV que citam a coluna recebem o mesmo tratamento (a API de
#      dependencias nao as lista; falha ao grava-las vira aviso, nao trava a migration);
#   3. PublishXml da tabela se algo mudou;
#   4. RetrieveDependenciesForDelete de cada coluna: sobrou dependencia = falha com a lista (tipo e id), nada e apagado;
#   5. Remove-Lookup apaga o relacionamento 1:N (e o atributo junto).
# Ids de form e views sao os mesmos no DEV e no PROD; ausente = pula com aviso; gerenciado = falha.
# PROD: recebe pelas solucoes (formulario, views e remocao dos lookups, upgrade apaga o que saiu). Antes do import no TEST/PROD as 3
# regras de negocio em rascunho do PROD ("Nova regra de negocios" x2 e "Copia de Nova regra de negocios", gerenciadas, que nao
# existem no DEV) dependem de cr40f_passageiro1 e precisam ser resolvidas (apagadas ou ajustadas) senao o upgrade falha.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_reservadeveculos"
$colunas = @(1..4 | ForEach-Object { "cr40f_passageiro$_" })
$formId = "68573afa-38de-499a-a67f-bf95eb4c19d9"
$viewIds = @("0d16d3c2-3fa0-4761-b0f5-3a56d8028746", "c0a3edcc-4b1d-f111-8341-7ced8db131cd")

# Devolve @{ Xml = <novo xml>; N = <nos removidos> }. Tipo: form, fetch ou layout.
function Remove-ColunasDoXml([string] $Xml, [string] $Tipo) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.LoadXml($Xml)
  $n = 0
  foreach ($col in $colunas) {
    if ($Tipo -eq "form") { $alvos = @($doc.SelectNodes("//cell[control[@datafieldname='$col']]")) }
    elseif ($Tipo -eq "fetch") { $alvos = @($doc.SelectNodes("//attribute[@name='$col'] | //condition[@attribute='$col'] | //order[@attribute='$col']")) }
    else { $alvos = @($doc.SelectNodes("//cell[@name='$col']")) }
    foreach ($no in $alvos) {
      $pai = $no.ParentNode
      [void] $pai.RemoveChild($no)
      $n++
      if ($Tipo -eq "form" -and @($pai.SelectNodes("cell")).Count -eq 0) { [void] $pai.ParentNode.RemoveChild($pai) }
    }
  }
  if ($Tipo -eq "fetch" -and $n -gt 0) {
    while ($true) {
      $vazios = @($doc.SelectNodes("//filter[not(*)]"))
      if ($vazios.Count -eq 0) { break }
      foreach ($f in $vazios) { [void] $f.ParentNode.RemoveChild($f) }
    }
  }
  return @{ Xml = $doc.OuterXml; N = $n }
}

# Le o registro, limpa os campos XML e grava so se mudou. $Campos: nome do campo -> tipo (form, fetch, layout).
# Devolve $true se mudou (ou mudaria, no dry-run). $Falha = $false: erro de gravacao vira aviso (views pessoais).
function Limpar-Registro([string] $Set, [string] $IdCampo, [string] $Id, [string] $Rotulo, [hashtable] $Campos, [bool] $Estrito = $true) {
  $select = "$IdCampo,name," + (($Campos.Keys | Sort-Object) -join ",")
  if ($Estrito) { $select += ",ismanaged" }
  $r = @(Get-Rows $Set $select "$IdCampo eq $Id")
  if ($r.Count -eq 0) { Write-Step "AVISO: $Rotulo ($Set $Id) nao existe neste ambiente; pulado."; return $false }
  $r = $r[0]
  if ($Estrito -and $r.ismanaged) { throw "$Rotulo ($Set $Id) e gerenciado no DEV; nao edito." }
  $patch = @{}
  $total = 0
  foreach ($campo in $Campos.Keys) {
    $xml = [string] $r.$campo
    if (-not $xml) { continue }
    $res = Remove-ColunasDoXml $xml $Campos[$campo]
    if ($res.N -gt 0) { $patch[$campo] = $res.Xml; $total += $res.N }
  }
  if ($patch.Count -eq 0) { Write-Step "$Rotulo ja sem as colunas cr40f_passageiro1..4."; return $false }
  if (-not $script:Apply) { Write-Step "DRY RUN tiraria $total no(s) de $Rotulo ($($($patch.Keys | Sort-Object) -join ', ')). Use -Apply para aplicar."; return $true }
  try { Invoke-Dv "PATCH" "$Set($Id)" $patch | Out-Null }
  catch {
    if ($Estrito) { throw }
    Write-Step "AVISO: nao consegui gravar $Rotulo ($Set $Id): $($_.Exception.Message)"
    return $false
  }
  Write-Step "OK: $Rotulo sem as colunas cr40f_passageiro1..4 ($total no(s))."
  return $true
}

$mudou = $false

# ---------- 1. formulario principal ----------
if (Limpar-Registro "systemforms" "formid" $formId "formulario Informacoes" @{ formxml = "form" }) { $mudou = $true }

# ---------- 2. views do sistema ----------
foreach ($id in $viewIds) {
  if (Limpar-Registro "savedqueries" "savedqueryid" $id "view $id" @{ fetchxml = "fetch"; layoutxml = "layout" }) { $mudou = $true }
}

# ---------- 2b. views pessoais do DEV (nao listadas pelas dependencias; nao fazem parte das solucoes) ----------
$pessoais = @(Get-Rows "userqueries" "userqueryid,name,fetchxml,layoutxml" "returnedtypecode eq '$tabela'")
foreach ($u in $pessoais) {
  if (("$($u.fetchxml)$($u.layoutxml)") -notmatch "cr40f_passageiro[1-4]\b") { continue }
  [void] (Limpar-Registro "userqueries" "userqueryid" $u.userqueryid "view pessoal '$($u.name)'" @{ fetchxml = "fetch"; layoutxml = "layout" } $false)
}

# ---------- 3. publicar ----------
if ($Apply -and $mudou) { Publish-Tabela $tabela; Write-Step "OK: $tabela publicada (formulario e views)." }

# ---------- 4. dependencias ----------
$pendentes = @()
foreach ($col in $colunas) {
  $c = Get-Coluna $tabela $col
  if (-not $c) { continue }
  $deps = @((Invoke-Dv "GET" "RetrieveDependenciesForDelete(ObjectId=$($c.MetadataId),ComponentType=2)").value)
  foreach ($d in $deps) { $pendentes += "$col <- tipo $($d.dependentcomponenttype) id $($d.dependentcomponentobjectid)" }
}
if ($pendentes.Count -gt 0) {
  if ($Apply) { throw "Ainda ha dependencias nas colunas; nada foi apagado:`n  $($pendentes -join "`n  ")" }
  Write-Step "DRY RUN: dependencias atuais (somem depois do formulario e das views serem corrigidos):`n  $($pendentes -join "`n  ")"
}

# ---------- 5. lookups ----------
foreach ($n in 1..4) {
  Remove-Lookup $tabela "cr40f_passageiro$n" "cr40f_reservadeveculos_Passageiro${n}_cr40f_bancodedados"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
Write-Step "OK: lookups cr40f_passageiro1..4 removidos de $tabela."
