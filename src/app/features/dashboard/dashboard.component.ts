import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button'; // Aggiungi questo per i bottoni
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth/auth.service';
import { ShiftService } from '../../services/shift/shift.service';
import { MealService, DayPlan } from '../../services/meal/meal.service';
import { ShoppingListService, ShoppingItem } from '../../services/shopping/shopping.service';
import { Subscription, interval } from 'rxjs';
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
    MatDividerModule
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

  // Proprietà
  upcomingShifts: any[] = [];
  displayDate = new Date();
  currentMealPlan: DayPlan | null = null;
  shoppingItems: ShoppingItem[] = [];
  private shoppingSub?: Subscription;
  private dayCheckSub?: Subscription;
  private initDay = new Date().getDate();

  ngOnInit() {
    this.loadUpcomingDays();
    this.loadMealForDate(this.displayDate);

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
      // Nota: getAssignmentByDay deve gestire il nome del giorno coerente con il DB
      const data: any = await this.shiftService.getAssignmentByDay(day.weekId, day.name);

      results.push({
        dayName: day.name,
        dateString: day.dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
        label: data?.label || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
        store: data?.store || '',
        noShift: !data
      });
    }
    this.upcomingShifts = results;
  }

  async loadMealForDate(date: Date) {
    const weekId = this.getWeekId(date);
    let dayName = date.toLocaleDateString('it-IT', { weekday: 'long' });
    // Capitalizzazione: "lunedì" -> "Lunedì"
    dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);

    try {
      this.currentMealPlan = await this.mealService.getDayPlan(weekId, dayName);
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
      const mainLower = m.main.toLowerCase();
      const detailsLower = m.details ? m.details.toLowerCase() : '';
      const hasPizza = mainLower.includes('pizza');
      const hasHomeMade = detailsLower.includes('home made') || detailsLower.includes('homemade');
      return hasPizza && hasHomeMade;
    };

    return isPizza(plan.lunch.angelo) || isPizza(plan.lunch.daiana) || 
           isPizza(plan.dinner.angelo) || isPizza(plan.dinner.daiana);
  }

  // Navigazione
  goToProfile() { this.router.navigate(['/profile']); }
  goToPlanner() { this.router.navigate(['/planner']); }
  goToMealPlanner() { this.router.navigate(['/meal-planner']); }
  goToShoppingList() { this.router.navigate(['/shopping-list']); }

  forceRefresh(event: Event) {
    event.stopPropagation();
    window.location.reload();
  }

  handleImageError(event: any) {
    event.target.src = 'https://ui-avatars.com/api/?name=User&background=673ab7&color=fff';
  }
}