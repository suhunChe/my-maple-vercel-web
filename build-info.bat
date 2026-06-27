@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "SCRIPT_DIR=%cd%"
set "ROOT=%SCRIPT_DIR%"

if not exist "%ROOT%\build-info.js" (
    if exist "%SCRIPT_DIR%\..\build-info.js" (
        for %%I in ("%SCRIPT_DIR%\..") do set "ROOT=%%~fI"
    )
)
if not exist "%ROOT%\build-info.js" (
    if exist "%SCRIPT_DIR%\..\..\build-info.js" (
        for %%I in ("%SCRIPT_DIR%\..\..") do set "ROOT=%%~fI"
    )
)

set "OUTDIR=%ROOT%\MyMaple_PageInfo\InfoList"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

set "LOGFILE=%ROOT%\build-info.log"
break > "%LOGFILE%"
echo [START] MyMaple Info Builder>> "%LOGFILE%"
echo SCRIPT_DIR=%SCRIPT_DIR%>> "%LOGFILE%"
echo ROOT=%ROOT%>> "%LOGFILE%"
echo OUTDIR=%OUTDIR%>> "%LOGFILE%"

echo ==========================================
echo MyMaple Info Builder
echo ==========================================
echo ROOT: %ROOT%
echo LOG : %LOGFILE%
echo.

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if "%NODE_EXE%"=="" if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if "%NODE_EXE%"=="" if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
echo NODE_EXE=%NODE_EXE%>> "%LOGFILE%"

if "%NODE_EXE%"=="" (
    echo ERROR: Node.js not found.
    echo [ERROR] Node.js not found>> "%LOGFILE%"
    pause
    exit /b 1
)

if not exist "%ROOT%\MyMaple_PageInfo" (
    echo ERROR: MyMaple_PageInfo folder not found.
    echo [ERROR] Missing MyMaple_PageInfo>> "%LOGFILE%"
    pause
    exit /b 1
)

if not exist "%ROOT%\build-info.js" (
    echo ERROR: build-info.js not found.
    echo [ERROR] Missing build-info.js>> "%LOGFILE%"
    pause
    exit /b 1
)

echo [RUN] %NODE_EXE% build-info.js>> "%LOGFILE%"
echo Running build-info.js...

pushd "%ROOT%"
"%NODE_EXE%" build-info.js >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    popd
    echo ERROR: build-info.js failed.
    echo.
    type "%LOGFILE%"
    echo.
    pause
    exit /b 1
)
popd

echo [DONE] success>> "%LOGFILE%"
echo Done.
echo Output folder: %OUTDIR%
start "" "%OUTDIR%"
pause
endlocal
