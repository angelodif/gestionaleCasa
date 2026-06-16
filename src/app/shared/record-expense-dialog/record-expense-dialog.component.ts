import { Component, Inject, OnInit, OnDestroy, inject, ChangeDetectorRef, ChangeDetectionStrategy, signal, computed } from '@angular/core';
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
import { AuthService } from '../../core/services/auth/auth.service';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ data?.id ? 'Modifica Spesa' : (data?.isPersonal ? 'Registra Spesa Personale' : 'Registra Spesa') }}
      <mat-icon style="vertical-align: middle; margin-left: 8px;">{{ getCategoryIcon(category()) }}</mat-icon>
    </h2>
    
    <mat-dialog-content>
      <div class="expense-form">
        <!-- Importo Principale -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Importo Totale</mat-label>
          <input matInput type="number" [ngModel]="totalAmount()" (ngModelChange)="totalAmount.set($event)" placeholder="0.00">
          <span matPrefix>€&nbsp;</span>
        </mat-form-field>

        <!-- Data -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Data Spesa</mat-label>
          <input matInput [matDatepicker]="picker" [ngModel]="expenseDate()" (ngModelChange)="expenseDate.set($event)">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <!-- Categoria -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Categoria</mat-label>
          <mat-select [ngModel]="category()" (ngModelChange)="category.set($event)">
            <mat-option *ngFor="let cat of categories()" [value]="cat">
              {{ cat }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <!-- Buoni Pasto -->
        <mat-form-field appearance="outline" class="full-width" *ngIf="!data?.isPersonal">
          <mat-label>Buoni Pasto (5€)</mat-label>
          <input matInput type="number" [ngModel]="vouchersUsed()" (ngModelChange)="vouchersUsed.set($event)" min="0">
        </mat-form-field>

        <!-- Selezione Utente -->
        <div class="user-selector" *ngIf="category() === 'Personale' || !useBudget() || data?.isPersonal">
          <label>Di chi è la spesa?</label>
          <mat-button-toggle-group [ngModel]="selectedUser()" (ngModelChange)="selectedUser.set($event)" class="full-width">
            <mat-button-toggle value="Angelo">Angelo</mat-button-toggle>
            <mat-button-toggle value="Daiana">Daiana</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <!-- Note -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note (opzionale)</mat-label>
          <textarea matInput [ngModel]="note()" (ngModelChange)="note.set($event)" rows="2"></textarea>
        </mat-form-field>

        <!-- Extra Budget -->
        <div class="extra-check" *ngIf="!data?.isPersonal && liquidAmount() > 0">
          <mat-checkbox [ngModel]="useBudget()" (ngModelChange)="useBudget.set($event)">
           <span style="color:#444 !important;"> Utilizzato budget mensile </span>
          </mat-checkbox>
        </div>

        <!-- Riepilogo -->
        <div class="summary-box" *ngIf="totalAmount() > 0">
          <div class="row" *ngIf="!data?.isPersonal">
            <span>In Buoni:</span>
            <strong>{{ (vouchersUsed() || 0) * 5 | currency:'EUR' }}</strong>
          </div>
          <div class="row main">
            <span>Da Pagare:</span>
            <strong [class.error]="liquidAmount() < 0">{{ liquidAmount() | currency:'EUR' }}</strong>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">ANNULLA</button>
      <button mat-raised-button color="primary" 
              [disabled]="!isValid()" 
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
      background: var(--bg-hover); padding: 12px; border-radius: 8px; 
      .row { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px; }
      .row.main { margin-top: 8px; font-size: 1.1rem; color: var(--primary-color); border-top: 1px solid #ddd; padding-top: 8px; }
    }
    .error { color: #f44336; }
    :host { display: block; width: 100%; }
  `]
})
export class RecordExpenseDialogComponent implements OnInit, OnDestroy {
  categories = signal<string[]>([]);
  totalAmount = signal<number>(0);
  vouchersUsed = signal<number>(0);
  category = signal<string>('Spesa Alimentare');
  selectedUser = signal<'Angelo' | 'Daiana' | null>(null);
  note = signal<string>('');
  useBudget = signal<boolean>(true);
  expenseDate = signal<Date>(new Date());

  liquidAmount = computed(() => (this.totalAmount() || 0) - ((this.vouchersUsed() || 0) * 5));

  isValid = computed(() => {
    const amountOk = (this.totalAmount() || 0) > 0;
    const categoryOk = !!this.category();
    const liquidOk = this.liquidAmount() >= 0;
    const userRequired = this.category() === 'Personale' || !this.useBudget() || this.data?.isPersonal;
    const userOk = !userRequired || !!this.selectedUser();
    return amountOk && categoryOk && liquidOk && userOk;
  });

  private financeService = inject(FinanceService);
  private authService = inject(AuthService);
  private catSub?: Subscription;

  constructor(
    public dialogRef: MatDialogRef<RecordExpenseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  ngOnInit() {
    if (this.data?.totalAmount) this.totalAmount.set(this.data.totalAmount);
    else if (this.data?.amount) this.totalAmount.set(this.data.amount);
    if (this.data?.category) this.category.set(this.data.category);
    if (this.data?.note) this.note.set(this.data.note);
    if (this.data?.vouchersUsed) this.vouchersUsed.set(this.data.vouchersUsed);
    if (this.data?.date) this.expenseDate.set(new Date(this.data.date));
    if (typeof this.data?.useBudget === 'boolean') this.useBudget.set(this.data.useBudget);
    if (this.data?.isPersonal) {
      this.useBudget.set(false);
      this.category.set('Personale');
    }

    if (this.data?.user) {
      this.selectedUser.set(this.data.user);
    } else {
      const currentUser = this.authService.getCurrentUser();
      const name = currentUser?.displayName?.toLowerCase();
      if (name) {
        if (name.includes('angelo')) {
          this.selectedUser.set('Angelo');
        } else if (name.includes('daiana')) {
          this.selectedUser.set('Daiana');
        }
      }
    }

    this.catSub = this.financeService.getCategories().subscribe(cats => {
      this.categories.set(cats);
      if (cats.length > 0 && !cats.includes(this.category())) {
        this.category.set(cats[0]);
      }
    });
  }

  ngOnDestroy() {
    if (this.catSub) this.catSub.unsubscribe();
  }

  getCategoryIcon(cat: string): string {
    return FINANCE_CATEGORY_ICONS[cat] || 'receipt';
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({
      ...(this.data?.id ? { id: this.data.id } : {}),
      totalAmount: this.totalAmount(),
      liquidAmount: this.liquidAmount(),
      voucherAmount: this.vouchersUsed() || 0 ? (this.vouchersUsed() || 0) * 5 : 0,
      vouchersUsed: this.vouchersUsed() || 0,
      category: this.category(),
      note: this.note(),
      user: (this.category() === 'Personale' || !this.useBudget() || this.data?.isPersonal) ? this.selectedUser() : null,
      useBudget: this.data?.isPersonal ? false : this.useBudget(),
      date: this.expenseDate() ? this.expenseDate().getTime() : Date.now()
    });
  }
}
