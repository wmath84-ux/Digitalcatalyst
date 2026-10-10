import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export const fixture = "/tests/fixtures/settingsPaidHarness/index.html";
const io = "/tests/fixtures/settingsPaidHarness/io.ts";
const boundaries = {
  AuthContext: `export {useAuth} from '${io}';`,
  CatalogContext: `export {useCatalog} from '${io}';`,
  CommerceContext: `export {useCommerce} from '${io}';`,
  BrandingContext: `export {useBranding} from '${io}';`,
  firebase: `export {auth,db,getFirebaseStorage} from '${io}';`,
  apiBase: `export {apiFetch} from '${io}';`,
  webPush: `export {ensureSavedWebPushSubscription,getCurrentPushSubscription,isWebPushSupported,subscribeToWebPush,showLocalSystemNotification,getBrandNotificationIcon} from '${io}';`,
  firestore: `export {doc,collection,query,where,onSnapshot,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,addDoc,limit,orderBy,increment,writeBatch,Timestamp} from '${io}';`,
  capacitorCore: `export {FakeCapacitor as Capacitor} from '${io}';`,
  capacitorPush: `export {FakePushNotifications as PushNotifications} from '${io}';`,
  capacitorLocal: `export {FakeLocalNotifications as LocalNotifications} from '${io}';`,
  featureAnalytics: `export const trackFeatureEvent=()=>{};`,
};
export async function createSettingsPaidServer({ port = 0, preview = false } = {}) {
  const server = await createServer({
    configFile: false, root: process.cwd(), resolve: { alias: { "@": path.resolve("src") } },
    plugins: [react(), tailwindcss(), {
      name: "settings-paid-io-boundaries", enforce: "pre",
      resolveId(id) {
        const name = id === "firebase/firestore" ? "firestore" : id === "@capacitor/core" ? "capacitorCore"
          : id === "@capacitor/push-notifications" ? "capacitorPush" : id === "@capacitor/local-notifications" ? "capacitorLocal" : id.split("/").at(-1);
        if (Object.hasOwn(boundaries, name)) return "\0settings-paid:" + name;
      },
      load(id) { if (id.startsWith("\0settings-paid:")) return boundaries[id.slice("\0settings-paid:".length)]; },
      ...(preview ? { configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/") { res.writeHead(302, { Location: fixture + "?page=settings&preview&shell" }); res.end(); }
          else next();
        });
      } } : {}),
    }],
    server: { host: "0.0.0.0", allowedHosts: true, port }, logLevel: "error",
  });
  await server.listen();
  return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` };
}
