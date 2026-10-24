const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const MAX_BODY_BYTES = 12_000;
const ALLOWED_ORIGINS = new Set(["https://joekokku-pixel.github.io", "http://localhost:8000", "http://127.0.0.1:8000"]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
  if (!origin || ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin || "*";
  return headers;
}
function json(request, status, data) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/health" && request.method === "GET") return json(request, 200, { ok: true, model: MODEL });
    if (url.pathname !== "/explain" || request.method !== "POST") return json(request, 404, { error: "Not found" });
    const origin = request.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, 403, { error: "This site is not allowed to use the AeroAtlas assistant." });
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json(request, 413, { error: "The request is too large." });
      const body = JSON.parse(rawBody || "{}");
      const question = String(body.question || "").trim().slice(0, 500);
      if (!question) return json(request, 400, { error: "Please enter a question." });
      let evidence = "{}";
      try { evidence = JSON.stringify(body.context ?? {}).slice(0, 6_000); } catch { evidence = "{}"; }
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "You are AeroAtlas, an outdoor-planning assistant. Explain the supplied forecast comparison in plain language. Use only facts in the supplied app context. Never invent weather, places, routes, pollution, or safety details. A match score is a prototype heuristic, not a probability or safety rating. If information is missing, say so. Answer in at most three short sentences." },
          { role: "user", content: `App context (JSON): ${evidence}\n\nQuestion: ${question}\n/no_think` },
        ],
        max_tokens: 180,
        temperature: 0.3,
      });
      const answer = result?.choices?.[0]?.message?.content?.trim();
      return json(request, 200, { answer: answer || "I couldn't explain this comparison from the available data." });
    } catch {
      return json(request, 503, { error: "The hosted AI service is temporarily unavailable. Please try again shortly." });
    }
  },
};
