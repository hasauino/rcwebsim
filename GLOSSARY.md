# RC Flight Sim

A browser simulator for flying a radio-controlled model aircraft from the ground, the way RC pilots actually fly.

## Field and flight session

**Hangar**:
Where every visit begins: the pilot's open home garage on a sunny morning, made over as an RC workshop. The chosen aircraft stands in the sun patch, with the aircraft to choose from beside it, and Fly. The last one chosen is preselected. Back to hangar in the settings returns here.
_Avoid_: start screen, menu, lobby

**Loading screen**:
What shows while the hangar loads, on every visit and on the way back from a flight: a small plane flying, a progress bar and piloting tips. It gives way to the hangar once the room and the plane are up, and the rest of the hangar arrives while the pilot looks round. On a slow connection the pilot may go in earlier.
_Avoid_: splash, preloader

**Field**:
The club flying site: mown runway, pilot station, safety fence, tree lines, hills beyond.
_Avoid_: map, level, world

**Pilot station**:
The fixed spot beside the runway where the pilot stands and flies by line of sight.
_Avoid_: spawn point, camera position

**Pilot view**:
Looking at the aircraft from where the pilot stands, the pilot station unless they have walked off; the default way to fly.
_Avoid_: ground camera, tower view

**Walk mode**:
The pilot walking the field on foot to watch from somewhere else, while the aircraft keeps flying. It moves the pilot view, never the flight in progress; the next hand launch is thrown from where they stand.
_Avoid_: free camera, fly-cam

**Chase view**:
A camera following behind the aircraft.
_Avoid_: third-person camera, follow cam

**Runway start**:
Beginning a flight at rest at the end of the runway, ready for takeoff.

**Air start**:
Beginning a flight already airborne in the circuit at a flying speed.
_Avoid_: air spawn, mid-air reset

**Hand launch**:
Beginning a flight thrown from the pilot's raised hand where they stand, at full power, down the runway heading. How hard they throw is the _launch speed_; too weak a throw sinks back to the ground.
_Avoid_: throw start, catapult

**Crash**:
The airframe (not the wheels) hitting something hard enough to break a foam model; power is cut until reset.

**Recording**:
A flight captured as its starting conditions plus the pilot's inputs, enough to replay it exactly.
_Avoid_: replay file, log

## Radio

**Transmitter**:
The pilot's radio: sticks and switches whose settings turn stick positions into channels.
_Avoid_: controller, remote

**Sim cable**:
A USB dongle plugged into a transmitter's trainer port that turns its PPM signal into a joystick, so the pilot's own radio flies the sim. Each of its axes is a channel, not a gimbal.
_Avoid_: flight controller, USB controller, adapter

**Radio setup**:
Finding which axis of a sim cable carries each channel by moving that control, then scaling each axis from a full sweep. The centre is the middle of the sweep, so the radio's trims survive.
_Avoid_: calibration (for a radio), centre capture

**Gimbal**:
One stick axis on the transmitter (left/right stick, horizontal/vertical).
_Avoid_: axis, joystick axis

**Touch sticks**:
On-screen pads that stand in for the transmitter's gimbals on a touch screen; the throttle gimbal stays where the thumb leaves it.
_Avoid_: virtual joystick

**Stick mode**:
Which gimbal drives which channel; Mode 2 puts throttle and rudder on the left stick.

**Channel**:
One control output the aircraft responds to: aileron, elevator, rudder, throttle or flap.
_Avoid_: input, axis

**Dual rates**:
A switch selecting full (high) or reduced (low) control travel.

**Expo**:
A curve that softens control response around stick centre.

**Trim**:
A small persistent offset on a channel so the aircraft flies straight hands-off.

**Throttle hold**:
A safety switch that forces the motor off regardless of the throttle stick.

**Flap switch**:
A three-position switch setting flaps up, half or full.

**Receiver**:
The aircraft's radio receiver: it passes the transmitter's channels to the servos. With a radio on a sim cable, the sim is only the receiver.

**Channel monitor**:
The receiver's channels shown as servo pulse widths (1000–2000 µs), the way a radio's servo display shows them.

**Failsafe**:
What the receiver does when the transmitter is lost: throttle cut, surfaces held where they were.
_Avoid_: disconnect, signal loss (for the response itself)

**Mix**:
One channel adding to another, e.g. down elevator added as flaps deploy.

**Flight controller**:
On-board electronics between receiver and servos that may modify channels (gyro stabilisation); currently passes them through.
_Avoid_: autopilot, stabiliser (for the stage itself)

**Servo**:
The actuator that moves a control surface, with finite speed and some slop.

**Build tolerances**:
How far one airframe's control surfaces sit off neutral with the servos centred, as a real build leaves them; trimming cancels them.
_Avoid_: random offsets, noise

## Airframe

**Datum**:
The reference point all aircraft geometry is measured from: the wing root leading edge on the centreline.

**Body frame**:
Axes fixed to the aircraft: right wing, up, and tail-ward (the nose points opposite).

**Lifting surface**:
A wing, stabiliser or fin: anything that makes lift from its angle to the airflow.

**Strip**:
A spanwise slice of a lifting surface that sees its own local airflow.
_Avoid_: panel, element, section (for the slice)

**Control surface**:
A hinged part of a lifting surface moved by a servo: aileron, flap, elevator, rudder.

**Throw**:
How far a control surface deflects at full stick on high rates, measured at its trailing edge as RC manuals do.

**Decalage**:
The difference between wing and stabiliser incidence; it sets the hands-off trim speed.

**CG** (centre of gravity):
The balance point, given as a distance behind the wing's leading edge as RC manuals do. The pilot moves it fore and aft, like sliding the battery in its bay; the weight stays the same.
_Avoid_: COG, balance point (in code)

**Nose heavy / tail heavy**:
A CG ahead of / behind the manual's recommended range. Within it the aircraft is _centered_.

**Ground attitude**:
The nose-up angle a taildragger sits at on its three wheels.

**Trainer / aerobat**:
An aircraft's role. A trainer is stable and self-righting (dihedral, flat-bottomed wing); an aerobat is neutral (no dihedral, symmetric wing) and goes where it is pointed.

**Provenance**:
Where an aircraft number came from: sourced, derived, estimated or tuned.

## Flight physics

**Polar**:
An airfoil's lift, drag and pitching-moment coefficients across angle of attack and Reynolds number.

**Slipstream**:
The accelerated, swirling air behind the propeller that blows over the tail and wing root.
_Avoid_: prop wash, wash

**Downwash**:
The downward deflection of air behind the wing that reduces the tail's angle of attack.

**Induced angle**:
The reduction in effective angle of attack caused by a finite wing's trailing vortices.

**P-factor**:
The yawing moment from the propeller's descending blade taking a bigger bite of air at an angle of attack.

**Trim speed**:
The airspeed the aircraft settles at hands-off for a given elevator and throttle.

**Neutral point**:
The CG position at which pitch stability is lost: ahead of it the aircraft returns to its trimmed angle of attack, behind it no elevator setting holds one. Shown as the _lift point_ in the Balance settings.
_Avoid_: centre of lift, aerodynamic centre (for the whole aircraft)

**Static margin**:
How far the CG sits ahead of the neutral point, as a fraction of the wing's mean chord.

**Short period**:
The quick, heavily damped pitch oscillation after a disturbance, seen in angle of attack.

**Phugoid**:
The slow exchange of speed and height after a disturbance, seen in pitch and airspeed.

**Sideslip**:
The angle between the airflow and the aircraft's nose in the horizontal body plane; a pilot holds it with the rudder.
_Avoid_: beta (in prose; `betaDeg` in code)

**Axial roll**:
A roll on the ailerons alone in which the nose stays on its line: no heading or height wandering off as it goes round.
_Avoid_: barrel roll (that is a different manoeuvre)

**Knife edge**:
Flying wings vertical, held up by top rudder: the fuselage's side force at a sideslip carries the weight. How much aileron and elevator it also needs is its _coupling_.

**Load factor**:
Lift-axis force relative to weight; 1 G in level flight.
_Avoid_: G-force (in code and docs)

**Flight envelope**:
The set of measurable behaviours the aircraft must reproduce: ground attitude, static thrust, glide, cruise, stall, roll rate, stability, takeoff, crash.
