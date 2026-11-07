@echo off
:: GuardIAn - Instalador do computador do filho
:: Baixa a extensao para uma pasta fixa, desliga a guia anonima, agenda as atualizacoes
:: e abre a pagina de extensoes com o caminho da pasta ja copiado.
setlocal
set "SERVIDOR=__SERVIDOR__"
set "NAVEGADOR=__NAVEGADOR__"
set "BASE=%ProgramFiles%\GuardIAn"
set "PASTA=%ProgramFiles%\GuardIAn\Extensao"
set "ID=ffceadefofipolmioklfilgepmnlammo"
if /i "%~1"=="admin" goto admin
if /i "%~1"=="atualizar" goto atualizar

echo.
echo  GuardIAn: preparando a instalacao...
echo  Clique em "Sim" quando o Windows pedir permissao.
powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList 'admin' -Verb RunAs -Wait } catch { exit 1 }"
if not exist "%PASTA%\manifest.json" goto falhou
powershell -NoProfile -Command "Set-Clipboard -Value $env:PASTA"
if /i "%NAVEGADOR%"=="edge" (start "" msedge "edge://extensions") else (start "" chrome "chrome://extensions")
echo.
echo  ============================================================
echo   Pronto! Falta so carregar a extensao no navegador:
echo.
echo   1. Ligue o "Modo do desenvolvedor"
echo   2. Clique em "Carregar sem compactacao"
echo   3. No campo "Pasta", aperte Ctrl+V e clique em "Selecionar pasta"
echo  ============================================================
echo.
pause
exit /b 0

:falhou
echo.
echo  Nao foi possivel instalar. Abra o arquivo de novo e clique em "Sim".
echo.
pause
exit /b 1

:admin
call :baixar
if errorlevel 1 (
  echo  Nao foi possivel baixar a extensao. Verifique a internet.
  pause
  exit /b 1
)
copy /y "%~f0" "%BASE%\GuardIAn.bat" >nul
schtasks /create /tn "GuardIAn Atualizar" /tr "\"%BASE%\GuardIAn.bat\" atualizar" /sc hourly /mo 6 /ru SYSTEM /f >nul
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
exit /b 0

:atualizar
call :baixar
exit /b %errorlevel%

:baixar
echo  Baixando a extensao...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $z=Join-Path $env:TEMP 'guardian-ext.zip'; $t=Join-Path $env:TEMP 'guardian-ext'; Invoke-WebRequest -UseBasicParsing -Uri ($env:SERVIDOR + '/downloads/GuardIAn-Extensao.zip') -OutFile $z; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive -Path $z -DestinationPath $t -Force; if (-not (Test-Path (Join-Path $t 'manifest.json'))) { throw 'pacote invalido' }; New-Item -ItemType Directory -Force -Path $env:PASTA | Out-Null; Copy-Item -Path (Join-Path $t '*') -Destination $env:PASTA -Recurse -Force; Remove-Item $z, $t -Recurse -Force"
exit /b %errorlevel%