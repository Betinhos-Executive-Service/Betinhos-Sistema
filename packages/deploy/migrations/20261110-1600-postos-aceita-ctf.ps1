param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Coluna new_aceitactf em new_postocombustivel: posto da rede CTF (cartao Sem Parar Combustivel). Os registros vem de
# packages/deploy/carregar-postos-ctf.ps1, rodado em cada ambiente.
# Aditivo e idempotente. Dry-run por padrao; o Deploy aplica com -Apply. Somente DEV: o PROD recebe a coluna pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "new_postocombustivel"
$column = "new_aceitactf"

$found = Get-Coluna $table $column
if (-not $found) {
  if (-not $Apply) { Write-Step "DRY RUN criaria $table.$column (sim/nao, padrao Nao). Use -Apply para aplicar."; return }
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
    SchemaName = $column
    DisplayName = (Label "Aceita CTF")
    Description = (Label "Posto da rede CTF (cart$([char]0xE3)o Sem Parar Combust$([char]0xED)vel).")
    RequiredLevel = @{ Value = "None" }
    DefaultValue = $false
    OptionSet = @{ TrueOption = @{ Value = 1; Label = (Label "Sim") }; FalseOption = @{ Value = 0; Label = (Label "N$([char]0xE3)o") } }
  } | Out-Null
  $found = Get-Coluna $table $column
  if (-not $found) { throw "Coluna $column nao foi criada." }
}
if (-not $Apply) { Write-Step "coluna $column ja existe; dry-run: nada gravado."; return }

Add-ComponenteNaSolucao $found.MetadataId 2
Publish-Tabela $table
Write-Step "OK: $table.$column publicada e na solucao $script:SolucaoDev."
