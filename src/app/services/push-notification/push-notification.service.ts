import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService, Appointment, DayAssignment } from '../shift/shift.service';
import { MealService, DayPlan } from '../meal/meal.service';
import { DeadlineService, Deadline } from '../deadline/deadline.service';
import { WasteService } from '../waste/waste.service';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { firstValueFrom } from 'rxjs';

export interface NotificationUserPreference {
  angelo: boolean;
  daiana: boolean;
  time?: string;
  leadTime?: { hours: number; minutes: number };
}

export interface NotificationGlobalPreference {
  enabled: boolean;
  time: string;
  timeEveningBefore?: string; // Supporto opzionale per il doppio orario
}

export interface NotificationPreferences {
  shifts: NotificationUserPreference;
  shiftsTomorrow: NotificationUserPreference;
  officeReminder: NotificationUserPreference;
  lunchPrep: NotificationUserPreference;
  menuLunch: NotificationUserPreference;
  menuDinner: NotificationUserPreference;
  appointments: NotificationUserPreference;
  appointmentsSummary: NotificationUserPreference;
  deadlinesToday: NotificationGlobalPreference;
  deadlinesTomorrow: NotificationGlobalPreference;
  deadlinesWeekly: NotificationGlobalPreference;
  wasteCollection: NotificationGlobalPreference;
  birthdays: NotificationGlobalPreference; // Nuova chiave tipizzata

  notifyLunchOut: boolean;
  notifyDinnerOut: boolean;
}

export interface NotificationCategory {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: string;
  isUserSpecific?: boolean;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: 'shifts', label: 'Turno di Lavoro', description: 'Promemoria prima del turno (Daiana)', icon: 'work', isUserSpecific: true },
  { key: 'shiftsTomorrow', label: 'Pre-avviso Turno Daiana', description: 'Avviso serale con il turno di lavoro di domani di Daiana', icon: 'forward_to_inbox', isUserSpecific: true },
  { key: 'officeReminder', label: 'Promemoria Ufficio', description: 'Avviso serale per presenza in ufficio domani (Angelo)', icon: 'business', isUserSpecific: true },
  { key: 'lunchPrep', label: 'Preparazione Pranzo', description: 'Promemoria per preparare il pranzo da portare in ufficio (Angelo)', icon: 'lunch_dining', isUserSpecific: true },
  { key: 'menuLunch', label: 'Menù Pranzo', description: 'Notifica con il menù del pranzo', icon: 'light_mode', isUserSpecific: true },
  { key: 'menuDinner', label: 'Menù Cena', description: 'Notifica con il menù della cena', icon: 'dark_mode', isUserSpecific: true },
  { key: 'appointments', label: 'Impegni Personali', description: 'Promemoria prima di ogni impegno', icon: 'event', isUserSpecific: true },
  { key: 'appointmentsSummary', label: 'Riepilogo Impegni', description: 'Riepilogo degli impegni di domani', icon: 'event_note', isUserSpecific: true },
  { key: 'deadlinesToday', label: 'Scadenze Oggi', description: 'Avviso per le scadenze del giorno', icon: 'alarm', isUserSpecific: false },
  { key: 'deadlinesTomorrow', label: 'Pre-avviso Scadenze', description: 'Avviso per le scadenze di domani', icon: 'alarm_add', isUserSpecific: false },
  { key: 'deadlinesWeekly', label: 'Scadenze Settimana', description: 'Riepilogo scadenze imminenti entro 7 giorni (ogni lunedì) ✨', icon: 'date_range', isUserSpecific: false },
  { key: 'wasteCollection', label: 'Raccolta Differenziata', description: 'Promemoria per la raccolta differenziata', icon: 'delete_sweep', isUserSpecific: false },
  { key: 'birthdays', label: 'Compleanni e Onomastici', description: 'Ricevi promemoria per i compleanni e gli onomastici il giorno stesso e la sera prima', icon: 'cake', isUserSpecific: false }
];

const PREFS_KEY = 'notification_preferences';

function getUserPrefsKey(uid?: string | null): string {
  return uid ? `${PREFS_KEY}_${uid}` : PREFS_KEY;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  shifts: { angelo: false, daiana: true, leadTime: { hours: 1, minutes: 0 } },
  shiftsTomorrow: { angelo: true, daiana: true, time: '21:00' },
  officeReminder: { angelo: true, daiana: false, time: '21:00' },
  lunchPrep: { angelo: true, daiana: false, time: '19:00' },
  menuLunch: { angelo: true, daiana: true, time: '12:00' },
  menuDinner: { angelo: true, daiana: true, time: '19:00' },
  appointments: { angelo: true, daiana: true, leadTime: { hours: 1, minutes: 0 } },
  appointmentsSummary: { angelo: true, daiana: true, time: '21:00' },
  deadlinesToday: { enabled: true, time: '08:00' },
  deadlinesTomorrow: { enabled: true, time: '20:00' },
  deadlinesWeekly: { enabled: true, time: '09:00' },
  wasteCollection: { enabled: true, time: '20:45' },
  birthdays: { enabled: true, time: '09:00', timeEveningBefore: '20:30' },
  notifyLunchOut: false,
  notifyDinnerOut: false
};

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);
  private mealService = inject(MealService);
  private deadlineService = inject(DeadlineService);
  private wasteService = inject(WasteService);
  private platformId = inject(PLATFORM_ID);

  getPreferences(): NotificationPreferences {
    if (!isPlatformBrowser(this.platformId)) return { ...DEFAULT_PREFERENCES };
    const uid = this.authService.getCurrentUser()?.uid;
    const storageKey = getUserPrefsKey(uid);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const migrated: any = { ...DEFAULT_PREFERENCES };

        const oldDayBeforeTime = parsed.dayBeforeTime ?? '20:00';
        const oldLunchTime = parsed.lunchTime ?? '12:00';
        const oldDinnerTime = parsed.dinnerTime ?? '19:00';
        const oldAppointmentLeadTime = parsed.appointmentLeadTime ?? { hours: 1, minutes: 0 };

        const userSpecificKeys: (keyof NotificationPreferences)[] = [
          'shifts', 'shiftsTomorrow', 'officeReminder', 'lunchPrep', 'menuLunch', 'menuDinner', 'appointments', 'appointmentsSummary'
        ];

        const globalKeys: (keyof NotificationPreferences)[] = [
          'deadlinesToday', 'deadlinesTomorrow', 'deadlinesWeekly', 'wasteCollection', 'birthdays'
        ];

        for (const key of userSpecificKeys) {
          if (parsed[key] !== undefined) {
            if (typeof parsed[key] === 'boolean') {
              if (key === 'shifts') {
                migrated[key] = { angelo: false, daiana: parsed[key], leadTime: { hours: 1, minutes: 0 } };
              } else if (key === 'shiftsTomorrow') {
                migrated[key] = { angelo: true, daiana: true, time: '21:00' };
              } else if (key === 'officeReminder') {
                migrated[key] = { angelo: parsed[key], daiana: false, time: '21:00' };
              } else if (key === 'lunchPrep') {
                migrated[key] = { angelo: parsed[key], daiana: false, time: '19:00' };
              } else if (key === 'menuLunch') {
                migrated[key] = { angelo: parsed[key], daiana: parsed[key], time: '12:00' };
              } else if (key === 'menuDinner') {
                migrated[key] = { angelo: parsed[key], daiana: parsed[key], time: '19:00' };
              } else if (key === 'appointments') {
                migrated[key] = { angelo: parsed[key], daiana: parsed[key], leadTime: { hours: 1, minutes: 0 } };
              } else if (key === 'appointmentsSummary') {
                migrated[key] = { angelo: parsed[key], daiana: parsed[key], time: '21:00' };
              }
            } else if (typeof parsed[key] === 'object') {
              const target = parsed[key];
              migrated[key] = {
                angelo: target.angelo ?? (DEFAULT_PREFERENCES[key] as any).angelo,
                daiana: target.daiana ?? (DEFAULT_PREFERENCES[key] as any).daiana
              };

              if (key === 'shifts' || key === 'appointments') {
                migrated[key].leadTime = target.leadTime ?? (key === 'appointments' ? oldAppointmentLeadTime : { hours: 1, minutes: 0 });
              } else {
                let defaultTime = (DEFAULT_PREFERENCES[key] as any).time;
                if (key === 'officeReminder' || key === 'lunchPrep' || key === 'appointmentsSummary' || key === 'shiftsTomorrow') {
                  defaultTime = oldDayBeforeTime;
                } else if (key === 'menuLunch') {
                  defaultTime = oldLunchTime;
                } else if (key === 'menuDinner') {
                  defaultTime = oldDinnerTime;
                }
                migrated[key].time = target.time ?? defaultTime;
              }
            }
          }
        }

        for (const key of globalKeys) {
          if (parsed[key] !== undefined) {
            if (typeof parsed[key] === 'boolean') {
              let defaultTime = (DEFAULT_PREFERENCES[key] as any).time;
              if (key === 'deadlinesTomorrow' || key === 'wasteCollection') {
                defaultTime = oldDayBeforeTime;
              }
              migrated[key] = { enabled: parsed[key], time: defaultTime };
              if (key === 'birthdays') {
                migrated[key].timeEveningBefore = '20:30';
              }
            } else if (typeof parsed[key] === 'object') {
              migrated[key] = {
                enabled: parsed[key].enabled ?? (DEFAULT_PREFERENCES[key] as any).enabled,
                time: parsed[key].time ?? (DEFAULT_PREFERENCES[key] as any).time
              };
              if (key === 'birthdays') {
                migrated[key].timeEveningBefore = parsed[key].timeEveningBefore ?? '20:30';
              }
            }
          }
        }

        migrated.notifyLunchOut = parsed.notifyLunchOut ?? DEFAULT_PREFERENCES.notifyLunchOut;
        migrated.notifyDinnerOut = parsed.notifyDinnerOut ?? DEFAULT_PREFERENCES.notifyDinnerOut;

        if (uid && localStorage.getItem(PREFS_KEY) && !localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, JSON.stringify(migrated));
          localStorage.removeItem(PREFS_KEY);
        }
        return migrated;
      }
    } catch (e) {
      console.warn('[PushNotificationService] Errore nel caricamento/migrazione delle preferenze', e);
    }
    return { ...DEFAULT_PREFERENCES };
  }

  savePreferences(prefs: NotificationPreferences): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const uid = this.authService.getCurrentUser()?.uid;
    const storageKey = getUserPrefsKey(uid);
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  }

  async init() {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.createChannel({
        id: 'high_importance_channel',
        name: 'Notifiche Importanti',
        description: 'Canale per promemoria urgenti compatibile con l\'illuminazione Edge',
        importance: 5,
        visibility: 1,
        vibration: true
      });

    } catch (e) {
      console.warn('[PushNotificationService] Notifications permissions/channel check failed', e);
    }

    await this.scheduleAll();
  }

  async scheduleAll() {
    if (!isPlatformBrowser(this.platformId)) return;

    const user = this.authService.getCurrentUser();
    if (!user) {
      console.log('[PushNotificationService] Nessun utente loggato, salto lo scheduling.');
      return;
    }

    const prefs = this.getPreferences();

    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      }
    } catch (e) {
      console.warn('[PushNotificationService] Errore durante la cancellazione delle notifiche pendenti', e);
    }

    const today = new Date();
    let deadlines: Deadline[] = [];
    try { deadlines = await firstValueFrom(this.deadlineService.getDeadlines()); } catch (e) { console.error(e); }

    const notifications: LocalNotificationSchema[] = [];
    const nowTime = today.getTime();

    const addNotification = (id: number, title: string, body: string, triggerDate: Date) => {
      if (triggerDate.getTime() > nowTime) {
        notifications.push({
          id,
          title,
          body,
          channelId: 'high_importance_channel',
          schedule: {
            at: triggerDate,
            allowWhileIdle: true
          }
        });
      }
    };

    const isTimeInRange = (timeStr: string, startStr: string, endStr: string): boolean => {
      try {
        const parse = (s: string) => {
          const [h, m] = s.split(':').map(Number);
          return h * 60 + m;
        };
        const t = parse(timeStr);
        const s = parse(startStr);
        const e = parse(endStr);
        return t >= s && t <= e;
      } catch {
        return false;
      }
    };

    // Prepariamo il caricamento dei dati per i prossimi 8 giorni (oggi + 7 giorni successivi)
    // in modo da avere sempre il giorno corrente e il giorno successivo ("domani") per l'ultimo giorno del ciclo.
    const promises = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const wId = this.getWeekId(d);
      const dName = d.toLocaleDateString('it-IT', { weekday: 'long' });
      const mealName = dName.charAt(0).toUpperCase() + dName.slice(1);

      promises.push((async () => {
        let assignment: DayAssignment | null = null;
        let meal: DayPlan | null = null;
        try {
          assignment = await this.shiftService.getAssignmentByDay(wId, dName) as DayAssignment | null;
        } catch (e) {
          console.error(e);
        }
        try {
          meal = await this.mealService.getDayPlan(wId, mealName);
        } catch (e) {
          console.error(e);
        }
        return { date: d, assignment, meal };
      })());
    }

    let results: { date: Date; assignment: DayAssignment | null; meal: DayPlan | null; }[] = [];
    try {
      results = await Promise.all(promises);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento dei dati per lo scheduling:', e);
    }

    if (results.length > 0) {
      for (let i = 0; i < 7; i++) {
        const res = results[i];
        if (!res) continue;

        const date = res.date;
        const assignment = res.assignment;
        const meal = res.meal;

        // "Domani" rispetto a i
        const tomorrowRes = results[i + 1];
        const tomorrowAssignment = tomorrowRes?.assignment;
        const tomorrowMeal = tomorrowRes?.meal;

        // 1. Turno di Daiana (oggi)
        if (prefs.shifts.daiana && assignment && (assignment.label || assignment.shiftId) && assignment.startTime) {
          const [h, m] = assignment.startTime.split(':').map(Number);
          const leadHours = prefs.shifts.leadTime?.hours ?? 1;
          const leadMinutes = prefs.shifts.leadTime?.minutes ?? 0;

          const triggerDate = new Date(date);
          triggerDate.setHours(h - leadHours, m - leadMinutes, 0, 0);

          const storeText = assignment.store ? ` presso ${assignment.store}` : '';
          const body = `Per Daiana 👔 oggi hai il turno dalle ${assignment.startTime} alle ${assignment.endTime}${storeText}`;
          addNotification(100 + i, 'Turno di Lavoro', body, triggerDate);
        }

        // 1b. Turno di domani di Daiana (pre-avviso serale)
        if (tomorrowAssignment && (tomorrowAssignment.label || tomorrowAssignment.shiftId) && tomorrowAssignment.startTime && (prefs.shiftsTomorrow?.angelo || prefs.shiftsTomorrow?.daiana)) {
          const storeText = tomorrowAssignment.store ? ` presso ${tomorrowAssignment.store}` : '';
          const [dbH, dbM] = (prefs.shiftsTomorrow.time || '21:00').split(':').map(Number);
          const triggerDate = new Date(date);
          triggerDate.setHours(dbH, dbM, 0, 0);

          if (prefs.shiftsTomorrow.angelo) {
            const body = `Domani Daiana ha il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText} 👔`;
            addNotification(7500 + i, 'Turno di Domani (Daiana)', body, triggerDate);
          }
          if (prefs.shiftsTomorrow.daiana) {
            const body = `Per Daiana 👔 domani hai il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText}`;
            addNotification(7510 + i, 'Turno di Domani', body, triggerDate);
          }
        }

        const tomorrowAngeloPresence = tomorrowAssignment?.angeloPresence || (tomorrowAssignment?.angeloInOffice ? 'office' : 'home');

        // 2. Angelo Ufficio Domani
        if (prefs.officeReminder.angelo && tomorrowAngeloPresence !== 'home') {
          let body = '';
          if (tomorrowAngeloPresence === 'office') {
            body = 'Per Angelo, domani sei in ufficio tutto il giorno (09:00–18:00). Prepara lo zaino! 🎒';
          } else if (tomorrowAngeloPresence === 'office_morning') {
            body = 'Per Angelo, domani sei in ufficio la mattina (09:00–13:00) poi agile. Prepara lo zaino! 🎒';
          } else if (tomorrowAngeloPresence === 'office_afternoon') {
            body = 'Per Angelo, domani mattina sei agile, poi in ufficio nel pomeriggio (14:00–18:00). Prepara lo zaino! 🎒';
          }

          if (body) {
            const [dbH, dbM] = (prefs.officeReminder.time || '21:00').split(':').map(Number);
            const triggerDate = new Date(date);
            triggerDate.setHours(dbH, dbM, 0, 0);
            addNotification(200 + i, 'Promemoria Ufficio', body, triggerDate);
          }
        }

        // 3. Angelo Preparazione Pranzo per domani
        const needsLunchPrep = ['office', 'office_morning'].includes(tomorrowAngeloPresence);
        if (prefs.lunchPrep.angelo && needsLunchPrep) {
          const tomorrowLunch = tomorrowMeal?.lunch?.angelo;
          if (tomorrowLunch && (!tomorrowLunch.isOut || prefs.notifyLunchOut)) {
            const mealDesc = tomorrowLunch.isOut
              ? (tomorrowLunch.main ? ` ordina ${tomorrowLunch.main}` : ': fuori casa')
              : (tomorrowLunch.main && tomorrowLunch.details ? `: ${tomorrowLunch.main} ${tomorrowLunch.details}` : '');

            const body = tomorrowLunch.isOut ? `Per Angelo 🥪 domani sei in ufficio, ${mealDesc}` : `Per Angelo 🥪 domani sei in ufficio, prepara il pranzo da casa: ${mealDesc}`;

            const [dbH, dbM] = (prefs.lunchPrep.time || '19:00').split(':').map(Number);
            const triggerDate = new Date(date);
            triggerDate.setHours(dbH, dbM, 0, 0);
            addNotification(300 + i, 'Preparazione Pranzo', body, triggerDate);
          }
        }

        // 4. Pranzo
        const lunchTimeStr = prefs.menuLunch.time || '12:00';
        const [lH, lM] = lunchTimeStr.split(':').map(Number);

        if (prefs.menuLunch.daiana && meal?.lunch?.daiana) {
          const dMeal = meal.lunch.daiana;
          if (!dMeal.isOut || prefs.notifyLunchOut) {
            const daianaShiftActiveAtLunch = assignment && (assignment.label || assignment.shiftId) && assignment.startTime && assignment.endTime && isTimeInRange(lunchTimeStr, assignment.startTime, assignment.endTime);
            if (!daianaShiftActiveAtLunch && (dMeal.main || dMeal.isOut)) {
              const details = dMeal.details ? `${dMeal.details}` : '';
              const mainText = dMeal.isOut ? (dMeal.main ? `fuori casa ${dMeal.main} ${details}` : 'fuori casa') : `${dMeal.main} ${details}`;
              const body = `Per Daiana 🍽️ oggi a pranzo: ${mainText}`;
              const triggerDate = new Date(date);
              triggerDate.setHours(lH, lM, 0, 0);
              addNotification(4100 + i, 'Menù Pranzo Daiana', body, triggerDate);
            }
          }
        }

        if (prefs.menuLunch.angelo && meal?.lunch?.angelo) {
          const aMeal = meal.lunch.angelo;
          if (!aMeal.isOut || prefs.notifyLunchOut) {
            const todayAngeloPresence = assignment?.angeloPresence || (assignment?.angeloInOffice ? 'office' : 'home');
            const angeloInOfficeAtLunch = ['office', 'office_morning'].includes(todayAngeloPresence);
            if (!angeloInOfficeAtLunch && (aMeal.main || aMeal.isOut)) {
              const details = aMeal.details ? `${aMeal.details}` : '';
              const mainText = aMeal.isOut ? (aMeal.main ? `fuori casa ${aMeal.main} ${details}` : 'fuori casa') : `${aMeal.main} ${details}`;
              const body = `Per Angelo 🍽️ oggi a pranzo: ${mainText}`;
              const triggerDate = new Date(date);
              triggerDate.setHours(lH, lM, 0, 0);
              addNotification(4000 + i, 'Menù Pranzo Angelo', body, triggerDate);
            }
          }
        }

        // 5. Cena
        if (prefs.menuDinner.daiana && meal?.dinner?.daiana) {
          const dMeal = meal.dinner.daiana;
          if (!dMeal.isOut || prefs.notifyDinnerOut) {
            if (dMeal.main || dMeal.isOut) {
              const details = dMeal.details ? `${dMeal.details}` : '';
              const mainText = dMeal.isOut ? (dMeal.main ? `fuori casa ${dMeal.main} ${details}` : 'fuori casa') : `${dMeal.main} ${details}`;
              const body = `Per Daiana 🌙 stasera a cena: ${mainText}`;

              const [dH, dM] = (prefs.menuDinner.time || '19:00').split(':').map(Number);
              const triggerDate = new Date(date);
              triggerDate.setHours(dH, dM, 0, 0);
              addNotification(5100 + i, 'Menù Cena Daiana', body, triggerDate);
            }
          }
        }

        if (prefs.menuDinner.angelo && meal?.dinner?.angelo) {
          const aMeal = meal.dinner.angelo;
          if (!aMeal.isOut || prefs.notifyDinnerOut) {
            if (aMeal.main || aMeal.isOut) {
              const details = aMeal.details ? `${aMeal.details}` : '';
              const mainText = aMeal.isOut ? (aMeal.main ? `fuori casa ${aMeal.main} ${details}` : 'fuori casa') : `${aMeal.main} ${details}`;
              const body = `Per Angelo 🌙 stasera a cena: ${mainText}`;

              const [dH, dM] = (prefs.menuDinner.time || '19:00').split(':').map(Number);
              const triggerDate = new Date(date);
              triggerDate.setHours(dH, dM, 0, 0);
              addNotification(5000 + i, 'Menù Cena Angelo', body, triggerDate);
            }
          }
        }

        // 6. Impegni personali
        if ((prefs.appointments.angelo || prefs.appointments.daiana) && assignment?.appointments && Array.isArray(assignment.appointments)) {
          const targetsToInclude: ('Angelo' | 'Daiana' | 'Couple')[] = [];
          if (prefs.appointments.angelo) targetsToInclude.push('Angelo');
          if (prefs.appointments.daiana) targetsToInclude.push('Daiana');
          if (prefs.appointments.angelo || prefs.appointments.daiana) targetsToInclude.push('Couple');

          const userApps = assignment.appointments.filter((app: Appointment) => targetsToInclude.includes(app.target));

          userApps.forEach((app: Appointment, j: number) => {
            if (app.startTime && app.title) {
              const [h, m] = app.startTime.split(':').map(Number);
              const triggerDate = new Date(date);

              const leadHours = app.reminderLeadTime ? app.reminderLeadTime.hours : (prefs.appointments.leadTime?.hours ?? 1);
              const leadMinutes = app.reminderLeadTime ? app.reminderLeadTime.minutes : (prefs.appointments.leadTime?.minutes ?? 0);

              triggerDate.setHours(h - leadHours, m - leadMinutes, 0, 0);

              const timeSpan = app.endTime ? ` (${app.startTime}–${app.endTime})` : ` (${app.startTime})`;

              let leadText = '';
              if (leadHours === 0 && leadMinutes === 0) {
                leadText = 'Ora';
              } else if (leadHours > 0 && leadMinutes > 0) {
                leadText = `Tra ${leadHours}h ${leadMinutes}m`;
              } else if (leadHours > 0) {
                leadText = `Tra ${leadHours} ${leadHours === 1 ? 'ora' : 'ore'}`;
              } else {
                leadText = `Tra ${leadMinutes} ${leadMinutes === 1 ? 'minuto' : 'minuti'}`;
              }

              const body = `📅 ${leadText}: ${app.title}${timeSpan}`;
              if (j < 10) {
                addNotification(6000 + i * 10 + j, 'Promemoria Impegno', body, triggerDate);
              }
            }
          });
        }

        // 7. Riepilogo Impegni Domani
        const tomorrowApps = tomorrowAssignment?.appointments;
        if (tomorrowApps && Array.isArray(tomorrowApps)) {
          const activeTargets: { key: 'angelo' | 'daiana' | 'couple'; label: 'Angelo' | 'Daiana' | 'Couple' }[] = [];

          if (prefs.appointmentsSummary.angelo) {
            activeTargets.push({ key: 'angelo', label: 'Angelo' });
          }
          if (prefs.appointmentsSummary.daiana) {
            activeTargets.push({ key: 'daiana', label: 'Daiana' });
          }
          if (prefs.appointmentsSummary.angelo || prefs.appointmentsSummary.daiana) {
            activeTargets.push({ key: 'couple', label: 'Couple' });
          }

          const triggerDate = new Date(date);
          const [dbH, dbM] = (prefs.appointmentsSummary.time || '21:00').split(':').map(Number);
          triggerDate.setHours(dbH, dbM, 0, 0);

          activeTargets.forEach((target, index) => {
            const targetApps = tomorrowApps.filter(
              (app: Appointment) => app.target === target.label
            );

            if (targetApps.length > 0) {
              const count = targetApps.length;
              const list = targetApps.map((app: Appointment) => `${app.title} (${app.startTime})`).join(', ');

              const displayName = target.label === 'Couple' ? 'Coppia' : target.label;
              const body = `${displayName} 📋 Domani ${count === 1 ? 'è previsto' : 'sono previsti'} ${count} impegn${count === 1 ? 'o' : 'i'}: ${list}`;

              const notificationId = 7000 + i * 10 + index;
              addNotification(notificationId, 'Riepilogo Impegni', body, triggerDate);
            }
          });
        }

        // 8. Scadenze Oggi
        if (prefs.deadlinesToday.enabled && deadlines && deadlines.length > 0) {
          const startOfToday = new Date(date).setHours(0, 0, 0, 0);
          const endOfToday = new Date(date).setHours(23, 59, 59, 999);

          const todayDeadlines = deadlines.filter(d => d.dueDate >= startOfToday && d.dueDate <= endOfToday && !d.isPaid);

          if (todayDeadlines.length > 0) {
            const count = todayDeadlines.length;
            const titles = todayDeadlines.map(d => d.title).join(', ');
            const body = `⚠️ Hai ${count} scadenz${count === 1 ? 'a' : 'e'} oggi: ${titles}`;
            const triggerDate = new Date(date);

            const [dH, dM] = (prefs.deadlinesToday.time || '08:00').split(':').map(Number);
            triggerDate.setHours(dH, dM, 0, 0);
            addNotification(8000 + i, 'Scadenze Oggi', body, triggerDate);
          }
        }

        // 8b. Pre-avviso Scadenze Domani
        if (prefs.deadlinesTomorrow.enabled && deadlines && deadlines.length > 0) {
          const tomorrowDate = tomorrowRes?.date;
          if (tomorrowDate) {
            const startOfTomorrow = new Date(tomorrowDate).setHours(0, 0, 0, 0);
            const endOfTomorrow = new Date(tomorrowDate).setHours(23, 59, 59, 999);

            const tomorrowDeadlines = deadlines.filter(d => d.dueDate >= startOfTomorrow && d.dueDate <= endOfTomorrow && !d.isPaid);

            if (tomorrowDeadlines.length > 0) {
              const count = tomorrowDeadlines.length;
              const titles = tomorrowDeadlines.map(d => d.title).join(', ');
              const body = `⏳ Domani scad${count === 1 ? 'e' : 'ranno'} ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
              const triggerDate = new Date(date);

              const [dbH, dbM] = (prefs.deadlinesTomorrow.time || '20:00').split(':').map(Number);
              triggerDate.setHours(dbH, dbM, 0, 0);
              addNotification(8500 + i, 'Promemoria Scadenza Domani', body, triggerDate);
            }
          }
        }

        // 8c. Scadenze imminenti entro 7 giorni (ogni lunedì)
        if (prefs.deadlinesWeekly.enabled && deadlines && deadlines.length > 0 && date.getDay() === 1) {
          const triggerDate = new Date(date);
          const [wH, wM] = (prefs.deadlinesWeekly.time || '09:00').split(':').map(Number);
          triggerDate.setHours(wH, wM, 0, 0);

          const startOfTargetWeek = new Date(date).setHours(0, 0, 0, 0);
          const endOfTargetWeek = new Date(date);
          endOfTargetWeek.setDate(endOfTargetWeek.getDate() + 7);
          const endOfTargetWeekTime = endOfTargetWeek.setHours(23, 59, 59, 999);

          const weeklyDeadlines = deadlines.filter(d => !d.isPaid && d.dueDate >= startOfTargetWeek && d.dueDate <= endOfTargetWeekTime);

          if (weeklyDeadlines.length > 0) {
            const count = weeklyDeadlines.length;
            const titles = weeklyDeadlines.map(d => {
              const dZero = new Date(d.dueDate).setHours(0, 0, 0, 0);
              const mZero = new Date(date).setHours(0, 0, 0, 0);
              const days = Math.round((dZero - mZero) / (1000 * 60 * 60 * 24));
              const label = days === 0 ? 'oggi' : `in ${days}gg`;
              return `${d.title} (${label})`;
            }).join(', ');
            const body = `📆 Questa settimana hai ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
            addNotification(8600 + i, 'Scadenze Settimana', body, triggerDate);
          }
        }

        // 9. Raccolta Differenziata
        if (prefs.wasteCollection.enabled) {
          const dayWaste = this.wasteService.getWastesForDate(date);
          if (dayWaste && Array.isArray(dayWaste) && dayWaste.length > 0) {
            const names = dayWaste.map(w => w.name).join(', ');
            const body = `🗑️ Oggi porta fuori: ${names}`;
            const triggerDate = new Date(date);

            const [wH, wM] = (prefs.wasteCollection.time || '20:45').split(':').map(Number);
            triggerDate.setHours(wH, wM, 0, 0);
            addNotification(9000 + i, 'Raccolta Differenziata', body, triggerDate);
          }
        }
      }

      // 10. Compleanni e Onomastici
      if (prefs.birthdays?.enabled) {
        try {
          const recurringEvents = await firstValueFrom(this.shiftService.getRecurringEvents());
          const [sameDayH, sameDayM] = (prefs.birthdays.time || '09:00').split(':').map(Number);
          const [eveningBeforeH, eveningBeforeM] = (prefs.birthdays.timeEveningBefore || '20:30').split(':').map(Number);

          for (let i = 0; i < 7; i++) {
            const currentDayDate = results[i].date;
            const tomorrowDayDate = results[i + 1].date;

            // Stesso giorno
            const dToday = currentDayDate.getDate();
            const mToday = currentDayDate.getMonth() + 1;
            const yToday = currentDayDate.getFullYear();
            const todayEvents = recurringEvents.filter(e => e.day === dToday && e.month === mToday);

            for (const ev of todayEvents) {
              const isBirthday = ev.type === 'birthday';
              let body = '';
              let title = '';
              const triggerDate = new Date(currentDayDate);
              triggerDate.setHours(sameDayH, sameDayM, 0, 0);

              const age = ev.year ? (yToday - ev.year) : 0;
              if (isBirthday) {
                title = `🎂 ${ev.name}`;
                body = age > 0
                  ? ` Oggi compie ${age} anni! Ricordati di fargli gli auguri!`
                  : ` Oggi è il suo compleanno! Ricordati di fargli gli auguri!`;
              } else {
                title = `🎉 ${ev.name}!`;
                body = `Oggi è il suo Onomastico! Ricordati di fargli gli auguri!`;
              }
              const notificationId = 10000 + i * 100 + ev.day * 12 + ev.month + (isBirthday ? 0 : 250);
              addNotification(notificationId, title, body, triggerDate);
            }

            // Sera prima
            const dTomorrow = tomorrowDayDate.getDate();
            const mTomorrow = tomorrowDayDate.getMonth() + 1;
            const yTomorrow = tomorrowDayDate.getFullYear();
            const tomorrowEvents = recurringEvents.filter(e => e.day === dTomorrow && e.month === mTomorrow);

            for (const ev of tomorrowEvents) {
              const isBirthday = ev.type === 'birthday';
              let body = '';
              let title = '';
              const triggerDate = new Date(currentDayDate);
              triggerDate.setHours(eveningBeforeH, eveningBeforeM, 0, 0);

              const age = ev.year ? (yTomorrow - ev.year) : 0;
              if (isBirthday) {
                title = `🎁 Domani compie gli anni ${ev.name}!`;
                body = age > 0
                  ? `Ricordati di fargli gli auguri! Compirà ${age} anni!`
                  : `Ricordati di fargli gli auguri!`;
              } else {
                title = `🔔 Domani è l'onomastico di ${ev.name}!`;
                body = `Ricordati di fargli gli auguri!`;
              }
              const notificationId = 20000 + i * 100 + ev.day * 12 + ev.month + (isBirthday ? 0 : 250);
              addNotification(notificationId, title, body, triggerDate);
            }
          }
        } catch (e) {
          console.error('[PushNotificationService] Errore nello schedulare le notifiche dei compleanni', e);
        }
      }
    }

    if (notifications.length > 0) {
      try {
        await LocalNotifications.schedule({ notifications });
        console.log(`[PushNotificationService] Schedulate con successo ${notifications.length} notifiche locali.`);
      } catch (e) {
        console.error('[PushNotificationService] Errore durante la schedulazione delle notifiche locali', e);
      }
    }

    localStorage.setItem('notif_scheduled_date', today.toDateString());
  }

  async testNotification(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    const triggerDate = new Date();
    triggerDate.setSeconds(triggerDate.getSeconds() + 5);

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 999,
            title: 'Notifica di Test 🔔',
            body: 'Questo è un test delle notifiche locali di GestionaleCasa!',
            channelId: 'high_importance_channel',
            schedule: {
              at: triggerDate,
              allowWhileIdle: true
            }
          }
        ]
      });
      console.log('[PushNotificationService] Notifica di test schedulata tra 5 secondi.');
      return true;
    } catch (e) {
      console.error('[PushNotificationService] Errore durante la notifica di test', e);
      return false;
    }
  }

  async getPendingCount(): Promise<number> {
    if (!isPlatformBrowser(this.platformId)) return 0;
    try {
      const pending = await LocalNotifications.getPending();
      return pending.notifications.length;
    } catch {
      return 0;
    }
  }

  private getWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }
}