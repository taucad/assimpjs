cmake_minimum_required (VERSION 3.6)

set_property (GLOBAL PROPERTY USE_FOLDERS ON)

set (CMAKE_SUPPRESS_REGENERATION 1)
set (CMAKE_CONFIGURATION_TYPES Debug;Release;Release-Server;RelWithDebInfo;MinSizeRel)

add_definitions (-DUNICODE -D_UNICODE)

project (AssimpJS)

# Assimp

set (BUILD_SHARED_LIBS OFF CACHE BOOL "")
set (ASSIMP_BUILD_TESTS OFF CACHE BOOL "")
set (ASSIMP_BUILD_ASSIMP_TOOLS OFF CACHE BOOL "")
set (ASSIMP_BUILD_ALL_EXPORTERS_BY_DEFAULT OFF CACHE BOOL "")

# Enable only essential exporters
set (ASSIMP_BUILD_ASSJSON_EXPORTER ON CACHE BOOL "")
set (ASSIMP_BUILD_GLTF_EXPORTER ON CACHE BOOL "")

# undefined behaviour because of alignment issues, crashes and memory leaks
# https://github.com/assimp/assimp/pull/4044
set (ASSIMP_BUILD_M3D_IMPORTER OFF CACHE BOOL "")

# assertion failed because of a memory error
set (ASSIMP_BUILD_RAW_IMPORTER OFF CACHE BOOL "")

# removed from assimp, so doesn't need to compile at all
# https://github.com/assimp/assimp/issues/3647
set (ASSIMP_BUILD_X3D_IMPORTER OFF CACHE BOOL "")

# doesn't work because of xml parsing error
set (ASSIMP_BUILD_IRR_IMPORTER OFF CACHE BOOL "")
set (ASSIMP_BUILD_IRRMESH_IMPORTER OFF CACHE BOOL "")

# doesn't work
set (ASSIMP_BUILD_TERRAGEN_IMPORTER OFF CACHE BOOL "")

# this dramatically decreases the wasm file size
set (ASSIMP_BUILD_IFC_IMPORTER OFF CACHE BOOL "")

# enable USD importer with optimized tinyusdz using proven EMSCRIPTEN config
set (ASSIMP_BUILD_USD_IMPORTER ON CACHE BOOL "")

if (${EMSCRIPTEN})
  # Web-optimized: Smallest size for web deployment
  if (CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS_RELEASE "-Oz -DNDEBUG -flto")
    set(CMAKE_C_FLAGS_RELEASE "-Oz -DNDEBUG -flto")
  endif()

  # Server-optimized: Maximum performance for server deployment
  if (CMAKE_BUILD_TYPE STREQUAL "Release-Server")
    # Core performance flags
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "-O3 -DNDEBUG -flto")
    
    # Advanced performance optimizations  
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -funroll-loops")
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -finline-functions")
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -ffast-math")
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -fomit-frame-pointer")
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -march=native")
    set(CMAKE_CXX_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER} -mtune=native")

    # Copy all C++ flags to C flags (after all flags are set)
    set(CMAKE_C_FLAGS_RELEASE_SERVER "${CMAKE_CXX_FLAGS_RELEASE_SERVER}")
  endif()
endif()

# build zlib from sources instead of looking for system zlib
set (ASSIMP_BUILD_ZLIB ON CACHE BOOL "")

add_subdirectory (assimp)

if (${EMSCRIPTEN})
	target_compile_options (assimp PUBLIC -fexceptions -Wno-unused-but-set-variable -Wno-unused-const-variable)
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
	target_compile_options (AssimpJS PUBLIC -fexceptions)

	target_link_options (AssimpJS PUBLIC -sMODULARIZE=1)
	target_link_options (AssimpJS PUBLIC -sEXPORT_NAME=assimpjs)
	target_link_options (AssimpJS PUBLIC -sNO_DISABLE_EXCEPTION_CATCHING)

	# Production: Disable assertions for smaller WASM size (enable -sASSERTIONS=1 for debugging)
	# target_link_options (AssimpJS PUBLIC -sASSERTIONS=1 -sSAFE_HEAP=1 -sWARN_UNALIGNED=1)
	target_link_options (AssimpJS PUBLIC -sASSERTIONS=0)            # Disable assertions for production
	
	# Javascript size optimizations
	target_link_options (AssimpJS PUBLIC --closure=1)               # Google Closure Compiler optimization
	
	# Dynamic memory management for variable file sizes
	target_link_options (AssimpJS PUBLIC -sALLOW_MEMORY_GROWTH=1 --no-heap-copy)   # Allow unlimited memory growth as needed
	
  # Remove unnecessary runtime features (keeping safe ones)
	target_link_options (AssimpJS PUBLIC -sSUPPORT_LONGJMP=0)
	target_link_options (AssimpJS PUBLIC -sSUPPORT_ERRNO=0)
	target_link_options (AssimpJS PUBLIC -sNO_EXIT_RUNTIME=1)       # Don't include exit handling
	
	# Essential flags for compatibility
	target_link_options (AssimpJS PUBLIC -sINVOKE_RUN=0)            # Don't auto-run
	target_link_options (AssimpJS PUBLIC --bind)                    # Enable embind
	target_link_options (AssimpJS PUBLIC -sWASM_BIGINT)
	target_link_options (AssimpJS PUBLIC -sLLD_REPORT_UNDEFINED)
	target_link_options (AssimpJS PUBLIC -sNO_FILESYSTEM=0)
else ()
	add_library (AssimpJS ${AssimpJSSourceFiles})
endif ()

target_link_libraries (AssimpJS assimp)
set_target_properties(AssimpJS PROPERTIES OUTPUT_NAME assimpjs)
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
