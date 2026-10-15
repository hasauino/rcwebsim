# Regenerating airfoil polars

`src/sim/data/*.json` are generated with XFoil and committed (see ADR-0005):

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install numpy "git+https://github.com/DARcorporation/xfoil-python.git"   # needs gfortran + cmake
scripts/.venv/bin/python scripts/gen_polars.py data/airfoils/usa35b.dat src/sim/data/usa35b.json \
  --name "USA 35B" --re 60e3,100e3,150e3,250e3,400e3,600e3
scripts/.venv/bin/python scripts/gen_polars.py data/airfoils/clarky.dat src/sim/data/clarky.json \
  --name "Clark Y" --re 50e3,100e3,200e3,400e3
scripts/.venv/bin/python scripts/gen_polars.py naca0009 src/sim/data/naca0009.json \
  --name "NACA 0009" --re 40e3,80e3,150e3,300e3
```
