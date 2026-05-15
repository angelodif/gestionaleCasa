import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  isDark = signal<boolean>(false);
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
  private isBrowser = isPlatformBrowser(this.platformId);

  constructor() {
    if (this.isBrowser) {
      this.initializeTheme();
      
      // Applica il tema ogni volta che isDark cambia
      effect(() => {
        if (this.isDark()) {
          this.document.documentElement.classList.add('dark-theme');
        } else {
          this.document.documentElement.classList.remove('dark-theme');
        }
      });
    }
  }

  private initializeTheme() {
    const isPlatformAndroid = Capacitor.getPlatform() === 'android';

    if (isPlatformAndroid) {
      // Su Android (APK) seguiamo le impostazioni di sistema
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      this.isDark.set(prefersDark.matches);
      
      // Ascolta cambiamenti di sistema in tempo reale
      prefersDark.addEventListener('change', e => {
        this.isDark.set(e.matches);
      });
    } else {
      // Su Web controlliamo l'ora del tramonto (approssimata)
      this.checkSunsetTheme();
      // Ricontrolla ogni ora
      setInterval(() => this.checkSunsetTheme(), 3600000);
    }
  }

  private checkSunsetTheme() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const hour = now.getHours();

    const sunsetHours = [17, 17.5, 18.5, 20, 20.5, 21, 21, 20.5, 19.5, 18.5, 17, 16.5];
    const sunriseHours = [7.5, 7, 6.5, 6, 5.5, 5.5, 5.5, 6, 6.5, 7, 7.5, 8];

    const currentSunset = sunsetHours[month];
    const currentSunrise = sunriseHours[month];

    if (hour >= currentSunset || hour < currentSunrise) {
      this.isDark.set(true);
    } else {
      this.isDark.set(false);
    }
  }

  toggleTheme() {
    this.isDark.update(v => !v);
  }
}
