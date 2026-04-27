/**
 * Client barrel — main-thread surface. Lives outside `/v2` root so
 * apps that don't bundle the worker types still get a clean import.
 *
 * Subpath export: `@marketsui/data-plane/v2/client`.
 */

export {
  DataPlane,
  createInPageWiring,
  type DataListener,
  type StatsListener,
  type AttachOpts,
  type DataPlaneOpts,
  type SubId,
  type InPageWiring,
} from './DataPlane.js';
