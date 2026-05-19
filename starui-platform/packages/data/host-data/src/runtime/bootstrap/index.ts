/**
 * Barrel — `bootstrapDataServices` + `DataServices` type.
 *
 * Subpath consumers:
 *   `import { bootstrapDataServices } from '@starui/host-data'`     ← preferred
 *   `import { bootstrapDataServices } from '@starui/host-data/runtime'`
 */

export {
  bootstrapDataServices,
  type BootstrapDataServicesOpts,
  type DataServices,
} from './bootstrap.js';

export {
  createDataServicesClient,
  type CreateDataServicesClientOpts,
} from './createDataServicesClient.js';
