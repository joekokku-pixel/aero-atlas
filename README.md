# AeroAtlas

A small outdoor-planning prototype. Its static website can be published with GitHub Pages. The AI assistant uses Qwen3-1.7B running locally through Ollama; a temporary Cloudflare Quick Tunnel can make the local AI endpoint reachable for a live demo.

## Free local AI setup

1. Install [Ollama for Mac](https://ollama.com/download/mac).
2. In Terminal, run `ollama run qwen3:1.7b`. The first run downloads the model (about 1.4 GB). Exit the model chat with `/bye`; leave Ollama running.
3. From this folder, run `python3 local_api.py`. This starts the small API that connects the browser app to Ollama at `http://localhost:11434`.
4. In another terminal, install [cloudflared](https://developers.cloudflare.com/tunnel/downloads/) if needed, then run `cloudflared tunnel --url http://localhost:8001`.
5. Copy the generated `https://....trycloudflare.com` URL, add `/explain`, and put it in `config.js`:

   ```js
   window.AEROATLAS_API_URL = "https://your-generated-name.trycloudflare.com/explain";
   ```

The tunnel URL is temporary and changes when the tunnel restarts. Keep Ollama, the local API, the tunnel, and your Mac running during the demo. Quick Tunnels are for testing and have no uptime guarantee.

## Demo API endpoint

`https://politics-wrestling-dad-pontiac.trycloudflare.com/explain`

This temporary endpoint forwards requests to the local Qwen3-1.7B API. It is available only while the host Mac, Ollama, the AeroAtlas API, and the Cloudflare tunnel are running. The URL may change when the tunnel restarts; update `config.js` and this README if it does.

## Publish the website

Publish this folder to a public GitHub repository. In the repository, select **Settings → Pages → GitHub Actions**. The included workflow publishes the website on every push to `main`. If you update `config.js`, commit and push again.

## Model and data

- Model: [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B), run locally with Ollama.
- Weather and geocoding: Open-Meteo.
- Places and map: OpenStreetMap contributors via Overpass API and map tiles.
- Match scores are prototype heuristics, not probabilities or safety ratings. The prototype does not assess air quality, traffic pollution, or route safety.
