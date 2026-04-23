import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'design-system',
    loadComponent: () =>
      import('./pages/design-system.component').then(m => m.DesignSystemComponent),
  },
  { path: '**', redirectTo: '' },
];
