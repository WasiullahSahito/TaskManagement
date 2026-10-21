import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target:
          "https://task-management-git-main-wasi1237585-gmailcoms-projects.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});