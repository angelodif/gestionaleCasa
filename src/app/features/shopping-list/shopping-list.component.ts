import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ShoppingItem, ShoppingListService } from '../../services/shopping/shopping.service';

@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatCheckboxModule, MatDividerModule
  ],
  templateUrl: './shopping-list.component.html',
  styleUrl: './shopping-list.component.scss' // It's important SCSS is generated
})
export class ShoppingListComponent implements OnInit, OnDestroy {
  private shoppingService = inject(ShoppingListService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  items: ShoppingItem[] = [];
  newItemText: string = '';
  isStoreMode: boolean = false;
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
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.listSub) this.listSub.unsubscribe();
  }

  async addItem() {
    if (!this.newItemText.trim()) return;
    
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      text: this.newItemText.trim(),
      completed: false,
      createdAt: Date.now()
    };
    
    // Update in locale ottimistico
    this.items.unshift(newItem);
    this.newItemText = '';
    
    // Salva array globale ricompilato
    await this.shoppingService.updateList(this.items);
  }

  toggleMode() {
    this.isStoreMode = !this.isStoreMode;
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
      this.router.navigate(['/dashboard']);
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
