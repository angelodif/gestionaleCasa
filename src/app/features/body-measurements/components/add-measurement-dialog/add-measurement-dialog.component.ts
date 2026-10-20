import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BodyMeasurement, BodyMeasurementService } from '../../../../services/body-measurement/body-measurement.service';

export interface MeasurementDialogData {
  userName: 'Angelo' | 'Daiana';
  defaultHeightCm: number;
  initialData?: BodyMeasurement;
}

@Component({
  selector: 'app-add-measurement-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule
  ],
  templateUrl: './add-measurement-dialog.component.html',
  styleUrl: './add-measurement-dialog.component.scss'
})
export class AddMeasurementDialogComponent implements OnInit {
  dateStr = new Date().toISOString().slice(0, 10);
  weight?: number;
  heightCm = 170;
  bmi?: number;
  bodyFatPercent?: number;
  waterPercent?: number;
  proteinPercent?: number;
  bmrKcal = 2084;
  visceralFat?: number;
  muscleKg?: number;
  boneMassKg?: number;
  bodyAge?: number;
  bodyState = '';
  isPrivate = false;
  notes = '';

  bodyService = inject(BodyMeasurementService);

  constructor(
    public dialogRef: MatDialogRef<AddMeasurementDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MeasurementDialogData
  ) {}

  ngOnInit() {
    this.heightCm = this.data.defaultHeightCm || 170;

    if (this.data.initialData) {
      const d = this.data.initialData;
      this.dateStr = new Date(d.date).toISOString().slice(0, 10);
      this.weight = d.weight;
      this.heightCm = d.heightCm || this.heightCm;
      this.bmi = d.bmi;
      this.bodyFatPercent = d.bodyFatPercent;
      this.waterPercent = d.waterPercent;
      this.proteinPercent = d.proteinPercent;
      this.bmrKcal = d.bmrKcal || 2084;
      this.visceralFat = d.visceralFat;
      this.muscleKg = d.muscleKg;
      this.boneMassKg = d.boneMassKg;
      this.bodyAge = d.bodyAge;
      this.bodyState = d.bodyState;
      this.isPrivate = d.isPrivate;
      this.notes = d.notes || '';
    }
  }

  onWeightOrHeightChange() {
    if (this.weight && this.heightCm) {
      this.bmi = this.bodyService.calculateBmi(this.weight, this.heightCm);
      const stateObj = this.bodyService.evaluateBodyState(this.weight);
      this.bodyState = stateObj.label;
    }
  }

  isValid(): boolean {
    return !!(
      this.weight &&
      this.weight > 20 &&
      this.bmi != null &&
      this.bodyFatPercent != null &&
      this.waterPercent != null &&
      this.proteinPercent != null &&
      this.bmrKcal != null &&
      this.visceralFat != null &&
      this.muscleKg != null &&
      this.boneMassKg != null &&
      this.bodyAge != null
    );
  }

  save() {
    if (!this.isValid()) return;

    const [y, m, d] = this.dateStr.split('-').map(Number);
    const dateTs = new Date(y, m - 1, d, 12, 0, 0).getTime();

    const result: Partial<BodyMeasurement> = {
      date: dateTs,
      weight: Number(this.weight),
      heightCm: Number(this.heightCm),
      bmi: Number(this.bmi),
      bodyFatPercent: Number(this.bodyFatPercent),
      waterPercent: Number(this.waterPercent),
      proteinPercent: Number(this.proteinPercent),
      bmrKcal: Number(this.bmrKcal),
      visceralFat: Number(this.visceralFat),
      muscleKg: Number(this.muscleKg),
      boneMassKg: Number(this.boneMassKg),
      bodyAge: Number(this.bodyAge),
      bodyState: this.bodyState || this.bodyService.evaluateBodyState(Number(this.weight)).label,
      isPrivate: !!this.isPrivate,
      notes: this.notes.trim()
    };

    this.dialogRef.close(result);
  }
}
