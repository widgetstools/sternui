/**
 * Barrel — `bootstrapDataServices` + `DataServices` type.
 *
 * Subpath consumers:
 *   `import { bootstrapDataServices } from '@starui/data-services'`     ← preferred
 *   `import { bootstrapDataServices } from '@starui/data-services/runtime'`
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
