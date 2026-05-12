import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, NgZone, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ShiftService, Shift, Appointment, DayAssignment, AppointmentCategory } from '../../services/shift/shift.service';
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
import { PlannerSettingsComponent } from './components/planner-settings/planner-settings.component';
import { NotificationService } from '../../services/notification/notification.service';

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
    DateSelectionDialogComponent,
    PlannerSettingsComponent
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
  private ngZone = inject(NgZone);
  private notification = inject(NotificationService);

  private shiftsSub?: Subscription;
  private weeklySub?: Subscription;
  private nowSub?: Subscription;
  private catsSub?: Subscription;
  
  // State using Signals
  currentWeekStart = signal<Date>(this.getStartOfWeek(new Date()));
  weeklyAssignments = signal<{[key: string]: any}>({});
  appointmentCategories = signal<AppointmentCategory[]>([]);
  
  // Computed Signals (Automatic updates)
  weekId = computed(() => {
    const d = new Date(this.currentWeekStart());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  });

  weekTitle = computed(() => {
    const start = this.currentWeekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const options: any = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('it-IT', options)} - ${end.toLocaleDateString('it-IT', options)}`;
  });

  weekDays = computed(() => {
    const start = this.currentWeekStart();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push({
        name: date.toLocaleDateString('it-IT', { weekday: 'long' }),
        date: date,
        fullDate: date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      });
    }
    return days;
  });

  readonly DEFAULT_START_HOUR = 5;
  readonly DEFAULT_END_HOUR = 22;
  currentRowHeight = 30;

  startHour = this.DEFAULT_START_HOUR;
  endHour = this.DEFAULT_END_HOUR;
  hours = Array.from({ length: this.endHour - this.startHour + 1 }, (_, i) => i + this.startHour);

  availableShifts: Shift[] = [];
  nowPos: number = -1;

  stores = ['Cepagatti', 'Spoltore', 'Lanciano', 'Montesilvano', 'Silvi'];

  constructor() {
    // Re-load data automatically when weekId changes
    effect(() => {
      const id = this.weekId();
      this.ngZone.run(() => this.loadWeeklyData(id));
    });
  }

  ngOnInit() {
    this.loadShifts();
    this.loadCategories();
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

  getTooltipText(app: Appointment): string {
    const targetMap: Record<string, string> = {
      'Angelo': 'Angelo',
      'Daiana': 'Daiana',
      'Couple': 'entrambi'
    };
    const targetLabel = targetMap[app.target] || app.target;
    return `${app.title} (${app.startTime} - ${app.endTime}) per ${targetLabel}`;
  }


  // --- LOGICA SETTIMANE ---

  getStartOfWeek(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Regola per far iniziare la settimana di Lunedì
    date.setHours(0, 0, 0, 0);
    return new Date(date.setDate(diff));
  }

  changeWeek(offset: number) {
    this.currentWeekStart.update(start => {
      const newDate = new Date(start);
      newDate.setDate(start.getDate() + (offset * 7));
      return newDate;
    });
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
      this.appointmentCategories.set(data);
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

    const toAdd = defaultCategories.filter(cat => 
      !this.appointmentCategories().some(c => c.label?.toLowerCase() === cat.label.toLowerCase())
    );

    if (toAdd.length > 0) {
      try {
        await this.shiftService.addCategoriesBatch(toAdd);
        this.notification.showSuccess('Configurazione iniziale categorie completata!');
      } catch (error: any) {
        console.warn(`seedDefaultCategories: errore nel batch`, error);
      }
    }
  }

  loadWeeklyData(id: string) {
    if (this.weeklySub) this.weeklySub.unsubscribe();
    this.weeklySub = this.shiftService.getWeeklyPlanner(id).subscribe(data => {
      const assignments: any = {};
      data.forEach((item: any) => assignments[item.id] = item);
      this.weeklyAssignments.set(assignments);
      this.adjustGridRange();
    });
  }

  adjustGridRange() {
    let min = this.DEFAULT_START_HOUR;
    let max = this.DEFAULT_END_HOUR;

    Object.values(this.weeklyAssignments()).forEach((day: any) => {
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
      this.currentWeekStart.set(this.getStartOfWeek(date));
    }
  }

  openDatePickerDialog() {
    const dialogRef = this.dialog.open(DateSelectionDialogComponent, {
      width: '400px',
      maxWidth: '95vw',
      panelClass: 'custom-edit-dialog',
      data: { initialDate: this.currentWeekStart() }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result instanceof Date) {
        this.currentWeekStart.set(this.getStartOfWeek(result));
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
        assignment: this.weeklyAssignments()[dayName] || { id: dayName },
        availableShifts: this.availableShifts,
        stores: this.stores,
        appointmentCategories: this.appointmentCategories(),
        appToEdit: appToEdit
      }
    });

    // Fix mat-form-field outline dopo l'animazione del dialog
    dialogRef.afterOpened().subscribe(() => {
      this.ngZone.run(() => window.dispatchEvent(new Event('resize')));
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.action === 'save') {
        try {
          await this.shiftService.saveDayAssignment(dayName, result.data, this.weekId());
          this.notification.showSuccess('Piano giornaliero aggiornato!');
        } catch (error: any) {
          // L'errore è già gestito dal servizio
        }
      }
    });
  }

  async deleteShift(dayName: string) {
    if (confirm(`Vuoi eliminare il turno di Daiana del ${dayName}?`)) {
      try {
        const current = this.weeklyAssignments()[dayName];
        const updated = { ...current };
        delete updated.label;
        delete updated.startTime;
        delete updated.endTime;
        delete updated.shiftId;
        delete updated.store;

        await this.shiftService.saveDayAssignment(dayName, updated, this.weekId());
        this.notification.showSuccess('Turno rimosso.');
      } catch (error: any) {
        this.notification.showError("Errore eliminazione turno.");
      }
    }
  }

  async deleteAllAppointments(dayName: string) {
    if (confirm(`Vuoi eliminare TUTTI gli impegni di ${dayName}?`)) {
      try {
        const current = this.weeklyAssignments()[dayName];
        const updated = { ...current, appointments: [] };
        await this.shiftService.saveDayAssignment(dayName, updated, this.weekId());
        this.notification.showSuccess('Tutti gli impegni rimossi.');
      } catch (error: any) {
        this.notification.showError("Errore eliminazione impegni.");
      }
    }
  }

  hasShift(dayName: string): boolean {
    const a = this.weeklyAssignments()[dayName];
    return !!(a && (a.label || a.shiftId));
  }

  hasAppointments(dayName: string): boolean {
    const a = this.weeklyAssignments()[dayName];
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


  getCategoryIcon(catId: string): string {
    return this.appointmentCategories().find(c => c.id === catId)?.icon || 'event';
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