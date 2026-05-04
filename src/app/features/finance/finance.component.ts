import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RecordExpenseDialogComponent } from '../../shared/record-expense-dialog/record-expense-dialog.component';
import { RecurringExpensesDialogComponent } from '../../shared/recurring-expenses-dialog/recurring-expenses-dialog.component';
import { FinanceService, Budget, Expense, FinanceStats, FINANCE_CATEGORY_ICONS } from '../../services/finance/finance.service';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { Observable, combineLatest, map, of, switchMap, BehaviorSubject, shareReplay } from 'rxjs';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, 
    MatInputModule, MatButtonModule, MatIconModule, MatDividerModule,
    MatProgressBarModule, MatSelectModule, MatDialogModule, MatTabsModule, MatChipsModule
  ],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss'
})
export class FinanceComponent implements OnInit {
  private financeService = inject(FinanceService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  private monthYearSubject = new BehaviorSubject<string>(new Date().toISOString().slice(0, 7));
  
  currentMonthYear = new Date().toISOString().slice(0, 7) + '-01';
  budget: Budget = {
    monthYear: this.currentMonthYear.slice(0, 7),
    totalLiquid: 0, totalVouchers: 0, remainingVouchers: 0
  };

  expenses$: Observable<Expense[]>;
  categories$: Observable<string[]>;
  stats$: Observable<FinanceStats>;
  reportPeriod: 1 | 2 | 6 | 12 = 1;
  reportStats$: Observable<any> = of(null);
  
  categories: string[] = [];
  newCategory = '';

  constructor() {
    this.expenses$ = this.monthYearSubject.pipe(
      switchMap(month => this.financeService.getMonthlyExpenses(month)),
      shareReplay(1)
    );

    this.categories$ = this.financeService.getCategories().pipe(shareReplay(1));

    this.stats$ = combineLatest([this.expenses$, this.categories$]).pipe(
      map(([expenses, categories]) => this.calculateStats(expenses, categories)),
      shareReplay(1)
    );

    this.reportStats$ = combineLatest([this.monthYearSubject, this.categories$]).pipe(
      switchMap(([current, categories]) => {
        const monthsToFetch = this.reportPeriod;
        const [year, month] = current.split('-').map(Number);
        const startDate = new Date(year, month - monthsToFetch, 1);
        const startKey = startDate.toISOString().slice(0, 7);
        
        return this.financeService.getRangeExpenses(startKey, current).pipe(
          map(expenses => this.calculateStats(expenses, categories))
        );
      }),
      shareReplay(1)
    );
  }

  setReportPeriod(months: 1 | 2 | 6 | 12) {
    this.reportPeriod = months;
    this.monthYearSubject.next(this.monthYearSubject.value); // Trigger refresh
  }

  private calculateStats(expenses: Expense[], categories: string[]): FinanceStats {
    const stats: FinanceStats = {
      totalSpent: 0, byCategory: {}, liquidSpent: 0, voucherSpent: 0, extraBudgetSpent: 0, maxCatValue: 0
    };
    categories.forEach(cat => stats.byCategory[cat] = 0);
    expenses.forEach(e => {
      stats.totalSpent += e.totalAmount;
      const cat = e.category || 'Altro';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + e.totalAmount;
      stats.voucherSpent += e.voucherAmount;
      
      if (e.useBudget === false) {
        stats.extraBudgetSpent += e.liquidAmount;
      } else {
        stats.liquidSpent += e.liquidAmount;
      }
    });
    const values = Object.values(stats.byCategory) as number[];
    stats.maxCatValue = values.length ? Math.max(...values) : 0;
    return stats;
  }

  ngOnInit() {
    this.initializeAndLoad();
    this.financeService.getCategories().subscribe(cats => {
      this.categories = cats;
    });
  }

  async initializeAndLoad() {
    const currentMonth = this.monthYearSubject.value;
    await this.financeService.initializeMonth(currentMonth);
    await this.loadBudget();
  }

  async loadBudget() {
    const monthKey = this.monthYearSubject.value;
    const existingBudget = await this.financeService.getBudget(monthKey);
    if (existingBudget) {
      this.budget = existingBudget;
    } else {
      this.budget = {
        monthYear: monthKey,
        totalLiquid: 1200, totalVouchers: 100, remainingVouchers: 100
      };
    }
  }

  changeMonth(delta: number) {
    const [year, month] = this.monthYearSubject.value.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1, 12, 0, 0);
    const newMonthKey = date.toISOString().slice(0, 7);
    
    this.monthYearSubject.next(newMonthKey);
    this.currentMonthYear = newMonthKey + '-01';
    this.initializeAndLoad();
  }

  async saveBudget() {
    await this.financeService.saveBudget(this.budget);
    alert('Budget aggiornato!');
  }

  addManualExpense() {
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: { category: 'Altro' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        await this.financeService.addExpense(result);
      }
    });
  }

  async deleteExpense(expense: Expense) {
    if (confirm(`Sei sicuro di voler eliminare la spesa di ${expense.totalAmount}€ (${expense.category})?`)) {
      if (expense.id) {
        await this.financeService.deleteExpense(expense.id);
      }
    }
  }

  openRecurringDialog() {
    this.dialog.open(RecurringExpensesDialogComponent, {
      width: '95vw', maxWidth: '600px'
    });
  }

  getCategoryIcon(cat: string): string {
    return FINANCE_CATEGORY_ICONS[cat] || 'receipt';
  }

  getPercentage(spent: any, total: any): number {
    const s = Number(spent) || 0;
    const t = Number(total) || 0;
    return t > 0 ? Math.min((s / t) * 100, 100) : 0;
  }

  async addCategory() {
    if (this.newCategory.trim()) {
      const updated = [...this.categories, this.newCategory.trim()];
      await this.financeService.saveCategories(updated);
      this.newCategory = '';
    }
  }

  async removeCategory(category: string) {
    if (confirm(`Sei sicuro di voler eliminare la categoria "${category}"?`)) {
      const updated = this.categories.filter(c => c !== category);
      await this.financeService.saveCategories(updated);
    }
  }

  asNumber(val: any): number { return Number(val) || 0; }
  goBack() { this.router.navigate(['/dashboard']); }
}
