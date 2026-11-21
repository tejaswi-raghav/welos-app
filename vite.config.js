import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Serves the Vercel functions in /api during `npm run dev`, so location search,
// climate lookup and the AI advisor work locally exactly as they do on Vercel.
function vercelApi() {
  return {
    name: "welos-vercel-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let url;
        try { url = new URL(req.url, "http://localhost"); } catch { return next(); }
        const match = url.pathname.match(/^\/api\/([a-z-]+)$/);
        const file = match && resolve(__dirname, "api", `${match[1]}.js`);
        if (!file || !existsSync(file)) return next();
        let raw = "";
        for await (const chunk of req) raw += chunk;
        req.query = Object.fromEntries(url.searchParams);
        try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return res; };
        try {
          const { default: handler } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
          await handler(req, res);
        } catch (error) {
          server.config.logger.error(error.stack || String(error));
          if (!res.headersSent) res.status(500).json({ error: "Local API error." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vercelApi()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        studio: resolve(__dirname, "studio.html"),
        control: resolve(__dirname, "control.html"),
      },
    },
  },
});
