import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from '@angular/fire/firestore';

export interface Meal {
  main: string;
  details: string;
  isOut: boolean;
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
    if (snap.exists()) {
      const data = snap.data() as any;
      const normalizeMeal = (m: any) => ({
        main: m?.main ?? '',
        details: m?.details ?? '',
        isOut: m?.isOut ?? false
      });
      return {
        lunch: {
          angelo: normalizeMeal(data.lunch?.angelo),
          daiana: normalizeMeal(data.lunch?.daiana)
        },
        dinner: {
          angelo: normalizeMeal(data.dinner?.angelo),
          daiana: normalizeMeal(data.dinner?.daiana)
        }
      };
    }
    return {
      lunch: { 
        angelo: { main: '', details: '', isOut: false }, 
        daiana: { main: '', details: '', isOut: false } 
      },
      dinner: { 
        angelo: { main: '', details: '', isOut: false }, 
        daiana: { main: '', details: '', isOut: false } 
      }
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