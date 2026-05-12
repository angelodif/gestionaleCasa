import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { WasteService, WasteType, WasteSchedule, WasteException } from '../../services/waste/waste.service';
import { NotificationService } from '../../services/notification/notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-waste-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './waste-management.component.html',
  styleUrl: './waste-management.component.scss'
})
export class WasteManagementComponent implements OnInit {
  private wasteService = inject(WasteService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private notification = inject(NotificationService);

  wasteTypes: WasteType[] = [];
  daysOfWeek = [
    { id: 1, name: 'Lunedì' },
    { id: 2, name: 'Martedì' },
    { id: 3, name: 'Mercoledì' },
    { id: 4, name: 'Giovedì' },
    { id: 5, name: 'Venerdì' },
    { id: 6, name: 'Sabato' },
    { id: 0, name: 'Domenica' }
  ];

  customSchedule: WasteSchedule[] = [];
  exceptions: WasteException[] = [];
  
  newExceptionDate: Date | null = null;
  newExceptionType: string = 'none';

  ngOnInit() {
    this.wasteTypes = this.wasteService.getWasteTypes();
    
    // Inizializza il piano settimanale se vuoto
    this.daysOfWeek.forEach(day => {
      this.customSchedule.push({ dayOfWeek: day.id, wasteTypeId: 'none' });
    });

    // Carica dati esistenti
    const sub1 = this.wasteService.getSchedule().subscribe(s => {
      s.forEach(item => {
        const target = this.customSchedule.find(c => c.dayOfWeek === item.dayOfWeek);
        if (target) target.wasteTypeId = item.wasteTypeId;
      });
    });

    const sub2 = this.wasteService.getExceptions().subscribe(e => {
      this.exceptions = [...e];
    });
  }

  addException() {
    if (!this.newExceptionDate) return;
    
    const dateStr = this.formatDate(this.newExceptionDate);
    const wasteTypeId = this.newExceptionType === 'none' ? null : this.newExceptionType;
    
    // Rimuovi se esiste già per quella data
    this.exceptions = this.exceptions.filter(e => e.date !== dateStr);
    
    this.exceptions.push({ date: dateStr, wasteTypeId });
    this.newExceptionDate = null;
    this.newExceptionType = 'none';
  }

  removeException(index: number) {
    this.exceptions.splice(index, 1);
  }

  async save() {
    // Filtra quelli che sono 'none' (nessun ritiro)
    const scheduleToSave = this.customSchedule.filter(s => s.wasteTypeId !== 'none');
    try {
      await this.wasteService.saveConfig(scheduleToSave, this.exceptions);
      this.notification.showSuccess('Configurazione salvata con successo!');
    } catch (error: any) {
      // Errore già gestito
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getWasteTypeName(id: string | null): string {
    if (!id) return 'Nessun ritiro';
    return this.wasteTypes.find(t => t.id === id)?.name || 'Nessun ritiro';
  }
}
