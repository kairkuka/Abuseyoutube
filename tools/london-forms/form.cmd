@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Fast Google Form Submitter

if not "%~1"=="" (
  node "%~dp0fast-form-submit.js" "%~1" --execute
  exit /b !errorlevel!
)

:prompt
set "FORM_URL="
set /p "FORM_URL=Paste Google Form URL, or type START: "
if not defined FORM_URL exit /b 0
if /I "!FORM_URL!"=="START" (
  node "%~dp0fast-chat-handler.js"
  echo.
  goto prompt
)
node "%~dp0fast-form-submit.js" "!FORM_URL!" --execute
echo.
goto prompt
