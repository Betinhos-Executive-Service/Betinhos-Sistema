param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Prazos do portal do cliente (25/11/2026). Tres colunas em cr40f_clientes1, nenhuma tabela nova:
#   cr40f_portalantecedenciapedido   inteiro 0-720: horas de antecedencia minima para pedir (vazio = padrao do portal, 24 h; 0 = sem limite)
#   cr40f_portalprazocancelar        inteiro 0-720: horas antes da saida em que o cliente ainda cancela sozinho (vazio = 12 h; 0 = sem limite)
#   cr40f_portalcontato              texto (100): contato da operacao mostrado fora do prazo (telefone ou WhatsApp)
# O Worker le as colunas com o usuario de aplicacao (papel "Portal do Cliente"); sem seguranca de coluna. Idempotente. Somente DEV; o PROD recebe pelas solucoes.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }

function Base([string] $Tipo, [string] $Schema, [string] $Nome, [string] $Desc) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.$Tipo"; SchemaName = $Schema; DisplayName = (Label (U $Nome)); Description = (Label (U $Desc)); RequiredLevel = @{ Value = "None" } }
}
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "StringAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.FormatName = @{ Value = "Text" }; return $c
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min, [int] $Max) {
  $c = Base "IntegerAttributeMetadata" $Schema $Nome $Desc; $c.Format = "None"; $c.MinValue = $Min; $c.MaxValue = $Max; return $c
}

$alvos = @(
  @{ Tabela = "cr40f_clientes1"; Logica = "cr40f_portalantecedenciapedido"; Coluna = (Inteiro "cr40f_PortalAntecedenciaPedido" "Portal: antecedência do pedido (h)" "Horas de antecedência mínima para pedir pelo portal. Vazio = padrão (24 h); 0 = sem limite." 0 720) },
  @{ Tabela = "cr40f_clientes1"; Logica = "cr40f_portalprazocancelar"; Coluna = (Inteiro "cr40f_PortalPrazoCancelar" "Portal: prazo para cancelar (h)" "Horas antes da saída em que o cliente ainda cancela sozinho pelo portal. Vazio = padrão (12 h); 0 = sem limite." 0 720) },
  @{ Tabela = "cr40f_clientes1"; Logica = "cr40f_portalcontato"; Coluna = (Texto "cr40f_PortalContato" "Portal: contato da operação" "Telefone ou WhatsApp da operação mostrado ao cliente fora do prazo para pedir ou cancelar." 100) }
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
Write-Step "OK: colunas de prazos do portal."
