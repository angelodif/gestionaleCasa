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
import { MatTabsModule } from '@angular/material/tabs';
import { MatRadioModule } from '@angular/material/radio';
import { Shift, Appointment, DayAssignment, ShiftService, RecurringEvent } from '../../../services/shift/shift.service';
import { PushNotificationService } from '../../../services/push-notification/push-notification.service';
import { ConfirmService } from '../../../services/confirm/confirm.service';

interface DialogData {
  dayName: string;
  date: Date;
  assignment: DayAssignment;
  availableShifts: Shift[];
  stores: string[];
  appointmentCategories: any[];
  appToEdit?: Appointment;
}

@Component({
  selector: 'app-shift-edit-dialog',
  templateUrl: './shift-edit-dialog.component.html',
  styleUrl: './shift-edit-dialog.component.scss',
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
    MatTabsModule,
    MatRadioModule
  ]
})
export class ShiftEditDialogComponent implements OnInit {
  appointmentForm: FormGroup;
  eventForm: FormGroup;
  selectedShiftId: string = '';
  selectedStore: string = 'Cepagatti';
  selectedTabIndex: number = 0;
  selectedAngeloPresence: string = 'home';
  dayEvents: RecurringEvent[] = [];
  editingEventId: string | null = null;
  private pushNotificationService = inject(PushNotificationService);
  private confirmService = inject(ConfirmService);
  private shiftService = inject(ShiftService);
  
  get selectedCategory() {
    const id = this.appointmentForm.get('category')?.value;
    return this.data.appointmentCategories.find(c => c.id === id);
  }

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ShiftEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.appointmentForm = this.fb.group({
      title: ['', Validators.required],
      startTime: ['18:00', Validators.required],
      endTime: ['19:00', Validators.required],
      category: ['other', Validators.required],
      target: ['Couple', Validators.required],
      reminderHours: [1, [Validators.required, Validators.min(0)]],
      reminderMinutes: [0, [Validators.required, Validators.min(0), Validators.max(59)]]
    });

    this.eventForm = this.fb.group({
      name: ['', Validators.required],
      type: ['birthday', Validators.required],
      year: [null],
      target: ['Couple', Validators.required]
    });
  }

  ngOnInit() {
    this.loadDayEvents();
    const prefs = this.pushNotificationService.getPreferences();
    const defaultHours = prefs.appointments?.leadTime?.hours ?? 1;
    const defaultMinutes = prefs.appointments?.leadTime?.minutes ?? 0;

    if (this.data.assignment) {
      this.selectedShiftId = (this.data.assignment as any).shiftId || '';
      this.selectedStore = (this.data.assignment as any).store || 'Cepagatti';
      this.selectedAngeloPresence = this.data.assignment.angeloPresence
        || (this.data.assignment.angeloInOffice ? 'office' : 'home');
    }

    if (this.data.appToEdit) {
      this.appointmentForm.patchValue({
        title: this.data.appToEdit.title,
        startTime: this.data.appToEdit.startTime,
        endTime: this.data.appToEdit.endTime,
        category: this.data.appToEdit.category,
        target: this.data.appToEdit.target,
        reminderHours: this.data.appToEdit.reminderLeadTime ? this.data.appToEdit.reminderLeadTime.hours : defaultHours,
        reminderMinutes: this.data.appToEdit.reminderLeadTime ? this.data.appToEdit.reminderLeadTime.minutes : defaultMinutes
      });
      this.selectedTabIndex = 1; // Forza il tab impegni se stiamo modificando uno
    } else {
      this.appointmentForm.patchValue({
        reminderHours: defaultHours,
        reminderMinutes: defaultMinutes
      });
    }
  }

  onSave() {
    const shift = this.data.availableShifts.find(s => s.id === this.selectedShiftId);
    
    // Costruiamo il risultato finale
    const result: any = {
      ...this.data.assignment,
      store: this.selectedStore,
      angeloPresence: this.selectedAngeloPresence,
      angeloInOffice: this.selectedAngeloPresence === 'office' || this.selectedAngeloPresence === 'office_morning' || this.selectedAngeloPresence === 'office_afternoon'
    };

    if (shift) {
      result.label = shift.label;
      result.startTime = shift.startTime;
      result.endTime = shift.endTime;
      result.shiftId = shift.id;
    } else {
      // Se non c'è turno selezionato, rimuoviamo le property del turno
      delete result.label;
      delete result.startTime;
      delete result.endTime;
      delete result.shiftId;
    }

    this.dialogRef.close({ action: 'save', data: result });
  }

  saveAppointment() {
    if (this.appointmentForm.valid) {
      const cat = this.data.appointmentCategories.find(c => c.id === this.appointmentForm.value.category);
      
      const appointmentData = {
        ...this.appointmentForm.value,
        color: cat?.color || '#607D8B',
        reminderLeadTime: {
          hours: this.appointmentForm.value.reminderHours,
          minutes: this.appointmentForm.value.reminderMinutes
        }
      };
      
      delete appointmentData.reminderHours;
      delete appointmentData.reminderMinutes;

      const currentApps = this.data.assignment?.appointments || [];
      let updatedApps;

      if (this.data.appToEdit) {
        // Modifica esistente
        updatedApps = currentApps.map(a => {
          // Match per ID, o per titolo/ora se l'ID manca (per riparare vecchi import)
          const isSameApp = this.data.appToEdit?.id 
            ? (a.id === this.data.appToEdit.id)
            : (a.title === this.data.appToEdit?.title && a.startTime === this.data.appToEdit?.startTime);

          if (isSameApp) {
            return { ...appointmentData, id: a.id || `fixed-${Date.now()}` };
          }
          return a;
        });
      } else {
        // Nuovo impegno
        const newApp: Appointment = {
          ...appointmentData,
          id: Date.now().toString()
        };
        updatedApps = [...currentApps, newApp];
      }

      const updatedAssignment = {
         ...this.data.assignment,
         appointments: updatedApps
      };

      this.dialogRef.close({ action: 'save', data: updatedAssignment });
    }
  }

  async deleteAppointment() {
    if (!this.data.appToEdit) return;
    const ok = await this.confirmService.confirm({
      title: 'Elimina impegno',
      message: `Sei sicuro di voler eliminare l'impegno "${this.data.appToEdit.title}"?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;

    const currentApps = this.data.assignment?.appointments || [];
    const updatedApps = currentApps.filter(a => a.id !== this.data.appToEdit?.id);

    const updatedAssignment = {
      ...this.data.assignment,
      appointments: updatedApps
    };

    this.dialogRef.close({ action: 'save', data: updatedAssignment });
  }

  onCancel() {
    this.dialogRef.close();
  }

  loadDayEvents() {
    const targetDate = this.data.date || new Date();
    const targetDay = targetDate.getDate();
    const targetMonth = targetDate.getMonth() + 1;
    
    this.shiftService.getRecurringEvents().subscribe(events => {
      this.dayEvents = events.filter(e => e.day === targetDay && e.month === targetMonth);
    });
  }

  get dayAndMonthString(): string {
    const date = this.data.date || new Date();
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long' });
  }

  getAgeText(birthYear: number): string {
    const date = this.data.date || new Date();
    const age = date.getFullYear() - birthYear;
    return ` - compie ${age} anni`;
  }

  editEvent(ev: RecurringEvent) {
    this.editingEventId = ev.id || null;
    this.eventForm.patchValue({
      name: ev.name,
      type: ev.type,
      year: ev.year || null,
      target: ev.target || 'Couple'
    });
  }

  cancelEventEdit() {
    this.editingEventId = null;
    this.eventForm.reset({ type: 'birthday', name: '', year: null, target: 'Couple' });
  }

  saveEvent() {
    if (this.eventForm.invalid) return;
    const targetDate = this.data.date || new Date();
    const newEvent: RecurringEvent = {
      name: this.eventForm.value.name,
      type: this.eventForm.value.type,
      day: targetDate.getDate(),
      month: targetDate.getMonth() + 1,
      target: this.eventForm.value.target || 'Couple'
    };
    if (this.editingEventId) {
      newEvent.id = this.editingEventId;
    }
    if (this.eventForm.value.type === 'birthday' && this.eventForm.value.year) {
      newEvent.year = this.eventForm.value.year;
    }
    
    this.shiftService.saveRecurringEvent(newEvent).then(() => {
      this.cancelEventEdit();
      this.loadDayEvents();
      this.pushNotificationService.scheduleAll();
    });
  }

  async deleteEvent(id: string) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina ricorrenza',
      message: 'Sei sicuro di voler eliminare questa ricorrenza?',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;

    this.shiftService.deleteRecurringEvent(id).then(() => {
      if (this.editingEventId === id) {
        this.cancelEventEdit();
      }
      this.loadDayEvents();
      this.pushNotificationService.scheduleAll();
    });
  }
}
