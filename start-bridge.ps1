$ErrorActionPreference = "Stop"
$configPath = "C:\AccountControlCenter\config\remote-access.json"
$config = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } else { $null }
$env:CONTROL_CENTER_HOST = if ($config.host) { $config.host } else { "127.0.0.1" }
$env:CONTROL_CENTER_PORT = "8790"
if ($config) {
  $env:CONTROL_CENTER_ACCESS_USER = $config.user
  $env:CONTROL_CENTER_ACCESS_PASSWORD = $config.password
  $env:CONTROL_CENTER_ORIGIN_SECRET = $config.originSecret
  if ($config.oauthRedirect) { $env:YOUTUBE_OAUTH_REDIRECT = $config.oauthRedirect }
}
$node = "C:\AccountControlCenter\node\node.exe"
$server = "C:\AccountControlCenter\app\server.js"
& $node $server
