import { Component, Inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';

@Component({
  selector: 'app-record-earning-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatDatepickerModule, MatNativeDateModule
  ],
  providers: [
    provideNativeDateAdapter()
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ data?.id ? 'Modifica Entrata' : 'Aggiungi Entrata' }}
      <mat-icon style="vertical-align: middle; margin-left: 8px;">input</mat-icon>
    </h2>
    
    <mat-dialog-content>
      <div class="earning-form">
        <!-- Importo -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Importo</mat-label>
          <input matInput type="number" [ngModel]="amount()" (ngModelChange)="amount.set($event)" placeholder="0.00">
          <span matPrefix>€&nbsp;</span>
        </mat-form-field>

        <!-- Data -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Data Entrata</mat-label>
          <input matInput [matDatepicker]="picker" [ngModel]="earningDate()" (ngModelChange)="earningDate.set($event)">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <!-- Tipo -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Tipo Entrata</mat-label>
          <mat-select [ngModel]="type()" (ngModelChange)="type.set($event)">
            <mat-option value="Stipendio">Stipendio</mat-option>
            <mat-option value="Secondo lavoro">Secondo lavoro</mat-option>
            <mat-option value="Altro">Altro</mat-option>
          </mat-select>
        </mat-form-field>

        <!-- Note (obbligatorio se Tipo è 'Altro') -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ type() === 'Altro' ? 'Note (Obbligatorio)' : 'Note (Opzionale)' }}</mat-label>
          <textarea matInput [ngModel]="note()" (ngModelChange)="note.set($event)" rows="2"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">ANNULLA</button>
      <button mat-raised-button color="primary" 
              [disabled]="!isValid()" 
              (click)="onConfirm()">
        SALVA ENTRATA
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .earning-form { display: flex; flex-direction: column; gap: 12px; width: 100%; padding-top: 10px; box-sizing: border-box; }
    .full-width { width: 100%; }
    :host { display: block; width: 100%; }
  `]
})
export class RecordEarningDialogComponent implements OnInit {
  amount = signal<number>(0);
  earningDate = signal<Date>(new Date());
  type = signal<'Stipendio' | 'Secondo lavoro' | 'Altro'>('Stipendio');
  note = signal<string>('');

  isValid = computed(() => {
    const amountOk = (this.amount() || 0) > 0;
    const typeOk = !!this.type();
    const noteOk = this.type() !== 'Altro' || (this.note() && this.note().trim().length > 0);
    return amountOk && typeOk && noteOk;
  });

  constructor(
    public dialogRef: MatDialogRef<RecordEarningDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  ngOnInit() {
    if (this.data?.amount) this.amount.set(this.data.amount);
    if (this.data?.date) this.earningDate.set(new Date(this.data.date));
    if (this.data?.type) this.type.set(this.data.type);
    if (this.data?.note) this.note.set(this.data.note);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({
      ...(this.data?.id ? { id: this.data.id } : {}),
      amount: this.amount(),
      type: this.type(),
      note: this.note(),
      date: this.earningDate() ? this.earningDate().getTime() : Date.now()
    });
  }
}
