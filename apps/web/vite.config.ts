import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_PROXY_TARGET || "http://localhost:3001";
  const renderSecret = env.VITE_DEV_RENDER_SECRET || "change-me-in-prod";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        // Frontend → API. Set VITE_DEV_PROXY_TARGET to the running API origin.
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/uploads": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/pdfs": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        // Internal render route — locked to 127.0.0.1 + secret on the API side.
        // Dev proxy lives on localhost so the loopback check passes; we inject the
        // shared INTERNAL_RENDER_SECRET header so the iframe preview works.
        "/render": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("x-internal-render-secret", renderSecret);
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
