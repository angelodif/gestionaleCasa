import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard'; // Da creare

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login/login.component').then(m => m.LoginComponent)
  },
  //{
  //  path: 'register',
  //  loadComponent: () => import('./core/auth/register/register.component').then(m => m.RegisterComponent)
  //},
  {
    path: 'public-shifts',
    loadComponent: () => import('./features/public-shifts/public-shifts.component').then(m => m.PublicShiftsComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'work-shifts',
    canActivate: [authGuard],
    loadComponent: () => import('./features/work-shifts/work-shifts.component').then(m => m.WorkShiftsComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
  },
  {
    path: 'planner',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shift-planner/shift-planner.component').then(m => m.ShiftPlannerComponent),
  },
  {
    path: 'meal-planner',
    canActivate: [authGuard],
    loadComponent: () => import('./features/meal-planner/meal-planner.component').then(m => m.MealPlannerComponent),
  },
  {
    path: 'shopping-list',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shopping-list/shopping-list.component').then(m => m.ShoppingListComponent),
  },
  {
    path: 'finance',
    canActivate: [authGuard],
    loadComponent: () => import('./features/finance/finance.component').then(m => m.FinanceComponent),
  },
  {
    path: 'waste-management',
    canActivate: [authGuard],
    loadComponent: () => import('./features/waste-management/waste-management.component').then(m => m.WasteManagementComponent),
  },
  {
    path: 'deadlines',
    canActivate: [authGuard],
    loadComponent: () => import('./features/deadlines/deadlines.component').then(m => m.DeadlinesComponent),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
