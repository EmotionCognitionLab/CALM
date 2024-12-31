import { defineConfig } from 'vite';
import { builtinModules } from "node:module";
import { execSync } from 'node:child_process';
const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trimEnd();
process.env.VITE_GIT_BRANCH_NAME = branchName;

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: [...builtinModules, "electron", "better-sqlite3", "dayjs"]
        }
    }
});