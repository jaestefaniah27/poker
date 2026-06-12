param (
    [Parameter(Mandatory=$false)]
    [string]$Mensaje = "Actualizacion rapida"
)

Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "   COMPROBANDO QUE COMPILA...            " -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow

# --- Cliente: build real (tsc -b && vite build) ---
Write-Host "-> Cliente (npm run build)..." -ForegroundColor Gray
Push-Location "$PSScriptRoot\client"
npm run build
$clientOk = ($LASTEXITCODE -eq 0)
Pop-Location

if (-not $clientOk) {
    Write-Host "ERROR: el cliente NO compila. Aborto sin desplegar." -ForegroundColor Red
    exit 1
}

# --- Servidor: type-check (no hay build, corre con ts-node) ---
Write-Host "-> Servidor (tsc --noEmit)..." -ForegroundColor Gray
Push-Location "$PSScriptRoot\server"
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

# Añadir cambios, hacer commit y push
git add .
git commit -m $Mensaje
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Hubo un error subiendo el código a GitHub." -ForegroundColor Red
    exit 1
}

Write-Host " "
Write-Host "=========================================" -ForegroundColor Green
Write-Host "   DESPLEGANDO EN EL SERVIDOR...         " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Ejecutar script de actualización en el servidor
ssh -o StrictHostKeyChecking=no -i C:\Users\jaest\.ssh\minecraft_server\minecraft-server-private-key-ssh ubuntu@143.47.37.92 "bash ~/poker_repo/update_poker.sh"

Write-Host " "
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       ¡DESPLIEGUE COMPLETADO!           " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
