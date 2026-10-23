# Neural Racers — Web Edition

A browser-based, 3D AI racing lab inspired by the supplied racing-game reference. Vehicles are deliberately simple low-poly models. Cars are controlled by independent feed-forward neural networks; their seven virtual distance sensors drive steering, throttle and braking. At generation end, the measured fitness scores are ranked, top agents are preserved, and mutated descendants form the next population.

## Run it

This is a static web app using Three.js from a CDN, so an internet connection is required the first time it loads.

**Recommended (Python installed):**
```bash
cd neural-racers-web
python -m http.server 8000
```
Open `http://localhost:8000`.

You can also use VS Code's Live Server extension on `index.html`. Opening the file directly may be blocked by browser ES-module security.

## Controls

- **Start / Pause** — run or pause the simulation.
- **Step frame** — advance one simulation update.
- **Reset** — reset the current generation.
- **New track** — create a procedurally generated circuit.
- Population, complexity, road width and speed sliders configure the simulation.
- Toggle sensors, labels, trails and car-to-car collisions.
- Choose Beginner, Technical, Hairpin, High-speed or Random track.
- Select an agent in the leaderboard to inspect its current network inputs and outputs.
- Save best model downloads a JSON network; Load model JSON seeds a population from it.
- Export experiment CSV downloads recorded generation history.
- Restart experiment clears history after confirmation.

## Learning details

The network has 7 sensor inputs, 10 hidden units and 3 outputs. Sensor values are normalized ray distances. The outputs are steering, throttle and brake. Fitness is accumulated from forward progress, speed while moving and ordered route progress, with penalties for leaving the road and collisions. A completed lap receives a bonus. At generation end, the top 12% are copied without mutation; the rest are cloned from higher-ranked parents and mutated.

All displayed fitness and history values are measured from simulation state. A generation history entry is created only when all agents finish or time out. There is no guarantee of monotonic improvement; neuroevolution can fail or regress.

## Notes and limitations

This is a functional web-game implementation of the core idea, rather than a one-to-one implementation of every item in the attached desktop-app specification. It uses Three.js and JavaScript to satisfy the web-game direction. It includes simple 3D rendering, vehicle movement, sensors, neural inference, evolution, track presets, selectable agents, model JSON save/load, and CSV history export. More advanced track-boundary collision geometry, robust checkpoint ordering/lap validation, true physically-based tire slip, configurable selection strategies, and automated test coverage remain future improvements. Browser performance depends on the device and population settings.
