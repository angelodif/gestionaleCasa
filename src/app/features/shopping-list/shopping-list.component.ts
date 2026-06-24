import { Component, inject, OnInit, OnDestroy, NgZone, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ShoppingItem, ShoppingListService } from '../../services/shopping/shopping.service';
import { FinanceService } from '../../services/finance/finance.service';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { RecordExpenseDialogComponent } from '../../shared/record-expense-dialog/record-expense-dialog.component';
import { NotificationService } from '../../services/notification/notification.service';
import { ConfirmService } from '../../services/confirm/confirm.service';

interface GroupedShoppingItems {
  shop: string;
  items: ShoppingItem[];
}

@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatCheckboxModule, MatDividerModule, MatDialogModule
  ],
  templateUrl: './shopping-list.component.html',
  styleUrl: './shopping-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShoppingListComponent implements OnInit, OnDestroy {
  private shoppingService = inject(ShoppingListService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);
  private financeService = inject(FinanceService);
  notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);

  // Signals State
  items = signal<ShoppingItem[]>([]);
  activeStoreModeShop = signal<string | null>(null);
  budgetInfo = signal<{ remainingLiquid: number, remainingVouchers: number } | null>(null);

  // Computed Signal for Grouping
  groupedItems = computed(() => {
    const currentItems = this.items();
    const groups = new Map<string, ShoppingItem[]>();
    
    currentItems.forEach(item => {
      const shop = item.shop || 'Lista generica';
      if (!groups.has(shop)) groups.set(shop, []);
      groups.get(shop)!.push(item);
    });

    return Array.from(groups.keys()).sort((a, b) => {
      if (a === 'Lista generica') return -1;
      if (b === 'Lista generica') return 1;
      return a.localeCompare(b);
    }).map(shop => ({
      shop,
      items: groups.get(shop)!
    }));
  });

  private listSub?: Subscription;

  ngOnInit() {
    this.listSub = this.shoppingService.getShoppingList().subscribe(data => {
      // Order items: unchecked first, checked at bottom
      const sorted = data.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });
      this.items.set(sorted);
    });

    this.loadBudgetInfo();
  }

  async loadBudgetInfo() {
    const monthKey = new Date().toISOString().slice(0, 7);
    try {
      const budget = await this.financeService.getBudget(monthKey);
      if (budget) {
        this.financeService.getMonthlyExpenses(monthKey).subscribe(expenses => {
          let liquidSpent = 0;
          let voucherSpent = 0;
          expenses.forEach(e => {
            liquidSpent += (e.liquidAmount || 0);
            voucherSpent += (e.voucherAmount || 0);
          });
          this.budgetInfo.set({
            remainingLiquid: budget.totalLiquid - liquidSpent,
            remainingVouchers: (budget.totalVouchers || 0) - voucherSpent
          });
        });
      }
    } catch (error) {}
  }

  ngOnDestroy() {
    if (this.listSub) this.listSub.unsubscribe();
  }

  addItem() {
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '90vw',
      maxWidth: '400px',
      panelClass: 'responsive-dialog',
      data: { itemName: '' }
    });

    dialogRef.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        try {
          await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
          this.notification.showSuccess(`"${result.itemName}" aggiunto!`);
        } catch (error: any) {}
      }
    });
  }

  editItem(item: ShoppingItem) {
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '90vw',
      maxWidth: '400px',
      panelClass: 'responsive-dialog',
      data: { itemName: item.text, shopName: item.shop }
    });

    dialogRef.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        const currentItems = [...this.items()];
        const index = currentItems.findIndex(i => i.id === item.id);
        if (index !== -1) {
          currentItems[index].text = result.itemName;
          currentItems[index].shop = result.shopName;
          this.items.set(currentItems);
          await this.shoppingService.updateList(currentItems);
          await this.shoppingService.ensureConfigExists(result.itemName, result.shopName);
          this.notification.showSuccess('Prodotto aggiornato.');
        }
      }
    });
  }

  enterStoreMode(shop: string) {
    this.activeStoreModeShop.set(shop);
  }

  exitStoreMode() {
    this.activeStoreModeShop.set(null);
  }

  async toggleItem(item: ShoppingItem) {
    const currentItems = [...this.items()];
    const index = currentItems.findIndex(i => i.id === item.id);
    if (index !== -1) {
      const originalState = currentItems[index].completed;
      currentItems[index].completed = !originalState;
      this.items.set(currentItems);
      
      try {
        await this.shoppingService.updateList(currentItems);
        this.notification.showSuccess(currentItems[index].completed ? 'Preso!' : 'Rimesso in lista.');
      } catch (error: any) {
        // Rollback
        currentItems[index].completed = originalState;
        this.items.set(currentItems);
      }
    }
  }

  async deleteItem(item: ShoppingItem) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina prodotto',
      message: `Sei sicuro di voler eliminare "${item.text}"?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    const originalItems = [...this.items()];
    const updatedItems = originalItems.filter(i => i.id !== item.id);
    this.items.set(updatedItems);
    try {
      await this.shoppingService.updateList(updatedItems);
      this.notification.showSuccess(`"${item.text}" rimosso.`);
    } catch (error: any) {
      this.items.set(originalItems);
    }
  }

  async finishShopping() {
    const shop = this.activeStoreModeShop();
    const currentItems = this.items();
    const relevantItems = shop ? currentItems.filter(i => i.shop === shop) : currentItems;

    const checkedCount = relevantItems.filter(i => i.completed).length;
    const uncheckedCount = relevantItems.filter(i => !i.completed).length;

    if (checkedCount === 0) {
      this.notification.showError('Nessun articolo spuntato!');
      return;
    }

    const message = uncheckedCount > 0
      ? `Hai acquistato ${checkedCount} prodotti. Vuoi eliminare i prodotti spuntati e mantenere i ${uncheckedCount} non trovati?`
      : `Hai acquistato tutti i ${checkedCount} prodotti! Vuoi azzerare la lista?`;

    const ok = await this.confirmService.confirm({
      title: 'Fine spesa',
      message,
      confirmLabel: uncheckedCount > 0 ? 'Elimina spuntati' : 'Azzera lista'
    });
    if (!ok) return;

    const expenseDialog = this.dialog.open(RecordExpenseDialogComponent, {
      width: '95vw',
      maxWidth: '450px',
      panelClass: 'modern-dialog',
      data: {
        category: shop === 'Carburante' ? 'Carburanti' : 'Spesa Alimentare',
        note: shop && shop !== 'Lista generica' ? shop : ''
      }
    });

    expenseDialog.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    expenseDialog.afterClosed().subscribe(async expenseResult => {
      if (expenseResult) {
        try {
          await this.financeService.addExpense(expenseResult);
          this.notification.showSuccess('Spesa registrata!');
        } catch (error: any) {}
      }

      let updated: ShoppingItem[];
      if (shop) {
        updated = currentItems.filter(i => !(i.shop === shop && i.completed));
      } else {
        updated = currentItems.filter(i => !i.completed);
      }

      this.items.set(updated);
      await this.shoppingService.updateList(updated);
      this.exitStoreMode();
    });
  }

  async clearCompleted() {
    const ok = await this.confirmService.confirm({
      title: 'Pulisci lista',
      message: 'Vuoi eliminare tutti i prodotti già acquistati?',
      confirmLabel: 'Elimina acquistati',
      danger: true
    });
    if (!ok) return;
    const remaining = this.items().filter(i => !i.completed);
    try {
      await this.shoppingService.updateList(remaining);
      this.notification.showSuccess('Lista pulita.');
    } catch (error: any) {}
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  goToFinance() {
    this.router.navigate(['/finance']);
  }
}
