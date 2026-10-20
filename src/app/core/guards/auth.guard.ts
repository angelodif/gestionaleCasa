import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { from, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Aspetta che Firebase abbia completato il ripristino dello stato auth
  // prima di decidere (evita il problema del "take(1) su null iniziale")
  return from(auth.authStateReady()).pipe(
    switchMap(() => {
      const u = auth.currentUser;
      if (u) {
        return [true];
      } else {
        router.navigate(['/login']);
        return [false];
      }
    })
  );
};