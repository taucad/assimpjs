cmake_minimum_required (VERSION 3.6)

set_property (GLOBAL PROPERTY USE_FOLDERS ON)

set (CMAKE_SUPPRESS_REGENERATION 1)
set (CMAKE_CONFIGURATION_TYPES Debug;ReleaseMini;ReleaseAll;ReleaseExporter;RelWithDebInfo;MinSizeRel)

add_definitions (-DUNICODE -D_UNICODE)

project (AssimpJS)

# Assimp

set (BUILD_SHARED_LIBS OFF CACHE BOOL "")
set (ASSIMP_BUILD_TESTS OFF CACHE BOOL "")
set (ASSIMP_BUILD_ASSIMP_TOOLS OFF CACHE BOOL "")

if (CMAKE_BUILD_TYPE STREQUAL "ReleaseMini" OR CMAKE_BUILD_TYPE STREQUAL "ReleaseAll")
  # Enable all IMPORTERS by default, DISABLE all EXPORTERS by default
  set (ASSIMP_BUILD_ALL_IMPORTERS_BY_DEFAULT ON CACHE BOOL "")
  set (ASSIMP_BUILD_ALL_EXPORTERS_BY_DEFAULT OFF CACHE BOOL "")

  # Enable only essential EXPORTERS for import-focused builds
  set (ASSIMP_BUILD_ASSJSON_EXPORTER ON CACHE BOOL "")
  set (ASSIMP_BUILD_GLTF_EXPORTER ON CACHE BOOL "")

  ### SKIPPED IMPORTERS ###
  # M3D importer has undefined behaviour because of alignment issues, crashes and memory leaks
  # https://github.com/assimp/assimp/pull/4044
  set (ASSIMP_BUILD_M3D_IMPORTER OFF CACHE BOOL "")

  # Raw importer assertion failed because of a memory error
  set (ASSIMP_BUILD_RAW_IMPORTER OFF CACHE BOOL "")

  # Irrlicht importer doesn't work because of xml parsing error
  set (ASSIMP_BUILD_IRR_IMPORTER OFF CACHE BOOL "")
  set (ASSIMP_BUILD_IRRMESH_IMPORTER OFF CACHE BOOL "")

  # Terragen importer doesn't work
  set (ASSIMP_BUILD_TERRAGEN_IMPORTER OFF CACHE BOOL "")
  ### END SKIPPED IMPORTERS ###
endif()

if (CMAKE_BUILD_TYPE STREQUAL "ReleaseMini")
  # without X3D, decreases the wasm file size by 1.5mb
  set (ASSIMP_BUILD_X3D_IMPORTER OFF CACHE BOOL "")
  set (ASSIMP_BUILD_VRML_IMPORTER OFF CACHE BOOL "")

  # without IFC, decreases the wasm file size by 900kb
  set (ASSIMP_BUILD_IFC_IMPORTER OFF CACHE BOOL "")

  # without USD, decreases the wasm file size by 5.5mb
  set (ASSIMP_BUILD_USD_IMPORTER OFF CACHE BOOL "")
elseif (CMAKE_BUILD_TYPE STREQUAL "ReleaseAll")
  set (ASSIMP_BUILD_X3D_IMPORTER ON CACHE BOOL "")
  set (ASSIMP_BUILD_VRML_IMPORTER ON CACHE BOOL "")
  set (ASSIMP_BUILD_IFC_IMPORTER ON CACHE BOOL "")
  set (ASSIMP_BUILD_USD_IMPORTER ON CACHE BOOL "")
  set (ASSIMP_BUILD_3MF_LIB3MF ON CACHE BOOL "")
elseif (CMAKE_BUILD_TYPE STREQUAL "ReleaseExporter")
  # ReleaseExporter: MINIMAL IMPORTERS support (GLTF/GLB/ASSJSON only) but ALL EXPORTERS enabled
  
  # Disable ALL IMPORTERS by default, then selectively enable only what we need
  set (ASSIMP_BUILD_ALL_IMPORTERS_BY_DEFAULT OFF CACHE BOOL "")
  set (ASSIMP_BUILD_ALL_EXPORTERS_BY_DEFAULT ON CACHE BOOL "")
  
  # Enable only essential IMPORTERS for GLTF/GLB input and ASSJSON conversion
  set (ASSIMP_BUILD_GLTF_IMPORTER ON CACHE BOOL "")    # For GLTF 1.0 & 2.0 + GLB support
  set (ASSIMP_BUILD_ASSJSON_IMPORTER ON CACHE BOOL "") # For internal JSON conversion
  
  # USD importer required for USD exporter (shared tinyusdz dependency)
  set (ASSIMP_BUILD_USD_IMPORTER ON CACHE BOOL "")

  # lib3mf for comprehensive 3MF import/export
  set (ASSIMP_BUILD_3MF_LIB3MF ON CACHE BOOL "")

  # Enable most EXPORTERS (excluding problematic ones)
  set (ASSIMP_BUILD_PBRT_EXPORTER OFF CACHE BOOL "")  # Not required
  set (ASSIMP_BUILD_M3D_EXPORTER OFF CACHE BOOL "")  # Disabled due memory leaks
  set (ASSIMP_BUILD_ASSBIN_EXPORTER OFF CACHE BOOL "")  # Not a true file format
  set (ASSIMP_BUILD_ASSXML_EXPORTER OFF CACHE BOOL "")  # Not a true file format
endif()

# Dev-mode build switch — flip to OFF to re-enable the slow optimization passes
# (LTO, closure compiler, EVAL_CTORS=2, traps-never-happen, strip-producers,
# wasm-opt -O3) for the final size-tuned production build. With
# ASSIMPJS_FAST_BUILD ON, end-to-end clean rebuild of one variant drops from
# ~90 min to ~5-10 min, at the cost of a 2-3× larger WASM (acceptable while
# iterating; NOT for shipping).
option (ASSIMPJS_FAST_BUILD "Skip slow optimization passes for fast iteration" ON)

if (${EMSCRIPTEN})
  set(CMAKE_CXX_STANDARD 17)
  set(CMAKE_CXX_STANDARD_REQUIRED ON)
  if (ASSIMPJS_FAST_BUILD)
    # -O2 keeps inlining + the standard scalar/loop passes while skipping
    # the expensive interprocedural passes that dominate -O3 compile time.
    # -DNDEBUG strips assert() expansions either way. We choose -O2 over -O1
    # to preserve embind's vtable-flattening and devirtualization heuristics
    # (the JS↔WASM bridge depends on those for performance, not correctness;
    # a quick test at -O1 produced a working but ~30% slower bridge).
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O2 -DNDEBUG")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O2 -DNDEBUG")
  else ()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -DNDEBUG")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -DNDEBUG")
  endif ()
endif()

# build zlib from sources instead of looking for system zlib
set (ASSIMP_BUILD_ZLIB ON CACHE BOOL "")

add_subdirectory (assimp)

if (${EMSCRIPTEN})
	if (ASSIMPJS_FAST_BUILD)
		target_compile_options (assimp PUBLIC -fwasm-exceptions -Wno-unused-but-set-variable -Wno-unused-const-variable -msimd128)
	else ()
		target_compile_options (assimp PUBLIC -fwasm-exceptions -Wno-unused-but-set-variable -Wno-unused-const-variable -flto -msimd128)
	endif ()
endif ()

# AssimpJS

set (AssimpJSSourcesFolder assimpjs/src)
file (GLOB
	AssimpJSSourceFiles
	${AssimpJSSourcesFolder}/*.hpp
	${AssimpJSSourcesFolder}/*.cpp
)
source_group ("Sources" FILES ${AssimpJSSourceFiles})

if (${EMSCRIPTEN})
	add_executable (AssimpJS ${AssimpJSSourceFiles})
	target_compile_options (AssimpJS PUBLIC "$<$<CONFIG:Debug>:-gsource-map>")
	target_compile_options (AssimpJS PUBLIC -fwasm-exceptions)
	target_compile_options (AssimpJS PUBLIC -msimd128)
	if (ASSIMPJS_FAST_BUILD)
		# AssimpJS bridge code matches the global -O2/-O3 fast-build setting.
		target_compile_options (AssimpJS PUBLIC -O2)
	else ()
		target_compile_options (AssimpJS PUBLIC -flto)
	endif ()

	# Module output: ESM with factory function
	target_link_options (AssimpJS PUBLIC -sMODULARIZE=1)
	target_link_options (AssimpJS PUBLIC -sEXPORT_NAME=assimpjs)
	target_link_options (AssimpJS PUBLIC -sEXPORT_ES6=1)
	target_link_options (AssimpJS PUBLIC -sENVIRONMENT=web,worker,node)

	# Exception handling (native WASM exceptions)
	target_link_options (AssimpJS PUBLIC -fwasm-exceptions)

	# Runtime error handling
	target_link_options (AssimpJS PUBLIC -sABORTING_MALLOC=1)

	# JS size optimizations — closure compiler is ~3-5 min/variant and only
	# affects the JS glue file (~40K). Skipped in fast-build mode.
	if (NOT ASSIMPJS_FAST_BUILD)
		target_link_options (AssimpJS PUBLIC --closure=1)
	endif ()

	# Dynamic memory management
	target_link_options (AssimpJS PUBLIC -sALLOW_MEMORY_GROWTH=1)
	target_link_options (AssimpJS PUBLIC -sINITIAL_HEAP=64MB)
	target_link_options (AssimpJS PUBLIC -sMAXIMUM_MEMORY=2GB)
	target_link_options (AssimpJS PUBLIC -sSTACK_SIZE=8MB)

	# Runtime features
	target_link_options (AssimpJS PUBLIC -sSUPPORT_LONGJMP=0)
	target_link_options (AssimpJS PUBLIC -sEXIT_RUNTIME=0)
	target_link_options (AssimpJS PUBLIC -sINVOKE_RUN=0)
	target_link_options (AssimpJS PUBLIC -sFILESYSTEM=1)

	# Embind and BigInt support
	target_link_options (AssimpJS PUBLIC -lembind)
	target_link_options (AssimpJS PUBLIC -sWASM_BIGINT)

	# Build-time constructor evaluation. EVAL_CTORS=2 (aggressive) costs
	# ~25-30 min/variant of link time and shrinks the WASM by ~10-15%; in
	# fast-build mode we skip it entirely (=0) and rely on the runtime to
	# execute ctors normally on first use.
	if (ASSIMPJS_FAST_BUILD)
		target_link_options (AssimpJS PUBLIC -sEVAL_CTORS=0)
	else ()
		target_link_options (AssimpJS PUBLIC -sEVAL_CTORS=2)
	endif ()

	# Extra wasm-opt passes folded into emcc's built-in wasm-opt invocation.
	# In fast-build mode we keep `--strip-debug` only (the WASM file balloons
	# >2× without it, slowing every npm test load); we drop
	# `--traps-never-happen` (correctness-preserving but ~3-5 min) and
	# `--strip-producers` (cosmetic metadata stripping). For the final
	# production build the trap-elision pass should be re-enabled — it
	# unlocks downstream wasm-opt optimizations that depend on the
	# no-trap assumption.
	if (ASSIMPJS_FAST_BUILD)
		target_link_options (AssimpJS PUBLIC "SHELL:-sBINARYEN_EXTRA_PASSES=--strip-debug")
	else ()
		target_link_options (AssimpJS PUBLIC "SHELL:-sBINARYEN_EXTRA_PASSES=--traps-never-happen,--strip-debug,--strip-producers")
	endif ()

	# Link-time optimization. -flto runs the LLVM IR optimizer over the entire
	# program at link time; correctness-preserving but adds ~5-10 min/variant.
	# In fast-build mode we instead pass -O2 to emcc as a link option, which
	# both skips LTO and drops emcc's internal wasm-opt invocation from -O3
	# to -O2 — the dominant remaining cost once EVAL_CTORS=0 and closure are
	# off. End-to-end measured: ~2:40 wall time per variant in fast mode, vs
	# ~30+ min/variant for the production build.
	if (ASSIMPJS_FAST_BUILD)
		target_link_options (AssimpJS PUBLIC -O2)
	else ()
		target_link_options (AssimpJS PUBLIC -flto)
	endif ()

	# SIMD (Safari-compatible: -msimd128 only; -mrelaxed-simd dropped per
	# docs/research/safari-wasm-relaxed-simd-incompatibility.md — Safari 26.0
	# WebKit/JSC rejects relaxed-SIMD opcodes at parse time.)
	target_link_options (AssimpJS PUBLIC -msimd128)
else ()
	add_library (AssimpJS ${AssimpJSSourceFiles})
endif ()

target_link_libraries (AssimpJS assimp)
if (CMAKE_BUILD_TYPE STREQUAL "ReleaseMini")
  set_target_properties(AssimpJS PROPERTIES OUTPUT_NAME assimpjs-mini)
elseif (CMAKE_BUILD_TYPE STREQUAL "ReleaseAll")
  set_target_properties(AssimpJS PROPERTIES OUTPUT_NAME assimpjs-all)
elseif (CMAKE_BUILD_TYPE STREQUAL "ReleaseExporter")
  set_target_properties(AssimpJS PROPERTIES OUTPUT_NAME assimpjs-exporter)
endif()
set_target_properties (AssimpJS PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/${CMAKE_BUILD_TYPE}")

# AssimpJSTest

if (${EMSCRIPTEN})
else ()
	set (AssimpJSExampleSourcesFolder assimpjs/example)
	file (GLOB
		AssimpJSExampleSourceFiles
		${AssimpJSExampleSourcesFolder}/*.hpp
		${AssimpJSExampleSourcesFolder}/*.cpp
	)
	source_group ("Sources" FILES ${AssimpJSExampleSourceFiles})
	add_executable (AssimpJSExample ${AssimpJSExampleSourceFiles})
	target_include_directories (AssimpJSExample PUBLIC ${AssimpJSSourcesFolder})
	target_link_libraries (AssimpJSExample AssimpJS)
	set_target_properties (AssimpJSExample PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/${CMAKE_BUILD_TYPE}")
endif ()
