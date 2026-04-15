import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(u => {
      if (u) {
        return true; // Utente loggato, può passare
      } else {
        router.navigate(['/login']); // Non loggato, vai alla login
        return false;
      }
    })
  );
};