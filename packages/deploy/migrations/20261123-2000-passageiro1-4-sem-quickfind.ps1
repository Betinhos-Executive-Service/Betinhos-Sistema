param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)


# Substitui a 20261123-1900 (falhou no DEV, Deploy 45241561927): no DEV qualquer gravacao de fetchxml de quick find com campo de
# busca da 0x80040216 "An unexpected error occurred", ate com o XML original sem mudanca e em outras tabelas. Esta faz so o que
# grava: tira cr40f_passageiro1..4 do formulario "Informacoes", da view "A receber" e das views pessoais do DEV e publica.
# NAO mexe na quick find e NAO apaga os lookups: a quick find continua dependendo das colunas. A remocao (Remove-Lookup) fica
# para uma migration futura, quando a quick find do DEV voltar a aceitar gravacao.
# Ids de form e view sao os mesmos no DEV e no PROD; ausente = pula com aviso; gerenciado = falha.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$tabela = "cr40f_reservadeveculos"
$colunas = @(1..4 | ForEach-Object { "cr40f_passageiro$_" })
$formId = "68573afa-38de-499a-a67f-bf95eb4c19d9"
$viewIds = @("c0a3edcc-4b1d-f111-8341-7ced8db131cd")

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
# Publica sempre: a 1900 gravou o formulario no DEV e caiu antes de publicar.
if ($Apply) { Publish-Tabela $tabela; Write-Step "OK: $tabela publicada (formulario e views)." }

if (-not $Apply) { Write-Step "dry-run: nada gravado." }
