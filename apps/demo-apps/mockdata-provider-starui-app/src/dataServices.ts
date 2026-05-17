import { createDataServicesClient } from '@starui/data-services';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';

type Bundle = ReturnType<typeof createDataServicesClient>;

let bundle: Bundle | null = null;
let bootstrapError: Error | null = null;

try {
  bundle = createDataServicesClient({
    appName: 'mockdata-provider-starui-app',
    userId: LOGGED_IN_USER_ID,
  });
} catch (err) {
  bootstrapError = err instanceof Error ? err : new Error(String(err));
}

export const dataServices: Bundle | null = bundle;
export const dataServicesBootstrapError: Error | null = bootstrapError;
