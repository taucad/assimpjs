var fs = require ('fs');
var path = require ('path');
var assert = require ('assert');

var config = 'Release'
if (process.env.TEST_CONFIG !== undefined) {
	config = process.env.TEST_CONFIG;
}
var assimpjs = require ('../build_wasm/' + config + '/assimpjs.js')();

var ajs = null;
before (async function () {
	if (ajs !== null) {
		return;
	}
	ajs = await assimpjs;
});

function GetTestFileLocation (fileName)
{
	return path.join (__dirname, '../assimp/test/models/' + fileName);
}

function LoadModel (files)
{
	let fileList = new ajs.FileList ();
	for (let i = 0; i < files.length; i++) {
		let filePath = GetTestFileLocation (files[i]);
		fileList.AddFile (filePath, fs.readFileSync (filePath))
	}
	return ajs.ConvertFileList (fileList, 'assjson');
}

function IsError (files)
{
	let result = LoadModel (files);
	return !result.IsSuccess ();
}

function IsSuccess (files)
{
	let result = LoadModel (files);
	return result.IsSuccess ();
}

describe ('Importer', function () {

it ('Empty file list', function () {
	assert (IsError ([]));
});

it ('Not importable file', function () {
	assert (IsError (['3DS/test.png']));
});

it ('Independent order', function () {
	assert (IsSuccess (['OBJ/cube_usemtl.obj', 'OBJ/cube_usemtl.mtl']));
	assert (IsSuccess (['OBJ/cube_usemtl.mtl', 'OBJ/cube_usemtl.obj']));
});

it ('Delay load', function () {
	let result = ajs.ConvertFile (
		'OBJ/cube_usemtl.obj',
		'assjson',
		fs.readFileSync (GetTestFileLocation ('OBJ/cube_usemtl.obj')),
		function (fileName) {
			return fs.existsSync (GetTestFileLocation ('OBJ/' + fileName));
		},
		function (fileName) {
			return fs.readFileSync (GetTestFileLocation ('OBJ/' + fileName));
		}
	);
	assert (result.IsSuccess ());
	assert (result.FileCount () == 1);
	let jsonFile = result.GetFile (0);
	let jsonString = new TextDecoder ().decode (jsonFile.GetContent ());
	let scene = JSON.parse (jsonString);
	assert.deepStrictEqual (scene.materials[1].properties[4].value, [1, 1, 1]);
});

it ('glTF export', function () {
	let files = ['OBJ/cube_usemtl.obj', 'OBJ/cube_usemtl.mtl'];
	let fileList = new ajs.FileList ();
	for (let i = 0; i < files.length; i++) {
		let filePath = GetTestFileLocation (files[i]);
		fileList.AddFile (filePath, fs.readFileSync (filePath))
	}
	{
		let result = ajs.ConvertFileList (fileList, 'gltf2');
		assert (result.IsSuccess ());
		assert.equal (result.FileCount (), 2);
		assert.equal (result.GetFile (0).GetPath (), 'result.gltf');
		assert.equal (result.GetFile (1).GetPath (), 'result.bin');
	}
	{
		let result = ajs.ConvertFileList (fileList, 'glb2');
		assert (result.IsSuccess ());
		assert.equal (result.FileCount (), 1);
		assert.equal (result.GetFile (0).GetPath (), 'result.glb');
	}
});

it ('3D', function () {
	assert (IsSuccess (['3D/box.uc', '3D/box_a.3d', '3D/box_d.3d']));
});

it ('3DS', function () {
	assert (IsSuccess (['3DS/test1.3ds']));
	assert (IsSuccess (['3DS/fels.3ds']));
	assert (IsSuccess (['3DS/cubes_with_alpha.3DS']));
	assert (IsSuccess (['3DS/cube_with_specular_texture.3DS']));
	assert (IsSuccess (['3DS/cube_with_diffuse_texture.3DS']));
	assert (IsSuccess (['3DS/RotatingCube.3DS']));
	assert (IsSuccess (['3DS/CameraRollAnim.3ds']));
	assert (IsSuccess (['3DS/CameraRollAnimWithChildObject.3ds']));
	assert (IsSuccess (['3DS/TargetCameraAnim.3ds']));
});

it ('3MF', function () {
	assert (IsSuccess (['3MF/box.3mf']));
});

it ('AC', function () {
	assert (IsSuccess (['AC/SphereWithLight.ac']));
	assert (IsSuccess (['AC/SphereWithLight_UTF8BOM.ac']));
	// assert (IsSuccess (['AC/SphereWithLight_UTF16LE.ac'])); // DEBUG THIS
	assert (IsSuccess (['AC/SphereWithLightUvScaling4X.ac']));
	assert (IsSuccess (['AC/SphereWithLight.acc']));
	assert (IsSuccess (['AC/Wuson.ac']));
	assert (IsSuccess (['AC/Wuson.acc']));
	assert (IsSuccess (['AC/sample_subdiv.ac']));
	assert (IsSuccess (['AC/closedLine.ac']));
	assert (IsSuccess (['AC/doubleSidedFace.ac']));
	assert (IsSuccess (['AC/openLine.ac']));
	assert (IsSuccess (['AC/nosurfaces.ac']));
});

it ('AMF', function () {
	assert (IsSuccess (['AMF/test_with_mat.amf']));
	assert (IsSuccess (['AMF/test1.amf']));
	assert (IsSuccess (['AMF/test2.amf']));
	assert (IsSuccess (['AMF/test3.amf']));
	assert (IsSuccess (['AMF/test4.amf']));
	assert (IsSuccess (['AMF/test5.amf']));
	assert (IsSuccess (['AMF/test5a.amf']));
	assert (IsSuccess (['AMF/test6.amf']));
	assert (IsSuccess (['AMF/test7.amf']));
	assert (IsSuccess (['AMF/test8.amf']));
	assert (IsSuccess (['AMF/test9.amf']));
});

it ('ASE', function () {
	assert (IsSuccess (['ASE/ThreeCubesGreen.ASE']));
	assert (IsSuccess (['ASE/ThreeCubesGreen_UTF16BE.ASE']));
	assert (IsSuccess (['ASE/ThreeCubesGreen_UTF16LE.ASE']));
	assert (IsSuccess (['ASE/RotatingCube.ASE']));
	assert (IsSuccess (['ASE/CameraRollAnim.ase']));
	assert (IsSuccess (['ASE/CameraRollAnimWithChildObject.ase']));
	assert (IsSuccess (['ASE/TargetCameraAnim.ase']));
	assert (IsSuccess (['ASE/MotionCaptureROM.ase']));
	assert (IsSuccess (['ASE/anim.ASE']));
	assert (IsSuccess (['ASE/anim2.ASE']));
	assert (IsSuccess (['ASE/TestUVTransform/UVTransform_Normal.ASE']));
	assert (IsSuccess (['ASE/TestUVTransform/UVTransform_ScaleUV2x.ASE']));
	assert (IsSuccess (['ASE/TestUVTransform/UVTransform_ScaleUV2x_Rotate45.ASE']));
	assert (IsSuccess (['ASE/TestUVTransform/UVTransform_ScaleUV1-2_OffsetUV0-0.9_Rotate-72_mirrorU.ase']));
});

it ('B3D', function () {
	assert (IsSuccess (['B3D/WusonBlitz.b3d']));
});

it ('BLEND', function () {
	assert (IsSuccess (['BLEND/box.blend']));
	assert (IsSuccess (['BLEND/AreaLight_269.blend']));
	assert (IsSuccess (['BLEND/BlenderDefault_248.blend']));
	assert (IsSuccess (['BLEND/BlenderDefault_250.blend']));
	assert (IsSuccess (['BLEND/BlenderDefault_250_Compressed.blend']));
	// assert (IsSuccess (['BLEND/BlenderDefault_262.blend'])); // DEBUG THIS
	assert (IsSuccess (['BLEND/BlenderDefault_269.blend']));
	assert (IsSuccess (['BLEND/BlenderDefault_271.blend']));
	assert (IsSuccess (['BLEND/BlenderDefault_276.blend']));
	assert (IsSuccess (['BLEND/BlenderMaterial_269.blend']));
	assert (IsSuccess (['BLEND/4Cubes4Mats_248.blend']));
	assert (IsSuccess (['BLEND/CubeHierarchy_248.blend']));
	assert (IsSuccess (['BLEND/MirroredCube_252.blend']));
	assert (IsSuccess (['BLEND/Suzanne_248.blend']));
	assert (IsSuccess (['BLEND/SuzanneSubdiv_252.blend']));
	assert (IsSuccess (['BLEND/SmoothVsSolidCube_248.blend']));
	assert (IsSuccess (['BLEND/TexturedCube_ImageGlob_248.blend']));
	assert (IsSuccess (['BLEND/TexturedPlane_ImageUv_248.blend']));
	assert (IsSuccess (['BLEND/TexturedPlane_ImageUvPacked_248.blend']));
	assert (IsSuccess (['BLEND/TorusLightsCams_250_compressed.blend']));
	assert (IsSuccess (['BLEND/test_279.blend']));
	assert (IsSuccess (['BLEND/plane_2_textures_2_texcoords_279.blend']));
	assert (IsSuccess (['BLEND/NoisyTexturedCube_VoronoiGlob_248.blend']));
	assert (IsSuccess (['BLEND/blender_269_regress1.blend']));
	assert (IsSuccess (['BLEND/HUMAN.blend']));
	assert (IsSuccess (['BLEND/yxa_1.blend']));
});

it ('BVH', function () {
	assert (IsSuccess (['BVH/Boxing_Toes.bvh']));
	assert (IsSuccess (['BVH/01_01.bvh']));
	assert (IsSuccess (['BVH/01_03.bvh']));
});

it ('COB', function () {
	assert (IsSuccess (['COB/molecule.cob']));
	assert (IsSuccess (['COB/molecule_ascii.cob']));
	assert (IsSuccess (['COB/dwarf.cob']));
	// assert (IsSuccess (['COB/dwarf_ascii.cob'])); // DEBUG THIS
	assert (IsSuccess (['COB/spider_4_3.cob']));
	assert (IsSuccess (['COB/spider_4_3_ascii.cob']));
	assert (IsSuccess (['COB/spider_6_6.cob']));
	assert (IsSuccess (['COB/spider_6_6_ascii.cob']));
});

it ('COLLADA', function () {
	assert (IsSuccess (['Collada/duck.dae']));
	assert (IsSuccess (['Collada/duck.zae']));
	assert (IsSuccess (['Collada/duck_nomanifest.zae']));
	assert (IsSuccess (['Collada/duck_triangulate.dae']));
	assert (IsSuccess (['Collada/COLLADA.dae']));
	assert (IsSuccess (['Collada/COLLADA_triangulate.dae']));
	assert (IsSuccess (['Collada/ConcavePolygon.dae']));
	assert (IsSuccess (['Collada/cube_tristrips.dae']));
	assert (IsSuccess (['Collada/cube_emptyTags.dae']));
	assert (IsSuccess (['Collada/cube_triangulate.dae']));
	assert (IsSuccess (['Collada/cube_UTF16LE.dae']));
	assert (IsSuccess (['Collada/cube_UTF8BOM.dae']));
	assert (IsSuccess (['Collada/cube_xmlspecialchars.dae']));
	assert (IsSuccess (['Collada/earthCylindrical.DAE']));
	assert (IsSuccess (['Collada/human.zae']));
	assert (IsSuccess (['Collada/lights.dae']));
	assert (IsSuccess (['Collada/cameras.dae']));
	assert (IsSuccess (['Collada/Cinema4D.dae']));
	assert (IsSuccess (['Collada/sphere.dae']));
	assert (IsSuccess (['Collada/sphere_triangulate.dae']));
	assert (IsSuccess (['Collada/teapots.DAE']));
	assert (IsSuccess (['Collada/teapot_instancenodes.DAE']));
	assert (IsSuccess (['Collada/cube_with_2UVs.DAE']));
	assert (IsSuccess (['Collada/kwxport_test_vcolors.dae']));
	assert (IsSuccess (['Collada/box_nested_animation.dae']));
	// assert (IsSuccess (['Collada/anims_with_full_rotations_between_keys.DAE'])); // DEBUG THIS
	assert (IsSuccess (['Collada/library_animation_clips.dae']));
	assert (IsSuccess (['Collada/regr01.dae']));
});

it ('CSM', function () {
	assert (IsSuccess (['CSM/ThomasFechten.csm']));
});

it ('DXF', function () {
	assert (IsSuccess (['DXF/PinkEggFromLW.dxf']));
	assert (IsSuccess (['DXF/wuson.dxf']));
	assert (IsSuccess (['DXF/lineTest.dxf']));
	assert (IsSuccess (['DXF/issue_2229.dxf']));
});

it ('FBX', function () {
	assert (IsSuccess (['FBX/box.fbx']));
	assert (IsSuccess (['FBX/boxWithCompressedCTypeArray.FBX']));
	assert (IsSuccess (['FBX/boxWithUncompressedCTypeArray.FBX']));
	assert (IsSuccess (['FBX/box_orphant_embedded_texture.fbx']));
	assert (IsSuccess (['FBX/cubes_nonames.fbx']));
	assert (IsSuccess (['FBX/cubes_with_names.fbx']));
	assert (IsSuccess (['FBX/cubes_with_mirroring_and_pivot.fbx']));
	assert (IsSuccess (['FBX/cubes_with_outofrange_float.fbx']));
	assert (IsSuccess (['FBX/global_settings.fbx']));
	assert (IsSuccess (['FBX/spider.fbx']));
	assert (IsSuccess (['FBX/phong_cube.fbx']));
	assert (IsSuccess (['FBX/animation_with_skeleton.fbx']));
	assert (IsSuccess (['FBX/close_to_identity_transforms.fbx']));
	assert (IsSuccess (['FBX/huesitos.fbx']));
	assert (IsSuccess (['FBX/maxPbrMaterial_metalRough.fbx']));
	assert (IsSuccess (['FBX/maxPbrMaterial_specGloss.fbx']));
	// assert (IsSuccess (['FBX/transparentTest.fbx'])); // DEBUG THIS
	assert (IsSuccess (['FBX/embedded_ascii/box.FBX']));
	assert (IsSuccess (['FBX/embedded_ascii/box_embedded_texture_fragmented.fbx']));
});

it ('glTF', function () {
	assert (IsSuccess (['glTF/BoxTextured-glTF/BoxTextured.gltf', 'glTF/BoxTextured-glTF/BoxTextured.bin']));
	assert (IsSuccess (['glTF/BoxTextured-glTF-Embedded/BoxTextured.gltf']));
	assert (IsSuccess (['glTF/BoxTextured-glTF-MaterialsCommon/BoxTextured.gltf', 'glTF/BoxTextured-glTF-MaterialsCommon/BoxTextured.bin']));
	assert (IsSuccess (['glTF/CesiumMilkTruck/CesiumMilkTruck.gltf', 'glTF/CesiumMilkTruck/CesiumMilkTruck.bin']));
	assert (IsSuccess (['glTF/IncorrectVertexArrays/Cube_v1.gltf', 'glTF/IncorrectVertexArrays/Cube.bin']));
	assert (IsSuccess (['glTF/TwoBoxes/TwoBoxes.gltf', 'glTF/TwoBoxes/Box.bin']));
});

it ('glTF2', function () {
	assert (IsSuccess (['glTF2/BoxTextured-glTF/BoxTextured.gltf', 'glTF2/BoxTextured-glTF/BoxTextured0.bin']));
	assert (IsSuccess (['glTF2/BoxTextured-glTF-Binary/BoxTextured.glb']));
	assert (IsSuccess (['glTF2/BoxTextured-glTF-Embedded/BoxTextured.gltf']));
	assert (IsSuccess (['glTF2/BoxTextured-glTF-pbrSpecularGlossiness/BoxTextured.gltf', 'glTF2/BoxTextured-glTF-pbrSpecularGlossiness/BoxTextured0.bin']));
	assert (IsSuccess (['glTF2/BoxTextured-glTF-techniqueWebGL/BoxTextured.gltf', 'glTF2/BoxTextured-glTF-techniqueWebGL/BoxTextured0.bin']));
	assert (IsSuccess (['glTF2/2CylinderEngine-glTF-Binary/2CylinderEngine.glb']));
	assert (IsSuccess (['glTF2/AnimatedMorphCube/glTF/AnimatedMorphCube.gltf', 'glTF2/AnimatedMorphCube/glTF/AnimatedMorphCube.bin']));
	assert (IsSuccess (['glTF2/AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf', 'glTF2/AnimatedMorphSphere/glTF/AnimatedMorphSphere.bin']));
	assert (IsSuccess (['glTF2/BoxTexcoords-glTF/boxTexcoords.gltf', 'glTF2/BoxTexcoords-glTF/boxTexcoords.bin']));
	assert (IsSuccess (['glTF2/cameras/Cameras.gltf', 'glTF2/cameras/simpleSquare.bin']));
	assert (IsSuccess (['glTF2/ClearCoat-glTF/ClearCoatTest.gltf', 'glTF2/ClearCoat-glTF/ClearCoatTest.bin']));
	assert (IsSuccess (['glTF2/IncorrectVertexArrays/Cube.gltf', 'glTF2/IncorrectVertexArrays/Cube.bin']));
	assert (IsSuccess (['glTF2/simple_skin/simple_skin.gltf']));
	assert (IsSuccess (['glTF2/simple_skin/quad_skin.glb']));
	assert (IsSuccess (['glTF2/SimpleMorph/glTF/SimpleMorph.gltf', 'glTF2/SimpleMorph/glTF/simpleMorphGeometry.bin', 'glTF2/SimpleMorph/glTF/simpleMorphAnimation.bin']));
	assert (IsSuccess (['glTF2/MorphPrimitivesTest/glTF/MorphPrimitivesTest.gltf', 'glTF2/MorphPrimitivesTest/glTF/MorphPrimitivesTest.bin']));
	assert (IsSuccess (['glTF2/MorphStressTest/glTF/MorphStressTest.gltf', 'glTF2/MorphStressTest/glTF/MorphStressTest.bin']));
	assert (IsSuccess (['glTF2/textureTransform/TextureTransformTest.gltf', 'glTF2/textureTransform/TextureTransformTest.bin']));

  // Draco is disabled
	assert (IsError (['glTF2/draco/2CylinderEngine.gltf', 'glTF2/draco/2CylinderEngine.bin']));
	assert (IsError (['glTF2/draco/robot.glb']));
});

it ('HMP', function () {
	assert (IsSuccess (['HMP/terrain.hmp']));
});

it ('IFC', function () {
	assert (IsSuccess (['IFC/AC14-FZK-Haus.ifc']));
});

it ('IQM', function () {
	assert (IsSuccess (['IQM/mrfixit.iqm']));
});

it ('IRR', function () {
	// IRR importer is disabled
	assert (IsError (['IRR/box.irr']));
});

it ('IRRMesh', function () {
	// IRRMESH importer is disabled
	assert (IsError (['IRRMesh/spider.irrmesh']));
});

it ('LWO', function () {
	assert (IsSuccess (['LWO/LWO2/hierarchy.lwo']));
	assert (IsSuccess (['LWO/LWO2/hierarchy_smoothed.lwo']));
	assert (IsSuccess (['LWO/LWO2/nonplanar_polygon.lwo']));
	assert (IsSuccess (['LWO/LWO2/concave_polygon.lwo']));
	assert (IsSuccess (['LWO/LWO2/concave_self_intersecting.lwo']));
	assert (IsSuccess (['LWO/LWO2/sphere_with_gradient.lwo']));
	assert (IsSuccess (['LWO/LWO2/sphere_with_mat_gloss_10pc.lwo']));
	assert (IsSuccess (['LWO/LWO2/transparency.lwo']));
	assert (IsSuccess (['LWO/LWO2/uvtest.lwo']));
	assert (IsSuccess (['LWO/LWO2/box_2uv_1unused.lwo']));
	assert (IsSuccess (['LWO/LWO2/box_2vc_1unused.lwo']));
	assert (IsSuccess (['LWO/LWO2/boxuv.lwo']));
	assert (IsSuccess (['LWO/LWO2/ModoExport_vertNormals.lwo']));
	assert (IsSuccess (['LWO/LWO2/Subdivision.lwo']));
	assert (IsSuccess (['LWO/LWO2/UglyVertexColors.lwo']));
	assert (IsSuccess (['LWO/LXOB_Modo/sphereWithVertMap.lxo']));
	assert (IsSuccess (['LWO/LXOB_Modo/CrazyEngine.lxo']));
	assert (IsSuccess (['LWO/LWOB/sphere_with_mat_gloss_10pc.lwo']));
	assert (IsSuccess (['LWO/LWOB/sphere_with_mat_gloss_50pc.lwo']));
	assert (IsSuccess (['LWO/LWOB/ConcavePolygon.lwo']));
});

it ('LWS', function () {
	assert (IsSuccess (['LWS/move_x.lws']));
	assert (IsSuccess (['LWS/move_x_oldformat_56.lws']));
	assert (IsSuccess (['LWS/move_x_oldformat_6.lws']));
	assert (IsSuccess (['LWS/move_x_post_constant.lws']));
	assert (IsSuccess (['LWS/move_x_post_linear.lws']));
	assert (IsSuccess (['LWS/move_x_post_offset_repeat.lws']));
	assert (IsSuccess (['LWS/move_x_post_repeat.lws']));
	assert (IsSuccess (['LWS/move_x_post_reset.lws']));
	assert (IsSuccess (['LWS/move_xz_bezier.lws']));
	assert (IsSuccess (['LWS/move_xz_hermite.lws']));
	assert (IsSuccess (['LWS/move_xz_linear.lws']));
	assert (IsSuccess (['LWS/move_xz_spline.lws']));
	assert (IsSuccess (['LWS/move_xz_stepped.lws']));
	assert (IsSuccess (['LWS/move_y_pre_ofrep_post_osc.lws']));
	assert (IsSuccess (['LWS/simple_cube.lwo']));
});

it ('M3D', function () {
	// M3D importer is disabled
	assert (IsError (['M3D/cube_usemtl.m3d']));
	assert (IsSuccess (['M3D/cube_normals.m3d'])); // It's unclear why this is successful
	assert (IsSuccess (['M3D/cube_with_vertexcolors.m3d'])); // It's unclear why this is successful
	assert (IsError (['M3D/cube_with_vertexcolors.a3d']));
	assert (IsError (['M3D/suzanne.m3d']));
	assert (IsError (['M3D/WusonBlitz0.m3d']));
	assert (IsError (['M3D/WusonBlitz1.m3d']));
	assert (IsError (['M3D/WusonBlitz2.m3d']));
});

it ('MD2', function () {
	assert (IsSuccess (['MD2/faerie.md2']));
	assert (IsSuccess (['MD2/sydney.md2']));
});

it ('MD5', function () {
	assert (IsSuccess (['MD5/SimpleCube.md5mesh']));
});

it ('MDC', function () {
	assert (IsSuccess (['MDC/spider.mdc']));
});

it ('MDL (HL1)', function () {
	assert (IsSuccess (['MDL/MDL (HL1)/chrome_sphere.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/alpha_test.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/blend_additive.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/duplicate_bodyparts.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/duplicate_sequences.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/duplicate_submodels.mdl']));
	// assert (IsSuccess (['MDL/MDL (HL1)/man.mdl'])); // DEBUG THIS
	assert (IsSuccess (['MDL/MDL (HL1)/multiple_roots.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/sequence_transitions.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/unnamed_bodyparts.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/unnamed_bones.mdl']));
	assert (IsSuccess (['MDL/MDL (HL1)/unnamed_sequences.mdl']));
});

it ('MDL3', function () {
	assert (IsSuccess (['MDL/MDL3 (3DGS A4)/minigun.MDL']));
});

it ('MDL5', function () {
	assert (IsSuccess (['MDL/MDL5 (3DGS A5)/minigun_mdl5.mdl']));
	assert (IsSuccess (['MDL/MDL5 (3DGS A5)/PhosphoricAcid_MDl5.mdl']));
});

it ('MDL7', function () {
	assert (IsSuccess (['MDL/MDL7 (3DGS A7)/Sphere_DiffPinkBlueSpec_Alpha90.mdl']));
	assert (IsSuccess (['MDL/MDL7 (3DGS A7)/PhosphoricAcid_MDl7.mdl']));
});

it ('MS3D', function () {
	assert (IsSuccess (['MS3D/twospheres.ms3d']));
	assert (IsSuccess (['MS3D/twospheres_withmats.ms3d']));
	assert (IsSuccess (['MS3D/Wuson.ms3d']));
	assert (IsSuccess (['MS3D/jeep1.ms3d']));
});

it ('NFF', function () {
	assert (IsSuccess (['NFF/cylinder.nff']));
	assert (IsSuccess (['NFF/hexahedron.nff']));
	assert (IsSuccess (['NFF/spheres.nff']));
	assert (IsSuccess (['NFF/cone.nff']));
	assert (IsSuccess (['NFF/dodecahedron.nff']));
	assert (IsSuccess (['NFF/octahedron.nff']));
	assert (IsSuccess (['NFF/tetrahedron.nff']));
	assert (IsSuccess (['NFF/ManyEarthsNotJustOne.nff']));
	assert (IsSuccess (['NFF/positionTest.nff']));
	assert (IsSuccess (['NFF/WithCamera.nff']));
});

it ('OBJ', function () {
	assert (IsSuccess (['OBJ/box.obj']));
	assert (IsSuccess (['OBJ/box_longline.obj']));
	assert (IsSuccess (['OBJ/box_mat_with_spaces.obj']));
	assert (IsSuccess (['OBJ/box_UTF16BE.obj']));
	assert (IsSuccess (['OBJ/box_without_lineending.obj']));
	assert (IsSuccess (['OBJ/spider.obj']));
	assert (IsSuccess (['OBJ/cube_usemtl.obj']));
	assert (IsSuccess (['OBJ/cube_usemtl.obj', 'OBJ/cube_usemtl.mtl']));
	assert (IsSuccess (['OBJ/concave_polygon.obj', 'OBJ/concave_polygon.mtl']));
	assert (IsSuccess (['OBJ/cube_with_vertexcolors.obj']));
	assert (IsSuccess (['OBJ/cube_with_vertexcolors_uni.obj']));
	assert (IsSuccess (['OBJ/point_cloud.obj']));
	assert (IsSuccess (['OBJ/WusonOBJ.obj']));
	assert (IsSuccess (['OBJ/space_in_material_name.obj', 'OBJ/space_in_material_name.mtl']));
	assert (IsSuccess (['OBJ/regr01.obj', 'OBJ/regr01.mtl']));
	assert (IsSuccess (['OBJ/regr_3429812.obj', 'OBJ/regr_3429812.mtl']));
	assert (IsSuccess (['OBJ/testline.obj']));
	assert (IsSuccess (['OBJ/testpoints.obj']));
	assert (IsSuccess (['OBJ/testmixed.obj']));
});

it ('OFF', function () {
	assert (IsSuccess (['OFF/Cube.off']));
	assert (IsSuccess (['OFF/Wuson.off']));
	assert (IsSuccess (['OFF/invalid.off']));
});

it ('Ogre', function () {
	assert (IsSuccess (['Ogre/TheThing/Mesh.mesh.xml', 'Ogre/TheThing/BlockMat.material']));
});

it ('OpenGEX', function () {
	assert (IsSuccess (['OpenGEX/Example.ogex']));
	assert (IsSuccess (['OpenGEX/camera.ogex']));
	// assert (IsSuccess (['OpenGEX/animation_example.ogex'])); // DEBUG THIS
	assert (IsSuccess (['OpenGEX/collada.ogex']));
	// assert (IsSuccess (['OpenGEX/empty_camera.ogex'])); // DEBUG THIS
	assert (IsSuccess (['OpenGEX/light_issue1262.ogex']));
});

it ('PLY', function () {
	assert (IsSuccess (['PLY/cube.ply']));
	assert (IsSuccess (['PLY/cube_binary.ply']));
	assert (IsSuccess (['PLY/cube_uv.ply']));
	assert (IsSuccess (['PLY/Wuson.ply']));
	assert (IsSuccess (['PLY/cube_binary_header_with_RN_newline.ply']));
	assert (IsSuccess (['PLY/cube_binary_starts_with_nl.ply']));
	assert (IsSuccess (['PLY/float-color.ply']));
	assert (IsSuccess (['PLY/points.ply']));
	// assert (IsSuccess (['PLY/pond.0.ply'])); // DEBUG THIS
	assert (IsSuccess (['PLY/issue623.ply']));
});

it ('Q3D', function () {
	assert (IsSuccess (['Q3D/earth.q3o']));
	assert (IsSuccess (['Q3D/E-AT-AT.q3o']));
	assert (IsSuccess (['Q3D/WusonOrange.q3o']));
	assert (IsSuccess (['Q3D/WusonOrange.q3s']));
});

it ('RAW', function () {
	// RAW importer is disabled
	assert (IsError (['RAW/WithColor.raw']));
	assert (IsError (['RAW/WithTexture.raw']));
	assert (IsError (['RAW/Wuson.raw']));
});

it ('SIB', function () {
	assert (IsSuccess (['SIB/heffalump.sib']));
});

it ('SMD', function () {
	assert (IsSuccess (['SMD/triangle.smd']));
	assert (IsSuccess (['SMD/holy_grailref.smd']));
	assert (IsSuccess (['SMD/WusonSMD.smd']));
});

it ('STL', function () {
	assert (IsSuccess (['STL/Spider_ascii.stl']));
	assert (IsSuccess (['STL/Spider_binary.stl']));
	assert (IsSuccess (['STL/sphereWithHole.stl']));
	assert (IsSuccess (['STL/3DSMaxExport.STL']));
	assert (IsSuccess (['STL/Wuson.stl']));
	assert (IsSuccess (['STL/triangle.stl']));
	// assert (IsSuccess (['STL/triangle_with_empty_solid.stl'])); // DEBUG THIS
	assert (IsSuccess (['STL/triangle_with_two_solids.stl']));
});

it ('TER', function () {
	// TER importer is disabled
	assert (IsError (['TER/RealisticTerrain.ter']));
	assert (IsError (['TER/RealisticTerrain_Large.ter']));
});

it ('X', function () {
	assert (IsSuccess (['X/test_cube_text.x']));
	assert (IsSuccess (['X/test_cube_compressed.x']));
	assert (IsSuccess (['X/test_cube_binary.x']));
	assert (IsSuccess (['X/anim_test.x']));
	assert (IsSuccess (['X/BCN_Epileptic.X']));
	assert (IsSuccess (['X/fromtruespace_bin32.x']));
	assert (IsSuccess (['X/kwxport_test_cubewithvcolors.x']));
	assert (IsSuccess (['X/test.x']));
	assert (IsSuccess (['X/Testwuson.X']));
});

it ('X3D', function () {
	// X3D importer is disabled
	assert (IsError (['X3D/ComputerKeyboard.x3d']));
	assert (IsError (['X3D/HelloWorld.x3d']));
	assert (IsError (['X3D/HelloX3dTrademark.x3d']));
	assert (IsError (['X3D/IndexedLineSet.x3d']));
});

it ('X3DB', function () {
	// X3DB (X3D) importer is disabled
	assert (IsError (['X3DB/HelloWorld.x3db']));
});

it ('X3DV', function () {
	// X3DV (X3D) importer is disabled  
	assert (IsError (['X3DV/HelloWorld.x3dv']));
});

it ('XGL', function () {
	assert (IsSuccess (['XGL/cubes_with_alpha.zgl']));
	assert (IsSuccess (['XGL/sample_official.xgl']));
	assert (IsSuccess (['XGL/Wuson.zgl']));
});

it ('USD', function () {
	// Note: USD files are in models-nonbsd directory
	assert (IsSuccess (['../models-nonbsd/USD/usda/texturedcube.usda']));
	assert (IsSuccess (['../models-nonbsd/USD/usda/translated-cube.usda']));
	assert (IsSuccess (['../models-nonbsd/USD/usda/blendshape.usda']));
	assert (IsSuccess (['../models-nonbsd/USD/usda/simple-skin-test.usda']));
	assert (IsSuccess (['../models-nonbsd/USD/usda/simple-skin-animation-test.usda']));
	
	assert (IsSuccess (['../models-nonbsd/USD/usdc/texturedcube.usdc']));
	assert (IsSuccess (['../models-nonbsd/USD/usdc/translated-cube.usdc']));
	assert (IsSuccess (['../models-nonbsd/USD/usdc/blendshape.usdc']));
	assert (IsSuccess (['../models-nonbsd/USD/usdc/suzanne.usdc']));
});

it ('WRL', function () {
  // WRL (X3D) importer is disabled
	assert (IsError (['WRL/HelloWorld.wrl']));
	assert (IsError (['WRL/MotionCaptureROM.WRL']));
	assert (IsError (['WRL/Wuson.wrl']));
});
});
