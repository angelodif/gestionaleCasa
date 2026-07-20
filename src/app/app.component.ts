import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ShiftNotificationService } from './services/shift-notification/shift-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: []
})
export class AppComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private shiftNotificationService = inject(ShiftNotificationService);

  title = 'Orari Daiana';

  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    // 1. Inizializza notifiche push (chiede permesso, crea canale, schedula)
    await this.shiftNotificationService.init();

    // 2. Re-schedula ogni volta che l'app torna in foreground
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          console.log('[App] Tornata in foreground → ri-schedulo notifiche');
          await this.shiftNotificationService.scheduleShiftNotifications();
        }
      });
    } catch {
      // Su browser desktop il plugin non è disponibile, ignora
    }

    // 3. Avvia il Background Runner per aggiornamenti con app in background
    //    Il runner gira ogni ~60 min e invia un reminder se le notifiche
    //    non sono state aggiornate di recente (vedi assets/background-runner.js)
    try {
      const { BackgroundRunner } = await import('@capacitor/background-runner');
      await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
      console.log('[App] Background Runner inizializzato.');
    } catch (e) {
      // Ignorato su browser/iOS senza supporto
      console.warn('[App] Background Runner non disponibile:', e);
    }
  }
}

