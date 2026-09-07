import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import { ShiftService, Shift, AppointmentCategory, PhysicalActivityRule, FacilityTimeSlot } from '../../../../services/shift/shift.service';
import { NotificationService } from '../../../../services/notification/notification.service';
import { ConfirmService } from '../../../../services/confirm/confirm.service';

@Component({
  selector: 'app-planner-settings',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    FormsModule,
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule, 
    MatSelectModule,
    MatDividerModule
  ],
  template: `
    <div class="config-section">
      <!-- Definizioni Turno -->
      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon color="primary">work</mat-icon> Definizioni Turno Lavoro
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="shiftForm" (ngSubmit)="saveShift()" class="config-form">
            <mat-form-field appearance="outline">
              <mat-label>Label</mat-label>
              <input matInput formControlName="label">
            </mat-form-field>
            <div class="time-row">
              <mat-form-field appearance="outline">
                <mat-label>Inizio</mat-label>
                <input matInput type="time" formControlName="startTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Fine</mat-label>
                <input matInput type="time" formControlName="endTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>
            </div>
            <button mat-raised-button color="primary" type="submit" [disabled]="shiftForm.invalid">
              Salva Definizione
            </button>
          </form>

          <mat-divider style="margin: 20px 0;"></mat-divider>

          <div class="shifts-list" *ngIf="availableShifts().length > 0">
            <div *ngFor="let s of availableShifts()" class="shift-item">
              <span>{{ s.label }} ({{ s.startTime }}-{{ s.endTime }})</span>
              <button mat-icon-button color="warn" (click)="deleteShiftDefinition(s.id!)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Attività Fisica Ricorrente -->
      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon color="accent">fitness_center</mat-icon> Attività Fisica Ricorrente
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="activityRuleForm" (ngSubmit)="saveActivityRule()" class="config-form">
            <div class="time-row">
              <mat-form-field appearance="outline">
                <mat-label>Per Chi</mat-label>
                <mat-select formControlName="target">
                  <mat-option value="Angelo">Angelo 👨‍💻</mat-option>
                  <mat-option value="Daiana">Daiana 👩‍⚕️</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Tipo</mat-label>
                <mat-select formControlName="type" (selectionChange)="onRuleTypeChange()">
                  <mat-option value="piscina">🏊‍♂️ Piscina</mat-option>
                  <mat-option value="palestra">🏋️‍♂️ Palestra</mat-option>
                  <mat-option value="altro">🚴‍♂️ Altro</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Titolo</mat-label>
              <input matInput formControlName="title" placeholder="Es. Piscina">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Giorno della Settimana</mat-label>
              <mat-select formControlName="dayOfWeek">
                <mat-option *ngFor="let day of daysOfWeek" [value]="day.value">{{ day.label }}</mat-option>
              </mat-select>
            </mat-form-field>

            <div class="time-row">
              <mat-form-field appearance="outline">
                <mat-label>Ora Inizio</mat-label>
                <input matInput type="time" formControlName="startTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ora Fine</mat-label>
                <input matInput type="time" formControlName="endTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>
            </div>

            <button mat-raised-button color="accent" type="submit" [disabled]="activityRuleForm.invalid">
              Aggiungi Ricorrenza
            </button>
          </form>

          <mat-divider style="margin: 20px 0;"></mat-divider>

          <div class="shifts-list" *ngIf="activityRules().length > 0">
            <div *ngFor="let r of activityRules()" class="shift-item">
              <div>
                <strong>{{ r.target }}</strong> - {{ getDayLabel(r.dayOfWeek) }}: 
                <span>{{ r.title }} ({{ r.startTime }}-{{ r.endTime }})</span>
              </div>
              <button mat-icon-button color="warn" (click)="deleteActivityRule(r.id!)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Tabella Orari Struttura -->
      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon style="color: #4caf50;">table_chart</mat-icon> Tabella Orari Struttura
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="timeSlotForm" (ngSubmit)="saveTimeSlot()" class="config-form">
            <div class="time-row">
              <mat-form-field appearance="outline">
                <mat-label>Struttura</mat-label>
                <mat-select formControlName="facilityType">
                  <mat-option value="piscina">🏊‍♂️ Piscina</mat-option>
                  <mat-option value="palestra">🏋️‍♂️ Palestra</mat-option>
                  <mat-option value="altro">🚴‍♂️ Altro</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Giorno (opzionale)</mat-label>
                <mat-select formControlName="dayOfWeek">
                  <mat-option [value]="-1">Tutti i giorni</mat-option>
                  <mat-option *ngFor="let day of daysOfWeek" [value]="day.value">{{ day.label }}</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div class="time-row">
              <mat-form-field appearance="outline">
                <mat-label>Ora Inizio</mat-label>
                <input matInput type="time" formControlName="startTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ora Fine</mat-label>
                <input matInput type="time" formControlName="endTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Etichetta Slot (opzionale)</mat-label>
              <input matInput formControlName="label" placeholder="Es. Turno Serale Corsia 3">
            </mat-form-field>

            <button mat-raised-button style="background-color: #4caf50; color: white;" type="submit" [disabled]="timeSlotForm.invalid">
              Aggiungi Slot Orario
            </button>
          </form>

          <mat-divider style="margin: 20px 0;"></mat-divider>

          <div class="shifts-list" *ngIf="facilityTimeSlots().length > 0">
            <div *ngFor="let slot of facilityTimeSlots()" class="shift-item">
              <div>
                <strong style="text-transform: capitalize;">{{ slot.facilityType }}</strong> 
                <span *ngIf="slot.dayOfWeek !== undefined && slot.dayOfWeek !== -1"> ({{ getDayLabel(slot.dayOfWeek) }})</span>:
                <span>{{ slot.startTime }}-{{ slot.endTime }} {{ slot.label ? '[' + slot.label + ']' : '' }}</span>
              </div>
              <button mat-icon-button color="warn" (click)="deleteTimeSlot(slot.id!)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Categorie Impegno -->
      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>Configura Categorie Impegno</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="config-form">
            <mat-form-field appearance="outline">
              <mat-label>Nome Categoria</mat-label>
              <input matInput formControlName="label" placeholder="Es. Visita Medica">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Icona</mat-label>
              <mat-select formControlName="icon">
                <mat-option *ngFor="let icon of availableIcons" [value]="icon">
                  <mat-icon>{{ icon }}</mat-icon> {{ icon }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="color-picker-field">
              <mat-label>Colore</mat-label>
              <input matInput type="color" formControlName="color">
            </mat-form-field>

            <button mat-raised-button color="accent" type="submit" [disabled]="categoryForm.invalid">
              Aggiungi Categoria
            </button>
          </form>

          <mat-divider style="margin: 20px 0;"></mat-divider>

          <div class="categories-list">
            <div *ngFor="let cat of appointmentCategories()" class="cat-item">
              <div class="cat-info">
                <mat-icon [style.color]="cat.color">{{ cat.icon }}</mat-icon>
                <span>{{ cat.label }}</span>
              </div>
              <button mat-icon-button color="warn" (click)="deleteCategory(cat.id!)">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .config-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .config-card {
      background: var(--bg-card) !important;
      border: 1px solid var(--border-light) !important;
      border-radius: 15px;
      
      mat-card-title {
        color: var(--text-primary) !important;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
      }
    }
    .config-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 15px;
    }
    .time-row {
      display: flex;
      gap: 10px;
    }
    .time-row > * {
      flex: 1;
    }
    .categories-list, .shifts-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cat-item, .shift-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-hover) !important;
      color: var(--text-primary) !important;
      border: 1px solid var(--border-light);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .cat-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .color-picker-field {
      width: 100px;
    }
  `]
})
export class PlannerSettingsComponent implements OnInit, OnDestroy {
  private shiftService = inject(ShiftService);
  private fb = inject(FormBuilder);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);

  private shiftsSub?: Subscription;
  private catsSub?: Subscription;
  private rulesSub?: Subscription;
  private slotsSub?: Subscription;

  availableShifts = signal<Shift[]>([]);
  appointmentCategories = signal<AppointmentCategory[]>([]);
  activityRules = signal<PhysicalActivityRule[]>([]);
  facilityTimeSlots = signal<FacilityTimeSlot[]>([]);

  availableIcons = ['spa', 'directions_car', 'work', 'interests', 'face', 'fitness_center', 'shopping_basket', 'restaurant', 'school', 'movie', 'pets', 'home_repair_service'];

  daysOfWeek = [
    { value: 1, label: 'Lunedì' },
    { value: 2, label: 'Martedì' },
    { value: 3, label: 'Mercoledì' },
    { value: 4, label: 'Giovedì' },
    { value: 5, label: 'Venerdì' },
    { value: 6, label: 'Sabato' },
    { value: 0, label: 'Domenica' }
  ];

  shiftForm: FormGroup = this.fb.group({
    label: ['', Validators.required],
    startTime: ['08:00', Validators.required],
    endTime: ['14:00', Validators.required]
  });

  categoryForm: FormGroup = this.fb.group({
    label: ['', Validators.required],
    icon: ['interests', Validators.required],
    color: ['#607d8b', Validators.required],
    description: ['']
  });

  activityRuleForm: FormGroup = this.fb.group({
    target: ['Angelo', Validators.required],
    type: ['piscina', Validators.required],
    title: ['Piscina', Validators.required],
    dayOfWeek: [1, Validators.required],
    startTime: ['19:00', Validators.required],
    endTime: ['20:00', Validators.required]
  });

  timeSlotForm: FormGroup = this.fb.group({
    facilityType: ['piscina', Validators.required],
    dayOfWeek: [-1],
    startTime: ['19:00', Validators.required],
    endTime: ['20:00', Validators.required],
    label: ['']
  });

  ngOnInit() {
    this.loadShifts();
    this.loadCategories();
    this.loadActivityRules();
    this.loadTimeSlots();
  }

  ngOnDestroy() {
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    if (this.catsSub) this.catsSub.unsubscribe();
    if (this.rulesSub) this.rulesSub.unsubscribe();
    if (this.slotsSub) this.slotsSub.unsubscribe();
  }

  getDayLabel(dayValue: number): string {
    return this.daysOfWeek.find(d => d.value === dayValue)?.label || '';
  }

  loadShifts() {
    this.shiftsSub = this.shiftService.getShifts().subscribe(data => {
      this.availableShifts.set(data.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    });
  }

  loadCategories() {
    this.catsSub = this.shiftService.getCategories().subscribe(data => {
      this.appointmentCategories.set(data);
    });
  }

  loadActivityRules() {
    this.rulesSub = this.shiftService.getPhysicalActivityRules().subscribe(data => {
      this.activityRules.set(data);
    });
  }

  loadTimeSlots() {
    this.slotsSub = this.shiftService.getFacilityTimeSlots().subscribe(data => {
      this.facilityTimeSlots.set(data.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    });
  }

  onRuleTypeChange() {
    const t = this.activityRuleForm.value.type;
    if (t === 'piscina') this.activityRuleForm.patchValue({ title: 'Piscina' });
    else if (t === 'palestra') this.activityRuleForm.patchValue({ title: 'Palestra' });
  }

  async saveShift() {
    if (this.shiftForm.valid) {
      try {
        await this.shiftService.addShift(this.shiftForm.value);
        this.notification.showSuccess('Definizione turno salvata!');
        this.shiftForm.patchValue({ label: '' });
      } catch (error: any) {}
    }
  }

  async deleteShiftDefinition(id: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina definizione turno',
      message: 'Vuoi eliminare questa definizione di turno?',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      await this.shiftService.deleteShift(id);
      this.notification.showSuccess('Definizione eliminata.');
    } catch (error: any) {}
  }

  async saveActivityRule() {
    if (this.activityRuleForm.valid) {
      try {
        await this.shiftService.savePhysicalActivityRule(this.activityRuleForm.value);
        this.notification.showSuccess('Regola attività fisica salvata!');
      } catch (error: any) {}
    }
  }

  async deleteActivityRule(id: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina regola',
      message: 'Vuoi eliminare questa regola per l\'attività fisica?',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      await this.shiftService.deletePhysicalActivityRule(id);
      this.notification.showSuccess('Regola eliminata.');
    } catch (error: any) {}
  }

  async saveTimeSlot() {
    if (this.timeSlotForm.valid) {
      try {
        await this.shiftService.saveFacilityTimeSlot(this.timeSlotForm.value);
        this.notification.showSuccess('Slot orario aggiunto!');
      } catch (error: any) {}
    }
  }

  async deleteTimeSlot(id: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina slot orario',
      message: 'Vuoi eliminare questo slot orario della struttura?',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      await this.shiftService.deleteFacilityTimeSlot(id);
      this.notification.showSuccess('Slot eliminato.');
    } catch (error: any) {}
  }

  async saveCategory() {
    if (this.categoryForm.valid) {
      try {
        await this.shiftService.addCategory(this.categoryForm.value);
        this.notification.showSuccess('Categoria aggiunta!');
        this.categoryForm.reset({ icon: 'interests', color: '#607d8b' });
      } catch (error: any) {}
    }
  }

  async deleteCategory(id: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina categoria',
      message: 'Vuoi eliminare questa categoria?',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    try {
      await this.shiftService.deleteCategory(id);
      this.notification.showSuccess('Categoria eliminata.');
    } catch (error: any) {}
  }
}
