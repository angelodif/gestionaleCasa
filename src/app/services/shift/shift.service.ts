import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, query, getDoc, writeBatch } from '@angular/fire/firestore';
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

const CACHE_KEY_SHIFTS = 'shifts';
const CACHE_KEY_CATEGORIES = 'appointment_categories';

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

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
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      const result = await setDoc(docRef, data);
      // Invalida solo il planner di quella settimana
      this.cacheService.clearCacheEntry(`planner_${weekId}`);
      return result;
    }, 'Errore durante il salvataggio dell\'assegnazione del giorno');
  }

  async deleteDayAssignment(dayId: string, weekId: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      const result = await deleteDoc(docRef);
      this.cacheService.clearCacheEntry(`planner_${weekId}`);
      return result;
    }, 'Errore durante l\'eliminazione dell\'assegnazione');
  }

  /**
   * Lettura one-shot di un singolo giorno — sempre live da Firestore
   * (usato per notifiche push, non serve cache).
   */
  async getAssignmentByDay(weekId: string, dayId: string) {
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
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
}