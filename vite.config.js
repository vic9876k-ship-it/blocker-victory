import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.json";
import fs from "fs";

export default defineConfig({
  plugins: [
    crx({
      manifest,
      key: fs.readFileSync("./key.pem")
    })
  ],

  build: {
    target: "esnext",
    minify: false,                    // ← Keep this off while debugging Firebase issues

    rollupOptions: {
     
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        inlineDynamicImports: false       // Important: was causing issues
      }
    }
  },

  optimizeDeps: {
    exclude: ["firebase"]
  }
});