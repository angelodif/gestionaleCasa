import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard'; // Da creare

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./core/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'public-shifts',
    loadComponent: () => import('./features/public-shifts/public-shifts.component').then(m => m.PublicShiftsComponent)
  },
  {
    path: '',
    canActivate: [authGuard], // Protegge tutti i figli
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'work-shifts',
        loadComponent: () => import('./features/work-shifts/work-shifts.component').then(m => m.WorkShiftsComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'planner',
        loadComponent: () => import('./features/shift-planner/shift-planner.component').then(m => m.ShiftPlannerComponent),
        canActivate: [authGuard]
      },
      {
        path: 'meal-planner',
        loadComponent: () => import('./features/meal-planner/meal-planner.component').then(m => m.MealPlannerComponent),
        canActivate: [authGuard]
      },
      {
        path: 'shopping-list',
        loadComponent: () => import('./features/shopping-list/shopping-list.component').then(m => m.ShoppingListComponent),
        canActivate: [authGuard]
      },
      // ... altre rotte
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
