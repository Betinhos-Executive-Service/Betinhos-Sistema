$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
git status --short
& (Join-Path $PSScriptRoot 'check-repository-hygiene.ps1')
npm test
if ($LASTEXITCODE -ne 0) { throw 'Testes Node falharam.' }
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
if ($LASTEXITCODE -ne 0) { throw 'TypeScript falhou.' }
if (-not (Test-Path 'plugins/ExpenseUpload/ExpenseUpload.snk')) { throw 'plugins/ExpenseUpload/ExpenseUpload.snk ausente. A chave e fixa: uma chave nova muda o public key token e o plugin deixa de atualizar. Nao gere outra.' }
dotnet test plugins/ExpenseUpload.Tests/ExpenseUpload.Tests.csproj -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw 'Testes do plugin falharam.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou.' }
& (Join-Path $PSScriptRoot 'provision-expense-upload-dev.ps1')
& (Join-Path $PSScriptRoot 'deploy-expense-webresource-dev.ps1')
