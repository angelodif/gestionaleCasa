import { NativeDateAdapter } from '@angular/material/core';
import { Injectable } from '@angular/core';

/**
 * Custom DateAdapter che imposta Lunedì come primo giorno della settimana
 * e formatta le date in italiano per il datepicker Material.
 */
@Injectable()
export class ItalianDateAdapter extends NativeDateAdapter {
  /**
   * Restituisce 1 = Lunedì (0 = Domenica, default americano)
   */
  override getFirstDayOfWeek(): number {
    return 1;
  }

  /**
   * Nomi dei giorni abbreviati in italiano, partendo da Lunedì
   */
  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    if (style === 'narrow') {
      return ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
    }
    if (style === 'short') {
      return ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    }
    return ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  }

  /**
   * Nomi dei mesi in italiano
   */
  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    if (style === 'narrow') {
      return ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];
    }
    if (style === 'short') {
      return ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    }
    return [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];
  }
}
