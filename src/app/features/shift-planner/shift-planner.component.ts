import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ShiftService, Shift, Appointment, DayAssignment } from '../../services/shift/shift.service';
import { Subscription, interval } from 'rxjs';
import { Router } from '@angular/router';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ShiftEditDialogComponent } from './shift-edit-dialog/shift-edit-dialog.component';
import { DateSelectionDialogComponent } from './date-selection-dialog/date-selection-dialog.component';

@Component({
  selector: 'app-shift-planner',
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
    MatDividerModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatMenuModule,
    MatDialogModule,
    DateSelectionDialogComponent
  ],
  templateUrl: './shift-planner.component.html',
  styleUrl: './shift-planner.component.scss'
})
export class ShiftPlannerComponent implements OnInit, OnDestroy {
  private shiftService = inject(ShiftService);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private shiftsSub?: Subscription;
  private weeklySub?: Subscription;
  private nowSub?: Subscription;
  private catsSub?: Subscription;

  readonly DEFAULT_START_HOUR = 5;
  readonly DEFAULT_END_HOUR = 22;
  currentRowHeight = 30;

  startHour = this.DEFAULT_START_HOUR;
  endHour = this.DEFAULT_END_HOUR;
  hours = Array.from({ length: this.endHour - this.startHour + 1 }, (_, i) => i + this.startHour);

  currentWeekStart: Date = this.getStartOfWeek(new Date());
  weekDays: { name: string, date: Date, fullDate: string }[] = [];

  availableShifts: Shift[] = [];
  weeklyAssignments: { [key: string]: any } = {};
  nowPos: number = -1;

  stores = ['Cepagatti', 'C.da Celestino'];

  appointmentCategories: any[] = [];

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
    this.updateWeek();
    this.startNowTimer();
  }

  ngOnDestroy() {
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    if (this.weeklySub) this.weeklySub.unsubscribe();
    if (this.nowSub) this.nowSub.unsubscribe();
    if (this.catsSub) this.catsSub.unsubscribe();
  }

  startNowTimer() {
    this.updateNowPosition();
    this.nowSub = interval(60000).subscribe(() => this.updateNowPosition());
  }

  updateNowPosition() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (h >= this.startHour && h <= this.endHour) {
      this.nowPos = ((h - this.startHour) * 60 + m) / 60 * this.currentRowHeight;
    } else {
      this.nowPos = -1;
    }
  }

  getTargetClass(target: string): string {
    switch (target) {
      case 'Angelo': return 'target-angelo';
      case 'Daiana': return 'target-daiana';
      case 'Couple': return 'target-couple';
      default: return '';
    }
  }


  // --- LOGICA SETTIMANE ---

  getStartOfWeek(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Regola per far iniziare la settimana di Lunedì
    date.setHours(0, 0, 0, 0);
    return new Date(date.setDate(diff));
  }

  updateWeek() {
    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(this.currentWeekStart.getDate() + i);
      this.weekDays.push({
        name: date.toLocaleDateString('it-IT', { weekday: 'long' }),
        date: date,
        fullDate: date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      });
    }
    this.loadWeeklyData();
  }

  changeWeek(offset: number) {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() + (offset * 7));
    this.currentWeekStart = new Date(this.currentWeekStart); // Trigger change detection
    this.updateWeek();
  }

  get weekTitle(): string {
    const end = new Date(this.currentWeekStart);
    end.setDate(this.currentWeekStart.getDate() + 6);
    const options: any = { day: 'numeric', month: 'long' };
    return `${this.currentWeekStart.toLocaleDateString('it-IT', options)} - ${end.toLocaleDateString('it-IT', options)}`;
  }

  get weekId(): string {
    const d = new Date(this.currentWeekStart);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  }

  // --- DATABASE ---

  loadShifts() {
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    this.shiftsSub = this.shiftService.getShifts().subscribe(data => {
      this.availableShifts = data.sort((a, b) => {
        const aIsExtra = a.label.toLowerCase().startsWith('extra');
        const bIsExtra = b.label.toLowerCase().startsWith('extra');
        if (aIsExtra && !bIsExtra) return 1;
        if (!aIsExtra && bIsExtra) return -1;
        return a.startTime.localeCompare(b.startTime);
      });
    });
  }

  loadCategories() {
    if (this.catsSub) this.catsSub.unsubscribe();
    this.catsSub = this.shiftService.getCategories().subscribe(data => {
      this.appointmentCategories = data;
      this.cdr.detectChanges();
      // Seed eseguito dopo che Firestore ha risposto (una volta sola)
      this.seedDefaultCategories();
    });
  }

  private _seeded = false;
  async seedDefaultCategories() {
    if (this._seeded) return; // Esegui solo alla prima emissione
    this._seeded = true;

    const defaultCategories = [
      { label: 'Bellezza', icon: 'spa', color: '#e91e63', description: 'Parrucchiere, estetista, ecc.' },
      { label: 'Trasporti', icon: 'directions_car', color: '#607d8b', description: 'Spostamenti e viaggio' },
      { label: 'Secondo lavoro', icon: 'work', color: '#7b1fa2', description: 'Attività extra' },
      { label: 'Altro', icon: 'interests', color: '#455a64', description: 'Impegni vari' },
      { label: 'Visita Medica', icon: 'medical_services', color: '#0288d1', description: 'Visite mediche e appuntamenti sanitari' },
    ];

    for (const cat of defaultCategories) {
      const alreadyExists = this.appointmentCategories.some(
        c => c.label?.toLowerCase() === cat.label.toLowerCase()
      );
      if (!alreadyExists) {
        try {
          await this.shiftService.addCategory(cat);
        } catch (e) {
          console.warn(`seedDefaultCategories: errore su "${cat.label}"`, e);
        }
      }
    }
  }

  loadWeeklyData() {
    if (this.weeklySub) this.weeklySub.unsubscribe();
    this.weeklySub = this.shiftService.getWeeklyPlanner(this.weekId).subscribe(data => {
      const assignments: any = {};
      data.forEach((item: any) => assignments[item.id] = item);
      this.weeklyAssignments = assignments;
      this.adjustGridRange();
      this.cdr.detectChanges();
    });
  }

  adjustGridRange() {
    let min = this.DEFAULT_START_HOUR;
    let max = this.DEFAULT_END_HOUR;

    Object.values(this.weeklyAssignments).forEach((day: any) => {
      if (day.startTime) {
        const h = parseInt(day.startTime.split(':')[0]);
        if (h < min) min = h;
      }
      if (day.endTime) {
        const h = parseInt(day.endTime.split(':')[0]);
        if (h >= max) max = h + 1;
      }
      if (day.appointments) {
        day.appointments.forEach((app: any) => {
          const hStart = parseInt(app.startTime.split(':')[0]);
          const hEnd = parseInt(app.endTime.split(':')[0]);
          if (hStart < min) min = hStart;
          if (hEnd >= max) max = hEnd + 1;
        });
      }
    });

    this.startHour = min;
    this.endHour = max;
    const totalHours = this.endHour - this.startHour + 1;
    this.hours = Array.from({ length: totalHours }, (_, i) => i + this.startHour);

    // Se abbiamo troppe ore, riduciamo l'altezza delle righe per farle entrare
    if (totalHours > 18) {
      this.currentRowHeight = Math.max(22, Math.floor((18 * 30) / totalHours));
    } else {
      this.currentRowHeight = 30;
    }
  }


  onDateChange(date: Date) {
    if (date) {
      this.currentWeekStart = this.getStartOfWeek(date);
      this.updateWeek();
    }
  }

  openDatePickerDialog() {
    const dialogRef = this.dialog.open(DateSelectionDialogComponent, {
      width: '400px',
      maxWidth: '95vw',
      panelClass: 'custom-edit-dialog',
      data: { initialDate: this.currentWeekStart }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result instanceof Date) {
        this.currentWeekStart = this.getStartOfWeek(result);
        this.updateWeek();
      }
    });
  }


  openEditDialog(dayName: string, appToEdit?: Appointment) {
    const dialogRef = this.dialog.open(ShiftEditDialogComponent, {
      maxWidth: '600px',
      width: '100%',
      panelClass: 'custom-edit-dialog',
      data: {
        dayName: dayName,
        assignment: this.weeklyAssignments[dayName] || { id: dayName },
        availableShifts: this.availableShifts,
        stores: this.stores,
        appointmentCategories: this.appointmentCategories,
        appToEdit: appToEdit
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'save') {
        this.shiftService.saveDayAssignment(dayName, result.data, this.weekId);
      }
    });
  }

  async deleteShift(dayName: string) {
    if (confirm(`Vuoi eliminare il turno di Daiana del ${dayName}?`)) {
      try {
        const current = this.weeklyAssignments[dayName];
        const updated = { ...current };
        delete updated.label;
        delete updated.startTime;
        delete updated.endTime;
        delete updated.shiftId;
        delete updated.store;

        await this.shiftService.saveDayAssignment(dayName, updated, this.weekId);
      } catch (e) {
        console.error("Errore eliminazione turno:", e);
      }
    }
  }

  async deleteAllAppointments(dayName: string) {
    if (confirm(`Vuoi eliminare TUTTI gli impegni di ${dayName}?`)) {
      try {
        const current = this.weeklyAssignments[dayName];
        const updated = { ...current, appointments: [] };
        await this.shiftService.saveDayAssignment(dayName, updated, this.weekId);
      } catch (e) {
        console.error("Errore eliminazione impegni:", e);
      }
    }
  }

  hasShift(dayName: string): boolean {
    const a = this.weeklyAssignments[dayName];
    return !!(a && (a.label || a.shiftId));
  }

  hasAppointments(dayName: string): boolean {
    const a = this.weeklyAssignments[dayName];
    return !!(a && a.appointments && a.appointments.length > 0);
  }

  // --- CALCOLI UI ---
  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  calculatePosition(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return ((h - this.startHour) * 60 + m) / 60 * this.currentRowHeight;
  }

  calculateHeight(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? (diff / 60) * this.currentRowHeight : 0;
  }

  async saveShift() {
    if (this.shiftForm.valid) {
      await this.shiftService.addShift(this.shiftForm.value);
      this.shiftForm.reset({ startTime: '08:00', endTime: '14:00' });
    }
  }

  async saveCategory() {
    if (this.categoryForm.valid) {
      await this.shiftService.addCategory(this.categoryForm.value);
      this.categoryForm.reset({ icon: 'interests', color: '#607d8b' });
    }
  }

  async deleteCategory(id: string) {
    if (confirm('Vuoi eliminare questa categoria?')) {
      await this.shiftService.deleteCategory(id);
    }
  }

  getCategoryIcon(catId: string): string {
    return this.appointmentCategories.find(c => c.id === catId)?.icon || 'event';
  }

  getShortLabel(title: string): string {
    if (!title) return '';
    const parts = title.split(' ');
    if (parts.length === 1) return title.substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  isShort(startTime: string, endTime: string): boolean {
    const pixels = this.calculateHeight(startTime, endTime);
    return pixels <= this.currentRowHeight + 1;
  }

  goBack() {

    this.router.navigate(['/dashboard']);
  }


}