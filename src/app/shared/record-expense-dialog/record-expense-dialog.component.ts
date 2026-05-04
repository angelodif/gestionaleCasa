import { Component, Inject, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { FinanceService, FINANCE_CATEGORY_ICONS } from '../../services/finance/finance.service';
import { Subscription } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';

@Component({
  selector: 'app-record-expense-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatButtonToggleModule,
    MatIconModule, MatDividerModule, MatCheckboxModule,
    MatDatepickerModule, MatNativeDateModule
  ],
  providers: [
    provideNativeDateAdapter()
  ],
  template: `
    <h2 mat-dialog-title>
      Registra Spesa
      <mat-icon style="vertical-align: middle; margin-left: 8px;">{{ getCategoryIcon(category) }}</mat-icon>
    </h2>
    
    <mat-dialog-content>
      <div class="expense-form">
        <!-- Importo Principale -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Importo Totale</mat-label>
          <input matInput type="number" [(ngModel)]="totalAmount" placeholder="0.00">
          <span matPrefix>€&nbsp;</span>
        </mat-form-field>

        <!-- Data -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Data Spesa</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="expenseDate">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <!-- Categoria -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Categoria</mat-label>
          <mat-select [(ngModel)]="category">
            <mat-option *ngFor="let cat of categories" [value]="cat">
              {{ cat }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <!-- Buoni Pasto -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Buoni Pasto (5€)</mat-label>
          <input matInput type="number" [(ngModel)]="vouchersUsed" min="0">
        </mat-form-field>

        <!-- Selezione Utente -->
        <div class="user-selector" *ngIf="category === 'Personale'">
          <label>Di chi è la spesa?</label>
          <mat-button-toggle-group [(ngModel)]="selectedUser" class="full-width">
            <mat-button-toggle value="Angelo">Angelo</mat-button-toggle>
            <mat-button-toggle value="Daiana">Daiana</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <!-- Note -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note (opzionale)</mat-label>
          <textarea matInput [(ngModel)]="note" rows="2"></textarea>
        </mat-form-field>

        <!-- Extra Budget -->
        <div class="extra-check" *ngIf="getLiquidAmount() > 0">
          <mat-checkbox [(ngModel)]="useBudget">
           <span style="color:#444 !important;"> Utilizzato budget mensile </span>
          </mat-checkbox>
        </div>

        <!-- Riepilogo -->
        <div class="summary-box" *ngIf="totalAmount > 0">
          <div class="row">
            <span>In Buoni:</span>
            <strong>{{ (vouchersUsed || 0) * 5 | currency:'EUR' }}</strong>
          </div>
          <div class="row main">
            <span>Da Pagare:</span>
            <strong [class.error]="getLiquidAmount() < 0">{{ getLiquidAmount() | currency:'EUR' }}</strong>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">ANNULLA</button>
      <button mat-raised-button color="primary" 
              [disabled]="!totalAmount || !category || getLiquidAmount() < 0" 
              (click)="onConfirm()">
        SALVA SPESA
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .expense-form { display: flex; flex-direction: column; gap: 12px; width: 100%; padding-top: 10px; box-sizing: border-box; }
    .full-width { width: 100%; }
    .user-selector { 
      margin-bottom: 10px; 
      label { display: block; font-size: 0.8rem; margin-bottom: 4px; color: #666; } 
      mat-button-toggle-group { width: 100%; display: flex; }
      mat-button-toggle { flex: 1; }
    }
    .extra-check { margin: 8px 0; }
    .summary-box { 
      background: #f5f5f5; padding: 12px; border-radius: 8px; 
      .row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px; }
      .row.main { margin-top: 8px; font-size: 1.1rem; color: var(--primary-color); border-top: 1px solid #ddd; padding-top: 8px; }
    }
    .error { color: #f44336; }
    :host { display: block; width: 100%; }
  `]
})
export class RecordExpenseDialogComponent implements OnInit, OnDestroy {
  categories: string[] = [];
  totalAmount: number = 0;
  vouchersUsed: number = 0;
  category: string = 'Spesa Alimentare';
  selectedUser: 'Angelo' | 'Daiana' | null = null;
  note: string = '';
  useBudget: boolean = true;
  expenseDate: Date = new Date();

  private financeService = inject(FinanceService);
  private cdr = inject(ChangeDetectorRef);
  private catSub?: Subscription;

  constructor(
    public dialogRef: MatDialogRef<RecordExpenseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  ngOnInit() {
    if (this.data?.amount) this.totalAmount = this.data.amount;
    if (this.data?.category) this.category = this.data.category;

    this.catSub = this.financeService.getCategories().subscribe(cats => {
      this.categories = cats;
      if (cats.length > 0 && !cats.includes(this.category)) {
        this.category = cats[0];
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.catSub) this.catSub.unsubscribe();
  }

  getCategoryIcon(cat: string): string {
    return FINANCE_CATEGORY_ICONS[cat] || 'receipt';
  }

  getLiquidAmount(): number {
    return (this.totalAmount || 0) - ((this.vouchersUsed || 0) * 5);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({
      totalAmount: this.totalAmount,
      liquidAmount: this.getLiquidAmount(),
      voucherAmount: (this.vouchersUsed || 0) * 5,
      vouchersUsed: this.vouchersUsed || 0,
      category: this.category,
      note: this.note,
      user: this.category === 'Personale' ? this.selectedUser : null,
      useBudget: this.useBudget,
      date: this.expenseDate ? this.expenseDate.getTime() : Date.now()
    });
  }
}
