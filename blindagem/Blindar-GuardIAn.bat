@echo off
:: GuardIAn - Blindagem do computador do filho
:: Bloqueia guia anonima/InPrivate, modo visitante, novos perfis e a pagina de extensoes
:: no Google Chrome e no Microsoft Edge. Para desfazer, use "Remover-Blindagem.bat".
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set C=HKLM\SOFTWARE\Policies\Google\Chrome
set E=HKLM\SOFTWARE\Policies\Microsoft\Edge
reg add "%C%" /v IncognitoModeAvailability /t REG_DWORD /d 1 /f >nul
reg add "%C%" /v BrowserGuestModeEnabled /t REG_DWORD /d 0 /f >nul
reg add "%C%" /v BrowserAddPersonEnabled /t REG_DWORD /d 0 /f >nul
reg add "%C%\URLBlocklist" /v 9001 /t REG_SZ /d "chrome://extensions" /f >nul
reg add "%C%\URLBlocklist" /v 9002 /t REG_SZ /d "chrome://settings/reset" /f >nul
reg add "%E%" /v InPrivateModeAvailability /t REG_DWORD /d 1 /f >nul
reg add "%E%" /v BrowserGuestModeEnabled /t REG_DWORD /d 0 /f >nul
reg add "%E%" /v BrowserAddProfileEnabled /t REG_DWORD /d 0 /f >nul
reg add "%E%\URLBlocklist" /v 9001 /t REG_SZ /d "edge://extensions" /f >nul
reg add "%E%\URLBlocklist" /v 9002 /t REG_SZ /d "chrome://extensions" /f >nul
echo.
echo  ============================================
echo   GuardIAn: computador blindado com sucesso!
echo  ============================================
echo.
echo  - Guia anonima e InPrivate: desativadas
echo  - Modo visitante e novos perfis: desativados
echo  - Pagina de extensoes: bloqueada
echo.
echo  Feche e abra o navegador para valer.
echo.
pause