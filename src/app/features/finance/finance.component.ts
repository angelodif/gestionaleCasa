import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
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
import { NotificationService } from '../../services/notification/notification.service';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

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
  private notification = inject(NotificationService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  // Signals State
  monthYear = signal<string>(new Date().toISOString().slice(0, 7));
  selectedCategory = signal<string>('Tutte');
  reportPeriod = signal<1 | 2 | 6 | 12>(1);
  
  expenses = signal<Expense[]>([]);
  categories = signal<string[]>([]);
  budget = signal<Budget>({
    monthYear: new Date().toISOString().slice(0, 7),
    totalLiquid: 1200, totalVouchers: 100, remainingVouchers: 100
  });

  // Computed Signals
  filteredExpenses = computed(() => {
    const filter = this.selectedCategory();
    const all = this.expenses();
    if (filter === 'Tutte') return all;
    return all.filter(e => e.category === filter);
  });

  stats = computed(() => {
    return this.calculateStats(this.expenses(), this.categories());
  });

  // Chart Data
  public pieChartData: ChartData<'pie', number[], string> = {
    labels: [],
    datasets: [{ 
      data: [],
      backgroundColor: ['#3f51b5', '#ff4081', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#00bcd4', '#ffeb3b', '#795548', '#607d8b'],
      hoverOffset: 10
    }]
  };

  public gaugeChartData: ChartData<'doughnut', number[], string> = {
    labels: ['Speso', 'Residuo'],
    datasets: [{
      data: [0, 100],
      backgroundColor: ['#3f51b5', '#e0e0e0'],
      borderWidth: 0,
      circumference: 180,
      rotation: 270,
    }]
  };

  public pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true, 
        position: 'bottom',
        labels: { boxWidth: 12, padding: 15, font: { size: 11 } }
      }
    }
  };

  public gaugeChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '80%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  };

  constructor() {
    // Effect to reload data when month changes
    effect(() => {
      const month = this.monthYear();
      this.loadMonthData(month);
    });

    // Effect to update charts when stats or budget change
    effect(() => {
      this.updateCharts(this.stats(), this.budget());
    });
  }

  ngOnInit() {
    this.financeService.getCategories().subscribe(cats => this.categories.set(cats));
  }

  async loadMonthData(month: string) {
    try {
      await this.financeService.initializeMonth(month);
      const b = await this.financeService.getBudget(month);
      if (b) this.budget.set(b);
      else this.budget.set({ monthYear: month, totalLiquid: 1200, totalVouchers: 100, remainingVouchers: 100 });

      this.financeService.getMonthlyExpenses(month).subscribe(data => {
        this.expenses.set(data);
      });
    } catch (error: any) {
      this.notification.showError('Errore caricamento dati mese.');
    }
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
      if (e.useBudget === false) stats.extraBudgetSpent += e.liquidAmount;
      else stats.liquidSpent += e.liquidAmount;
    });
    const values = Object.values(stats.byCategory) as number[];
    stats.maxCatValue = values.length ? Math.max(...values) : 0;
    return stats;
  }

  private updateCharts(stats: FinanceStats, currentBudget: Budget) {
    const labels = Object.keys(stats.byCategory).filter(cat => stats.byCategory[cat] > 0);
    const data = labels.map(cat => stats.byCategory[cat]);
    this.pieChartData = {
      ...this.pieChartData,
      labels: labels,
      datasets: [{ ...this.pieChartData.datasets[0], data: data }]
    };

    const totalLiquid = currentBudget.totalLiquid || 1200;
    const spent = stats.liquidSpent;
    const remaining = Math.max(0, totalLiquid - spent);
    const over = Math.max(0, spent - totalLiquid);

    let color = '#3f51b5';
    const percent = (spent / totalLiquid) * 100;
    if (percent > 90) color = '#f44336';
    else if (percent > 70) color = '#ff9800';

    this.gaugeChartData = {
      labels: over > 0 ? ['Speso', 'Eccesso'] : ['Speso', 'Residuo'],
      datasets: [{
        data: over > 0 ? [totalLiquid, over] : [spent, remaining],
        backgroundColor: over > 0 ? ['#f44336', '#b71c1c'] : [color, '#e0e0e0'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270
      }]
    };
  }

  changeMonth(delta: number) {
    const [year, month] = this.monthYear().split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1, 12, 0, 0);
    this.monthYear.set(date.toISOString().slice(0, 7));
  }

  async saveBudget() {
    if (confirm('Aggiornare il budget?')) {
      try {
        await this.financeService.saveBudget(this.budget());
        this.notification.showSuccess('Budget aggiornato!');
      } catch (error: any) {}
    }
  }

  addManualExpense() {
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: { category: 'Altro' }
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await this.financeService.addExpense(result);
          this.notification.showSuccess('Spesa registrata!');
        } catch (error: any) {}
      }
    });
  }

  async deleteExpense(expense: Expense) {
    if (confirm(`Eliminare spesa di ${expense.totalAmount}€?`)) {
      try {
        if (expense.id) {
          await this.financeService.deleteExpense(expense.id);
          this.notification.showSuccess('Spesa eliminata.');
        }
      } catch (error: any) {}
    }
  }

  openRecurringDialog() {
    this.dialog.open(RecurringExpensesDialogComponent, { width: '95vw', maxWidth: '600px' });
  }

  getCategoryIcon(cat: string): string {
    return FINANCE_CATEGORY_ICONS[cat] || 'receipt';
  }

  getPercentage(spent: any, total: any): number {
    const t = Number(total) || 0;
    return t > 0 ? Math.min((Number(spent) / t) * 100, 100) : 0;
  }

  async addCategory(newCat: string) {
    if (newCat.trim()) {
      try {
        const updated = [...this.categories(), newCat.trim()];
        await this.financeService.saveCategories(updated);
        this.categories.set(updated);
        this.notification.showSuccess('Categoria aggiunta!');
      } catch (error: any) {}
    }
  }

  async removeCategory(category: string) {
    if (confirm(`Eliminare categoria "${category}"?`)) {
      try {
        const updated = this.categories().filter(c => c !== category);
        await this.financeService.saveCategories(updated);
        this.categories.set(updated);
        this.notification.showSuccess('Categoria eliminata.');
      } catch (error: any) {}
    }
  }

  async exportPDF() {
    const doc = new jsPDF('p', 'mm', 'a4');
    const month = this.monthYear();
    const [year, m] = month.split('-');
    const dateObj = new Date(parseInt(year), parseInt(m) - 1, 1);
    const monthYearStr = dateObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    
    doc.setFontSize(18);
    doc.text(`Resoconto Spese - ${monthYearStr.toUpperCase()}`, 14, 20);
    
    const curStats = this.stats();
    const curBudget = this.budget();

    doc.setFontSize(12);
    doc.text(`Budget Liquidità: ${curBudget.totalLiquid.toFixed(2)} EUR - Speso: ${curStats.liquidSpent.toFixed(2)} EUR`, 14, 30);
    doc.text(`Budget Buoni: ${curBudget.totalVouchers.toFixed(2)} EUR - Speso: ${curStats.voucherSpent.toFixed(2)} EUR`, 14, 37);
    doc.text(`Totale Speso: ${curStats.totalSpent.toFixed(2)} EUR`, 14, 51);

    const catData = Object.entries(curStats.byCategory)
      .filter(([_, value]) => (value as number) > 0)
      .map(([cat, value]) => [cat, `${(value as number).toFixed(2)} EUR`]);
      
    autoTable(doc, {
      startY: 60,
      head: [['Categoria', 'Importo Totale']],
      body: catData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] }
    });

    const expenses = this.expenses();
    const detailData = expenses.map(e => [
      new Date(e.date).toLocaleDateString('it-IT'),
      e.category || 'Altro',
      e.user || '-',
      e.note || '-',
      e.useBudget === false ? 'Sì' : 'No',
      `${e.totalAmount.toFixed(2)} EUR`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data', 'Categoria', 'Utente', 'Note', 'Extra Budget', 'Importo']],
      body: detailData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] }
    });

    doc.save(`Resoconto_${monthYearStr.replace(' ', '_')}.pdf`);
  }

  asNumber(val: any): number { return Number(val) || 0; }
  goBack() { this.router.navigate(['/dashboard']); }
}
