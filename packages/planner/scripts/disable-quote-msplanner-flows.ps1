param(
  [string] $EnvironmentUrl = 'https://org23b93544.crm2.dynamics.com',
  [switch] $ConfirmProd,
  [switch] $WhatIf
)

# Cotações V1.1 (decisão do Renan, 23/10/2026): o Planner é a única porta de
# entrada da cotação. Os 4 flows do Microsoft Planner/Teams criavam uma tarefa
# duplicada no MS Planner e sobrescreviam cr40f_linktarefaplanner. Este script
# os desativa (statecode 0 = Draft). DEV por padrão; PROD só com -ConfirmProd.

$ErrorActionPreference = 'Stop'
$prod = 'https://orgf261ae8e.crm2.dynamics.com'
$url = $EnvironmentUrl.TrimEnd('/')
if ($url -eq $prod -and -not $ConfirmProd) { throw 'PROD exige -ConfirmProd depois da validação do Junior no DEV.' }
if ($url -notin @('https://org23b93544.crm2.dynamics.com', $prod)) { throw "Ambiente não reconhecido: $url" }

$token = az account get-access-token --resource $url --query accessToken -o tsv
if (-not $token) { throw "Azure CLI não retornou token para $url." }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'Content-Type' = 'application/json; charset=utf-8' }
$api = "$url/api/data/v9.2"

# Nomes como aparecem no export da AppBetinhos (Workflows/*.json). category 5 = Modern Flow.
$names = @(
  'Flow Pedido de Cotação - Planner e Teams',
  'Flow Atualizar Cotação Planner',
  'Flow Atualizar Planner Cotação',
  'Flow Lembrete Cotação Pendente'
)
$patterns = @('*Pedido*Cota*Planner*', '*Atualizar*Cota*Planner*', '*Atualizar*Planner*Cota*', '*Lembrete*Cota*Pendente*')

$filter = [uri]::EscapeDataString("category eq 5 and contains(name,'Cota')")
$flows = @((Invoke-RestMethod -Uri "$api/workflows?`$select=workflowid,name,statecode&`$filter=$filter" -Headers $headers).value)
$targets = @()
foreach ($pattern in $patterns) {
  $match = @($flows | Where-Object { ($_.name -replace '[^\p{L}\p{N}]', '') -like (($pattern -replace '[^\p{L}\p{N}\*]', '')) })
  if ($match.Count -ne 1) { throw "Esperado exatamente um flow para '$pattern'; encontrados $($match.Count): $(($match | ForEach-Object name) -join ', ')" }
  $targets += $match[0]
}

foreach ($flow in $targets) {
  if ([int]$flow.statecode -eq 0) { Write-Output "Já desativado: $($flow.name) ($($flow.workflowid))"; continue }
  if ($WhatIf) { Write-Output "WhatIf: desativaria $($flow.name) ($($flow.workflowid))"; continue }
  $body = '{"statecode":0,"statuscode":1}'
  Invoke-RestMethod -Uri "$api/workflows($($flow.workflowid))" -Headers $headers -Method Patch -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  Write-Output "Flow desativado: $($flow.name) ($($flow.workflowid))"
}
Write-Output "Conferência: $(@($targets | Where-Object { [int]$_.statecode -eq 1 }).Count) ativos antes; rode de novo para confirmar 4 'Já desativado'."
