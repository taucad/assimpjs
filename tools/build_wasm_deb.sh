#!/bin/bash

# Change to project root
cd "$(dirname "$0")/.." || exit

# Support ReleaseMini, ReleaseAll, or both
BUILD_TYPE=${1:-ReleaseMini}

# Validate build type
if [[ "$BUILD_TYPE" != "ReleaseMini" && "$BUILD_TYPE" != "ReleaseAll" && "$BUILD_TYPE" != "both" ]]; then
    echo "Error: Only ReleaseMini, ReleaseAll, or both are supported"
    echo "Usage: $0 [ReleaseMini|ReleaseAll|both]"
    exit 1
fi

echo "Building AssimpJS for $BUILD_TYPE..."

# Source Emscripten environment
source emsdk/emsdk_env.sh

# Get number of processors for parallel builds
NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

if [[ "$BUILD_TYPE" == "both" ]]; then
    echo "Building both AssimpJS variants..."
    
    # Build mini version
    echo "Building mini version..."
    emcmake cmake -B build_wasm -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE=ReleaseMini . || exit 1
    emmake make -C build_wasm -j"$NPROC" AssimpJS || exit 1

    # Build all version
    echo "Building all version..."
    emcmake cmake -B build_wasm -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE=ReleaseAll . || exit 1
    emmake make -C build_wasm -j"$NPROC" AssimpJS || exit 1

    echo "Running tests..."
    npm run test || exit 1

    # Copy all artifacts using pattern matching
    echo "Creating distribution..."
    mkdir -p dist docs/dist
    cp build_wasm/ReleaseMini/assimpjs-mini.* dist/ 2>/dev/null || true
    cp build_wasm/ReleaseAll/assimpjs-all.* dist/ 2>/dev/null || true
else
    echo "Building single AssimpJS target ($BUILD_TYPE)..."
    emcmake cmake -B build_wasm -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE="$BUILD_TYPE" . || exit 1
    emmake make -C build_wasm -j"$NPROC" AssimpJS || exit 1

    echo "Running tests..."
    npm run test || exit 1

    # Copy artifacts using pattern matching
    echo "Creating distribution..."
    mkdir -p dist docs/dist
    cp build_wasm/"$BUILD_TYPE"/assimpjs*.* dist/ 2>/dev/null || true
fi

# Copy to docs distribution and license files
cp dist/assimpjs*.* docs/dist/ 2>/dev/null || true
cp assimp/LICENSE dist/license.assimp.txt 2>/dev/null || true
cp LICENSE.md dist/license.assimpjs.txt 2>/dev/null || true
cp dist/license*.txt docs/dist/ 2>/dev/null || true

echo "Build completed!"

# Print size summary
if ls dist/assimpjs*.* >/dev/null 2>&1; then
    echo ""
    echo "Build Size Summary:"
    ls -lh dist/assimpjs*.* | awk '{printf "  %-30s %s\n", $9, $5}'
fi
