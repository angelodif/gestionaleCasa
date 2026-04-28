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

  async autoFillFromHistory() {
    this.snackBar.open('Analisi intelligente in corso (3 settimane + turni)...', 'Chiudi', { duration: 2000 });
    
    const historyWeeks: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const prevDate = new Date(this.currentDate);
      prevDate.setDate(prevDate.getDate() - (i * 7));
      historyWeeks.push(this.generateWeekId(prevDate));
    }

    // Struttura per mappare la storia: giorno -> pasto -> utente -> lista di {main, details, isOut}
    const historyData: any = {};
    const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    
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
      
      if (bestMainKey === '__OUT__') {
        return { main: '', details: '', isOut: true };
      }

      const detailsCounts = history
        .filter(h => h.main === bestMainKey)
        .reduce((acc, val) => {
          const dKey = val.details || '';
          acc[dKey] = (acc[dKey] || 0) + 1;
          return acc;
        }, {} as any);
      
      const dKeys = Object.keys(detailsCounts);
      const bestDetails = dKeys.length > 0 
        ? dKeys.reduce((a, b) => detailsCounts[a] > detailsCounts[b] ? a : b)
        : '';

      return { main: bestMainKey, details: bestDetails, isOut: false };
    };

    let count = 0;
    for (const day of dayNames) {
      const currentPlan = this.allDaysPlans[day];
      const history = historyData[day];
      const shift = this.weekShifts[day.toLowerCase()];
      let dayModified = false;

      // Metodo interno per processare un pasto (pranzo o cena)
      const processMeal = (type: 'lunch' | 'dinner') => {
        const meal = currentPlan[type];
        
        // Se il pasto è già compilato (almeno per Angelo), saltiamo
        if (meal.angelo.main || meal.angelo.isOut) return;

        const suggA = getSmartSuggestion(history[type].angelo);
        const suggD = getSmartSuggestion(history[type].daiana);

        if (suggA || suggD) {
          const finalA = (suggA || suggD)!;
          const finalD = (suggD || suggA)!;

          meal.angelo = { ...finalA };
          meal.daiana = { ...finalD };

          // Forza lo split se i suggerimenti sono diversi o se Angelo è in ufficio (solo a pranzo)
          const needsSplit = (type === 'lunch' && shift?.angeloInOffice) || 
                             (finalA.main !== finalD.main || finalA.isOut !== finalD.isOut || finalA.details !== finalD.details);
          
          this.isSplit[day][type] = needsSplit;
          dayModified = true;
          count++;
        }
      };

      processMeal('lunch');
      processMeal('dinner');
      
      if (dayModified) {
        await this.save(day);
      }
    }

    if (count > 0) {
      this.snackBar.open(`Menù ottimizzato con ${count} suggerimenti completi (inclusi extra e turni ufficio)!`, 'Ottimo', { duration: 4000 });
    } else {
      this.snackBar.open('Dati insufficienti nelle ultime 3 settimane per automatizzare.', 'OK', { duration: 3000 });
    }
  }

  isPastWeek(): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Trova l'ultimo giorno della settimana visualizzata (Domenica)
    const lastDayOfWeek = new Date(this.weekDaysData[6]?.date);
    if (!lastDayOfWeek) return false;
    lastDayOfWeek.setHours(23, 59, 59, 999);

    return lastDayOfWeek < today;
  }

    goBack(){
    this.router.navigate(['/dashboard']);
  }
}