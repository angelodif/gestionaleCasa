import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-date-selection-dialog',
  standalone: true,
  imports: [
    CommonModule, 
    MatDialogModule, 
    MatDatepickerModule, 
    MatNativeDateModule,
    MatCardModule, 
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './date-selection-dialog.component.html',
  styleUrl: './date-selection-dialog.component.scss'
})
export class DateSelectionDialogComponent {
  selectedDate: Date;

  constructor(
    public dialogRef: MatDialogRef<DateSelectionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { initialDate: Date }
  ) {
    this.selectedDate = data.initialDate || new Date();
  }

  onSelect(date: Date | null) {
    if (date) {
      this.selectedDate = date;
    }
  }

  onConfirm() {
    this.dialogRef.close(this.selectedDate);
  }

  onCancel() {
    this.dialogRef.close();
  }
}
