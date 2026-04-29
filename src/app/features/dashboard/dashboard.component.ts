import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button'; // Aggiungi questo per i bottoni
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService, Appointment } from '../../services/shift/shift.service';

import { MealService, DayPlan } from '../../services/meal/meal.service';
import { ShoppingListService, ShoppingItem } from '../../services/shopping/shopping.service';
import { FinanceService, FinanceStats } from '../../services/finance/finance.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RecordExpenseDialogComponent } from '../../shared/record-expense-dialog/record-expense-dialog.component';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { PizzaRecipeDialogComponent } from '../../shared/pizza-recipe-dialog/pizza-recipe-dialog.component';
import { PizzaTimerService } from '../../shared/pizza-recipe-dialog/pizza-timer.service';
import { Subscription, interval, firstValueFrom } from 'rxjs';
// Nel file main.ts o dashboard.component.ts (se serve)
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
registerLocaleData(localeIt);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatRippleModule,
    RouterModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatDialogModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Iniezioni
  authService = inject(AuthService);
  private router = inject(Router);
  private shiftService = inject(ShiftService);
  private mealService = inject(MealService);
  private shoppingService = inject(ShoppingListService);
  private financeService = inject(FinanceService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  pizzaTimer = inject(PizzaTimerService);

  // Proprietà
  upcomingShifts: any[] = [];
  displayDate = new Date();
  currentMealPlan: DayPlan | null = null;
  shoppingItems: ShoppingItem[] = [];
  personalAppointments: { date: Date, app: Appointment }[] = [];
  todayAppointments: Appointment[] = [];
  financeStats: any = null;

  private shoppingSub?: Subscription;
  private dayCheckSub?: Subscription;
  private initDay = new Date().getDate();

  ngOnInit() {
    this.loadUpcomingDays();
    this.loadMealForDate(this.displayDate);
    this.loadPersonalAppointments();
    this.loadFinanceData();


    this.shoppingSub = this.shoppingService.getShoppingList().subscribe(items => {
      this.shoppingItems = items.filter(i => !i.completed);
    });

    // Check ogni minuto per il refresh di mezzanotte
    this.dayCheckSub = interval(1200000).subscribe(() => {
      if (new Date().getDate() !== this.initDay) {
        window.location.reload();
      }
    });
  }

  ngOnDestroy() {
    if (this.shoppingSub) this.shoppingSub.unsubscribe();
    if (this.dayCheckSub) this.dayCheckSub.unsubscribe();
  }

  async loadUpcomingDays() {
    const now = new Date();
    const daysToFetch = [];

    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      daysToFetch.push({
        dateObj: d,
        name: d.toLocaleDateString('it-IT', { weekday: 'long' }),
        weekId: this.getWeekId(d)
      });
    }

    const results = [];
    for (const day of daysToFetch) {
      const dayName = day.name; // Mantieni lowercase come salvato da ShiftPlanner
      const data: any = await this.shiftService.getAssignmentByDay(day.weekId, dayName);

      results.push({
        dayName: day.name,
        dateString: day.dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
        label: data?.label || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
        store: data?.store || '',
        angeloInOffice: data?.angeloInOffice,
        noShift: !data || (!data.label && !data.shiftId && !data.angeloInOffice)
      });
    }
    this.upcomingShifts = results;
    this.cdr.detectChanges();
  }

  async loadPersonalAppointments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayName = today.toLocaleDateString('it-IT', { weekday: 'long' }); // Lowercase come salvato su Firestore
    const todayWeekId = this.getWeekId(today);

    // Impegni di oggi
    const todayData: any = await this.shiftService.getAssignmentByDay(todayWeekId, todayName);
    this.todayAppointments = todayData?.appointments || [];

    // Prossimi 2 impegni — cerca fino a 90 giorni nel futuro
    const upcoming: { date: Date, app: Appointment }[] = [];
    let daysChecked = 0;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + 1);

    while (upcoming.length < 2 && daysChecked < 90) {
      const dName = nextDate.toLocaleDateString('it-IT', { weekday: 'long' }); // Lowercase
      const wId = this.getWeekId(nextDate);
      const data: any = await this.shiftService.getAssignmentByDay(wId, dName); // dName è già lowercase

      if (data?.appointments && data.appointments.length > 0) {
        for (const app of data.appointments) {
          if (upcoming.length < 2) {
            upcoming.push({ date: new Date(nextDate), app });
          }
        }
      }

      nextDate.setDate(nextDate.getDate() + 1);
      daysChecked++;
    }
    this.personalAppointments = upcoming;
    this.cdr.detectChanges();
  }


  async loadMealForDate(date: Date) {
    const weekId = this.getWeekId(date);
    let dayName = date.toLocaleDateString('it-IT', { weekday: 'long' });
    // Capitalizzazione: "lunedì" -> "Lunedì"
    dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);

    try {
      this.currentMealPlan = await this.mealService.getDayPlan(weekId, dayName);
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Errore caricamento pasti:", error);
      this.currentMealPlan = null;
    }
  }

  changeMealDay(offset: number) {
    const newDate = new Date(this.displayDate);
    newDate.setDate(newDate.getDate() + offset);
    this.displayDate = newDate;
    this.loadMealForDate(this.displayDate);
  }

  resetToToday() {
    this.displayDate = new Date();
    this.loadMealForDate(this.displayDate);
  }

  isTodayDisplay(): boolean {
    const today = new Date();
    return this.displayDate.toDateString() === today.toDateString();
  }

  private getWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }

  get isPizzaNight(): boolean {
    if (!this.currentMealPlan) return false;
    const plan = this.currentMealPlan;
    
    const isPizza = (m: any) => {
      if (!m || !m.main) return false;
      const fullText = (m.main + ' ' + (m.details || '')).toLowerCase();
      const hasPizza = fullText.includes('pizza');
      const hasHomeMade = fullText.includes('home made') || 
                          fullText.includes('homemade') || 
                          fullText.includes('fatta in casa');
      return hasPizza && hasHomeMade;
    };

    return isPizza(plan.lunch.angelo) || isPizza(plan.lunch.daiana) || 
           isPizza(plan.dinner.angelo) || isPizza(plan.dinner.daiana);
  }

  async loadFinanceData() {
    const monthKey = new Date().toISOString().slice(0, 7);
    const budget = await this.financeService.getBudget(monthKey);
    const expenses = await firstValueFrom(this.financeService.getMonthlyExpenses(monthKey));
    
    if (budget && expenses) {
      const totalSpent = expenses.reduce((acc, e) => acc + e.totalAmount, 0);
      const totalBudget = (budget.totalLiquid || 0) + (budget.totalVouchers || 0);
      this.financeStats = {
        totalSpent,
        totalBudget,
        remaining: totalBudget - totalSpent,
        percent: Math.min((totalSpent / totalBudget) * 100, 100)
      };
      this.cdr.detectChanges();
    }
  }

  addExpense(event: Event) {
    event.stopPropagation(); // Evita di navigare alla pagina finance
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: { category: 'Altro' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        await this.financeService.addExpense(result);
        this.loadFinanceData(); // Aggiorna le stats in dashboard
      }
    });
  }

  quickAddProduct(event: Event) {
    event.stopPropagation();
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '90vw',
      maxWidth: '400px',
      data: { itemName: '' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
        // La lista si aggiorna automaticamente tramite la sottoscrizione in ngOnInit
      }
    });
  }

  openPizzaRecipe() {
    this.dialog.open(PizzaRecipeDialogComponent, {
      width: '95vw',
      maxWidth: '500px'
    });
  }

  // Navigazione
  goToProfile() { this.router.navigate(['/profile']); }
  goToPlanner() { this.router.navigate(['/planner']); }
  goToMealPlanner() { this.router.navigate(['/meal-planner']); }
  goToShoppingList() { this.router.navigate(['/shopping-list']); }
  goToFinance() { this.router.navigate(['/finance']); }

  forceRefresh(event: Event) {
    event.stopPropagation();
    window.location.reload();
  }

  handleImageError(event: any) {
    event.target.src = 'https://ui-avatars.com/api/?name=User&background=673ab7&color=fff';
  }
}