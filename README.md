# Field Visualizer

An interactive electric-field workbench built around one idea: make Coulomb's law easy to see and manipulate.

The simulator supports positive and negative point charges, dragging and precise property editing, live field measurements, undo/redo, saved scenes, four canonical arrangements, and three complementary views:

- vector direction and relative magnitude
- continuous electric field lines
- signed electric potential

Positions are measured in metres, charges in nanocoulombs, field strength in N/C, and potential in volts. The renderer uses the superposition principle with a small visual softening radius at charge centres.

## Run locally

No build step or third-party runtime is required.

```sh
python3 -m http.server 4173 --directory src
```

Then open `http://localhost:4173`.

## Deploy

Publish the `src` directory as a static site. `src/CNAME` is set to `field-visualizer.arjunsahlot.com` for GitHub Pages-compatible deployments.

## Controls

- `V` — move/select tool
- `P` — place a positive charge
- `N` — place a negative charge
- arrow keys — nudge the selected charge (`Shift` for larger steps)
- `Delete` / `Backspace` — remove the selected charge
- `Cmd/Ctrl + Z` — undo
- `Cmd/Ctrl + Shift + Z` — redo

The visual system mirrors [arjunsahlot.com](https://arjunsahlot.com): the same warm-neutral tokens, Geist type, 40rem measure, hairlines, restrained motion, and light/dark theme behavior.
