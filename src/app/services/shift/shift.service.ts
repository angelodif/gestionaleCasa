import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, addDoc, deleteDoc, query, getDoc, collectionGroup, getDocs, writeBatch } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';
import { Observable } from 'rxjs';

export interface Shift {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  store?: string;
}

// Se hai già un'interfaccia Appointment in un altro file model, importala.
// Altrimenti puoi definirla qui sopra:
export interface Appointment {
  category: 'beauty' | 'transports' | 'second_job' | 'other';


  id?: string; // o number, a seconda del tuo backend
  title: string;
  startTime: string;      // 👈 Assicurati che ci sia
  endTime?: string;
  target: 'Angelo' | 'Daiana' | 'Couple'; // 👈 Assicurati che ci sia
  color?: string;         // 👈 Aggiungi questa (es. per il pallino colorato)
  reminderLeadTime?: { hours: number; minutes: number };
  // ... altre proprietà esistenti
}

export interface DayAssignment {
  id: string; // dayName
  shiftId?: string;
  label?: string;
  startTime?: string;
  endTime?: string;
  store?: string;

  // 🔴 NUOVI CAMPI DA AGGIUNGERE:
  angeloPresence?: string;    // Es. 'office' | 'home'
  angeloInOffice?: boolean;   // Il vecchio flag booleano
  appointments?: Appointment[]; // Array di appuntamenti del giorno
}

export interface AppointmentCategory {
  id?: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);

  // 1. Definizioni Turni (quelli che crei nel form in basso)
  getShifts(): Observable<Shift[]> {
    const shiftsRef = collection(this.firestore, 'shifts');
    return collectionData(shiftsRef, { idField: 'id' }) as Observable<Shift[]>;
  }

  async addShift(shift: Shift) {
    const shiftsRef = collection(this.firestore, 'shifts');
    const newDocRef = doc(shiftsRef);
    return this.notificationService.runWithRetry(async () => {
      return await setDoc(newDocRef, shift);
    }, 'Errore durante l\'aggiunta del turno');
  }

  async deleteShift(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'shifts', id);
      return deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione del turno');
  }

  // 2. Planner Settimanale (Organizzato per weekId)
  // Adesso accetta weekId (es. 2024-W11)
  getWeeklyPlanner(weekId: string): Observable<any[]> {
    const plannerRef = collection(this.firestore, `planners/${weekId}/assignments`);
    return collectionData(plannerRef, { idField: 'id' });
  }

  // Adesso accetta 3 argomenti: il nome del giorno, i dati del turno e il weekId
  async saveDayAssignment(dayId: string, data: any, weekId: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      return setDoc(docRef, data);
    }, 'Errore durante il salvataggio dell\'assegnazione del giorno');
  }

  // Nuovo metodo per cancellare un turno assegnato
  async deleteDayAssignment(dayId: string, weekId: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
      return deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione dell\'assegnazione');
  }

  async getAssignmentByDay(weekId: string, dayId: string) {
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  }

  // 3. Gestione Categorie
  getCategories(): Observable<AppointmentCategory[]> {
    const categoriesRef = collection(this.firestore, 'appointment_categories');
    return collectionData(categoriesRef, { idField: 'id' }) as Observable<AppointmentCategory[]>;
  }

  async addCategory(cat: AppointmentCategory) {
    const categoriesRef = collection(this.firestore, 'appointment_categories');
    const newDocRef = doc(categoriesRef);
    return this.notificationService.runWithRetry(async () => {
      return await setDoc(newDocRef, cat);
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

      return await batch.commit();
    }, 'Errore durante il salvataggio massivo delle categorie');
  }

  async deleteCategory(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'appointment_categories', id);
      return deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della categoria');
  }

}