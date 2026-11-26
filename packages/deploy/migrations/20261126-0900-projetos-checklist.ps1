param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Checklist do projeto (26/11/2026). O quadro Projetos do Planner ficou simples: titulo, descricao, checklist e anexos.
# Coluna nova cr40f_projeto.cr40f_checklist ("Checklist", texto multilinha, 100000): JSON com os itens,
# [{"texto":"...","feito":false}], gravado pela tela. O papel Projetos ja le e grava a tabela. Idempotente. Somente DEV.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$tabela = "cr40f_projeto"
$coluna = "cr40f_checklist"

if (Get-Coluna $tabela $coluna) { Write-Step "$tabela.$coluna ja existe: nada a criar" }
elseif (-not $Apply) { Write-Step "DRY RUN criaria $tabela.$coluna (memo TextArea 100000)." }
else {
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$tabela')/Attributes" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Checklist"
    DisplayName = (Label "Checklist"); Description = (Label (U "Itens do checklist do projeto em JSON ([{texto, feito}]), gravados pelo quadro Projetos do Planner"))
    RequiredLevel = @{ Value = "None" }; MaxLength = 100000; Format = "TextArea"
  } | Out-Null
  Write-Step "criada a coluna $tabela.$coluna"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

$col = Get-Coluna $tabela $coluna
if (-not $col) { throw "Coluna $tabela.$coluna nao encontrada depois de criar." }
Add-ComponenteNaSolucao $col.MetadataId 2
Publish-Tabela $tabela
Write-Step "OK: $tabela.$coluna na AppBetinhos e publicada."
