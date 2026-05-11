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
import { Observable, combineLatest, map, of, switchMap, BehaviorSubject, shareReplay, firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, 
    MatInputModule, MatButtonModule, MatIconModule, MatDividerModule,
    MatProgressBarModule, MatSelectModule, MatDialogModule, MatTabsModule, MatChipsModule,
    BaseChartDirective
  ],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss'
})
export class FinanceComponent implements OnInit {
  private financeService = inject(FinanceService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  private monthYearSubject = new BehaviorSubject<string>(new Date().toISOString().slice(0, 7));
  private filterSubject = new BehaviorSubject<string>('Tutte');
  
  currentMonthYear = new Date().toISOString().slice(0, 7) + '-01';
  budget: Budget = {
    monthYear: this.currentMonthYear.slice(0, 7),
    totalLiquid: 0, totalVouchers: 0, remainingVouchers: 0
  };

  expenses$: Observable<Expense[]>;
  filteredExpenses$: Observable<Expense[]>;
  categories$: Observable<string[]>;
  budget$: Observable<Budget>;
  stats$: Observable<FinanceStats>;
  reportPeriod: 1 | 2 | 6 | 12 = 1;
  reportStats$: Observable<any> = of(null);
  
  selectedCategory: string = 'Tutte';
  categories: string[] = [];
  newCategory = '';

  // Chart Category Pie
  public pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true, 
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 15,
          font: { size: 11 }
        }
      },
      tooltip: { callbacks: { label: (context) => ` ${context.label}: ${context.parsed}€` } }
    }
  };
  public pieChartData: ChartData<'pie', number[], string> = {
    labels: [],
    datasets: [{ 
      data: [],
      backgroundColor: ['#3f51b5', '#ff4081', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#00bcd4', '#ffeb3b', '#795548', '#607d8b'],
      hoverOffset: 10
    }]
  };

  // Chart Gauge Budget (Doughnut half)
  public gaugeChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    circumference: 180,
    rotation: 270,
    cutout: '80%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    }
  };
  public gaugeChartData: ChartData<'doughnut', number[], string> = {
    labels: ['Speso', 'Residuo'],
    datasets: [{
      data: [0, 100],
      backgroundColor: ['#3f51b5', '#e0e0e0'],
      borderWidth: 0
    }]
  };

  constructor() {
    this.expenses$ = this.monthYearSubject.pipe(
      switchMap(month => this.financeService.getMonthlyExpenses(month)),
      shareReplay(1)
    );

    this.categories$ = this.financeService.getCategories().pipe(shareReplay(1));

    this.budget$ = this.monthYearSubject.pipe(
      switchMap(month => this.financeService.getBudget(month)),
      map(b => b || { monthYear: this.monthYearSubject.value, totalLiquid: 1200, totalVouchers: 100 }),
      shareReplay(1)
    );

    this.stats$ = combineLatest([this.expenses$, this.categories$, this.budget$]).pipe(
      map(([expenses, categories, budget]) => {
        this.budget = budget;
        const stats = this.calculateStats(expenses, categories);
        this.updateCharts(stats, budget);
        return stats;
      }),
      shareReplay(1)
    );

    this.filteredExpenses$ = combineLatest([this.expenses$, this.filterSubject]).pipe(
      map(([expenses, filter]) => {
        if (filter === 'Tutte') return expenses;
        return expenses.filter(e => e.category === filter);
      })
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

  setFilterCategory(cat: string) {
    this.selectedCategory = cat;
    this.filterSubject.next(cat);
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

  private updateCharts(stats: FinanceStats, currentBudget: Budget) {
    // Update Pie Chart
    const labels = Object.keys(stats.byCategory).filter(cat => stats.byCategory[cat] > 0);
    const data = labels.map(cat => stats.byCategory[cat]);
    
    this.pieChartData = {
      ...this.pieChartData,
      labels: labels,
      datasets: [{ ...this.pieChartData.datasets[0], data: data }]
    };

    // Update Gauge Chart
    const totalBudget = currentBudget.totalLiquid || 1200;
    const spent = stats.liquidSpent;
    const remaining = Math.max(0, totalBudget - spent);
    const overBudget = Math.max(0, spent - totalBudget);

    let color = '#3f51b5'; // Indigo
    const percent = (spent / totalBudget) * 100;
    if (percent > 90) color = '#f44336'; // Red
    else if (percent > 70) color = '#ff9800'; // Orange

    this.gaugeChartData = {
      labels: overBudget > 0 ? ['Speso', 'Eccesso'] : ['Speso', 'Residuo'],
      datasets: [{
        data: overBudget > 0 ? [totalBudget, overBudget] : [spent, remaining],
        backgroundColor: overBudget > 0 ? ['#f44336', '#b71c1c'] : [color, '#e0e0e0'],
        borderWidth: 0
      }]
    };
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
    if (confirm('Sei sicuro di voler aggiornare il budget?')) {
      await this.financeService.saveBudget(this.budget);
      alert('Budget aggiornato!');
    }
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

  async exportPDF() {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Titolo
    const [year, month] = this.monthYearSubject.value.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthYearStr = dateObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    
    doc.setFontSize(18);
    doc.text(`Resoconto Spese - ${monthYearStr.toUpperCase()}`, 14, 20);
    
    // Stats e budget
    const expenses = await firstValueFrom(this.expenses$);
    const stats = this.calculateStats(expenses, this.categories);
    
    doc.setFontSize(12);
    doc.text(`Budget Liquidità: ${this.budget.totalLiquid.toFixed(2)} EUR - Speso: ${stats.liquidSpent.toFixed(2)} EUR`, 14, 30);
    doc.text(`Budget Buoni: ${this.budget.totalVouchers.toFixed(2)} EUR - Speso: ${stats.voucherSpent.toFixed(2)} EUR`, 14, 37);
    doc.text(`Spese Extra: ${stats.extraBudgetSpent.toFixed(2)} EUR`, 14, 44);
    doc.text(`Totale Speso: ${stats.totalSpent.toFixed(2)} EUR`, 14, 51);

    // Tabella spese per categoria
    const catData = Object.entries(stats.byCategory)
      .filter(([_, value]) => (value as number) > 0)
      .map(([cat, value]) => [cat, `${(value as number).toFixed(2)} EUR`]);
      
    autoTable(doc, {
      startY: 60,
      head: [['Categoria', 'Importo Totale']],
      body: catData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] }
    });

    // Tabella dettaglio spese
    const detailData = expenses.map(e => {
      const dateStr = new Date(e.date).toLocaleDateString('it-IT') + ' ' + new Date(e.date).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
      return [
        dateStr,
        e.category || 'Altro',
        e.user || '-',
        e.note || '-',
        e.useBudget === false ? 'Sì' : 'No',
        `${e.totalAmount.toFixed(2)} EUR`
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data', 'Categoria', 'Utente', 'Note', 'Extra Budget', 'Importo']],
      body: detailData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] }
    });

    doc.save(`Resoconto_${monthYearStr.replace(' ', '_')}.pdf`);
  }
}
