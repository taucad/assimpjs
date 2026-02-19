# USD Render Issues Tracker

Tracks all identified rendering issues from glTF-to-USD export comparison.
Status: `[ ]` = open, `[x]` = fixed, `[L]` = UsdPreviewSurface limitation, `[~]` = partial fix

---

## Category: Transparency / Transmission (UsdPreviewSurface limitation + best-effort opacity)

UsdPreviewSurface has `opacity` but NOT `transmission`. Opacity fades geometry;
transmission refracts light through glass. We map `transmission_factor` to
`1 - opacity` as a best-effort approximation.

**FIX APPLIED**: Added `AI_MATKEY_TRANSMISSION_FACTOR` → opacity mapping in `MapPBRProperties()`.
Also added `AI_MATKEY_GLTF_ALPHAMODE` handling for MASK (alphaCutoff) and BLEND modes.

- [x] #2  AttenuationTest - mapped transmission to opacity (glass-like transparency)
- [x] #7  CarConcept - transparent windows now show through
- [x] #9  ChronographWatch - transparent look via opacity
- [x] #16 CompareTransmission - transparent appearance via opacity approximation
- [L] #17 CompareVolume - volume not supported in tinyusdz; opacity applied
- [x] #19 DragonAttenuation - see-through material via opacity
- [x] #21 GlassBrokenWindow - transparency via opacity
- [x] #22 GlassHurricaneCandleHolder - transparency via opacity
- [x] #23 GlassVaseFlowers - transparency via opacity
- [x] #24 IORTestGrid - transparency via opacity
- [x] #29 IridescentDishWithOlives - transparency via opacity
- [x] #58 TransmissionOrderTest - transparency via opacity
- [x] #59 TransmissionThinwallTestGrid - transparency via opacity

## Category: Anisotropy (UsdPreviewSurface limitation)

UsdPreviewSurface has no `anisotropy` property. Not achievable without MaterialX/OpenPBR.

- [L] #1  AnisotropyBarnLamp - UsdPreviewSurface limitation
- [L] #10 CompareAnisotropy - UsdPreviewSurface limitation

## Category: Iridescence (UsdPreviewSurface limitation)

UsdPreviewSurface has no iridescence support. Not achievable without MaterialX/OpenPBR.

- [L] #25 IridescenceDielectricSpheres - UsdPreviewSurface limitation
- [L] #27 IridescenceMetallicSpheres - UsdPreviewSurface limitation
- [L] #28 IridescenceSuzanne - UsdPreviewSurface limitation

## Category: Sheen (UsdPreviewSurface limitation)

UsdPreviewSurface has no sheen support. Textures should still map but sheen effect lost.

- [L] #45 SheenChair - UsdPreviewSurface limitation (textures map but sheen effect missing)
- [L] #46 SheenWoodLeatherSofa - UsdPreviewSurface limitation

## Category: Dispersion (UsdPreviewSurface limitation)

UsdPreviewSurface has no dispersion support.

- [L] #11 CompareDispersion - UsdPreviewSurface limitation
- [L] #18 DispersionTest - UsdPreviewSurface limitation
- [L] #20 DragonDispersion - UsdPreviewSurface limitation

## Category: Volume / Attenuation (UsdPreviewSurface + tinyusdz limitation)

tinyusdz volume support is a placeholder. UsdPreviewSurface lacks volume inputs.

- [L] #2  AttenuationTest - tinyusdz limitation (opacity applied as fallback)
- [L] #17 CompareVolume - tinyusdz limitation
- [L] #19 DragonAttenuation - tinyusdz limitation (opacity applied as fallback)

## Category: Render Environment (fixed in render script)

Added DomeLight with StinsonBeach.hdr IBL environment for proper PBR rendering.

- [x] #4  BoomBox - improved with IBL environment lighting
- [x] #14 CompareMetallic - improved metallic reflection with DomeLight
- [x] #15 CompareRoughness - improved roughness visibility with environment
- [x] #30 MeshoptCubeTest - improved with IBL
- [~] #32 MetalRoughSpheres - improved but spheres still appear very dark (high metallic)
- [~] #36 MosquitoInAmber - improved with IBL
- [~] #50 Suzanne - improved shape visibility but still dark (high metallic)

## Category: Texture / Color Issues (fixed in exporter)

**FIX APPLIED**: Clamped specular color values to [0,1] range to prevent out-of-gamut rendering.

- [x] #3  Avocado - renders with textures now
- [~] #8  ChairDamaskPurplegold - specular color clamped; still has color differences from specular workflow
- [~] #39 PotOfCoals - texture mapping present but UV differences from glTF
- [~] #40 PotOfCoalsAnimationPointer - textures present
- [~] #49 SpecGlossVsMetalRough - specular workflow converted
- [~] #51 TextureCoordinateTest - basic textures show
- [~] #53 TextureLinearInterpolation - textures present but color may differ
- [~] #57 ToyCar - renders but dark due to high metallic + environment interaction

## Category: Vertex Colors (fixed in exporter)

**FIX APPLIED**: Skip material binding for meshes with vertex colors and no diffuse texture,
allowing `primvars:displayColor` to show through.

- [x] #6  BoxVertexColors - vertex colors now visible
- [~] #60 VertexColorTest - vertex colors visible but material interactions differ

## Category: Lights (improved in exporter)

**FIX APPLIED**: Added world transform from associated aiNode to light prims.
Lights now have correct positions in the scene.

- [~] #38 PointLightIntensityTest - lights positioned correctly; intensity mapping may need tuning

## Category: Emissive Strength (already implemented)

Emissive intensity multiplier was already implemented in `MapPBRProperties()`.

- [x] #12 CompareEmissiveStrength - emissive intensity applied
- [~] #13 CompareIOR - IOR set via `AI_MATKEY_REFRACTI`

## Category: Animation (fixed in render pipeline)

**FIX APPLIED**: USD renderer now detects animated stages and renders multi-frame GIFs.

- [x] #5  BoxAnimated - GIF generated showing animation
- [x] #42 RecursiveSkeletons - animation detected and rendered
- [x] #43 RiggedFigure - animation detected and rendered
- [x] #44 RiggedSimple - animation detected and rendered
- [x] #48 SimpleSkin - animation detected and rendered

## Category: Instancing (assimp limitation)

**DOCUMENTED**: `EXT_mesh_gpu_instancing` is not supported by assimp's glTF importer.
Instance transform data is not imported, so only a single copy is exported.

- [L] #47 SimpleInstancing - assimp import limitation (EXT_mesh_gpu_instancing not supported)

## Category: UV / Texture Transform (partial fix)

Basic UV transforms (scale, translation, Y-flip) work correctly.
Complex rotation cases have edge cases in coordinate conversion.

- [~] #52 TextureEncodingTest - basic transforms work, complex rotation has edge cases
- [~] #54 TextureSettingsTest - partial transforms applied
- [~] #55 TextureTransformMultiTest - partial transforms applied
- [~] #56 TextureTransformTest - top row (U/V/UV) correct, bottom row rotation differs

## Category: Primitive Modes (exporter limitation)

**DOCUMENTED**: USD exporter currently only exports triangulated meshes (GeomMesh).
Point primitives (GeomPoints) and line primitives (GeomBasisCurves) are not yet supported.

- [L] #31 MeshPrimitiveModes - exporter limitation (only triangles exported)
- [L] #41 PrimitiveModeNormalsTest - exporter limitation (only triangles exported)

## Category: Morph / Blend Shape Issues

- [L] #34 MorphPrimitivesTest - duplicate prim error (tinyusdz serialization conflict)
- [~] #35 MorphStressTest - blend shapes exported but morph animation may not render

## Category: Miscellaneous

- [~] #26 IridescenceLamp - transparency via opacity (iridescence not supported)
- [~] #33 MetalRoughSpheresNoTextures - mesh hierarchy rendering issue
- [~] #37 NegativeScaleTest - negative scale handling may affect rendering

---

## Progress Summary

| Category | Total | Fixed | Partial | Limitation | Open |
|----------|-------|-------|---------|-----------|------|
| Transparency | 13 | 11 | 0 | 2 | 0 |
| Anisotropy | 2 | 0 | 0 | 2 | 0 |
| Iridescence | 3 | 0 | 0 | 3 | 0 |
| Sheen | 2 | 0 | 0 | 2 | 0 |
| Dispersion | 3 | 0 | 0 | 3 | 0 |
| Volume | 3 | 0 | 0 | 3 | 0 |
| Environment | 7 | 4 | 3 | 0 | 0 |
| Textures | 8 | 1 | 6 | 0 | 1 |
| Vertex Colors | 2 | 1 | 1 | 0 | 0 |
| Lights | 1 | 0 | 1 | 0 | 0 |
| Emissive | 2 | 1 | 1 | 0 | 0 |
| Animation | 5 | 5 | 0 | 0 | 0 |
| Instancing | 1 | 0 | 0 | 1 | 0 |
| UV Transform | 4 | 0 | 4 | 0 | 0 |
| Primitives | 2 | 0 | 0 | 2 | 0 |
| Morph | 2 | 0 | 1 | 1 | 0 |
| Misc | 3 | 0 | 3 | 0 | 0 |
| **Total** | **63** | **23** | **20** | **19** | **1** |

## Key Fixes Applied

1. **Transparency/Opacity** (USDZExporter.cpp): Added `AI_MATKEY_TRANSMISSION_FACTOR` → opacity mapping,
   `AI_MATKEY_GLTF_ALPHAMODE` handling (MASK/BLEND), `AI_MATKEY_GLTF_ALPHACUTOFF` support.

2. **Specular Color Clamping** (USDZExporter.cpp): Clamped specular color RGB values to [0,1] range
   to prevent out-of-gamut rendering artifacts.

3. **Vertex Colors** (USDZExporter.cpp): Skip material binding for meshes with vertex colors
   and no diffuse texture, allowing `primvars:displayColor` to show through.

4. **Light Transforms** (USDZExporter.cpp): Added world transform from associated aiNode
   to light prims using XformOp.

5. **IBL Environment** (render_usd_snapshots.py): Added DomeLight with StinsonBeach.hdr
   for proper PBR metallic/roughness/reflection rendering.

6. **Animation GIF** (render_usd_snapshots.py): Detect animated stages, render multi-frame
   GIFs using FrameRecorder + Pillow.

7. **UsdValidation** (render_usd_snapshots.py): Integrated UsdValidation Python API for
   pre-render schema validation.

## Known Limitations (UsdPreviewSurface)

These glTF PBR extensions have NO equivalent in UsdPreviewSurface and require MaterialX/OpenPBR:
- Anisotropy (`KHR_materials_anisotropy`)
- Iridescence (`KHR_materials_iridescence`)
- Sheen (`KHR_materials_sheen`)
- Dispersion (`KHR_materials_dispersion`)
- True transmission/refraction (`KHR_materials_transmission` with refraction)
- Volume/attenuation (`KHR_materials_volume`)
