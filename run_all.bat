@echo off
setlocal

echo ==========================================
echo Step 1: Running Fish Weight Precomputer...
echo ==========================================
REM Navigate to the script's directory to ensure relative paths work
cd /d "%~dp0"

dotnet run --project src\FishWeightPrecomputer\FishWeightPrecomputer.csproj
if %errorlevel% neq 0 (
    echo Error: Precompute failed.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo Step 2: Processing Data (Slicing)...
echo ==========================================
cd fish-weight-viewer
if %errorlevel% neq 0 (
    echo Error: Could not find fish-weight-viewer directory.
    pause
    exit /b %errorlevel%
)

call node convert_weights.cjs
if %errorlevel% neq 0 (
    echo Error: Data conversion failed.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo Step 3: Starting Web Server...
echo ==========================================
echo Starting Vite server. Press Ctrl+C to stop.
call npm run dev
