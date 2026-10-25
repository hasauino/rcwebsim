"""Exports Martins Upitis's Extra 300 (.blend) to the glTF in models-src/extra300.

The source is a 2012 Blender Game Engine scene: objects parented with
transforms, game-engine materials, a three-blade prop, and a few cockpit
screens whose images are missing. This flattens it into what
scripts/split-model.ts expects: one parent node of bare mesh nodes with
identity transforms, one material each, shaded with Principled BSDF.

- The airframe is levelled (the scene tilts it into its ground attitude).
- Lamps, empties, the ground disc and the screens with missing images go.
- Every mesh is moved into world space and split by material.
- The prop becomes two-blade, like the RC model's 13x6: the top blade is
  kept and a copy turned 180 degrees about the spin axis replaces the others.
- The fuselage skin is the blue livery with the Blender logos painted out
  (scripts/extra300/delogo.py).

Blender is Z-up with the nose towards +Y; the glTF exporter makes that Y-up
with the nose towards -Z and the right wing towards +X, the sim's body frame.

Usage, with BGEAR_plane.blend and its textures/ from
https://opengameart.org/content/aerobatics-aircraft unzipped into SRC:

    Blender -b --factory-startup SRC/BGEAR_plane.blend \
        --python scripts/extra300/export.py -- SKIN.png models-src/extra300/scene.gltf
"""

import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

skin, output = sys.argv[sys.argv.index("--") + 1 :]

DROP = {"Circle", "glass.001", "pfd_display"}
TEXTURES = {
    "chassis": skin,
    "cockpit": "//textures/cockpit.png",
    "instruments": "//textures/instruments.jpg",
    "panels": "//textures/panel_ao.tga",
    "Material.001": "//textures/trackmap.jpg",
}

# The scene sits the airframe in its ground attitude under "Empty", tilted
# 9.6 deg nose up. Undo that so the thrust line is level.
level = bpy.data.objects["Empty"].matrix_world.inverted()

for o in list(bpy.data.objects):
    if o.type != "MESH" or o.name in DROP or not len(o.data.vertices):
        bpy.data.objects.remove(o)

# Level, world space, no parents, one material per object.
meshes = list(bpy.data.objects)
world = {o.name: level @ o.matrix_world for o in meshes}
for o in meshes:
    o.parent = None
    o.data = o.data.copy()
    o.data.transform(world[o.name])
    o.matrix_world = Matrix.Identity(4)
for o in meshes:
    if len({p.material_index for p in o.data.polygons}) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.separate(type="MATERIAL")
        bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects:
    used = {p.material_index for p in o.data.polygons}
    if len(o.data.materials) > 1 and len(used) == 1:
        keep = o.data.materials[used.pop()]
        o.data.materials.clear()
        o.data.materials.append(keep)
    # The splitter reads UVs on every mesh; the glass has none.
    if not o.data.uv_layers:
        o.data.uv_layers.new(name="UVTex")

# Two-blade prop: keep the blade above the hub, add it again turned 180 deg.
hub = bpy.data.objects["propeller_hub"].data.vertices
lo = Vector([min(v.co[i] for v in hub) for i in range(3)])
hi = Vector([max(v.co[i] for v in hub) for i in range(3)])
centre = (lo + hi) / 2
prop = bpy.data.objects["propeller"]
bm = bmesh.new()
bm.from_mesh(prop.data)
islands = []
seen = set()
for v in bm.verts:
    if v in seen:
        continue
    stack, island = [v], []
    seen.add(v)
    while stack:
        u = stack.pop()
        island.append(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w not in seen:
                seen.add(w)
                stack.append(w)
    islands.append(island)
if len(islands) != 3:
    raise SystemExit(f"expected three blades, found {len(islands)} pieces")
top = max(islands, key=lambda isl: sum(v.co.z for v in isl) / len(isl))
bmesh.ops.delete(bm, geom=[v for isl in islands if isl is not top for v in isl], context="VERTS")
copy = bmesh.ops.duplicate(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces))
turn = Matrix.Translation(centre) @ Matrix.Rotation(math.pi, 4, "Y") @ Matrix.Translation(-centre)
bmesh.ops.transform(bm, matrix=turn, verts=[g for g in copy["geom"] if isinstance(g, bmesh.types.BMVert)])
bm.to_mesh(prop.data)
bm.free()

for m in bpy.data.materials:
    colour = tuple(m.diffuse_color)
    m.use_nodes = True
    tree = m.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = 0.45
    bsdf.inputs["Metallic"].default_value = 0.0
    if m.name in TEXTURES:
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(TEXTURES[m.name])
        tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if m.name in ("glass", "glass_in"):
        bsdf.inputs["Alpha"].default_value = 0.3
        bsdf.inputs["Roughness"].default_value = 0.05
        m.surface_render_method = "BLENDED"

parent = bpy.data.objects.new("extra300", None)
bpy.context.scene.collection.objects.link(parent)
for o in bpy.data.objects:
    if o.type == "MESH":
        o.parent = parent

bpy.ops.export_scene.gltf(
    filepath=output,
    export_format="GLTF_SEPARATE",
    export_texture_dir="textures",
    export_image_format="AUTO",
    export_apply=True,
    export_lights=False,
    export_cameras=False,
    export_extras=False,
    export_yup=True,
)
