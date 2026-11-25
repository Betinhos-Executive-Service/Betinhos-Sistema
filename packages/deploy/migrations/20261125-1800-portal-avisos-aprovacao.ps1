param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Avisos e aprovacao no portal do cliente (25/11/2026). Seis colunas, nenhuma tabela nova:
#   cr40f_clientes1.cr40f_portalexigeaprovacao          Sim/Nao: o pedido do portal so chega a operacao depois de aprovado
#   cr40f_validadorcliente.cr40f_aprovador              Sim/Nao: este usuario do portal aprova pedidos do cliente
#   cr40f_reservadeveculos.cr40f_portalaprovacao        choice local (Pendente 100000000, Aprovado 100000001, Recusado 100000002)
#   cr40f_reservadeveculos.cr40f_portalaprovadopor      texto: nome e e-mail de quem decidiu
#   cr40f_reservadeveculos.cr40f_portalaprovadoem       data e hora da decisao
#   cr40f_reservadeveculos.cr40f_portalmotivorecusa     texto: motivo informado na recusa
# O Worker grava as colunas da reserva com o usuario de aplicacao (papel "Portal do Cliente"): a tabela ja tem Create/Read/Write
# nele e as colunas novas nao tem seguranca de coluna. Pedido pendente fica inativo (statecode 1) ate a decisao, o que o tira
# das telas da operacao. Valores das choices: so acrescentar no fim. Idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = "None" } }
}
function SimNao([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "BooleanAttributeMetadata" $Schema $Nome $Desc; $c.DefaultValue = $false
  $c.OptionSet = @{ TrueOption = @{ Value = 1; Label = (Label "Sim") }; FalseOption = @{ Value = 0; Label = (Label (U "Não")) } }
  return $c
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function DataHora([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateAndTime"; $c.DateTimeBehavior = @{ Value = "UserLocal" }; return $c
}
function Escolha([string] $Schema, [string] $Nome, [string] $Desc, [string[]] $Rotulos) {
  $c = Base "PicklistAttributeMetadata" $Schema $Nome $Desc
  $i = 0
  $opcoes = @(foreach ($r in $Rotulos) { @{ Value = 100000000 + $i; Label = (Label (U $r)) }; $i++ })
  $c.OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = $opcoes }
  return $c
}

$alvos = @(
  @{ Tabela = "cr40f_clientes1"; Logica = "cr40f_portalexigeaprovacao"; Coluna = (SimNao "cr40f_PortalExigeAprovacao" "Portal: exige aprovação" "Pedidos do portal só chegam à operação depois da aprovação de um aprovador do cliente.") },
  @{ Tabela = "cr40f_validadorcliente"; Logica = "cr40f_aprovador"; Coluna = (SimNao "cr40f_Aprovador" "Aprovador" "Aprova os pedidos do portal do cliente (exceto os próprios).") },
  @{ Tabela = "cr40f_reservadeveculos"; Logica = "cr40f_portalaprovacao"; Coluna = (Escolha "cr40f_PortalAprovacao" "Portal: aprovação" "Situação da aprovação do pedido feito no portal do cliente." @("Pendente", "Aprovado", "Recusado")) },
  @{ Tabela = "cr40f_reservadeveculos"; Logica = "cr40f_portalaprovadopor"; Coluna = (Texto "cr40f_PortalAprovadoPor" "Portal: decidido por" "Nome e e-mail de quem aprovou ou recusou o pedido no portal." 200) },
  @{ Tabela = "cr40f_reservadeveculos"; Logica = "cr40f_portalaprovadoem"; Coluna = (DataHora "cr40f_PortalAprovadoEm" "Portal: decidido em" "Data e hora da decisão do aprovador no portal.") },
  @{ Tabela = "cr40f_reservadeveculos"; Logica = "cr40f_portalmotivorecusa"; Coluna = (Texto "cr40f_PortalMotivoRecusa" "Portal: motivo da recusa" "Motivo informado pelo aprovador ao recusar o pedido." 500) }
)

foreach ($a in $alvos) {
  if (Get-Coluna $a.Tabela $a.Logica) { Write-Step "$($a.Tabela).$($a.Logica) ja existe"; continue }
  if (-not $Apply) { Write-Step "DRY RUN criaria $($a.Tabela).$($a.Logica)."; continue }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$($a.Tabela)')/Attributes" $a.Coluna | Out-Null
  Write-Step "criada $($a.Tabela).$($a.Logica)"
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }

foreach ($a in $alvos) {
  $col = Get-Coluna $a.Tabela $a.Logica
  if (-not $col) { throw "Coluna $($a.Tabela).$($a.Logica) nao encontrada depois de criar." }
  Add-ComponenteNaSolucao $col.MetadataId 2
}
foreach ($t in ($alvos | ForEach-Object { $_.Tabela } | Select-Object -Unique)) { Publish-Tabela $t }
Write-Step "OK: colunas de aviso e aprovacao do portal."
