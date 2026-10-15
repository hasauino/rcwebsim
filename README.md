# RC Flight Sim

Fly a radio-controlled Piper Cub in your browser, from the pilot station like a real RC pilot.

**▶ Play: <https://hassan.umari.dev/rcwebsim/>**

![PA-18 Super Cub on the runway](docs/screenshot.png)

Install it from the browser's address bar to play offline as an app.

Built with Vue, three.js (WebGPU) and Rapier, plus a custom aerodynamics model, so the 1.7 m PA-18 flies like the real foam model.

## Controls

| Key       | Action                      |
| --------- | --------------------------- |
| `W` / `S` | Throttle                    |
| `←` `→`   | Aileron                     |
| `↑` `↓`   | Elevator (↓ = nose up)      |
| `A` / `D` | Rudder                      |
| `F`       | Flaps                       |
| `R` / `T` | Reset on runway / air start |
| `C`       | Pilot / chase camera        |
| `Q`       | Walk mode on / off          |
| `B`       | Back to the pilot station   |
| `V`       | Full screen                 |
| `Esc`     | Settings                    |

In full screen, Chrome and Edge keep `Esc` for Settings: hold it to leave full screen. Firefox and Safari leave full screen on `Esc`.

In walk mode, `W` `A` `S` `D` walk you round the field to watch from somewhere else (hold `Shift` to run) instead of flying throttle and rudder. The throttle stays where you left it, the arrow keys still fly aileron and elevator, and a gamepad or transmitter still flies everything.

Gamepads and USB RC transmitters work too. Set them up in Settings → Controls.

On a phone or tablet, fly with the on-screen touch sticks. Wherever your thumb lands on a pad is centre. The throttle stays where you leave it. Settings → Controls can show them always or never.

Tip: it's a taildragger, so hold a little right rudder on the takeoff roll.

## Run locally

```bash
npm install
npm run dev   # http://localhost:5173
npm test
```

## More

- [docs/adr/](docs/adr/): design decisions
- [AGENTS.md](AGENTS.md) and [docs/agents/](docs/agents/): notes for coding agents
- [GLOSSARY.md](GLOSSARY.md): terms
- [ASSETS.md](ASSETS.md): credits. The PA-18 model is by helijah (CC-BY 4.0).
