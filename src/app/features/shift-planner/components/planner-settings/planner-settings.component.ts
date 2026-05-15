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
import { ShiftService, Shift, AppointmentCategory } from '../../../../services/shift/shift.service';
import { NotificationService } from '../../../../services/notification/notification.service';

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
      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>Configura Definizioni Turno</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="shiftForm" (ngSubmit)="saveShift()" class="config-form">
            <mat-form-field appearance="outline">
              <mat-label>Label</mat-label>
              <input matInput formControlName="label">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Inizio</mat-label>
              <input matInput type="time" formControlName="startTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Fine</mat-label>
              <input matInput type="time" formControlName="endTime" (click)="$any($event.target).showPicker && $any($event.target).showPicker()">
            </mat-form-field>
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

      <mat-card class="config-card">
        <mat-card-header>
          <mat-card-title>Configura Categorie Impegno</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="config-form">
            <mat-form-field appearance="outline">
              <mat-label>Nome Categoria</mat-label>
              <input matInput formControlName="label" placeholder="Es. Palestra">
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
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    .config-card {
      background: var(--bg-card) !important;
      border: 1px solid var(--border-light) !important;
      border-radius: 15px;
      
      mat-card-title {
        color: var(--text-primary) !important;
      }
    }
    .config-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 15px;
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

  private shiftsSub?: Subscription;
  private catsSub?: Subscription;

  availableShifts = signal<Shift[]>([]);
  appointmentCategories = signal<AppointmentCategory[]>([]);
  availableIcons = ['spa', 'directions_car', 'work', 'interests', 'face', 'fitness_center', 'shopping_basket', 'restaurant', 'school', 'movie', 'pets', 'home_repair_service'];

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

  ngOnInit() {
    this.loadShifts();
    this.loadCategories();
  }

  ngOnDestroy() {
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    if (this.catsSub) this.catsSub.unsubscribe();
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
    if (confirm('Vuoi eliminare questa definizione di turno?')) {
      try {
        await this.shiftService.deleteShift(id);
        this.notification.showSuccess('Definizione eliminata.');
      } catch (error: any) {}
    }
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
    if (confirm('Vuoi eliminare questa categoria?')) {
      try {
        await this.shiftService.deleteCategory(id);
        this.notification.showSuccess('Categoria eliminata.');
      } catch (error: any) {}
    }
  }
}
