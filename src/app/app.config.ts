import { ApplicationConfig, LOCALE_ID, APP_INITIALIZER, inject, PLATFORM_ID, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData, isPlatformBrowser } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { DateAdapter, MAT_DATE_LOCALE, MAT_DATE_FORMATS } from '@angular/material/core';
import { ItalianDateAdapter, ITALIAN_DATE_FORMATS } from './core/italian-date-adapter';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from '@angular/fire/firestore';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { environment } from '../environments/environment';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { CacheService } from './core/services/cache/cache.service';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'it-IT' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
    { provide: DateAdapter, useClass: ItalianDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ITALIAN_DATE_FORMATS },
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => {
        const platformId = inject(PLATFORM_ID);
        if (isPlatformBrowser(platformId)) {
            return initializeFirestore(getApp(), {
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager()
                })
            });
        }
        else {
            return getFirestore();
        }
    }),
    provideDatabase(() => getDatabase()),
    provideStorage(() => getStorage()),
    importProvidersFrom(MatSnackBarModule),
    {
        provide: APP_INITIALIZER,
        // La factory restituisce una funzione che ritorna una Promise.
        // Angular attende il completamento di questa Promise prima di renderizzare qualsiasi componente.
        useFactory: (cacheService: CacheService) => () => cacheService.initialize(),
        deps: [CacheService],
        multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000'
    })
]
};