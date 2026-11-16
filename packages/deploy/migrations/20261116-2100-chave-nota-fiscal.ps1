param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Chave da nota fiscal na despesa (fase 3 da prova de captura). Depende de 20261116-1800-prova-midia-galeria.ps1.
# - cr40f_anexodespesaoperacional ganha: chave de acesso (44), UF, AAMM, CNPJ do emitente, modelo e numero (preenchidos
#   pelo plugin NotaFiscalAnexoPlugin a partir da chave), origem da chave (choice) e situacao da nota (choice).
#   Origem: QR, codigo de barras, PDF, leitura rapida, digitada. Situacao: chave conferida, nao verificada, sem nota fiscal.
#   Os valores seguem a ordem do app (chaveNotaFiscal.ts) e do plugin (so acrescenta no fim).
# - cr40f_provamidia ganha valor lido e data lida (o que a leitura rapida preencheu) e os selos nota nao verificada,
#   sem nota fiscal e valor alterado, no fim da multi-choice, na ordem do ProvaMidiaHandler.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes. O plugin type e os steps do plugin ficam no
# packages/plugins/scripts/register-notafiscal-anexo-plugin.ps1 (a mao, depois do Deploy publicar o assembly).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$anexo = "cr40f_anexodespesaoperacional"
$prova = "cr40f_provamidia"
foreach ($t in @($anexo, $prova)) {
  if (@(Get-Rows "EntityDefinitions" "MetadataId" "LogicalName eq '$t'").Count -ne 1) { throw "Tabela $t ausente no DEV." }
}

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = 0; $c.MaxValue = $Max; return $c
}
function Decimal([string] $Schema, [string] $Nome, [string] $Desc, [int] $Precisao, [double] $Min, [double] $Max) {
  $c = Base "DecimalAttributeMetadata" $Schema $Nome $Desc; $c.Precision = $Precisao; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
}
function SoData([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
}
function Escolha([string] $Schema, [string] $Nome, [string] $Desc, [string[]] $Rotulos) {
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label $r) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

$colunas = @(
  @{ Tabela = $anexo; Meta = (Texto "cr40f_chaveacesso" "Chave de acesso" "Chave da nota fiscal (44 posi$([char]0xE7)$([char]0xF5)es), conferida pelo plugin: DV, m$([char]0xEA)s da despesa e uso $([char]0xFA)nico." 44) },
  @{ Tabela = $anexo; Meta = (Texto "cr40f_notauf" "UF da nota" "Estado do emitente, da chave." 2) },
  @{ Tabela = $anexo; Meta = (Texto "cr40f_notaaamm" "AAMM da nota" "Ano e m$([char]0xEA)s de emiss$([char]0xE3)o, da chave." 4) },
  @{ Tabela = $anexo; Meta = (Texto "cr40f_notacnpjemitente" "CNPJ do emitente" "CNPJ do emitente, da chave (aceita o alfanum$([char]0xE9)rico)." 14) },
  @{ Tabela = $anexo; Meta = (Texto "cr40f_notamodelo" "Modelo da nota" "55 NF-e, 65 NFC-e, 59 CF-e SAT." 2) },
  @{ Tabela = $anexo; Meta = (Inteiro "cr40f_notanumero" "N$([char]0xFA)mero da nota" "N$([char]0xFA)mero da nota ou do cupom, da chave." 999999999) },
  @{ Tabela = $anexo; Meta = (Escolha "cr40f_origemchave" "Origem da chave" "Como o motorista informou a chave." @("QR", "C$([char]0xF3)digo de barras", "PDF", "Leitura r$([char]0xE1)pida", "Digitada")) },
  @{ Tabela = $anexo; Meta = (Escolha "cr40f_situacaonota" "Situa$([char]0xE7)$([char]0xE3)o da nota" "Chave conferida = chave v$([char]0xE1)lida, do m$([char]0xEA)s e $([char]0xFA)nica; n$([char]0xE3)o $([char]0xE9) confirma$([char]0xE7)$([char]0xE3)o na SEFAZ." @("Chave conferida", "Nota n$([char]0xE3)o verificada", "Sem nota fiscal")) },
  @{ Tabela = $prova; Meta = (Decimal "cr40f_valorlido" "Valor lido" "Valor que a leitura r$([char]0xE1)pida preencheu na despesa." 2 0 1000000) },
  @{ Tabela = $prova; Meta = (SoData "cr40f_datalida" "Data lida" "Data que a leitura r$([char]0xE1)pida preencheu na despesa.") }
)

$selos = @(
  @{ Valor = 100000007; Rotulo = "Nota n$([char]0xE3)o verificada" },
  @{ Valor = 100000008; Rotulo = "Sem nota fiscal" },
  @{ Valor = 100000009; Rotulo = "Valor alterado" }
)

# ---------- colunas ----------
$novas = @()
$publicar = @{}
foreach ($c in $colunas) {
  $logical = $c.Meta.SchemaName.ToLowerInvariant()
  if (Get-Coluna $c.Tabela $logical) { continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $($c.Tabela).$logical."; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$($c.Tabela)')/Attributes" $c.Meta | Out-Null
  $found = Get-Coluna $c.Tabela $logical
  if (-not $found) { throw "Coluna $($c.Tabela).$logical nao foi criada." }
  $novas += $found.MetadataId
  $publicar[$c.Tabela] = $true
  Write-Step "criada $($c.Tabela).$logical"
}

# ---------- selos ----------
$meta = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$prova')/Attributes(LogicalName='cr40f_selos')/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
$existentes = @($meta.OptionSet.Options | ForEach-Object { [int]$_.Value })
# A fase 2 tem de ter deixado 100000000..100000006: os novos valores so valem na ordem do handler.
foreach ($v in 100000000..100000006) { if ($existentes -notcontains $v) { throw "cr40f_selos sem o valor $v da fase 1 ou 2." } }
foreach ($s in $selos) {
  if ($existentes -contains $s.Valor) { continue }
  if (-not $Apply) { Write-Step "DRY RUN acrescentaria cr40f_selos = $($s.Valor) ($($s.Rotulo))."; continue }
  Invoke-Dv "POST" "InsertOptionValue" @{ EntityLogicalName = $prova; AttributeLogicalName = "cr40f_selos"; Value = $s.Valor; Label = (Label $s.Rotulo); SolutionUniqueName = $script:SolucaoDev } | Out-Null
  $publicar[$prova] = $true
  Write-Step "opcao cr40f_selos = $($s.Valor) ($($s.Rotulo))"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

foreach ($id in $novas) { Add-ComponenteNaSolucao $id 2 }
foreach ($t in $publicar.Keys) { Publish-Tabela $t }
Write-Step "OK: chave da nota fiscal em $anexo e selos da fase 3 em $prova."
