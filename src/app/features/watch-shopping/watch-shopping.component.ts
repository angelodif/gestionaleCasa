import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ShoppingItem, ShoppingListService } from '../../services/shopping/shopping.service';
import { FinanceService, FINANCE_CATEGORIES } from '../../services/finance/finance.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';

@Component({
  selector: 'app-watch-shopping',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSelectModule
  ],
  templateUrl: './watch-shopping.component.html',
  styleUrl: './watch-shopping.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WatchShoppingComponent implements OnInit, OnDestroy {
  private shoppingService = inject(ShoppingListService);
  private financeService = inject(FinanceService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private router = inject(Router);

  // State
  items = signal<ShoppingItem[]>([]);
  selectedShop = signal<string>('Tutti');
  showRecordExpenseModal = signal<boolean>(false);
  expenseSavedSuccess = signal<boolean>(false);

  // Expense Modal Form Signals
  totalAmount = signal<number>(0);
  vouchersUsed = signal<number>(0);
  category = signal<string>('Spesa Alimentare');
  selectedUser = signal<'Angelo' | 'Daiana'>('Angelo');
  useBudget = signal<boolean>(true);
  note = signal<string>('');

  categories = FINANCE_CATEGORIES;

  // Computed Properties
  shops = computed(() => {
    const list = this.items();
    const set = new Set<string>();
    list.forEach(i => set.add(i.shop || 'Lista generica'));
    return ['Tutti', ...Array.from(set)];
  });

  filteredItems = computed(() => {
    const shop = this.selectedShop();
    const list = this.items();
    let filtered = list;
    if (shop !== 'Tutti') {
      filtered = list.filter(i => (i.shop || 'Lista generica') === shop);
    }
    // Unchecked first, then checked
    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  });

  checkedCount = computed(() => {
    return this.filteredItems().filter(i => i.completed).length;
  });

  totalCount = computed(() => {
    return this.filteredItems().length;
  });

  liquidAmount = computed(() => {
    const total = this.totalAmount() || 0;
    const voucherVal = (this.vouchersUsed() || 0) * 5;
    return Math.max(0, total - voucherVal);
  });

  private listSub?: Subscription;

  ngOnInit() {
    this.listSub = this.shoppingService.getShoppingList().subscribe(data => {
      this.items.set(data);
    });

    // Detect default user
    const currentUser = this.authService.getCurrentUser();
    const name = currentUser?.displayName?.toLowerCase() || '';
    if (name.includes('daiana')) {
      this.selectedUser.set('Daiana');
    } else {
      this.selectedUser.set('Angelo');
    }
  }

  ngOnDestroy() {
    if (this.listSub) this.listSub.unsubscribe();
  }

  triggerHaptic() {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([25]);
      }
    } catch (e) {}
  }

  async toggleItem(item: ShoppingItem) {
    this.triggerHaptic();
    const current = [...this.items()];
    const idx = current.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      current[idx].completed = !current[idx].completed;
      this.items.set(current);
      try {
        await this.shoppingService.updateList(current);
      } catch (e) {
        // Rollback
        current[idx].completed = !current[idx].completed;
        this.items.set(current);
      }
    }
  }

  openExpenseModal() {
    if (this.checkedCount() === 0) {
      this.notification.showError('Nessun articolo spuntato!');
      return;
    }

    this.triggerHaptic();
    this.totalAmount.set(0);
    this.vouchersUsed.set(0);
    const shop = this.selectedShop();
    this.category.set(shop === 'Carburante' ? 'Carburanti' : 'Spesa Alimentare');
    this.note.set(shop !== 'Tutti' ? shop : 'Spesa Watch');
    this.showRecordExpenseModal.set(true);
  }

  closeExpenseModal() {
    this.showRecordExpenseModal.set(false);
  }

  adjustAmount(delta: number) {
    this.triggerHaptic();
    const curr = Math.max(0, Math.round((this.totalAmount() + delta) * 100) / 100);
    this.totalAmount.set(curr);
  }

  adjustVouchers(delta: number) {
    this.triggerHaptic();
    const curr = Math.max(0, this.vouchersUsed() + delta);
    this.vouchersUsed.set(curr);
  }

  async saveExpense() {
    if (this.totalAmount() <= 0) {
      this.notification.showError('Inserisci un importo valido');
      return;
    }

    this.triggerHaptic();
    const shop = this.selectedShop();
    const allItems = this.items();
    
    // Create expense object
    const expenseData = {
      totalAmount: this.totalAmount(),
      liquidAmount: this.liquidAmount(),
      voucherAmount: (this.vouchersUsed() || 0) * 5,
      vouchersUsed: this.vouchersUsed() || 0,
      category: this.category(),
      note: this.note(),
      user: this.selectedUser(),
      useBudget: this.useBudget(),
      date: Date.now()
    };

    try {
      await this.financeService.addExpense(expenseData);

      // Remove checked items
      let remaining: ShoppingItem[];
      if (shop !== 'Tutti') {
        remaining = allItems.filter(i => !( (i.shop || 'Lista generica') === shop && i.completed ));
      } else {
        remaining = allItems.filter(i => !i.completed);
      }

      this.items.set(remaining);
      await this.shoppingService.updateList(remaining);

      this.showRecordExpenseModal.set(false);
      this.expenseSavedSuccess.set(true);

      setTimeout(() => {
        this.expenseSavedSuccess.set(false);
      }, 2500);

    } catch (err) {
      this.notification.showError('Errore durante il salvataggio');
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
