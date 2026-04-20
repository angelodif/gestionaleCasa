import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, addDoc, deleteDoc, query, getDoc, collectionGroup, getDocs, writeBatch } from '@angular/fire/firestore';
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

  // 1. Definizioni Turni (quelli che crei nel form in basso)
  getShifts(): Observable<Shift[]> {
    const shiftsRef = collection(this.firestore, 'shifts');
    return collectionData(shiftsRef, { idField: 'id' }) as Observable<Shift[]>;
  }

  async addShift(shift: Shift) {
    const shiftsRef = collection(this.firestore, 'shifts');
    return addDoc(shiftsRef, shift);
  }

  async deleteShift(id: string) {
    const docRef = doc(this.firestore, 'shifts', id);
    return deleteDoc(docRef);
  }

  // 2. Planner Settimanale (Organizzato per weekId)
  // Adesso accetta weekId (es. 2024-W11)
  getWeeklyPlanner(weekId: string): Observable<any[]> {
    const plannerRef = collection(this.firestore, `planners/${weekId}/assignments`);
    return collectionData(plannerRef, { idField: 'id' });
  }

  // Adesso accetta 3 argomenti: il nome del giorno, i dati del turno e il weekId
  async saveDayAssignment(dayId: string, data: any, weekId: string) {
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    return setDoc(docRef, data);
  }

  // Nuovo metodo per cancellare un turno assegnato
  async deleteDayAssignment(dayId: string, weekId: string) {
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    return deleteDoc(docRef);
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
    return addDoc(categoriesRef, cat);
  }

  async deleteCategory(id: string) {
    const docRef = doc(this.firestore, 'appointment_categories', id);
    return deleteDoc(docRef);
  }

}