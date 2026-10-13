# Somente leitura no DEV: lista o que o plano de despesas com IA precisa saber. Requer `az login`.
# Só faz GET. Não imprime URLs de gatilho (sig=). Parâmetro opcional -DumpDir grava o clientdata bruto dos flows
# numa pasta local (fora do repositório) para análise manual.
param([string] $DumpDir = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }
$token = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponível (rode az login).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; Prefer = 'odata.include-annotations="*"' }
function Dv([string] $Path) { Invoke-RestMethod -Method GET -Uri "$environmentUrl/api/data/v9.2/$Path" -Headers $headers -TimeoutSec 60 }
function Redact([string] $s) { return ($s -replace 'sig=[^&"\s]+', 'sig=REDACTED') }

# Qualquer flow cujo nome sugira comprovante/despesa (a nomenclatura do plano pode divergir).
$similares = @((Dv "workflows?`$select=name,statecode&`$filter=category eq 5 and (contains(name,'Comprovante') or contains(name,'Despesa'))").value)
Write-Host "flows com 'Comprovante' ou 'Despesa' no nome: $($similares.Count)"
$similares | ForEach-Object { Write-Host "  - $($_.name) (statecode $($_.statecode))" }

$nomes = @('Flow Comprovantes Despesas Assincrono | App Motoristas', 'Flow Salvar Anexo Despesa', 'Flow Salvar Arquivos Onedrive', 'Flow - Salvar arquivo no SharePoint', 'Flow - Consultar Arquivos Sharepoint', 'Flow - Consultar Arquivo OneDrive')
foreach ($nome in $nomes) {
  $wf = @((Dv "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$nome' and category eq 5").value)
  Write-Host "`n=== $nome ($($wf.Count) encontrado) ==="
  if (-not $wf.Count) { Write-Host '0 encontrado'; continue }
  if ($DumpDir) { New-Item -ItemType Directory -Force $DumpDir | Out-Null; Set-Content -Path (Join-Path $DumpDir (($nome -replace '[^A-Za-z0-9]+', '_') + '.json')) -Value (Redact $wf[0].clientdata) -Encoding utf8 }
  $def = ($wf[0].clientdata | ConvertFrom-Json).properties.definition
  Write-Host "estado: $($wf[0].statecode)"
  $trig = Redact ($def.triggers | ConvertTo-Json -Depth 12 -Compress)
  Write-Host "trigger: $($trig.Substring(0, [Math]::Min(1500, $trig.Length)))"
  # Ações de arquivo (OneDrive/SharePoint), com dataset e caminho quando houver.
  $json = Redact ($def | ConvertTo-Json -Depth 90 -Compress)
  [regex]::Matches($json, '"operationId":"([A-Za-z]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique | ForEach-Object { Write-Host "operação: $_" }
  [regex]::Matches($json, '"dataset":"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique | ForEach-Object { Write-Host "dataset: $_" }
  [regex]::Matches($json, '"(folderPath|table|path)":"([^"]+)"') | ForEach-Object { "$($_.Groups[1].Value)=$($_.Groups[2].Value)" } | Sort-Object -Unique | ForEach-Object { Write-Host "caminho: $_" }
}

# Tamanho das fotos: o anexo não guarda o tamanho (não existe cr40f_tamanhobytes). Lista campos de tamanho, se houver,
# e o perfil de tipos de arquivo dos anexos no DEV.
$camposAnexo = @((Dv "EntityDefinitions(LogicalName='cr40f_anexodespesaoperacional')/Attributes?`$select=LogicalName").value | ForEach-Object { $_.LogicalName })
Write-Host "`ncampos de tamanho no anexo: $((@($camposAnexo | Where-Object { $_ -match 'tamanho|size|bytes' })) -join ', ')"
$anexos = @((Dv "cr40f_anexodespesaoperacionals?`$select=cr40f_mimetype,cr40f_nomearquivo&`$top=500").value)
Write-Host "anexos no DEV: $($anexos.Count)"
$anexos | Group-Object { if ($_.cr40f_mimetype) { $_.cr40f_mimetype } else { '(sem mimetype)' } } | ForEach-Object { Write-Host "  $($_.Name): $($_.Count)" }

$attrs = @((Dv "EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes?`$select=LogicalName,AttributeType&`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup'").value)
Write-Host "`nlookups da reserva: $(($attrs | ForEach-Object { $_.LogicalName }) -join ', ')"
