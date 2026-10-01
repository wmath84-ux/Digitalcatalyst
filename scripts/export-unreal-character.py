"""Character-only asset export helper for the reference UE 5.1 project.

Run INSIDE Unreal Editor with the Python Editor Script Plugin enabled:
    py "<Digitalcatalyst>/scripts/export-unreal-character.py"

Set SANCTUARY_CHARACTER_EXPORT_DIR before opening Editor, or the result goes
into <Unreal project>/Saved/SanctuaryCharacterExport. Requires your authorized
Katiusza/FemaleAnimsetPro/Mixamo assets. Does NOT export a level or environment.
This script has been syntax checked, but cannot be editor-executed in the web
sandbox (Unreal Editor and authorized licenses are not installed there).
FBX/TGA are intermediate interchange files, not directly playable web assets.
"""
import json
import os

import unreal

ROOT = "/Game/Characters/Katiusza"
MESH = ROOT + "/Models/Katia/SKM_Katiusza"
DEST = os.environ.get(
    "SANCTUARY_CHARACTER_EXPORT_DIR",
    os.path.join(unreal.Paths.project_saved_dir(), "SanctuaryCharacterExport"),
)
os.makedirs(DEST, exist_ok=True)
report = {"scope": "character-only", "exports": [], "materials": [], "failures": []}


def export_asset(asset, relative_name, options=None):
    filename = os.path.join(DEST, relative_name)
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    task = unreal.AssetExportTask()
    task.object = asset
    task.filename = filename
    task.automated = True
    task.prompt = False
    task.replace_identical = True
    task.selected = False
    if options is not None:
        task.options = options
    # Select the installed exporter by the actual object type and extension.
    # No level/actor export tasks or environment directories are ever included.
    try:
        result = unreal.Exporter.run_asset_export_task(task)
        if not result:
            raise RuntimeError("Unreal asset exporter returned False")
        report["exports"].append({"asset": asset.get_path_name(), "file": relative_name})
    except Exception as error:
        report["failures"].append({"asset": asset.get_path_name(), "error": str(error)})
        unreal.log_warning("Character export failed: " + str(error))


mesh = unreal.load_asset(MESH)
if not isinstance(mesh, unreal.SkeletalMesh):
    raise RuntimeError("Expected the authorized Katiusza skeletal mesh at " + MESH)

fbx_options = unreal.FbxExportOption()
# Version-tolerant: leave unsupported editor option names at their defaults.
for property_name, value in [("ascii", False), ("export_morph_targets", True)]:
    try:
        fbx_options.set_editor_property(property_name, value)
    except Exception:
        pass
export_asset(mesh, "Katiusza.fbx", fbx_options)

registry = unreal.AssetRegistryHelpers.get_asset_registry()
records = registry.get_assets_by_path(ROOT, recursive=True)
textures = {}
for record in records:
    asset = record.get_asset()
    asset_path = asset.get_path_name()
    if isinstance(asset, unreal.AnimSequence):
        # In-place, root-motion, eyes and retargeted clips are all retained;
        # blendspaces/Control Rigs/AnimBlueprints remain native Unreal assets.
        relative = asset_path.split(".")[0][len(ROOT) + 1:]
        export_asset(asset, "animations/" + relative + ".fbx", fbx_options)
    elif isinstance(asset, unreal.Texture2D):
        textures[asset_path] = asset
    elif isinstance(asset, unreal.MaterialInterface):
        entry = {"asset": asset_path, "textures": []}
        try:
            for texture in unreal.MaterialEditingLibrary.get_used_textures(asset):
                textures[texture.get_path_name()] = texture
                entry["textures"].append(texture.get_path_name())
        except Exception as error:
            entry["inspection_error"] = str(error)
        report["materials"].append(entry)

for asset_path, texture in sorted(textures.items()):
    relative = asset_path.split(".")[0][len("/Game/"):]
    export_asset(texture, "textures/" + relative + ".tga")

report["note"] = (
    "No Unreal map, land, sky, house, light or cover actor was exported. "
    "FBX requires a rig/material/animation-aware conversion to one GLB. "
    "Bake Unreal material appearance; do not drop clothing/eyes/skirt, normal, "
    "roughness or alpha maps. Native ragdoll, cloth, Control Rig, AnimGraph "
    "and source-specific root-motion/spline curves are not reproduced by GLB."
)
with open(os.path.join(DEST, "export-report.json"), "w", encoding="utf-8") as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
if report["failures"]:
    raise RuntimeError("Some character exports failed; inspect export-report.json before converting.")
unreal.log("Character-only interchange export complete: " + DEST)
