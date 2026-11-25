param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Identidade do cliente no portal (25/11/2026, decisao do Renan): logo, cor e nome de exibicao por cliente, cadastrados na
# tela "Portal do cliente" do shell (so o Renan edita) e lidos pelo Worker do portal (GET /api/marca e /api/marca/logo/<id>).
#   cr40f_portallogo         Image, ate 1 MB, tamanho cheio (o portal baixa por $value?size=full)
#   cr40f_portalcor          texto #RRGGBB (o portal so usa se o contraste com branco for >= 4,5:1)
#   cr40f_portalnomeexibicao nome mostrado no topo do portal (vazio = nome do cliente)
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
Add-Coluna "cr40f_portalcor" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_PortalCor"
  DisplayName = (Label "Portal: cor"); Description = (Label (U "Cor da marca no portal, formato #RRGGBB. Usada na faixa do topo e no botão principal quando o contraste com branco é suficiente"))
  RequiredLevel = @{ Value = "None" }; MaxLength = 7; FormatName = @{ Value = "Text" }
}
Add-Coluna "cr40f_portalnomeexibicao" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_PortalNomeExibicao"
  DisplayName = (Label (U "Portal: nome de exibição")); Description = (Label (U "Nome mostrado no topo do portal e no logo. Vazio = nome do cliente"))
  RequiredLevel = @{ Value = "None" }; MaxLength = 100; FormatName = @{ Value = "Text" }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $cliente
foreach ($c in @("cr40f_portallogo", "cr40f_portalcor", "cr40f_portalnomeexibicao")) {
  $col = Get-Coluna $cliente $c
  if (-not $col) { throw "Coluna $cliente.$c nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}
Write-Step "OK: identidade do cliente no portal (cr40f_portallogo, cr40f_portalcor, cr40f_portalnomeexibicao)."
