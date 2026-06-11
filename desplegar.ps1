param (
    [Parameter(Mandatory=$false)]
    [string]$Mensaje = "Actualizacion rapida"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   SUBIENDO CAMBIOS A GITHUB...          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Añadir cambios, hacer commit y push
git add .
git commit -m $Mensaje
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Hubo un error subiendo el código a GitHub." -ForegroundColor Red
    exit
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
