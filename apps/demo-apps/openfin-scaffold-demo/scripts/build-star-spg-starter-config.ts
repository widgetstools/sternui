/**
 * Regenerate public/config/star-spg-starter*.json from stompPositionsFiSchema.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCAFFOLD_BLOTTER_GRID_ID,
  buildDefaultProfileSnapshot,
  buildPositionsDpProviderPayload,
  buildStompPositionColumnDefinitions,
} from '../config/stompPositionsFiSchema.js';

const here = dirname(fileURLToPath(import.meta.url));
const configDir = join(here, '..', 'public', 'config');
const appConfigPath = join(configDir, 'star-spg-starter.appConfig.json');

const rows = JSON.parse(readFileSync(appConfigPath, 'utf8')) as Array<{
  configId: string;
  payload: Record<string, unknown>;
}>;

const columnDefinitions = buildStompPositionColumnDefinitions();
const defaultProfile = buildDefaultProfileSnapshot(SCAFFOLD_BLOTTER_GRID_ID);
const providerPayload = buildPositionsDpProviderPayload();

const positions = rows.find((r) => r.configId === 'positions.dp');
if (positions) positions.payload = providerPayload;

const blotter = rows.find((r) => r.configId === 'openfin-scaffold-blotter');
if (blotter) {
  blotter.payload.profiles = [defaultProfile];
  blotter.payload.gridLevelData = blotter.payload.gridLevelData ?? {
    liveProviderId: 'positions.dp',
    historicalProviderId: null,
    mode: 'live',
  };
}

writeFileSync(appConfigPath, `${JSON.stringify(rows, null, 2)}\n`);

const bundle = {
  exportedAt: new Date().toISOString(),
  appConfig: rows,
  appRegistry: [],
  roles: [],
  permissions: [],
};
writeFileSync(join(configDir, 'star-spg-starter-bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);

const assignmentCount = Object.keys(
  (defaultProfile.state['column-customization'] as { data: { assignments: Record<string, unknown> } }).data
    .assignments,
).length;

console.log(
  `[build-star-spg-starter-config] ${columnDefinitions.length} provider columns;`,
  `${assignmentCount} default-profile format assignments`,
);
