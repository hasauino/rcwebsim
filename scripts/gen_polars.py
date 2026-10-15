"""Generate full-range (-180..180 deg) airfoil polar tables for the sim.

XFoil (via xfoil-python) supplies the attached-flow / near-stall range at each
Reynolds number; beyond the converged range the tables are extended with the
Viterna-Corrigan method (cl, cd) and a flat-plate centre-of-pressure model (cm).

Usage (see README "Regenerating airfoil polars"):
    scripts/.venv/bin/python scripts/gen_polars.py data/airfoils/usa35b.dat \
        src/sim/data/usa35b.json --name "USA 35B" --re 60e3,100e3,150e3,250e3,400e3,600e3
"""

import argparse
import json
import math

import numpy as np
from xfoil import XFoil
from xfoil.model import Airfoil

CD_MAX = 1.29  # Viterna: 1.11 + 0.018 * AR, AR ~ 10
REVERSE_CL_FACTOR = 0.7  # lift reduction with the trailing edge leading
ALPHA_GRID = np.arange(-180.0, 180.0 + 1e-9, 1.0)


def read_lednicer(path):
    with open(path) as f:
        lines = [l.split() for l in f.read().splitlines()[1:] if l.strip()]
    n_up, n_lo = (int(float(v)) for v in lines[0])
    pts = [(float(a), float(b)) for a, b in lines[1:]]
    upper, lower = pts[:n_up], pts[n_up : n_up + n_lo]
    # Selig order: TE -> upper -> LE -> lower -> TE
    coords = upper[::-1] + lower[1:]
    x, y = zip(*coords)
    return np.array(x), np.array(y)


def naca_symmetric(thickness, n=81):
    """NACA 00xx coordinates in Selig order (closed trailing edge)."""
    beta = np.linspace(0, np.pi, n)
    x = (1 - np.cos(beta)) / 2
    t = thickness / 100
    yt = 5 * t * (0.2969 * np.sqrt(x) - 0.1260 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
    xs = np.concatenate([x[::-1], x[1:]])
    ys = np.concatenate([yt[::-1], -yt[1:]])
    return xs, ys


def sweep(xf, a0, a1, step):
    xf.reset_bls()
    a, cl, cd, cm, _ = xf.aseq(a0, a1, step)
    ok = ~np.isnan(cl)
    return a[ok], cl[ok], cd[ok], cm[ok]


def xfoil_polar(x, y, re, ncrit):
    xf = XFoil()
    xf.print = False
    xf.airfoil = Airfoil(x, y)
    xf.repanel(n_nodes=200)
    xf.Re = re
    xf.n_crit = ncrit
    xf.max_iter = 200
    pos = sweep(xf, 0.0, 25.0, 0.5)
    neg = sweep(xf, -0.5, -20.0, -0.5)
    a = np.concatenate([neg[0][::-1], pos[0]])
    cl = np.concatenate([neg[1][::-1], pos[1]])
    cd = np.concatenate([neg[2][::-1], pos[2]])
    cm = np.concatenate([neg[3][::-1], pos[3]])
    order = np.argsort(a)
    a, cl, cd, cm = a[order], cl[order], cd[order], cm[order]
    _, unique = np.unique(a, return_index=True)
    return a[unique], cl[unique], cd[unique], cm[unique]


def viterna(alpha_s, cl_s, cd_s):
    s, c = math.sin(alpha_s), math.cos(alpha_s)
    a1 = CD_MAX / 2
    a2 = (cl_s - CD_MAX * s * c) * s / (c * c)
    b2 = (cd_s - CD_MAX * s * s) / c

    def f(alpha):
        sa, ca = math.sin(alpha), math.cos(alpha)
        return a1 * math.sin(2 * alpha) + a2 * ca * ca / sa, CD_MAX * sa * sa + b2 * ca

    return f


def flat_plate_cm(alpha, cl, cd):
    """Moment about c/4 from the normal force acting at a centre of pressure
    that moves from c/4 (alpha=0) through c/2 (90 deg) to 3c/4 (180 deg)."""
    cn = cl * math.cos(alpha) + cd * math.sin(alpha)
    xcp = 0.25 + 0.25 * abs(alpha) / (math.pi / 2)
    return -cn * (xcp - 0.25)


def first_peak(cl, start, step, window=4):
    """Index of the first local extremum walking away from alpha=0. XFoil often
    re-converges onto a spurious second peak deep in stall; ignore it."""
    i = start
    while 0 <= i + step < len(cl):
        ahead = cl[i + step : i + step * (window + 1) : step] if step > 0 else cl[
            max(i + step * window, 0) : i
        ][::-1]
        better = ahead > cl[i] if step > 0 else ahead < cl[i]
        if not np.any(better):
            return i
        i += step
    return i


def extend(a_deg, cl, cd, cm):
    i_zero = int(np.argmin(np.abs(a_deg)))
    i_max = first_peak(cl, i_zero, 1)
    i_min = first_peak(cl, i_zero, -1)
    # Only trust the converged range up to the stall points.
    a_hi, a_lo = math.radians(a_deg[i_max]), math.radians(a_deg[i_min])
    vit_hi = viterna(a_hi, cl[i_max], cd[i_max])
    vit_lo = viterna(a_lo, cl[i_min], cd[i_min])
    cd_min = float(np.min(cd))

    out_cl, out_cd, out_cm = [], [], []
    for deg in ALPHA_GRID:
        a = math.radians(deg)
        if a_lo <= a <= a_hi:
            out_cl.append(float(np.interp(deg, a_deg, cl)))
            out_cd.append(float(np.interp(deg, a_deg, cd)))
            out_cm.append(float(np.interp(deg, a_deg, cm)))
            continue

        positive = a > 0
        stall, vit = (a_hi, vit_hi) if positive else (a_lo, vit_lo)
        i_stall = i_max if positive else i_min
        mag = abs(a)
        sign = 1.0 if positive else -1.0
        if mag <= math.pi / 2:
            l, d = vit(a)
        elif mag <= math.pi - abs(stall):
            l, d = vit(sign * (math.pi - mag))
            l *= -REVERSE_CL_FACTOR
        else:
            # Reversed attached flow: blend linearly to cl=0 at 180 deg.
            edge = math.pi - abs(stall)
            l_edge, d_edge = vit(sign * (math.pi - edge))
            l_edge *= -REVERSE_CL_FACTOR
            t = (mag - edge) / (math.pi - edge)
            l = l_edge * (1 - t)
            d = d_edge * (1 - t) + 2 * cd_min * t

        # Flat-plate cm, offset so it joins the XFoil cm at stall and the
        # offset fades out by 90 deg.
        cm_offset = cm[i_stall] - flat_plate_cm(stall, cl[i_stall], cd[i_stall])
        fade = max(0.0, 1 - (mag - abs(stall)) / (math.pi / 2 - abs(stall)))
        out_cl.append(l)
        out_cd.append(d)
        out_cm.append(flat_plate_cm(a, l, d) + cm_offset * fade)
    return out_cl, out_cd, out_cm


def main():
    p = argparse.ArgumentParser()
    p.add_argument("dat", help="Lednicer .dat file, or naca00XX for a symmetric section")
    p.add_argument("out")
    p.add_argument("--name", required=True)
    p.add_argument("--re", required=True, help="comma-separated Reynolds numbers")
    p.add_argument("--ncrit", type=float, default=9.0)
    args = p.parse_args()

    if args.dat.lower().startswith("naca00"):
        x, y = naca_symmetric(float(args.dat[6:]))
    else:
        x, y = read_lednicer(args.dat)
    reynolds = [float(r) for r in args.re.split(",")]
    table = {
        "name": args.name,
        "generator": (
            f"XFoil (xfoil-python), Ncrit={args.ncrit}, Viterna-Corrigan extension "
            f"(CDmax={CD_MAX}), flat-plate cm; scripts/gen_polars.py"
        ),
        "source": args.dat,
        "alphaDeg": {"start": float(ALPHA_GRID[0]), "step": 1.0, "count": len(ALPHA_GRID)},
        "reynolds": reynolds,
        "cl": [],
        "cd": [],
        "cm": [],
    }
    for re in reynolds:
        a, cl, cd, cm = xfoil_polar(x, y, re, args.ncrit)
        print(
            f"Re={re:>8.0f}: {len(a)} pts, alpha {a[0]:.1f}..{a[-1]:.1f}, "
            f"clmax={cl.max():.3f} @ {a[np.argmax(cl)]:.1f}, cdmin={cd.min():.4f}"
        )
        l, d, m = extend(a, cl, cd, cm)
        table["cl"].append([round(v, 5) for v in l])
        table["cd"].append([round(v, 5) for v in d])
        table["cm"].append([round(v, 5) for v in m])

    with open(args.out, "w") as f:
        json.dump(table, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
