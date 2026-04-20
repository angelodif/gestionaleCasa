import { Component, Inject, OnInit } from '@angular/core';
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
import { Shift, Appointment, DayAssignment } from '../../../services/shift/shift.service';

interface DialogData {
  dayName: string;
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
  selectedShiftId: string = '';
  selectedStore: string = 'Cepagatti';
  selectedTabIndex: number = 0;
  selectedAngeloPresence: string = 'home';
  
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
      target: ['Couple', Validators.required]
    });
  }

  ngOnInit() {
    if (this.data.assignment) {
      // @ts-ignore
      this.selectedShiftId = this.data.assignment.shiftId || '';
      // @ts-ignore
      this.selectedStore = this.data.assignment.store || 'Cepagatti';
      // @ts-ignore
      this.selectedAngeloPresence = this.data.assignment.angeloPresence || (this.data.assignment.angeloInOffice ? 'office' : 'home');
    }

    if (this.data.appToEdit) {
      this.appointmentForm.patchValue(this.data.appToEdit);
      this.selectedTabIndex = 1; // Forza il tab impegni se stiamo modificando uno
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
        color: cat?.color || '#607D8B'
      };

      const currentApps = this.data.assignment?.appointments || [];
      let updatedApps;

      if (this.data.appToEdit) {
        // Modifica esistente
        updatedApps = currentApps.map(a => 
          a.id === this.data.appToEdit?.id ? { ...appointmentData, id: a.id } : a
        );
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

  deleteAppointment() {
    if (this.data.appToEdit && confirm(`Sei sicuro di voler eliminare l'impegno "${this.data.appToEdit.title}"?`)) {
      const currentApps = this.data.assignment?.appointments || [];
      const updatedApps = currentApps.filter(a => a.id !== this.data.appToEdit?.id);

      const updatedAssignment = {
        ...this.data.assignment,
        appointments: updatedApps
      };

      this.dialogRef.close({ action: 'save', data: updatedAssignment });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
