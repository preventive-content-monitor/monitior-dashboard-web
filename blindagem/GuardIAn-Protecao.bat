@echo off
:: GuardIAn - Protecao do computador do filho
:: Desliga a guia anonima/InPrivate, o modo visitante e novos perfis no Chrome e no Edge,
:: onde a extensao nao consegue atuar. Para desfazer, use "Remover-Protecao.bat".
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set ID=ffceadefofipolmioklfilgepmnlammo
set C=HKLM\SOFTWARE\Policies\Google\Chrome
set E=HKLM\SOFTWARE\Policies\Microsoft\Edge
reg add "%C%" /v IncognitoModeAvailability /t REG_DWORD /d 1 /f >nul
reg add "%C%" /v BrowserGuestModeEnabled /t REG_DWORD /d 0 /f >nul
reg add "%C%" /v BrowserAddPersonEnabled /t REG_DWORD /d 0 /f >nul
reg add "%C%\3rdparty\extensions\%ID%\policy" /v anonimoBloqueado /t REG_DWORD /d 1 /f >nul
reg add "%E%" /v InPrivateModeAvailability /t REG_DWORD /d 1 /f >nul
reg add "%E%" /v BrowserGuestModeEnabled /t REG_DWORD /d 0 /f >nul
reg add "%E%" /v BrowserAddProfileEnabled /t REG_DWORD /d 0 /f >nul
reg add "%E%\3rdparty\extensions\%ID%\policy" /v anonimoBloqueado /t REG_DWORD /d 1 /f >nul
:: Versoes antigas bloqueavam a pagina de extensoes de vez; agora a extensao libera com a palavra-chave.
reg delete "%C%\URLBlocklist" /v 9001 /f >nul 2>&1
reg delete "%C%\URLBlocklist" /v 9002 /f >nul 2>&1
reg delete "%E%\URLBlocklist" /v 9001 /f >nul 2>&1
reg delete "%E%\URLBlocklist" /v 9002 /f >nul 2>&1
echo.
echo  ============================================
echo   GuardIAn: computador protegido!
echo  ============================================
echo.
echo  - Guia anonima e InPrivate: desativadas
echo  - Modo visitante e novos perfis: desativados
echo.
echo  Pode fechar esta janela e voltar ao navegador.
echo.
timeout /t 15