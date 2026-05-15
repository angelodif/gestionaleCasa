import { Component, inject, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService, Appointment } from '../../services/shift/shift.service';
import { FunnyStationSyncService } from '../../services/funny-station/funny-station-sync.service';
import { MealService, DayPlan } from '../../services/meal/meal.service';
import { ShoppingListService, ShoppingItem } from '../../services/shopping/shopping.service';
import { FinanceService } from '../../services/finance/finance.service';
import { WasteService, WasteType } from '../../services/waste/waste.service';
import { DeadlineService, Deadline } from '../../services/deadline/deadline.service';
import { RecordExpenseDialogComponent } from '../../shared/record-expense-dialog/record-expense-dialog.component';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { PizzaRecipeDialogComponent } from '../../shared/pizza-recipe-dialog/pizza-recipe-dialog.component';
import { FsLoginDialogComponent } from '../../shared/fs-login-dialog/fs-login-dialog.component';
import { PizzaTimerService } from '../../shared/pizza-recipe-dialog/pizza-timer.service';
import { NotificationService } from '../../services/notification/notification.service';
import { Subscription, interval, firstValueFrom } from 'rxjs';
import localeIt from '@angular/common/locales/it';

registerLocaleData(localeIt);

import { ThemeService } from '../../services/theme/theme.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatRippleModule, RouterModule,
    MatButtonModule, MatDividerModule, MatTooltipModule, MatProgressBarModule, MatDialogModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  private router = inject(Router);
  private shiftService = inject(ShiftService);
  private mealService = inject(MealService);
  private shoppingService = inject(ShoppingListService);
  private financeService = inject(FinanceService);
  private dialog = inject(MatDialog);
  private funnySync = inject(FunnyStationSyncService);
  private wasteService = inject(WasteService);
  private deadlineService = inject(DeadlineService);
  pizzaTimer = inject(PizzaTimerService);
  notification = inject(NotificationService);

  // Signals State
  upcomingShifts = signal<any[]>([]);
  displayDate = signal<Date>(new Date());
  currentMealPlan = signal<DayPlan | null>(null);
  shoppingItems = signal<ShoppingItem[]>([]);
  personalAppointments = signal<{ date: Date, app: Appointment }[]>([]);
  todayAppointments = signal<Appointment[]>([]);
  financeStats = signal<any>(null);
  todayWaste = signal<WasteType | null>(null);
  tomorrowWaste = signal<WasteType | null>(null);
  urgentDeadlines = signal<Deadline[]>([]);

  // Computed
  isPizzaNight = computed(() => {
    const plan = this.currentMealPlan();
    if (!plan) return false;
    const isPizza = (m: any) => {
      if (!m || !m.main) return false;
      const fullText = (m.main + ' ' + (m.details || '')).toLowerCase();
      return fullText.includes('pizza') && (fullText.includes('home made') || fullText.includes('homemade') || fullText.includes('fatta in casa'));
    };
    return isPizza(plan.lunch.angelo) || isPizza(plan.lunch.daiana) || isPizza(plan.dinner.angelo) || isPizza(plan.dinner.daiana);
  });

  isTodayDisplay = computed(() => {
    return this.displayDate().toDateString() === new Date().toDateString();
  });

  private shoppingSub?: Subscription;
  private deadlineSub?: Subscription;
  private dayCheckSub?: Subscription;
  private initDay = new Date().getDate();

  constructor() {
    effect(() => {
      const date = this.displayDate();
      this.loadMealForDate(date);
    });
  }

  ngOnInit() {
    this.loadUpcomingDays();
    this.loadPersonalAppointments();
    this.loadFinanceData();
    this.loadWasteData();
    this.loadDeadlines();

    this.shoppingSub = this.shoppingService.getShoppingList().subscribe(items => {
      this.shoppingItems.set(items.filter(i => !i.completed));
    });

    this.dayCheckSub = interval(1200000).subscribe(() => {
      if (new Date().getDate() !== this.initDay) window.location.reload();
    });
  }

  ngOnDestroy() {
    if (this.shoppingSub) this.shoppingSub.unsubscribe();
    if (this.deadlineSub) this.deadlineSub.unsubscribe();
    if (this.dayCheckSub) this.dayCheckSub.unsubscribe();
  }

  async loadUpcomingDays() {
    const now = new Date();
    const results = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      const wId = this.getWeekId(d);
      const dName = d.toLocaleDateString('it-IT', { weekday: 'long' });
      const data: any = await this.shiftService.getAssignmentByDay(wId, dName);

      results.push({
        dayName: dName,
        dateString: d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
        label: data?.label || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
        store: data?.store || '',
        angeloInOffice: data?.angeloInOffice,
        noShift: !data || (!data.label && !data.shiftId && !data.angeloInOffice)
      });
    }
    this.upcomingShifts.set(results);
  }

  async loadPersonalAppointments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayData: any = await this.shiftService.getAssignmentByDay(this.getWeekId(today), today.toLocaleDateString('it-IT', { weekday: 'long' }));
    this.todayAppointments.set(todayData?.appointments || []);

    const upcoming: { date: Date, app: Appointment }[] = [];
    let daysChecked = 0;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + 1);

    while (upcoming.length < 2 && daysChecked < 90) {
      const data: any = await this.shiftService.getAssignmentByDay(this.getWeekId(nextDate), nextDate.toLocaleDateString('it-IT', { weekday: 'long' }));
      if (data?.appointments) {
        for (const app of data.appointments) {
          if (upcoming.length < 2) upcoming.push({ date: new Date(nextDate), app });
        }
      }
      nextDate.setDate(nextDate.getDate() + 1);
      daysChecked++;
    }
    this.personalAppointments.set(upcoming);
  }

  async syncFunnyStation(event: Event) {
    event.stopPropagation();
    const dialogRef = this.dialog.open(FsLoginDialogComponent, { width: '90vw', maxWidth: '400px' });
    dialogRef.afterClosed().subscribe(async credentials => {
      if (credentials) {
        try {
          const events = await this.funnySync.syncEventsWithCredentials(credentials.email, credentials.password);
          if (events.length === 0) return this.notification.showInfo('Nessun evento trovato.');
          
          let importedCount = 0;
          for (const ev of events) {
            const [y, m, d] = ev.date.split('-').map(Number);
            const evDate = new Date(y, m - 1, d);
            const wId = this.getWeekId(evDate);
            const dName = evDate.toLocaleDateString('it-IT', { weekday: 'long' });
            const current: any = await this.shiftService.getAssignmentByDay(wId, dName) || { id: dName, appointments: [] };
            if (!current.appointments) current.appointments = [];
            if (!current.appointments.some((a: any) => a.title === ev.title && a.startTime === ev.startTime)) {
              current.appointments.push({ ...ev, id: 'fs-' + Date.now() + '-' + Math.floor(Math.random() * 1000) });
              await this.shiftService.saveDayAssignment(dName, current, wId);
              importedCount++;
            }
          }
          this.notification.showSuccess(`Importati ${importedCount} nuovi eventi.`);
          this.loadPersonalAppointments();
        } catch (error) {
          this.notification.showError('Errore sincronizzazione.');
        }
      }
    });
  }

  async loadMealForDate(date: Date) {
    try {
      const dayName = date.toLocaleDateString('it-IT', { weekday: 'long' });
      const capitalDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const plan = await this.mealService.getDayPlan(this.getWeekId(date), capitalDay);
      this.currentMealPlan.set(plan);
    } catch (error) {
      this.currentMealPlan.set(null);
    }
  }

  changeMealDay(offset: number) {
    const next = new Date(this.displayDate());
    next.setDate(next.getDate() + offset);
    this.displayDate.set(next);
  }

  resetToToday() {
    this.displayDate.set(new Date());
  }

  private getWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }

  async loadFinanceData() {
    const monthKey = new Date().toISOString().slice(0, 7);
    const budget = await this.financeService.getBudget(monthKey);
    const expenses = await firstValueFrom(this.financeService.getMonthlyExpenses(monthKey));
    if (budget && expenses) {
      const spent = expenses.reduce((acc, e) => acc + e.totalAmount, 0);
      const total = (budget.totalLiquid || 0) + (budget.totalVouchers || 0);
      this.financeStats.set({ spent, total, remaining: total - spent, percent: Math.min((spent / total) * 100, 100) });
    }
  }

  loadWasteData() {
    this.todayWaste.set(this.wasteService.getTodayWaste());
    this.tomorrowWaste.set(this.wasteService.getTomorrowWaste());
  }

  loadDeadlines() {
    this.deadlineSub = this.deadlineService.getDeadlines().subscribe(list => {
      this.urgentDeadlines.set(list.filter(d => !d.isPaid).slice(0, 3));
    });
  }

  getDeadlineDays(dueDate: number): number {
    return Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
  }

  addExpense(event: Event) {
    event.stopPropagation();
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, { width: '95vw', maxWidth: '450px', data: { category: 'Altro' } });
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await this.financeService.addExpense(result);
          this.notification.showSuccess('Spesa registrata!');
          this.loadFinanceData();
        } catch (e) {
          this.notification.showError('Errore salvataggio.');
        }
      }
    });
  }

  quickAddProduct(event: Event) {
    event.stopPropagation();
    const dialogRef = this.dialog.open(AddItemDialogComponent, { width: '90vw', maxWidth: '400px', data: { itemName: '' } });
    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        try {
          await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
          this.notification.showSuccess(`"${result.itemName}" aggiunto!`);
        } catch (e) {
          this.notification.showError('Errore aggiunta.');
        }
      }
    });
  }

  openPizzaRecipe() { this.dialog.open(PizzaRecipeDialogComponent, { width: '95vw', maxWidth: '500px' }); }
  goToProfile() { this.router.navigate(['/profile']); }
  goToPlanner() { this.router.navigate(['/planner']); }
  goToMealPlanner() { this.router.navigate(['/meal-planner']); }
  goToShoppingList() { this.router.navigate(['/shopping-list']); }
  goToFinance() { this.router.navigate(['/finance']); }
  goToDeadlines() { this.router.navigate(['/deadlines']); }
  goToWasteConfig(event: Event) { event.stopPropagation(); this.router.navigate(['/waste-management']); }
  forceRefresh(event: Event) { event.stopPropagation(); window.location.reload(); }
  handleImageError(event: any) { event.target.src = 'https://ui-avatars.com/api/?name=User&background=673ab7&color=fff'; }
}