import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, addDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';

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

const CACHE_KEY = 'deadlines';

@Injectable({
  providedIn: 'root'
})
export class DeadlineService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);
  private readonly collectionName = 'deadlines';

  /**
   * Restituisce le scadenze dalla cache locale se valida,
   * altrimenti le scarica da Firestore e le cachea.
   */
  getDeadlines(): Observable<Deadline[]> {
    const colRef = collection(this.firestore, this.collectionName);
    const q = query(colRef, orderBy('dueDate', 'asc'));
    const source$ = collectionData(q, { idField: 'id' }).pipe(
      map(data => data.map(d => ({
        ...d,
        dueDate: d['dueDate'] instanceof Timestamp ? d['dueDate'].toMillis() : d['dueDate']
      } as Deadline)))
    );
    return this.cacheService.getCachedCollection<Deadline[]>(CACHE_KEY, source$);
  }

  async addDeadline(deadline: Deadline) {
    const colRef = collection(this.firestore, this.collectionName);
    const newDocRef = doc(colRef);

    return this.notificationService.runWithRetry(async () => {
      const data = {
        ...deadline,
        dueDate: Timestamp.fromMillis(deadline.dueDate)
      };
      const result = await setDoc(newDocRef, data);
      // Invalida la cache: al prossimo caricamento i dati verranno riscaricati da Firebase
      this.cacheService.clearCacheEntry(CACHE_KEY);
      return result;
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
      const result = await setDoc(docRef, data, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY);
      return result;
    }, 'Errore durante l\'aggiornamento della scadenza');
  }

  async deleteDeadline(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      const result = await deleteDoc(docRef);
      this.cacheService.clearCacheEntry(CACHE_KEY);
      return result;
    }, 'Errore durante l\'eliminazione della scadenza');
  }

  async markAsPaid(id: string, isPaid: boolean) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      const result = await setDoc(docRef, { isPaid }, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY);
      return result;
    }, 'Errore durante l\'aggiornamento dello stato di pagamento');
  }

  async removeRecurring(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
      const result = await setDoc(docRef, { recurring: 'none' }, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY);
      return result;
    }, 'Errore durante la rimozione della ricorrenza');
  }
}
