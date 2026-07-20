# Relazione Tecnica e Architetturale Completa: GestionaleCasa (Casa Dif e Dot)

La presente relazione illustra in modo esaustivo l'architettura tecnica, le scelte tecnologiche, le strutture dei dati, i flussi asincroni e le ottimizzazioni introdotte nell'applicazione **GestionaleCasa (Casa Dif e Dot)**. 

L'applicazione è progettata per essere un hub organizzativo domestico *offline-first*, installabile sia su piattaforme mobile nativi (Android tramite APK nativo) sia su browser tradizionali (PWA).

---

## 1. Stack Tecnologico di Riferimento

L'applicazione si fonda su uno stack collaudato ed efficiente che separa lo sviluppo dell'interfaccia utente web dalla gestione dell'hardware nativo del telefono e dai servizi cloud di persistenza.

```
+--------------------------------------------------------------+
|                   ANGULAR 17 FRONTEND SPA                    |
|       (Signals, Standalone Components, Reactive Forms)        |
+--------------------------------------------------------------+
                               |
            +------------------+------------------+
            |                                     |
            v                                     v
+-----------------------+               +----------------------+
|    CAPACITOR CORE     |               |    ANGULAR FIRE      |
|  (Local Notification, |               |   (Web SDK Wrapper)  |
|    App hardware)      |               +----------------------+
+-----------------------+                         |
            |                                     v
            v                           +----------------------+
+-----------------------+               |   CLOUD FIRESTORE    |
|   ANDROID OS LAYER    |               |  (Real-Time NoSQL)   |
|   (SQLite/Webview)    |               +----------------------+
+-----------------------+
```

### 1.1 Angular v17.3
Angular funge da motore per lo sviluppo della Single Page Application (SPA). Nello specifico:
* **Standalone Components**: Tutti i componenti, le direttive e le pipe sono dichiarati privi di moduli (`NgModule`). Questo semplifica il dependency injection e riduce le dimensioni dei bundle JavaScript finali.
* **Angular Signals**: Introdotto come meccanismo nativo per il controllo dello stato. I segnali (`signal`, `computed`, `effect`) gestiscono la reattività della UI in modo granulare, informando Angular dell'esatta porzione di DOM da aggiornare senza dover effettuare una change detection globale dell'intera alberatura dei componenti.
* **Componenti UI (Angular Material)**: Per l'interfaccia grafica è stata utilizzata la suite standard Angular Material (`MatCard`, `MatDialog`, `MatDatepicker`, `MatSelect`, `MatFormField`). Ciò assicura una resa grafica coerente con le linee guida Material Design 3 e l'accessibilità da tastiera e lettori dello schermo.

### 1.2 Capacitor v8
Capacitor di Ionic converte il codice web compilato (HTML, CSS, JS) in un progetto nativo Gradle per Android Studio. Fornisce un bridge bidirezionale ad alta velocità per comunicare con le API Java del sistema operativo Android tramite plugin dedicati.

### 1.3 Firebase SDK
L'integrazione di Firebase è effettuata tramite `@angular/fire` (`17.1.0`), che avvolge le API web standard di Firebase garantendo compatibilità con i cicli di vita di Angular.

### 1.4 Chart.js e Esportazioni PDF
* **Chart.js** (`4.5.1`) con **ng2-charts** (`6.0.1`) fornisce i grafici reattivi a torta e a barre per tracciare le finanze familiari mensili.
* **jsPDF** (`4.2.1`) con **jspdf-autotable** (`5.0.7`) genera dinamicamente resoconti PDF formattati esportabili per la condivisione.

---

## 2. Design dei Dati e Struttura di Cloud Firestore

Firestore è organizzato come database a documenti gerarchico. Ogni documento memorizza i dati in formato JSON ed è tipizzato tramite interfacce TypeScript lato frontend per mantenere la consistenza.

### 2.1 Collezioni e Schemi Dati

#### A. turni (`/shifts`)
Collezione contenente i modelli dei turni che Daiana può selezionare.
* **Interfaccia TypeScript:**
  ```typescript
  export interface Shift {
    id?: string;
    label: string;
    startTime: string;
    endTime: string;
    store?: string;
  }
  ```

#### B. Assegnazioni Settimanali (`/planners/{weekId}/assignments/{dayName}`)
Questa è la collezione nodale del planner. La chiave `{weekId}` segue il formato ISO `YYYY-Www` (es. `2026-W29`). La collezione contiene documenti per ciascun giorno della settimana (es. `Lunedì`).
* **Interfaccia TypeScript:**
  ```typescript
  export interface DayAssignment {
    id: string; // dayName (es. 'Lunedì')
    shiftId?: string;
    label?: string;
    startTime?: string;
    endTime?: string;
    store?: string;
    angeloPresence?: string; // 'home' | 'office' | 'office_morning' | 'office_afternoon'
    angeloInOffice?: boolean;
    appointments?: Appointment[];
  }

  export interface Appointment {
    category: 'beauty' | 'transports' | 'second_job' | 'other' | string;
    id?: string;
    title: string;
    startTime: string;
    endTime?: string;
    target: 'Angelo' | 'Daiana' | 'Couple';
    color?: string;
    reminderLeadTime?: { hours: number; minutes: number };
  }
  ```

#### C. Pianificazione Pasti (`/weeks/{weekId}/days/{dayName}`)
Memorizza il pranzo e la cena divisi per utente per ciascun giorno della settimana.
* **Interfaccia TypeScript:**
  ```typescript
  export interface Meal {
    main: string;
    details: string;
    isOut: boolean;
  }

  export interface DayPlan {
    lunch: { angelo: Meal, daiana: Meal };
    dinner: { angelo: Meal, daiana: Meal };
  }
  ```

#### D. Controllo Scadenze (`/deadlines`)
Collezione piatta contenente le fatture e le scadenze.
* **Interfaccia TypeScript:**
  ```typescript
  export interface Deadline {
    id?: string;
    title: string;
    amount: number;
    dueDate: number; // Timestamp Unix in millisecondi
    isPaid: boolean;
    category: string;
  }
  ```

---

## 3. Servizi Chiave dell'Applicazione: Dettagli di Implementazione

I servizi Angular (`@Injectable`) centralizzano la logica di business e astraggono l'accesso a Firestore e alla cache locale.

### 3.1 CacheService (Gestione Cache ed Invalidazione Real-Time)
Il `CacheService` implementa una strategia **Stale-While-Revalidate** a invalidazione remota basata su timestamp.
* **Percorso del Timestamp Remoto**: `app_config/cache_timestamp`
* **Logica**: Quando un client effettua una modifica in Firestore (es. salva un pasto o un turno), scrive un nuovo timestamp nella rispettiva chiave (es. `meals: Date.now()`). Tutti i client registrano questo cambio tramite una sottoscrizione in tempo reale a `docData` e contrassegnano la cache locale di quella feature come non più valida.

#### Walkthrough del Codice
Il servizio controlla la validità locale confrontando il timestamp remoto scaricato in tempo reale con quello presente nel `localStorage`.

```typescript
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, setDoc, docData } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { first, filter, timeout, switchMap } from 'rxjs/operators';

const FIREBASE_TIMESTAMP_DOC = 'app_config/cache_timestamp';
const LOCAL_TIMESTAMP_KEY = 'cache_last_update';
const LOCAL_TIMESTAMPS_KEY = 'cache_local_timestamps';
const CACHE_DATA_PREFIX = 'cache_data__';

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(Auth);

  readonly remoteTimestamps = signal<Record<string, number>>({});
  private _readyResolve!: () => void;
  readonly ready$: Promise<void> = new Promise(resolve => { this._readyResolve = resolve; });

  private readonly cacheStreams = new Map<
    string,
    { subject: BehaviorSubject<any>; source$: Observable<any>; feature: string }
  >();

  // Inizializzazione in APP_INITIALIZER: asincrona e offline-safe
  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // 1. Carica i timestamp salvati localmente per il funzionamento offline
    const localTsMap = this.getLocalTimestampsMap();
    const initialSimulated: Record<string, number> = {};
    Object.keys(localTsMap).forEach(k => {
      initialSimulated[k] = localTsMap[k];
    });
    const rawGlobal = localStorage.getItem(LOCAL_TIMESTAMP_KEY);
    if (rawGlobal) {
      initialSimulated['last_update'] = Number(rawGlobal);
    }
    this.remoteTimestamps.set(initialSimulated);
    this._readyResolve(); // Indica che l'app può partire leggendo da localStorage

    // 2. Ascolto real-time dei timestamp con protezione contro i memory leak tramite switchMap
    user(this.auth).pipe(
      switchMap((currentUser) => {
        if (currentUser) {
          console.log('[CacheService] Utente loggato. Attivo ascoltatore real-time sui timestamp...');
          const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
          return docData(docRef);
        } else {
          console.log('[CacheService] Utente disconnesso. Disattivo l\'ascolto.');
          return of(null);
        }
      })
    ).subscribe({
      next: (remoteData: any) => {
        if (!remoteData) return;

        const remoteTsMap = remoteData as Record<string, number>;
        this.remoteTimestamps.set(remoteTsMap);

        const currentLocalMap = this.getLocalTimestampsMap();
        let localMapChanged = false;

        Object.keys(remoteTsMap).forEach(feature => {
          const remoteVal = remoteTsMap[feature] ?? 0;
          const localVal = currentLocalMap[feature] ?? null;

          // Se il server ha un timestamp più recente di quello in cache locale, invalida la cache locale
          if (remoteVal !== 0 && (localVal === null || remoteVal !== localVal)) {
            console.log(`[CacheService] 🔄 Cache obsoleta per "${feature}". Invalidazione locale in corso...`);
            delete currentLocalMap[feature];
            localMapChanged = true;

            // Spinge l'aggiornamento automatico nei BehaviorSubject dei servizi in ascolto
            this.cacheStreams.forEach((stream, key) => {
              if (stream.feature === feature) {
                this.fetchAndPublish(key, stream.feature, stream.source$, stream.subject);
              }
            });
          }
        });

        if (localMapChanged) {
          localStorage.setItem(LOCAL_TIMESTAMPS_KEY, JSON.stringify(currentLocalMap));
        }
      },
      error: (err) => console.warn('[CacheService] Errore nell’ascolto dei timestamp:', err)
    });
  }

  // Costruisce ed espone l'Observable cache-hit/cache-miss per i servizi dati
  getCachedCollection<T>(key: string, source$: Observable<T>): Observable<T> {
    const feature = this.getFeatureKey(key);

    if (!this.cacheStreams.has(key)) {
      const subject = new BehaviorSubject<any>(null);
      this.cacheStreams.set(key, { subject, source$, feature });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Dispositivo Offline: carica immediatamente l'ultima cache registrata
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          subject.next(cached);
        } else {
          this.fetchAndPublish(key, feature, source$, subject);
        }
      } else if (this.isCacheValid(key)) {
        // Cache valida: restituisce subito i dati locali evitando chiamate a Firestore (risparmio letture)
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          subject.next(cached);
        } else {
          this.fetchAndPublish(key, feature, source$, subject);
        }
      } else {
        // Cache non valida o assente: scarica dati freschi da Firestore
        this.fetchAndPublish(key, feature, source$, subject);
      }
    }

    return this.cacheStreams.get(key)!.subject.asObservable().pipe(
      filter(val => val !== null)
    ) as Observable<T>;
  }

  // Interroga Firestore, aggiorna i dati locali in localStorage e notifica gli stream
  private fetchAndPublish<T>(
    key: string,
    feature: string,
    source$: Observable<T>,
    subject: BehaviorSubject<T | null>
  ): void {
    source$.pipe(
      first(), // Prende solo il primo snapshot
      timeout({ each: 4000 }) // Se Firestore impiega più di 4s, lancia fallback
    ).subscribe({
      next: (data) => {
        this.saveToCache(key, data);
        const remoteTs = this.remoteTimestamps()[feature] || Date.now();
        this.setLocalTimestampForFeature(feature, remoteTs);
        subject.next(data);
      },
      error: (err) => {
        console.warn(`[CacheService] Timeout/Errore su "${key}". Fallback su cache locale.`, err);
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          subject.next(cached);
        }
      }
    });
  }
  
  // Sincronizza i timestamp remoti su Firestore a seguito di un'operazione di scrittura
  private async updateRemoteTimestampAsync(feature: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Offline');

      const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
      const now = Date.now();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000));

      await Promise.race([
        setDoc(docRef, { [feature]: now, last_update: now }, { merge: true }),
        timeoutPromise
      ]);

      this.remoteTimestamps.update(ts => ({ ...ts, [feature]: now, last_update: now }));
      this.setLocalTimestampForFeature(feature, now);
      localStorage.setItem(LOCAL_TIMESTAMP_KEY, now.toString());
    } catch (err) {
      console.warn(`[CacheService] Impossibile allineare i timestamp remoti:`, err);
      this.setLocalTimestampForFeature(feature, Date.now());
    }
  }

  // ... (Altri metodi helper: getFromCache, saveToCache, invalidateCache, clearCacheEntry)
}
```

---

### 3.2 ShiftService (Pianificazione Turni e Allineamento Database)
Questo servizio implementa la logica per salvare e recuperare i dati delle assegnazioni dei turni e dei calendari impegni.

#### Gestione di `deleteField()` su Firestore
Nel metodo `saveDayAssignment`, se l'oggetto JavaScript passato (`data`) non contiene i campi legati al turno lavorativo (poiché cancellati localmente dall'utente), il servizio li valorizza esplicitamente come `deleteField()`. In caso contrario, l'opzione `{ merge: true }` di Firestore manterrebbe i vecchi dati nel database remoto.

```typescript
import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, getDoc, deleteField } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CacheService } from '../../core/services/cache/cache.service';
import { NotificationService } from '../notification/notification.service';

@Injectable({ providedIn: 'root' })
export class ShiftService {
  private firestore = inject(Firestore);
  private cacheService = inject(CacheService);
  private notificationService = inject(NotificationService);

  getWeeklyPlanner(weekId: string): Observable<any[]> {
    const plannerRef = collection(this.firestore, `planners/${weekId}/assignments`);
    const source$ = collectionData(plannerRef, { idField: 'id' });
    return this.cacheService.getCachedCollection<any[]>(`planner_${weekId}`, source$);
  }

  async saveDayAssignment(dayId: string, data: any, weekId: string) {
    const cacheKey = `assignment_${weekId}_${dayId}`;
    this.cacheService.saveToCache(cacheKey, data); // Salva ottimisticamente nella cache locale

    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      
      const docData = { ...data };
      const keysToDelete = ['label', 'startTime', 'endTime', 'shiftId', 'store'];
      keysToDelete.forEach(key => {
        if (!(key in docData)) {
          docData[key] = deleteField(); // Rilascia lo spazio nel documento remoto
        }
      });

      const result = await setDoc(docRef, docData, { merge: true });
      this.cacheService.clearCacheEntry(`planner_${weekId}`);
      return result;
    }, 'Errore durante il salvataggio del planner');
  }

  async deleteDayAssignment(dayId: string, weekId: string) {
    const cacheKey = `assignment_${weekId}_${dayId}`;
    this.cacheService.clearCacheEntry(cacheKey);

    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      const result = await deleteDoc(docRef);
      this.cacheService.clearCacheEntry(`planner_${weekId}`);
      return result;
    }, 'Errore durante l\'eliminazione dell\'assegnazione');
  }
}
```

---

### 3.3 PushNotificationService (Schedulazione Predittiva a 7 Giorni)
Il `PushNotificationService` coordina ed esegue lo scheduling delle notifiche push native sul telefono. Funziona interrogando in parallelo (tramite un array di promesse ed una chiamata globale a `Promise.all()`) i prossimi 8 giorni di dati (dal giorno odierno $i=0$ a $i=7$) per turni, impegni, pasti, scadenze, compleanni e rifiuti differenziati.

#### Logica di Ripartizione degli ID Notifica
Per evitare che le notifiche future si sovrascrivano a vicenda (in quanto `@capacitor/local-notifications` richiede un ID intero univoco per ciascuna notifica pianificata), gli ID sono calcolati dinamicamente moltiplicando l'indice del giorno di differenza ($i \in [0..6]$) con chiavi costanti:

* **Daiana Shift Oggi**: `100 + i`
* **Daiana Shift Domani**: Angelo: `7500 + i`, Daiana: `7510 + i`
* **Angelo Office Reminder**: `200 + i`
* **Angelo Lunch Prep**: `300 + i`
* **Menù Pranzo Angelo/Daiana**: Angelo: `4000 + i`, Daiana: `4100 + i`
* **Menù Cena Angelo/Daiana**: Angelo: `5000 + i`, Daiana: `5100 + i`
* **Impegni Personali**: `6000 + i * 10 + index_impegno`
* **Riepilogo Impegni Domani**: `7000 + i * 10 + targetIndex`
* **Scadenze Oggi/Domani/Settimana**: `8000 + i` / `8500 + i` / `8600 + i`
* **Raccolta Differenziata**: `9000 + i`
* **Compleanni e Onomastici (Stesso giorno / Giorno prima)**: `10000 + i * 100 + ID` / `20000 + i * 100 + ID`

```typescript
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { firstValueFrom } from 'rxjs';
import { ShiftService, DayAssignment } from '../shift/shift.service';
import { MealService, DayPlan } from '../meal/meal.service';
import { DeadlineService, Deadline } from '../deadline/deadline.service';
import { WasteService } from '../waste/waste.service';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);
  private mealService = inject(MealService);
  private deadlineService = inject(DeadlineService);
  private wasteService = inject(WasteService);
  private platformId = inject(PLATFORM_ID);

  async scheduleAll() {
    if (!isPlatformBrowser(this.platformId)) return;

    const user = this.authService.getCurrentUser();
    if (!user) return; // Salta lo scheduling se l'utente non è connesso

    const prefs = this.getPreferences();

    // 1. Pulisce la coda di tutte le notifiche programmate in precedenza sul dispositivo
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      }
    } catch (e) {
      console.warn('[PushNotificationService] Errore pulizia notifiche pendenti', e);
    }

    const today = new Date();
    let deadlines: Deadline[] = [];
    try { deadlines = await firstValueFrom(this.deadlineService.getDeadlines()); } catch (e) { console.error(e); }

    const notifications: LocalNotificationSchema[] = [];
    const nowTime = today.getTime();

    // Helper per inserire la notifica nell'array finale solo se l'ora programmata è nel futuro
    const addNotification = (id: number, title: string, body: string, triggerDate: Date) => {
      if (triggerDate.getTime() > nowTime) {
        notifications.push({
          id,
          title,
          body,
          channelId: 'high_importance_channel',
          schedule: {
            at: triggerDate,
            allowWhileIdle: true // Permette a Android di svegliare la CPU in modalità Doze
          }
        });
      }
    };

    // 2. Caricamento parallelo predittivo di 8 giorni (oggi + 7 giorni successivi)
    const promises = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const wId = this.getWeekId(d);
      const dName = d.toLocaleDateString('it-IT', { weekday: 'long' });
      const mealName = dName.charAt(0).toUpperCase() + dName.slice(1);

      promises.push((async () => {
        let assignment: DayAssignment | null = null;
        let meal: DayPlan | null = null;
        try { assignment = await this.shiftService.getAssignmentByDay(wId, dName); } catch (e) {}
        try { meal = await this.mealService.getDayPlan(wId, mealName); } catch (e) {}
        return { date: d, assignment, meal };
      })());
    }

    let results: { date: Date; assignment: DayAssignment | null; meal: DayPlan | null }[] = [];
    try {
      results = await Promise.all(promises);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento dei dati paralleli:', e);
    }

    if (results.length > 0) {
      // Cicla per 7 giorni per pianificare i promemoria del dispositivo
      for (let i = 0; i < 7; i++) {
        const res = results[i];
        if (!res) continue;

        const date = res.date;
        const assignment = res.assignment;
        const meal = res.meal;

        // Recupera le informazioni per la giornata di "Domani" rispetto alla giornata attuale del ciclo
        const tomorrowRes = results[i + 1];
        const tomorrowAssignment = tomorrowRes?.assignment;
        const tomorrowMeal = tomorrowRes?.meal;

        // 1. TURNO DI DAIANA (OGGI)
        if (prefs.shifts.daiana && assignment && (assignment.label || assignment.shiftId) && assignment.startTime) {
          const [h, m] = assignment.startTime.split(':').map(Number);
          const leadHours = prefs.shifts.leadTime?.hours ?? 1;
          const leadMinutes = prefs.shifts.leadTime?.minutes ?? 0;

          const triggerDate = new Date(date);
          triggerDate.setHours(h - leadHours, m - leadMinutes, 0, 0);

          const storeText = assignment.store ? ` presso ${assignment.store}` : '';
          const body = `Per Daiana 👔 oggi hai il turno dalle ${assignment.startTime} alle ${assignment.endTime}${storeText}`;
          addNotification(100 + i, 'Turno di Lavoro', body, triggerDate);
        }

        // 1b. TURNO DI DOMANI DI DAIANA (PRE-AVVISO SERALE DEL GIORNO PRIMA)
        if (tomorrowAssignment && (tomorrowAssignment.label || tomorrowAssignment.shiftId) && tomorrowAssignment.startTime && (prefs.shiftsTomorrow?.angelo || prefs.shiftsTomorrow?.daiana)) {
          const storeText = tomorrowAssignment.store ? ` presso ${tomorrowAssignment.store}` : '';
          const [dbH, dbM] = (prefs.shiftsTomorrow.time || '21:00').split(':').map(Number);
          const triggerDate = new Date(date);
          triggerDate.setHours(dbH, dbM, 0, 0);

          if (prefs.shiftsTomorrow.angelo) {
            const body = `Domani Daiana ha il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText} 👔`;
            addNotification(7500 + i, 'Turno di Domani (Daiana)', body, triggerDate);
          }
          if (prefs.shiftsTomorrow.daiana) {
            const body = `Per Daiana 👔 domani hai il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText}`;
            addNotification(7510 + i, 'Turno di Domani', body, triggerDate);
          }
        }

        const tomorrowAngeloPresence = tomorrowAssignment?.angeloPresence || (tomorrowAssignment?.angeloInOffice ? 'office' : 'home');

        // 2. ANGELO UFFICIO DOMANI (PRE-AVVISO SERALE)
        if (prefs.officeReminder.angelo && tomorrowAngeloPresence !== 'home') {
          let body = '';
          if (tomorrowAngeloPresence === 'office') {
            body = 'Per Angelo, domani sei in ufficio tutto il giorno (09:00–18:00). Prepara lo zaino! 🎒';
          } else if (tomorrowAngeloPresence === 'office_morning') {
            body = 'Per Angelo, domani sei in ufficio la mattina (09:00–13:00) poi agile. Prepara lo zaino! 🎒';
          } else if (tomorrowAngeloPresence === 'office_afternoon') {
            body = 'Per Angelo, domani mattina sei agile, poi in ufficio nel pomeriggio (14:00–18:00). Prepara lo zaino! 🎒';
          }

          if (body) {
            const [dbH, dbM] = (prefs.officeReminder.time || '21:00').split(':').map(Number);
            const triggerDate = new Date(date);
            triggerDate.setHours(dbH, dbM, 0, 0);
            addNotification(200 + i, 'Promemoria Ufficio', body, triggerDate);
          }
        }

        // 3. ANGELO PREPARAZIONE PRANZO PER DOMANI
        const needsLunchPrep = ['office', 'office_morning'].includes(tomorrowAngeloPresence);
        if (prefs.lunchPrep.angelo && needsLunchPrep) {
          const tomorrowLunch = tomorrowMeal?.lunch?.angelo;
          if (tomorrowLunch && (!tomorrowLunch.isOut || prefs.notifyLunchOut)) {
            const mealDesc = tomorrowLunch.isOut
              ? (tomorrowLunch.main ? ` ordina ${tomorrowLunch.main}` : ': fuori casa')
              : (tomorrowLunch.main && tomorrowLunch.details ? `: ${tomorrowLunch.main} ${tomorrowLunch.details}` : '');

            const body = tomorrowLunch.isOut ? `Per Angelo 🥪 domani sei in ufficio, ${mealDesc}` : `Per Angelo 🥪 domani sei in ufficio, prepara il pranzo da casa: ${mealDesc}`;

            const [dbH, dbM] = (prefs.lunchPrep.time || '19:00').split(':').map(Number);
            const triggerDate = new Date(date);
            triggerDate.setHours(dbH, dbM, 0, 0);
            addNotification(300 + i, 'Preparazione Pranzo', body, triggerDate);
          }
        }

        // 4. RACCOLTA DIFFERENZIATA (OGGI)
        if (prefs.wasteCollection.enabled) {
          const dayWaste = this.wasteService.getWastesForDate(date);
          if (dayWaste && dayWaste.length > 0) {
            const names = dayWaste.map(w => w.name).join(', ');
            const body = `🗑️ Oggi porta fuori: ${names}`;
            const triggerDate = new Date(date);

            const [wH, wM] = (prefs.wasteCollection.time || '20:45').split(':').map(Number);
            triggerDate.setHours(wH, wM, 0, 0);
            addNotification(9000 + i, 'Raccolta Differenziata', body, triggerDate);
          }
        }
      }
    }

    // Invio schedulazioni native
    if (notifications.length > 0) {
      try {
        await LocalNotifications.schedule({ notifications });
        console.log(`[PushNotificationService] Schedulate ${notifications.length} notifiche native.`);
      } catch (e) {
        console.error('[PushNotificationService] Errore in LocalNotifications.schedule', e);
      }
    }
  }

  // ... (Altri metodi come testNotification e getPendingCount)
}
```

---

## 5. Integrazione Nativa Mobile (Capacitor)

Il codice web comunica in modo bidirezionale con i moduli nativi del telefono Android:
1. **Local Notification Scheduler**: I timestamp passati al modulo nativo Capacitor vengono inseriti nel servizio `AlarmManager` di Android. Ciò consente alle notifiche di essere emesse all'ora prestabilita anche se l'app è spenta o terminata dallo scheduler energetico di Android.
2. **Back Button Interception**: Intercetta il click del pulsante posteriore del telefono per prevenire una navigazione fuori dall'applicazione.
3. **Android Status Bar & Splashscreen**: Capacitor controlla il comportamento all'avvio sincronizzando il tema dell'applicazione (chiaro/scuro) con la barra di stato nativa tramite il plugin `@capacitor/status-bar`.

---

## 6. Istruzioni per lo Sviluppo e Build (APK Android)

L'applicazione dispone di script integrati in `package.json` che automatizzano i passaggi per ricompilare il codice web, agganciare le risorse native di Capacitor e avviare Gradle per creare l'APK installabile.

### 6.1 Avvio Locale per il Web (Development Mode)
Per eseguire l'app localmente su un computer da browser:
```bash
npm run start
```
* **Dietro le quinte**: Esegue lo script `scripts/set-env.js` che genera dinamicamente il file `environment.ts` contenente le chiavi API locali di Firebase, quindi avvia `ng serve` per servire l'app sulla porta `4200`.

### 6.2 Generazione del file APK Nativo (Android Debug)
Per ricompilare l'app e generare l'APK installabile sul proprio telefono Android, è sufficiente lanciare dal terminale il comando:
```bash
npm run build:android
```

Questo comando esegue una catena di cinque sotto-operazioni:
1. `node scripts/set-env-prod.js --platform android`: Configura le chiavi API ufficiali di Firebase Production specificando il package name autorizzato per le chiamate API Android.
2. `ng build`: Compila l'applicazione Angular eseguendo l'ottimizzazione del codice (tree-shaking, minimizzazione del codice JS e compressione delle classi CSS).
3. `npx @capacitor/assets generate --android`: Genera in automatico nei formati corretti le icone e le immagini di caricamento (splashscreen) per Android partendo dall'asset sorgente.
4. `npx cap sync android`: Allinea la cartella web compilata con la directory nativa del progetto Android Gradle (`/android`).
5. `cd android && gradlew assembleDebug`: Accede alla cartella di Android ed avvia Gradle per produrre il file APK compilato finale.

Il file APK risultante sarà disponibile nel percorso:
[app-debug.apk](file:///c:/Users/angelo.di.florio/Desktop/Progetto%20personale/gestionaleCasa/android/app/build/outputs/apk/debug/app-debug.apk)
