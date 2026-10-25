# Third-party assets

| Asset                                        | Path                      | Author                 | Licence                                                         | Source                                                                         |
| -------------------------------------------- | ------------------------- | ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Piper PA-18 (3D model)                       | `public/models/pa18/`     | helijah                | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)       | <https://sketchfab.com/3d-models/piper-pa-18-413e3f81b0db4e0ebba0f27490732770> |
| Extra 300 ("Aerobatics aircraft", 3D model)  | `public/models/extra300/` | Martins Upitis         | [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | <https://opengameart.org/content/aerobatics-aircraft>                          |
| Kloofendal 48d Partly Cloudy (Pure Sky) HDRI | `public/assets/env/`      | Greg Zaal, Jarod Guest | CC0                                                             | <https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky>                 |
| Leafy Grass texture                          | `public/assets/textures/` | Charlotte Baglioni     | CC0                                                             | <https://polyhaven.com/a/leafy_grass>                                          |
| Nature Kit trees                             | `public/assets/trees/`    | Kenney                 | CC0                                                             | <https://kenney.nl/assets/nature-kit>                                          |

## Data

| Data                                    | Path             | Source                                                                              |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| USA 35B and Clark Y airfoil coordinates | `data/airfoils/` | UIUC Airfoil Coordinates Database (m-selig.ae.illinois.edu/ads/coord_database.html) |
| Airfoil polar tables                    | `src/sim/data/`  | Generated with XFoil (`scripts/gen_polars.py`)                                      |

The PA-18 model is CC-BY: the credit above must ship with the app (it is
shown in the in-app Credits panel, and the original `license.txt` is kept
next to the model). The unmodified export is in `models-src/pa18/`; the
shipped copy is generated from it by `scripts/split-model.ts`, which splits
the propeller and control surfaces into separate nodes.

The Extra 300 model is CC-BY-SA: the credit must ship with the app (Credits
panel and start screen), and our adaptation of it (the glTF, the repainted
skin) is shared under the same licence, as its `license.txt` says. It is
converted from the author's `.blend` by `scripts/extra300/export.py` into
`models-src/extra300/`, with the Blender logos painted out of the skin by
`scripts/extra300/delogo.py`; `scripts/split-model.ts extra300` makes the
shipped copy.
