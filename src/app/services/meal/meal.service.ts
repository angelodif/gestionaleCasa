import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Meal {
  main: string;
  details: string;
  isOut: boolean;
}

export interface DayPlan {
  lunch: { angelo: Meal, daiana: Meal };
  dinner: { angelo: Meal, daiana: Meal };
}

export function createEmptyDayPlan(): DayPlan {
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

@Injectable({ providedIn: 'root' })
export class MealService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  /**
   * Restituisce il piano pasti di un giorno dalla cache locale se valida,
   * altrimenti da Firestore. Chiave univoca per giorno e settimana.
   *
   * @param weekId Identificatore della settimana (es. `'2024-W11'`)
   * @param day    Nome del giorno (es. `'Lunedì'`)
   */
  async getDayPlan(weekId: string, day: string): Promise<DayPlan> {
    const cacheKey = `meal_${weekId}_${day}`;

    // Tenta la cache prima
    if (this.cacheService.isCacheValid(cacheKey)) {
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      if (cached !== null) {
        console.log(`[MealService] 📦 Cache HIT per: "${cacheKey}"`);
        return cached;
      }
    }

    // Se siamo offline, restituiamo comunque il cached (anche se isCacheValid è falso/scaduto)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      if (cached !== null) {
        console.log(`[MealService] 📴 Offline: Fallback immediato su cache locale per: "${cacheKey}"`);
        return cached;
      }
    }

    try {
      const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 3000)
      );

      const snap = await Promise.race([
        getDoc(docRef),
        timeoutPromise
      ]) as any;

      const normalizeMeal = (m: any): Meal => ({
        main:    m?.main    ?? '',
        details: m?.details ?? '',
        isOut:   m?.isOut   ?? false
      });

      const plan: DayPlan = snap.exists()
        ? {
            lunch: {
              angelo: normalizeMeal(snap.data()?.['lunch']?.['angelo']),
              daiana: normalizeMeal(snap.data()?.['lunch']?.['daiana'])
            },
            dinner: {
              angelo: normalizeMeal(snap.data()?.['dinner']?.['angelo']),
              daiana: normalizeMeal(snap.data()?.['dinner']?.['daiana'])
            }
          }
        : createEmptyDayPlan();

      // Salva in cache e allinea timestamp
      this.cacheService.saveToCache(cacheKey, plan);
      this.cacheService.updateLocalTimestamp(cacheKey);

      return plan;
    } catch (err) {
      console.warn(`[MealService] Errore o timeout nel recupero del piano pasti per "${cacheKey}". Fallback su cache locale.`, err);
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      return cached !== null ? cached : createEmptyDayPlan();
    }
  }

  async saveDayPlan(weekId: string, day: string, plan: DayPlan) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
      await setDoc(docRef, plan);
      // Invalida solo il giorno modificato
      this.cacheService.clearCacheEntry(`meal_${weekId}_${day}`);
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
      // Invalida la cache della shopping list
      this.cacheService.clearCacheEntry('shopping_current');
    }, 'Errore durante l\'aggiunta alla lista della spesa');
  }
}