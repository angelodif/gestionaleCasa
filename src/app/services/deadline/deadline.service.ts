import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, addDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface Deadline {
  id?: string;
  title: string;
  category: 'Auto' | 'Casa' | 'Persona' | 'Salute' | 'Altro';
  type: string;
  dueDate: number; // Timestamp ms
  description?: string;
  cost?: number;
  isPaid: boolean;
  recurring?: 'none' | 'yearly' | 'monthly' | 'two-years' | 'six-monthly' | 'five-years' | 'ten-years';
}

export const DEADLINE_CATEGORIES = ['Auto', 'Casa', 'Persona', 'Salute', 'Altro'];

@Injectable({
  providedIn: 'root'
})
export class DeadlineService {
  private firestore = inject(Firestore);
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
    const data = {
      ...deadline,
      dueDate: Timestamp.fromMillis(deadline.dueDate)
    };
    return await addDoc(colRef, data);
  }

  async updateDeadline(deadline: Deadline) {
    if (!deadline.id) return;
    const docRef = doc(this.firestore, `${this.collectionName}/${deadline.id}`);
    const data = {
      ...deadline,
      dueDate: Timestamp.fromMillis(deadline.dueDate)
    };
    return await setDoc(docRef, data, { merge: true });
  }

  async deleteDeadline(id: string) {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    return await deleteDoc(docRef);
  }

  async markAsPaid(id: string, isPaid: boolean) {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    return await setDoc(docRef, { isPaid }, { merge: true });
  }
}
