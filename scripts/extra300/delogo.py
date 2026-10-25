"""Paints the Blender logos out of the Extra 300 skin.

The mask is the logo layers' alpha in the PSD template, plus the boxes of the
vector badge shapes behind them. Masked pixels are filled by interpolating
each row from the shipped skin's own neighbours (the stripes and belly
streaks run along rows), then the template's fine detail (rivets, panel
lines) is added back from the logo-free composite.

Usage, with the skins pack from https://opengameart.org/content/aerobatics-aircraft
unzipped into SKINS and the model into SRC (needs numpy, pillow and psd-tools):

    python scripts/extra300/delogo.py SKINS/plane_texture_template.psd \
        SRC/textures/plane_texture_blue.png SKIN.png
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from psd_tools import PSDImage

psd_path, blue, out = sys.argv[1:4]
psd = PSDImage.open(psd_path)
mask = np.zeros((2048, 2048), bool)
for l in psd.descendants():
    logo = l.name.startswith('blenderLogo')
    badge = l.name.startswith('Shape 1 copy') and l.bbox[0] in (1314, 1331)
    if logo:
        alpha = np.asarray(l.composite(viewport=(0, 0, 2048, 2048)).convert('RGBA'))[..., 3]
        mask |= alpha > 0
    elif badge:
        x0, y0, x1, y1 = l.bbox
        mask[y0:y1, x0:x1] = True
    if logo or badge:
        l.visible = False
mask = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
nologo = np.asarray(psd.composite(force=True).convert('RGB')).astype(float)
src = np.asarray(Image.open(blue).convert('RGB')).astype(float)


def rows(img, m):
    res = img.copy()
    xs = np.arange(img.shape[1])
    for y in np.nonzero(m.any(axis=1))[0]:
        r = m[y]
        for c in range(3):
            res[y, r, c] = np.interp(xs[r], xs[~r], img[y, ~r, c])
    return res


res = np.where(mask[..., None], rows(src, mask) + nologo - rows(nologo, mask), src)
Image.fromarray(res.clip(0, 255).astype(np.uint8)).save(out)
