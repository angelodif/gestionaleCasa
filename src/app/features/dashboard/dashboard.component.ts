import { Component, inject, OnInit } from '@angular/core';
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
export class DashboardComponent implements OnInit {
  // Iniezioni
  authService = inject(AuthService);
  private router = inject(Router);
  private shiftService = inject(ShiftService);
  private mealService = inject(MealService); // Corretto qui

  // Proprietà
  upcomingShifts: any[] = [];
  displayDate = new Date();
  currentMealPlan: DayPlan | null = null;

  ngOnInit() {
    this.loadUpcomingDays();
    this.loadMealForDate(this.displayDate);
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
        label: data?.label || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
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

  // Navigazione
  goToProfile() { this.router.navigate(['/profile']); }
  goToPlanner() { this.router.navigate(['/planner']); }
  handleImageError(event: any) {
    event.target.src = 'https://ui-avatars.com/api/?name=User&background=673ab7&color=fff';
  }
}