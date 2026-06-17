import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'public-shifts',
    loadComponent: () => import('./features/public-shifts/public-shifts.component').then(m => m.PublicShiftsComponent)
  },
  { path: '', redirectTo: 'public-shifts', pathMatch: 'full' },
  { path: '**', redirectTo: 'public-shifts' }
];
