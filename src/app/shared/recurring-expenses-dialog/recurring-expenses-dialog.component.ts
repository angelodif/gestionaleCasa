import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FinanceService, RecurringExpense, FINANCE_CATEGORIES, FINANCE_CATEGORY_ICONS } from '../../services/finance/finance.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-recurring-expenses-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatDividerModule, MatListModule, MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>Spese Ricorrenti Mensili</h2>
    <mat-dialog-content>
      <p class="intro">Queste spese verranno caricate automaticamente ogni volta che inizi un nuovo mese.</p>
      
      <div class="add-form">
        <mat-form-field appearance="outline">
          <mat-label>Nome Spesa (es. Affitto)</mat-label>
          <input matInput [(ngModel)]="newExpense.name">
        </mat-form-field>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Importo (€)</mat-label>
            <input matInput type="number" [(ngModel)]="newExpense.amount">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Metodo</mat-label>
            <mat-select [(ngModel)]="newExpense.method">
              <mat-option value="liquid">Liquidità</mat-option>
              <mat-option value="voucher">Buoni Pasto</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Categoria</mat-label>
          <mat-select [(ngModel)]="newExpense.category">
            <mat-option *ngFor="let cat of categories" [value]="cat">
              {{ cat }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-checkbox [(ngModel)]="newExpense.useBudget" color="primary" style="margin-bottom: 10px;">
          <span style="color:#444 !important;">Deduci dal budget mensile (usa i soldi del budget)</span>
        </mat-checkbox>

        <button mat-raised-button color="primary" [disabled]="!isValid()" (click)="addExpense()">
          <mat-icon>add</mat-icon> Aggiungi
        </button>
      </div>

      <mat-divider></mat-divider>

      <mat-list>
        <h3 mat-subheader>Spese Attive</h3>
        <mat-list-item *ngFor="let exp of recurringExpenses$ | async">
          <mat-icon matListItemIcon>{{ getIcon(exp.category) }}</mat-icon>
          <div matListItemTitle>{{ exp.name }}</div>
          <div matListItemLine>
            {{ exp.amount | currency:'EUR' }} ({{ exp.method === 'liquid' ? 'Liq.' : 'Buoni' }})
            <span *ngIf="exp.useBudget === false" class="extra-badge">Extra Budget</span>
          </div>
          <button mat-icon-button matListItemMeta (click)="deleteExpense(exp.id!)">
            <mat-icon color="warn">delete</mat-icon>
          </button>
        </mat-list-item>
      </mat-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>CHIUDI</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .intro { font-size: 0.85rem; color: #666; margin-bottom: 20px; }
    .add-form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .form-row { display: flex; gap: 10px; }
    .form-row mat-form-field { flex: 1; }
    mat-list { 
      margin-top: 10px;
      h3 { color: var(--primary-color); font-weight: 700; margin-bottom: 10px; }
    }
    mat-list-item {
      color: #333 !important;
      mat-icon { color: #555 !important; }
      [matListItemTitle] { font-weight: 700; color: #1a1a1a; }
      [matListItemLine] { color: #666; }
    }
    .extra-badge {
      background: #3f51b5;
      color: white;
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
    }
  `]
})
export class RecurringExpensesDialogComponent implements OnInit {
  private financeService = inject(FinanceService);
  
  recurringExpenses$: Observable<RecurringExpense[]>;
  categories = FINANCE_CATEGORIES;
  
  newExpense: RecurringExpense = {
    name: '',
    amount: 0,
    category: 'Altro',
    method: 'liquid',
    useBudget: true
  };

  constructor() {
    this.recurringExpenses$ = this.financeService.getRecurringExpenses();
  }

  ngOnInit() {}

  isValid() {
    return this.newExpense.name && this.newExpense.amount > 0 && this.newExpense.category;
  }

  getIcon(cat: string) {
    return FINANCE_CATEGORY_ICONS[cat] || 'receipt';
  }

  async addExpense() {
    await this.financeService.saveRecurringExpense(this.newExpense);
    this.newExpense = { name: '', amount: 0, category: 'Altro', method: 'liquid', useBudget: true };
  }

  async deleteExpense(id: string) {
    if (confirm('Sei sicuro di voler eliminare questa spesa ricorrente?')) {
      await this.financeService.deleteRecurringExpense(id);
    }
  }
}
