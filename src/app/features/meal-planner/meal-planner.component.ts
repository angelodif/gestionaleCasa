import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MealService, DayPlan, Meal } from '../../services/meal/meal.service';
import { ShiftService } from '../../services/shift/shift.service';
import { ShoppingListService } from '../../services/shopping/shopping.service';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

registerLocaleData(localeIt); // Registra il locale italiano

type MealType = 'lunch' | 'dinner';

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatDividerModule, MatSnackBarModule, MatDialogModule,
    MatTooltipModule
  ],
  templateUrl: './meal-planner.component.html',
  styleUrl: './meal-planner.component.scss'
})
export class MealPlannerComponent implements OnInit {
  private mealService = inject(MealService);
  private shiftService = inject(ShiftService);
  private shoppingService = inject(ShoppingListService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  weekDaysData: { name: string, date: Date }[] = [];
  currentDate = new Date();
  weekId = '';
  weekRangeLabel = '';
  
  allDaysPlans: { [key: string]: DayPlan } = {};
  isSplit: { [key: string]: { lunch: boolean, dinner: boolean } } = {};
  weekShifts: { [key: string]: any } = {};

  async ngOnInit() {
    await this.loadWeek(this.currentDate);
  }

  async loadWeek(date: Date) {
    this.weekId = this.generateWeekId(date);
    this.weekRangeLabel = this.getWeekRangeLabel(date);
    this.generateWeekDays(date);

    for (const day of this.weekDaysData) {
      const plan = await this.mealService.getDayPlan(this.weekId, day.name);
      this.allDaysPlans[day.name] = plan;
      this.isSplit[day.name] = { 
        lunch: this.checkIfSplit(plan.lunch), 
        dinner: this.checkIfSplit(plan.dinner) 
      };
    }

    // Carica i turni della settimana
    const assignments = await firstValueFrom(this.shiftService.getWeeklyPlanner(this.weekId));
    this.weekShifts = assignments.reduce((acc, curr: any) => {
      acc[curr.id.toLowerCase()] = curr;
      return acc;
    }, {});
  }

  generateWeekDays(d: Date) {
    const start = new Date(d);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(start.setDate(diff));

    const names = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    this.weekDaysData = names.map((name, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { name, date };
    });
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  changeWeek(delta: number) {
    this.currentDate.setDate(this.currentDate.getDate() + (delta * 7));
    this.loadWeek(new Date(this.currentDate));
  }

  getWeekRangeLabel(d: Date): string {
    const start = new Date(d);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const firstDay = new Date(start.setDate(diff));
    const lastDay = new Date(start.setDate(diff + 6));
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `Dal ${firstDay.toLocaleDateString('it-IT', options)} al ${lastDay.toLocaleDateString('it-IT', options)}`;
  }

  generateWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }

  checkIfSplit(mealPair: { angelo: Meal, daiana: Meal }): boolean {
    if (!mealPair) return false;
    return mealPair.angelo.main !== mealPair.daiana.main || 
           mealPair.angelo.details !== mealPair.daiana.details ||
           mealPair.angelo.isOut !== mealPair.daiana.isOut;
  }

  syncMeals(dayName: string, type: MealType) {
    if (!this.isSplit[dayName][type]) {
      const meal = this.allDaysPlans[dayName][type].angelo;
      this.allDaysPlans[dayName][type].daiana.main = meal.main;
      this.allDaysPlans[dayName][type].daiana.details = meal.details;
      this.allDaysPlans[dayName][type].daiana.isOut = meal.isOut;
    }
    this.save(dayName);
  }

  toggleOut(dayName: string, type: 'lunch' | 'dinner', user: 'angelo' | 'daiana') {
    const meal = this.allDaysPlans[dayName]?.[type]?.[user];
    if (meal) {
      meal.isOut = !meal.isOut;
      if (meal.isOut) {
        meal.details = '';
      }
      this.syncMeals(dayName, type);
    }
  }

  toggleSplit(dayName: string, type: 'lunch' | 'dinner') {
    this.isSplit[dayName][type] = !this.isSplit[dayName][type];
    if (!this.isSplit[dayName][type]) this.syncMeals(dayName, type);
  }

  async save(day: string) {
    await this.mealService.saveDayPlan(this.weekId, day, this.allDaysPlans[day]);
  }

  getShiftTooltip(dayName: string): string {
    const shift = this.weekShifts[dayName.toLowerCase()];
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
          this.snackBar.open(`"${result.itemName}" aggiunto in ${result.shopName}!`, 'OK', { duration: 2000 });
        } catch (e) {
          this.snackBar.open('Errore salvataggio prodotto', 'OK', { duration: 2000 });
        }
      }
    });
  }

    goBack(){
    this.router.navigate(['/dashboard']);
  }
}