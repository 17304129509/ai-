param([ValidateRange(1, 65535)][int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GUIDE_PORT = "$Port"
docker compose up --build
exit $LASTEXITCODE
