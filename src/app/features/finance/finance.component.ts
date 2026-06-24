import { Component, inject, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { RecordExpenseDialogComponent } from '../../shared/record-expense-dialog/record-expense-dialog.component';
import { RecurringExpensesDialogComponent } from '../../shared/recurring-expenses-dialog/recurring-expenses-dialog.component';
import { FinanceService, Budget, Expense, FinanceStats, FINANCE_CATEGORY_ICONS } from '../../services/finance/finance.service';
import { NotificationService } from '../../services/notification/notification.service';
import { ConfirmService } from '../../services/confirm/confirm.service';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom, Subscription } from 'rxjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatDividerModule,
    MatProgressBarModule, MatSelectModule, MatDialogModule, MatTabsModule, MatChipsModule,
    MatTooltipModule, BaseChartDirective
  ],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanceComponent implements OnInit, OnDestroy {
  private financeService = inject(FinanceService);
  notification = inject(NotificationService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);

  // Signals State
  monthYear = signal<string>(new Date().toISOString().slice(0, 7));
  selectedCategory = signal<string>('Tutte');
  reportPeriod = signal<1 | 2 | 6 | 12>(1);

  expenses = signal<Expense[]>([]);
  angeloExpenses = signal<Expense[]>([]);
  daianaExpenses = signal<Expense[]>([]);
  personalExpenses = computed(() => {
    return this.selectedPersonalUser() === 'Angelo' ? this.angeloExpenses() : this.daianaExpenses();
  });
  selectedPersonalUser = signal<'Angelo' | 'Daiana'>('Angelo');
  activeTabIndex = signal<number>(0);
  categories = signal<string[]>([]);
  budget = signal<Budget>({
    monthYear: new Date().toISOString().slice(0, 7),
    totalLiquid: 1200, totalVouchers: 100, remainingVouchers: 100
  });

  // Range State for Reports
  rangeExpenses = signal<Expense[]>([]);
  rangeBudgets = signal<Budget[]>([]);

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

  personalExpensesTotal = computed(() => {
    return this.personalExpenses().reduce((sum, e) => sum + e.totalAmount, 0);
  });

  angeloStats = computed(() => {
    const expenses = this.angeloExpenses();
    const categories = this.categories();
    const stats = {
      byCategory: {} as { [key: string]: number },
      maxCatValue: 0
    };
    categories.forEach(cat => stats.byCategory[cat] = 0);
    expenses.forEach(e => {
      const cat = e.category || 'Altro';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + e.totalAmount;
    });
    const values = Object.values(stats.byCategory) as number[];
    stats.maxCatValue = values.length ? Math.max(...values) : 0;
    return stats;
  });

  daianaStats = computed(() => {
    const expenses = this.daianaExpenses();
    const categories = this.categories();
    const stats = {
      byCategory: {} as { [key: string]: number },
      maxCatValue: 0
    };
    categories.forEach(cat => stats.byCategory[cat] = 0);
    expenses.forEach(e => {
      const cat = e.category || 'Altro';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + e.totalAmount;
    });
    const values = Object.values(stats.byCategory) as number[];
    stats.maxCatValue = values.length ? Math.max(...values) : 0;
    return stats;
  });

  angeloPieChartData = computed<ChartData<'pie', number[], string>>(() => {
    const stats = this.angeloStats();
    const labels = Object.keys(stats.byCategory).filter(cat => stats.byCategory[cat] > 0);
    const data = labels.map(cat => stats.byCategory[cat]);
    return {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#3f51b5', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#00bcd4', '#ffeb3b', '#795548', '#607d8b'],
        hoverOffset: 10
      }]
    };
  });

  daianaPieChartData = computed<ChartData<'pie', number[], string>>(() => {
    const stats = this.daianaStats();
    const labels = Object.keys(stats.byCategory).filter(cat => stats.byCategory[cat] > 0);
    const data = labels.map(cat => stats.byCategory[cat]);
    return {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#ff4081', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#00bcd4', '#ffeb3b', '#795548', '#607d8b'],
        hoverOffset: 10
      }]
    };
  });

  personalStats = computed(() => {
    return this.selectedPersonalUser() === 'Angelo' ? this.angeloStats() : this.daianaStats();
  });

  personalPieChartData = computed<ChartData<'pie', number[], string>>(() => {
    return this.selectedPersonalUser() === 'Angelo' ? this.angeloPieChartData() : this.daianaPieChartData();
  });

  reportStats = computed(() => {
    const expenses = this.rangeExpenses();
    const cats = this.categories();
    return this.calculateRangeStats(expenses, cats);
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

  public trendChartData: ChartData<'line', number[], string> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Spese Totali',
        borderColor: '#3f51b5',
        backgroundColor: 'rgba(63, 81, 181, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  // Dynamic Category Charts
  categoryCharts = signal<{ category: string, data: ChartData<'line', number[], string> }[]>([]);
  extraBudgetChart = signal<ChartData<'line', number[], string> | null>(null);

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

  public trendChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => context.parsed.y !== null ? ` ${context.parsed.y.toFixed(2)} €` : ''
        }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { display: false } },
      x: { grid: { display: false } }
    }
  };

  public smallTrendOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => context.parsed.y !== null ? ` ${context.parsed.y.toFixed(2)} €` : ''
        }
      }
    },
    scales: {
      y: { display: false, beginAtZero: true },
      x: { grid: { display: false } }
    }
  };

  private monthlySub?: Subscription;
  private angeloSub?: Subscription;
  private daianaSub?: Subscription;

  constructor() {
    // Effect to reload data when month changes
    effect(() => {
      const month = this.monthYear();
      this.loadMonthData(month);
    });

    // Effect to reload personal data when month changes
    effect(() => {
      const month = this.monthYear();
      this.loadPersonalMonthData(month);
    });

    // Effect to reload range data for reports
    effect(() => {
      const month = this.monthYear();
      const period = this.reportPeriod();
      this.loadRangeData(month, period);
    });

    // Effect to update charts when stats or budget change
    effect(() => {
      this.updateCharts(this.stats(), this.budget());
    });

    // Effect to update report charts
    effect(() => {
      this.updateReportCharts(this.reportStats());
    });
  }

  ngOnInit() {
    this.financeService.getCategories().subscribe(cats => this.categories.set(cats));

    // Preseleziona l'utente in base al nome dell'utente loggato
    const displayName = (this.authService.getCurrentUser()?.displayName || '').toLowerCase();
    if (displayName.startsWith('daiana')) {
      this.selectedPersonalUser.set('Daiana');
    } else if (displayName.startsWith('angelo')) {
      this.selectedPersonalUser.set('Angelo');
    }
    // Se nessun match, rimane il default 'Angelo'
  }

  ngOnDestroy() {
    if (this.monthlySub) this.monthlySub.unsubscribe();
    if (this.angeloSub) this.angeloSub.unsubscribe();
    if (this.daianaSub) this.daianaSub.unsubscribe();
  }

  async loadMonthData(month: string) {
    try {
      await this.financeService.initializeMonth(month);
      const b = await this.financeService.getBudget(month);
      if (b) this.budget.set(b);
      else this.budget.set({ monthYear: month, totalLiquid: 1200, totalVouchers: 100, remainingVouchers: 100 });

      if (this.monthlySub) this.monthlySub.unsubscribe();
      this.monthlySub = this.financeService.getMonthlyExpenses(month).subscribe(data => {
        this.expenses.set(data);
      });
    } catch (error: any) {
      this.notification.showError('Errore caricamento dati mese.');
    }
  }

  loadPersonalMonthData(month: string) {
    if (this.angeloSub) this.angeloSub.unsubscribe();
    this.angeloSub = this.financeService.getPersonalExpenses(month, 'Angelo').subscribe(data => {
      this.angeloExpenses.set(data);
    });

    if (this.daianaSub) this.daianaSub.unsubscribe();
    this.daianaSub = this.financeService.getPersonalExpenses(month, 'Daiana').subscribe(data => {
      this.daianaExpenses.set(data);
    });
  }

  async loadRangeData(currentMonth: string, periodMonths: number) {
    try {
      const [year, month] = currentMonth.split('-').map(Number);
      const endDate = new Date(year, month - 1, 1);
      const startDate = new Date(year, month - periodMonths, 1);

      const startMonthStr = startDate.toISOString().slice(0, 7);
      const endMonthStr = endDate.toISOString().slice(0, 7);

      this.financeService.getRangeExpenses(startMonthStr, endMonthStr).subscribe(data => {
        this.rangeExpenses.set(data);
      });

      const budgets = await this.financeService.getRangeBudgets(startMonthStr, endMonthStr);
      this.rangeBudgets.set(budgets);
    } catch (error: any) {
      this.notification.showError('Errore caricamento dati analisi.');
    }
  }

  private calculateStats(expenses: Expense[], categories: string[]): FinanceStats {
    const stats: FinanceStats = {
      totalSpent: 0, byCategory: {}, liquidSpent: 0, voucherSpent: 0, extraBudgetSpent: 0, extraBudgetAngelo: 0, extraBudgetDaiana: 0, maxCatValue: 0
    };
    categories.forEach(cat => stats.byCategory[cat] = 0);
    expenses.forEach(e => {
      stats.totalSpent += e.totalAmount;
      const cat = e.category || 'Altro';
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + e.totalAmount;
      stats.voucherSpent += e.voucherAmount;
      if (e.useBudget === false) {
        stats.extraBudgetSpent += e.liquidAmount;
        if (e.user === 'Angelo') {
          stats.extraBudgetAngelo = (stats.extraBudgetAngelo || 0) + e.liquidAmount;
        } else if (e.user === 'Daiana') {
          stats.extraBudgetDaiana = (stats.extraBudgetDaiana || 0) + e.liquidAmount;
        }
      }
      else stats.liquidSpent += e.liquidAmount;
    });
    const values = Object.values(stats.byCategory) as number[];
    stats.maxCatValue = values.length ? Math.max(...values) : 0;
    return stats;
  }

  private calculateRangeStats(expenses: Expense[], categories: string[]) {
    const stats = {
      totalSpent: 0,
      avgSpent: 0,
      byCategory: {} as { [key: string]: number },
      byMonth: {} as { [key: string]: number },
      byMonthByCategory: {} as { [cat: string]: { [month: string]: number } },
      byMonthExtraBudget: {} as { [month: string]: number },
      maxMonthValue: 0,
      maxMonthName: '',
      periodMonths: this.reportPeriod()
    };

    categories.forEach(cat => {
      stats.byCategory[cat] = 0;
      stats.byMonthByCategory[cat] = {};
    });

    expenses.forEach(e => {
      stats.totalSpent += e.totalAmount;

      const cat = e.category || 'Altro';
      if (!stats.byMonthByCategory[cat]) stats.byMonthByCategory[cat] = {};

      const date = new Date(e.date);
      const mKey = date.toISOString().slice(0, 7);

      // Totals
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + e.totalAmount;
      stats.byMonth[mKey] = (stats.byMonth[mKey] || 0) + e.totalAmount;

      // Trends per category
      stats.byMonthByCategory[cat][mKey] = (stats.byMonthByCategory[cat][mKey] || 0) + e.totalAmount;

      // Extra budget trend
      if (e.useBudget === false) {
        stats.byMonthExtraBudget[mKey] = (stats.byMonthExtraBudget[mKey] || 0) + e.totalAmount;
      }
    });

    stats.avgSpent = stats.totalSpent / stats.periodMonths;

    const monthValues = Object.entries(stats.byMonth);
    if (monthValues.length > 0) {
      const max = monthValues.reduce((a, b) => a[1] > b[1] ? a : b);
      stats.maxMonthValue = max[1];
      stats.maxMonthName = max[0];
    }

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

  private updateReportCharts(stats: any) {
    const period = this.reportPeriod();
    const [year, month] = this.monthYear().split('-').map(Number);
    const months: string[] = [];

    // Genera la lista completa dei mesi nel periodo
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    const trendLabels = months.map(m => {
      const [y, mm] = m.split('-');
      const date = new Date(Number(y), Number(mm) - 1, 1);
      return date.toLocaleDateString('it-IT', { month: 'short' });
    });

    const trendData = months.map(m => stats.byMonth[m] || 0);

    // Main Trend Chart
    this.trendChartData = {
      labels: trendLabels,
      datasets: [{ ...this.trendChartData.datasets[0], data: trendData }]
    };

    // Category Trend Charts
    const catCharts: { category: string, data: ChartData<'line', number[], string> }[] = [];
    const colors = ['#3f51b5', '#ff4081', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#00bcd4', '#ffeb3b', '#795548', '#607d8b'];

    Object.keys(stats.byMonthByCategory).forEach((cat, idx) => {
      const catData = months.map(m => stats.byMonthByCategory[cat][m] || 0);
      const totalForCat = catData.reduce((a, b) => a + b, 0);

      if (totalForCat > 0) {
        catCharts.push({
          category: cat,
          data: {
            labels: trendLabels,
            datasets: [{
              data: catData,
              label: cat,
              borderColor: colors[idx % colors.length],
              backgroundColor: `${colors[idx % colors.length]}1A`,
              fill: true,
              tension: 0.4,
              pointRadius: 3, // Leggermente più grandi per visibilità
              pointHitRadius: 10
            }]
          }
        });
      }
    });
    this.categoryCharts.set(catCharts);

    // Extra Budget Chart
    const extraData = months.map(m => stats.byMonthExtraBudget[m] || 0);
    const totalExtra = extraData.reduce((a, b) => a + b, 0);

    if (totalExtra > 0) {
      this.extraBudgetChart.set({
        labels: trendLabels,
        datasets: [{
          data: extraData,
          label: 'Extra Budget',
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3
        }]
      });
    } else {
      this.extraBudgetChart.set(null);
    }
  }

  changeMonth(delta: number) {
    const [year, month] = this.monthYear().split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1, 12, 0, 0);
    this.monthYear.set(date.toISOString().slice(0, 7));
  }

  async saveBudget() {
    const ok = await this.confirmService.confirm({
      title: 'Aggiorna budget',
      message: 'Aggiornare il budget?',
      confirmLabel: 'Aggiorna'
    });
    if (!ok) return;
    try {
      await this.financeService.saveBudget(this.budget());
      this.notification.showSuccess('Budget aggiornato!');
    } catch (error: any) { }
  }

  addManualExpense() {
    const isPersonalTab = this.activeTabIndex() === 1;
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: {
        category: isPersonalTab ? 'Personale' : 'Altro',
        isPersonal: isPersonalTab,
        user: isPersonalTab ? this.selectedPersonalUser() : null
      }
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          if (isPersonalTab) {
            const user = result.user || this.selectedPersonalUser();
            await this.financeService.addPersonalExpense(user, result);
            this.notification.showSuccess('Spesa personale registrata!');
          } else {
            await this.financeService.addExpense(result);
            this.notification.showSuccess('Spesa registrata!');
          }
        } catch (error: any) { }
      }
    });
  }

  editExpense(expense: Expense) {
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: { ...expense }
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          if (result.id) {
            await this.financeService.updateExpense(result);
            this.notification.showSuccess('Spesa aggiornata!');
          } else {
            await this.financeService.addExpense(result);
            this.notification.showSuccess('Spesa registrata!');
          }
        } catch (error: any) { }
      }
    });
  }

  editPersonalExpense(expense: Expense) {
    const user = this.selectedPersonalUser();
    const dialogRef = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw', maxWidth: '450px',
      data: { ...expense, isPersonal: true, user }
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          if (result.id) {
            // Usa updatePersonalExpense: NON tocca la collezione condivisa 'expenses'
            await this.financeService.updatePersonalExpense(user, result);
            this.notification.showSuccess('Spesa personale aggiornata!');
          } else {
            await this.financeService.addPersonalExpense(user, result);
            this.notification.showSuccess('Spesa personale registrata!');
          }
        } catch (error: any) { }
      }
    });
  }

  async deleteExpense(expense: Expense) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina spesa',
      message: `Eliminare spesa di ${expense.totalAmount}€?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      if (expense.id) {
        await this.financeService.deleteExpense(expense.id);
        this.notification.showSuccess('Spesa eliminata.');
      }
    } catch (error: any) { }
  }

  async deletePersonalExpense(expense: Expense) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina spesa personale',
      message: `Eliminare spesa personale di ${expense.totalAmount}€?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      if (expense.id) {
        const user = this.selectedPersonalUser();
        await this.financeService.deletePersonalExpense(user, expense.id);
        this.notification.showSuccess('Spesa personale eliminata.');
      }
    } catch (error: any) { }
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
      } catch (error: any) { }
    }
  }

  async removeCategory(category: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina categoria',
      message: `Eliminare categoria "${category}"?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      const updated = this.categories().filter(c => c !== category);
      await this.financeService.saveCategories(updated);
      this.categories.set(updated);
      this.notification.showSuccess('Categoria eliminata.');
    } catch (error: any) { }
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

    const angeloPersonal = await firstValueFrom(this.financeService.getPersonalExpenses(month, 'Angelo'));
    const daianaPersonal = await firstValueFrom(this.financeService.getPersonalExpenses(month, 'Daiana'));
    const angeloTotal = angeloPersonal.reduce((sum, e) => sum + e.totalAmount, 0);
    const daianaTotal = daianaPersonal.reduce((sum, e) => sum + e.totalAmount, 0);

    doc.setFontSize(12);
    doc.text(`Budget Liquidità: ${curBudget.totalLiquid.toFixed(2)} EUR - Speso: ${curStats.liquidSpent.toFixed(2)} EUR`, 14, 30);
    doc.text(`Budget Buoni: ${curBudget.totalVouchers.toFixed(2)} EUR - Speso: ${curStats.voucherSpent.toFixed(2)} EUR`, 14, 37);
    doc.text(`Totale Speso Condiviso: ${curStats.totalSpent.toFixed(2)} EUR`, 14, 44);
    doc.text(`Totale Personale Angelo: ${angeloTotal.toFixed(2)} EUR`, 14, 51);
    doc.text(`Totale Personale Daiana: ${daianaTotal.toFixed(2)} EUR`, 14, 58);

    // Grafico a torta mensile (condiviso)
    const monthlyCanvas = document.getElementById('pdfMonthlyPieChart') as HTMLCanvasElement;
    if (monthlyCanvas) {
      try {
        const imgData = monthlyCanvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 145, 20, 42, 42);
      } catch (e) {
        console.error('Errore nell\'esportazione del grafico mensile', e);
      }
    }

    // Calcola per ogni categoria: quota budget mensile, extra Angelo, extra Daiana, totale
    const allExpenses = this.expenses();
    const catBudget: { [cat: string]: number } = {};
    const catExtraAngelo: { [cat: string]: number } = {};
    const catExtraDaiana: { [cat: string]: number } = {};
    allExpenses.forEach(e => {
      const cat = e.category || 'Altro';
      if (e.useBudget === false) {
        if (e.user === 'Angelo') {
          catExtraAngelo[cat] = (catExtraAngelo[cat] || 0) + e.totalAmount;
        } else if (e.user === 'Daiana') {
          catExtraDaiana[cat] = (catExtraDaiana[cat] || 0) + e.totalAmount;
        }
      } else {
        catBudget[cat] = (catBudget[cat] || 0) + e.totalAmount;
      }
    });

    const catData = Object.entries(curStats.byCategory)
      .filter(([_, value]) => (value as number) > 0)
      .map(([cat, value]) => [
        cat,
        `${(catBudget[cat] || 0).toFixed(2)} EUR`,
        `${(catExtraAngelo[cat] || 0).toFixed(2)} EUR`,
        `${(catExtraDaiana[cat] || 0).toFixed(2)} EUR`,
        `${(value as number).toFixed(2)} EUR`
      ]);

    autoTable(doc, {
      startY: 70,
      head: [['Categoria', 'Budget Mensile', 'Extra Angelo', 'Extra Daiana', 'Totale']],
      body: catData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    const expenses = this.expenses();
    const detailData = expenses.map(e => [
      new Date(e.date).toLocaleDateString('it-IT'),
      e.category || 'Altro',
      e.user || '-',
      e.note || '-',
      e.useBudget === false ? 'EXTRA' : '-',
      `${e.totalAmount.toFixed(2)} EUR`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data', 'Categoria', 'Utente', 'Note', 'Tipo', 'Importo']],
      body: detailData,
      theme: 'grid',
      headStyles: { fillColor: [63, 81, 181] },
      didParseCell: (hookData: any) => {
        // Riga extra-budget: sfondo arancione chiaro, testo in grassetto
        if (hookData.row.section === 'body' && hookData.row.raw[4] === 'EXTRA') {
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    });

    let lastY = (doc as any).lastAutoTable.finalY;

    if (angeloPersonal.length > 0) {
      // Panoramica per categoria (Angelo)
      const angeloCatTotals: { [cat: string]: number } = {};
      angeloPersonal.forEach(e => {
        const cat = e.category || 'Altro';
        angeloCatTotals[cat] = (angeloCatTotals[cat] || 0) + e.totalAmount;
      });
      const angeloCatRows = Object.entries(angeloCatTotals)
        .map(([cat, total]) => [cat, `${total.toFixed(2)} EUR`]);

      // Gestione layout e page break preventiva (Tabella + Grafico richiedono circa 45-50mm verticali)
      const angeloTableHeight = 15 + (angeloCatRows.length * 8);
      const angeloSpaceNeeded = Math.max(45, angeloTableHeight);
      if (lastY + angeloSpaceNeeded + 12 > 280) {
        doc.addPage();
        lastY = 20;
      }

      doc.setFontSize(14);
      doc.text(`Spese Personali - Angelo (Totale: ${angeloTotal.toFixed(2)} EUR)`, 14, lastY + 10);
      lastY = lastY + 12;

      let printedAngeloChart = false;
      const personalAngeloCanvas = document.getElementById('pdfAngeloPieChart') as HTMLCanvasElement;
      if (personalAngeloCanvas) {
        try {
          const imgData = personalAngeloCanvas.toDataURL('image/png');
          doc.addImage(imgData, 'PNG', 145, lastY, 40, 40);
          printedAngeloChart = true;
        } catch (e) {
          console.error('Errore nell\'esportazione del grafico personale Angelo', e);
        }
      }

      autoTable(doc, {
        startY: lastY,
        tableWidth: printedAngeloChart ? 110 : 'auto',
        head: [['Categoria', 'Totale Speso']],
        body: angeloCatRows,
        theme: 'grid',
        headStyles: { fillColor: [66, 165, 245] },
        columnStyles: {
          1: { halign: 'right' }
        }
      });
      const tableEndY = (doc as any).lastAutoTable.finalY;
      lastY = printedAngeloChart ? Math.max(tableEndY, lastY + 40) : tableEndY;

      // Dettaglio spese (Angelo)
      if (lastY + 25 > 280) {
        doc.addPage();
        lastY = 20;
      } else {
        lastY = lastY + 10;
      }
      doc.setFontSize(12);
      doc.text('Dettaglio Spese:', 14, lastY);

      const angeloRows = angeloPersonal.map(e => [
        new Date(e.date).toLocaleDateString('it-IT'),
        e.category || 'Altro',
        e.note || '-',
        `${e.totalAmount.toFixed(2)} EUR`
      ]);

      autoTable(doc, {
        startY: lastY + 4,
        head: [['Data', 'Categoria', 'Note', 'Importo']],
        body: angeloRows,
        theme: 'grid',
        headStyles: { fillColor: [66, 165, 245] },
        columnStyles: {
          3: { halign: 'right' }
        }
      });
      lastY = (doc as any).lastAutoTable.finalY;
    }

    if (daianaPersonal.length > 0) {
      // Panoramica per categoria (Daiana)
      const daianaCatTotals: { [cat: string]: number } = {};
      daianaPersonal.forEach(e => {
        const cat = e.category || 'Altro';
        daianaCatTotals[cat] = (daianaCatTotals[cat] || 0) + e.totalAmount;
      });
      const daianaCatRows = Object.entries(daianaCatTotals)
        .map(([cat, total]) => [cat, `${total.toFixed(2)} EUR`]);

      // Gestione layout e page break preventiva (Tabella + Grafico richiedono circa 45-50mm verticali)
      const daianaTableHeight = 15 + (daianaCatRows.length * 8);
      const daianaSpaceNeeded = Math.max(45, daianaTableHeight);
      if (lastY + daianaSpaceNeeded + 12 > 280) {
        doc.addPage();
        lastY = 20;
      }

      doc.setFontSize(14);
      doc.text(`Spese Personali - Daiana (Totale: ${daianaTotal.toFixed(2)} EUR)`, 14, lastY + 10);
      lastY = lastY + 12;

      let printedDaianaChart = false;
      const personalDaianaCanvas = document.getElementById('pdfDaianaPieChart') as HTMLCanvasElement;
      if (personalDaianaCanvas) {
        try {
          const imgData = personalDaianaCanvas.toDataURL('image/png');
          doc.addImage(imgData, 'PNG', 145, lastY, 40, 40);
          printedDaianaChart = true;
        } catch (e) {
          console.error('Errore nell\'esportazione del grafico personale Daiana', e);
        }
      }

      autoTable(doc, {
        startY: lastY,
        tableWidth: printedDaianaChart ? 110 : 'auto',
        head: [['Categoria', 'Totale Speso']],
        body: daianaCatRows,
        theme: 'grid',
        headStyles: { fillColor: [240, 98, 146] },
        columnStyles: {
          1: { halign: 'right' }
        }
      });
      const tableEndY = (doc as any).lastAutoTable.finalY;
      lastY = printedDaianaChart ? Math.max(tableEndY, lastY + 40) : tableEndY;

      // Dettaglio spese (Daiana)
      if (lastY + 25 > 280) {
        doc.addPage();
        lastY = 20;
      } else {
        lastY = lastY + 10;
      }
      doc.setFontSize(12);
      doc.text('Dettaglio Spese:', 14, lastY);

      const daianaRows = daianaPersonal.map(e => [
        new Date(e.date).toLocaleDateString('it-IT'),
        e.category || 'Altro',
        e.note || '-',
        `${e.totalAmount.toFixed(2)} EUR`
      ]);

      autoTable(doc, {
        startY: lastY + 4,
        head: [['Data', 'Categoria', 'Note', 'Importo']],
        body: daianaRows,
        theme: 'grid',
        headStyles: { fillColor: [240, 98, 146] },
        columnStyles: {
          3: { halign: 'right' }
        }
      });
    }

    const fileName = `Resoconto_${monthYearStr.replace(' ', '_')}.pdf`;

    if (Capacitor.isNativePlatform()) {
      // Su Android/iOS: salva nel filesystem temporaneo e apri la condivisione nativa
      try {
        const base64Data = doc.output('datauristring').split(',')[1];
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        });
        await Share.share({
          title: `Resoconto Spese - ${monthYearStr}`,
          text: `Riepilogo spese di ${monthYearStr}`,
          url: savedFile.uri,
          dialogTitle: 'Condividi o salva il PDF'
        });
      } catch (err) {
        this.notification.showError('Errore durante l\'esportazione del PDF.');
      }
    } else {
      // Su web: download diretto
      doc.save(fileName);
    }
  }

  asNumber(val: any): number { return Number(val) || 0; }
  goBack() { this.router.navigate(['/dashboard']); }
}
