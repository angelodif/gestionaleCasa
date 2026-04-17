import { inject, Injectable } from '@angular/core';
import { Firestore, doc, docData, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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

  getConfig(): Observable<ShoppingConfig> {
    const docRef = doc(this.firestore, 'shopping/config');
    return docData(docRef).pipe(
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
  }

  async updateConfig(config: ShoppingConfig) {
    const docRef = doc(this.firestore, 'shopping/config');
    await setDoc(docRef, config, { merge: true });
  }

  async addItemToShoppingListAndConfig(text: string, shop: string) {
    if (!text?.trim()) return;
    
    // Testo normalizzato
    const normalizedText = text.trim();
    const textLower = normalizedText.toLowerCase();

    // 1. Leggi o inizializza configurazione per i negozi e prodotti
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
    // Se il negozio non esiste, aggiungilo
    const normalizedShop = shop?.trim() || 'Lista generica';

    await this.ensureConfigExists(normalizedText, normalizedShop);

    // 2. Leggi la lista della spesa corrente
    const listRef = doc(this.firestore, 'shopping/current');
    let listSnap = await getDoc(listRef);
    let currentItems: ShoppingItem[] = [];
    if (listSnap.exists() && listSnap.data()['items']) {
      currentItems = listSnap.data()['items'] as ShoppingItem[];
    }

    // 3. Deduplicazione nella lista
    const existingItemIndex = currentItems.findIndex(i => i.text.toLowerCase() === textLower);
    if (existingItemIndex !== -1) {
      // Sovrascriviamo se presente, spostandolo nel nuovo negozio se era in generico
      const existingItem = currentItems[existingItemIndex];
      existingItem.completed = false; // lo rimettiamo da comprare se non lo era
      const currentShop = existingItem.shop || 'Lista generica';
      if (currentShop === 'Lista generica' && normalizedShop !== 'Lista generica') {
        existingItem.shop = normalizedShop;
      }
      // Lo portiamo in cima
      currentItems.splice(existingItemIndex, 1);
      currentItems.unshift(existingItem);
    } else {
      // Nuovo
      const newItem: ShoppingItem = {
        id: crypto.randomUUID(),
        text: normalizedText,
        completed: false,
        createdAt: Date.now(),
        shop: normalizedShop
      };
      currentItems.unshift(newItem);
    }

    // 4. Salva la lista aggiornata
    await setDoc(listRef, { items: currentItems }, { merge: true });
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
      await setDoc(configDocRef, config, { merge: true });
    }
  }

  async removeShopFromConfig(shopToRemove: string) {
    const configDocRef = doc(this.firestore, 'shopping/config');
    let configSnap = await getDoc(configDocRef);
    if (configSnap.exists()) {
      let config = configSnap.data() as ShoppingConfig;
      if (config.shops) {
        config.shops = config.shops.filter(s => s !== shopToRemove);
        await setDoc(configDocRef, config, { merge: true });
      }
    }
  }
}
