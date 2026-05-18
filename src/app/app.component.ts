import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NotificationService } from './services/notification/notification.service';
import { take } from 'rxjs';
import { App as CapacitorApp } from '@capacitor/app';

import { ThemeService } from './services/theme/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, MatProgressBarModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'gestionaleCasa';
  isAuthLoading = true;
  private auth = inject(Auth);
  notification = inject(NotificationService);
  private themeService = inject(ThemeService);

  private platformId = inject(PLATFORM_ID);

  constructor() {
    authState(this.auth).pipe(take(1)).subscribe(() => {
      this.isAuthLoading = false;
    });

    if (isPlatformBrowser(this.platformId)) {
      // Gestione tasto indietro hardware per Android (Capacitor)
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack || window.location.pathname === '/' || window.location.pathname === '/login' || window.location.pathname === '/dashboard') {
          CapacitorApp.exitApp();
        } else {
          window.history.back();
        }
      });
    }
  }
}
