$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $ProjectDir '.venv'
$PythonExe = Join-Path $VenvDir 'Scripts\python.exe'

if (-not (Test-Path -LiteralPath $PythonExe)) {
    Write-Host 'Creating local Python environment...'
    py -3.12 -m venv $VenvDir
    & $PythonExe -m pip install --upgrade pip
    & $PythonExe -m pip install -r (Join-Path $ProjectDir 'requirements.txt')
}

& $PythonExe (Join-Path $ProjectDir 'app.py')
