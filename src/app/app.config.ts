import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ItalianDateAdapter } from './core/italian-date-adapter';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { getStorage, provideStorage } from '@angular/fire/storage';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes), 
    provideClientHydration(), 
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'it-IT' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
    { provide: DateAdapter, useClass: ItalianDateAdapter },
    provideFirebaseApp(() => initializeApp({
      "projectId":"gestionalecasaadf",
      "appId":"1:314406332741:web:6de1dbb1982d43f6b4f62c",
      "storageBucket":"gestionalecasaadf.firebasestorage.app",
      "apiKey":"AIzaSyBIkbSrxWcKOqNWKM3FdgNYD-ZXlngKW6c",
      "authDomain":"gestionalecasaadf.firebaseapp.com",
      "messagingSenderId":"314406332741",
      "measurementId":"G-TDKWSC14E4"
      // "projectNumber" e "version" sono stati rimossi
    })), 
    provideAuth(() => getAuth()), 
    provideFirestore(() => getFirestore()), 
    provideDatabase(() => getDatabase()), 
    provideStorage(() => getStorage())
  ]
};