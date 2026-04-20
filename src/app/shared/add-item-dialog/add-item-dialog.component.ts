import { Component, Inject, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ShoppingListService, ShoppingConfig } from '../../services/shopping/shopping.service';
import { MatIconModule } from '@angular/material/icon';

export interface AddItemDialogData {
  itemName: string;
  shopName?: string;
}

@Component({
  selector: 'app-add-item-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatAutocompleteModule, MatIconModule
  ],
  templateUrl: './add-item-dialog.component.html',
  styleUrl: './add-item-dialog.component.scss'
})
export class AddItemDialogComponent implements OnInit {
  itemName: string;
  shopName: string = '';
  shops: string[] = [];
  filteredShops: string[] = [];

  private shoppingService = inject(ShoppingListService);
  private cdr = inject(ChangeDetectorRef);

  get isEditMode(): boolean {
    return !!(this.data.itemName);
  }

  constructor(
    public dialogRef: MatDialogRef<AddItemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddItemDialogData
  ) {
    this.itemName = data.itemName || '';
    if (data.shopName) {
      this.shopName = data.shopName;
    }
  }

  ngOnInit() {
    this.shoppingService.getConfig().subscribe(config => {
      this.shops = config.shops || ['Lista generica'];
      if (!this.shops.includes('Lista generica')) {
        this.shops.unshift('Lista generica');
      }
      this.filterShops('');
      this.cdr.detectChanges();
    });
  }

  onShopNameChange(value: string) {
    this.filterShops(value);
  }

  filterShops(value: string) {
    const filterValue = (value || '').toLowerCase();
    this.filteredShops = this.shops.filter(option => option.toLowerCase().includes(filterValue));
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (!this.itemName.trim()) return;
    this.dialogRef.close({
      itemName: this.itemName.trim(),
      shopName: this.shopName.trim() || 'Lista generica'
    });
  }

  async deleteShop(shop: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (confirm(`Sei sicuro di voler eliminare il negozio "${shop}" dai suggerimenti? (Non eliminerà i prodotti)`)) {
      await this.shoppingService.removeShopFromConfig(shop);
      this.shops = this.shops.filter(s => s !== shop);
      this.filterShops(this.shopName);
      this.cdr.detectChanges();
    }
  }
}
