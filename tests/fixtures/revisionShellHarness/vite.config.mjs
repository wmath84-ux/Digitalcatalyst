import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const root = process.cwd();
const fixture = path.join(root, 'tests/fixtures/revisionShellHarness');
const common = path.join(root, 'tests/fixtures/peekDockHarness/stubs');
const stubs = path.join(fixture, 'stubs.tsx');
export default defineConfig({
  root,
  plugins: [
    {name: 'offline-revision-fixture', enforce: 'pre', resolveId(id) {
      if (/\/(AuthContext|CommerceContext|BrandingContext)$/.test(id)) {
        const name = id.endsWith('AuthContext') ? 'auth' : id.endsWith('CommerceContext') ? 'commerce' : 'branding';
        return path.join(common, name+'.tsx');
      }
      if (/\/(FeatureVisibilityContext|useRevisionAccess|bootstrap|catalogService|PremiumGate)$/.test(id)) return stubs;
      if (id.endsWith('/useUnreadNotificationCount')) return path.join(common, 'unread.ts');
    }}, react(), tailwindcss()
  ],
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'node_modules/.cache/revision-browser', rollupOptions: { input: path.join(fixture, 'index.html') } }
});
