import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, setDoc, docData } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { first, filter, timeout, switchMap } from 'rxjs/operators';

// ─────────────────────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_TIMESTAMP_DOC = 'app_config/cache_timestamp';
const LOCAL_TIMESTAMP_KEY = 'cache_last_update';
const LOCAL_TIMESTAMPS_KEY = 'cache_local_timestamps';
const CACHE_DATA_PREFIX = 'cache_data__';

// ─────────────────────────────────────────────────────────────────────────────
// Interfacce
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Servizio
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CacheService {

  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(Auth);

  // ── Signals & Streams ────────────────────────────────────────────────────

  readonly remoteTimestamps = signal<Record<string, number>>({});

  // ── Ready promise: si risolve appena i timestamp vengono pre-caricati da localStorage.
  // I servizi possono usarla per sapere che la cache è pronta (anche offline).
  private _readyResolve!: () => void;
  readonly ready$: Promise<void> = new Promise(resolve => { this._readyResolve = resolve; });

  private readonly cacheStreams = new Map<
    string,
    { subject: BehaviorSubject<any>; source$: Observable<any>; feature: string }
  >();

  // ── Metodo di inizializzazione (APP_INITIALIZER) ──────────────────────────

  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      console.log('[CacheService] SSR detected — skip cache initialization.');
      return;
    }

    // 1. Stato iniziale Offline-first dal LocalStorage
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

    // Segna il servizio come pronto: i timestamp da localStorage sono già disponibili.
    // I componenti possono già usare la cache (anche offline).
    this._readyResolve();

    // 2. ASCOLTO REAL-TIME DEI TIMESTAMP
    user(this.auth).pipe(
      switchMap((currentUser) => {
        if (currentUser) {
          console.log('[CacheService] Utente autenticato. Attivo ascolto real-time sui timestamp di cache...');
          const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
          return docData(docRef);
        } else {
          console.log('[CacheService] Utente scollegato. Disattivo ascolto real-time sui timestamp.');
          return of(null);
        }
      })
    ).subscribe({
      next: (remoteData: any) => {
        if (!remoteData) return;

        const remoteTsMap = remoteData as Record<string, number>;
        this.remoteTimestamps.set(remoteTsMap);
        console.log('[CacheService] 📡 Timestamp remoti aggiornati in real-time:', remoteTsMap);

        const currentLocalMap = this.getLocalTimestampsMap();
        let localMapChanged = false;

        Object.keys(remoteTsMap).forEach(feature => {
          const remoteVal = remoteTsMap[feature] ?? 0;
          const localVal = currentLocalMap[feature] ?? null;

          if (remoteVal !== 0 && (localVal === null || remoteVal !== localVal)) {
            console.log(`[CacheService] 🔄 Cambio rilevato per la feature "${feature}". Invalido cache locale.`);

            delete currentLocalMap[feature];
            localMapChanged = true;

            this.cacheStreams.forEach((stream, key) => {
              if (stream.feature === feature) {
                console.log(`[CacheService] 🔥 Spingo i nuovi dati nello stream attivo per la chiave: "${key}"`);
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

  // ── API pubblica per i DataService ────────────────────────────────────────

  isCacheValid(key?: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    if (!key) {
      const remoteGlobal = this.remoteTimestamps()['last_update'];
      const raw = localStorage.getItem(LOCAL_TIMESTAMP_KEY);
      const localGlobal = raw ? Number(raw) : null;
      return remoteGlobal !== undefined && localGlobal !== null && remoteGlobal === localGlobal;
    }

    const feature = this.getFeatureKey(key);
    const remote = this.remoteTimestamps()[feature];
    const local = this.getLocalTimestampForFeature(feature);

    if (remote === undefined || remote === 0) return false;
    return local !== null && remote === local;
  }

  saveToCache<T>(key: string, data: T): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
      localStorage.setItem(`${CACHE_DATA_PREFIX}${key}`, JSON.stringify(entry));
    } catch (err) {
      console.warn(`[CacheService] Impossibile salvare la cache per la chiave "${key}":`, err);
    }
  }

  getFromCache<T>(key: string): T | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = localStorage.getItem(`${CACHE_DATA_PREFIX}${key}`);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      return entry.data ?? null;
    } catch {
      return null;
    }
  }

  updateLocalTimestamp(key?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const feature = key ? this.getFeatureKey(key) : 'global';

    if (feature === 'global') {
      const ts = this.remoteTimestamps()['last_update'];
      if (ts !== undefined) {
        localStorage.setItem(LOCAL_TIMESTAMP_KEY, ts.toString());
      }
      return;
    }

    const ts = this.remoteTimestamps()[feature];
    if (ts !== undefined) {
      this.setLocalTimestampForFeature(feature, ts);
    }
  }

  invalidateCache(featureKey?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!featureKey) {
      localStorage.removeItem(LOCAL_TIMESTAMP_KEY);
      localStorage.removeItem(LOCAL_TIMESTAMPS_KEY);
      console.log('[CacheService] 🗑️ Tutte le cache invalidate manualmente.');
      return;
    }

    const feature = this.getFeatureKey(featureKey);
    const map = this.getLocalTimestampsMap();
    delete map[feature];
    localStorage.setItem(LOCAL_TIMESTAMPS_KEY, JSON.stringify(map));
    console.log(`[CacheService] 🗑️ Cache invalidata manualmente per la feature "${feature}".`);
  }

  async clearCacheEntry(key: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.removeItem(`${CACHE_DATA_PREFIX}${key}`);
    console.log(`[CacheService] Cache rimossa per: "${key}"`);

    const feature = this.getFeatureKey(key);

    // Attendiamo l'aggiornamento del timestamp remoto prima di rifare il fetch.
    // Su Capacitor è importante che questa operazione sia awaited.
    await this.updateRemoteTimestampAsync(feature);

    const stream = this.cacheStreams.get(key);
    if (stream) {
      this.fetchAndPublish(key, feature, stream.source$, stream.subject);
    }
  }

  // ── Helper generico per i DataService ────────────────────────────────────

  getCachedCollection<T>(key: string, source$: Observable<T>): Observable<T> {
    const feature = this.getFeatureKey(key);

    if (!this.cacheStreams.has(key)) {
      const subject = new BehaviorSubject<any>(null);
      this.cacheStreams.set(key, { subject, source$, feature });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log(`[CacheService] 📴 Offline rilevato. Tentativo di caricamento immediato da cache per: "${key}"`);
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          console.log(`[CacheService] 📦 Cache HIT (offline) per: "${key}"`);
          subject.next(cached);
        } else {
          this.fetchAndPublish(key, feature, source$, subject);
        }
      } else if (this.isCacheValid(key)) {
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          console.log(`[CacheService] 📦 Cache HIT per: "${key}"`);
          subject.next(cached);
        } else {
          this.fetchAndPublish(key, feature, source$, subject);
        }
      } else {
        this.fetchAndPublish(key, feature, source$, subject);
      }
    }

    return this.cacheStreams.get(key)!.subject.asObservable().pipe(
      filter(val => val !== null)
    ) as Observable<T>;
  }

  updateCacheEntry<T>(key: string, data: T): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.saveToCache(key, data);

    const stream = this.cacheStreams.get(key);
    if (stream) {
      stream.subject.next(data);
    }
  }

  getFeatureKey(cacheKey: string): string {
    if (!cacheKey) return 'global';
    const key = cacheKey.toLowerCase();
    if (key.includes('shopping')) return 'shopping';
    if (key.includes('meal')) return 'meals';
    if (key.includes('shift') || key.includes('appointment') || key.includes('planner')) return 'shifts';
    if (key.includes('deadline')) return 'deadlines';
    if (key.includes('waste')) return 'waste';
    // 'finance_categories' contiene 'finance' ma non 'expense'/'budget' — incluso esplicitamente.
    if (key.includes('expense') || key.includes('budget') || key.includes('finance')) return 'finance';
    if (key.includes('personal')) return 'finance';
    return 'global';
  }

  // ── Metodi privati ripristinati ──────────────────────────────────────────

  private fetchAndPublish<T>(
    key: string,
    feature: string,
    source$: Observable<T>,
    subject: BehaviorSubject<T | null>
  ): void {
    source$.pipe(
      first(),
      timeout({ each: 4000 })
    ).subscribe({
      next: (data) => {
        this.saveToCache(key, data);

        const remoteTs = this.remoteTimestamps()[feature] || Date.now();
        this.setLocalTimestampForFeature(feature, remoteTs);

        subject.next(data);
        console.log(`[CacheService] 🔥 Cache MISS / Refresh — dati salvati per: "${key}"`);
      },
      error: (err) => {
        console.warn(`[CacheService] Errore o timeout nel recupero dati per "${key}". Fallback su cache locale.`, err);
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          subject.next(cached);
        }
      }
    });
  }

  private async updateRemoteTimestampAsync(feature: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Offline');
      }

      const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
      const now = Date.now();

      // Timeout di 3 secondi per evitare blocchi indefiniti
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 3000)
      );

      await Promise.race([
        setDoc(docRef, { [feature]: now, last_update: now }, { merge: true }),
        timeoutPromise
      ]);

      this.remoteTimestamps.update(ts => ({ ...ts, [feature]: now, last_update: now }));

      this.setLocalTimestampForFeature(feature, now);
      this.setLocalTimestampForFeature('global', now);
      localStorage.setItem(LOCAL_TIMESTAMP_KEY, now.toString());

      console.log(`[CacheService] 🔄 Timestamp remoto e locale aggiornati per "${feature}": ${now}`);
    } catch (err) {
      console.warn(`[CacheService] Impossibile aggiornare il timestamp remoto per "${feature}" (offline/errore):`, err);
      const now = Date.now();
      this.setLocalTimestampForFeature(feature, now);
    }
  }

  private getLocalTimestampsMap(): Record<string, number> {
    if (!isPlatformBrowser(this.platformId)) return {};
    const raw = localStorage.getItem(LOCAL_TIMESTAMPS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private getLocalTimestampForFeature(feature: string): number | null {
    const map = this.getLocalTimestampsMap();
    return map[feature] ?? null;
  }

  private setLocalTimestampForFeature(feature: string, ts: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const map = this.getLocalTimestampsMap();
    map[feature] = ts;
    localStorage.setItem(LOCAL_TIMESTAMPS_KEY, JSON.stringify(map));
  }
}