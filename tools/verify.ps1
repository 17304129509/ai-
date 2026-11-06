param([string]$BaseUrl = 'http://127.0.0.1:8000')
$ErrorActionPreference = 'Stop'
function Api($method,$path,$body) {
    $requestOptions = @{Method=$method; Uri="$BaseUrl/api/$path"; TimeoutSec=120}
    if ($null -ne $body) {
        $requestOptions.ContentType = 'application/json; charset=utf-8'
        $requestOptions.Body = ConvertTo-Json -InputObject $body -Compress
    }
    Invoke-RestMethod @requestOptions
}
function Check($value,$message) { if (!$value) { throw $message } }
Check (Api Get health).ok 'Health failed'
$original = Api Get admin/avatar-config
$profile = $original.profiles | Where-Object id -ne $original.profileId | Select-Object -First 1
Check $profile 'No alternate avatar'
$tag = 'verify' + [guid]::NewGuid().ToString('N')
$file = Join-Path ([IO.Path]::GetTempPath()) "$tag.txt"
$uploaded = $null
try {
    Api Post admin/avatar-config @{profileId=$profile.id} | Out-Null
    Check ((Api Get admin/avatar-config).profileId -eq $profile.id) 'Avatar readback failed'
    [IO.File]::WriteAllText($file, "${tag}: Test scenic guide entry.")
    $raw = curl.exe --fail --silent --show-error -F "file=@$file" "$BaseUrl/api/knowledge/upload"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
    $uploaded = $raw | ConvertFrom-Json
    Check ($uploaded.created -eq 1) 'Upload did not create a record'
    $first = Api Post chat @{message=$tag; sessionId=$tag}
    Check ($first.answer -and $first.interactionId) 'Chat response incomplete'
    $second = Api Post chat @{message=$tag; sessionId=$tag}
    Check ($second.memoryTurns -ge 2) 'Redis history readback failed'
    $routes = Api Post routes/recommend @{interest='family'; hours=4}
    Check ($routes[0].spotDetails.Count -gt 0) 'Route details missing'
    $rating = Api Post feedback @{interactionId=$first.interactionId; rating='good'}
    Check ($rating.ok -and $rating.item.feedback -eq 'good') 'Feedback failed'
    $logs = (Api Get admin/feedback-analysis).latest
    Check ($logs | Where-Object { $_.id -eq $first.interactionId -and $_.feedback -eq 'good' }) 'Feedback absent from report'
    Write-Host 'PASS: health, avatar, upload, chat, Redis, routes and feedback'
} finally {
    try {
        foreach ($item in $uploaded.items) { Api Delete "knowledge/$($item.id)" | Out-Null }
    } finally {
        Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
        Api Post admin/avatar-config @{profileId=$original.profileId; avatar=$original.avatar; voice=$original.voice; style=$original.style} | Out-Null
    }
}
