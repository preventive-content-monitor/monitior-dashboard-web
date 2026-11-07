@echo off
:: GuardIAn - Desfaz o que "GuardIAn-Protecao.bat" aplicou.
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set ID=ffceadefofipolmioklfilgepmnlammo
set C=HKLM\SOFTWARE\Policies\Google\Chrome
set E=HKLM\SOFTWARE\Policies\Microsoft\Edge
reg delete "%C%" /v IncognitoModeAvailability /f >nul 2>&1
reg delete "%C%" /v BrowserGuestModeEnabled /f >nul 2>&1
reg delete "%C%" /v BrowserAddPersonEnabled /f >nul 2>&1
reg delete "%C%\3rdparty\extensions\%ID%" /f >nul 2>&1
reg delete "%C%\URLBlocklist" /v 9001 /f >nul 2>&1
reg delete "%C%\URLBlocklist" /v 9002 /f >nul 2>&1
reg delete "%E%" /v InPrivateModeAvailability /f >nul 2>&1
reg delete "%E%" /v BrowserGuestModeEnabled /f >nul 2>&1
reg delete "%E%" /v BrowserAddProfileEnabled /f >nul 2>&1
reg delete "%E%\3rdparty\extensions\%ID%" /f >nul 2>&1
reg delete "%E%\URLBlocklist" /v 9001 /f >nul 2>&1
reg delete "%E%\URLBlocklist" /v 9002 /f >nul 2>&1
echo.
echo  GuardIAn: protecao removida. Feche e abra o navegador.
echo.
pause