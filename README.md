# RC Flight Sim

A browser RC flight simulator: Vue 3 UI, three.js (WebGPU, WebGL 2 fallback)
rendering, Rapier rigid-body physics, and a custom high-fidelity aerodynamics
model. One aircraft — an FMS 1700 mm PA-18 Super Cub, electric — at one club
flying field.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # flight-envelope and determinism tests (headless)
npm run build
```

Desktop Chrome, Edge, Firefox or Safari. WebGPU is used where available,
otherwise WebGL 2.

### The aircraft model

`public/models/pa18/` holds [Piper PA-18 by helijah](https://sketchfab.com/3d-models/piper-pa-18-413e3f81b0db4e0ebba0f27490732770)
(CC-BY 4.0, credited in-app and in [ASSETS.md](ASSETS.md)). If it fails to
load you fly the aerodynamic debug view instead.

`src/sim/aircraft/pa18.ts` → `model` binds it: `scale`, `rotationDeg` and
`offset` put it in the body frame (wing root leading edge at the origin, +x
right wing, +y up, nose towards −z, 1.7 m span). The gear, tail and prop
positions in the physics were measured from it.

**Moving control surfaces.** This export is merged per material — the
ailerons, flaps, elevator and rudder are part of the wing/tail meshes and
there are no propeller blades — so nothing animates yet (a spinning prop
disc is drawn instead). To animate them, split each surface into its own
object in Blender with its origin on the hinge line, export glTF, and list
the node names and hinge axes under `model.nodes` (keys like
`aileron.left`, `elevator.right`, `rudder.center`).

## Flying

The default view is the pilot's eye at the pilot station, as RC is flown,
with auto-zoom. `C` switches to a chase camera.

| Key                       | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| `W` / `S`                 | Throttle up / down                                        |
| `←` `→`                   | Aileron                                                   |
| `↑` `↓`                   | Elevator (↓ = pull back, nose up)                         |
| `A` / `D`                 | Rudder (and tailwheel)                                    |
| `Shift`                   | Fine control (40 % stick)                                 |
| `F`                       | Flap switch: up / half / full                             |
| `E`                       | Dual rates high / low                                     |
| `H`                       | Throttle hold                                             |
| `I`/`K`, `J`/`L`, `U`/`O` | Elevator, aileron, rudder trim (one click each)           |
| `R` / `T`                 | Reset on the runway / air start                           |
| `P`                       | Pause · `G` aero overlay · `Esc` settings · `/` hide help |

Gamepads and RC transmitters in USB joystick mode (EdgeTX/OpenTX radios,
simulator dongles) work through the Gamepad API. Settings → Controls maps
axes to gimbals, calibrates, and assigns switches; Settings → Transmitter
sets stick mode (1–4), dual rates, expo, trims, reversing and a
flap→elevator mix. Everything is saved in the browser per aircraft.

It is a taildragger: hold right rudder as the tail comes up, rotate gently
at about 9 m/s.

## How it works

```
input/devices ─▶ input/transmitter ─▶ sim (500 Hz fixed step) ─▶ render (interpolated)
 keyboard,        mode, rates, expo,    flight controller ─▶ servos              ─▶ audio
 gamepad          trims, switches       aero + prop + gear ─▶ Rapier
```

- `src/sim/` — headless and DOM-free; runs in Node for tests and can move to
  a worker later.
  - `aero.ts` — strip theory: each surface is cut into spanwise strips that
    see their own flow (body rates, prop wash, wing downwash with transport
    lag, ground effect) and look up full-range (±180°) section polars.
    Finite-span effects come from a per-surface induced angle; control
    surfaces use thin-airfoil effectiveness with large-deflection falloff.
  - `propulsion.ts` — LiPo (sag, state of charge) → ESC (current limit,
    low-voltage cutoff) → outrunner (Kv, Rm, Io) → blade-element prop
    integrated around the disc (so P-factor and prop normal force emerge),
    momentum-theory inflow, slipstream with swirl, torque reaction and
    gyroscopic precession.
  - `gear.ts` — raycast spring/damper wheels with tyre friction and a
    rudder-linked steerable tailwheel.
  - `wind.ts` — steady wind plus Dryden turbulence (MIL-F-8785C), seeded.
  - `simulation.ts` — the public interface: `createSimulation`, `step`,
    `reset`, `state`, `telemetry`.
  - `recording.ts` — the sim is deterministic, so a flight is its starting
    conditions plus per-step inputs (Settings → Debug → Download recording).
  - `aircraft/pa18.ts` — the aircraft as data. Every number has a
    `provenance` entry: sourced (FMS manual etc.), derived, estimated, or
    tuned against the tests.
- `src/render/` — three.js scene: sky, field, trees, grass, aircraft, debug
  overlay, cameras.
- `src/input/`, `src/audio/`, `src/ui/`, `src/stores/` — devices and the
  virtual transmitter, synthesised motor sound, Vue components, Pinia state.

### Tests

`npm test` flies the aircraft headless and checks it against what a real
1.7 m Cub does: it sits tail-down on its gear, static thrust/rpm/current
match a 12×7.5 on 750 Kv 4S, it glides hands-off at a trainer speed and glide
ratio, cruises level on part throttle, stalls at the speed its wing loading
predicts (lower with flaps), rolls at a trainer rate, takes off within the
runway, survives a flared landing, crashes when flown into the ground,
produces Dryden-intensity gusts, and replays bit-for-bit.

### Regenerating airfoil polars

`src/sim/data/*.json` are generated with XFoil and committed:

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

## Assets

See [ASSETS.md](ASSETS.md) for credits and licences.
