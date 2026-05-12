import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
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
  styleUrl: './shopping-list.component.scss' // It's important SCSS is generated
})
export class ShoppingListComponent implements OnInit, OnDestroy {
  private shoppingService = inject(ShoppingListService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);
  private financeService = inject(FinanceService);
  private notification = inject(NotificationService);

  items: ShoppingItem[] = [];
  groupedItems: GroupedShoppingItems[] = [];
  activeStoreModeShop: string | null = null;
  budgetInfo: { remainingLiquid: number, remainingVouchers: number } | null = null;
  private listSub?: Subscription;

  ngOnInit() {
    this.listSub = this.shoppingService.getShoppingList().subscribe(data => {
      // Order items: unchecked first, checked at bottom
      this.items = data.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1; // completed va in basso (1), non completed in alto (-1)
        }
        return b.createdAt - a.createdAt; // i più nuovi in testa
      });

      // Group by shop
      const groups = new Map<string, ShoppingItem[]>();
      this.items.forEach(item => {
        const shop = item.shop || 'Lista generica';
        if (!groups.has(shop)) groups.set(shop, []);
        groups.get(shop)!.push(item);
      });
      // Ordinamento alfabetico dei negozi, in cui "Lista generica" può stare in cima o in fondo
      this.groupedItems = Array.from(groups.keys()).sort((a, b) => {
        if (a === 'Lista generica') return -1;
        if (b === 'Lista generica') return 1;
        return a.localeCompare(b);
      }).map(shop => ({
        shop,
        items: groups.get(shop)!
      }));

      this.cdr.detectChanges();
    });

    this.loadBudgetInfo();
  }

  async loadBudgetInfo() {
    const monthKey = new Date().toISOString().slice(0, 7);
    const budget = await this.financeService.getBudget(monthKey);
    if (budget) {
      this.financeService.getMonthlyExpenses(monthKey).subscribe(expenses => {
        let liquidSpent = 0;
        let voucherSpent = 0;
        expenses.forEach(e => {
          liquidSpent += (e.liquidAmount || 0);
          voucherSpent += (e.voucherAmount || 0);
        });
        this.budgetInfo = {
          remainingLiquid: budget.totalLiquid - liquidSpent,
          remainingVouchers: (budget.totalVouchers || 0) - voucherSpent
        };
        this.cdr.detectChanges();
      });
    }
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

    // Forza il ricalcolo dei mat-form-field dopo l'animazione del dialog
    dialogRef.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        try {
          await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
          this.notification.showSuccess(`"${result.itemName}" aggiunto!`);
        } catch (error: any) {
          // L'errore è già gestito dal servizio
        }
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

    // Forza il ricalcolo dei mat-form-field dopo l'animazione del dialog
    dialogRef.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        const index = this.items.findIndex(i => i.id === item.id);
        if (index !== -1) {
          this.items[index].text = result.itemName;
          this.items[index].shop = result.shopName;
          await this.shoppingService.updateList(this.items);
          await this.shoppingService.ensureConfigExists(result.itemName, result.shopName);
          this.notification.showSuccess('Prodotto aggiornato.');
        }
      }
    });
  }

  enterStoreMode(shop: string) {
    this.activeStoreModeShop = shop;
    this.cdr.detectChanges();
  }

  exitStoreMode() {
    this.activeStoreModeShop = null;
    this.cdr.detectChanges();
  }

  async toggleItem(item: ShoppingItem) {
    const originalState = item.completed;
    item.completed = !item.completed;
    const index = this.items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      this.items[index] = item;
      try {
        await this.shoppingService.updateList(this.items);
        this.notification.showSuccess(item.completed ? 'Preso!' : 'Rimesso in lista.');
      } catch (error: any) {
        // ROLLBACK UI: se fallisce, riporta l'item allo stato precedente
        item.completed = originalState;
        this.items[index] = item;
        this.cdr.detectChanges();
      }
    }
  }

  async deleteItem(item: ShoppingItem) {
    if (confirm(`Sei sicuro di voler eliminare "${item.text}" dalla lista della spesa?`)) {
      const originalItems = [...this.items];
      try {
        this.items = this.items.filter(i => i.id !== item.id);
        await this.shoppingService.updateList(this.items);
        this.notification.showSuccess(`"${item.text}" rimosso dalla lista.`);
      } catch (error: any) {
        // ROLLBACK: ripristina la lista precedente
        this.items = originalItems;
        this.cdr.detectChanges();
      }
    }
  }

  async finishShopping() {
    // Se siamo in modalità negozio, filtriamo solo per quel negozio
    const relevantItems = this.activeStoreModeShop 
      ? this.items.filter(i => i.shop === this.activeStoreModeShop)
      : this.items;

    const checkedCount = relevantItems.filter(i => i.completed).length;
    const uncheckedCount = relevantItems.filter(i => !i.completed).length;

    if (checkedCount === 0) {
      alert("Nessun articolo spuntato. Inizia lo shopping prima di poter 'Terminare la Spesa'!");
      return;
    }

    const message = uncheckedCount > 0 
      ? `Hai acquistato ${checkedCount} prodotti in questo negozio.\nVuoi terminare la spesa eliminando i prodotti spuntati e mantenendo i ${uncheckedCount} non trovati per la prossima volta?`
      : `Hai acquistato tutti i ${checkedCount} prodotti! Vuoi azzerare la lista e terminare la spesa?`;

    if (confirm(message)) {
      // Apri dialog registrazione spesa
      const expenseDialog = this.dialog.open(RecordExpenseDialogComponent, {
        width: '95vw',
        maxWidth: '450px',
        panelClass: 'modern-dialog',
        data: { 
          category: this.activeStoreModeShop === 'Carburante' ? 'Carburanti' : 'Spesa Alimentare',
          note: this.activeStoreModeShop && this.activeStoreModeShop !== 'Lista generica' ? this.activeStoreModeShop : ''
        }
      });

      // Forza ricalcolo layout Material
      expenseDialog.afterOpened().subscribe(() => {
        this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
      });

      expenseDialog.afterClosed().subscribe(async expenseResult => {
        if (expenseResult) {
          try {
            await this.financeService.addExpense(expenseResult);
            this.notification.showSuccess('Spesa registrata con successo!');
          } catch (error: any) {
            // Gestito dal servizio
          }
        }
        
        if (this.activeStoreModeShop) {
           this.items = this.items.filter(i => !(i.shop === this.activeStoreModeShop && i.completed));
        } else {
           this.items = this.items.filter(i => !i.completed);
        }
        
        try {
          await this.shoppingService.updateList(this.items);
        } catch (error: any) {
          // L'errore è gestito, ma qui non facciamo rollback manuale della lista
          // perché l'operazione di "termina spesa" è complessa e multi-step.
        }
        this.exitStoreMode();
      });
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  goToFinance() {
    this.router.navigate(['/finance']);
  }
}
