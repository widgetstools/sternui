import { connect, launch } from "@openfin/node-adapter";
import { setDefaultResultOrder } from "node:dns";

async function run(manifestUrl) {
  try {
    let quitRequested = false;
    let quit;

    const fin = await launchFromNode(manifestUrl);

    if (fin) {
      const manifest = await fin.System.fetchManifest(manifestUrl);

      if (manifest.platform?.uuid !== undefined) {
        quit = async () => {
          try {
            if (!quitRequested) {
              quitRequested = true;
              console.log("Calling platform quit");
              const platform = fin.Platform.wrapSync({ uuid: manifest.platform.uuid });
              await platform.quit();
            }
          } catch (err) {
            if (err.toString().includes("no longer connected")) {
              console.log("Platform no longer connected");
              process.exit();
            } else {
              console.error(err);
            }
          }
        };
        console.log(`Wrapped target platform: ${manifest.platform.uuid}`);
      }

      process.on("exit", async () => {
        await quit?.();
      });

      process.on("SIGINT", async () => {
        await quit?.();
      });

      console.log(`Connected to manifest: ${manifestUrl}`);
      console.log(`Press Ctrl + C (Windows) or Command + C (macOS) to quit.`);
    }
  } catch (e) {
    console.error("Error: Connection failed");
    console.error(e.message);
  }
}

async function launchFromNode(manifestUrl) {
  try {
    console.log("Launching manifest...");
    const port = await launch({ manifestUrl });
    const fin = await connect({
      uuid: `dev-connection-${Date.now()}`,
      address: `ws://127.0.0.1:${port}`,
      nonPersistent: true,
    });
    fin.once("disconnected", () => {
      console.log("Platform disconnected");
      process.exit();
    });
    return fin;
  } catch (e) {
    console.error("Error: Failed launching manifest");
    console.error(e.message);
  }
}

console.log("Launch Manifest");
console.log("===============");
console.log(`Platform: ${process.platform}`);

const launchArgs = process.argv.slice(2);
const manifest =
  launchArgs.length > 0 ? launchArgs[0] : "http://localhost:{{port}}/platform/manifest.fin.json";
console.log(`Manifest: ${manifest}`);

try {
  setDefaultResultOrder("ipv4first");
} catch {
  /* older node */
}

run(manifest).catch((err) => console.error(err));
