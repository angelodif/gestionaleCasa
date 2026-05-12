import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';

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
  private notificationService = inject(NotificationService);

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
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
      await setDoc(docRef, plan);
    }, 'Errore durante il salvataggio del piano pasti');
  }

  async addToShoppingList(item: string) {
    const newItem = {
      id: crypto.randomUUID(),
      text: item, 
      completed: false, 
      createdAt: Date.now() 
    };
    return this.notificationService.runWithRetry(async () => {
      const listRef = doc(this.firestore, 'shopping/current');
      await setDoc(listRef, { items: arrayUnion(newItem) }, { merge: true });
    }, 'Errore durante l\'aggiunta alla lista della spesa');
  }
}