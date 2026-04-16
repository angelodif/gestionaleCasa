import { inject, Injectable } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class ShoppingListService {
  private firestore = inject(Firestore);

  // Scarica in tempo reale The List
  getShoppingList(): Observable<ShoppingItem[]> {
    const listRef = doc(this.firestore, 'shopping/current');
    return docData(listRef).pipe(
      map(data => {
        if (data && data['items']) {
          return data['items'] as ShoppingItem[];
        }
        return [];
      })
    );
  }

  // Sincronizza l'intera lista aggiornata su Firestore
  async updateList(items: ShoppingItem[]) {
    const listRef = doc(this.firestore, 'shopping/current');
    // Usa setDoc con merge per creare il documento se non esistesse
    await setDoc(listRef, { items }, { merge: true });
  }
}
