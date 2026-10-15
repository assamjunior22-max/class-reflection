// Local test server (NOT used on Netlify): serves /public and runs the API function against a local folder.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
process.env.LOCAL_STORE_DIR ||= path.resolve("./.local-data");
const { default: api } = await import("./netlify/functions/api.mjs");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const out = await api(r); res.writeHead(out.status, Object.fromEntries(out.headers)); return res.end(Buffer.from(await out.arrayBuffer()));
  }
  const f = path.join("public", req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(process.env.PORT || 8888, () => console.log("Local test server on http://localhost:" + (process.env.PORT || 8888)));
