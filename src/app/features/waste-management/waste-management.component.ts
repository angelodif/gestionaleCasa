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
import { PushNotificationService } from '../../services/push-notification/push-notification.service';
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
  private pushNotificationService = inject(PushNotificationService);

  // Signals State
  wasteTypes = signal<WasteType[]>([]);
  customSchedule = signal<any[]>([]);
  exceptions = signal<WasteException[]>([]);
  
  newExceptionDate = signal<Date | null>(null);
  newExceptionTypes = signal<string[]>([]);

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
    const initialSchedule = this.daysOfWeek.map(day => ({ dayOfWeek: day.id, wasteTypeIds: [] as string[] }));
    this.customSchedule.set(initialSchedule);

    // Carica dati esistenti
    this.subs.add(this.wasteService.getSchedule().subscribe(s => {
      const current = [...this.customSchedule()];
      s.forEach(item => {
        const target = current.find(c => c.dayOfWeek === item.dayOfWeek);
        if (target) {
          target.wasteTypeIds = item.wasteTypeIds || (item.wasteTypeId && item.wasteTypeId !== 'none' ? [item.wasteTypeId] : []);
        }
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
    const wasteTypeIds = this.newExceptionTypes();
    
    const updated = this.exceptions().filter(e => e.date !== dateStr);
    updated.push({
      date: dateStr,
      wasteTypeIds,
      wasteTypeId: wasteTypeIds.length > 0 ? wasteTypeIds[0] : null
    });
    
    this.exceptions.set(updated);
    this.newExceptionDate.set(null);
    this.newExceptionTypes.set([]);
  }

  removeException(index: number) {
    const updated = [...this.exceptions()];
    updated.splice(index, 1);
    this.exceptions.set(updated);
  }

  async save() {
    const scheduleToSave = this.customSchedule().map(s => ({
      dayOfWeek: s.dayOfWeek,
      wasteTypeIds: s.wasteTypeIds || [],
      wasteTypeId: s.wasteTypeIds && s.wasteTypeIds.length > 0 ? s.wasteTypeIds[0] : 'none'
    }));
    
    const exceptionsToSave = this.exceptions().map(ex => ({
      date: ex.date,
      wasteTypeIds: ex.wasteTypeIds || [],
      wasteTypeId: ex.wasteTypeIds && ex.wasteTypeIds.length > 0 ? ex.wasteTypeIds[0] : null
    }));

    try {
      await this.wasteService.saveConfig(scheduleToSave, exceptionsToSave);
      this.notification.showSuccess('Configurazione salvata!');
      await this.pushNotificationService.scheduleAll();
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

  getWasteTypeNames(ex: WasteException): string {
    const ids = ex.wasteTypeIds || (ex.wasteTypeId && ex.wasteTypeId !== 'none' ? [ex.wasteTypeId] : []);
    if (ids.length === 0) return 'Nessun ritiro';
    return ids.map(id => this.wasteTypes().find(t => t.id === id)?.name || id).join(', ');
  }
}
