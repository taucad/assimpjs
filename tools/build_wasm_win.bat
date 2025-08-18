@echo off
pushd %~dp0\..

REM Support ReleaseMini, ReleaseAll, or both
set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=ReleaseMini

REM Validate build type
if not "%BUILD_TYPE%"=="ReleaseMini" if not "%BUILD_TYPE%"=="ReleaseAll" if not "%BUILD_TYPE%"=="both" (
    echo Error: Only ReleaseMini, ReleaseAll, or both are supported
    echo Usage: %0 [ReleaseMini^|ReleaseAll^|both]
    goto :error
)

echo Building AssimpJS for %BUILD_TYPE%...

call emsdk\emsdk_env.bat

if "%BUILD_TYPE%"=="both" (
    echo Building both AssimpJS variants...
    call :build_target ReleaseMini build_wasm_mini || goto :error
    call :build_target ReleaseAll build_wasm_all || goto :error
    call :copy_artifacts build_wasm_mini\ReleaseMini\assimpjs-mini.* build_wasm_all\ReleaseAll\assimpjs-all.*
) else (
    echo Building single AssimpJS target (%BUILD_TYPE%)...
    call :build_target %BUILD_TYPE% build_wasm || goto :error
    call :copy_artifacts build_wasm\%BUILD_TYPE%\assimpjs*.*
)

call :copy_licenses
call :print_summary

echo Build completed!
popd
exit /b 0

:build_target
set BT=%1
set BD=%2
echo Building %BT% in %BD%...
call emcmake cmake -B %BD% -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_MAKE_PROGRAM=mingw32-make -DCMAKE_BUILD_TYPE=%BT% . || exit /b 1
call emmake mingw32-make -C %BD% AssimpJS || exit /b 1
exit /b 0

:copy_artifacts
echo Creating distribution...
if not exist dist mkdir dist
if not exist docs\dist mkdir docs\dist
:copy_loop
if "%1"=="" goto :copy_done
copy %1 dist\ 2>nul
copy dist\assimpjs*.* docs\dist\ 2>nul
shift
goto :copy_loop
:copy_done
exit /b 0

:copy_licenses
copy assimp\LICENSE dist\license.assimp.txt 2>nul
copy LICENSE.md dist\license.assimpjs.txt 2>nul
copy dist\license*.txt docs\dist\ 2>nul
exit /b 0

:print_summary
if exist dist\assimpjs*.* (
    echo.
    echo Build Size Summary:
    dir dist\assimpjs*.* /b /s
)
exit /b 0

:error
echo Build Failed with Error %errorlevel%.
popd
exit /b 1
