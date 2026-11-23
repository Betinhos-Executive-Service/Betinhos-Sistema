param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Portal multi-cliente (PR #245, 01/11/2026): o provision-portal-cliente.ps1 criou as tabelas no DEV antes do multi-cliente,
# e as colunas novas nunca chegaram. Cria em cr40f_clientes1 os modulos (Validar / Pedir / Meus servicos) e os dominios,
# na reserva o lookup do usuario do portal e o memo do pedido. Cliente ja habilitado sem modulo ganha Validar (Tenaris).
# Valores dos modulos espelham apps/portal-cliente/worker/schema.ts (MODULO_DV). Idempotente. Somente DEV.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

$cliente = "cr40f_clientes1"
$reserva = "cr40f_reservadeveculos"
$validador = "cr40f_validadorcliente"

function Add-Coluna([string] $Tabela, [string] $Logical, [hashtable] $Payload) {
  if (Get-Coluna $Tabela $Logical) { return }
  if (-not $Apply) { Write-Step "DRY RUN criaria $Tabela.$Logical."; return }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$Tabela')/Attributes" $Payload | Out-Null
  Write-Step "criada $Tabela.$Logical"
}

$opcoes = @()
$rotulos = @("Validar", "Pedir", (U "Meus serviços"))
for ($i = 0; $i -lt $rotulos.Count; $i++) { $opcoes += @{ Value = 100000000 + $i; Label = (Label $rotulos[$i]) } }
Add-Coluna $cliente "cr40f_portalmodulos" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"; SchemaName = "cr40f_PortalModulos"
  DisplayName = (Label (U "Módulos do portal")); Description = (Label (U "O que o cliente faz no portal; sem módulo ninguém do cliente entra"))
  RequiredLevel = @{ Value = "None" }
  OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
}
Add-Coluna $cliente "cr40f_portaldominios" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_PortalDominios"
  DisplayName = (Label (U "Domínios do portal")); Description = (Label (U "Domínios de e-mail (separados por ; ) que entram no portal sem cadastro prévio; ex.: latasa.com.br"))
  RequiredLevel = @{ Value = "None" }; MaxLength = 500; FormatName = @{ Value = "Text" }
}
Add-Coluna $reserva "cr40f_portalpedido" @{
  "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_PortalPedido"
  DisplayName = (Label "Pedido do portal"); Description = (Label (U "Passageiros e observação informados pelo cliente no portal (JSON); não editar"))
  RequiredLevel = @{ Value = "None" }; MaxLength = 4000; Format = "TextArea"
}

# Quem pediu pelo portal (modulo Pedir); Meus servicos lista por este lookup. Apagar o usuario so limpa o lookup.
$rel = "cr40f_validadorcliente_cr40f_reservadeveculos_portalusuario"
if (@(Get-Rows "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $reserva.cr40f_portalusuario." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = $validador; ReferencedAttribute = "${validador}id"; ReferencingEntity = $reserva
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_PortalUsuario"; DisplayName = (Label (U "Usuário do portal")); Description = (Label (U "Usuário do portal do cliente que pediu este serviço")); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $reserva.cr40f_portalusuario"
  }
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

Publish-Tabela $cliente
Publish-Tabela $reserva
foreach ($par in @(@($cliente, "cr40f_portalmodulos"), @($cliente, "cr40f_portaldominios"), @($reserva, "cr40f_portalpedido"), @($reserva, "cr40f_portalusuario"))) {
  $col = Get-Coluna $par[0] $par[1]
  if (-not $col) { throw "Coluna $($par[0]).$($par[1]) nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}

# Quem ja tinha o portal (Tenaris) continua validando; sem isso o campo novo vazio barraria o login.
foreach ($c in @(Get-Rows "cr40f_clientes1s" "cr40f_clientes1id,cr40f_nomedocliente" "cr40f_portalhabilitado eq true and cr40f_portalmodulos eq null")) {
  Invoke-Dv "PATCH" "cr40f_clientes1s($($c.cr40f_clientes1id))" @{ cr40f_portalmodulos = "100000000" } | Out-Null
  Write-Step "modulo Validar no cliente $($c.cr40f_nomedocliente)"
}
Write-Step "OK: portal multi-cliente (modulos, dominios, pedido e usuario do portal)."
