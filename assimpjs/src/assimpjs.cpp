#include "assimpjs.hpp"

#include <assimp/Importer.hpp>
#include <assimp/Exporter.hpp>
#include <assimp/scene.h>
#include <assimp/postprocess.h>

#include <stdio.h>
#include <iostream>

static const aiScene* ImportFileListByMainFile (Assimp::Importer& importer, const File& file)
{
	try {
		const aiScene* scene = importer.ReadFile (file.path,
			aiProcess_Triangulate |
			aiProcess_GenUVCoords |
			aiProcess_JoinIdenticalVertices |
			aiProcess_SortByPType);
		if (scene == nullptr) {
			fprintf(stderr, "[assimpjs] ReadFile returned null: %s\n", importer.GetErrorString());
		}
		return scene;
	} catch (const std::exception& e) {
		fprintf(stderr, "[assimpjs] ReadFile exception: %s\n", e.what());
		return nullptr;
	} catch (...) {
		fprintf(stderr, "[assimpjs] ReadFile unknown exception caught\n");
		return nullptr;
	}
	return nullptr;
}

static std::string GetFileNameFromFormat (const std::string& format)
{
	std::string fileName = "result";
	if (format == "assjson") {
		fileName += ".json";
	} else if (format == "gltf" || format == "gltf2") {
		fileName += ".gltf";
	} else if (format == "glb" || format == "glb2") {
		fileName += ".glb";
	} else if (format == "obj") {
		fileName += ".obj";
	} else if (format == "ply") {
		fileName += ".ply";
	} else if (format == "stl") {
		fileName += ".stl";
	} else if (format == "fbx") {
		fileName += ".fbx";
	} else if (format == "dae") {
		fileName += ".dae";
	} else if (format == "x") {
		fileName += ".x";
	} else if (format == "x3d") {
		fileName += ".x3d";
	} else if (format == "3mf") {
		fileName += ".3mf";
	} else if (format == "3ds") {
		fileName += ".3ds";
	} else if (format == "stp" || format == "step") {
		fileName += ".stp";
	} else if (format == "m3d") {
		fileName += ".m3d";
	} else if (format == "ogex") {
		fileName += ".ogex";
	} else if (format == "assbin") {
		fileName += ".assbin";
	} else if (format == "assxml") {
		fileName += ".assxml";
	} else if (format == "usda") {
		fileName += ".usda";
	} else if (format == "usdc") {
		fileName += ".usdc";
	} else if (format == "usdz") {
		fileName += ".usdz";
	}
	return fileName;
}

static bool ExportScene (const aiScene* scene, const std::string& format, Result& result)
{
	if (scene == nullptr) {
		result.errorCode = ErrorCode::ImportError;
		return false;
	}

	Assimp::Exporter exporter;
	FileListIOSystemWriteAdapter* exportIOSystem = new FileListIOSystemWriteAdapter (result.fileList);
	exporter.SetIOHandler (exportIOSystem);

	Assimp::ExportProperties exportProperties;
	exportProperties.SetPropertyBool ("JSON_SKIP_WHITESPACES", true);
	std::string fileName = GetFileNameFromFormat (format);
	
	// Map dae format to collada for Assimp's internal format identifier
	std::string assimpFormat = format;
	if (format == "dae") {
		assimpFormat = "collada";
	}
	
	aiReturn exportResult = exporter.Export (scene, assimpFormat.c_str (), fileName.c_str (), 0u, &exportProperties);
	if (exportResult != aiReturn_SUCCESS) {
		fprintf(stderr, "[assimpjs] Export failed: format='%s' file='%s' error='%s'\n",
			assimpFormat.c_str(), fileName.c_str(), exporter.GetErrorString());
		result.errorCode = ErrorCode::ExportError;
		return false;
	}

	result.errorCode = ErrorCode::NoError;
	return true;
}

Result ConvertFile (const File& file, const std::string& format, const FileLoader& loader)
{
	Assimp::Importer importer;
	importer.SetIOHandler (new DelayLoadedIOSystemReadAdapter (file, loader));
	const aiScene* scene = ImportFileListByMainFile (importer, file);

	Result result;
	ExportScene (scene, format, result);
	return result;
}

Result ConvertFileList (const FileList& fileList, const std::string& format)
{
	if (fileList.FileCount () == 0) {
		return Result (ErrorCode::NoFilesFound);
	}

	Assimp::Importer importer;
	importer.SetIOHandler (new FileListIOSystemReadAdapter (fileList));

	const aiScene* scene = nullptr;
	for (size_t fileIndex = 0; fileIndex < fileList.FileCount (); fileIndex++) {
		const File& file = fileList.GetFile (fileIndex);
		scene = ImportFileListByMainFile (importer, file);
		if (scene != nullptr) {
			break;
		}
	}

	Result result;
	ExportScene (scene, format, result);
	return result;
}

#ifdef EMSCRIPTEN

static void ApplyJsOptionsToExportProperties (const emscripten::val& options, Assimp::ExportProperties& exportProperties)
{
	if (options.isUndefined () || options.isNull ()) {
		return;
	}

	auto keys = emscripten::val::global ("Object").call<emscripten::val> ("keys", options);
	auto length = keys["length"].as<unsigned> ();
	auto jsNumber = emscripten::val::global ("Number");

	for (unsigned i = 0; i < length; i++) {
		auto key = keys[i].as<std::string> ();
		auto value = options[key];

		if (value.isTrue () || value.isFalse ()) {
			exportProperties.SetPropertyBool (key.c_str (), value.as<bool> ());
		} else if (value.isNumber ()) {
			if (jsNumber.call<bool> ("isInteger", value)) {
				exportProperties.SetPropertyInteger (key.c_str (), value.as<int> ());
			} else {
				exportProperties.SetPropertyFloat (key.c_str (), value.as<float> ());
			}
		} else if (value.isString ()) {
			exportProperties.SetPropertyString (key.c_str (), value.as<std::string> ());
		}
	}
}

static bool ExportSceneWithOptions (const aiScene* scene, const std::string& format,
	const emscripten::val& options, Result& result)
{
	if (scene == nullptr) {
		result.errorCode = ErrorCode::ImportError;
		return false;
	}

	Assimp::Exporter exporter;
	FileListIOSystemWriteAdapter* exportIOSystem = new FileListIOSystemWriteAdapter (result.fileList);
	exporter.SetIOHandler (exportIOSystem);

	Assimp::ExportProperties exportProperties;
	exportProperties.SetPropertyBool ("JSON_SKIP_WHITESPACES", true);

	ApplyJsOptionsToExportProperties (options, exportProperties);

	std::string fileName = GetFileNameFromFormat (format);

	std::string assimpFormat = format;
	if (format == "dae") {
		assimpFormat = "collada";
	}

	aiReturn exportResult = exporter.Export (scene, assimpFormat.c_str (), fileName.c_str (), 0u, &exportProperties);
	if (exportResult != aiReturn_SUCCESS) {
		fprintf (stderr, "[assimpjs] Export failed: format='%s' file='%s' error='%s'\n",
			assimpFormat.c_str (), fileName.c_str (), exporter.GetErrorString ());
		result.errorCode = ErrorCode::ExportError;
		return false;
	}

	result.errorCode = ErrorCode::NoError;
	return true;
}

Result ConvertFileListWithOptionsEmscripten (const FileList& fileList, const std::string& format,
	const emscripten::val& options)
{
	if (fileList.FileCount () == 0) {
		return Result (ErrorCode::NoFilesFound);
	}

	Assimp::Importer importer;
	importer.SetIOHandler (new FileListIOSystemReadAdapter (fileList));

	const aiScene* scene = nullptr;
	for (size_t fileIndex = 0; fileIndex < fileList.FileCount (); fileIndex++) {
		const File& file = fileList.GetFile (fileIndex);
		scene = ImportFileListByMainFile (importer, file);
		if (scene != nullptr) {
			break;
		}
	}

	Result result;
	ExportSceneWithOptions (scene, format, options, result);
	return result;
}

class FileLoaderEmscripten : public FileLoader
{
public:
	FileLoaderEmscripten (const emscripten::val& existsFunc, const emscripten::val& loadFunc) :
		existsFunc (existsFunc),
		loadFunc (loadFunc)
	{
	}

	virtual bool Exists (const char* pFile) const override
	{
		if (existsFunc.isUndefined () || existsFunc.isNull ()) {
			return false;
		}
		std::string fileName = GetFileName (pFile);
		emscripten::val exists = existsFunc (fileName);
		return exists.as<bool> ();
	}

	virtual Buffer Load (const char* pFile) const override
	{
		if (loadFunc.isUndefined () || loadFunc.isNull ()) {
			return {};
		}
		std::string fileName = GetFileName (pFile);
		emscripten::val fileBuffer = loadFunc (fileName);
		return emscripten::vecFromJSArray<std::uint8_t> (fileBuffer);
	}

private:
	const emscripten::val& existsFunc;
	const emscripten::val& loadFunc;
};

Result ConvertFileEmscripten (
	const std::string& name,
	const std::string& format,
	const emscripten::val& content,
	const emscripten::val& existsFunc,
	const emscripten::val& loadFunc)
{
	Buffer buffer = emscripten::vecFromJSArray<std::uint8_t> (content);
	File file (name, buffer);
	FileLoaderEmscripten loader (existsFunc, loadFunc);
	return ConvertFile (file, format, loader);
}

Result ConvertFileWithOptionsEmscripten (
	const std::string& name,
	const std::string& format,
	const emscripten::val& content,
	const emscripten::val& existsFunc,
	const emscripten::val& loadFunc,
	const emscripten::val& options)
{
	Buffer buffer = emscripten::vecFromJSArray<std::uint8_t> (content);
	File file (name, buffer);
	FileLoaderEmscripten loader (existsFunc, loadFunc);

	Assimp::Importer importer;
	importer.SetIOHandler (new DelayLoadedIOSystemReadAdapter (file, loader));
	const aiScene* scene = ImportFileListByMainFile (importer, file);

	Result result;
	ExportSceneWithOptions (scene, format, options, result);
	return result;
}

EMSCRIPTEN_BINDINGS (assimpjs)
{
	emscripten::class_<File> ("File")
		.constructor<> ()
		.function ("GetPath", &File::GetPath)
		.function ("GetContent", &File::GetContentEmscripten)
	;

	emscripten::class_<FileList> ("FileList")
		.constructor<> ()
		.function ("AddFile", &FileList::AddFileEmscripten)
	;

	emscripten::class_<Result> ("Result")
		.constructor<> ()
		.function ("IsSuccess", &Result::IsSuccess)
		.function ("GetErrorCode", &Result::GetErrorCode)
		.function ("FileCount", &Result::FileCount)
		.function ("GetFile", &Result::GetFile)
	;

	emscripten::function<Result, const std::string&, const std::string&, const emscripten::val&, const emscripten::val&, const emscripten::val&> ("ConvertFile", &ConvertFileEmscripten);
	emscripten::function<Result, const std::string&, const std::string&, const emscripten::val&, const emscripten::val&, const emscripten::val&, const emscripten::val&> ("ConvertFile", &ConvertFileWithOptionsEmscripten);

	emscripten::function<Result, const FileList&, const std::string&> ("ConvertFileList", &ConvertFileList);
	emscripten::function<Result, const FileList&, const std::string&, const emscripten::val&> ("ConvertFileList", &ConvertFileListWithOptionsEmscripten);
}

#endif
