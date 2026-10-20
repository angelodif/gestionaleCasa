import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';

export interface DietFoodItem {
  id: string;
  name: string;
  category: 'carbs' | 'proteins' | 'fibers' | 'snacks';
  lunchGrams?: number | null;
  dinnerGrams?: number | null;
  isLegume?: boolean;
}

export interface DietConfig {
  foods: DietFoodItem[];
}

export interface UserDietSettings {
  dietEnabled: boolean;
}

const CACHE_KEY_DIET_FOODS = 'diet_foods_config';
const CACHE_KEY_DIET_SETTINGS = 'diet_user_settings';

export const INITIAL_DIET_FOODS: Omit<DietFoodItem, 'id'>[] = [
  // --- CARBOIDRATI ---
  { name: 'Patate', category: 'carbs', lunchGrams: 280, dinnerGrams: 230 },
  { name: 'Pasta', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Pasta integrale', category: 'carbs', lunchGrams: 100, dinnerGrams: 70 },
  { name: 'Pasta di farro', category: 'carbs', lunchGrams: 100, dinnerGrams: 70 },
  { name: 'Pasta di Kamut', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Orzo', category: 'carbs', lunchGrams: 95, dinnerGrams: 65 },
  { name: 'Riso Integrale, venere, rosso', category: 'carbs', lunchGrams: 95, dinnerGrams: 65 },
  { name: 'Cracker integrali', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Pane con farine antiche', category: 'carbs', lunchGrams: 105, dinnerGrams: 75 },
  { name: 'Pane nero', category: 'carbs', lunchGrams: 100, dinnerGrams: 70 },
  { name: 'Focaccia integrale', category: 'carbs', lunchGrams: 95, dinnerGrams: 65 },
  { name: 'Quinoa', category: 'carbs', lunchGrams: 95, dinnerGrams: 65 },
  { name: 'Cus-cus', category: 'carbs', lunchGrams: 95, dinnerGrams: 65 },
  { name: 'Farro', category: 'carbs', lunchGrams: 100, dinnerGrams: 70 },
  { name: 'Friselle integrali', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Riso Carnaroli, basmatu', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Bulghur', category: 'carbs', lunchGrams: 90, dinnerGrams: 60 },
  { name: 'Pane integrale, multi-cereale', category: 'carbs', lunchGrams: 110, dinnerGrams: 80 },
  { name: 'Pane semi-integrale', category: 'carbs', lunchGrams: 100, dinnerGrams: 70 },
  { name: 'Piadina integrale', category: 'carbs', lunchGrams: 130, dinnerGrams: 95 },

  // --- PROTEINE ---
  { name: 'Pesce azzurro', category: 'proteins', lunchGrams: 130, dinnerGrams: 200 },
  { name: 'Molluschi/Crostacei', category: 'proteins', lunchGrams: 120, dinnerGrams: 170 },
  { name: 'Pesce grasso', category: 'proteins', lunchGrams: 130, dinnerGrams: 190 },
  { name: 'Tonno', category: 'proteins', lunchGrams: 80, dinnerGrams: 160 },
  { name: 'Sgombro', category: 'proteins', lunchGrams: 70, dinnerGrams: 140 },
  { name: 'Salmone affumicato', category: 'proteins', lunchGrams: 60, dinnerGrams: 120 },
  { name: 'Afffettato', category: 'proteins', lunchGrams: 90, dinnerGrams: 120 },
  { name: 'Carne bianca', category: 'proteins', lunchGrams: 120, dinnerGrams: 170 },
  { name: 'Carne rossa', category: 'proteins', lunchGrams: 100, dinnerGrams: 150 },
  { name: 'Formaggio magro', category: 'proteins', lunchGrams: 90, dinnerGrams: 140 },
  { name: 'Parmigiano/Grana', category: 'proteins', lunchGrams: 30, dinnerGrams: 20 },
  { name: 'Emmental/Scamorza/Caciotta', category: 'proteins', lunchGrams: 40, dinnerGrams: 60 },
  { name: 'Legumi', category: 'proteins', lunchGrams: 110, dinnerGrams: 140, isLegume: true },
  { name: 'Legumi secchi', category: 'proteins', lunchGrams: 35, dinnerGrams: 45, isLegume: true },

  // --- FIBRE E VERDURE BASE ---
  { name: 'Insalata mista', category: 'fibers' },
  { name: 'Zucchine', category: 'fibers' },
  { name: 'Spinaci / Bietole', category: 'fibers' },
  { name: 'Finocchi', category: 'fibers' },
  { name: 'Broccoli / Cavolfiore', category: 'fibers' },
  { name: 'Pomodori', category: 'fibers' },

  // --- SPUNTINI BASE ---
  { name: 'Frutta fresca', category: 'snacks' },
  { name: 'Frutta secca (noci/mandorle)', category: 'snacks' },
  { name: 'Yogurt greco', category: 'snacks' },
  { name: 'Crackers integrali', category: 'snacks' },
  { name: 'Barretta proteica', category: 'snacks' }
];

@Injectable({
  providedIn: 'root'
})
export class DietService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  /**
   * Stream degli alimenti salvati su Firestore. Se vuoto, inizializza coi dati di Dieta.xlsx.
   */
  getFoodsStream(): Observable<DietFoodItem[]> {
    const docRef = doc(this.firestore, 'diet/foods');
    const source$ = docData(docRef).pipe(
      map(data => {
        if (data && Array.isArray(data['items'])) {
          return data['items'] as DietFoodItem[];
        }
        return [];
      })
    );
    return this.cacheService.getCachedCollection<DietFoodItem[]>(CACHE_KEY_DIET_FOODS, source$);
  }

  /**
   * Carica tutti gli alimenti con fallback e auto-seed iniziale se non esistono su Firebase.
   */
  async getFoods(): Promise<DietFoodItem[]> {
    const cached = this.cacheService.getFromCache<DietFoodItem[]>(CACHE_KEY_DIET_FOODS);
    if (cached && cached.length > 0) return cached;

    try {
      const docRef = doc(this.firestore, 'diet/foods');
      const snap = await getDoc(docRef);
      if (snap.exists() && Array.isArray(snap.data()?.['items']) && snap.data()?.['items'].length > 0) {
        const items = snap.data()!['items'] as DietFoodItem[];
        this.cacheService.updateCacheEntry(CACHE_KEY_DIET_FOODS, items);
        return items;
      }

      // Inizializza automaticamente su Firebase
      const initialWithIds: DietFoodItem[] = INITIAL_DIET_FOODS.map(f => ({
        ...f,
        id: crypto.randomUUID()
      }));
      await setDoc(docRef, { items: initialWithIds }, { merge: true });
      this.cacheService.updateCacheEntry(CACHE_KEY_DIET_FOODS, initialWithIds);
      return initialWithIds;
    } catch (err) {
      console.warn('[DietService] Errore lettura alimenti da Firebase:', err);
      return INITIAL_DIET_FOODS.map(f => ({ ...f, id: crypto.randomUUID() }));
    }
  }

  /**
   * Salva la lista completa degli alimenti su Firestore.
   */
  async saveFoods(items: DietFoodItem[]): Promise<void> {
    this.cacheService.updateCacheEntry(CACHE_KEY_DIET_FOODS, items);
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'diet/foods');
      await setDoc(docRef, { items }, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY_DIET_FOODS);
    }, 'Errore durante il salvataggio degli alimenti della dieta');
  }

  /**
   * Aggiunge un alimento se non esiste già (per nome case-insensitive).
   */
  async addFoodItem(item: Omit<DietFoodItem, 'id'>): Promise<DietFoodItem> {
    const foods = await this.getFoods();
    const existing = foods.find(f => f.name.trim().toLowerCase() === item.name.trim().toLowerCase() && f.category === item.category);
    if (existing) {
      return existing;
    }

    const newItem: DietFoodItem = {
      ...item,
      id: crypto.randomUUID(),
      name: item.name.trim()
    };
    const updated = [...foods, newItem];
    await this.saveFoods(updated);
    return newItem;
  }

  /**
   * Rimuove un alimento per ID.
   */
  async removeFoodItem(id: string): Promise<void> {
    const foods = await this.getFoods();
    const updated = foods.filter(f => f.id !== id);
    await this.saveFoods(updated);
  }

  /**
   * Stream o lettura dell'impostazione globale/utente modalità dieta.
   */
  getDietSettingsStream(): Observable<UserDietSettings> {
    const docRef = doc(this.firestore, 'diet/settings');
    const source$ = docData(docRef).pipe(
      map(data => ({
        dietEnabled: data?.['dietEnabled'] ?? false
      }))
    );
    return this.cacheService.getCachedCollection<UserDietSettings>(CACHE_KEY_DIET_SETTINGS, source$);
  }

  async getDietSettings(): Promise<UserDietSettings> {
    const cached = this.cacheService.getFromCache<UserDietSettings>(CACHE_KEY_DIET_SETTINGS);
    if (cached !== null) return cached;

    try {
      const docRef = doc(this.firestore, 'diet/settings');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const val = { dietEnabled: snap.data()?.['dietEnabled'] ?? false };
        this.cacheService.updateCacheEntry(CACHE_KEY_DIET_SETTINGS, val);
        return val;
      }
    } catch (e) {
      console.warn('[DietService] Errore lettura settings dieta:', e);
    }
    return { dietEnabled: false };
  }

  async setDietEnabled(enabled: boolean): Promise<void> {
    this.cacheService.updateCacheEntry(CACHE_KEY_DIET_SETTINGS, { dietEnabled: enabled });
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'diet/settings');
      await setDoc(docRef, { dietEnabled: enabled }, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY_DIET_SETTINGS);
    }, 'Errore salvataggio impostazioni dieta');
  }

  /**
   * Calcola i grammi effettivi di carboidrati applicando la riduzione di 20g se il legume è scelto.
   */
  calculateCarbGrams(baseGrams: number | null | undefined, hasLegumeProtein: boolean): number | null {
    if (baseGrams === null || baseGrams === undefined) return null;
    if (hasLegumeProtein) {
      return Math.max(0, baseGrams - 20);
    }
    return baseGrams;
  }
}
