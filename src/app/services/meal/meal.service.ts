import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from '@angular/fire/firestore';

export interface Meal {
  main: string;
  details: string;
  isOut?: boolean;
}

export interface DayPlan {
  lunch: { angelo: Meal, daiana: Meal };
  dinner: { angelo: Meal, daiana: Meal };
}

@Injectable({ providedIn: 'root' })
export class MealService {
  private firestore = inject(Firestore);

  async getDayPlan(weekId: string, day: string): Promise<DayPlan> {
    const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as DayPlan;
    return {
      lunch: { angelo: { main: '', details: '' }, daiana: { main: '', details: '' } },
      dinner: { angelo: { main: '', details: '' }, daiana: { main: '', details: '' } }
    };
  }

  async saveDayPlan(weekId: string, day: string, plan: DayPlan) {
    const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
    await setDoc(docRef, plan);
  }

  async addToShoppingList(item: string) {
    const listRef = doc(this.firestore, 'shopping/current');
    const newItem = {
      id: crypto.randomUUID(), // Generiamo un id univoco per facilitare gli aggiornamenti/cancellazioni di un preciso elemento
      text: item, 
      completed: false, 
      createdAt: Date.now() 
    };
    await setDoc(listRef, { items: arrayUnion(newItem) }, { merge: true });
  }
}