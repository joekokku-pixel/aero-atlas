# AeroAtlas assistant deployment

The public AeroAtlas website uses a Cloudflare Worker for Qwen3 explanations. The Worker runs on Cloudflare and does not depend on the developer's Mac being online.

## Live service

- Explain endpoint: https://aeroatlas-assistant.ero-tlas-resh.workers.dev/explain
- Health check: https://aeroatlas-assistant.ero-tlas-resh.workers.dev/health
- Model: Cloudflare Workers AI @cf/qwen/qwen3-30b-a3b-fp8

## Deploy or update

1. Sign in to the Cloudflare account that owns the Worker.
2. Install Node.js, then open a terminal in this directory.
3. Run: npx wrangler login
4. Approve the Cloudflare sign-in in your browser.
5. Run: npx wrangler deploy
6. Confirm the /health endpoint returns ok and the model name.
7. Keep the public site's config.js pointed at the Worker /explain URL.

Never commit Cloudflare API tokens or credentials. The Workers AI free allocation is limited to 10,000 Neurons per day; requests can pause after that allowance is used until the daily reset. The model explains the app-supplied forecast context; it does not fetch weather or calculate the match score.
