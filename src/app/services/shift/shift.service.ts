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

export interface Appointment {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  category: 'beauty' | 'transports' | 'second_job' | 'other';
  color: string;
  target: 'Angelo' | 'Daiana' | 'Couple';
}

export interface AppointmentCategory {
  id?: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
}

export interface DayAssignment {
  id: string; // dayName
  shifts?: Shift[]; // Daiana's shifts
  angeloInOffice?: boolean;
  appointments?: Appointment[];
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

  async deleteCategory(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'appointment_categories', id);
      return deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della categoria');
  }

}