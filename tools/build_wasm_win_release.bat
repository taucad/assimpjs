pushd %~dp0\..
call tools\build_wasm_win.bat Release %1
popd
