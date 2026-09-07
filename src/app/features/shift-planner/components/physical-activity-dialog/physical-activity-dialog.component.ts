import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PhysicalActivity, DayAssignment, FacilityTimeSlot, ShiftService, checkPhysicalActivityConflicts } from '../../../../services/shift/shift.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { ConfirmService } from '../../../../services/confirm/confirm.service';

export interface PhysicalActivityDialogData {
  dayName: string;
  date: Date;
  weekId: string;
  assignment: DayAssignment;
  weeklyAssignments?: { [dayName: string]: DayAssignment };
  availableTimeSlots?: FacilityTimeSlot[];
  activityToEdit?: PhysicalActivity;
}

@Component({
  selector: 'app-physical-activity-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon color="primary">fitness_center</mat-icon>
        <span>{{ data.activityToEdit ? 'Modifica' : 'Aggiungi' }} Attività Fisica</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="subtitle">
          Giorno originario: <strong>{{ data.dayName | titlecase }} {{ formattedDate }}</strong>
        </p>

        <!-- Banner di avviso Conflitto -->
        <div *ngIf="hasConflict" class="conflict-banner">
          <div class="banner-header">
            <mat-icon class="conflict-icon">warning</mat-icon>
            <div class="banner-text">
              <strong>Attenzione: Sovrapposizione Oraria!</strong>
              <p>L'orario dell'allenamento si sovrappone al turno di lavoro o all'orario di ufficio del giorno.</p>
            </div>
          </div>
        </div>

        <!-- Box Messaggio WhatsApp per la Struttura -->
        <div *ngIf="(hadInitialConflict || hasConflict) && hasSelectedNewSlot" class="whatsapp-box-section">
          <div class="wa-header">
            <mat-icon class="wa-icon">chat</mat-icon>
            <span>Richiesta per la Struttura (WhatsApp)</span>
          </div>
          <p class="wa-preview">"{{ getWhatsAppPreviewText() }}"</p>
          <button mat-flat-button type="button" class="wa-btn" (click)="copyWhatsAppMessage()">
            <mat-icon>content_copy</mat-icon> Copia Messaggio WhatsApp
          </button>
        </div>

        <form [formGroup]="form" class="activity-form">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Giorno Attività</mat-label>
              <mat-select formControlName="targetDayName" (selectionChange)="onDaySelectChange()">
                <mat-option *ngFor="let day of weekDaysList" [value]="day.name">
                  {{ day.name | titlecase }} ({{ day.fullDate }})
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Per Chi</mat-label>
              <mat-select formControlName="target" (selectionChange)="onFormChange()">
                <mat-option value="Angelo">Angelo 👨‍💻</mat-option>
                <mat-option value="Daiana">Daiana 👩‍⚕️</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Tipologia Attività</mat-label>
              <mat-select formControlName="type" (selectionChange)="onTypeChange()">
                <mat-option value="piscina">🏊‍♂️ Piscina</mat-option>
                <mat-option value="palestra">🏋️‍♂️ Palestra</mat-option>
                <mat-option value="altro">🚴‍♂️ Altro</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Titolo / Descrizione</mat-label>
            <input matInput formControlName="title" placeholder="Es. Allenamento Piscina Corsia 2">
          </mat-form-field>

          <!-- Tabella degli Orari Struttura Selector -->
          <div *ngIf="filteredSlots.length > 0 || alternativeSlots.length > 0" class="slot-selector">
            <label class="slot-label">
              <mat-icon>table_chart</mat-icon> Tabella Orari Disponibili Struttura:
            </label>

            <!-- Orari Giorno Selezionato -->
            <div *ngIf="filteredSlots.length > 0" class="slot-group">
              <span class="slot-group-title">Orari di {{ form.value.targetDayName | titlecase }}:</span>
              <div class="slot-chips">
                <button *ngFor="let slot of filteredSlots" 
                        type="button" 
                        class="slot-chip"
                        [class.active]="form.value.startTime === slot.startTime && form.value.endTime === slot.endTime"
                        (click)="applySlot(slot)">
                  {{ slot.startTime }} - {{ slot.endTime }} {{ slot.label ? '(' + slot.label + ')' : '' }}
                </button>
              </div>
            </div>

            <!-- Orari Alternativi in Altri Giorni -->
            <div *ngIf="alternativeSlots.length > 0" class="slot-group alt-slots">
              <span class="slot-group-title">Sposta ad un altro giorno disponibile:</span>
              <div class="slot-chips">
                <button *ngFor="let alt of alternativeSlots" 
                        type="button" 
                        class="slot-chip alt-chip"
                        (click)="applyAlternativeSlot(alt)">
                  {{ alt.dayName | titlecase }} ({{ alt.fullDate }}): {{ alt.slot.startTime }} - {{ alt.slot.endTime }}
                </button>
              </div>
            </div>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Ora Inizio</mat-label>
              <input matInput type="time" formControlName="startTime" (change)="onFormChange()" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Ora Fine</mat-label>
              <input matInput type="time" formControlName="endTime" (change)="onFormChange()" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Luogo / Struttura (opzionale)</mat-label>
            <input matInput formControlName="location" placeholder="Es. Piscina Comunale">
          </mat-form-field>

          <!-- Toggle Comunicato alla Struttura -->
          <div class="communication-toggle-box" [class.highlight]="hasConflict">
            <mat-slide-toggle formControlName="conflictCommunicated" color="primary">
              Cambio orario / prenotazione comunicata alla struttura
            </mat-slide-toggle>
            <p class="toggle-desc">Spunta questa casella una volta concordato l'orario con la piscina/palestra.</p>
          </div>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button *ngIf="data.activityToEdit" mat-button color="warn" (click)="deleteActivity()">
          <mat-icon>delete</mat-icon> Elimina
        </button>
        <button mat-button (click)="onCancel()">Annulla</button>
        <button mat-raised-button color="primary" [disabled]="form.invalid" (click)="onSave()">
          <mat-icon>save</mat-icon> Salva Attività
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .dialog-container {
      padding: 16px;
      display: flex;
      flex-direction: column;
      height: 100%;
      flex: 1;
      min-height: 0;
      box-sizing: border-box;
      overflow: hidden;
    }
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      color: var(--text-primary) !important;
      flex-shrink: 0;
    }
    .dialog-content {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none !important;
      overflow-y: auto;
      padding: 0 4px !important;
    }
    mat-dialog-actions {
      margin-top: auto;
      flex-shrink: 0;
      padding: 12px 0 0 0;
    }
    .subtitle {
      margin-top: -5px;
      margin-bottom: 15px;
      color: var(--text-secondary) !important;
    }
    .conflict-banner {
      background: rgba(244, 67, 54, 0.12);
      border: 1px solid #f44336;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 15px;
    }
    .banner-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .conflict-icon {
      color: #f44336;
      width: 28px;
      height: 28px;
    }
    .banner-text strong {
      color: #f44336;
      font-size: 14px;
    }
    .banner-text p {
      margin: 3px 0 0 0;
      font-size: 13px;
      color: var(--text-primary) !important;
    }
    .whatsapp-box-section {
      background: rgba(37, 211, 102, 0.08);
      border: 1px solid rgba(37, 211, 102, 0.4);
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wa-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: #25D366;
    }
    .wa-icon {
      color: #25D366;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .wa-preview {
      margin: 0;
      font-size: 13px;
      font-style: italic;
      line-height: 1.4;
      background: var(--bg-card);
      padding: 10px 12px;
      border-left: 4px solid #25D366;
      border-radius: 4px;
      color: var(--text-primary) !important;
    }
    .wa-btn {
      background-color: #25D366 !important;
      color: #ffffff !important;
      font-size: 13px;
      align-self: flex-start;
    }
    .activity-form {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 10px;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-row > * {
      flex: 1;
    }
    .full-width {
      width: 100%;
    }
    .slot-selector {
      margin: 5px 0 15px 0;
      background: var(--bg-hover);
      padding: 10px;
      border-radius: 8px;
      border: 1px solid var(--border-light);
    }
    .slot-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary) !important;
    }
    .slot-group {
      margin-bottom: 8px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    .slot-group-title {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary) !important;
      margin-bottom: 4px;
    }
    .slot-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .slot-chip {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-primary) !important;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .slot-chip:hover {
      background: var(--primary-color) !important;
      color: #ffffff !important;
    }
    .slot-chip.active {
      background: var(--primary-color) !important;
      color: #ffffff !important;
      border-color: var(--primary-color) !important;
      font-weight: 600;
    }
    .slot-chip.alt-chip {
      background: var(--bg-hover) !important;
      border: 1px dashed var(--primary-color) !important;
      color: var(--primary-color) !important;
      &:hover {
        background: var(--primary-color) !important;
        color: #ffffff !important;
      }
    }
    .communication-toggle-box {
      padding: 12px;
      border-radius: 8px;
      background: var(--bg-hover);
      border: 1px solid var(--border-light);
      margin-top: 10px;

      mat-slide-toggle {
        color: var(--text-primary) !important;
      }
    }
    .communication-toggle-box.highlight {
      border-color: #ff9800;
      background: rgba(255, 152, 0, 0.08);
    }
    .toggle-desc {
      margin: 5px 0 0 38px;
      font-size: 11px;
      color: var(--text-secondary) !important;
    }
  `]
})
export class PhysicalActivityDialogComponent implements OnInit {
  form: FormGroup;
  hasConflict: boolean = false;
  hadInitialConflict: boolean = false;
  hasSelectedNewSlot: boolean = false;
  filteredSlots: FacilityTimeSlot[] = [];
  alternativeSlots: { slot: FacilityTimeSlot; dayName: string; fullDate: string; date: Date }[] = [];
  weekDaysList: { name: string; fullDate: string; date: Date; dayOfWeek: number }[] = [];

  private initialCheckDone: boolean = false;
  private initialDayName: string = '';
  private initialStartTime: string = '';
  private initialEndTime: string = '';

  private fb = inject(FormBuilder);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private shiftService = inject(ShiftService);
  public dialogRef = inject(MatDialogRef<PhysicalActivityDialogComponent>);

  constructor(@Inject(MAT_DIALOG_DATA) public data: PhysicalActivityDialogData) {
    const act = data.activityToEdit;
    const initialDay = (data.dayName || 'lunedì').toLowerCase();
    this.initialDayName = initialDay;
    this.initialStartTime = act ? act.startTime : '19:00';
    this.initialEndTime = act ? act.endTime : '20:00';

    this.form = this.fb.group({
      targetDayName: [initialDay, Validators.required],
      target: [act ? act.target : 'Angelo', Validators.required],
      type: [act ? act.type : 'piscina', Validators.required],
      title: [act ? act.title : 'Piscina', Validators.required],
      startTime: [this.initialStartTime, Validators.required],
      endTime: [this.initialEndTime, Validators.required],
      location: [act ? act.location || '' : ''],
      conflictCommunicated: [act ? !!act.conflictCommunicated : false]
    });
  }

  ngOnInit() {
    this.weekDaysList = this.calculateWeekDays(this.data.date || new Date());
    this.updateFilteredSlots();
    this.onFormChange();
  }

  calculateWeekDays(baseDate: Date): { name: string; fullDate: string; date: Date; dayOfWeek: number }[] {
    const d = new Date(baseDate.getTime());
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMon));

    const result = [];
    const dayNames = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday.getTime());
      cur.setDate(monday.getDate() + i);
      const name = dayNames[i];
      const fullDate = cur.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      result.push({
        name,
        fullDate,
        date: cur,
        dayOfWeek: cur.getDay()
      });
    }
    return result;
  }

  get formattedDate(): string {
    if (!this.data.date) return '';
    return new Date(this.data.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  onTypeChange() {
    const currentType = this.form.value.type;
    const titleVal = this.form.value.title;
    if (!titleVal || titleVal === 'Piscina' || titleVal === 'Palestra' || titleVal === 'Attività Fisica') {
      if (currentType === 'piscina') this.form.patchValue({ title: 'Piscina' });
      else if (currentType === 'palestra') this.form.patchValue({ title: 'Palestra' });
      else this.form.patchValue({ title: 'Attività Fisica' });
    }
    this.updateFilteredSlots();
    this.onFormChange();
  }

  onDaySelectChange() {
    this.updateFilteredSlots();
    this.onFormChange();
  }

  updateFilteredSlots() {
    const allSlots = this.data.availableTimeSlots || [];
    const type = this.form.value.type;
    const targetDayName = (this.form.value?.targetDayName || this.data.dayName).toLowerCase();
    const currentTargetDayObj = this.weekDaysList.find(d => d.name === targetDayName);
    const targetDayOfWeek = currentTargetDayObj ? currentTargetDayObj.dayOfWeek : (this.data.date ? new Date(this.data.date).getDay() : -1);

    this.filteredSlots = allSlots.filter(s => {
      const matchType = s.facilityType === type || type === 'altro';
      const matchDay = s.dayOfWeek === undefined || s.dayOfWeek === -1 || s.dayOfWeek === targetDayOfWeek;
      return matchType && matchDay;
    });

    this.alternativeSlots = [];
    allSlots.filter(s => (s.facilityType === type || type === 'altro') && s.dayOfWeek !== -1 && s.dayOfWeek !== targetDayOfWeek)
      .forEach(s => {
        const matchingDay = this.weekDaysList.find(d => d.dayOfWeek === s.dayOfWeek);
        if (matchingDay) {
          this.alternativeSlots.push({
            slot: s,
            dayName: matchingDay.name,
            fullDate: matchingDay.fullDate,
            date: matchingDay.date
          });
        }
      });
  }

  applySlot(slot: FacilityTimeSlot) {
    this.form.patchValue({
      startTime: slot.startTime,
      endTime: slot.endTime
    });
    this.hasSelectedNewSlot = true;
    this.onFormChange();
  }

  applyAlternativeSlot(alt: { slot: FacilityTimeSlot; dayName: string; fullDate: string; date: Date }) {
    this.form.patchValue({
      targetDayName: alt.dayName,
      startTime: alt.slot.startTime,
      endTime: alt.slot.endTime
    });
    this.hasSelectedNewSlot = true;
    this.updateFilteredSlots();
    this.onFormChange();
  }

  onFormChange() {
    const val = this.form.value;
    const targetDayName = (val.targetDayName || this.data.dayName).toLowerCase();

    const testActivity: PhysicalActivity = {
      target: val.target,
      type: val.type,
      title: val.title,
      startTime: val.startTime,
      endTime: val.endTime,
      conflictCommunicated: val.conflictCommunicated,
      isOccasional: true
    };

    let targetAssignment: DayAssignment;
    if (targetDayName === this.data.dayName.toLowerCase()) {
      targetAssignment = { ...this.data.assignment };
    } else if (this.data.weeklyAssignments && this.data.weeklyAssignments[targetDayName]) {
      targetAssignment = { ...this.data.weeklyAssignments[targetDayName] };
    } else {
      targetAssignment = { id: targetDayName };
    }

    const tempAssignment: DayAssignment = {
      ...targetAssignment,
      physicalActivities: [testActivity]
    };

    const checked = checkPhysicalActivityConflicts(tempAssignment);
    this.hasConflict = !!(checked.physicalActivities && checked.physicalActivities[0]?.hasConflict);

    if (!this.initialCheckDone) {
      this.hadInitialConflict = this.hasConflict || !!this.data.activityToEdit?.hasConflict;
      this.initialCheckDone = true;
    } else {
      const curDay = (val.targetDayName || '').toLowerCase();
      if (curDay !== this.initialDayName || val.startTime !== this.initialStartTime || val.endTime !== this.initialEndTime) {
        if (this.hadInitialConflict || this.hasConflict) {
          this.hasSelectedNewSlot = true;
        }
      }
    }
  }

  getWhatsAppPreviewText(): string {
    const val = this.form.value;
    const targetDayName = (val?.targetDayName || this.data.dayName).toLowerCase();
    const originalDateStr = this.data.date ? new Date(this.data.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '';
    const currentTargetObj = this.weekDaysList.find(d => d.name === targetDayName);
    const newDateStr = currentTargetObj ? currentTargetObj.fullDate : originalDateStr;
    const typeName = val.type === 'piscina' ? 'piscina' : (val.type === 'palestra' ? 'palestra' : 'attività fisica');
    const fullName = val.target === 'Daiana' ? "Daiana D'Ottavio" : (val.target === 'Angelo' ? "Angelo Di Florio" : val.target);

    if (targetDayName !== this.data.dayName.toLowerCase()) {
      const origDayTitle = this.data.dayName.charAt(0).toUpperCase() + this.data.dayName.slice(1);
      const newDayTitle = targetDayName.charAt(0).toUpperCase() + targetDayName.slice(1);
      return `Buongiorno! Per la prenotazione ${typeName} di ${fullName} del giorno ${origDayTitle} ${originalDateStr}, causa cambio turno di lavoro vorrei SPOSTARE l'allenamento a ${newDayTitle} ${newDateStr} dalle ${val.startTime} alle ${val.endTime}. È disponibile questo slot? Grazie!`;
    } else {
      return `Buongiorno! Per la prenotazione ${typeName} di ${fullName} del ${originalDateStr}, causa cambio turno di lavoro vorrei spostare l'orario dalle ${val.startTime} alle ${val.endTime}. È disponibile questo slot? Grazie!`;
    }
  }

  copyWhatsAppMessage() {
    const text = this.getWhatsAppPreviewText();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.notification.showSuccess('Messaggio WhatsApp copiato negli appunti!');
      }).catch(() => {
        this.fallbackCopyText(text);
      });
    } else {
      this.fallbackCopyText(text);
    }
  }

  private fallbackCopyText(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      this.notification.showSuccess('Messaggio WhatsApp copiato!');
    } catch (err) {
      this.notification.showError('Impossibile copiare automaticamente. Testo: ' + text);
    }
    document.body.removeChild(textArea);
  }

  async deleteActivity() {
    if (!this.data.activityToEdit) return;
    const ok = await this.confirmService.confirm({
      title: 'Elimina Attività Fisica',
      message: `Vuoi eliminare "${this.data.activityToEdit.title}"?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;

    const currentActs = this.data.assignment?.physicalActivities || [];
    const updatedActs = currentActs.filter(a => a.id !== this.data.activityToEdit?.id);

    const updatedAssignment = {
      ...this.data.assignment,
      physicalActivities: updatedActs
    };

    this.dialogRef.close({ action: 'save', fromDay: this.data.dayName, toDay: this.data.dayName, data: updatedAssignment });
  }

  onSave() {
    if (this.form.invalid) return;

    const formVal = this.form.value;
    const targetDayName = (formVal.targetDayName || this.data.dayName).toLowerCase();
    const isDayMoved = targetDayName !== this.data.dayName.toLowerCase();

    const activityData: PhysicalActivity = {
      id: this.data.activityToEdit?.id || `pa-${Date.now()}`,
      target: formVal.target,
      type: formVal.type,
      title: formVal.title,
      startTime: formVal.startTime,
      endTime: formVal.endTime,
      location: formVal.location,
      conflictCommunicated: formVal.conflictCommunicated,
      hasConflict: this.hasConflict,
      ruleId: this.data.activityToEdit?.ruleId,
      isOccasional: true
    };

    if (isDayMoved) {
      const fromActs = (this.data.assignment?.physicalActivities || []).filter((a: PhysicalActivity) => a.id !== this.data.activityToEdit?.id);
      const updatedFromAssignment = checkPhysicalActivityConflicts({
        ...this.data.assignment,
        physicalActivities: fromActs
      });

      const targetAssignment: DayAssignment = (this.data.weeklyAssignments && this.data.weeklyAssignments[targetDayName])
        ? { ...this.data.weeklyAssignments[targetDayName] }
        : { id: targetDayName, physicalActivities: [] };
      const targetActs = [...(targetAssignment.physicalActivities || []).filter((a: PhysicalActivity) => a.id !== activityData.id), activityData];
      const updatedToAssignment = checkPhysicalActivityConflicts({
        ...targetAssignment,
        physicalActivities: targetActs
      });

      this.dialogRef.close({
        action: 'move',
        fromDay: this.data.dayName,
        toDay: targetDayName,
        updatedFromAssignment,
        updatedToAssignment
      });
    } else {
      const currentActs = this.data.assignment?.physicalActivities || [];
      let updatedActs: PhysicalActivity[] = [];

      if (this.data.activityToEdit) {
        updatedActs = currentActs.map(a => a.id === this.data.activityToEdit?.id ? activityData : a);
      } else {
        updatedActs = [...currentActs, activityData];
      }

      const updatedAssignment = {
        ...this.data.assignment,
        physicalActivities: updatedActs
      };

      const finalAssignment = checkPhysicalActivityConflicts(updatedAssignment);

      this.dialogRef.close({ action: 'save', fromDay: this.data.dayName, toDay: this.data.dayName, data: finalAssignment });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
