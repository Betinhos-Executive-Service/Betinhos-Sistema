param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Identidade do cliente no portal (25/11/2026, decisao do Renan): so o logo, por cliente, cadastrado na tela "Portal do
# cliente" do shell (so o Renan edita) e lido pelo Worker do portal (GET /api/marca e /api/marca/logo/<id>).
#   cr40f_portallogo  Image, ate 1 MB, tamanho cheio (o portal baixa por $value?size=full)
# O papel "Portal do Cliente" nao precisa de ajuste: o Worker le por usuario de aplicacao. Idempotente. Somente DEV; o PROD
# recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$cliente = "cr40f_clientes1"

function Add-Coluna([string] $Logical, [hashtable] $Payload) {
  if (Get-Coluna $cliente $Logical) { return }
  if (-not $Apply) { Write-Step "DRY RUN criaria $cliente.$Logical."; return }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$cliente')/Attributes" $Payload | Out-Null
  Write-Step "criada $cliente.$Logical"
}

Add-Coluna "cr40f_portallogo" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.ImageAttributeMetadata"; SchemaName = "cr40f_PortalLogo"
  DisplayName = (Label "Portal: logo"); Description = (Label (U "Logo do cliente no login e no topo do portal (PNG ou JPG, até 1 MB). Editado só pela tela Portal do cliente"))
  RequiredLevel = @{ Value = "None" }; CanStoreFullImage = $true; IsPrimaryImage = $false; MaxSizeInKB = 1024
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $cliente
$col = Get-Coluna $cliente "cr40f_portallogo"
if (-not $col) { throw "Coluna $cliente.cr40f_portallogo nao encontrada depois de criar." }
Add-ComponenteNaSolucao $col.MetadataId 2
Write-Step "OK: logo do cliente no portal (cr40f_portallogo)."
