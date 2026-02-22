#include <assimp/DefaultIOSystem.h>
#include <assimp/IOStream.hpp>
#include <assimp/Importer.hpp>
#include <assimp/material.h>
#include <assimp/GltfMaterial.h>
#include <assimp/scene.h>
#include <assimp/postprocess.h>

#include "assimpjs.hpp"

#include <fstream>
#include <iostream>
#include <cmath>

static File GetFile (const std::string& filePath)
{
	Assimp::DefaultIOSystem system;
	Assimp::IOStream* stream = system.Open (filePath.c_str (), "rb");
	if (stream == nullptr) {
		return File ();
	}
	size_t fileSize = stream->FileSize ();
	Buffer content (fileSize);
	stream->Read (&content[0], 1, fileSize);
	return File (filePath, content);
}

int main (int argc, const char* argv[])
{
	if (argc < 2) {
		std::cerr << "Usage: " << argv[0] << " <input-file> [export-format] [--roundtrip] [--save]" << std::endl;
		std::cerr << "  export-format: usda, usdz (default: usdz)" << std::endl;
		std::cerr << "  --roundtrip: re-import the exported file" << std::endl;
		std::cerr << "  --save: save exported file to disk" << std::endl;
		return 1;
	}

	std::string inputFile = argv[1];
	std::string format = "usdz";
	bool doRoundTrip = false;
	bool saveFile = false;

	for (int i = 2; i < argc; i++) {
		std::string arg = argv[i];
		if (arg == "--roundtrip") {
			doRoundTrip = true;
		} else if (arg == "--save") {
			saveFile = true;
		} else {
			format = arg;
		}
	}

	std::cout << "=== AssimpJS Export/Reimport Test ===" << std::endl;
	std::cout << "Input: " << inputFile << std::endl;
	std::cout << "Format: " << format << std::endl;

	// Step 1: Import source file
	FileList fileList;
	File file = GetFile(inputFile);
	if (file.content.empty()) {
		std::cerr << "ERROR: Could not read input file: " << inputFile << std::endl;
		return 1;
	}
	fileList.AddFile(file.path, file.content);

	std::cout << "\n--- Step 1: Export to " << format << " ---" << std::endl;
	Result exportResult = ConvertFileList(fileList, format);

	if (!exportResult.IsSuccess()) {
		std::cerr << "EXPORT FAILED with error code: " << exportResult.GetErrorCode() << std::endl;
		return 1;
	}

	std::cout << "Export succeeded! Files:" << std::endl;
	for (size_t i = 0; i < exportResult.FileCount(); i++) {
		const File& outFile = exportResult.GetFile(i);
		std::cout << "  [" << i << "] " << outFile.path << " (" << outFile.content.size() << " bytes)" << std::endl;

		if (saveFile) {
			std::string outPath = "output_" + outFile.path;
			std::ofstream ofs(outPath, std::ios::binary);
			ofs.write(reinterpret_cast<const char*>(outFile.content.data()), outFile.content.size());
			std::cout << "       Saved to: " << outPath << std::endl;
		}
	}

	if (!doRoundTrip) {
		std::cout << "\nDone (no round-trip requested)." << std::endl;
		return 0;
	}

	// Step 2: Re-import the exported file
	std::cout << "\n--- Step 2: Re-import " << format << " ---" << std::endl;

	const File& exportedFile = exportResult.GetFile(0);

	std::cout << "Re-importing: " << exportedFile.path << " (" << exportedFile.content.size() << " bytes)" << std::endl;

	// Use Assimp directly for better error diagnostics
	Assimp::Importer reimporter;
	reimporter.SetIOHandler(new FileListIOSystemReadAdapter(exportResult.fileList));

	const aiScene* reimportedScene = nullptr;
	try {
		reimportedScene = reimporter.ReadFile(exportedFile.path,
			aiProcess_Triangulate |
			aiProcess_GenUVCoords |
			aiProcess_JoinIdenticalVertices |
			aiProcess_SortByPType);
	} catch (const std::exception& e) {
		std::cerr << "RE-IMPORT EXCEPTION: " << e.what() << std::endl;
		return 1;
	} catch (...) {
		std::cerr << "RE-IMPORT: Unknown exception!" << std::endl;
		return 1;
	}

	if (!reimportedScene) {
		std::cerr << "RE-IMPORT FAILED: " << reimporter.GetErrorString() << std::endl;
		return 1;
	}

	std::cout << "Re-import succeeded!" << std::endl;
	std::cout << "  Meshes: " << reimportedScene->mNumMeshes << std::endl;
	std::cout << "  Materials: " << reimportedScene->mNumMaterials << std::endl;
	std::cout << "  Textures: " << reimportedScene->mNumTextures << std::endl;
	std::cout << "  Animations: " << reimportedScene->mNumAnimations << std::endl;
	std::cout << "  Cameras: " << reimportedScene->mNumCameras << std::endl;
	std::cout << "  Lights: " << reimportedScene->mNumLights << std::endl;

	// Dump material properties for validation
	int failures = 0;
	for (unsigned int mi = 0; mi < reimportedScene->mNumMaterials; ++mi) {
		const aiMaterial* rmat = reimportedScene->mMaterials[mi];
		aiString name;
		rmat->Get(AI_MATKEY_NAME, name);
		std::cout << "\n  Material[" << mi << "]: " << name.C_Str() << std::endl;

		float metallic = -1;
		if (rmat->Get(AI_MATKEY_METALLIC_FACTOR, metallic) == AI_SUCCESS) {
			std::cout << "    metallic = " << metallic << std::endl;
		} else {
			std::cout << "    metallic = MISSING" << std::endl;
			++failures;
		}

		float roughness = -1;
		if (rmat->Get(AI_MATKEY_ROUGHNESS_FACTOR, roughness) == AI_SUCCESS) {
			std::cout << "    roughness = " << roughness << std::endl;
		} else {
			std::cout << "    roughness = MISSING" << std::endl;
			++failures;
		}

		float opacity = -1;
		if (rmat->Get(AI_MATKEY_OPACITY, opacity) == AI_SUCCESS) {
			std::cout << "    opacity = " << opacity << std::endl;
		} else {
			std::cout << "    opacity = MISSING" << std::endl;
		}

		float ior = -1;
		if (rmat->Get(AI_MATKEY_REFRACTI, ior) == AI_SUCCESS) {
			std::cout << "    ior = " << ior << std::endl;
		} else {
			std::cout << "    ior = MISSING" << std::endl;
		}

		float clearcoat = -1;
		if (rmat->Get(AI_MATKEY_CLEARCOAT_FACTOR, clearcoat) == AI_SUCCESS) {
			std::cout << "    clearcoat = " << clearcoat << std::endl;
		}

		float clearcoatRoughness = -1;
		if (rmat->Get(AI_MATKEY_CLEARCOAT_ROUGHNESS_FACTOR, clearcoatRoughness) == AI_SUCCESS) {
			std::cout << "    clearcoatRoughness = " << clearcoatRoughness << std::endl;
		}

		aiString alphaMode;
		if (rmat->Get(AI_MATKEY_GLTF_ALPHAMODE, alphaMode) == AI_SUCCESS) {
			std::cout << "    alphaMode = " << alphaMode.C_Str() << std::endl;
		}

		float alphaCutoff = -1;
		if (rmat->Get(AI_MATKEY_GLTF_ALPHACUTOFF, alphaCutoff) == AI_SUCCESS) {
			std::cout << "    alphaCutoff = " << alphaCutoff << std::endl;
		}

		aiColor3D diffuse;
		if (rmat->Get(AI_MATKEY_COLOR_DIFFUSE, diffuse) == AI_SUCCESS) {
			std::cout << "    diffuseColor = (" << diffuse.r << ", " << diffuse.g << ", " << diffuse.b << ")" << std::endl;
		}

		aiColor3D emissive;
		if (rmat->Get(AI_MATKEY_COLOR_EMISSIVE, emissive) == AI_SUCCESS) {
			std::cout << "    emissiveColor = (" << emissive.r << ", " << emissive.g << ", " << emissive.b << ")" << std::endl;
		}

		aiColor4D baseColor;
		if (rmat->Get(AI_MATKEY_BASE_COLOR, baseColor) == AI_SUCCESS) {
			std::cout << "    baseColor = (" << baseColor.r << ", " << baseColor.g << ", " << baseColor.b << ", " << baseColor.a << ")" << std::endl;
		}

		unsigned int texCount;
		texCount = rmat->GetTextureCount(aiTextureType_DIFFUSE);
		if (texCount > 0) std::cout << "    textures[DIFFUSE] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_NORMALS);
		if (texCount > 0) std::cout << "    textures[NORMALS] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_EMISSIVE);
		if (texCount > 0) std::cout << "    textures[EMISSIVE] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_METALNESS);
		if (texCount > 0) std::cout << "    textures[METALNESS] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_DIFFUSE_ROUGHNESS);
		if (texCount > 0) std::cout << "    textures[ROUGHNESS] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_LIGHTMAP);
		if (texCount > 0) std::cout << "    textures[OCCLUSION] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_CLEARCOAT);
		if (texCount > 0) std::cout << "    textures[CLEARCOAT] = " << texCount << std::endl;
		texCount = rmat->GetTextureCount(aiTextureType_BASE_COLOR);
		if (texCount > 0) std::cout << "    textures[BASE_COLOR] = " << texCount << std::endl;
	}

	if (failures > 0) {
		std::cerr << "\nWARNING: " << failures << " material property(ies) missing after round-trip!" << std::endl;
	}

	// Step 3: Try converting the re-imported scene to assjson for full validation
	std::cout << "\n--- Step 3: Convert re-imported scene to assjson ---" << std::endl;

	FileList reimportFileList;
	reimportFileList.AddFile(exportedFile.path, exportedFile.content);
	Result jsonResult = ConvertFileList(reimportFileList, "assjson");

	if (!jsonResult.IsSuccess()) {
		std::cerr << "ASSJSON CONVERSION FAILED: " << jsonResult.GetErrorCode() << std::endl;
		return 1;
	}

	const File& jsonFile = jsonResult.GetFile(0);
	std::cout << "assjson conversion succeeded (" << jsonFile.content.size() << " bytes)" << std::endl;

	std::cout << "\n=== ROUND-TRIP SUCCESS ===" << std::endl;
	return (failures > 0) ? 1 : 0;
}
