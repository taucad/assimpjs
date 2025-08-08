#!/bin/bash

# Change to project root
cd "$(dirname "$0")/.." || exit

# Configuration parameter (default to Release if not provided)
CONFIG=${1:-Release}

# Source Emscripten environment
source emsdk/emsdk_env.sh

# Configure with CMake
emcmake cmake -B build_wasm -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE="$CONFIG" . || exit 1

# Build with emmake using parallel compilation (2025 optimization)
NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
emmake make -C build_wasm -j"$NPROC" || exit 1

echo "Build Succeeded."

# If Release build, run tests and create distribution
if [ "$CONFIG" = "Release" ]; then
    echo "Running tests..."
    export TEST_CONFIG=Release
    npm run test || exit 1
    
    echo "Creating distribution..."
    mkdir -p dist
    cp build_wasm/Release/assimpjs.js dist/assimpjs.js || exit 1
    cp build_wasm/Release/assimpjs.wasm dist/assimpjs.wasm || exit 1
    cp assimp/LICENSE dist/license.assimp.txt || exit 1
    cp LICENSE.md dist/license.assimpjs.txt || exit 1
    
    mkdir -p docs/dist
    cp -f dist/* docs/dist/ || exit 1
    
    echo "Distribution Succeeded."
fi
