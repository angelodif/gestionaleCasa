import { Component, inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  BodyMetricConfig,
  BodyMetricSegment,
  UserMetricConfigs,
  DEFAULT_BODY_METRIC_DEFINITIONS,
  BodyMetricDefinition
} from '../../../models/body-metric-config.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Dialog per configurare gli intervalli di una metrica corporea personalizzata.
 */
@Component({
  selector: 'app-metric-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './metric-config-dialog.component.html',
  styleUrl: './metric-config-dialog.component.scss'
})
export class MetricConfigDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<MetricConfigDialogComponent>);
  // Riceve l'intera mappa delle configurazioni utente (può essere vuota)
  private data = inject<{ configs?: UserMetricConfigs }>(MAT_DIALOG_DATA);

  // Lista tipi metriche con etichette in italiano
  readonly metricTypeOptions: { type: string; label: string; unit: string }[] = Object.values(
    DEFAULT_BODY_METRIC_DEFINITIONS
  ).map(def => ({
    type: def.type,
    label: def.label,
    unit: def.unit
  }));

  // Form controls
  type = this.fb.control<string>('weight', Validators.required);
  unit = this.fb.control<string>('');

  segments: FormArray = this.fb.array<FormGroup>([]);

  // FormGroup complessivo
  segmentsForm = this.fb.group({
    type: this.type,
    unit: this.unit,
    segments: this.segments
  });

  ngOnInit() {
    // Carica la configurazione esistente per il tipo corrente (se disponibile)
    this.loadConfigForCurrentType();
  }

  /** Carica la config salvata per il tipo selezionato, oppure i default */
  private loadConfigForCurrentType() {
    const currentType = this.type.value ?? 'weight';
    const savedConfig = this.data.configs?.[currentType];
    if (savedConfig?.segments?.length) {
      this.unit.setValue(savedConfig.unit ?? '');
      this.segments.clear();
      for (const seg of savedConfig.segments) {
        this.segments.push(this.createSegmentGroup(seg));
      }
    } else {
      this.loadDefaultsForCurrentType();
    }
  }

  getMetricLabel(typeVal: string | null): string {
    if (!typeVal) return '';
    return DEFAULT_BODY_METRIC_DEFINITIONS[typeVal]?.label ?? typeVal;
  }

  onTypeChange(newType: string) {
    // Quando si cambia tipo, carica prima la config salvata, poi i default
    this.loadConfigForCurrentType();
  }

  loadDefaultsForCurrentType() {
    const currentType = this.type.value ?? 'weight';
    const def = DEFAULT_BODY_METRIC_DEFINITIONS[currentType];
    if (def) {
      if (!this.unit.value) {
        this.unit.setValue(def.unit);
      }
      this.segments.clear();
      for (const seg of def.defaultSegments) {
        this.segments.push(this.createSegmentGroup(seg));
      }
    }
  }

  private createSegmentGroup(seg?: BodyMetricSegment): FormGroup {
    return this.fb.group({
      label: [seg?.label ?? '', Validators.required],
      min: [seg?.min ?? 0, [Validators.required, Validators.min(0)]],
      max: [seg?.max ?? 0, [Validators.required, Validators.min(0)]],
      color: [seg?.color ?? '#0284c7', Validators.required]
    });
  }

  addSegment() {
    // Calcola un min basato sull'ultimo max esistente
    let lastMax = 0;
    if (this.segments.length > 0) {
      const last = this.segments.at(this.segments.length - 1).value;
      lastMax = Number(last.max) || 0;
    }
    this.segments.push(
      this.createSegmentGroup({
        label: '',
        min: lastMax,
        max: lastMax + 10,
        color: '#10b981'
      })
    );
  }

  removeSegment(index: number) {
    this.segments.removeAt(index);
  }

  save() {
    if (this.type.invalid || this.segments.invalid) {
      this.segmentsForm.markAllAsTouched();
      return;
    }
    const config: BodyMetricConfig = {
      type: this.type.value as string,
      // IMPORTANTE: mai passare undefined a Firestore → stringa vuota come fallback
      unit: this.unit.value ?? '',
      segments: this.segments.value as BodyMetricSegment[]
    };
    this.dialogRef.close(config);
  }

  cancel() {
    this.dialogRef.close();
  }
}
