param(
  [switch] $DeviceCode,
  [switch] $ExpenseUploadOnly,
  # Inclui a Tela Funcoes Operacionais na mesma publicacao (gates + build + deploy).
  # Sem este switch ela nao e testada, compilada nem republicada: publique-a
  # separadamente com `npm run push` no repo dela.
  [switch] $IncludeOperacionais,
  # Emergencia, so DEV: pula os exports de backup (inicial e final) e a validacao do ZIP final quando a
  # solucao nao exporta (ex.: conector Web Push recusado pelo ExportSolution). Nunca use como padrao.
  [switch] $SemBackupSolucao
)

if ($PSVersionTable.PSEdition -eq "Core" -or $PSHOME -like "*codex-runtimes*") {
  $windowsPowerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
  if ($DeviceCode) { $arguments += "-DeviceCode" }
  if ($ExpenseUploadOnly) { $arguments += "-ExpenseUploadOnly" }
  if ($IncludeOperacionais) { $arguments += "-IncludeOperacionais" }
  if ($SemBackupSolucao) { $arguments += "-SemBackupSolucao" }
  & $windowsPowerShell @arguments
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($ExpenseUploadOnly) {
  $expensePwsh = (Get-Command pwsh -ErrorAction Stop).Source
  & $expensePwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'push-expense-upload-dev.ps1')
  exit $LASTEXITCODE
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$operationsRoot = $null
if ($IncludeOperacionais) {
  # Sobe pelos ancestrais para funcionar tambem em git worktrees (.claude\worktrees\<nome>).
  $workspaceParent = Split-Path $root -Parent
  $operationsCandidates = @()
  while ($workspaceParent) {
    $operationsCandidates = @(Get-ChildItem -LiteralPath $workspaceParent -Directory | Where-Object { $_.Name -like "Tela Fun*Operacionais" })
    if ($operationsCandidates.Count -gt 0) { break }
    $workspaceParent = Split-Path $workspaceParent -Parent
  }
  if ($operationsCandidates.Count -ne 1) { throw "Repositorio Tela Funcoes Operacionais nao encontrado de forma unica acima de $root." }
  $operationsRoot = $operationsCandidates[0].FullName
}
Set-Location $root

$environmentUrl = "https://org23b93544.crm2.dynamics.com/"
$expectedDevHost = "org23b93544.crm2.dynamics.com"
$solutionUniqueName = "AppBetinhos"
$backupDir = Join-Path $root "backup\exchange-lifecycle"
$backupPath = Join-Path $backupDir ("$solutionUniqueName-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")

function Write-Step([string] $Message) {
  Write-Host "[push-dev] $Message"
}

function Export-SolutionBackup([string] $Path, [string] $Description) {
  $environmentUri = [Uri] $environmentUrl
  if ($environmentUri.Scheme -ne "https" -or $environmentUri.Host -ne $expectedDevHost) {
    throw "Ambiente DEV invalido para export: $environmentUrl"
  }

  Write-Step "$Description unmanaged $Path"
  pac solution export --environment $environmentUrl --name $solutionUniqueName --path $Path --overwrite
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
    Write-Step "export unmanaged indisponivel; tentando backup managed"
    pac solution export --environment $environmentUrl --name $solutionUniqueName --path $Path --managed --overwrite
    if ($LASTEXITCODE -ne 0) { throw "$Description falhou com exit code $LASTEXITCODE" }
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Description nao gerou o ZIP esperado: $Path"
  }
  if ((Get-Item -LiteralPath $Path).Length -le 0) {
    throw "$Description gerou ZIP vazio: $Path"
  }
}

Write-Step "gate de higiene do repositorio"
& (Join-Path $PSScriptRoot "check-repository-hygiene.ps1")
if (-not $?) { throw "Gate de higiene do repositorio falhou." }

function Assert-SolutionArchiveExchangeLifecycle([string] $ZipPath) {
  if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { throw "ZIP final nao encontrado: $ZipPath" }
  $extractPath = Join-Path ([System.IO.Path]::GetTempPath()) ("exchange-lifecycle-solution-" + [guid]::NewGuid().ToString("N"))
  try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractPath -Force
    $customApiPath = Join-Path $extractPath "customapis"
    if (-not (Test-Path -LiteralPath $customApiPath)) { throw "ZIP final nao possui a pasta customapis." }
    $xmlText = ((Get-ChildItem -LiteralPath $customApiPath -Recurse -File -Filter "*.xml" | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n")
    foreach ($required in @("new_ConcluirTrocaDeCarro", "new_CancelarTrocaDeCarro", "new_ReverterTrocaDeCarro", "new_ConfirmarTrocaMotorista", "new_AtualizarTrocaDeCarro", "new_RegistrarTrocaDeCarro", "new_Motivo", "new_DataEfetiva", "new_VersaoEsperada", "new_IdempotencyKey", "new_TrocaId", "new_TrocaCompensatoriaId", "new_DispararComunicadoMotorista", "new_AbrirComunicadoMotorista", "new_RegistrarCienciaComunicado", "new_ReenviarPushComunicado", "new_DestinatarioId", "new_ComunicadoId", "new_AssinaturaJson", "new_ResolverVeiculoDoServico", "new_ReservaId", "new_ResultadoJson", "new_SincronizarVeiculoAtual", "new_GerarLinkAcompanhamento", "new_ResumoJson", "new_LinkJson", "new_SolicitarChecklistVeiculo", "new_ProcessarChecklistsVeiculos", "new_ReatribuirChecklistVeiculo", "new_ConcluirChecklistVeiculo", "new_CancelarChecklistVeiculo", "new_ReenviarPushChecklist", "new_ChecklistId", "new_VeiculoId", "new_RespostasJson", "new_OrganizarObservacao", "new_Texto", "cr40f_LembrarTreinamento", "cr40f_TreinamentoId", "cr40f_ParticipacaoId", "cr40f_Enfileirados", "cr40f_Ignorados")) {
      if ($xmlText.IndexOf($required, [System.StringComparison]::Ordinal) -lt 0) { throw "ZIP final nao possui o componente esperado: $required" }
    }
    Write-Step "validacao do ZIP final OK: Custom APIs, parametros e retorno presentes"
  }
  finally {
    if (Test-Path -LiteralPath $extractPath) { Remove-Item -LiteralPath $extractPath -Recurse -Force }
  }
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
if (-not (Get-Command pac -ErrorAction SilentlyContinue)) {
  throw "Power Platform CLI (pac) nao encontrado; exporte a solucao atual antes do deploy."
}
if ($SemBackupSolucao) {
  Write-Warning "[push-dev] -SemBackupSolucao: publicando SEM backup da solucao $solutionUniqueName. Rollback so pelo ultimo ZIP em $backupDir."
} else {
  Export-SolutionBackup $backupPath "export solution backup"
}

Write-Step "gate App Motoristas: testes, TypeScript e build"
npm test
if ($LASTEXITCODE -ne 0) { throw "Testes do App Motoristas falharam." }
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
if ($LASTEXITCODE -ne 0) { throw "TypeScript do App Motoristas falhou." }
node scripts/build-react-singlefile.cjs --no-version
if ($LASTEXITCODE -ne 0) { throw "Build do App Motoristas falhou." }

if ($IncludeOperacionais) {
  Write-Step "gate Tela Funcoes Operacionais: testes, TypeScript e build"
  Push-Location $operationsRoot
  try {
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Testes da Tela Funcoes Operacionais falharam." }
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw "TypeScript da Tela Funcoes Operacionais falhou." }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build da Tela Funcoes Operacionais falhou." }
  }
  finally { Pop-Location }
}
else {
  Write-Step "Tela Funcoes Operacionais fora desta publicacao (use -IncludeOperacionais ou npm run push no repo dela)"
}

Write-Step "gate plugin: build e testes"
dotnet build "plugins/DriverRecordSharing.Tests/DriverRecordSharing.Tests.csproj" -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw "Build do plugin falhou." }
$pluginTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("driver-record-sharing-tests-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $pluginTestDir | Out-Null
Copy-Item -Path "plugins\DriverRecordSharing.Tests\bin\Release\net462\*" -Destination $pluginTestDir -Recurse
dotnet vstest (Join-Path $pluginTestDir "DriverRecordSharing.Tests.dll")
if ($LASTEXITCODE -ne 0) { throw "Testes do plugin falharam." }

if ($IncludeOperacionais) {
  Write-Step "publish Tela Funcoes Operacionais"
  & (Join-Path $operationsRoot "scripts\deploy-webresource.ps1") `
    -EnvironmentUrl $environmentUrl `
    -WebResourceName "new_telafuncoesoperacionais" `
    -SkipBuild `
    -DeviceCode:$DeviceCode
}

# Vem antes do plugin: o DriverNoticePlugin nao salva a reserva se nao conseguir gravar o aviso.
Write-Step "provision tabela de avisos ao motorista in DEV"
& (Join-Path $PSScriptRoot "provision-aviso-motorista.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode

Write-Step "publish plugin in $solutionUniqueName"
& (Join-Path $PSScriptRoot "register-driver-record-sharing-plugin-webapi.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -AddExistingToSolution `
  -DeviceCode:$DeviceCode

Write-Step "provision comunicados metadata, Custom APIs e travas in DEV"
& (Join-Path $PSScriptRoot "provision-comunicados.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento de comunicados falhou." }

# Exige a tabela de participacao e as colunas de push criadas pelo Sistema Betinhos (schema aplicado antes).
Write-Step "provision treinamentos: Custom API de lembrete e flow de push in DEV"
& (Join-Path $PSScriptRoot "provision-treinamentos-push.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento do push de treinamentos falhou." }

Write-Step "provision decisao do carro pela Infleet in DEV"
& (Join-Path $PSScriptRoot "provision-infleet-vehicle.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento da decisao do carro pela Infleet falhou." }

Write-Step "provision carro atual do motorista e link de acompanhamento in DEV"
& (Join-Path $PSScriptRoot "provision-current-vehicle.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento do carro atual e do link de acompanhamento falhou." }

Write-Step "provision checklists de vistoria: metadata, Custom APIs e travas in DEV"
& (Join-Path $PSScriptRoot "provision-checklists.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento de checklists falhou." }

# Sem %USERPROFILE%\.betinhos\stripe-dev.env o provisionador so avisa e mantem a chave atual do step.
Write-Step "provision cobranca por QR (Custom API, chave do Stripe e webhook) in DEV"
& (Join-Path $PSScriptRoot "provision-cobranca-qr.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento da cobranca por QR falhou." }

Write-Step "provision observacao organizada (variavel da chave, Custom API e step) in DEV"
& (Join-Path $PSScriptRoot "provision-observacao-organizada.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento da observacao organizada falhou." }

Write-Step "provision relatorio de combustivel (schema e variavel Secret) in DEV"
& (Join-Path $PSScriptRoot "provision-relatorio-combustivel.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Provisionamento do relatorio de combustivel falhou." }

Write-Step "publish push redirect (forms OnLoad -> App Motoristas)"
& (Join-Path $PSScriptRoot "provision-push-redirect.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Publicacao do redirect de push falhou." }

Write-Step "migrate driver push flows to App Motoristas v2"
& (Join-Path $PSScriptRoot "provision-motorista-push-flows.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode
if (-not $?) { throw "Migracao dos Flows de push dos motoristas falhou." }

Write-Step "provision exchange lifecycle metadata in DEV"
& (Join-Path $PSScriptRoot "provision-exchange-lifecycle.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode

Write-Step "publish exchange lifecycle command resources"
& (Join-Path $PSScriptRoot "provision-exchange-lifecycle-webresources.ps1") `
  -EnvironmentUrl $environmentUrl `
  -SolutionUniqueName $solutionUniqueName `
  -Apply `
  -DeviceCode:$DeviceCode

# O app e o service worker saem so pelo workflow Deploy (develop -> DEV, scripts/push-front-dev.ps1).

if ($SemBackupSolucao) {
  Write-Warning "[push-dev] -SemBackupSolucao: export final e validacao do ZIP pulados; valide os componentes pelos scripts validate-*."
} else {
  $finalBackupPath = Join-Path $backupDir ("$solutionUniqueName-final-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
  Export-SolutionBackup $finalBackupPath "export final solution"
  Assert-SolutionArchiveExchangeLifecycle $finalBackupPath
}

Write-Step "DEV publish complete"
