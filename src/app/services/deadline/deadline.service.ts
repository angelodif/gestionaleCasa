import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, addDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { NotificationService } from '../notification/notification.service';

export interface Deadline {
  id?: string;
  title: string;
  category: 'Auto' | 'Casa' | 'Persona' | 'Salute' | 'Altro';
  type: string;
  dueDate: number; // Timestamp ms
  description?: string;
  cost?: number;
  isPaid: boolean;
  recurring?: 'none' | 'monthly' | 'bimonthly' | 'quarterly' | 'six-monthly' | 'yearly' | 'two-years' | 'five-years' | 'ten-years';
}

export const DEADLINE_CATEGORIES = ['Auto', 'Casa', 'Persona', 'Salute', 'Altro'];

@Injectable({
  providedIn: 'root'
})
export class DeadlineService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private readonly collectionName = 'deadlines';

  getDeadlines(): Observable<Deadline[]> {
    const colRef = collection(this.firestore, this.collectionName);
    const q = query(colRef, orderBy('dueDate', 'asc'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => data.map(d => ({
        ...d,
        dueDate: d['dueDate'] instanceof Timestamp ? d['dueDate'].toMillis() : d['dueDate']
      } as Deadline)))
    );
  }

  async addDeadline(deadline: Deadline) {
    const colRef = collection(this.firestore, this.collectionName);
    const newDocRef = doc(colRef);

    return this.notificationService.runWithRetry(async () => {
      const data = {
        ...deadline,
        dueDate: Timestamp.fromMillis(deadline.dueDate)
      };
      return await setDoc(newDocRef, data);
    }, 'Errore durante l\'aggiunta della scadenza');
  }

  async updateDeadline(deadline: Deadline) {
    if (!deadline.id) return;
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${deadline.id}`);
      const data = {
        ...deadline,
        dueDate: Timestamp.fromMillis(deadline.dueDate)
      };
      return await setDoc(docRef, data, { merge: true });
    }, 'Errore durante l\'aggiornamento della scadenza');
  }

  async deleteDeadline(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      return await deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della scadenza');
  }

  async markAsPaid(id: string, isPaid: boolean) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      return await setDoc(docRef, { isPaid }, { merge: true });
    }, 'Errore durante l\'aggiornamento dello stato di pagamento');
  }

  async removeRecurring(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      return await setDoc(docRef, { recurring: 'none' }, { merge: true });
    }, 'Errore durante la rimozione della ricorrenza');
  }
}
