import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService, Appointment } from '../shift/shift.service';
import { MealService, DayPlan } from '../meal/meal.service';
import { DeadlineService, Deadline } from '../deadline/deadline.service';
import { WasteService } from '../waste/waste.service';
import { LocalNotifications } from '@capacitor/local-notifications';
import { firstValueFrom } from 'rxjs';

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

    // Cancella le notifiche schedulate precedentemente per evitare duplicati
    const idsToCancel = [
      1, 2, 3, 400, 401, 500, 501, 700, 800, 850, 900, 999,
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

    const todayAssignmentName = today.toLocaleDateString('it-IT', { weekday: 'long' }); // es. "lunedì"
    const tomorrowAssignmentName = tomorrow.toLocaleDateString('it-IT', { weekday: 'long' });

    const todayMealName = todayAssignmentName.charAt(0).toUpperCase() + todayAssignmentName.slice(1); // es. "Lunedì"
    const tomorrowMealName = tomorrowAssignmentName.charAt(0).toUpperCase() + tomorrowAssignmentName.slice(1);

    // Fetch asincrono dei dati necessari
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

    // Helper per aggiungere solo notifiche future
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
    if (isDaiana && todayAssignment && (todayAssignment.label || todayAssignment.shiftId) && todayAssignment.startTime) {
      const [h, m] = todayAssignment.startTime.split(':').map(Number);
      const triggerDate = new Date(today);
      triggerDate.setHours(h - 1, m, 0, 0);

      const storeText = todayAssignment.store ? ` @ ${todayAssignment.store}` : '';
      const body = `Ehi Daiana 👔 oggi hai il turno dalle ${todayAssignment.startTime} alle ${todayAssignment.endTime}${storeText}`;
      addNotification(1, 'Turno di Lavoro', body, triggerDate);
    }

    // Calcolo presenza Angelo domani
    const tomorrowAngeloPresence = tomorrowAssignment?.angeloPresence || (tomorrowAssignment?.angeloInOffice ? 'office' : 'home');

    // 2. Angelo Ufficio Domani (alle 21:00 di oggi)
    if (isAngelo && tomorrowAngeloPresence !== 'home') {
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
    if (needsLunchPrep) {
      const tomorrowLunch = tomorrowMeal?.lunch?.angelo;
      if (tomorrowLunch && !tomorrowLunch.isOut) {
        const mealDesc = tomorrowLunch.main ? `: ${tomorrowLunch.main}` : '';
        const body = `Angelo 🥪 domani sei in ufficio, prepara il pranzo${mealDesc}`;
        const triggerDate = new Date(today);
        triggerDate.setHours(19, 0, 0, 0);
        addNotification(3, 'Preparazione Pranzo', body, triggerDate);
      }
    }

    // Helper per controllare se un orario è all'interno di un range
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

    // 5. Cena a Casa (ore 19:00 oggi)
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

    // 6. Impegni personali (1 ora prima dell'evento)
    if (todayAssignment?.appointments && Array.isArray(todayAssignment.appointments)) {
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
    if (tomorrowAssignment?.appointments && Array.isArray(tomorrowAssignment.appointments)) {
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
    if (deadlines && deadlines.length > 0) {
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

      // 8b. Pre-avviso Scadenze Domani (ore 20:00 di oggi)
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

    // 9. Raccolta Differenziata Domani (ore 20:45 di oggi)
    const tomorrowWaste = this.wasteService.getTodayWaste();
    if (tomorrowWaste && tomorrowWaste.length > 0) {
      const names = tomorrowWaste.map(w => w.name).join(', ');
      const body = `🗑️ Oggi porta fuori: ${names}`;
      const triggerDate = new Date(today);
      triggerDate.setHours(20, 45, 0, 0);
      addNotification(900, 'Raccolta Differenziata', body, triggerDate);
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
