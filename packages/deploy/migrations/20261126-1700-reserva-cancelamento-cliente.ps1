param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Cancelamento do cliente na reserva (26/11/2026). Opcional. Idempotente. Somente DEV.
# cr40f_reservadeveculos.cr40f_cancelamentocliente (texto 100): status que o servico tinha quando a sincronizacao
# da Tenaris mandou Cancelado ("Programado", "Concluido"...). Gravado e limpo pelo Cr40f.Protecao.Plugin; o
# "Flow Notificacao Novo Requer Analise | Interno" usa para avisar a gestao "Cancelado pela Tenaris".
# docs/features/tenaris-cancelado-requer-analise
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

function U([string] $Texto) { return [regex]::Unescape($Texto) }
$tabela = "cr40f_reservadeveculos"
$nome = "cr40f_cancelamentocliente"
$def = @{
  "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = "cr40f_CancelamentoCliente"
  DisplayName = (Label (U "Cancelado pelo cliente (status anterior)"))
  Description = (Label (U "Status que o serviço tinha quando o cliente cancelou pela sincronização. Gravado pelo plugin de proteção; vazio quando não houve cancelamento."))
  RequiredLevel = @{ Value = "None" }; MaxLength = 100; FormatName = @{ Value = "Text" }
}

if (Get-Coluna $tabela $nome) { Write-Step "$tabela.$nome ja existe: nada a criar" }
elseif (-not $Apply) { Write-Step "DRY RUN criaria $tabela.$nome."; Write-Step "dry-run: nada gravado."; return }
else { Invoke-Dv "POST" "EntityDefinitions(LogicalName='$tabela')/Attributes" $def | Out-Null; Write-Step "criada $tabela.$nome" }

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
$col = Get-Coluna $tabela $nome
if (-not $col) { throw "Coluna $tabela.$nome nao encontrada depois de criar." }
Add-ComponenteNaSolucao $col.MetadataId 2
Publish-Tabela $tabela
Write-Step "OK: $tabela.$nome na AppBetinhos e publicada."
