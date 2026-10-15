# A real radio is the transmitter; the sim is only its receiver

A pilot can fly with their own RC transmitter on a USB sim cable. The cable shows up as a joystick in the Gamepad API, and its axes are the radio's channels. By default the sim treats it as a **receiver**. The radio's channels go to the servos untouched: the sim's rates, expo, trims, flap→elevator mix, throttle hold and stick mode all step aside. A radio profile maps axes to channels, not gimbals, so changing the sim's stick mode can't scramble it. Flaps arrive as a proportional channel.

We chose this so that what a pilot practises in the sim carries over to the field. They fly their own model memory, switches and trim buttons, the way RealFlight does with its "Software Radio" turned off. Sims that are the transmitter themselves (PicaSim, ClearView, most browser sims) apply their own expo on top of the radio's. They can't teach trimming either, because they capture the stick centre, which cancels whatever trim the radio sends.

Radio setup follows the same rule. **Radio setup** finds each channel by moving its control. It scales each axis from a full sweep and takes the centre as the middle of the sweep, never as the stick's rest position. A trim dialled in later therefore reaches the plane. A still check measures the cable's jitter for each stick's deadband and reports any stick that rests off centre.

## Considered options

- **The sim is always the transmitter.** Least setup, but the pilot's radio settings are wasted or applied twice, and you can't practise trimming.
- **WebHID instead of the Gamepad API.** Gives raw channel order, but only in Chrome and Edge, behind a device chooser, with no gain in resolution or latency. The cable already reads as a plain joystick. Revisit only if a real cable's axes come through scrambled or missing.

## Consequences

- One switch per profile, `receiverOnly`, hands shaping back to the sim's transmitter. That covers radios whose trainer output skips their own settings (FlySky Student mode, unverified). Gamepads always go through the sim's transmitter.
- Losing the radio in flight is a receiver **failsafe**: throttle cut, surfaces held, until the radio, another device, the keyboard or the touch sticks is moved to take over.
- Safari only shows a gamepad after a button press, and sim cables have no buttons, so radios need Chrome or Edge. `public/input-probe.html` shows what a browser reads from a cable.
- To practise trimming, an airframe can be built off true (**build tolerances**: seeded, saved per aircraft, recorded like the CG).
