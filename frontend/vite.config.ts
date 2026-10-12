import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import type { Plugin } from "vite";

// Browsers share cookies across ports, and every Frappe site uses the same cookie names (sid, user_id, ...),
// so this app runs on its own hostname: realestate.localhost (resolves to this machine). Its login then never
// touches MicroMax on localhost:5173 / :8000. Plain localhost:7176 redirects there.
const HOST = "realestate.localhost";
const ownHostname = (): Plugin => ({
  name: "realestate-own-hostname",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const host = (req.headers.host ?? "").split(":")[0];
      if (host === "localhost" || host === "127.0.0.1") {
        res.writeHead(302, { Location: `http://${HOST}:7176${req.url ?? "/"}` });
        res.end();
        return;
      }
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv is required so server.proxy sees .env values (process.env alone
  // does not pick up VITE_* from .env inside vite.config).
  const env = loadEnv(mode, process.cwd(), "");
  const frappeUrl = env.VITE_PROXY_TARGET || env.VITE_FRAPPE_URL || "http://localhost:8005";
  const frappeSite = env.VITE_FRAPPE_SITE || "realestate";

  const proxyOpts = {
    target: frappeUrl,
    changeOrigin: true,
    // Multi-tenant Frappe needs the site name as Host (or X-Frappe-Site-Name).
    headers: {
      Host: frappeSite,
      "X-Frappe-Site-Name": frappeSite,
    },
    // Rewrite Set-Cookie so the browser keeps cookies for realestate.localhost:7176.
    cookieDomainRewrite: "",
    secure: false,
  };

  return {
    plugins: [react(), ownHostname()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 7176,
      strictPort: true,
      host: true,
      allowedHosts: [HOST, "localhost"],
      // Proxy API / files / socket.io to ERPNext so the browser stays same-origin
      // (no CORS) and the Frappe session cookie works.
      proxy: {
        "/api": proxyOpts,
        "/files": proxyOpts,
        "/private": proxyOpts,
        "/assets": proxyOpts,
        // Frappe's Socket.IO server (bench socketio, :9000). Keep the browser's Host so it matches Origin; the site
        // comes from X-Frappe-Site-Name and the namespace "/realestate".
        "/socket.io": { target: env.VITE_SOCKETIO_TARGET || "http://localhost:9000", ws: true, changeOrigin: false,
          headers: { "X-Frappe-Site-Name": frappeSite } },
        // Desk form and print view, opened from the React forms' Actions menu (same session cookie).
        "/app": proxyOpts,
        "/desk": proxyOpts,
        "/printview": proxyOpts,
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-frappe": ["frappe-react-sdk", "swr", "axios"],
            "vendor-charts": ["recharts"],
          },
        },
      },
    },
  };
});
