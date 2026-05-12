import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
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
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { WasteService, WasteType, WasteSchedule, WasteException } from '../../services/waste/waste.service';
import { NotificationService } from '../../services/notification/notification.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-waste-management',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatSelectModule, MatFormFieldModule, MatInputModule, MatDatepickerModule,
    MatNativeDateModule, MatDividerModule, MatSnackBarModule
  ],
  templateUrl: './waste-management.component.html',
  styleUrl: './waste-management.component.scss'
})
export class WasteManagementComponent implements OnInit, OnDestroy {
  private wasteService = inject(WasteService);
  private router = inject(Router);
  private notification = inject(NotificationService);

  // Signals State
  wasteTypes = signal<WasteType[]>([]);
  customSchedule = signal<WasteSchedule[]>([]);
  exceptions = signal<WasteException[]>([]);
  
  newExceptionDate = signal<Date | null>(null);
  newExceptionType = signal<string>('none');

  daysOfWeek = [
    { id: 1, name: 'Lunedì' },
    { id: 2, name: 'Martedì' },
    { id: 3, name: 'Mercoledì' },
    { id: 4, name: 'Giovedì' },
    { id: 5, name: 'Venerdì' },
    { id: 6, name: 'Sabato' },
    { id: 0, name: 'Domenica' }
  ];

  private subs = new Subscription();

  ngOnInit() {
    this.wasteTypes.set(this.wasteService.getWasteTypes());
    
    // Inizializza il piano settimanale vuoto
    const initialSchedule = this.daysOfWeek.map(day => ({ dayOfWeek: day.id, wasteTypeId: 'none' }));
    this.customSchedule.set(initialSchedule);

    // Carica dati esistenti
    this.subs.add(this.wasteService.getSchedule().subscribe(s => {
      const current = [...this.customSchedule()];
      s.forEach(item => {
        const target = current.find(c => c.dayOfWeek === item.dayOfWeek);
        if (target) target.wasteTypeId = item.wasteTypeId;
      });
      this.customSchedule.set(current);
    }));

    this.subs.add(this.wasteService.getExceptions().subscribe(e => {
      this.exceptions.set([...e]);
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  addException() {
    const date = this.newExceptionDate();
    if (!date) return;
    
    const dateStr = this.formatDate(date);
    const wasteTypeId = this.newExceptionType() === 'none' ? null : this.newExceptionType();
    
    const updated = this.exceptions().filter(e => e.date !== dateStr);
    updated.push({ date: dateStr, wasteTypeId });
    
    this.exceptions.set(updated);
    this.newExceptionDate.set(null);
    this.newExceptionType.set('none');
  }

  removeException(index: number) {
    const updated = [...this.exceptions()];
    updated.splice(index, 1);
    this.exceptions.set(updated);
  }

  async save() {
    const scheduleToSave = this.customSchedule().filter(s => s.wasteTypeId !== 'none');
    try {
      await this.wasteService.saveConfig(scheduleToSave, this.exceptions());
      this.notification.showSuccess('Configurazione salvata!');
    } catch (error: any) {}
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
    return this.wasteTypes().find(t => t.id === id)?.name || 'Nessun ritiro';
  }
}
