/**
 * Application routes.
 *
 * All routes are lazy-loaded — each component is only bundled and
 * fetched when its route is first visited. This keeps the initial
 * provider window small and fast.
 */
import { Routes } from '@angular/router';

export const routes: Routes = [
  // Main app shell shows the router outlet (AppComponent is the bootstrap root)

  // OpenFin platform provider — runs in a hidden window on startup.
  // Calls initWorkspace() to register the dock, home, store, etc.
  {
    path: 'platform/provider',
    loadComponent: () =>
      import('./platform/provider.component').then((m) => m.ProviderComponent),
  },

  // Sample views — launched as OpenFin Views from the dock
  {
    path: 'views/view1',
    loadComponent: () =>
      import('./views/view1.component').then((m) => m.View1Component),
  },
  {
    path: 'views/view2',
    loadComponent: () =>
      import('./views/view2.component').then((m) => m.View2Component),
  },

  // Utility windows — opened by dock toolbar buttons
  {
    path: 'dock-editor',
    loadComponent: () =>
      import('./views/dock-editor-page.component').then((m) => m.DockEditorPageComponent),
  },
  {
    path: 'registry-editor',
    loadComponent: () =>
      import('./views/registry-editor-page.component').then((m) => m.RegistryEditorPageComponent),
  },
  {
    path: 'import-config',
    loadComponent: () =>
      import('./views/import-config-page.component').then((m) => m.ImportConfigPageComponent),
  },
];
