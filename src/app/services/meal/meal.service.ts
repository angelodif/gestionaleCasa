import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, getDoc, setDoc, updateDoc, arrayUnion } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { from, Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DietMeal {
  carb?: string;
  carbGrams?: number | null;
  protein?: string;
  proteinGrams?: number | null;
  fiber?: string;
}

export interface Meal {
  main: string;
  details: string;
  isOut: boolean;
  diet?: DietMeal;
}

export interface SnacksPlan {
  morning: string[];
  afternoon: string[];
}

export interface DayPlan {
  lunch: { angelo: Meal, daiana: Meal };
  dinner: { angelo: Meal, daiana: Meal };
  snacks?: {
    angelo: SnacksPlan;
    daiana: SnacksPlan;
  };
}

export function createEmptyDayPlan(): DayPlan {
  return {
    lunch: {
      angelo: { main: '', details: '', isOut: false, diet: { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' } },
      daiana: { main: '', details: '', isOut: false, diet: { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' } }
    },
    dinner: {
      angelo: { main: '', details: '', isOut: false, diet: { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' } },
      daiana: { main: '', details: '', isOut: false, diet: { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' } }
    },
    snacks: {
      angelo: { morning: [], afternoon: [] },
      daiana: { morning: [], afternoon: [] }
    }
  };
}

@Injectable({ providedIn: 'root' })
export class MealService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  /**
   * Restituisce lo stream reattivo del piano pasti di un giorno (gestito via cache e Firebase real-time).
   */
  getDayPlanStream(weekId: string, day: string): Observable<DayPlan> {
    const cacheKey = `meal_${weekId}_${day}`;
    const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
    const source$ = docData(docRef).pipe(
      map(snapData => {
        const normalizeMeal = (m: any): Meal => ({
          main:    m?.main    ?? '',
          details: m?.details ?? '',
          isOut:   m?.isOut   ?? false,
          diet:    m?.diet ? {
            carb: m.diet.carb ?? '',
            carbGrams: m.diet.carbGrams ?? null,
            protein: m.diet.protein ?? '',
            proteinGrams: m.diet.proteinGrams ?? null,
            fiber: m.diet.fiber ?? ''
          } : { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' }
        });
        const normalizeSnacks = (s: any): SnacksPlan => ({
          morning: Array.isArray(s?.morning) ? s.morning : [],
          afternoon: Array.isArray(s?.afternoon) ? s.afternoon : []
        });

        if (!snapData) return createEmptyDayPlan();
        return {
          lunch: {
            angelo: normalizeMeal(snapData['lunch']?.['angelo']),
            daiana: normalizeMeal(snapData['lunch']?.['daiana'])
          },
          dinner: {
            angelo: normalizeMeal(snapData['dinner']?.['angelo']),
            daiana: normalizeMeal(snapData['dinner']?.['daiana'])
          },
          snacks: {
            angelo: normalizeSnacks(snapData['snacks']?.['angelo']),
            daiana: normalizeSnacks(snapData['snacks']?.['daiana'])
          }
        };
      })
    );
    return this.cacheService.getCachedCollection<DayPlan>(cacheKey, source$);
  }

  /**
   * Restituisce il piano pasti di un giorno dalla cache locale se valida,
   * altrimenti dallo stream Firebase.
   */
  async getDayPlan(weekId: string, day: string): Promise<DayPlan> {
    const cacheKey = `meal_${weekId}_${day}`;

    if (this.cacheService.isCacheValid(cacheKey)) {
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      if (cached !== null) return cached;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      if (cached !== null) return cached;
    }

    try {
      const result = await firstValueFrom(this.getDayPlanStream(weekId, day));
      return result || createEmptyDayPlan();
    } catch (err) {
      console.warn(`[MealService] Errore nel recupero del piano pasti per "${cacheKey}". Fallback su cache locale.`, err);
      const cached = this.cacheService.getFromCache<DayPlan>(cacheKey);
      return cached !== null ? cached : createEmptyDayPlan();
    }
  }

  async saveDayPlan(weekId: string, day: string, plan: DayPlan) {
    const cacheKey = `meal_${weekId}_${day}`;
    // Aggiornamento ottimistico locale immediato
    this.cacheService.updateCacheEntry(cacheKey, plan);

    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `weeks/${weekId}/days/${day}`);
      await setDoc(docRef, plan);
      this.cacheService.clearCacheEntry(cacheKey);
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