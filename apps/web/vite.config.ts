import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/pdfs": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
