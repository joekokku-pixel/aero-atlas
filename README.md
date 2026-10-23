# AeroAtlas

**Forecast-aware planning for outdoor activities.** AeroAtlas compares available places and forecast time windows, then presents a recommendation with the weather information behind it.

## Project links

- **Website:** https://joekokku-pixel.github.io/aero-atlas/
- **Source code:** https://github.com/joekokku-pixel/aero-atlas
- **Base model:** [Qwen/Qwen3-1.7B on Hugging Face](https://huggingface.co/Qwen/Qwen3-1.7B)

## Features

- **WindShift:** compares how forecast conditions affect options across available times.
- **Comfort Window:** identifies a promising forecast window for a selected activity.
- **What If? Scenario Replay:** compares a selected alternative time against the current recommendation.
- **GroupFit:** compares shared activity preferences when planning an outing.
- **AI explanations:** answers questions about the displayed comparison using Qwen3-1.7B.

## Model and AI service

AeroAtlas uses the pretrained **Qwen3-1.7B** model through [Ollama](https://ollama.com/). The model is used as provided; no fine-tuning or custom adapter was created. The application calculates the prototype match score from available forecast information. Qwen3 explains the displayed result in plain language; it is not the source of weather or map data.

The Qwen3-1.7B model repository lists the **Apache-2.0** license. Refer to the model card for model-specific terms and details.

### Demo API endpoint

`https://politics-wrestling-dad-pontiac.trycloudflare.com/explain`

The endpoint is a temporary Cloudflare Quick Tunnel that forwards requests to the AeroAtlas API running on the host computer. It is available only while Ollama, the API server, the tunnel, and the host computer are running. The URL can change when the tunnel restarts; update `config.js` and this README with the newly generated URL.

## Data sources

- **Weather forecasts and geocoding:** [Open-Meteo](https://open-meteo.com/)
- **Nearby places and map data:** [OpenStreetMap](https://www.openstreetmap.org/) via the Overpass API and OpenStreetMap map tiles
- **Globe visualization:** NASA Blue Marble imagery

The website displays **© OpenStreetMap contributors** attribution beside the map and in the source credits. Use of these services remains subject to each provider's attribution requirements, terms of use, and rate limits. AeroAtlas currently does not use OpenAQ, WAQI, OpenRouteService, OSRM, or Sunrise-Sunset API.

## Using the website

1. Open the [AeroAtlas website](https://joekokku-pixel.github.io/aero-atlas/).
2. Select an outdoor activity, starting area, date, time window, and search radius.
3. Select **Find my plan** to view the available comparison and recommendation.
4. Review the place-and-time result, score, forecast details, map, and feature summaries.
5. Enter a question in **Ask AeroAtlas** to request an explanation of the displayed forecast comparison.

## Running the prototype locally

### Requirements

- Python 3
- [Ollama](https://ollama.com/download)
- `cloudflared` for a temporary public AI endpoint ([installation instructions](https://developers.cloudflare.com/tunnel/downloads/))

### Start the AI service

From the project directory:

1. Download Qwen3-1.7B with `ollama pull qwen3:1.7b`.
2. Start the AeroAtlas API with `python3 local_api.py`. It listens on `http://localhost:8001` and sends requests to Ollama.
3. In a separate terminal, expose the API for a public demo with `cloudflared tunnel --url http://localhost:8001`.
4. Copy the generated tunnel address into `config.js`, appending `/explain`, for example:

   ```js
   window.AEROATLAS_API_URL = "https://your-tunnel.trycloudflare.com/explain";
   ```

5. Keep Ollama, the API process, the tunnel, and the host computer running while using the AI assistant.

### Serve the frontend locally

In a separate terminal, from the project directory, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. The frontend can also be viewed on GitHub Pages; the AI assistant still depends on the API endpoint described above.

## Limitations

AeroAtlas is a prototype. Forecast availability and accuracy vary by location and time, and forecasts may not reflect local conditions. Match scores are comparative prototype heuristics, not probabilities, safety ratings, or guarantees. The application does not evaluate air quality, traffic pollution, route safety, or real-time conditions at an individual venue.
