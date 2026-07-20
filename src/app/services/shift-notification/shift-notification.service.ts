import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ShiftService } from '../shift/shift.service';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIF_CHANNEL_ID = 'orari_daiana_channel';
const NOTIF_BASE_ID = 1000; // ID base per evitare collisioni
const PREFS_KEY = 'shift_notifications_enabled';
const LAST_SCHEDULED_KEY = 'shift_notifications_last_scheduled';

/**
 * Servizio di notifiche push per i turni di Daiana.
 *
 * Strategia:
 *  - Ogni volta che `scheduleShiftNotifications()` viene chiamato (tipicamente
 *    all'apertura dell'app o a seguito del background fetch), vengono schedulate
 *    notifiche locali per i prossimi 7 giorni alle 19:30.
 *  - Ogni notifica mostra il turno del giorno SUCCESSIVO.
 *  - Se nessun turno è previsto, la notifica non viene generata per quel giorno.
 *  - Il flag `enabled` viene letto da localStorage per permettere all'utente
 *    di disattivare le notifiche dalla UI.
 */
@Injectable({ providedIn: 'root' })
export class ShiftNotificationService {
  private shiftService = inject(ShiftService);
  private platformId = inject(PLATFORM_ID);

  // ── Permessi e canale ────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') {
          console.warn('[ShiftNotification] Permesso notifiche negato.');
          return;
        }
      }

      // Crea il canale Android (ignorato su iOS)
      await LocalNotifications.createChannel({
        id: NOTIF_CHANNEL_ID,
        name: 'Orari Daiana',
        description: 'Promemoria giornaliero con il turno di domani',
        importance: 4,      // HIGH — heads-up notification con suono
        visibility: 1,      // PUBLIC — visibile sulla lock screen
        vibration: true,
      });

      await this.scheduleShiftNotifications();
    } catch (e) {
      console.error('[ShiftNotification] Errore durante init()', e);
    }
  }

  // ── Scheduling principale ────────────────────────────────────────────────

  /**
   * Schedula (o ri-schedula) le notifiche dei turni per i prossimi 7 giorni.
   * Cancella prima tutte le notifiche precedenti del gruppo per evitare duplicati.
   */
  async scheduleShiftNotifications(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.isEnabled()) return;

    try {
      // Cancella le notifiche precedenti di questo servizio
      await this.cancelPreviousNotifications();

      const today = new Date();
      const notifications: any[] = [];

      // Schedula per i prossimi 7 giorni: ogni notifica alle 19:30
      // mostra il turno del giorno successivo (i+1).
      for (let i = 0; i < 7; i++) {
        const notifDay = new Date(today);
        notifDay.setDate(today.getDate() + i);

        // Orario di trigger: 19:30 del giorno notifDay
        const triggerDate = new Date(notifDay);
        triggerDate.setHours(19, 30, 0, 0);

        // Salta se l'orario è già passato oggi
        if (triggerDate.getTime() <= Date.now()) continue;

        // Il turno che vogliamo mostrare è quello del giorno SUCCESSIVO
        const tomorrowDate = new Date(notifDay);
        tomorrowDate.setDate(notifDay.getDate() + 1);
        const shift = await this.getShiftForDate(tomorrowDate);

        const { title, body } = this.buildNotificationContent(tomorrowDate, shift);
        if (!body) continue; // Non schedula se non c'è nulla da mostrare

        notifications.push({
          id: NOTIF_BASE_ID + i,
          title,
          body,
          channelId: NOTIF_CHANNEL_ID,
          schedule: {
            at: triggerDate,
            allowWhileIdle: true,
          },
          extra: { route: '/' },
        });
      }

      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
        console.log(`[ShiftNotification] Schedulate ${notifications.length} notifiche turni.`);
      }

      // Memorizza quando è stato fatto l'ultimo scheduling
      localStorage.setItem(LAST_SCHEDULED_KEY, new Date().toISOString());
    } catch (e) {
      console.error('[ShiftNotification] Errore durante lo scheduling delle notifiche:', e);
    }
  }

  // ── Helper privati ───────────────────────────────────────────────────────

  private async getShiftForDate(date: Date): Promise<any | null> {
    try {
      const weekId = this.getWeekId(date);
      const dayName = date.toLocaleDateString('it-IT', { weekday: 'long' });
      return await this.shiftService.getAssignmentByDay(weekId, dayName);
    } catch {
      return null;
    }
  }

  private buildNotificationContent(
    date: Date,
    shift: any | null
  ): { title: string; body: string } {
    const dayLabel = date.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    // Capitalizza il giorno
    const dayCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    if (!shift || (!shift.label && !shift.shiftId)) {
      // Nessun turno previsto: invia ugualmente un promemoria generico
      return {
        title: `📅 ${dayCapitalized}`,
        body: `Nessun turno previsto.`,
      };
    }

    const storeText = shift.store ? ` presso ${shift.store}` : '';
    const timeText =
      shift.startTime && shift.endTime
        ? `dalle ${shift.startTime} alle ${shift.endTime}`
        : shift.startTime
        ? `dalle ${shift.startTime}`
        : '';

    return {
      title: `📅 Turno di ${dayCapitalized}`,
      body: `${shift.label}${timeText ? ' ' + timeText : ''}${storeText} 👔`,
    };
  }

  private async cancelPreviousNotifications(): Promise<void> {
    try {
      // Cancella solo i 14 potenziali ID di questo servizio
      const ids = Array.from({ length: 14 }, (_, i) => ({ id: NOTIF_BASE_ID + i }));
      await LocalNotifications.cancel({ notifications: ids });
    } catch {
      // Ignora errori di cancellazione (es. nessuna notifica pendente)
    }
  }

  private getWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum =
      1 +
      Math.round(
        ((date.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7
      );
    return `${date.getFullYear()}-W${weekNum}`;
  }

  // ── Preferenze utente ────────────────────────────────────────────────────

  isEnabled(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const stored = localStorage.getItem(PREFS_KEY);
    // Di default abilitato (null = prima apertura)
    return stored === null ? true : stored === 'true';
  }

  async setEnabled(value: boolean): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(PREFS_KEY, String(value));
    if (value) {
      await this.scheduleShiftNotifications();
    } else {
      await this.cancelPreviousNotifications();
    }
  }

  /** Ritorna la data dell'ultimo scheduling (per debug/UI) */
  getLastScheduledDate(): Date | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const stored = localStorage.getItem(LAST_SCHEDULED_KEY);
    return stored ? new Date(stored) : null;
  }
}
