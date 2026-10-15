# Project context: agreed scope, current state, open work

Read when planning new work or judging whether something is in scope. The design was settled with the owner in a structured interview. Decisions that are hard to reverse are in `docs/adr/`. This file records the rest of the agreed scope.

## Agreed scope (v1)

| Area              | Decision                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fidelity          | High: the plane should fly like a real RC model, not an arcade game. Prefer modelling the physical cause over adding a fudge factor.                                         |
| Aircraft          | One electric high-wing trainer: the FMS 1700 mm PA-18 Super Cub (a taildragger, with flaps), drawn with helijah's CC-BY PA-18 model.                                         |
| Field             | One club field, about 2 km across: mown runway, pilot station, fence, tree lines that collide, gentle hills.                                                                 |
| Platform          | Desktop browsers first; phones and tablets fly with on-screen touch sticks. Target 60 fps on a mid-range laptop's integrated GPU.                                            |
| Cameras           | Pilot view (default, with auto-zoom) and chase view. Walk mode moves the pilot round the field by keyboard; touch walking is not built.                                      |
| Input             | Keyboard, touch sticks, and the Gamepad API for gamepads and for the pilot's own radio on a USB sim cable. The radio is the transmitter and the sim its receiver (ADR-0012). |
| Transmitter       | Mode 2 default (1–4 selectable), dual rates, expo, trims, throttle hold, 3-position flap switch, optional flap→elevator mix. Saved per aircraft in `localStorage`.           |
| Flight controller | An empty pass-through stage now. AS3X/SAFE-style stabilisation is planned for later.                                                                                         |
| Wind              | Steady wind plus Dryden turbulence. Wind shear, tree turbulence and thermals are planned for later.                                                                          |
| Crashes           | Detect, show a message, reset by key. Planned for later: break-apart, then cumulative damage.                                                                                |
| Lighting          | A fixed sunny afternoon. The sun direction is one value (`SUN` in `render/sky.ts`) so a time-of-day setting can drive it later.                                              |
| UI                | Boots straight into the field. Settings overlay plus HUD. No menu flow until there is a second aircraft or field.                                                            |
| Spawns            | Runway start (default) and air start. No hand launch.                                                                                                                        |
| Recording         | Recorded for tests and download only. No playback UI in v1.                                                                                                                  |
| Audio             | Basic synthesised motor and prop sound.                                                                                                                                      |
| Tooling           | npm, Vite, TS strict, ESLint and Prettier, Vitest, Husky pre-commit (lint-staged, typecheck, tests). Deploys to GitHub Pages from `main`.                                    |

The owner tends to accept well-argued recommendations. Bring a recommendation with each question rather than an open menu.

## Current state

- **Headless sim core.** All tests pass: aircraft validation, flight envelope, recording and replay, plus the touch sticks in `src/input/`.
- **Balance.** The pilot can move the CG in settings (side view, lift point, draggable CG). It is saved per aircraft and recorded in flights.
- **Real radios.** A transmitter on a USB sim cable flies as the transmitter, with the sim as its receiver (ADR-0012): radio setup by moving each control, switches on axes, a channel monitor and a receiver failsafe. "Airframe needs trimming" (Balance tab) builds the plane off true so there is trimming to practise. Not yet tried with a real cable.
- **Browser app** deployed at https://hassan.umari.dev/rcwebsim/. It is an installable PWA and plays offline after the first load.
- **PA-18 tuning.** Hands-off glide about 12.5 m/s. 1 g clean stall 7.4 m/s. Top speed about 26 m/s. Static thrust about 3.2 kg on a full pack. Roll rate about 125°/s.

## Open work, roughly by value

1. **Animated control surfaces and prop.** The PA-18 export is merged per material. Split the ailerons, flaps, elevator, rudder and prop in Blender with pivots on the hinge lines, re-export, and bind them in `model.nodes`.
2. **FMS manual citation.** The `FMS_MANUAL` source in `pa18.ts` is a truncated path. Find the full URL.
3. **Cruise test.** It holds altitude with an autopilot rather than solving for trim, and its bands are wide (cruise 14–23 m/s, roll 60–220°/s). Tighten them once there is better data.
4. **Gear behaviour while rolling.** Contact flickers when the plane is light on its wheels at speed. It's harmless so far, but watch it when tuning the ground run.
5. **Real-hardware checks.** Run `input-probe.html` with a FlySky FS-i6/i6X and its sim cable in Chrome on macOS, in normal and in Student mode. That settles whether the radio's trims reach the trainer port, and so whether `receiverOnly` can stay the default. Then fly radio setup with it, try a gamepad, and measure fps on a mid-range laptop.
6. **Servo transport delay** ([#1](https://github.com/hasauino/rcwebsim/issues/1)): model the dead time before a servo moves, and source real servo numbers.
7. **Later features from the agreed list.** Stabiliser modes, time of day, wind shear and thermals, break-apart crashes, a second aircraft or field, replay UI.
