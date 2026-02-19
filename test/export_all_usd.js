#!/usr/bin/env node

/**
 * End-to-end USD export script.
 * Loads every glTF/GLB test model and exports each to both USDA and USDZ formats.
 * Writes output files to an output/ directory and reports results.
 *
 * Usage:
 *   node test/export_all_usd.js
 *   node test/export_all_usd.js --roundtrip   (also re-imports each exported USD file)
 */

const fs = require('fs');
const path = require('path');

const doRoundTrip = process.argv.includes('--roundtrip');

const config = process.env.TEST_CONFIG || 'Release';

// Try to load the exporter build first, then fall back to all build
let assimpjs = null;
let buildName = '';

const exporterPath = path.join(__dirname, `../build_wasm_exporter/${config}Exporter/assimpjs-exporter.js`);
const allPath = path.join(__dirname, `../build_wasm_all/${config}All/assimpjs-all.js`);

if (fs.existsSync(exporterPath)) {
	assimpjs = require(exporterPath);
	buildName = 'exporter';
} else if (fs.existsSync(allPath)) {
	assimpjs = require(allPath);
	buildName = 'all';
} else {
	console.error('No assimpjs build found. Build with ReleaseExporter or ReleaseAll first.');
	process.exit(1);
}

const testModelsDir = path.join(__dirname, '../assimp/test/models');

const TEST_MODELS = [
	// Basic geometry
	'glTF2/BoxTextured-glTF-Binary/BoxTextured.glb',
	'glTF2/2CylinderEngine-glTF-Binary/2CylinderEngine.glb',
	'glTF2/BoxBadNormals-glTF-Binary/BoxBadNormals.glb',
	'glTF2/BoxWithInfinites-glTF-Binary/BoxWithInfinites.glb',

	// Skinning
	'glTF2/simple_skin/quad_skin.glb',
	'glTF2/simple_skin/simple_skin.gltf',

	// Morph targets / blend shapes
	'glTF2/AnimatedMorphCube/glTF/AnimatedMorphCube.gltf',
	'glTF2/SimpleMorph/glTF/SimpleMorph.gltf',

	// Cameras
	'glTF2/cameras/Cameras.gltf',

	// Materials
	'glTF2/ClearCoat-glTF/ClearCoatTest.gltf',

	// Complex PBR
	'glTF2/PBR/damaged-helmet.glb',

	// Texture transforms
	'glTF2/textureTransform/TextureTransformTest.gltf',

	// Skeletal animation
	'glTF2/CesiumMan/CesiumMan.glb',

	// Primitive modes
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_00.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_01.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_02.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_03.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_04.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_05.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_06.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_07.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_08.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_09.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_10.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_11.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_12.gltf',
	'glTF2/glTF-Asset-Generator/Mesh_PrimitiveMode/Mesh_PrimitiveMode_13.gltf',
];

const EXPORT_FORMATS = ['usda', 'usdz'];

function loadFileList(ajs, modelPath) {
	const fullPath = path.join(testModelsDir, modelPath);
	if (!fs.existsSync(fullPath)) return null;

	const fileList = new ajs.FileList();
	fileList.AddFile(fullPath, fs.readFileSync(fullPath));

	// For glTF (non-binary), also load referenced files in the same directory
	if (modelPath.endsWith('.gltf')) {
		const dir = path.dirname(fullPath);
		const files = fs.readdirSync(dir);
		for (const f of files) {
			if (f === path.basename(fullPath)) continue;
			const refPath = path.join(dir, f);
			if (fs.statSync(refPath).isFile()) {
				fileList.AddFile(refPath, fs.readFileSync(refPath));
			}
		}
	}
	return fileList;
}

function exportModel(ajs, modelPath, format) {
	const fileList = loadFileList(ajs, modelPath);
	if (!fileList) return { success: false, error: 'File not found' };

	try {
		const result = ajs.ConvertFileList(fileList, format);
		if (!result.IsSuccess()) {
			return { success: false, error: `Export failed (error code: ${result.GetErrorCode()})` };
		}

		const files = [];
		for (let i = 0; i < result.FileCount(); i++) {
			const file = result.GetFile(i);
			files.push({
				path: file.GetPath(),
				content: file.GetContent()
			});
		}

		if (files.length === 0) {
			return { success: false, error: 'No output files generated' };
		}

		return { success: true, files };
	} catch (e) {
		return { success: false, error: e.message };
	}
}

async function main() {
	console.log(`Loading assimpjs (${buildName} build)...`);
	const ajs = await assimpjs();
	console.log('AssimpJS loaded.\n');

	const outputDir = path.join(__dirname, '../output/usd');

	if (fs.existsSync(outputDir)) {
		fs.rmSync(outputDir, { recursive: true, force: true });
	}
	fs.mkdirSync(outputDir, { recursive: true });

	let totalTests = 0;
	let passed = 0;
	let failed = 0;
	const failures = [];

	for (const modelPath of TEST_MODELS) {
		const modelName = path.basename(modelPath, path.extname(modelPath));

		for (const format of EXPORT_FORMATS) {
			totalTests++;
			const label = `${modelName} -> ${format}`;

			const result = exportModel(ajs, modelPath, format);
			if (!result.success) {
				console.log(`  FAIL  ${label}: ${result.error}`);
				failed++;
				failures.push(label);
				continue;
			}

			const outFilename = `${modelName}.${format}`;
			const outPath = path.join(outputDir, outFilename);

			const mainFile = result.files[0];
			fs.writeFileSync(outPath, mainFile.content);

			const sizeKB = (mainFile.content.length / 1024).toFixed(1);
			console.log(`  OK    ${label} (${sizeKB} KB)`);
			passed++;

			if (doRoundTrip && format === 'usda') {
				const rtFileList = new ajs.FileList();
				rtFileList.AddFile(outPath, fs.readFileSync(outPath));

				try {
					const rtResult = ajs.ConvertFileList(rtFileList, 'assjson');
					if (rtResult.IsSuccess() && rtResult.FileCount() > 0) {
						const jsonFile = rtResult.GetFile(0);
						const jsonStr = new TextDecoder().decode(jsonFile.GetContent());
						const scene = JSON.parse(jsonStr);
						const meshCount = scene.meshes ? scene.meshes.length : 0;
						console.log(`  RT    ${label} -> re-import OK (${meshCount} meshes)`);
					} else {
						console.log(`  RT    ${label} -> re-import FAILED`);
					}
				} catch (e) {
					console.log(`  RT    ${label} -> re-import ERROR: ${e.message}`);
				}
			}
		}
	}

	console.log('\n' + '='.repeat(60));
	console.log(`Results: ${passed}/${totalTests} passed, ${failed} failed`);
	if (failures.length > 0) {
		console.log('\nFailed exports:');
		for (const f of failures) {
			console.log(`  - ${f}`);
		}
	}
	console.log(`\nOutput written to: ${outputDir}`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
	console.error('Fatal error:', e);
	process.exit(1);
});
