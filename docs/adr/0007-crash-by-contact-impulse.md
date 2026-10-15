# Crashes are judged by contact impulse, not contact force

A crash is when airframe contact impulse summed over the last 0.1 s exceeds `mass × crashSpeed` (3 m/s for the PA-18). Wheels never count, because the gear is raycast and not a collider.

At 500 Hz, Rapier's contact force is impulse ÷ 2 ms, so a 0.15 m/s bump of a 2 kg plane already reads 150 N. A force threshold either crashed the plane whenever the tail slammed down or let real crashes through.
