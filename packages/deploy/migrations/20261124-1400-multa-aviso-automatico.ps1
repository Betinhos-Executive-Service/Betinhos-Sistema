param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)
# Multas: aviso automatico ao motorista (24/11/2026). Uma data em cr40f_multas, gravada pelo plugin PassoMulta quando o
# responsavel "motorista" e confirmado (DefinirResponsavel); o flow "Multa | Aviso ao motorista" dispara na alteracao dela.
# Nao e a data do aviso do passo AvisarMotorista (cr40f_datadeavisoaocondutor), que continua sendo do termo/WhatsApp.
# Aditivo e idempotente. Somente DEV; o PROD recebe pelas solucoes. Sem -Apply e dry run.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$multa = "cr40f_multas"
$coluna = @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_AvisoAutomaticoEm"
  DisplayName = (Label "Aviso autom$([char]0xE1)tico em")
  Description = (Label "Dia em que o sistema pediu o aviso por push ao motorista (multa para ver no app); o flow Multa | Aviso ao motorista l$([char]0xEA) esta coluna. N$([char]0xE3)o editar.")
  RequiredLevel = @{ Value = "None" }; Format = "DateOnly"; DateTimeBehavior = @{ Value = "DateOnly" } }
$nome = $coluna.SchemaName.ToLowerInvariant()
if (Get-Coluna $multa $nome) { Write-Step "ja existe $multa.$nome"; return }
if (-not $Apply) { Write-Step "DRY RUN criaria $multa.$nome"; return }
Invoke-Dv "POST" "EntityDefinitions(LogicalName='$multa')/Attributes" $coluna | Out-Null
Write-Step "criada $multa.$nome"
Publish-Tabela $multa
$col = Get-Coluna $multa $nome
if (-not $col) { throw "Coluna $multa.$nome nao encontrada depois de criar." }
Add-ComponenteNaSolucao $col.MetadataId 2
Write-Step "OK: aviso automatico (cr40f_avisoautomaticoem)."
