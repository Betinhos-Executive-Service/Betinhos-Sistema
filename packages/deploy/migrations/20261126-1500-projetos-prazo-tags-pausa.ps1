param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Prazo, tags e motivo da pausa dos Projetos do Planner (26/11/2026). Tudo opcional. Idempotente. Somente DEV.
# cr40f_projeto.cr40f_prazo     (so data): ultimo dia do periodo escolhido (o proprio dia, o domingo da semana ou o fim do mes).
# cr40f_projeto.cr40f_prazotipo (escolha local): Dia 100000000, Semana 100000001, Mes 100000002.
# cr40f_projeto.cr40f_tags      (texto 1000): tags separadas por virgula ("Frota, App Motoristas").
# cr40f_projetoetapa.cr40f_motivopausa (texto 500): motivo opcional gravado ao mover o cartao para Pausado.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }
function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}

$prazo = Base "DateTimeAttributeMetadata" "cr40f_Prazo" "Prazo" "Ultimo dia do prazo do projeto (dia, fim da semana ou fim do mês, conforme o tipo do prazo)."
$prazo.Format = "DateOnly"; $prazo.DateTimeBehavior = @{ Value = "DateOnly" }
$tipo = Base "PicklistAttributeMetadata" "cr40f_PrazoTipo" "Tipo do prazo" "Se o prazo do projeto é um dia, uma semana do mês ou o mês inteiro."
$tipo.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = @(
  @{ Value = 100000000; Label = (Label "Dia") }, @{ Value = 100000001; Label = (Label "Semana") }, @{ Value = 100000002; Label = (Label (U "Mês")) }) }

$colunas = @(
  @{ Tabela = "cr40f_projeto"; Def = $prazo },
  @{ Tabela = "cr40f_projeto"; Def = $tipo },
  @{ Tabela = "cr40f_projeto"; Def = (Texto "cr40f_Tags" "Tags" "Tags do projeto separadas por vírgula, gravadas pelo quadro Projetos do Planner." 1000) },
  @{ Tabela = "cr40f_projetoetapa"; Def = (Texto "cr40f_MotivoPausa" "Motivo da pausa" "Motivo opcional informado ao mover o projeto para Pausado." 500) }
)

foreach ($c in $colunas) {
  $nome = $c.Def.SchemaName.ToLowerInvariant()
  if (Get-Coluna $c.Tabela $nome) { Write-Step "$($c.Tabela).$nome ja existe: nada a criar"; continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $($c.Tabela).$nome."; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$($c.Tabela)')/Attributes" $c.Def | Out-Null
  Write-Step "criada $($c.Tabela).$nome"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

foreach ($c in $colunas) {
  $nome = $c.Def.SchemaName.ToLowerInvariant()
  $col = Get-Coluna $c.Tabela $nome
  if (-not $col) { throw "Coluna $($c.Tabela).$nome nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}
Publish-Tabela "cr40f_projeto"
Publish-Tabela "cr40f_projetoetapa"
Write-Step "OK: prazo, tipo do prazo, tags e motivo da pausa na AppBetinhos e publicados."
