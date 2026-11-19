import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri: dev-сервер должен слушать фиксированный порт (его ждёт `devUrl` в
// src-tauri/tauri.conf.json), а в предпросмотре песочницы — 0.0.0.0.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Предпросмотр песочницы приходит с другим хостом: localhost/127.0.0.1 тут мало.
    allowedHosts: true,
    watch: { ignored: ["**/src-tauri/**", "**/research/**", "**/node_modules/**"] },
  },
  build: {
    // WebView2 на Windows 10/11 — это современный Chromium, но не самый свежий
    target: "chrome105",
    sourcemap: false,
  },
});
