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

Website copy: `index.html`; links and comparison media: `content.js`; styling: `style.css`.
The current replay is selected by `assets/replay/catalog.json`.

This release includes only assets referenced by the current website. The kitchen video
is compressed for web delivery; the original capture is retained in the local source folder.
