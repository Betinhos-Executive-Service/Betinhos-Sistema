param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Abastecimentos do CTF (Sem Parar) e TicketLog na mesma cr40f_transacaocartao da Pluggy: coluna cr40f_canal (vazio = Pluggy,
# linhas antigas) e os dados do abastecimento (placa, veiculo, combustivel, litros, preco/litro, hodometro, KM, desconto, cidade).
# As colunas nasceram a mao no DEV em 12/11/2026 (skill combustivel-ctf); esta migration registra o schema no repositorio.
# Aditivo e idempotente: no DEV so confere e garante a solucao. Somente DEV; o PROD recebe pelas solucoes.

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$table = "cr40f_transacaocartao"
function Opcao([int] $Valor, [string] $Texto) { return @{ Value = $Valor; Label = (Label $Texto) } }
function Texto([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" }; MaxLength = $Max; FormatName = @{ Value = "Text" } }
}
function Decimal([string] $Schema, [string] $Nome, [string] $Desc, [int] $Precisao, [double] $Max) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" }; Precision = $Precisao; MinValue = 0; MaxValue = $Max }
}
function Inteiro([string] $Schema, [string] $Nome, [string] $Desc, [int] $Min) {
  return @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = $Schema; DisplayName = (Label $Nome); Description = (Label $Desc); RequiredLevel = @{ Value = "None" }; Format = "None"; MinValue = $Min; MaxValue = 2000000 }
}

$colunas = @(
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"; SchemaName = "cr40f_canal"; DisplayName = (Label "Canal"); RequiredLevel = @{ Value = "None" }
     Description = (Label "Origem da transa$([char]0xE7)$([char]0xE3)o: Ita$([char]0xFA) via Pluggy, CTF (Sem Parar Empresas) ou TicketLog. Vazio = Ita$([char]0xFA)/Pluggy (registros antigos).")
     OptionSet = @{ "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"; IsGlobal = $false; OptionSetType = "Picklist"; Options = @(
       (Opcao 100000000 "Cart$([char]0xE3)o Ita$([char]0xFA) (Pluggy)"), (Opcao 100000001 "CTF (Sem Parar)"), (Opcao 100000002 "TicketLog")) } },
  (Texto "cr40f_placa" "Placa" "Placa informada pela rede (CTF/TicketLog)." 10),
  (Texto "cr40f_combustivel" "Combust$([char]0xED)vel" "" 60),
  (Texto "cr40f_cidadeposto" "Cidade do posto" "" 100),
  (Decimal "cr40f_litros" "Litros" "" 3 10000),
  (Decimal "cr40f_precolitro" "Pre$([char]0xE7)o/Litro" "" 4 1000),
  (Inteiro "cr40f_hodometro" "Hod$([char]0xF4)metro" "Hod$([char]0xF4)metro informado no abastecimento." 0),
  (Inteiro "cr40f_kmrodado" "KM rodado" "KM desde o abastecimento anterior, calculado pela rede." -2000000),
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = "cr40f_desconto"; DisplayName = (Label "Desconto"); Description = (Label "Desconto de acordo aplicado pela rede."); RequiredLevel = @{ Value = "None" }; Precision = 2; PrecisionSource = 2; MinValue = 0; MaxValue = 1000000 }
)

$ids = @()
foreach ($c in $colunas) {
  $logical = $c.SchemaName.ToLowerInvariant()
  $found = Get-Coluna $table $logical
  if (-not $found) {
    if (-not $Apply) { Write-Step "DRY RUN criaria $table.$logical."; continue }
    Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Attributes" $c | Out-Null
    $found = Get-Coluna $table $logical
    if (-not $found) { throw "Coluna $logical nao foi criada." }
    Write-Step "criada $table.$logical"
  }
  $ids += $found.MetadataId
}

# Lookup do veiculo (cr40f_veiculos), achado pela placa.
$rel = "cr40f_veiculos_cr40f_transacaocartao_veiculo"
$relPath = "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
if (@(Get-Rows $relPath "MetadataId" "SchemaName eq '$rel'").Count -eq 0) {
  if (-not $Apply) { Write-Step "DRY RUN criaria lookup $table.cr40f_veiculo." }
  else {
    Invoke-Dv "POST" "RelationshipDefinitions" @{
      "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName = $rel
      ReferencedEntity = "cr40f_veiculos"; ReferencedAttribute = "cr40f_veiculosid"; ReferencingEntity = $table
      CascadeConfiguration = @{ Assign = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"; Reparent = "NoCascade"; Share = "NoCascade"; Unshare = "NoCascade" }
      Lookup = @{ "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName = "cr40f_veiculo"; DisplayName = (Label "Ve$([char]0xED)culo"); Description = (Label "Ve$([char]0xED)culo encontrado pela placa."); RequiredLevel = @{ Value = "None" } }
    } | Out-Null
    Write-Step "criado lookup $table.cr40f_veiculo"
  }
}
if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
$veiculo = Get-Coluna $table "cr40f_veiculo"
if (-not $veiculo) { throw "Lookup cr40f_veiculo nao encontrado." }
$ids += $veiculo.MetadataId

foreach ($id in $ids) { Add-ComponenteNaSolucao $id 2 }
Publish-Tabela $table
Write-Step "OK: $($ids.Count) colunas de $table na solucao $script:SolucaoDev."
