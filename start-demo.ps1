param(
    [int]$Port = 8000,
    [switch]$WithoutRedis,
    [string]$Model = 'qwen3:4b',
    [string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin',
    [string]$Memurai = 'C:\Memurai\Memurai\memurai.exe'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$mysql = Join-Path $MySqlBin 'mysql.exe'
$mysqld = Join-Path $MySqlBin 'mysqld.exe'
foreach ($exe in @($mysql,$mysqld) + $(if (!$WithoutRedis) { $Memurai })) {
    if (!(Test-Path -LiteralPath $exe)) { throw "Missing dependency: $exe" }
}
$runtime = Join-Path $PSScriptRoot '.local-runtime'
$mysqlData = Join-Path $runtime 'mysql'
$redisData = Join-Path $runtime 'redis'
New-Item -ItemType Directory -Force $runtime,$redisData | Out-Null
if (!(Test-Path (Join-Path $mysqlData 'mysql'))) {
    & $mysqld --no-defaults --initialize-insecure "--datadir=$mysqlData" "--log-error=$runtime/mysql-init.log"
    if ($LASTEXITCODE -ne 0) { throw "MySQL initialization failed. See $runtime/mysql-init.log" }
}
$db = $null
$cache = $null
try {
    $db = Start-Process -FilePath $mysqld -ArgumentList "--no-defaults --datadir=`"$mysqlData`" --port=13306 --bind-address=127.0.0.1 --mysqlx=OFF --log-error=`"$runtime/mysql.log`"" -PassThru -WindowStyle Hidden
    $ready = $false
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $db.Refresh()
        if ($db.HasExited) { throw "MySQL exited. See $runtime/mysql.log" }
        & $mysql --protocol=TCP -h 127.0.0.1 -P 13306 -u root --connect-timeout=2 -e 'SELECT 1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (!$ready) { throw 'MySQL did not become ready.' }
    & $mysql --protocol=TCP -h 127.0.0.1 -P 13306 -u root -e 'CREATE DATABASE IF NOT EXISTS guide CHARACTER SET utf8mb4'
    if ($LASTEXITCODE -ne 0) { throw 'Database setup failed.' }
    if (!$WithoutRedis) {
        $cache = Start-Process -FilePath $Memurai -ArgumentList "--port 16379 --bind 127.0.0.1 --dir `"$redisData`" --appendonly yes" -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 2
        $cache.Refresh()
        if ($cache.HasExited) { throw 'Memurai exited during startup.' }
    }
    $env:DB_URL = 'jdbc:mysql://127.0.0.1:13306/guide?allowPublicKeyRetrieval=true&sslMode=DISABLED'
    $env:DB_USER = 'root'
    $env:DB_PASSWORD = ''
    $env:REDIS_PORT = '16379'
    & (Join-Path $PSScriptRoot 'start-local.ps1') -Port $Port -Model $Model
} finally {
    $mysqlAdmin = Join-Path $MySqlBin 'mysqladmin.exe'
    if ($db -and !$db.HasExited) {
        & $mysqlAdmin --protocol=TCP -h 127.0.0.1 -P 13306 -u root shutdown
    }
    if ($cache -and !$cache.HasExited) {
        $redisCli = Join-Path (Split-Path $Memurai) 'memurai-cli.exe'
        & $redisCli -p 16379 shutdown
    }
}
