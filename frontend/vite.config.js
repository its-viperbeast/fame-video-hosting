import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // shortcut: quiets the 500 kB warning; split routes if the JS chunk passes ~700 kB.
  build: {
    chunkSizeWarningLimit: 700,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
