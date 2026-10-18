# GEMS project website

Generative Embodied Multiple Behavior Control Systems for Human-like Agents.

Static research website with comparison videos and an interactive Three.js replay.

## Preview locally

```sh
python3 -m http.server 8080
```

## Publish

In the GitHub repository, enable **Settings → Pages → Source: GitHub Actions**.
The included workflow publishes changes pushed to `main`.

## Interactive camera

Click the scene to focus it. Hold W/A/S/D to move, Q/E to move down/up,
and Shift to move faster. Drag to look around in Walk mode. On-screen direction
buttons support holding on touch screens. Orbit mode retains orbit/zoom/pan;
Recorded mode follows the captured camera. Reset view returns to Walk mode.
Outer scene boundaries are inferred from the exported static geometry, including hidden walls and roofs. Scene options provides a toggle to disable the guardrails.

Website copy: `index.html`; links and comparison media: `content.js`; styling: `style.css`.
The current replay is selected by `assets/replay/catalog.json`.

This release includes only assets referenced by the current website. The kitchen video
is compressed for web delivery; the original capture is retained in the local source folder.
