/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import type { App } from "@openfin/workspace";
import { AppManifestType, getCurrentSync } from "@openfin/workspace-platform";

export async function launchApp(
  app: App
): Promise<OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined> {
  if (!app.manifest) {
    console.error(`No manifest was provided for type ${app.manifestType}`);
    return;
  }

  let ret: OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined;

  console.log("Application launch requested:", app);

  switch (app.manifestType) {
    case AppManifestType.Snapshot: {
      const platform = getCurrentSync();
      ret = await platform.applySnapshot(app.manifest);
      break;
    }
    case AppManifestType.View: {
      const platform = getCurrentSync();
      ret = await platform.createView({ manifestUrl: app.manifest });
      break;
    }
    case AppManifestType.External: {
      ret = await fin.System.launchExternalProcess({ path: app.manifest, uuid: app.appId });
      break;
    }
    default: {
      ret = await fin.Application.startFromManifest(app.manifest);
      break;
    }
  }

  console.log("Finished application launch request");
  return ret;
}
