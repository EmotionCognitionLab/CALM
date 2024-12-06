import { defineConfig } from 'vite';
import { builtinModules } from "node:module";

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: [...builtinModules, "electron", "better-sqlite3"]
        }
    }
});