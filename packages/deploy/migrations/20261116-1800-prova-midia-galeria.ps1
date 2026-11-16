param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Prova de captura de midia, fase 2 (galeria, PDF, selos e foto repetida). Depende de 20261116-1400-prova-midia.ps1.
# - cr40f_provamidia ganha: SHA-256 do original da galeria, data gravada no arquivo e fuso, marca, modelo e software do
#   aparelho, paginas do PDF, os dois dHash (original e com carimbo) com 4 faixas de 16 bits cada (a busca de parecidas
#   filtra por faixa igual) e lookups opcionais para manutencao e colisao (o plugin preenche quando o id e real).
# - Choices: tela "Devolucao de despesa", tipo "PDF", origem "Galeria ou arquivo" e os selos fora da janela, sem data,
#   repetida e parecida. Os valores seguem a ordem do ProvaMidiaHandler (so acrescenta no fim).
# - Variavel de ambiente cr40f_ProvaMidiaModoRepetida (texto, nao secreta), padrao "observar". "bloquear" bloqueia tambem
#   a parecida por dHash; a repetida exata por SHA-256 bloqueia nos dois modos.
# - Subgrid "Provas de midia" no form principal padrao de cr40f_manutencoes e de cr40f_colisao_v2 (secao nova no fim da
#   primeira aba), pela relacao do lookup novo. Form gerenciado ou ausente falha.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_provamidia"
if (@(Get-Rows "EntityDefinitions" "MetadataId" "LogicalName eq '$table'").Count -ne 1) { throw "Tabela $table ausente: rode antes 20261116-1400-prova-midia.ps1." }

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = 0; $c.MaxValue = $Max; return $c
}
function DataHora([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateAndTime"; $c.DateTimeBehavior = @{ Value = "UserLocal" }; return $c
}

$colunas = @(
  (Texto "cr40f_sha256original" "SHA-256 do original" "Impress$([char]0xE3)o digital do arquivo escolhido na galeria, antes da redu$([char]0xE7)$([char]0xE3)o." 64),
  (DataHora "cr40f_datagravada" "Data gravada no arquivo" "DateTimeOriginal do EXIF ou creation_time do v$([char]0xED)deo. Vazio = sem data."),
  (Texto "cr40f_fusogravado" "Fuso gravado" "OffsetTimeOriginal do EXIF (ex.: -03:00)." 10),
  (Texto "cr40f_marca" "Marca do aparelho" "Make do EXIF." 100),
  (Texto "cr40f_modelo" "Modelo do aparelho" "Model do EXIF." 100),
  (Texto "cr40f_software" "Software" "Software do EXIF." 100),
  (Inteiro "cr40f_paginas" "P$([char]0xE1)ginas" "P$([char]0xE1)ginas do PDF." 100000),
  (Texto "cr40f_dhash" "dHash" "Impress$([char]0xE3)o visual (64 bits, hex) da imagem original." 16),
  (Texto "cr40f_dhashcarimbo" "dHash com carimbo" "Impress$([char]0xE3)o visual da foto final da c$([char]0xE2)mera do app, j$([char]0xE1) com carimbo." 16)
)
foreach ($slot in @("cr40f_dhash", "cr40f_dhashcarimbo")) {
  foreach ($i in 1..4) { $colunas += (Inteiro "${slot}faixa$i" "$slot faixa $i" "Faixa $i (16 bits) do $slot, para a busca de fotos parecidas." 65535) }
}

$opcoes = @(
  @{ Coluna = "cr40f_tela"; Tipo = "PicklistAttributeMetadata"; Valor = 100000006; Rotulo = "Devolu$([char]0xE7)$([char]0xE3)o de despesa" },
  @{ Coluna = "cr40f_tipomidia"; Tipo = "PicklistAttributeMetadata"; Valor = 100000002; Rotulo = "PDF" },
  @{ Coluna = "cr40f_origemcaptura"; Tipo = "PicklistAttributeMetadata"; Valor = 100000002; Rotulo = "Galeria ou arquivo" },
  @{ Coluna = "cr40f_selos"; Tipo = "MultiSelectPicklistAttributeMetadata"; Valor = 100000003; Rotulo = "Fora da janela" },
  @{ Coluna = "cr40f_selos"; Tipo = "MultiSelectPicklistAttributeMetadata"; Valor = 100000004; Rotulo = "Sem data" },
  @{ Coluna = "cr40f_selos"; Tipo = "MultiSelectPicklistAttributeMetadata"; Valor = 100000005; Rotulo = "Repetida" },
  @{ Coluna = "cr40f_selos"; Tipo = "MultiSelectPicklistAttributeMetadata"; Valor = 100000006; Rotulo = "Parecida" }
)

$lookups = @(
  @{ Schema = "cr40f_manutencao"; Rel = "cr40f_manutencoes_cr40f_provamidia_manutencao"; Alvo = "cr40f_manutencoes"; AlvoId = "cr40f_manutencoesid"; Nome = "Manuten$([char]0xE7)$([char]0xE3)o"; SecaoId = "{6f1d2b0e-5a3c-4c1e-9b7a-0d6c1f2e3a41}"; CelulaId = "{6f1d2b0e-5a3c-4c1e-9b7a-0d6c1f2e3a42}"; ControleId = "{6f1d2b0e-5a3c-4c1e-9b7a-0d6c1f2e3a43}" },
  @{ Schema = "cr40f_colisao"; Rel = "cr40f_colisao_v2_cr40f_provamidia_colisao"; Alvo = "cr40f_colisao_v2"; AlvoId = "cr40f_colisao_v2id"; Nome = "Colis$([char]0xE3)o"; SecaoId = "{7a2e3c1f-6b4d-4d2f-8c8b-1e7d2a3f4b51}"; CelulaId = "{7a2e3c1f-6b4d-4d2f-8c8b-1e7d2a3f4b52}"; ControleId = "{7a2e3c1f-6b4d-4d2f-8c8b-1e7d2a3f4b53}" }
)

$variavel = "cr40f_ProvaMidiaModoRepetida"
$secaoNome = "provas_de_midia"
$tituloSubgrid = "Provas de m$([char]0xED)dia"

# ---------- colunas ----------
$novasColunas = @()
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  if (Get-Coluna $table $logical) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical."; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
  $found = Get-Coluna $table $logical
  if (-not $found) { throw "Coluna $logical nao foi criada." }
  $novasColunas += $found.MetadataId
  Write-Step "criada $table.$logical"
}

# ---------- opcoes ----------
foreach ($o in $opcoes) {
  $meta = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$($o.Coluna)')/Microsoft.Dynamics.CRM.$($o.Tipo)?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
  if (@($meta.OptionSet.Options | Where-Object { [int]$_.Value -eq $o.Valor }).Count) { continue }
  if (-not $Apply) { Write-Step "DRY RUN acrescentaria $($o.Coluna) = $($o.Valor) ($($o.Rotulo))."; continue }
  Invoke-Dv "POST" "InsertOptionValue" @{ EntityLogicalName = $table; AttributeLogicalName = $o.Coluna; Value = $o.Valor; Label = (Label $o.Rotulo); SolutionUniqueName = $script:SolucaoDev } | Out-Null
  Write-Step "opcao $($o.Coluna) = $($o.Valor) ($($o.Rotulo))"
}

# ---------- lookups ----------
foreach ($l in $lookups) {
  if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$($l.Rel)'").Count) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.$($l.Schema) -> $($l.Alvo)."; continue }
  Invoke-Dv "POST" "RelationshipDefinitions" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $l.Rel
    ReferencedEntity = $l.Alvo; ReferencedAttribute = $l.AlvoId; ReferencingEntity = $table
    CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
    Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = $l.Schema; DisplayName = (Label $l.Nome); Description = (Label "Preenchido pelo plugin quando a prova vem de um registro j$([char]0xE1) criado."); RequiredLevel = @{ Value = "None" } }
  } | Out-Null
  $found = Get-Coluna $table $l.Schema
  if (-not $found) { throw "Lookup $($l.Schema) nao foi criado." }
  $novasColunas += $found.MetadataId
  Write-Step "criado lookup $table.$($l.Schema)"
}

# ---------- variavel de ambiente ----------
$def = @(Get-Rows "environmentvariabledefinitions" "environmentvariabledefinitionid,defaultvalue" "schemaname eq '$variavel'")
if ($def.Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria a variavel $variavel = observar." }
  else {
    Invoke-Dv "POST" "environmentvariabledefinitions" @{
      schemaname = $variavel; displayname = "Prova de m$([char]0xED)dia: modo da foto repetida"
      description = "observar: a repetida exata bloqueia e a parecida s$([char]0xF3) ganha selo. bloquear: bloqueia as duas."
      type = 100000000; defaultvalue = "observar"; isrequired = $false
    } | Out-Null
    $def = @(Get-Rows "environmentvariabledefinitions" "environmentvariabledefinitionid,defaultvalue" "schemaname eq '$variavel'")
    if ($def.Count -ne 1) { throw "Variavel $variavel nao foi criada." }
    Write-Step "criada a variavel $variavel = observar"
  }
}

if (-not $Apply) {
  foreach ($l in $lookups) { Write-Step "DRY RUN poria o subgrid '$tituloSubgrid' no form principal padrao de $($l.Alvo)." }
  Write-Step "dry-run: nada gravado."
  return
}

foreach ($id in $novasColunas) { Add-ComponenteNaSolucao $id 2 }
Add-ComponenteNaSolucao $def[0].environmentvariabledefinitionid 380
Publish-Tabela $table

# ---------- subgrid nos forms ----------
$visoes = @(Get-Rows "savedqueries" "savedqueryid" "returnedtypecode eq '$table' and querytype eq 0 and isdefault eq true")
if ($visoes.Count -ne 1) { throw "Visao padrao de $table nao encontrada." }
$visaoId = "{$($visoes[0].savedqueryid)}"

foreach ($l in $lookups) {
  $forms = @(Get-Rows "systemforms" "formid,name,ismanaged,formxml" "objecttypecode eq '$($l.Alvo)' and type eq 2 and isdefault eq true and formactivationstate eq 1")
  if ($forms.Count -ne 1) { throw "Form principal padrao de $($l.Alvo) nao encontrado (achados: $($forms.Count))." }
  $f = $forms[0]
  if ([bool]$f.ismanaged) { throw "Form $($f.formid) de $($l.Alvo) e gerenciado." }
  [xml] $xml = $f.formxml
  if ($null -ne $xml.SelectSingleNode("//section[@name='$secaoNome']")) { Write-Step "$($l.Alvo): subgrid ja existe."; continue }
  $coluna = $xml.SelectSingleNode("/form/tabs/tab[1]/columns/column[1]/sections")
  if ($null -eq $coluna) { throw "Form $($f.formid) de $($l.Alvo) sem a primeira aba." }
  $secao = [xml] @"
<section name="$secaoNome" showlabel="true" showbar="false" id="$($l.SecaoId)" IsUserDefined="0" columns="1"><labels><label description="$tituloSubgrid" languagecode="1046" /></labels><rows><row><cell id="$($l.CelulaId)" showlabel="false" rowspan="8" colspan="1"><labels><label description="$tituloSubgrid" languagecode="1046" /></labels><control id="provas_de_midia_grid" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" indicationOfSubgrid="true" uniqueid="$($l.ControleId)"><parameters><ViewId>$visaoId</ViewId><IsUserView>false</IsUserView><RelationshipName>$($l.Rel)</RelationshipName><TargetEntityType>$table</TargetEntityType><AutoExpand>Fixed</AutoExpand><EnableQuickFind>false</EnableQuickFind><EnableViewPicker>false</EnableViewPicker><ViewIds /><EnableJumpBar>false</EnableJumpBar><ChartGridMode>Grid</ChartGridMode><VisualizationId /><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker><RecordsPerPage>10</RecordsPerPage></parameters></control></cell></row></rows></section>
"@
  $coluna.AppendChild($xml.ImportNode($secao.DocumentElement, $true)) | Out-Null
  Invoke-Dv "PATCH" "systemforms($($f.formid))" @{ formxml = $xml.OuterXml } | Out-Null
  Publish-Tabela $l.Alvo
  $depois = (Invoke-Dv "GET" "systemforms($($f.formid))?`$select=formxml").formxml
  if ($depois -notmatch [regex]::Escape("<RelationshipName>$($l.Rel)</RelationshipName>")) { throw "Subgrid nao ficou no form de $($l.Alvo)." }
  Write-Step "subgrid '$tituloSubgrid' no form '$($f.name)' de $($l.Alvo)"
}
Write-Step "OK: fase 2 da prova de midia em $table, variavel $variavel e forms de manutencao e colisao."
