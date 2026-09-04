import { Component, inject, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MealService, DayPlan, Meal } from '../../services/meal/meal.service';
import { ShiftService } from '../../services/shift/shift.service';
import { ShoppingListService } from '../../services/shopping/shopping.service';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification/notification.service';
import { PushNotificationService } from '../../services/push-notification/push-notification.service';
import { firstValueFrom, Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

registerLocaleData(localeIt);

type MealType = 'lunch' | 'dinner';

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatDividerModule, MatSnackBarModule, MatDialogModule,
    MatTooltipModule, MatSlideToggleModule
  ],
  templateUrl: './meal-planner.component.html',
  styleUrl: './meal-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MealPlannerComponent implements OnInit, OnDestroy {
  private mealService = inject(MealService);
  private shiftService = inject(ShiftService);
  private shoppingService = inject(ShoppingListService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private notification = inject(NotificationService);
  private pushNotificationService = inject(PushNotificationService);

  // Signals State
  currentDate = signal<Date>(new Date());
  allDaysPlans = signal<{ [key: string]: DayPlan }>({});
  isSplit = signal<{ [key: string]: { lunch: boolean, dinner: boolean } }>({});
  weekShifts = signal<{ [key: string]: any }>({});
  days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  hasScroll = signal<boolean>(false);

  // Computed Signals
  weekId = computed(() => {
    const d = new Date(this.currentDate().getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  });

  weekRangeLabel = computed(() => {
    const start = new Date(this.currentDate());
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const firstDay = new Date(start.setDate(diff));
    const lastDay = new Date(start.setDate(diff + 6));
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `Dal ${firstDay.toLocaleDateString('it-IT', options)} al ${lastDay.toLocaleDateString('it-IT', options)}`;
  });

  weekDaysData = computed(() => {
    const start = new Date(this.currentDate());
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(start.setDate(diff));

    const names = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    return names.map((name, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { name, date };
    });
  });

  private saveSubject = new Subject<{day: string, plan: DayPlan}>();
  private saveSub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.weekId();
      this.loadWeekData(id);
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.initSaveDebounce();
    this.checkScroll();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }
  }

  private onResize = () => this.checkScroll();

  checkScroll() {
    if (typeof window === 'undefined') return;
    const isMobileOrTablet = window.innerWidth <= 1200;
    const documentScrollable = document.documentElement.scrollHeight > window.innerHeight + 50;
    this.hasScroll.set(isMobileOrTablet || documentScrollable);
  }

  private initSaveDebounce() {
    this.saveSub = this.saveSubject.pipe(
      debounceTime(2000)
    ).subscribe(async ({day, plan}) => {
      try {
        await this.mealService.saveDayPlan(this.weekId(), day, plan);
        this.notification.showSuccess(`Piano ${day} salvato!`);
        this.pushNotificationService.scheduleAll();
      } catch (error: any) {}
    });
  }

  async loadWeekData(id: string) {
    const plans: { [key: string]: DayPlan } = {};
    const splits: { [key: string]: { lunch: boolean, dinner: boolean } } = {};

    for (const day of this.weekDaysData()) {
      const plan = await this.mealService.getDayPlan(id, day.name);
      plans[day.name] = plan;
      splits[day.name] = { 
        lunch: this.checkIfSplit(plan.lunch), 
        dinner: this.checkIfSplit(plan.dinner) 
      };
    }
    
    this.allDaysPlans.set(plans);
    this.isSplit.set(splits);

    // Carica i turni della settimana
    try {
      const assignments = await firstValueFrom(this.shiftService.getWeeklyPlanner(id));
      const shiftsMap = assignments.reduce((acc, curr: any) => {
        acc[curr.id.toLowerCase()] = curr;
        return acc;
      }, {});
      this.weekShifts.set(shiftsMap);
    } catch (error) {
      this.weekShifts.set({});
    }

    if (id === this.generateWeekIdStatic(new Date())) {
      this.scrollToToday();
    }
  }

  scrollToToday() {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      this.checkScroll();
      const todayCard = document.getElementById('today-meal-card') || document.querySelector('.day-card.is-today');
      if (todayCard) {
        todayCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  goToToday() {
    const today = new Date();
    if (this.generateWeekIdStatic(today) !== this.weekId()) {
      this.currentDate.set(today);
    } else {
      this.scrollToToday();
    }
  }

  ngOnDestroy() {
    if (this.saveSub) this.saveSub.unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  changeWeek(delta: number) {
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(d.getDate() + (delta * 7));
      return newDate;
    });
  }

  checkIfSplit(mealPair: { angelo: Meal, daiana: Meal }): boolean {
    if (!mealPair) return false;
    return mealPair.angelo.main !== mealPair.daiana.main || 
           mealPair.angelo.details !== mealPair.daiana.details ||
           mealPair.angelo.isOut !== mealPair.daiana.isOut;
  }

  syncMeals(dayName: string, type: MealType) {
    const plans = { ...this.allDaysPlans() };
    const daySplit = this.isSplit()[dayName];
    
    if (!daySplit[type]) {
      const meal = plans[dayName][type].angelo;
      plans[dayName][type].daiana.main = meal.main;
      plans[dayName][type].daiana.details = meal.details;
      plans[dayName][type].daiana.isOut = meal.isOut;
      this.allDaysPlans.set(plans);
    }
    this.save(dayName);
  }

  toggleOut(dayName: string, type: 'lunch' | 'dinner', user: 'angelo' | 'daiana') {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (meal) {
      meal.isOut = !meal.isOut;
      if (meal.isOut) meal.details = '';
      this.allDaysPlans.set(plans);
      this.syncMeals(dayName, type);
    }
  }

  toggleSplit(dayName: string, type: 'lunch' | 'dinner') {
    const splits = { ...this.isSplit() };
    splits[dayName][type] = !splits[dayName][type];
    this.isSplit.set(splits);
    if (!splits[dayName][type]) this.syncMeals(dayName, type);
  }

  save(day: string) {
    this.saveSubject.next({ day, plan: this.allDaysPlans()[day] });
  }

  getShiftTooltip(dayName: string): string {
    const shift = this.weekShifts()[dayName.toLowerCase()];
    if (!shift) return '';
    
    const lines = [];
    if (shift.label) {
      lines.push(`Daiana: ${shift.label} (${shift.startTime}-${shift.endTime}) ${shift.store}`);
    }
    if (shift.angeloInOffice) {
      lines.push(`Angelo: In Ufficio (09:00-18:00)`);
    }
    return lines.join(' • ');
  }

  updateMeal(dayName: string, mealType: 'lunch' | 'dinner', user: 'angelo' | 'daiana', field: 'main' | 'details' | 'isOut', value: any) {
    const plans = { ...this.allDaysPlans() };
    const dayPlan = plans[dayName];
    if (!dayPlan) return;
    
    (dayPlan[mealType][user] as any)[field] = value;
    this.allDaysPlans.set(plans);
    this.save(dayName);
  }

  addToList(text: string) {
    if (!text?.trim()) return;
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '90vw',
      maxWidth: '400px',
      data: { itemName: text }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        try {
          await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
          this.notification.showSuccess(`"${result.itemName}" aggiunto in ${result.shopName}!`);
        } catch (error: any) {}
      }
    });
  }

  async autoFillFromHistory() {
    this.notification.showInfo('Analisi intelligente in corso...');
    const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    const historyWeeks: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const prevDate = new Date(this.currentDate());
      prevDate.setDate(prevDate.getDate() - (i * 7));
      historyWeeks.push(this.generateWeekIdStatic(prevDate));
    }

    const historyData: any = {};
    for (const weekId of historyWeeks) {
      for (const day of dayNames) {
        const plan = await this.mealService.getDayPlan(weekId, day);
        if (!historyData[day]) historyData[day] = { lunch: { angelo: [], daiana: [] }, dinner: { angelo: [], daiana: [] } };
        if (plan.lunch.angelo.main || plan.lunch.angelo.isOut) historyData[day].lunch.angelo.push(plan.lunch.angelo);
        if (plan.lunch.daiana.main || plan.lunch.daiana.isOut) historyData[day].lunch.daiana.push(plan.lunch.daiana);
        if (plan.dinner.angelo.main || plan.dinner.angelo.isOut) historyData[day].dinner.angelo.push(plan.dinner.angelo);
        if (plan.dinner.daiana.main || plan.dinner.daiana.isOut) historyData[day].dinner.daiana.push(plan.dinner.daiana);
      }
    }

    const getSmartSuggestion = (history: any[]) => {
      if (!history.length) return null;
      const mainCounts = history.reduce((acc, val) => {
        const key = val.isOut ? '__OUT__' : val.main;
        if (!key && !val.isOut) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as any);
      const keys = Object.keys(mainCounts);
      if (keys.length === 0) return null;
      const bestMainKey = keys.reduce((a, b) => mainCounts[a] > mainCounts[b] ? a : b);
      if (bestMainKey === '__OUT__') return { main: '', details: '', isOut: true };
      const detailsCounts = history.filter(h => h.main === bestMainKey).reduce((acc, val) => {
        const dKey = val.details || '';
        acc[dKey] = (acc[dKey] || 0) + 1;
        return acc;
      }, {} as any);
      const dKeys = Object.keys(detailsCounts);
      const bestDetails = dKeys.length > 0 ? dKeys.reduce((a, b) => detailsCounts[a] > detailsCounts[b] ? a : b) : '';
      return { main: bestMainKey, details: bestDetails, isOut: false };
    };

    let count = 0;
    const plans = { ...this.allDaysPlans() };
    const splits = { ...this.isSplit() };

    for (const day of dayNames) {
      const currentPlan = plans[day];
      const history = historyData[day];
      const shift = this.weekShifts()[day.toLowerCase()];
      let dayModified = false;

      const processMeal = (type: 'lunch' | 'dinner') => {
        const meal = currentPlan[type];
        if (meal.angelo.main || meal.angelo.isOut) return;
        const suggA = getSmartSuggestion(history[type].angelo);
        const suggD = getSmartSuggestion(history[type].daiana);
        if (suggA || suggD) {
          const finalA = (suggA || suggD)!;
          const finalD = (suggD || suggA)!;
          meal.angelo = { ...finalA };
          meal.daiana = { ...finalD };
          splits[day][type] = (type === 'lunch' && shift?.angeloInOffice) || 
                             (finalA.main !== finalD.main || finalA.isOut !== finalD.isOut || finalA.details !== finalD.details);
          dayModified = true;
          count++;
        }
      };

      processMeal('lunch');
      processMeal('dinner');
      if (dayModified) {
        this.allDaysPlans.set(plans);
        this.isSplit.set(splits);
        this.save(day);
      }
    }

    if (count > 0) this.notification.showSuccess(`Menù ottimizzato con ${count} suggerimenti!`);
    else this.notification.showInfo('Dati insufficienti per automatizzare.');
  }

  private generateWeekIdStatic(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }

  isPastWeek(): boolean {
    const lastDay = this.weekDaysData()[6]?.date;
    if (!lastDay) return false;
    const end = new Date(lastDay);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}