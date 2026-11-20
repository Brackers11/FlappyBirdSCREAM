# SCREAM

A Flappy-style game controlled only by your voice.

## Play
Serve the folder over localhost or HTTPS (mic access requires it):

    python3 -m http.server 8000

Open http://localhost:8000, click once to allow the mic, then follow calibration
(stay quiet, then scream). After that it's hands-free: make noise to start,
shout to restart.

- **Volume = lift** (default): the louder you are, the harder the bird rises.
- **Volume = flap**: each burst of sound is a flap.

Use the sensitivity slider or "Recalibrate" if your room is noisy.
