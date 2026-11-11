param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Forms do toque das notificacoes do App Motoristas v2 (substitui provision-push-redirect.ps1 do repositorio app-motoristas-v2).
# O OnLoad Betinhos.PushRedirect.onLoad (web resource new_appmotoristas_push_redirect.js, conteudo publicado por
# apps/motoristas/scripts/push-webresources-dev.ps1) fica no form principal de new_comunicadodestinatario, new_checklistveiculo,
# new_termomulta, cr40f_treinamentoparticipacao e cr40f_despesaoperacional, e no form "App Motoristas (push)" de
# cr40f_reservadeveculos (todos, ordem 99). Tabelas e forms entram no app new_AppMotoristasv2.
# Ids fixos: os mesmos em DEV, TEST e PROD (lidos somente leitura em 10/11/2026). Nada e criado: form, web resource ou app
# ausente (ou com outro id) falha, para o DEV nunca ganhar um duplicado do que TEST e PROD ja tem. Form gerenciado falha.
# So acrescenta biblioteca, handler e componentes do app que faltam; o resto do form fica como esta (layout, Proprietario).
# Publica so as tabelas e o app que mudaram. As tabelas estao na BetinhosCore com todos os subcomponentes e o app na
# BetinhosMotoristas: o PROD recebe pelas solucoes. Idempotente. Dry-run por padrao; o Deploy aplica com -Apply.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$biblioteca = "new_appmotoristas_push_redirect.js"
$bibliotecaId = "831aea98-9cc9-f111-a05c-7ced8da8c473"
$handlerNome = "Betinhos.PushRedirect.onLoad"
$appNome = "new_AppMotoristasv2"
$pushFormNome = "App Motoristas (push)"
$pushExibicao = '<DisplayConditions Order="99" FallbackForm="false"><Everyone /></DisplayConditions>'

# LibraryId/HandlerId fixos: so usados quando o form ainda nao tem a biblioteca ou o handler (hoje, so o da despesa).
$alvos = @(
  @{ Tabela = "new_comunicadodestinatario"; FormId = "36eaff7a-b5fe-4bb9-ad88-5f8e256c41a2"; LibraryId = "{1d224d5e-3718-4fc5-b051-7fbd2aec1cc1}"; HandlerId = "{f5bf185f-e33c-49f0-96a7-d50353325ec2}" }
  @{ Tabela = "new_checklistveiculo"; FormId = "4d78490c-5683-4188-a7ce-c090c1d73869"; LibraryId = "{7b4ab7e2-a3be-4c44-82b3-24f1c0859801}"; HandlerId = "{380eaf32-39eb-4e2a-82a9-00eaf5986256}" }
  @{ Tabela = "new_termomulta"; FormId = "38b42dcc-907b-40fc-b505-d5c16c6d9960"; LibraryId = "{fe99aca5-faf7-4e66-862b-6ca6641bc8fd}"; HandlerId = "{df718d8c-3914-497a-bc8a-393965217c33}" }
  @{ Tabela = "cr40f_treinamentoparticipacao"; FormId = "2713ed4f-63ba-45ab-98ba-e6098ba67d70"; LibraryId = "{87b4b44b-e4c4-41b0-830f-d03f1e7ce27f}"; HandlerId = "{4a18e5a6-515b-40cf-9b6b-1e664730106e}" }
  @{ Tabela = "cr40f_despesaoperacional"; FormId = "9306a5ef-faed-4723-b089-d164a3243383"; LibraryId = "{1067fd9c-bc2d-4aba-8967-43f230c438ca}"; HandlerId = "{a5ac0bd8-b5ad-4ec5-83f5-bff24efd6048}" }
  @{ Tabela = "cr40f_reservadeveculos"; FormId = "8b1aea98-9cc9-f111-a05c-7ced8da8c473"; LibraryId = "{f1bee837-9ed6-4cb2-80f5-1b1a5d361436}"; HandlerId = "{819f1396-9d13-4372-9092-3f3d0bb54916}"; Nome = $pushFormNome; Exibicao = $pushExibicao }
)

# Acrescenta biblioteca e handler que faltam. Retorna a lista do que mudou (vazia = form ja certo).
function Set-Redirect([xml] $Xml, $Alvo) {
  $raiz = $Xml.DocumentElement
  $mudou = @()
  $bibliotecas = $raiz.SelectSingleNode("formLibraries")
  if ($null -eq $bibliotecas) { $bibliotecas = $Xml.CreateElement("formLibraries") }
  $eventos = $raiz.SelectSingleNode("events")
  if ($null -eq $eventos) { $eventos = $Xml.CreateElement("events") }
  if ($null -eq $bibliotecas.SelectSingleNode("Library[@name='$biblioteca']")) {
    $lib = $Xml.CreateElement("Library")
    $lib.SetAttribute("name", $biblioteca); $lib.SetAttribute("libraryUniqueId", $Alvo.LibraryId)
    $bibliotecas.AppendChild($lib) | Out-Null
    $mudou += "biblioteca"
  }
  $onload = $eventos.SelectSingleNode("event[@name='onload']")
  if ($null -eq $onload) {
    $onload = $Xml.CreateElement("event")
    $onload.SetAttribute("name", "onload"); $onload.SetAttribute("application", "false"); $onload.SetAttribute("active", "false")
    $eventos.AppendChild($onload) | Out-Null
  }
  if ($null -eq $onload.SelectSingleNode("Handlers/Handler[@functionName='$handlerNome' and @libraryName='$biblioteca']")) {
    $handlers = $onload.SelectSingleNode("Handlers")
    if ($null -eq $handlers) { $handlers = $onload.AppendChild($Xml.CreateElement("Handlers")) }
    $h = $Xml.CreateElement("Handler")
    $h.SetAttribute("functionName", $handlerNome); $h.SetAttribute("libraryName", $biblioteca)
    $h.SetAttribute("handlerUniqueId", $Alvo.HandlerId); $h.SetAttribute("enabled", "true")
    $h.SetAttribute("parameters", ""); $h.SetAttribute("passExecutionContext", "true")
    $handlers.AppendChild($h) | Out-Null
    $mudou += "OnLoad"
  }
  if ($Alvo.ContainsKey("Exibicao")) {
    $esperada = ([xml]$Alvo.Exibicao).DocumentElement
    $exibicao = $raiz.SelectSingleNode("DisplayConditions")
    if ($null -eq $exibicao -or $exibicao.OuterXml -ne $esperada.OuterXml) {
      if ($null -ne $exibicao) { $raiz.RemoveChild($exibicao) | Out-Null }
      $raiz.AppendChild($Xml.ImportNode($esperada, $true)) | Out-Null
      $mudou += "exibicao (todos, ordem 99)"
    }
  }
  if ($mudou.Count) {
    # Ordem aceita pelo Dataverse: ... formLibraries, events, DisplayConditions (no fim).
    foreach ($n in @($bibliotecas, $eventos)) { if ($null -ne $n.ParentNode) { $raiz.RemoveChild($n) | Out-Null } }
    $exibicao = $raiz.SelectSingleNode("DisplayConditions")
    if ($null -ne $exibicao) { $raiz.InsertBefore($bibliotecas, $exibicao) | Out-Null; $raiz.InsertBefore($eventos, $exibicao) | Out-Null }
    else { $raiz.AppendChild($bibliotecas) | Out-Null; $raiz.AppendChild($eventos) | Out-Null }
  }
  return ,$mudou
}

# Confere tudo antes de gravar.
$wr = @(Get-Rows "webresourceset" "webresourceid" "name eq '$biblioteca'")
if ($wr.Count -ne 1 -or "$($wr[0].webresourceid)" -ne $bibliotecaId) { throw "Web resource $biblioteca ausente ou com id diferente de $bibliotecaId (o de TEST e PROD)." }
$apps = @(Get-Rows "appmodules" "appmoduleid" "uniquename eq '$appNome'")
if ($apps.Count -ne 1) { throw "App $appNome ausente ou duplicado." }
$appId = $apps[0].appmoduleid
$noApp = @((Invoke-Dv "GET" "RetrieveAppComponents(AppModuleId=$appId)").value)

foreach ($a in $alvos) {
  $f = $null
  try { $f = Invoke-Dv "GET" "systemforms($($a.FormId))?`$select=formid,name,objecttypecode,type,ismanaged,formactivationstate,formxml" }
  catch { throw "Form $($a.FormId) de $($a.Tabela) ausente no DEV: esta migration nao cria form (o id tem de ser o de TEST e PROD). $($_.Exception.Message)" }
  if ($f.objecttypecode -ne $a.Tabela -or [int]$f.type -ne 2) { throw "Form $($a.FormId) nao e o form principal de $($a.Tabela)." }
  if ($a.ContainsKey("Nome") -and $f.name -ne $a.Nome) { throw "Form $($a.FormId) se chama '$($f.name)', esperado '$($a.Nome)'." }
  if ([bool]$f.ismanaged) { throw "Form $($a.FormId) de $($a.Tabela) e gerenciado; nao pode ser editado aqui." }
  if ([int]$f.formactivationstate -ne 1) { throw "Form $($a.FormId) de $($a.Tabela) inativo." }
  [xml] $xml = $f.formxml
  $a.Xml = $xml
  $a.Mudou = Set-Redirect $xml $a
  $meta = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$($a.Tabela)')?`$select=MetadataId,PrimaryIdAttribute"
  $a.EntityId = "$($meta.MetadataId)"
  $a.PrimaryId = $meta.PrimaryIdAttribute
  $a.FaltaTabelaNoApp = @($noApp | Where-Object { [int]$_.componenttype -eq 1 -and "$($_.objectid)" -eq $a.EntityId }).Count -eq 0
  $a.FaltaFormNoApp = @($noApp | Where-Object { [int]$_.componenttype -eq 60 -and "$($_.objectid)" -eq $a.FormId }).Count -eq 0
  $plano = @($a.Mudou)
  if ($a.FaltaTabelaNoApp) { $plano += "tabela no app" }
  if ($a.FaltaFormNoApp) { $plano += "form no app" }
  Write-Step "$($a.Tabela) form $($a.FormId): $(if ($plano.Count) { 'acrescenta ' + ($plano -join ', ') } else { 'sem mudanca' })"
}

$forms = @($alvos | Where-Object { $_.Mudou.Count })
$componentes = @()
foreach ($a in $alvos) {
  if ($a.FaltaTabelaNoApp) { $componentes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.$($a.Tabela)"; "$($a.PrimaryId)" = $a.EntityId } }
  if ($a.FaltaFormNoApp) { $componentes += [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.systemform"; formid = $a.FormId } }
}
if (-not $forms.Count -and -not $componentes.Count) { Write-Step "nada a fazer: forms e app ja configurados."; return }
if (-not $Apply) { Write-Step "DRY RUN: $($forms.Count) form(s) e $($componentes.Count) componente(s) do app mudariam. Use -Apply para aplicar."; return }

foreach ($a in $forms) {
  Invoke-Dv "PATCH" "systemforms($($a.FormId))" @{ formxml = $a.Xml.OuterXml } | Out-Null
  Write-Step "form de $($a.Tabela) atualizado: $($a.Mudou -join ', ')"
}
if ($forms.Count) {
  $tabelas = ($forms | ForEach-Object { "<entity>$($_.Tabela)</entity>" }) -join ""
  Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities>$tabelas</entities></importexportxml>" } | Out-Null
}
if ($componentes.Count) {
  Invoke-Dv "POST" "AddAppComponents" @{ AppId = "$appId"; Components = $componentes } | Out-Null
  Invoke-Dv "POST" "PublishXml" @{ ParameterXml = "<importexportxml><appmodules><appmodule>{$appId}</appmodule></appmodules></importexportxml>" } | Out-Null
  Write-Step "componentes adicionados ao app: $($componentes.Count)"
}

# Confere o que ficou publicado.
$noApp = @((Invoke-Dv "GET" "RetrieveAppComponents(AppModuleId=$appId)").value)
foreach ($a in $alvos) {
  $x = (Invoke-Dv "GET" "systemforms($($a.FormId))?`$select=formxml").formxml
  if ($x -notmatch [regex]::Escape("functionName=`"$handlerNome`"")) { throw "Form de $($a.Tabela) sem o handler $handlerNome depois de publicar." }
  if (@($noApp | Where-Object { [int]$_.componenttype -eq 1 -and "$($_.objectid)" -eq $a.EntityId }).Count -ne 1) { throw "Tabela $($a.Tabela) fora do app $appNome." }
  if (@($noApp | Where-Object { [int]$_.componenttype -eq 60 -and "$($_.objectid)" -eq $a.FormId }).Count -ne 1) { throw "Form de $($a.Tabela) fora do app $appNome." }
}
Write-Step "OK: redirect do push nos forms e no app $appNome."
