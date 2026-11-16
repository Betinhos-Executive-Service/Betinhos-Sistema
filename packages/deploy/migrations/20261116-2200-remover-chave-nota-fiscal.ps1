param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# destrutiva: cr40f_anexodespesaoperacional.cr40f_chaveacesso - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_notauf - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_notaaamm - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_notacnpjemitente - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_notamodelo - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_notanumero - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_origemchave - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_anexodespesaoperacional.cr40f_situacaonota - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_provamidia.cr40f_valorlido - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)
# destrutiva: cr40f_provamidia.cr40f_datalida - fase 3 do anexo seguro removida (decisão do Renan, 16/11/2026)

# Desfaz 20261116-2100-chave-nota-fiscal.ps1 (fase 3 do anexo seguro, cancelada em 16/11/2026): tira as 8 colunas da nota
# fiscal do comprovante, valor lido e data lida da prova de midia e os selos 100000007..100000009 de cr40f_selos.
# As fases 1 e 2 (selos 100000000..100000006) ficam. Idempotente: o que ja nao existe e pulado. Somente DEV; as colunas
# nunca chegaram ao PROD. Antes do Deploy que roda esta migration, o plugin NotaFiscalAnexoPlugin tem de ter saido do DEV
# (packages/plugins/scripts/unregister-notafiscal-anexo-plugin.ps1 -Apply).

. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$anexo = "cr40f_anexodespesaoperacional"
$prova = "cr40f_provamidia"

$colunas = @(
  @($anexo, "cr40f_chaveacesso"), @($anexo, "cr40f_notauf"), @($anexo, "cr40f_notaaamm"), @($anexo, "cr40f_notacnpjemitente"),
  @($anexo, "cr40f_notamodelo"), @($anexo, "cr40f_notanumero"), @($anexo, "cr40f_origemchave"), @($anexo, "cr40f_situacaonota"),
  @($prova, "cr40f_valorlido"), @($prova, "cr40f_datalida")
)
foreach ($c in $colunas) { Remove-Coluna $c[0] $c[1] }

# ---------- selos da fase 3 ----------
$meta = Invoke-Dv "GET" "EntityDefinitions(LogicalName='$prova')/Attributes(LogicalName='cr40f_selos')/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?`$select=LogicalName&`$expand=OptionSet(`$select=Options)"
$existentes = @($meta.OptionSet.Options | ForEach-Object { [int]$_.Value })
$removeu = $false
foreach ($v in 100000007..100000009) {
  if ($existentes -notcontains $v) { Write-Step "opcao cr40f_selos = $v ja nao existe."; continue }
  if (-not $Apply) { Write-Step "DRY RUN removeria a opcao cr40f_selos = $v. Use -Apply para aplicar."; continue }
  Invoke-Dv "POST" "DeleteOptionValue" @{ EntityLogicalName = $prova; AttributeLogicalName = "cr40f_selos"; Value = $v; SolutionUniqueName = $script:SolucaoDev } | Out-Null
  $removeu = $true
  Write-Step "OK: opcao cr40f_selos = $v removida."
}

if (-not $Apply) { Write-Step "dry-run: nada gravado."; return }
if ($removeu) { Publish-Tabela $prova }
Write-Step "OK: fase 3 do anexo seguro removida de $anexo e $prova."
