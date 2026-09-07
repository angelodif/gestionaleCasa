import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, setDoc, deleteDoc, query, getDoc, writeBatch, getDocs, deleteField } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { Observable, firstValueFrom } from 'rxjs';

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

export interface PhysicalActivity {
  id?: string;
  target: 'Angelo' | 'Daiana';
  type: 'piscina' | 'palestra' | 'altro';
  title: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  location?: string;
  hasConflict?: boolean;
  conflictCommunicated?: boolean;
  ruleId?: string;
  isOccasional?: boolean;
}

export interface PhysicalActivityRule {
  id?: string;
  target: 'Angelo' | 'Daiana';
  type: 'piscina' | 'palestra' | 'altro';
  title: string;
  dayOfWeek: number; // 0 = Domenica, 1 = Lunedì, ..., 6 = Sabato
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  location?: string;
}

export interface FacilityTimeSlot {
  id?: string;
  facilityType: 'piscina' | 'palestra' | 'altro';
  dayOfWeek: number; // 0 = Domenica, 1 = Lunedì, ..., 6 = Sabato
  startTime: string;
  endTime: string;
  label?: string;
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
  physicalActivities?: PhysicalActivity[];
}

export function checkPhysicalActivityConflicts(assignment: DayAssignment): DayAssignment {
  if (!assignment || !assignment.physicalActivities || assignment.physicalActivities.length === 0) {
    return assignment;
  }

  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const updatedActivities = assignment.physicalActivities.map(act => {
    let hasConflict = false;
    const actStart = parseTime(act.startTime);
    const actEnd = parseTime(act.endTime);

    if (act.target === 'Daiana') {
      if (assignment.startTime && assignment.endTime) {
        const shiftStart = parseTime(assignment.startTime);
        const shiftEnd = parseTime(assignment.endTime);
        if (shiftStart < actEnd && shiftEnd > actStart) {
          hasConflict = true;
        }
      }
    } else if (act.target === 'Angelo') {
      const presence = assignment.angeloPresence || (assignment.angeloInOffice ? 'office' : 'home');
      if (presence === 'office') {
        const offStart = parseTime('09:00');
        const offEnd = parseTime('18:00');
        if (offStart < actEnd && offEnd > actStart) {
          hasConflict = true;
        }
      } else if (presence === 'office_morning') {
        const offStart = parseTime('09:00');
        const offEnd = parseTime('13:00');
        if (offStart < actEnd && offEnd > actStart) {
          hasConflict = true;
        }
      } else if (presence === 'office_afternoon') {
        const offStart = parseTime('14:00');
        const offEnd = parseTime('18:00');
        if (offStart < actEnd && offEnd > actStart) {
          hasConflict = true;
        }
      }
    }

    return { ...act, hasConflict };
  });

  return { ...assignment, physicalActivities: updatedActivities };
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
  target?: 'Angelo' | 'Daiana' | 'Couple';
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
    // Aggiornamento ottimistico immediato
    this.cacheService.updateCacheEntry(cacheKey, data);

    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      
      const cleanData = JSON.parse(JSON.stringify(data));
      const docDataToSave = { ...cleanData };
      const keysToDelete = ['label', 'startTime', 'endTime', 'shiftId', 'store'];
      keysToDelete.forEach(key => {
        if (!(key in docDataToSave)) {
          docDataToSave[key] = deleteField();
        }
      });

      const result = await setDoc(docRef, docDataToSave, { merge: true });
      this.cacheService.clearCacheEntry(`planner_${weekId}`);
      this.cacheService.clearCacheEntry(cacheKey);
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
   * Restituisce lo stream reattivo dell'assegnazione di un singolo giorno.
   */
  getAssignmentByDayStream(weekId: string, dayId: string): Observable<any> {
    const cacheKey = `assignment_${weekId}_${dayId}`;
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    const source$ = docData(docRef);
    return this.cacheService.getCachedCollection<any>(cacheKey, source$);
  }

  /**
   * Lettura di un singolo giorno — con cache locale o stream Firebase.
   */
  async getAssignmentByDay(weekId: string, dayId: string) {
    const cacheKey = `assignment_${weekId}_${dayId}`;

    if (this.cacheService.isCacheValid(cacheKey)) {
      const cached = this.cacheService.getFromCache<any>(cacheKey);
      if (cached !== null) return cached;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = this.cacheService.getFromCache<any>(cacheKey);
      if (cached !== null) return cached;
    }

    try {
      return await firstValueFrom(this.getAssignmentByDayStream(weekId, dayId));
    } catch (err) {
      console.warn(`[ShiftService] Errore nel recupero assegnazione "${weekId}/${dayId}". Fallback su cache locale.`, err);
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
          year: 1993,
          target: 'Couple'
        });
      }
      if (!daianaExists) {
        await this.saveRecurringEvent({
          name: 'Daiana',
          type: 'birthday',
          day: 25,
          month: 10,
          year: 1992,
          target: 'Couple'
        });
      }
      localStorage.setItem('default_birthdays_initialized', 'true');
    } catch (e) {
      console.error('Errore durante l\'inizializzazione dei compleanni di default', e);
    }
  }

  // ── 5. Attività Fisica & Tabella Orari ────────────────────────────────────

  getPhysicalActivityRules(): Observable<PhysicalActivityRule[]> {
    const ref = collection(this.firestore, 'physical_activity_rules');
    const source$ = collectionData(ref, { idField: 'id' }) as Observable<PhysicalActivityRule[]>;
    return this.cacheService.getCachedCollection<PhysicalActivityRule[]>('physical_activity_rules', source$);
  }

  async savePhysicalActivityRule(rule: PhysicalActivityRule) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = rule.id
        ? doc(this.firestore, 'physical_activity_rules', rule.id)
        : doc(collection(this.firestore, 'physical_activity_rules'));
      const toSave = JSON.parse(JSON.stringify({ ...rule }));
      if (!toSave.id) toSave.id = docRef.id;
      await setDoc(docRef, toSave, { merge: true });
      this.cacheService.clearCacheEntry('physical_activity_rules');
    }, 'Errore durante il salvataggio della regola per l\'attività fisica');
  }

  async deletePhysicalActivityRule(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'physical_activity_rules', id);
      await deleteDoc(docRef);
      this.cacheService.clearCacheEntry('physical_activity_rules');
    }, 'Errore durante l\'eliminazione della regola per l\'attività fisica');
  }

  getFacilityTimeSlots(): Observable<FacilityTimeSlot[]> {
    const ref = collection(this.firestore, 'facility_timeslots');
    const source$ = collectionData(ref, { idField: 'id' }) as Observable<FacilityTimeSlot[]>;
    this.initializeDefaultFacilitySlots();
    return this.cacheService.getCachedCollection<FacilityTimeSlot[]>('facility_timeslots', source$);
  }

  async initializeDefaultFacilitySlots() {
    if (typeof window === 'undefined') return;
    const initialized = localStorage.getItem('default_facility_slots_initialized');
    if (initialized) return;

    try {
      const ref = collection(this.firestore, 'facility_timeslots');
      const snap = await getDocs(ref);
      if (snap.empty) {
        const defaultSlots: FacilityTimeSlot[] = [
          { facilityType: 'piscina', dayOfWeek: -1, startTime: '09:00', endTime: '10:00', label: 'Mattina' },
          { facilityType: 'piscina', dayOfWeek: -1, startTime: '13:00', endTime: '14:00', label: 'Pausa Pranzo' },
          { facilityType: 'piscina', dayOfWeek: -1, startTime: '18:00', endTime: '19:00', label: 'Pomeriggio' },
          { facilityType: 'piscina', dayOfWeek: -1, startTime: '19:00', endTime: '20:00', label: 'Serale 1' },
          { facilityType: 'piscina', dayOfWeek: -1, startTime: '20:00', endTime: '21:00', label: 'Serale 2' },
          { facilityType: 'palestra', dayOfWeek: -1, startTime: '09:00', endTime: '10:30', label: 'Mattina' },
          { facilityType: 'palestra', dayOfWeek: -1, startTime: '13:00', endTime: '14:30', label: 'Pausa Pranzo' },
          { facilityType: 'palestra', dayOfWeek: -1, startTime: '18:00', endTime: '19:30', label: 'Pomeriggio' },
          { facilityType: 'palestra', dayOfWeek: -1, startTime: '19:30', endTime: '21:00', label: 'Serale' }
        ];

        const batch = writeBatch(this.firestore);
        defaultSlots.forEach(slot => {
          const newDocRef = doc(ref);
          batch.set(newDocRef, { ...slot, id: newDocRef.id });
        });
        await batch.commit();
        this.cacheService.clearCacheEntry('facility_timeslots');
      }
      localStorage.setItem('default_facility_slots_initialized', 'true');
    } catch (e) {
      console.error('Errore durante l\'inizializzazione degli slot orari di default', e);
    }
  }

  async saveFacilityTimeSlot(slot: FacilityTimeSlot) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = slot.id
        ? doc(this.firestore, 'facility_timeslots', slot.id)
        : doc(collection(this.firestore, 'facility_timeslots'));
      const toSave = JSON.parse(JSON.stringify({ ...slot }));
      if (!toSave.id) toSave.id = docRef.id;
      await setDoc(docRef, toSave, { merge: true });
      this.cacheService.clearCacheEntry('facility_timeslots');
    }, 'Errore durante il salvataggio dello slot orario');
  }

  async deleteFacilityTimeSlot(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'facility_timeslots', id);
      await deleteDoc(docRef);
      this.cacheService.clearCacheEntry('facility_timeslots');
    }, 'Errore durante l\'eliminazione dello slot orario');
  }
}