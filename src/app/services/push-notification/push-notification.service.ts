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
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayWeekId = this.getWeekId(today);
    const tomorrowWeekId = this.getWeekId(tomorrow);

    const todayAssignmentName = today.toLocaleDateString('it-IT', { weekday: 'long' });
    const tomorrowAssignmentName = tomorrow.toLocaleDateString('it-IT', { weekday: 'long' });

    const todayMealName = todayAssignmentName.charAt(0).toUpperCase() + todayAssignmentName.slice(1);
    const tomorrowMealName = tomorrowAssignmentName.charAt(0).toUpperCase() + tomorrowAssignmentName.slice(1);

    let todayAssignment: DayAssignment | null = null;
    let tomorrowAssignment: DayAssignment | null = null;
    let todayMeal: DayPlan | null = null;
    let tomorrowMeal: DayPlan | null = null;
    let deadlines: Deadline[] = [];

    try { todayAssignment = await this.shiftService.getAssignmentByDay(todayWeekId, todayAssignmentName) as DayAssignment | null; } catch (e) { console.error(e); }
    try { tomorrowAssignment = await this.shiftService.getAssignmentByDay(tomorrowWeekId, tomorrowAssignmentName) as DayAssignment | null; } catch (e) { console.error(e); }
    try { todayMeal = await this.mealService.getDayPlan(todayWeekId, todayMealName); } catch (e) { console.error(e); }
    try { tomorrowMeal = await this.mealService.getDayPlan(tomorrowWeekId, tomorrowMealName); } catch (e) { console.error(e); }
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

    // 1. Turno di Daiana
    if (prefs.shifts.daiana && todayAssignment && (todayAssignment.label || todayAssignment.shiftId) && todayAssignment.startTime) {
      const [h, m] = todayAssignment.startTime.split(':').map(Number);
      const leadHours = prefs.shifts.leadTime?.hours ?? 1;
      const leadMinutes = prefs.shifts.leadTime?.minutes ?? 0;

      const triggerDate = new Date(today);
      triggerDate.setHours(h - leadHours, m - leadMinutes, 0, 0);

      const storeText = todayAssignment.store ? ` presso ${todayAssignment.store}` : '';
      const body = `Per Daiana 👔 oggi hai il turno dalle ${todayAssignment.startTime} alle ${todayAssignment.endTime}${storeText}`;
      addNotification(1, 'Turno di Lavoro', body, triggerDate);
    }

    // 1b. Turno di domani di Daiana
    if (tomorrowAssignment && (tomorrowAssignment.label || tomorrowAssignment.shiftId) && tomorrowAssignment.startTime && (prefs.shiftsTomorrow?.angelo || prefs.shiftsTomorrow?.daiana)) {
      const storeText = tomorrowAssignment.store ? ` presso ${tomorrowAssignment.store}` : '';
      const [dbH, dbM] = (prefs.shiftsTomorrow.time || '21:00').split(':').map(Number);
      const triggerDate = new Date(today);
      triggerDate.setHours(dbH, dbM, 0, 0);

      if (prefs.shiftsTomorrow.angelo) {
        const body = `Domani Daiana ha il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText} 👔`;
        addNotification(750, 'Turno di Domani (Daiana)', body, triggerDate);
      }
      if (prefs.shiftsTomorrow.daiana) {
        const body = `Per Daiana 👔 domani hai il turno dalle ${tomorrowAssignment.startTime} alle ${tomorrowAssignment.endTime}${storeText}`;
        addNotification(751, 'Turno di Domani', body, triggerDate);
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
        const triggerDate = new Date(today);
        triggerDate.setHours(dbH, dbM, 0, 0);
        addNotification(2, 'Promemoria Ufficio', body, triggerDate);
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
        const triggerDate = new Date(today);
        triggerDate.setHours(dbH, dbM, 0, 0);
        addNotification(3, 'Preparazione Pranzo', body, triggerDate);
      }
    }

    // 4. Pranzo
    const lunchTimeStr = prefs.menuLunch.time || '12:00';
    const [lH, lM] = lunchTimeStr.split(':').map(Number);

    if (prefs.menuLunch.daiana && todayMeal?.lunch?.daiana) {
      const meal = todayMeal.lunch.daiana;
      if (!meal.isOut || prefs.notifyLunchOut) {
        const daianaShiftActiveAtLunch = todayAssignment && (todayAssignment.label || todayAssignment.shiftId) && todayAssignment.startTime && todayAssignment.endTime && isTimeInRange(lunchTimeStr, todayAssignment.startTime, todayAssignment.endTime);
        if (!daianaShiftActiveAtLunch && (meal.main || meal.isOut)) {
          const details = meal.details ? `${meal.details}` : '';
          const mainText = meal.isOut ? (meal.main ? `fuori casa ${meal.main} ${details}` : 'fuori casa') : `${meal.main} ${details}`;
          const body = `Per Daiana 🍽️ oggi a pranzo: ${mainText}`;
          const triggerDate = new Date(today);
          triggerDate.setHours(lH, lM, 0, 0);
          addNotification(401, 'Menù Pranzo Daiana', body, triggerDate);
        }
      }
    }

    if (prefs.menuLunch.angelo && todayMeal?.lunch?.angelo) {
      const meal = todayMeal.lunch.angelo;
      if (!meal.isOut || prefs.notifyLunchOut) {
        const todayAngeloPresence = todayAssignment?.angeloPresence || (todayAssignment?.angeloInOffice ? 'office' : 'home');
        const angeloInOfficeAtLunch = ['office', 'office_morning'].includes(todayAngeloPresence);
        if (!angeloInOfficeAtLunch && (meal.main || meal.isOut)) {
          const details = meal.details ? `${meal.details}` : '';
          const mainText = meal.isOut ? (meal.main ? `fuori casa ${meal.main} ${details}` : 'fuori casa') : `${meal.main} ${details}`;
          const body = `Per Angelo 🍽️ oggi a pranzo: ${mainText}`;
          const triggerDate = new Date(today);
          triggerDate.setHours(lH, lM, 0, 0);
          addNotification(400, 'Menù Pranzo Angelo', body, triggerDate);
        }
      }
    }

    // 5. Cena
    if (prefs.menuDinner.daiana && todayMeal?.dinner?.daiana) {
      const meal = todayMeal.dinner.daiana;
      if (!meal.isOut || prefs.notifyDinnerOut) {
        if (meal.main || meal.isOut) {
          const details = meal.details ? `${meal.details}` : '';
          const mainText = meal.isOut ? (meal.main ? `fuori casa ${meal.main} ${details}` : 'fuori casa') : `${meal.main} ${details}`;
          const body = `Per Daiana 🌙 stasera a cena: ${mainText}`;

          const [dH, dM] = (prefs.menuDinner.time || '19:00').split(':').map(Number);
          const triggerDate = new Date(today);
          triggerDate.setHours(dH, dM, 0, 0);
          addNotification(501, 'Menù Cena Daiana', body, triggerDate);
        }
      }
    }

    if (prefs.menuDinner.angelo && todayMeal?.dinner?.angelo) {
      const meal = todayMeal.dinner.angelo;
      if (!meal.isOut || prefs.notifyDinnerOut) {
        if (meal.main || meal.isOut) {
          const details = meal.details ? `${meal.details}` : '';
          const mainText = meal.isOut ? (meal.main ? `fuori casa ${meal.main} ${details}` : 'fuori casa') : `${meal.main} ${details}`;
          const body = `Per Angelo 🌙 stasera a cena: ${mainText}`;

          const [dH, dM] = (prefs.menuDinner.time || '19:00').split(':').map(Number);
          const triggerDate = new Date(today);
          triggerDate.setHours(dH, dM, 0, 0);
          addNotification(500, 'Menù Cena Angelo', body, triggerDate);
        }
      }
    }

    // 6. Impegni personali
    if ((prefs.appointments.angelo || prefs.appointments.daiana) && todayAssignment?.appointments && Array.isArray(todayAssignment.appointments)) {
      const targetsToInclude: ('Angelo' | 'Daiana' | 'Couple')[] = [];
      if (prefs.appointments.angelo) targetsToInclude.push('Angelo');
      if (prefs.appointments.daiana) targetsToInclude.push('Daiana');
      if (prefs.appointments.angelo || prefs.appointments.daiana) targetsToInclude.push('Couple');

      const userApps = todayAssignment.appointments.filter((app: Appointment) => targetsToInclude.includes(app.target));

      userApps.forEach((app: Appointment, index: number) => {
        if (app.startTime && app.title) {
          const [h, m] = app.startTime.split(':').map(Number);
          const triggerDate = new Date(today);

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
          if (index < 10) {
            addNotification(600 + index, 'Promemoria Impegno', body, triggerDate);
          }
        }
      });
    }

    // 7. Riepilogo Impegni Domani
    if ((prefs.appointmentsSummary.angelo || prefs.appointmentsSummary.daiana) && tomorrowAssignment?.appointments && Array.isArray(tomorrowAssignment.appointments)) {
      const summaryTargets: ('Angelo' | 'Daiana' | 'Couple')[] = [];
      if (prefs.appointmentsSummary.angelo) summaryTargets.push('Angelo');
      if (prefs.appointmentsSummary.daiana) summaryTargets.push('Daiana');
      if (prefs.appointmentsSummary.angelo || prefs.appointmentsSummary.daiana) summaryTargets.push('Couple');

      const tomorrowUserApps = tomorrowAssignment.appointments.filter((app: Appointment) => summaryTargets.includes(app.target));

      if (tomorrowUserApps.length > 0) {
        const count = tomorrowUserApps.length;
        const list = tomorrowUserApps.map((app: Appointment) => `${app.title} (${app.startTime})`).join(', ');
        const body = `📋 Domani hai ${count} impegn${count === 1 ? 'o' : 'i'}: ${list}`;
        const triggerDate = new Date(today);

        const [dbH, dbM] = (prefs.appointmentsSummary.time || '21:00').split(':').map(Number);
        triggerDate.setHours(dbH, dbM, 0, 0);
        addNotification(700, 'Riepilogo Impegni', body, triggerDate);
      }
    }

    // 8. Scadenze Oggi
    if (prefs.deadlinesToday.enabled && deadlines && deadlines.length > 0) {
      const startOfToday = new Date(today).setHours(0, 0, 0, 0);
      const endOfToday = new Date(today).setHours(23, 59, 59, 999);

      const todayDeadlines = deadlines.filter(d => d.dueDate >= startOfToday && d.dueDate <= endOfToday && !d.isPaid);

      if (todayDeadlines.length > 0) {
        const count = todayDeadlines.length;
        const titles = todayDeadlines.map(d => d.title).join(', ');
        const body = `⚠️ Hai ${count} scadenz${count === 1 ? 'a' : 'e'} oggi: ${titles}`;
        const triggerDate = new Date(today);

        const [dH, dM] = (prefs.deadlinesToday.time || '08:00').split(':').map(Number);
        triggerDate.setHours(dH, dM, 0, 0);
        addNotification(800, 'Scadenze Oggi', body, triggerDate);
      }
    }

    // 8b. Pre-avviso Scadenze Domani
    if (prefs.deadlinesTomorrow.enabled && deadlines && deadlines.length > 0) {
      const startOfTomorrow = new Date(tomorrow).setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(tomorrow).setHours(23, 59, 59, 999);

      const tomorrowDeadlines = deadlines.filter(d => d.dueDate >= startOfTomorrow && d.dueDate <= endOfTomorrow && !d.isPaid);

      if (tomorrowDeadlines.length > 0) {
        const count = tomorrowDeadlines.length;
        const titles = tomorrowDeadlines.map(d => d.title).join(', ');
        const body = `⏳ Domani scad${count === 1 ? 'e' : 'ranno'} ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
        const triggerDate = new Date(today);

        const [dbH, dbM] = (prefs.deadlinesTomorrow.time || '20:00').split(':').map(Number);
        triggerDate.setHours(dbH, dbM, 0, 0);
        addNotification(850, 'Promemoria Scadenza Domani', body, triggerDate);
      }
    }

    // 8c. Scadenze imminenti entro 7 giorni (ogni lunedì)
    if (prefs.deadlinesWeekly.enabled && deadlines && deadlines.length > 0) {
      const dayOfWeek = today.getDay();
      const daysUntilMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + daysUntilMonday);

      const [wH, wM] = (prefs.deadlinesWeekly.time || '09:00').split(':').map(Number);
      nextMonday.setHours(wH, wM, 0, 0);

      if (nextMonday.getTime() <= nowTime) {
        nextMonday.setDate(nextMonday.getDate() + 7);
      }

      const startOfTargetWeek = new Date(nextMonday).setHours(0, 0, 0, 0);
      const endOfTargetWeek = new Date(nextMonday);
      endOfTargetWeek.setDate(endOfTargetWeek.getDate() + 7);
      const endOfTargetWeekTime = endOfTargetWeek.setHours(23, 59, 59, 999);

      const weeklyDeadlines = deadlines.filter(d => !d.isPaid && d.dueDate >= startOfTargetWeek && d.dueDate <= endOfTargetWeekTime);

      if (weeklyDeadlines.length > 0) {
        const count = weeklyDeadlines.length;
        const titles = weeklyDeadlines.map(d => {
          const dZero = new Date(d.dueDate).setHours(0, 0, 0, 0);
          const mZero = new Date(nextMonday).setHours(0, 0, 0, 0);
          const days = Math.round((dZero - mZero) / (1000 * 60 * 60 * 24));
          const label = days === 0 ? 'oggi' : `in ${days}gg`;
          return `${d.title} (${label})`;
        }).join(', ');
        const body = `📆 Questa settimana hai ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
        addNotification(860, 'Scadenze Settimana', body, nextMonday);
      }
    }

    // 9. Raccolta Differenziata
    if (prefs.wasteCollection.enabled) {
      const tomorrowWaste = this.wasteService.getTodayWaste();
      if (tomorrowWaste && Array.isArray(tomorrowWaste) && tomorrowWaste.length > 0) {
        const names = tomorrowWaste.map(w => w.name).join(', ');
        const body = `🗑️ Oggi porta fuori: ${names}`;
        const triggerDate = new Date(today);

        const [wH, wM] = (prefs.wasteCollection.time || '20:45').split(':').map(Number);
        triggerDate.setHours(wH, wM, 0, 0);
        addNotification(900, 'Raccolta Differenziata', body, triggerDate);
      }
    }

    // 10. Compleanni e Onomastici (Modificato con doppio orario personalizzato)
    if (prefs.birthdays?.enabled) {
      try {
        const recurringEvents = await firstValueFrom(this.shiftService.getRecurringEvents());
        const [sameDayH, sameDayM] = (prefs.birthdays.time || '09:00').split(':').map(Number);
        const [eveningBeforeH, eveningBeforeM] = (prefs.birthdays.timeEveningBefore || '20:30').split(':').map(Number);

        const checkEventsForDate = (dateObj: Date, label: 'oggi' | 'domani') => {
          const d = dateObj.getDate();
          const m = dateObj.getMonth() + 1;
          const y = dateObj.getFullYear();

          const dayEvents = recurringEvents.filter(e => e.day === d && e.month === m);
          for (const ev of dayEvents) {
            const isBirthday = ev.type === 'birthday';
            let body = '';
            let title = '';
            const triggerDate = new Date(today); // Lo scheduling basato sul giorno corrente 'today'

            if (label === 'oggi') {
              triggerDate.setHours(sameDayH, sameDayM, 0, 0);
              const age = ev.year ? (y - ev.year) : 0;
              if (isBirthday) {
                title = `🎂 ${ev.name}`;
                body = age > 0
                  ? ` Oggi compie ${age} anni! Ricordati di fargli gli auguri!`
                  : ` Oggi è il suo compleanno! Ricordati di fargli gli auguri!`;
              } else {
                title = `🎉 ${ev.name}!`;
                body = `Oggi è il suo Onomastico! Ricordati di fargli gli auguri!`;
              }
            } else {
              triggerDate.setHours(eveningBeforeH, eveningBeforeM, 0, 0);
              const age = ev.year ? ((y + 1) - ev.year) : 0; // Se controlla domani, l'anno di riferimento aumenta o mantiene la consistenza dell'età futura
              if (isBirthday) {
                title = `🎁 Domani compie gli anni ${ev.name}!`;
                body = age > 0
                  ? `Ricordati di fargli gli auguri! Compirà ${age} anni!`
                  : `Ricordati di fargli gli auguri!`;
              } else {
                title = `🔔 Domani è l'onomastico di ${ev.name}!`;
                body = `Ricordati di fargli gli auguri!`;
              }
            }

            const notificationId = 1000 + ev.day * 12 + ev.month + (label === 'oggi' ? 0 : 500) + (isBirthday ? 0 : 250);
            addNotification(notificationId, title, body, triggerDate);
          }
        };

        checkEventsForDate(today, 'oggi');
        checkEventsForDate(tomorrow, 'domani');
      } catch (e) {
        console.error('[PushNotificationService] Errore nello schedulare le notifiche dei compleanni', e);
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