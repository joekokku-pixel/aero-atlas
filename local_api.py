"""Small local AeroAtlas API that forwards questions to Ollama."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = "0.0.0.0"
PORT = 8001
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "qwen3:1.7b"


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "model": MODEL})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/explain":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 12000)
            request_data = json.loads(self.rfile.read(length) or b"{}")
            question = str(request_data.get("question", ""))[:500].strip()
            context = request_data.get("context", {})
            if not question:
                self.send_json(400, {"error": "Please enter a question."})
                return

            evidence = json.dumps(context, ensure_ascii=False, separators=(",", ":"))[:6000]
            payload = {
                "model": MODEL,
                "stream": False,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are AeroAtlas, an outdoor-planning assistant. Explain the supplied forecast comparison in plain language. "
                            "Use only facts in the supplied app context. Never invent weather, places, routes, pollution, or safety details. "
                            "A match score is a prototype heuristic, not a probability or safety rating. If information is missing, say so. "
                            "Answer in at most three short sentences."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"App context (JSON): {evidence}\n\nQuestion: {question}",
                    },
                ],
                "options": {"num_predict": 160},
            }
            ollama_request = Request(
                OLLAMA_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(ollama_request, timeout=180) as response:
                result = json.loads(response.read())
            answer = result.get("message", {}).get("content", "").strip()
            self.send_json(200, {"answer": answer or "I couldn't explain this comparison from the available data."})
        except HTTPError as error:
            self.send_json(502, {"error": f"Ollama returned an error ({error.code}). Check that {MODEL} is installed."})
        except (URLError, TimeoutError):
            self.send_json(503, {"error": f"Ollama is not responding. Start Ollama and make sure {MODEL} is installed."})
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "The request was not valid JSON."})
        except Exception as error:
            self.send_json(500, {"error": "The local AI server hit an unexpected error."})

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    print(f"AeroAtlas AI API listening on http://localhost:{PORT} using {MODEL}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
