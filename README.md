# AeroAtlas

Forecast-aware planning for outdoor activities. AeroAtlas compares nearby place and time options using available forecast data, then explains the recommendation.

## Project links

- Website: https://joekokku-pixel.github.io/aero-atlas/
- Source code: https://github.com/joekokku-pixel/aero-atlas
- Live assistant API: https://aeroatlas-assistant.ero-tlas-resh.workers.dev/explain
- Health check: https://aeroatlas-assistant.ero-tlas-resh.workers.dev/health

## Features

- WindShift compares forecast conditions across nearby places and times.
- Comfort Window identifies a promising forecast time for an activity.
- What If? Scenario Replay compares an alternative time with the current recommendation.
- GroupFit compares shared activity preferences.
- Ask AeroAtlas explains the displayed forecast comparison with hosted Qwen3.

## Model and AI service

The assistant uses Cloudflare Workers AI model `@cf/qwen/qwen3-30b-a3b-fp8`, used as provided with no fine-tuning or custom adapter. The app calculates its prototype match score from forecast factors; the model only explains the result and does not provide weather data. The hosted Worker runs independently of the developer's computer. Worker source and deployment notes are in `cloudflare-worker/`.

The free Workers AI allocation is limited to 10,000 Neurons per day. Requests may pause until the daily reset if the allowance is exhausted. Do not put API credentials in this public repository.

## Data sources

- Weather forecasts and geocoding: Open-Meteo (https://open-meteo.com/)
- Nearby places and map tiles: OpenStreetMap and Overpass API (https://www.openstreetmap.org/)
- Globe imagery: NASA Blue Marble

The site credits OpenStreetMap as “© OpenStreetMap contributors.” Use of third-party services is subject to their terms, attribution requirements, and rate limits. AeroAtlas does not currently use OpenAQ, WAQI, OpenRouteService, OSRM, or Sunrise-Sunset API.

## Use the website

1. Choose an activity, starting area, date, time window, and search radius.
2. Select **Find my plan**.
3. Review the suggested place and time, score, forecast, map, and feature summaries.
4. Ask AeroAtlas to explain the displayed comparison.

## Run locally

Serve the static site from this directory, for example with `python3 -m http.server 8000`, then open http://localhost:8000. For local AI development only, the optional `local_api.py` uses Ollama; the public website uses the hosted Cloudflare Worker instead.

## Limitations

AeroAtlas is a prototype. Forecast availability and accuracy vary by place and time; forecasts may miss local conditions. Match scores are comparative heuristics, not probabilities, safety ratings, or guarantees. The app does not assess air quality, pollution, route safety, or conditions at an individual venue.
