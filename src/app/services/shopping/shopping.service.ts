import { inject, Injectable } from '@angular/core';
import { Firestore, doc, docData, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';

export interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  shop?: string;
}

export interface ShoppingConfig {
  shops: string[];
  commonProducts: string[];
}

const CACHE_KEY_LIST   = 'shopping_current';
const CACHE_KEY_CONFIG = 'shopping_config';

@Injectable({
  providedIn: 'root'
})
export class ShoppingListService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  /**
   * Scarica la lista della spesa dalla cache locale se valida,
   * altrimenti da Firestore.
   */
  getShoppingList(): Observable<ShoppingItem[]> {
    const listRef = doc(this.firestore, 'shopping/current');
    const source$ = docData(listRef).pipe(
      map(data => {
        if (data && data['items']) return data['items'] as ShoppingItem[];
        return [];
      })
    );
    return this.cacheService.getCachedCollection<ShoppingItem[]>(CACHE_KEY_LIST, source$);
  }

  /**
   * Sincronizza l'intera lista aggiornata su Firestore.
   */
  async updateList(items: ShoppingItem[]) {
    return this.notificationService.runWithRetry(async () => {
      const listRef = doc(this.firestore, 'shopping/current');
      await setDoc(listRef, { items }, { merge: true });
      // La lista è cambiata: invalida la cache
      this.cacheService.clearCacheEntry(CACHE_KEY_LIST);
    }, 'Errore durante l\'aggiornamento della lista della spesa');
  }

  /**
   * Scarica la configurazione (negozi, prodotti comuni) dalla cache locale se valida.
   */
  getConfig(): Observable<ShoppingConfig> {
    const docRef = doc(this.firestore, 'shopping/config');
    const source$ = docData(docRef).pipe(
      map(data => {
        if (data) {
          return {
            shops: data['shops'] || ['Lista generica'],
            commonProducts: data['commonProducts'] || []
          } as ShoppingConfig;
        }
        return { shops: ['Lista generica'], commonProducts: [] };
      })
    );
    return this.cacheService.getCachedCollection<ShoppingConfig>(CACHE_KEY_CONFIG, source$);
  }

  async updateConfig(config: ShoppingConfig) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'shopping/config');
      await setDoc(docRef, config, { merge: true });
      this.cacheService.clearCacheEntry(CACHE_KEY_CONFIG);
    }, 'Errore durante l\'aggiornamento delle impostazioni spesa');
  }

  async addItemToShoppingListAndConfig(text: string, shop: string) {
    if (!text?.trim()) return;

    const normalizedText = text.trim();
    const textLower = normalizedText.toLowerCase();

    // Leggi o inizializza configurazione
    const configDocRef = doc(this.firestore, 'shopping/config');
    let configSnap = await getDoc(configDocRef);
    let config: ShoppingConfig;
    if (configSnap.exists()) {
      config = configSnap.data() as ShoppingConfig;
      if (!config.shops) config.shops = ['Lista generica'];
      if (!config.commonProducts) config.commonProducts = [];
    } else {
      config = { shops: ['Lista generica'], commonProducts: [] };
    }

    const normalizedShop = shop?.trim() || 'Lista generica';
    await this.ensureConfigExists(normalizedText, normalizedShop);

    // Leggi la lista della spesa corrente
    const listRef = doc(this.firestore, 'shopping/current');
    let listSnap = await getDoc(listRef);
    let currentItems: ShoppingItem[] = [];
    if (listSnap.exists() && listSnap.data()['items']) {
      currentItems = listSnap.data()['items'] as ShoppingItem[];
    }

    // Deduplicazione
    const existingItemIndex = currentItems.findIndex(i => i.text.toLowerCase() === textLower);
    if (existingItemIndex !== -1) {
      const existingItem = currentItems[existingItemIndex];
      existingItem.completed = false;
      const currentShop = existingItem.shop || 'Lista generica';
      if (currentShop === 'Lista generica' && normalizedShop !== 'Lista generica') {
        existingItem.shop = normalizedShop;
      }
      currentItems.splice(existingItemIndex, 1);
      currentItems.unshift(existingItem);
    } else {
      const newItem: ShoppingItem = {
        id: crypto.randomUUID(),
        text: normalizedText,
        completed: false,
        createdAt: Date.now(),
        shop: normalizedShop
      };
      currentItems.unshift(newItem);
    }

    return this.notificationService.runWithRetry(async () => {
      await setDoc(listRef, { items: currentItems }, { merge: true });
      // Invalida cache lista e config (aggiornate entrambe)
      this.cacheService.clearCacheEntry(CACHE_KEY_LIST);
      this.cacheService.clearCacheEntry(CACHE_KEY_CONFIG);
    }, 'Errore durante l\'aggiunta dell\'articolo');
  }

  async ensureConfigExists(text: string, shop: string) {
    const textLower = text.toLowerCase();
    const shopLower = shop.toLowerCase();

    const configDocRef = doc(this.firestore, 'shopping/config');
    let configSnap = await getDoc(configDocRef);
    let config: ShoppingConfig;

    if (configSnap.exists()) {
      config = configSnap.data() as ShoppingConfig;
      if (!config.shops) config.shops = ['Lista generica'];
      if (!config.commonProducts) config.commonProducts = [];
    } else {
      config = { shops: ['Lista generica'], commonProducts: [] };
    }

    let configChanged = false;
    if (!config.shops.find(s => s.toLowerCase() === shopLower)) {
      config.shops.push(shop);
      configChanged = true;
    }
    if (!config.commonProducts.find(p => p.toLowerCase() === textLower)) {
      config.commonProducts.push(text);
      configChanged = true;
    }

    if (configChanged) {
      return this.notificationService.runWithRetry(async () => {
        await setDoc(configDocRef, config, { merge: true });
        this.cacheService.clearCacheEntry(CACHE_KEY_CONFIG);
      }, 'Errore durante l\'aggiornamento della configurazione spesa');
    }
  }

  async removeShopFromConfig(shopToRemove: string) {
    const configDocRef = doc(this.firestore, 'shopping/config');
    let configSnap = await getDoc(configDocRef);
    if (configSnap.exists()) {
      let config = configSnap.data() as ShoppingConfig;
      if (config.shops) {
        config.shops = config.shops.filter(s => s !== shopToRemove);
        return this.notificationService.runWithRetry(async () => {
          await setDoc(configDocRef, config, { merge: true });
          this.cacheService.clearCacheEntry(CACHE_KEY_CONFIG);
        }, 'Errore durante la rimozione del negozio');
      }
    }
  }
}
