import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, query, getDoc, writeBatch, getDocs, deleteField } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { Observable } from 'rxjs';

export interface Shift {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  store?: string;
}

export interface Appointment {
  category: 'beauty' | 'transports' | 'second_job' | 'other';
  id?: string;
  title: string;
  startTime: string;
  endTime?: string;
  target: 'Angelo' | 'Daiana' | 'Couple';
  color?: string;
  reminderLeadTime?: { hours: number; minutes: number };
}

export interface DayAssignment {
  id: string; // dayName
  shiftId?: string;
  label?: string;
  startTime?: string;
  endTime?: string;
  store?: string;
  angeloPresence?: string;
  angeloInOffice?: boolean;
  appointments?: Appointment[];
}

export interface AppointmentCategory {
  id?: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
}

export interface RecurringEvent {
  id?: string;
  name: string;
  type: 'birthday' | 'nameday';
  day: number;
  month: number;
  year?: number;
}

const CACHE_KEY_SHIFTS = 'shifts';
const CACHE_KEY_CATEGORIES = 'appointment_categories';

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  constructor() {
    this.initializeDefaultRecurringEvents();
  }

  // ── 1. Definizioni Turni ─────────────────────────────────────────────────

  /**
   * Restituisce i turni dalla cache locale se valida,
   * altrimenti da Firestore.
   */
  getShifts(): Observable<Shift[]> {
    const shiftsRef = collection(this.firestore, 'shifts');
    const source$ = collectionData(shiftsRef, { idField: 'id' }) as Observable<Shift[]>;
    return this.cacheService.getCachedCollection<Shift[]>(CACHE_KEY_SHIFTS, source$);
  }

  async addShift(shift: Shift) {
    const shiftsRef = collection(this.firestore, 'shifts');
    const newDocRef = doc(shiftsRef);
    return this.notificationService.runWithRetry(async () => {
      const result = await setDoc(newDocRef, shift);
      this.cacheService.clearCacheEntry(CACHE_KEY_SHIFTS);
      return result;
    }, 'Errore durante l\'aggiunta del turno');
  }

  async deleteShift(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'shifts', id);
      const result = await deleteDoc(docRef);
      this.cacheService.clearCacheEntry(CACHE_KEY_SHIFTS);
      return result;
    }, 'Errore durante l\'eliminazione del turno');
  }

  // ── 2. Planner Settimanale ───────────────────────────────────────────────

  /**
   * Restituisce il planner della settimana dalla cache locale se valida.
   * La chiave include il weekId per isolare le cache per settimana.
   */
  getWeeklyPlanner(weekId: string): Observable<any[]> {
    const plannerRef = collection(this.firestore, `planners/${weekId}/assignments`);
    const source$ = collectionData(plannerRef, { idField: 'id' });
    return this.cacheService.getCachedCollection<any[]>(`planner_${weekId}`, source$);
  }

  async saveDayAssignment(dayId: string, data: any, weekId: string) {
    const cacheKey = `assignment_${weekId}_${dayId}`;
    this.cacheService.saveToCache(cacheKey, data);

    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      
      const docData = { ...data };
      const keysToDelete = ['label', 'startTime', 'endTime', 'shiftId', 'store'];
      keysToDelete.forEach(key => {
        if (!(key in docData)) {
          docData[key] = deleteField();
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

  /**
   * Lettura di un singolo giorno — con cache offline e timeout di 3s
   */
  async getAssignmentByDay(weekId: string, dayId: string) {
    const cacheKey = `assignment_${weekId}_${dayId}`;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = this.cacheService.getFromCache<any>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    try {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 3000)
      );

      const snap = await Promise.race([
        getDoc(docRef),
        timeoutPromise
      ]) as any;

      if (snap.exists()) {
        const data = snap.data();
        this.cacheService.saveToCache(cacheKey, data);
        return data;
      }
      return null;
    } catch (err) {
      console.warn(`[ShiftService] Errore o timeout nel recupero assegnazione "${weekId}/${dayId}". Fallback su cache locale.`, err);
      return this.cacheService.getFromCache<any>(cacheKey);
    }
  }

  // ── 3. Categorie Appuntamenti ────────────────────────────────────────────

  /**
   * Restituisce le categorie dalla cache locale se valida.
   */
  getCategories(): Observable<AppointmentCategory[]> {
    const categoriesRef = collection(this.firestore, 'appointment_categories');
    const source$ = collectionData(categoriesRef, { idField: 'id' }) as Observable<AppointmentCategory[]>;
    return this.cacheService.getCachedCollection<AppointmentCategory[]>(CACHE_KEY_CATEGORIES, source$);
  }

  async addCategory(cat: AppointmentCategory) {
    const categoriesRef = collection(this.firestore, 'appointment_categories');
    const newDocRef = doc(categoriesRef);
    return this.notificationService.runWithRetry(async () => {
      const result = await setDoc(newDocRef, cat);
      this.cacheService.clearCacheEntry(CACHE_KEY_CATEGORIES);
      return result;
    }, 'Errore durante l\'aggiunta della categoria');
  }

  async addCategoriesBatch(categories: AppointmentCategory[]) {
    if (categories.length === 0) return;
    return this.notificationService.runWithRetry(async () => {
      const batch = writeBatch(this.firestore);
      const categoriesRef = collection(this.firestore, 'appointment_categories');
      categories.forEach(cat => {
        const newDocRef = doc(categoriesRef);
        batch.set(newDocRef, cat);
      });
      const result = await batch.commit();
      this.cacheService.clearCacheEntry(CACHE_KEY_CATEGORIES);
      return result;
    }, 'Errore durante il salvataggio massivo delle categorie');
  }

  async deleteCategory(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'appointment_categories', id);
      const result = await deleteDoc(docRef);
      this.cacheService.clearCacheEntry(CACHE_KEY_CATEGORIES);
      return result;
    }, 'Errore durante l\'eliminazione della categoria');
  }

  // ── 4. Ricorrenze (Compleanni & Onomastici) ───────────────────────────────

  getRecurringEvents(): Observable<RecurringEvent[]> {
    const ref = collection(this.firestore, 'recurring_events');
    const source$ = collectionData(ref, { idField: 'id' }) as Observable<RecurringEvent[]>;
    return this.cacheService.getCachedCollection<RecurringEvent[]>('recurring_events', source$);
  }

  async saveRecurringEvent(event: RecurringEvent) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = event.id 
        ? doc(this.firestore, 'recurring_events', event.id)
        : doc(collection(this.firestore, 'recurring_events'));
      const toSave = { ...event };
      if (!toSave.id) toSave.id = docRef.id;
      await setDoc(docRef, toSave, { merge: true });
      this.cacheService.clearCacheEntry('recurring_events');
    }, 'Errore durante il salvataggio dell\'evento');
  }

  async deleteRecurringEvent(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'recurring_events', id);
      await deleteDoc(docRef);
      this.cacheService.clearCacheEntry('recurring_events');
    }, 'Errore durante l\'eliminazione dell\'evento');
  }

  async initializeDefaultRecurringEvents() {
    if (typeof window === 'undefined') return;
    const initialized = localStorage.getItem('default_birthdays_initialized');
    if (initialized) return;

    try {
      const ref = collection(this.firestore, 'recurring_events');
      const snap = await getDocs(ref);
      const events = snap.docs.map(doc => doc.data() as RecurringEvent);

      const angeloExists = events.some(e => e.name === 'Angelo' && e.type === 'birthday' && e.day === 27 && e.month === 8);
      const daianaExists = events.some(e => e.name === 'Daiana' && e.type === 'birthday' && e.day === 25 && e.month === 10);

      if (!angeloExists) {
        await this.saveRecurringEvent({
          name: 'Angelo',
          type: 'birthday',
          day: 27,
          month: 8,
          year: 1993
        });
      }
      if (!daianaExists) {
        await this.saveRecurringEvent({
          name: 'Daiana',
          type: 'birthday',
          day: 25,
          month: 10,
          year: 1992
        });
      }
      localStorage.setItem('default_birthdays_initialized', 'true');
    } catch (e) {
      console.error('Errore durante l\'inizializzazione dei compleanni di default', e);
    }
  }
}