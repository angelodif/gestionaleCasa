import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { first, filter } from 'rxjs/operators';

// ─────────────────────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────────────────────

/** Percorso del documento Firestore che contiene il timestamp globale di cache. */
const FIREBASE_TIMESTAMP_DOC = 'app_config/cache_timestamp';

/** Campo del documento Firestore che contiene il timestamp globale (mantenuto per retrocompatibilità). */
const FIREBASE_TIMESTAMP_FIELD = 'last_update';

/** Chiave LocalStorage in cui viene salvato il timestamp locale globale. */
const LOCAL_TIMESTAMP_KEY = 'cache_last_update';

/** Chiave LocalStorage in cui viene salvata la mappa dei timestamp locali per feature. */
const LOCAL_TIMESTAMPS_KEY = 'cache_local_timestamps';

/** Prefisso usato per le chiavi dei dati cached in LocalStorage. */
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

/**
 * CacheService — Gestisce la strategia di caching per-feature dell'applicazione.
 *
 * ## Flusso di avvio (APP_INITIALIZER):
 * 1. Legge il documento `app_config/cache_timestamp` da Firestore.
 * 2. Confronta i timestamp remoti delle singole feature con quelli locali in LocalStorage.
 * 3. Se corrispondono, i DataService usano i dati locali. Altrimenti riscaricano da Firestore.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {

  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  // ── Signals & Streams ────────────────────────────────────────────────────

  /**
   * Mappa dei timestamp remoti recuperati da Firestore durante l'inizializzazione.
   */
  readonly remoteTimestamps = signal<Record<string, number>>({});

  /**
   * Dizionario dei BehaviorSubject attivi per ciascuna chiave di cache.
   * Consente la propagazione in tempo reale degli aggiornamenti ai componenti iscritti.
   */
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

    try {
      const remoteTsMap = await this.fetchRemoteTimestamp();
      this.remoteTimestamps.set(remoteTsMap);

      const localTsMap = this.getLocalTimestampsMap();
      console.log('[CacheService] remoteTimestamps:', remoteTsMap);
      console.log('[CacheService] localTimestamps:', localTsMap);

      const features = ['shopping', 'meals', 'shifts', 'deadlines', 'waste', 'finance'];
      features.forEach(feature => {
        const remote = remoteTsMap[feature] ?? 0;
        const local = localTsMap[feature] ?? null;
        if (remote !== 0 && local !== null && remote === local) {
          console.log(`[CacheService] ✅ Cache valida per "${feature}" (timestamp: ${remote})`);
        } else {
          console.log(
            `[CacheService] ⚠️ Cache non valida per "${feature}" — remoto: ${remote}, locale: ${local}`
          );
        }
      });
    } catch (err) {
      console.warn('[CacheService] Offline o Firebase non raggiungibile durante initialize. Usando cache locali esistenti.', err);
      // Se Firebase non è raggiungibile, consideriamo valide le cache locali che hanno un timestamp
      const localTsMap = this.getLocalTimestampsMap();
      const simulatedRemote: Record<string, number> = {};
      Object.keys(localTsMap).forEach(k => {
        simulatedRemote[k] = localTsMap[k];
      });
      // Aggiungiamo anche il vecchio timestamp globale se esistente
      const rawGlobal = localStorage.getItem(LOCAL_TIMESTAMP_KEY);
      if (rawGlobal) {
        simulatedRemote['last_update'] = Number(rawGlobal);
      }
      this.remoteTimestamps.set(simulatedRemote);
    }
  }

  // ── API pubblica per i DataService ────────────────────────────────────────

  /**
   * Verifica se la cache per un determinato servizio/chiave (o quella globale) è valida.
   */
  isCacheValid(key?: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    if (!key) {
      // Controllo globale retrocompatibile
      const remoteGlobal = this.remoteTimestamps()['last_update'];
      const raw = localStorage.getItem(LOCAL_TIMESTAMP_KEY);
      const localGlobal = raw ? Number(raw) : null;
      return remoteGlobal !== undefined && localGlobal !== null && remoteGlobal === localGlobal;
    }

    const feature = this.getFeatureKey(key);
    const remote = this.remoteTimestamps()[feature];
    const local = this.getLocalTimestampForFeature(feature);

    if (remote === undefined) return false;
    return local !== null && remote === local;
  }

  /**
   * Salva i dati serializzati in LocalStorage sotto la chiave specificata.
   */
  saveToCache<T>(key: string, data: T): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
      localStorage.setItem(`${CACHE_DATA_PREFIX}${key}`, JSON.stringify(entry));
    } catch (err) {
      console.warn(`[CacheService] Impossibile salvare la cache per la chiave "${key}":`, err);
    }
  }

  /**
   * Recupera i dati dalla cache LocalStorage per la chiave specificata.
   */
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

  /**
   * Allinea il timestamp locale con quello remoto per una determinata chiave di cache/feature.
   */
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

  /**
   * Invalida la cache locale globale o per una singola feature.
   */
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

  /**
   * Rimuove un singolo entry dalla cache (es. dopo aver aggiornato solo quella collezione)
   * e forza la re-iscrizione/aggiornamento in background se c'è uno stream attivo.
   */
  clearCacheEntry(key: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.removeItem(`${CACHE_DATA_PREFIX}${key}`);
    console.log(`[CacheService] Cache rimossa per: "${key}"`);

    const feature = this.getFeatureKey(key);
    // Avvia l'aggiornamento del timestamp remoto asincrono
    this.updateRemoteTimestampAsync(feature);

    // Forza il refresh dello stream attivo se esiste
    const stream = this.cacheStreams.get(key);
    if (stream) {
      this.fetchAndPublish(key, feature, stream.source$, stream.subject);
    }
  }

  // ── Helper generico per i DataService ────────────────────────────────────

  /**
   * Gestisce l'accesso e la memorizzazione dei dati tramite BehaviorSubject.
   * Se la cache è valida emette il valore cached, altrimenti interroga il BE
   * e memorizza il risultato. Qualsiasi aggiornamento futuro sul BehaviorSubject
   * verrà notificato ai componenti iscritti in tempo reale.
   */
  getCachedCollection<T>(key: string, source$: Observable<T>): Observable<T> {
    const feature = this.getFeatureKey(key);

    if (!this.cacheStreams.has(key)) {
      const subject = new BehaviorSubject<any>(null);
      this.cacheStreams.set(key, { subject, source$, feature });

      if (this.isCacheValid(key)) {
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          console.log(`[CacheService] 📦 Cache HIT per: "${key}"`);
          subject.next(cached);
        } else {
          // Timestamp valido ma file fisico mancante in LocalStorage (edge case)
          this.fetchAndPublish(key, feature, source$, subject);
        }
      } else {
        // Cache miss
        this.fetchAndPublish(key, feature, source$, subject);
      }
    }

    // Restituisce l'Observable associato al BehaviorSubject, ignorando l'emissione iniziale null
    return this.cacheStreams.get(key)!.subject.asObservable().pipe(
      filter(val => val !== null)
    ) as Observable<T>;
  }

  /**
   * Consente l'aggiornamento manuale del valore in cache ed emette il valore in real-time
   * a tutte le sottoscrizioni attive del stream.
   */
  updateCacheEntry<T>(key: string, data: T): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.saveToCache(key, data);

    const stream = this.cacheStreams.get(key);
    if (stream) {
      stream.subject.next(data);
    }
  }

  /**
   * Associa una chiave di cache al relativo servizio/feature.
   */
  getFeatureKey(cacheKey: string): string {
    if (!cacheKey) return 'global';
    const key = cacheKey.toLowerCase();
    if (key.includes('shopping')) return 'shopping';
    if (key.includes('meal')) return 'meals';
    if (key.includes('shift') || key.includes('appointment') || key.includes('planner')) return 'shifts';
    if (key.includes('deadline')) return 'deadlines';
    if (key.includes('waste')) return 'waste';
    if (key.includes('expense') || key.includes('budget')) return 'finance';
    return 'global';
  }

  // ── Metodi privati ────────────────────────────────────────────────────────

  /**
   * Helper per eseguire la query Firebase in background e pubblicare i dati aggiornati sul Subject.
   */
  private fetchAndPublish<T>(
    key: string,
    feature: string,
    source$: Observable<T>,
    subject: BehaviorSubject<T | null>
  ): void {
    source$.pipe(first()).subscribe({
      next: (data) => {
        this.saveToCache(key, data);

        // Allinea il timestamp locale con quello remoto corrente
        const remoteTs = this.remoteTimestamps()[feature] || Date.now();
        this.setLocalTimestampForFeature(feature, remoteTs);

        subject.next(data);
        console.log(`[CacheService] 🔥 Cache MISS / Refresh — dati salvati per: "${key}"`);
      },
      error: (err) => {
        console.warn(`[CacheService] Errore nel recupero dati per "${key}". Fallback su cache locale.`, err);
        const cached = this.getFromCache<T>(key);
        if (cached !== null) {
          subject.next(cached);
        }
      }
    });
  }

  /**
   * Aggiorna in modo asincrono (fire-and-forget) il timestamp remoto per una feature su Firestore.
   */
  private async updateRemoteTimestampAsync(feature: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
      const now = Date.now();
      await setDoc(docRef, { [feature]: now, last_update: now }, { merge: true });

      // Aggiorna il signal locale
      this.remoteTimestamps.update(ts => ({ ...ts, [feature]: now, last_update: now }));

      // Allinea il timestamp locale per evitare cache miss sul client corrente
      this.setLocalTimestampForFeature(feature, now);
      this.setLocalTimestampForFeature('global', now);
      localStorage.setItem(LOCAL_TIMESTAMP_KEY, now.toString());

      console.log(`[CacheService] 🔄 Timestamp remoto e locale aggiornati per "${feature}": ${now}`);
    } catch (err) {
      console.warn(`[CacheService] Impossibile aggiornare il timestamp remoto per "${feature}" (offline/errore):`, err);
      // In caso di errore offline, allineiamo comunque localmente
      const now = Date.now();
      this.setLocalTimestampForFeature(feature, now);
    }
  }

  /**
   * Esegue la singola lettura su Firestore per recuperare i timestamp remoti.
   */
  private async fetchRemoteTimestamp(): Promise<Record<string, number>> {
    const docRef = doc(this.firestore, FIREBASE_TIMESTAMP_DOC);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      console.warn(
        `[CacheService] Il documento "${FIREBASE_TIMESTAMP_DOC}" non esiste su Firestore.`
      );
      return {};
    }
    return snap.data() as Record<string, number>;
  }

  /**
   * Recupera la mappa dei timestamp locali da LocalStorage.
   */
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

  /**
   * Recupera il timestamp locale per una specifica feature.
   */
  private getLocalTimestampForFeature(feature: string): number | null {
    const map = this.getLocalTimestampsMap();
    return map[feature] ?? null;
  }

  /**
   * Salva il timestamp locale per una specifica feature.
   */
  private setLocalTimestampForFeature(feature: string, ts: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const map = this.getLocalTimestampsMap();
    map[feature] = ts;
    localStorage.setItem(LOCAL_TIMESTAMPS_KEY, JSON.stringify(map));
  }
}
