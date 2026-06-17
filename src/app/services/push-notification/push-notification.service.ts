import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService, Appointment } from '../shift/shift.service';
import { MealService, DayPlan } from '../meal/meal.service';
import { DeadlineService, Deadline } from '../deadline/deadline.service';
import { WasteService } from '../waste/waste.service';
import { LocalNotifications } from '@capacitor/local-notifications';
import { firstValueFrom } from 'rxjs';

export interface NotificationPreferences {
  shifts: boolean;              // Turno di lavoro Daiana
  officeReminder: boolean;      // Promemoria ufficio Angelo
  lunchPrep: boolean;           // Preparazione pranzo Angelo
  menuLunch: boolean;           // Menù pranzo
  menuDinner: boolean;          // Menù cena
  appointments: boolean;        // Impegni personali (1h prima)
  appointmentsSummary: boolean; // Riepilogo impegni domani
  deadlinesToday: boolean;      // Scadenze oggi
  deadlinesTomorrow: boolean;   // Pre-avviso scadenze domani
  deadlinesWeekly: boolean;     // Scadenze imminenti entro 7 giorni (lunedì mattina)
  wasteCollection: boolean;     // Raccolta differenziata
}

export interface NotificationCategory {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: string;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: 'shifts',
    label: 'Turno di Lavoro',
    description: 'Promemoria 1 ora prima del turno (Daiana)',
    icon: 'work'
  },
  {
    key: 'officeReminder',
    label: 'Promemoria Ufficio',
    description: 'Avviso serale per presenza in ufficio domani (Angelo)',
    icon: 'business'
  },
  {
    key: 'lunchPrep',
    label: 'Preparazione Pranzo',
    description: 'Promemoria per preparare il pranzo da portare in ufficio (Angelo)',
    icon: 'lunch_dining'
  },
  {
    key: 'menuLunch',
    label: 'Menù Pranzo',
    description: 'Notifica con il menù del pranzo (ore 12:00)',
    icon: 'light_mode'
  },
  {
    key: 'menuDinner',
    label: 'Menù Cena',
    description: 'Notifica con il menù della cena (ore 19:00)',
    icon: 'dark_mode'
  },
  {
    key: 'appointments',
    label: 'Impegni Personali',
    description: 'Promemoria 1 ora prima di ogni impegno',
    icon: 'event'
  },
  {
    key: 'appointmentsSummary',
    label: 'Riepilogo Impegni',
    description: 'Riepilogo degli impegni di domani (ore 21:00)',
    icon: 'event_note'
  },
  {
    key: 'deadlinesToday',
    label: 'Scadenze Oggi',
    description: 'Avviso per le scadenze del giorno (ore 08:00)',
    icon: 'alarm'
  },
  {
    key: 'deadlinesTomorrow',
    label: 'Pre-avviso Scadenze',
    description: 'Avviso per le scadenze di domani (ore 20:00)',
    icon: 'alarm_add'
  },
  {
    key: 'deadlinesWeekly',
    label: 'Scadenze Settimana',
    description: 'Riepilogo scadenze imminenti entro 7 giorni (ogni lunedì ore 09:00) ✨',
    icon: 'date_range'
  },
  {
    key: 'wasteCollection',
    label: 'Raccolta Differenziata',
    description: 'Promemoria per la raccolta differenziata (ore 20:45)',
    icon: 'delete_sweep'
  }
];

const PREFS_KEY = 'notification_preferences';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  shifts: true,
  officeReminder: true,
  lunchPrep: true,
  menuLunch: true,
  menuDinner: true,
  appointments: true,
  appointmentsSummary: true,
  deadlinesToday: true,
  deadlinesTomorrow: true,
  deadlinesWeekly: true,
  wasteCollection: true
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
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch { }
    return { ...DEFAULT_PREFERENCES };
  }

  savePreferences(prefs: NotificationPreferences): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  async init() {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch (e) {
      console.warn('[PushNotificationService] Notifications permissions check/request skipped or failed', e);
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

    const displayName = user.displayName || '';
    const nameLower = displayName.toLowerCase();
    const isAngelo = nameLower.startsWith('angelo');
    const isDaiana = nameLower.startsWith('daiana');

    if (!isAngelo && !isDaiana) {
      console.log('[PushNotificationService] Utente non riconosciuto come Angelo o Daiana, salto lo scheduling.');
      return;
    }

    const prefs = this.getPreferences();

    // Cancella le notifiche schedulate precedentemente per evitare duplicati
    const idsToCancel = [
      1, 2, 3, 400, 401, 500, 501, 700, 800, 850, 860, 900, 999,
      ...Array.from({ length: 10 }, (_, i) => 600 + i)
    ];

    try {
      await LocalNotifications.cancel({ notifications: idsToCancel.map(id => ({ id })) });
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

    let todayAssignment: any = null;
    let tomorrowAssignment: any = null;
    let todayMeal: DayPlan | null = null;
    let tomorrowMeal: DayPlan | null = null;
    let deadlines: Deadline[] = [];

    try {
      todayAssignment = await this.shiftService.getAssignmentByDay(todayWeekId, todayAssignmentName);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento del turno di oggi', e);
    }

    try {
      tomorrowAssignment = await this.shiftService.getAssignmentByDay(tomorrowWeekId, tomorrowAssignmentName);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento del turno di domani', e);
    }

    try {
      todayMeal = await this.mealService.getDayPlan(todayWeekId, todayMealName);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento dei pasti di oggi', e);
    }

    try {
      tomorrowMeal = await this.mealService.getDayPlan(tomorrowWeekId, tomorrowMealName);
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento dei pasti di domani', e);
    }

    try {
      deadlines = await firstValueFrom(this.deadlineService.getDeadlines());
    } catch (e) {
      console.error('[PushNotificationService] Errore nel caricamento delle scadenze', e);
    }

    const notifications: any[] = [];
    const nowTime = today.getTime();

    const addNotification = (id: number, title: string, body: string, triggerDate: Date) => {
      if (triggerDate.getTime() > nowTime) {
        notifications.push({
          id,
          title,
          body,
          schedule: { at: triggerDate }
        });
      }
    };

    // 1. Turno di Daiana (1 ora prima dell'inizio)
    if (prefs.shifts && isDaiana && todayAssignment && (todayAssignment.label || todayAssignment.shiftId) && todayAssignment.startTime) {
      const [h, m] = todayAssignment.startTime.split(':').map(Number);
      const triggerDate = new Date(today);
      triggerDate.setHours(h - 1, m, 0, 0);

      const storeText = todayAssignment.store ? ` @ ${todayAssignment.store}` : '';
      const body = `Ehi Daiana 👔 oggi hai il turno dalle ${todayAssignment.startTime} alle ${todayAssignment.endTime}${storeText}`;
      addNotification(1, 'Turno di Lavoro', body, triggerDate);
    }

    const tomorrowAngeloPresence = tomorrowAssignment?.angeloPresence || (tomorrowAssignment?.angeloInOffice ? 'office' : 'home');

    // 2. Angelo Ufficio Domani (alle 21:00 di oggi)
    if (prefs.officeReminder && isAngelo && tomorrowAngeloPresence !== 'home') {
      let body = '';
      if (tomorrowAngeloPresence === 'office') {
        body = 'Angelo, domani sei in ufficio tutto il giorno (09:00–18:00). Prepara lo zaino! 🎒';
      } else if (tomorrowAngeloPresence === 'office_morning') {
        body = 'Angelo, domani sei in ufficio la mattina (09:00–13:00) poi agile. Prepara lo zaino! 🎒';
      } else if (tomorrowAngeloPresence === 'office_afternoon') {
        body = 'Angelo, domani mattina sei agile, poi in ufficio nel pomeriggio (14:00–18:00). Prepara lo zaino! 🎒';
      }

      if (body) {
        const triggerDate = new Date(today);
        triggerDate.setHours(21, 0, 0, 0);
        addNotification(2, 'Promemoria Ufficio', body, triggerDate);
      }
    }

    // 3. Angelo Preparazione Pranzo per domani (alle 19:00 di oggi)
    const needsLunchPrep = isAngelo && ['office', 'office_morning'].includes(tomorrowAngeloPresence);
    if (prefs.lunchPrep && needsLunchPrep) {
      const tomorrowLunch = tomorrowMeal?.lunch?.angelo;
      if (tomorrowLunch && !tomorrowLunch.isOut) {
        const mealDesc = tomorrowLunch.main ? `: ${tomorrowLunch.main}` : '';
        const body = `Angelo 🥪 domani sei in ufficio, prepara il pranzo${mealDesc}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(19, 0, 0, 0);
        addNotification(3, 'Preparazione Pranzo', body, triggerDate);
      }
    }

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

    // 4. Pranzo a Casa (ore 12:00 oggi)
    if (prefs.menuLunch) {
      if (isDaiana && todayMeal?.lunch?.daiana && !todayMeal.lunch.daiana.isOut) {
        const daianaShiftActiveAt12 = todayAssignment && (todayAssignment.label || todayAssignment.shiftId) && todayAssignment.startTime && todayAssignment.endTime && isTimeInRange('12:00', todayAssignment.startTime, todayAssignment.endTime);
        if (!daianaShiftActiveAt12 && todayMeal.lunch.daiana.main) {
          const details = todayMeal.lunch.daiana.details ? ` (${todayMeal.lunch.daiana.details})` : '';
          const body = `Daiana 🍽️ oggi a pranzo: ${todayMeal.lunch.daiana.main}${details}`;
          const triggerDate = new Date(today);
          triggerDate.setHours(12, 0, 0, 0);
          addNotification(401, 'Menù Pranzo', body, triggerDate);
        }
      }

      if (isAngelo && todayMeal?.lunch?.angelo && !todayMeal.lunch.angelo.isOut) {
        const todayAngeloPresence = todayAssignment?.angeloPresence || (todayAssignment?.angeloInOffice ? 'office' : 'home');
        const angeloInOfficeAt12 = ['office', 'office_morning'].includes(todayAngeloPresence);
        if (!angeloInOfficeAt12 && todayMeal.lunch.angelo.main) {
          const details = todayMeal.lunch.angelo.details ? ` (${todayMeal.lunch.angelo.details})` : '';
          const body = `Angelo 🍽️ oggi a pranzo: ${todayMeal.lunch.angelo.main}${details}`;
          const triggerDate = new Date(today);
          triggerDate.setHours(12, 0, 0, 0);
          addNotification(400, 'Menù Pranzo', body, triggerDate);
        }
      }
    }

    // 5. Cena a Casa (ore 19:00 oggi)
    if (prefs.menuDinner) {
      if (isDaiana && todayMeal?.dinner?.daiana && !todayMeal.dinner.daiana.isOut && todayMeal.dinner.daiana.main) {
        const details = todayMeal.dinner.daiana.details ? ` (${todayMeal.dinner.daiana.details})` : '';
        const body = `Daiana 🌙 stasera a cena: ${todayMeal.dinner.daiana.main}${details}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(19, 0, 0, 0);
        addNotification(501, 'Menù Cena', body, triggerDate);
      }

      if (isAngelo && todayMeal?.dinner?.angelo && !todayMeal.dinner.angelo.isOut && todayMeal.dinner.angelo.main) {
        const details = todayMeal.dinner.angelo.details ? ` (${todayMeal.dinner.angelo.details})` : '';
        const body = `Angelo 🌙 stasera a cena: ${todayMeal.dinner.angelo.main}${details}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(19, 0, 0, 0);
        addNotification(500, 'Menù Cena', body, triggerDate);
      }
    }

    // 6. Impegni personali (1 ora prima dell'evento)
    if (prefs.appointments && todayAssignment?.appointments && Array.isArray(todayAssignment.appointments)) {
      const userApps = todayAssignment.appointments.filter((app: Appointment) => {
        if (isAngelo) return app.target === 'Angelo' || app.target === 'Couple';
        if (isDaiana) return app.target === 'Daiana' || app.target === 'Couple';
        return false;
      });

      userApps.forEach((app: Appointment, index: number) => {
        if (app.startTime && app.title) {
          const [h, m] = app.startTime.split(':').map(Number);
          const triggerDate = new Date(today);
          triggerDate.setHours(h - 1, m, 0, 0);

          const timeSpan = app.endTime ? ` (${app.startTime}–${app.endTime})` : ` (${app.startTime})`;
          const body = `📅 Tra 1 ora: ${app.title}${timeSpan}`;
          if (index < 10) {
            addNotification(600 + index, 'Promemoria Impegno', body, triggerDate);
          }
        }
      });
    }

    // 7. Riepilogo Impegni Domani (ore 21:00 di oggi)
    if (prefs.appointmentsSummary && tomorrowAssignment?.appointments && Array.isArray(tomorrowAssignment.appointments)) {
      const tomorrowUserApps = tomorrowAssignment.appointments.filter((app: Appointment) => {
        if (isAngelo) return app.target === 'Angelo' || app.target === 'Couple';
        if (isDaiana) return app.target === 'Daiana' || app.target === 'Couple';
        return false;
      });

      if (tomorrowUserApps.length > 0) {
        const count = tomorrowUserApps.length;
        const list = tomorrowUserApps
          .map((app: Appointment) => `${app.title} (${app.startTime})`)
          .join(', ');
        const body = `📋 Domani hai ${count} impegn${count === 1 ? 'o' : 'i'}: ${list}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(21, 0, 0, 0);
        addNotification(700, 'Riepilogo Impegni', body, triggerDate);
      }
    }

    // 8. Scadenze Oggi (ore 08:00 oggi)
    if (prefs.deadlinesToday && deadlines && deadlines.length > 0) {
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const todayDeadlines = deadlines.filter(d => {
        return d.dueDate >= startOfToday.getTime() && d.dueDate <= endOfToday.getTime() && !d.isPaid;
      });

      if (todayDeadlines.length > 0) {
        const count = todayDeadlines.length;
        const titles = todayDeadlines.map(d => d.title).join(', ');
        const body = `⚠️ Hai ${count} scadenz${count === 1 ? 'a' : 'e'} oggi: ${titles}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(8, 0, 0, 0);
        addNotification(800, 'Scadenze Oggi', body, triggerDate);
      }
    }

    // 8b. Pre-avviso Scadenze Domani (ore 20:00 di oggi)
    if (prefs.deadlinesTomorrow && deadlines && deadlines.length > 0) {
      const startOfTomorrow = new Date(tomorrow);
      startOfTomorrow.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      const tomorrowDeadlines = deadlines.filter(d => {
        return d.dueDate >= startOfTomorrow.getTime() && d.dueDate <= endOfTomorrow.getTime() && !d.isPaid;
      });

      if (tomorrowDeadlines.length > 0) {
        const count = tomorrowDeadlines.length;
        const titles = tomorrowDeadlines.map(d => d.title).join(', ');
        const body = `⏳ Domani scade${count === 1 ? '' : 'ranno'} ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(20, 0, 0, 0);
        addNotification(850, 'Promemoria Scadenza Domani', body, triggerDate);
      }
    }

    // 8c. [NUOVO] Scadenze imminenti entro 7 giorni — ogni lunedì mattina ore 09:00
    if (prefs.deadlinesWeekly && deadlines && deadlines.length > 0) {
      const dayOfWeek = today.getDay(); // 0=dom, 1=lun, ...
      const daysUntilMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);

      // Se il lunedì calcolato è già passato rispetto ad adesso (ad es. oggi è lunedì dopo le 09:00),
      // programmiamo per il lunedì della settimana successiva.
      if (nextMonday.getTime() <= nowTime) {
        nextMonday.setDate(nextMonday.getDate() + 7);
      }

      // Filtriamo le scadenze relative alla settimana in cui verrà attivata la notifica
      const startOfTargetWeek = new Date(nextMonday);
      startOfTargetWeek.setHours(0, 0, 0, 0);

      const endOfTargetWeek = new Date(nextMonday);
      endOfTargetWeek.setDate(nextMonday.getDate() + 7);
      endOfTargetWeek.setHours(23, 59, 59, 999);

      const weeklyDeadlines = deadlines.filter(d => {
        return !d.isPaid && d.dueDate >= startOfTargetWeek.getTime() && d.dueDate <= endOfTargetWeek.getTime();
      });

      if (weeklyDeadlines.length > 0) {
        const count = weeklyDeadlines.length;
        const titles = weeklyDeadlines.map(d => {
          const dDate = new Date(d.dueDate);
          dDate.setHours(0, 0, 0, 0);
          const mDate = new Date(nextMonday);
          mDate.setHours(0, 0, 0, 0);
          const days = Math.round((dDate.getTime() - mDate.getTime()) / (1000 * 60 * 60 * 24));
          const label = days === 0 ? 'oggi' : `in ${days}gg`;
          return `${d.title} (${label})`;
        }).join(', ');
        const body = `📆 Questa settimana hai ${count} scadenz${count === 1 ? 'a' : 'e'}: ${titles}`;
        addNotification(860, 'Scadenze Settimana', body, nextMonday);
      }
    }

    // 9. Raccolta Differenziata (ore 20:45 di oggi)
    if (prefs.wasteCollection) {
      const tomorrowWaste = this.wasteService.getTodayWaste();
      if (tomorrowWaste && tomorrowWaste.length > 0) {
        const names = tomorrowWaste.map(w => w.name).join(', ');
        const body = `🗑️ Oggi porta fuori: ${names}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(20, 45, 0, 0);
        addNotification(900, 'Raccolta Differenziata', body, triggerDate);
      }
    }

    // Schedulazione effettiva
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

  async testNotification() {
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
            schedule: { at: triggerDate }
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
