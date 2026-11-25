# Grava a chave da TomTom (rotas com trânsito) como segredo do Worker sem exibi-la.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot)
Write-Host '1. Crie a conta gratis no portal da TomTom que vai abrir no navegador (plano Freemium, sem cartao).'
Write-Host '2. No painel, copie a API key padrao (Keys > My first API key).'
Write-Host '3. Volte aqui e cole a chave.'
Start-Process 'https://developer.tomtom.com/'
$sec = Read-Host 'Cole a API key da TomTom' -AsSecureString
$k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
if (-not $k) { Write-Host 'Chave vazia.' -ForegroundColor Red; exit 1 }
$k | npx wrangler secret put TOMTOM_KEY
