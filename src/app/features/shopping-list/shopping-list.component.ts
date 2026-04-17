import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';

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

  items: ShoppingItem[] = [];
  groupedItems: GroupedShoppingItems[] = [];
  activeStoreModeShop: string | null = null;
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
  }

  ngOnDestroy() {
    if (this.listSub) this.listSub.unsubscribe();
  }

  addItem() {
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '400px',
      data: { itemName: '' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
      }
    });
  }

  editItem(item: ShoppingItem) {
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '400px',
      data: { itemName: item.text, shopName: item.shop }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        const index = this.items.findIndex(i => i.id === item.id);
        if (index !== -1) {
          this.items[index].text = result.itemName;
          this.items[index].shop = result.shopName;
          await this.shoppingService.updateList(this.items);
          await this.shoppingService.ensureConfigExists(result.itemName, result.shopName);
        }
      }
    });
  }

  enterStoreMode(shop: string) {
    this.activeStoreModeShop = shop;
  }

  exitStoreMode() {
    this.activeStoreModeShop = null;
  }

  async toggleItem(item: ShoppingItem) {
    item.completed = !item.completed;
    
    // Aggiorniamo l'elemento e salviamo
    const index = this.items.findIndex(i => i.id === item.id);
    if (index !== -1) {
      this.items[index] = item;
      await this.shoppingService.updateList(this.items);
    }
  }

  async deleteItem(item: ShoppingItem) {
    this.items = this.items.filter(i => i.id !== item.id);
    await this.shoppingService.updateList(this.items);
  }

  async finishShopping() {
    const checkedCount = this.items.filter(i => i.completed).length;
    const uncheckedCount = this.items.filter(i => !i.completed).length;

    if (checkedCount === 0) {
      alert("Nessun articolo spuntato. Inizia lo shopping prima di poter 'Terminare la Spesa'!");
      return;
    }

    const message = uncheckedCount > 0 
      ? `Hai acquistato ${checkedCount} prodotti.\nVuoi terminare la spesa eliminando i prodotti spuntati e mantenendo i ${uncheckedCount} non trovati in lista per la prossima volta?`
      : `Hai acquistato tutti i ${checkedCount} prodotti! Vuoi azzerare la lista e terminare la spesa?`;

    if (confirm(message)) {
      // Manteniamo nell'array solo quelli non ancora comprati
      this.items = this.items.filter(i => !i.completed);
      await this.shoppingService.updateList(this.items);
      this.exitStoreMode();
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
