#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function main() {
  const exporterPath = path.join(__dirname, '../dist/assimpjs-exporter.js');
  const allPath = path.join(__dirname, '../dist/assimpjs-all.js');

  console.log('Loading WASM modules...');
  const ajsExporter = await require(exporterPath)();
  const ajsAll = await require(allPath)();

  const helmetPath = path.join(__dirname, '../assimp/test/models/glTF2/DamagedHelmet.glb');
  if (!fs.existsSync(helmetPath)) {
    console.error('DamagedHelmet.glb not found at:', helmetPath);
    process.exit(1);
  }
  const helmetData = fs.readFileSync(helmetPath);
  console.log(`Loaded DamagedHelmet.glb (${helmetData.length} bytes)`);

  // Export GLB -> USDZ
  console.log('\n--- Export GLB -> USDZ ---');
  let exportFileList = new ajsExporter.FileList();
  exportFileList.AddFile('DamagedHelmet.glb', helmetData);
  const exportResult = ajsExporter.ConvertFileList(exportFileList, 'usdz');
  if (!exportResult.IsSuccess()) {
    console.error('Export FAILED:', exportResult.GetErrorCode());
    process.exit(1);
  }
  const usdzFile = exportResult.GetFile(0);
  const usdzContent = usdzFile.GetContent();
  console.log(`Export succeeded: ${usdzFile.GetPath()} (${usdzContent.length} bytes)`);

  // Re-import USDZ -> assjson
  console.log('\n--- Re-import USDZ -> assjson ---');
  let importFileList = new ajsAll.FileList();
  importFileList.AddFile(usdzFile.GetPath(), usdzContent);

  const reimportResult = ajsAll.ConvertFileList(importFileList, 'assjson');
  if (!reimportResult.IsSuccess()) {
    console.error('Re-import FAILED:', reimportResult.GetErrorCode());
    process.exit(1);
  }

  const jsonFile = reimportResult.GetFile(0);
  const jsonStr = new TextDecoder().decode(jsonFile.GetContent());
  const scene = JSON.parse(jsonStr);

  console.log('Re-import succeeded!');
  console.log(`  Meshes: ${scene.meshes ? scene.meshes.length : 0}`);
  console.log(`  Materials: ${scene.materials ? scene.materials.length : 0}`);
  console.log(`  Textures: ${scene.textures ? scene.textures.length : 0}`);

  // Validate material properties
  let failures = 0;
  if (scene.materials && scene.materials.length > 0) {
    const mat = scene.materials[0];
    const props = mat.properties || [];
    const propMap = {};
    for (const p of props) {
      propMap[p.key] = p.value;
    }

    console.log('\n  Material properties:');
    const check = (key, label) => {
      if (key in propMap) {
        console.log(`    ${label} = ${JSON.stringify(propMap[key])}`);
        return true;
      }
      console.log(`    ${label} = MISSING`);
      failures++;
      return false;
    };

    check('$mat.metallicFactor', 'metallic');
    check('$mat.roughnessFactor', 'roughness');
    check('$mat.opacity', 'opacity');
    check('$mat.refracti', 'ior');
    check('$clr.diffuse', 'diffuseColor');
    check('$clr.emissive', 'emissiveColor');
    check('$clr.base', 'baseColor');
  }

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} material property(ies) missing!`);
    process.exit(1);
  }

  // Re-import USDZ -> GLB (for converter pipeline)
  console.log('\n--- Re-import USDZ -> GLB ---');
  let glbImportList = new ajsAll.FileList();
  glbImportList.AddFile(usdzFile.GetPath(), usdzContent);
  const glbResult = ajsAll.ConvertFileList(glbImportList, 'glb2');
  if (!glbResult.IsSuccess()) {
    console.error('GLB conversion FAILED:', glbResult.GetErrorCode());
    process.exit(1);
  }
  const glbFile = glbResult.GetFile(0);
  console.log(`GLB conversion succeeded: ${glbFile.GetPath()} (${glbFile.GetContent().length} bytes)`);

  console.log('\n=== ALL TESTS PASSED ===');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
