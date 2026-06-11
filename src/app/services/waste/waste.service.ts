import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { NotificationService } from '../notification/notification.service';

export interface WasteType {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export interface WasteSchedule {
  dayOfWeek: number; // 0 (Sun) to 6 (Sat)
  wasteTypeId?: string;
  wasteTypeIds?: string[];
}

export interface WasteException {
  date: string; // yyyy-mm-dd
  wasteTypeId?: string | null; // null means no collection
  wasteTypeIds?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class WasteService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private platformId = inject(PLATFORM_ID);

  private wasteTypes: WasteType[] = [
    { id: 'organic', name: 'Organico', color: '#8d6e63', icon: 'eco', description: 'Scarti alimentari e biodegradabili' },
    { id: 'paper', name: 'Carta e Cartone', color: '#2196f3', icon: 'description', description: 'Carta, cartone, tetrapak' },
    { id: 'plastic', name: 'Plastica e Metalli', color: '#ffeb3b', icon: 'recycling', description: 'Bottiglie in plastica, lattine, vaschette' },
    { id: 'glass', name: 'Vetro', color: '#4caf50', icon: 'wine_bar', description: 'Bottiglie e vasetti di vetro' },
    { id: 'undifferentiated', name: 'Indifferenziato', color: '#9e9e9e', icon: 'delete', description: 'Rifiuti non riciclabili' },
  ];

  // Piano settimanale e eccezioni caricate da Firebase
  private schedule = new BehaviorSubject<WasteSchedule[]>([]);
  private exceptions = new BehaviorSubject<WasteException[]>([]);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadPersistedConfig();
      this.initFirebaseSync();
    }
  }

  private normalizeSchedule(s: any[]): WasteSchedule[] {
    return s.map(item => {
      let wasteTypeIds = item.wasteTypeIds;
      if (!wasteTypeIds) {
        wasteTypeIds = item.wasteTypeId && item.wasteTypeId !== 'none' ? [item.wasteTypeId] : [];
      }
      return {
        dayOfWeek: item.dayOfWeek,
        wasteTypeId: wasteTypeIds[0] || 'none',
        wasteTypeIds: wasteTypeIds
      };
    });
  }

  private normalizeExceptions(e: any[]): WasteException[] {
    return e.map(item => {
      let wasteTypeIds = item.wasteTypeIds;
      if (!wasteTypeIds) {
        wasteTypeIds = item.wasteTypeId && item.wasteTypeId !== 'none' ? [item.wasteTypeId] : [];
      }
      return {
        date: item.date,
        wasteTypeId: wasteTypeIds[0] || null,
        wasteTypeIds: wasteTypeIds
      };
    });
  }

  private loadPersistedConfig() {
    // Fallback immediato su localStorage
    const saved = localStorage.getItem('waste_config');
    if (saved) {
      const config = JSON.parse(saved);
      // Supporto per la vecchia chiave 'customSchedule' e la nuova 'schedule'
      const rawSchedule = config.schedule || config.customSchedule;
      if (rawSchedule) this.schedule.next(this.normalizeSchedule(rawSchedule));
      if (config.exceptions) this.exceptions.next(this.normalizeExceptions(config.exceptions));
    }
  }

  private initFirebaseSync() {
    const docRef = doc(this.firestore, 'waste/config');
    docData(docRef).subscribe(data => {
      if (data) {
        if (data['schedule']) this.schedule.next(this.normalizeSchedule(data['schedule']));
        if (data['exceptions']) this.exceptions.next(this.normalizeExceptions(data['exceptions']));
        localStorage.setItem('waste_config', JSON.stringify(data));
      }
    });
  }

  async saveConfig(schedule: WasteSchedule[], exceptions: WasteException[]) {
    const prevSchedule = this.schedule.value;
    const prevExceptions = this.exceptions.value;
    const prevLocal = localStorage.getItem('waste_config');

    // Aggiornamento ottimistico locale
    this.schedule.next(schedule);
    this.exceptions.next(exceptions);
    localStorage.setItem('waste_config', JSON.stringify({ schedule, exceptions }));

    try {
      return await this.notificationService.runWithRetry(async () => {
        const docRef = doc(this.firestore, 'waste/config');
        await setDoc(docRef, { schedule, exceptions }, { merge: true });
      }, 'Errore durante il salvataggio della configurazione rifiuti');
    } catch (error: any) {
      // ROLLBACK: se fallisce definitivamente, ripristina lo stato precedente
      console.warn('[WasteService] Rollback dello stato locale per fallimento salvataggio');
      this.schedule.next(prevSchedule);
      this.exceptions.next(prevExceptions);
      if (prevLocal) {
        localStorage.setItem('waste_config', prevLocal);
      } else {
        localStorage.removeItem('waste_config');
      }
      throw error;
    }
  }

  getWasteTypes(): WasteType[] {
    return this.wasteTypes;
  }

  getSchedule(): Observable<WasteSchedule[]> {
    return this.schedule.asObservable();
  }

  getExceptions(): Observable<WasteException[]> {
    return this.exceptions.asObservable();
  }

  getTodayWaste(): WasteType[] {
    const today = new Date();
    return this.getWastesForDate(today);
  }

  getTomorrowWaste(): WasteType[] {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.getWastesForDate(tomorrow);
  }

  getWastesForDate(date: Date): WasteType[] {
    const dateStr = this.formatDate(date);

    // 1. Priorità assoluta alle eccezioni (manuali o festività gestite dall'utente)
    const exception = this.exceptions.value.find(e => e.date === dateStr);
    if (exception) {
      const ids = exception.wasteTypeIds || (exception.wasteTypeId && exception.wasteTypeId !== 'none' ? [exception.wasteTypeId] : []);
      return ids.map(id => this.wasteTypes.find(t => t.id === id)).filter((t): t is WasteType => !!t);
    }

    // 2. Piano settimanale standard
    const dayOfWeek = date.getDay();
    const item = this.schedule.value.find(s => s.dayOfWeek === dayOfWeek);
    if (item) {
      const ids = item.wasteTypeIds || (item.wasteTypeId && item.wasteTypeId !== 'none' ? [item.wasteTypeId] : []);
      return ids.map(id => this.wasteTypes.find(t => t.id === id)).filter((t): t is WasteType => !!t);
    }

    return [];
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
