param (
    [Parameter(Mandatory=$false)]
    [string]$Mensaje = "Actualizacion rapida"
)

Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "   COMPROBANDO QUE COMPILA...            " -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow

# --- Cliente: instalar dependencias + build ---
Write-Host "-> Cliente (npm install + build)..." -ForegroundColor Gray
Push-Location "$PSScriptRoot\client"
npm install --silent
npm run build
$clientOk = ($LASTEXITCODE -eq 0)
Pop-Location

if (-not $clientOk) {
    Write-Host "ERROR: el cliente NO compila. Aborto sin desplegar." -ForegroundColor Red
    exit 1
}

# --- Servidor: instalar dependencias + type-check ---
Write-Host "-> Servidor (npm install + tsc --noEmit)..." -ForegroundColor Gray
Push-Location "$PSScriptRoot\server"
npm install --silent
npx tsc --noEmit
$serverOk = ($LASTEXITCODE -eq 0)
Pop-Location

if (-not $serverOk) {
    Write-Host "ERROR: el servidor NO compila. Aborto sin desplegar." -ForegroundColor Red
    exit 1
}

Write-Host "OK: todo compila." -ForegroundColor Green

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   SUBIENDO CAMBIOS A GITHUB...          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

git add .
git commit -m $Mensaje
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Hubo un error subiendo el codigo a GitHub." -ForegroundColor Red
    exit 1
}

Write-Host " "
Write-Host "=========================================" -ForegroundColor Green
Write-Host "   DESPLEGANDO EN EL SERVIDOR...         " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Buscar la clave SSH por nombre en ~/.ssh/ (funciona en cualquier maquina)
$sshKey = Get-ChildItem -Path "$env:USERPROFILE\.ssh" -Recurse -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -eq 'minecraft-server-private-key-ssh' } |
          Select-Object -First 1 -ExpandProperty FullName

if (-not $sshKey) {
    Write-Host "ERROR: No se encontro la clave 'minecraft-server-private-key-ssh' en ~/.ssh/" -ForegroundColor Red
    Write-Host "Coloca la clave en cualquier subcarpeta de $env:USERPROFILE\.ssh\ y vuelve a intentarlo." -ForegroundColor Yellow
    exit 1
}

Write-Host "-> Usando clave SSH: $sshKey" -ForegroundColor Gray

# SSH exige que la clave solo sea legible por el propietario
icacls $sshKey /inheritance:r /grant:r "${env:USERNAME}:(R)" | Out-Null

ssh -o StrictHostKeyChecking=no -i $sshKey ubuntu@143.47.37.92 "bash ~/poker_repo/update_poker.sh"

Write-Host " "
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       ¡DESPLIEGUE COMPLETADO!           " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
