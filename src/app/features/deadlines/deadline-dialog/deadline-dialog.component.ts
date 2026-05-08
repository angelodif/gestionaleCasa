import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Deadline, DEADLINE_CATEGORIES } from '../../../services/deadline/deadline.service';

@Component({
  selector: 'app-deadline-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './deadline-dialog.component.html',
  styleUrl: './deadline-dialog.component.scss'
})
export class DeadlineDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<DeadlineDialogComponent>);
  public data = inject(MAT_DIALOG_DATA);

  deadlineForm!: FormGroup;
  categories = DEADLINE_CATEGORIES;
  
  suggestedTypes: { [key: string]: string[] } = {
    'Auto': ['Bollo', 'Assicurazione', 'Tagliando', 'Revisione', 'Pneumatici', 'Altro'],
    'Casa': ['Riscaldamento (Caldaia)', 'Condizionatori', 'TARI', 'IMU', 'Affitto/Mutuo', 'Bolletta', 'Altro'],
    'Persona': ['Patente', 'Carta Identità', 'Passaporto', 'Abbonamento', 'Altro'],
    'Salute': ['Dentista', 'Analisi del Sangue', 'Visita Specialistica', 'Altro'],
    'Altro': ['Generale']
  };

  ngOnInit() {
    this.deadlineForm = this.fb.group({
      id: [this.data?.id],
      title: [this.data?.title || '', [Validators.required]],
      category: [this.data?.category || 'Auto', [Validators.required]],
      type: [this.data?.type || 'Bollo', [Validators.required]],
      dueDate: [this.data?.dueDate ? new Date(this.data.dueDate) : new Date(), [Validators.required]],
      description: [this.data?.description || ''],
      cost: [this.data?.cost || null],
      isPaid: [this.data?.isPaid || false],
      recurring: [this.data?.recurring || 'none']
    });
  }

  onSave() {
    if (this.deadlineForm.valid) {
      const formValue = this.deadlineForm.value;
      const result: Deadline = {
        ...formValue,
        dueDate: formValue.dueDate.getTime()
      };
      this.dialogRef.close(result);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  get currentCategory() {
    return this.deadlineForm.get('category')?.value;
  }
}
