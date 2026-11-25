param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Endereco de destino padrao da pessoa (25/11/2026). No Pedir do portal, ao escolher um passageiro cadastrado, a Saida usa
# cr40f_bancodedados.cr40f_enderecodesaida (ja existe) e o Destino usa esta coluna nova, cr40f_enderecodedestino
# ("Endereco de Destino", texto multilinha, 4000, igual a de saida). Sem seguranca de coluna (a de saida tambem nao tem);
# o papel "Portal do Cliente" ja le e grava a tabela (migration 20261125-1000). Idempotente. Somente DEV.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$pessoa = "cr40f_bancodedados"
$coluna = "cr40f_enderecodedestino"

if (Get-Coluna $pessoa $coluna) { Write-Step "$pessoa.$coluna ja existe: nada a criar" }
elseif (-not $Apply) { Write-Step "DRY RUN criaria $pessoa.$coluna (memo TextArea 4000)." }
else {
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$pessoa')/Attributes" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_EnderecodeDestino"
    DisplayName = (Label (U "Endereço de Destino")); Description = (Label (U "Endereço de destino padrão da pessoa; o Pedir do portal e o shell preenchem o Destino com ele"))
    RequiredLevel = @{ Value = "None" }; MaxLength = 4000; Format = "TextArea"
  } | Out-Null
  Write-Step "criada a coluna $pessoa.$coluna"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

$col = Get-Coluna $pessoa $coluna
if (-not $col) { throw "Coluna $pessoa.$coluna nao encontrada depois de criar." }
Add-ComponenteNaSolucao $col.MetadataId 2
Publish-Tabela $pessoa
Write-Step "OK: $pessoa.$coluna na AppBetinhos e publicada."
