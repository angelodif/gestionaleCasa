import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface WasteType {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export interface WasteSchedule {
  dayOfWeek: number; // 0 (Sun) to 6 (Sat)
  wasteTypeId: string;
}

export interface WasteException {
  date: string; // yyyy-mm-dd
  wasteTypeId: string | null; // null means no collection
}

@Injectable({
  providedIn: 'root'
})
export class WasteService {
  private wasteTypes: WasteType[] = [
    { id: 'organic', name: 'Organico', color: '#8d6e63', icon: 'eco', description: 'Scarti alimentari e biodegradabili' },
    { id: 'paper', name: 'Carta e Cartone', color: '#2196f3', icon: 'description', description: 'Carta, cartone, tetrapak' },
    { id: 'plastic', name: 'Plastica e Metalli', color: '#ffeb3b', icon: 'recycling', description: 'Bottiglie in plastica, lattine, vaschette' },
    { id: 'glass', name: 'Vetro', color: '#4caf50', icon: 'wine_bar', description: 'Bottiglie e vasetti di vetro' },
    { id: 'undifferentiated', name: 'Indifferenziato', color: '#9e9e9e', icon: 'delete', description: 'Rifiuti non riciclabili' },
  ];

  // Scadenza del calendario attuale (30 Settembre 2026)
  private readonly CALENDAR_EXPIRATION = new Date('2026-09-30T23:59:59');

  // Calendario Francavilla al Mare (COSVEGA) - Fino al 30/09
  private schedule = new BehaviorSubject<WasteSchedule[]>([
    { dayOfWeek: 1, wasteTypeId: 'organic' },        // Lunedì: Organico
    { dayOfWeek: 2, wasteTypeId: 'paper' },          // Martedì: Carta
    { dayOfWeek: 3, wasteTypeId: 'organic' },        // Mercoledì: Organico
    { dayOfWeek: 4, wasteTypeId: 'plastic' },        // Giovedì: Plastica e Metalli (e Vetro a settimane alterne)
    { dayOfWeek: 5, wasteTypeId: 'organic' },        // Venerdì: Organico
    { dayOfWeek: 6, wasteTypeId: 'undifferentiated' } // Sabato: Indifferenziato
  ]);

  private customSchedule = new BehaviorSubject<WasteSchedule[]>([]);
  private exceptions = new BehaviorSubject<WasteException[]>([]);

  constructor() {
    this.loadPersistedConfig();
  }

  private loadPersistedConfig() {
    const saved = localStorage.getItem('waste_config');
    if (saved) {
      const config = JSON.parse(saved);
      if (config.customSchedule) this.customSchedule.next(config.customSchedule);
      if (config.exceptions) this.exceptions.next(config.exceptions);
    }
  }

  saveConfig(customSchedule: WasteSchedule[], exceptions: WasteException[]) {
    this.customSchedule.next(customSchedule);
    this.exceptions.next(exceptions);
    localStorage.setItem('waste_config', JSON.stringify({ customSchedule, exceptions }));
  }

  getExceptions(): Observable<WasteException[]> {
    return this.exceptions.asObservable();
  }

  getWasteTypes(): WasteType[] {
    return this.wasteTypes;
  }

  getSchedule(): Observable<WasteSchedule[]> {
    return this.schedule.asObservable();
  }

  isCurrentScheduleExpired(): boolean {
    return new Date() > this.CALENDAR_EXPIRATION;
  }

  getTodayWaste(): WasteType | null {
    if (this.isCurrentScheduleExpired()) return null;
    
    const today = new Date();
    const dateStr = this.formatDate(today);
    
    // 1. Controlla eccezioni manuali
    const exception = this.exceptions.value.find(e => e.date === dateStr);
    if (exception) {
      return exception.wasteTypeId ? this.wasteTypes.find(t => t.id === exception.wasteTypeId) || null : null;
    }

    // 2. Se scaduto e non c'è eccezione, ritorna null (ma controlla prima il customSchedule)
    if (this.isCurrentScheduleExpired()) {
      const dayOfWeek = today.getDay();
      const item = this.customSchedule.value.find(s => s.dayOfWeek === dayOfWeek);
      return item ? this.wasteTypes.find(t => t.id === item.wasteTypeId) || null : null;
    }
    
    // 3. Logica standard Francavilla
    if (this.isHoliday(today)) return null;

    const dayOfWeek = today.getDay();
    const item = this.schedule.value.find(s => s.dayOfWeek === dayOfWeek);
    return item ? this.wasteTypes.find(t => t.id === item.wasteTypeId) || null : null;
  }

  getTomorrowWaste(): WasteType | null {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = this.formatDate(tomorrow);

    // 1. Controlla eccezioni manuali
    const exception = this.exceptions.value.find(e => e.date === dateStr);
    if (exception) {
      return exception.wasteTypeId ? this.wasteTypes.find(t => t.id === exception.wasteTypeId) || null : null;
    }

    // 2. Se scaduto
    if (this.isCurrentScheduleExpired()) {
      const dayOfWeek = tomorrow.getDay();
      const item = this.customSchedule.value.find(s => s.dayOfWeek === dayOfWeek);
      return item ? this.wasteTypes.find(t => t.id === item.wasteTypeId) || null : null;
    }

    if (this.isHoliday(tomorrow)) return null;

    const dayOfWeek = tomorrow.getDay();
    const item = this.schedule.value.find(s => s.dayOfWeek === dayOfWeek);
    return item ? this.wasteTypes.find(t => t.id === item.wasteTypeId) || null : null;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isHoliday(date: Date): boolean {
    const day = date.getDate();
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    // Festività fisse
    const fixedHolidays = [
      '1-1',   // Capodanno
      '6-1',   // Epifania
      '25-4',  // Liberazione
      '1-5',   // Lavoro
      '2-6',   // Repubblica
      '15-8',  // Ferragosto (gestito sotto come eccezione)
      '1-11',  // Ognissanti
      '8-12',  // Immacolata
      '25-12', // Natale
      '26-12'  // S. Stefano
    ];

    // Festività in cui il ritiro è COMUNQUE garantito (eccezioni)
    const workingHolidays = [
      '15-8' // Ferragosto a Francavilla
    ];

    const dateKey = `${day}-${month}`;
    if (workingHolidays.includes(dateKey)) return false;
    if (fixedHolidays.includes(dateKey)) return true;

    // Pasqua e Pasquetta (Algoritmo di Butcher-Meeus)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const monthEaster = Math.floor((h + l - 7 * m + 114) / 31);
    const dayEaster = ((h + l - 7 * m + 114) % 31) + 1;

    const easter = new Date(year, monthEaster - 1, dayEaster);
    const easterMonday = new Date(year, monthEaster - 1, dayEaster + 1);

    if (this.isSameDay(date, easter) || this.isSameDay(date, easterMonday)) return true;

    return false;
  }

  private isSameDay(d1: Date, d2: Date): boolean {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  }
}
