# Grava a chave da Anthropic (normalização dos endereços do link) como segredo do Worker sem exibi-la.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot)
Write-Host '1. No Console da Anthropic, crie ou copie a chave reservada ao link de acompanhamento.'
Write-Host '2. Volte aqui e cole a chave (ela não aparece na tela).'
$sec = Read-Host 'Cole a chave da Anthropic' -AsSecureString
$k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
if (-not $k) { Write-Host 'Chave vazia.' -ForegroundColor Red; exit 1 }
$k | npx wrangler secret put ANTHROPIC_API_KEY_ACOMPANHAMENTO
