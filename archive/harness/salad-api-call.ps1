$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$saladHeaders = @{Authorization = "Bearer $env:SALAD_AI_GATEWAY_API_KEY"}
while ($null -ne ($saladLine = [Console]::In.ReadLine())) {
  $saladClock = [Diagnostics.Stopwatch]::StartNew()
  try {
    $saladReply = Invoke-RestMethod -Method Post -Uri 'https://ai.salad.cloud/v1/chat/completions' -Headers $saladHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($saladLine)) -TimeoutSec 90 -ErrorAction Stop
    $saladClock.Stop()
    @{ok=$true;ms=$saladClock.Elapsed.TotalMilliseconds;response=$saladReply} | ConvertTo-Json -Depth 30 -Compress
  } catch {
    $saladClock.Stop()
    @{ok=$false;ms=$saladClock.Elapsed.TotalMilliseconds;status=$_.Exception.Response.StatusCode.value__;error=$_.Exception.Message;body=$_.ErrorDetails.Message} | ConvertTo-Json -Depth 5 -Compress
  }
}
