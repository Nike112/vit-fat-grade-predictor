/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps asset paths relative so the same build works on
// GitHub Pages (served from /<repo>/), Vercel, Netlify or any static host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // Recharts makes the main chunk ~600 kB (≈180 kB gzipped); that's expected.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
