import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ShiftService, Shift } from '../../services/shift/shift.service';
import { Subscription } from 'rxjs';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-shift-planner',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    FormsModule
  ],
  templateUrl: './shift-planner.component.html',
  styleUrl: './shift-planner.component.scss'
})
export class ShiftPlannerComponent implements OnInit, OnDestroy {
  private shiftService = inject(ShiftService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private shiftsSub?: Subscription;
  private weeklySub?: Subscription;

  readonly START_HOUR = 5;
  readonly ROW_HEIGHT = 30; // Ottimizzato per schermi tablet

  hours = Array.from({ length: 17 }, (_, i) => i + this.START_HOUR);

  // Logica Date
  currentWeekStart: Date = this.getStartOfWeek(new Date());
  weekDays: { name: string, date: Date, fullDate: string }[] = [];

  availableShifts: Shift[] = [];
  weeklyAssignments: any = {};
  editingDay: string | null = null;
  
  stores = ['Cepagatti', 'Spoltore', 'Montesilvano', 'Chieti', 'Lanciano'];
  tempStoreSelection: { [day: string]: string } = {};

  shiftForm: FormGroup = this.fb.group({
    label: ['', Validators.required],
    startTime: ['08:00', Validators.required],
    endTime: ['14:00', Validators.required]
  });

  ngOnInit() {
    this.loadShifts();
    this.updateWeek();
  }

  ngOnDestroy() {
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    if (this.weeklySub) this.weeklySub.unsubscribe();
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
    return `Turni Settimana: ${this.currentWeekStart.toLocaleDateString('it-IT', options)} - ${end.toLocaleDateString('it-IT', options)}`;
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
      this.cdr.detectChanges();
    });
  }

  loadWeeklyData() {
    // Passiamo il weekId al service e resettiamo la sub precedente
    if (this.weeklySub) this.weeklySub.unsubscribe();
    this.weeklySub = this.shiftService.getWeeklyPlanner(this.weekId).subscribe(data => {
      const assignments: any = {};
      data.forEach((item: any) => assignments[item.id] = item);
      this.weeklyAssignments = assignments;
      this.cdr.detectChanges(); // Forza il re-render in caso Firebase risponda fuori dalla NgZone
    });
  }

  async assignShift(dayName: string, shiftId: string) {
    const selected = this.availableShifts.find(s => s.id === shiftId);
    if (selected) {
      try {
        // Qui passiamo (ID_GIORNO, DATI, ID_SETTIMANA)
        await this.shiftService.saveDayAssignment(dayName, {
          label: selected.label,
          startTime: selected.startTime,
          endTime: selected.endTime,
          shiftId: selected.id,
          store: this.tempStoreSelection[dayName] || 'Cepagatti'
        }, this.weekId); // <--- Questo è il terzo argomento

        this.editingDay = null;
      } catch (e) {
        console.error("Errore salvataggio:", e);
      }
    }
  }
  async deleteAssignment(dayName: string) {
    if (confirm(`Vuoi eliminare il turno di ${dayName}?`)) {
      try {
        await this.shiftService.deleteDayAssignment(dayName, this.weekId);
      } catch (e) { console.error(e); }
    }
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
    return ((h - this.START_HOUR) * 60 + m) / 60 * this.ROW_HEIGHT;
  }

  calculateHeight(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? (diff / 60) * this.ROW_HEIGHT : 0;
  }

  toggleEdit(day: string) {
    this.editingDay = (this.editingDay === day) ? null : day;
    if (this.editingDay) {
      this.tempStoreSelection[day] = this.weeklyAssignments[day]?.store || 'Cepagatti';
    }
  }

  async saveShift() {
    if (this.shiftForm.valid) {
      await this.shiftService.addShift(this.shiftForm.value);
      this.shiftForm.reset({ startTime: '08:00', endTime: '14:00' });
    }
  }
  goBack() {
    this.router.navigate(['/dashboard']);
  }


}