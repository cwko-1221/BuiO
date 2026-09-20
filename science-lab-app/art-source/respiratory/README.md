# 呼吸系統模型 · Respiratory model source

These scripts build `public/models/respiratory.glb`, the anatomy shown at the
呼吸系統 station. They are the source for that file — there is no `.blend` to
keep in step, because the model is generated rather than hand-sculpted.

## Rebuilding

Blender must be running with the MCP add-on enabled and its server started
(sidebar `N` → **BlenderMCP** → *Start MCP Server*). Then, from the repo root:

    node science-lab-app/art-source/respiratory/blender-run.mjs science-lab-app/art-source/respiratory/bl-lungs.py
    node science-lab-app/art-source/respiratory/blender-run.mjs science-lab-app/art-source/respiratory/bl-skeleton.py
    node science-lab-app/art-source/respiratory/blender-run.mjs science-lab-app/art-source/respiratory/bl-materials.py

Run them in that order, **from a clean scene, every time**. The stages are not
independent and re-running one on its own will quietly give you a broken model:

- `bl-skeleton.py` keeps only the five lung-lobe source meshes and rebuilds the
  airway, thoracic cage, body shell, spine and diaphragm around them. Running
  it without a fresh `bl-lungs.py` result therefore uses stale or missing lungs.
- `bl-materials.py` joins the loose parts into five system meshes and keeps the
  five lung lobes as named child meshes of a sixth `lungs` parent. Run it twice
  and the second run finds the source parts already consumed, so it exports
  whatever is left — once, that was the diaphragm on its own.

After the three Blender stages, run `npm run optimize:respiratory` from
`science-lab-app`. It validates and quantizes the GLB while retaining the
breathing shape keys; rerun it after each Blender export. The optimized model is
about 2.35 MB and keeps the two Blender assets within the production download
budget.

Both failures export successfully and report no error. Check the part list that
`bl-materials.py` prints, and confirm `ribcage`, `airway`, `lungs`, `body`,
`spine` and `diaphragm` are all there before believing an
export. Under `lungs`, also confirm `lung_RUL`, `lung_RML`, `lung_RLL`,
`lung_LUL` and `lung_LLL`. `node tmp/glb-bounds.mjs` will also list what
actually landed in the file.

If the export itself fails with `OSError: [Errno 22]` on the glb path, delete the
file and run the stage again — a stale handle on the previous export blocks the
write, and Blender reports it as an invalid argument rather than a lock.

`bl-render.py` renders the scene from three angles into `tmp/bl-shots/`, which
is how the model is checked by eye between passes.

### Why a socket script rather than the MCP tools

The Blender MCP server configured for this workspace speaks a different protocol
from the add-on that is installed, so its tools time out. The add-on itself
answers plain JSON commands of the form `{"type": ..., "params": {...}}` on port
9876, and `blender-run.mjs` talks to it directly.

## How the shapes are made

Everything inside the chest comes from two shape functions, `cage_inner(z)` and
`diaphragm_top(x, y)`, which are also the numbers `BodyScenes.js` uses. Deriving
every part from those is what keeps the anatomy from intersecting itself:

- **Lungs** are an ovoid *intersected* with a solid of the chest cavity — which
  gives the flattened costal surface and means a lobe cannot cross a rib — then
  *differenced* with a solid of the diaphragm, which hollows the concave base
  each lung rests on. They are then bisected by the real oblique and horizontal
  fissure planes into three lobes on the right and two on the left, with the
  cardiac notch on the left. The notch and central cardiomediastinal contour
  remain part of normal lung anatomy, but this lesson deliberately ships no
  heart or central great-vessel mesh. Pulmonary artery and vein branches stop
  at the hila.
- **Ribs** sweep that same cavity ellipse at a fixed standoff, so a rib is
  outside the pleural space along its whole length. They are bevelled along a
  flat profile, because a rib is a band and not a rod.
- **The diaphragm** is the `diaphragm_top` height field, solidified.

Shaping by rewriting vertex coordinates instead of carving is what produced
wedge-shaped lungs with crumpled bases on the first attempt; hand-picking rib
radii is what sent ribs through the lungs. Both are recorded in the scripts.

## Axes

Blender is Z-up and looks down `-Y`; the web scene is Y-up and faces `+Z`. The
glTF exporter maps Blender `(x, y, z)` to glTF `(x, z, -y)`, so modelling with Z
as up and `-Y` as the front lands in the web scene's axes with nothing to fix.

## Colour

Material values in Blender are **linear**. Picking numbers that look right as
sRGB makes every part render about 15% too pale — tan bone comes out nearly
white. `bl-materials.py` takes sRGB hex and converts, so the palette can be
written the way it is read off a reference plate.

## Budget

The station's asset budget is checked by `scripts/test-science-lab.mjs`: the
equipment kit and this model together must stay under 4 MB. Watch the bevel
profile resolution if that grows — a profile curve's own `resolution_u`
multiplies along every rib, which once turned the rib cage into 153k faces and
a 7.5 MB export.
