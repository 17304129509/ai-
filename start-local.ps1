param([int]$Port = 8000, [string]$Model = 'qwen3:4b')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$models = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' -TimeoutSec 5
if ($Model -notin @($models.models.name)) { throw "Model missing. Run: ollama pull $Model" }
$env:AGENT_API_KEY = 'ollama'
$env:AGENT_BASE_URL = 'http://127.0.0.1:11435/v1'
$env:AGENT_MODEL = $Model
$env:PORT = "$Port"
mvn -q -DskipTests package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
java -jar target/java-guide-agent-1.0.0.jar
exit $LASTEXITCODE
