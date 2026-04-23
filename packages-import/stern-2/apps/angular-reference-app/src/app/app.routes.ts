import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'platform/provider',
    loadComponent: () =>
      import('./openfin/openfin-provider.component').then(
        (m) => m.OpenfinProviderComponent,
      ),
  },
  {
    path: 'dock-editor',
    loadComponent: () =>
      import('./openfin/dock-editor.component').then(
        (m) => m.DockEditorComponent,
      ),
  },
  {
    path: 'dataproviders',
    loadComponent: () =>
      import('./pages/data-providers.component').then(
        (m) => m.DataProvidersComponent,
      ),
  },
  {
    path: 'blotter/:type',
    loadComponent: () =>
      import('./pages/blotter.component').then((m) => m.BlotterComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/home.component').then((m) => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
