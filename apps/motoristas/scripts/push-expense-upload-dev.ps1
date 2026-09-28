$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
git status --short
& (Join-Path $PSScriptRoot 'check-repository-hygiene.ps1')
npm test
if ($LASTEXITCODE -ne 0) { throw 'Testes Node falharam.' }
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
if ($LASTEXITCODE -ne 0) { throw 'TypeScript falhou.' }
if (-not (Test-Path 'plugins/ExpenseUpload/ExpenseUpload.snk')) {
  $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
  [IO.File]::WriteAllBytes((Join-Path (Get-Location) 'plugins/ExpenseUpload/ExpenseUpload.snk'), $rsa.ExportCspBlob($true))
  $rsa.Dispose()
}
dotnet test plugins/ExpenseUpload.Tests/ExpenseUpload.Tests.csproj -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw 'Testes do plugin falharam.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou.' }
& (Join-Path $PSScriptRoot 'provision-expense-upload-dev.ps1')
& (Join-Path $PSScriptRoot 'deploy-expense-webresource-dev.ps1')
