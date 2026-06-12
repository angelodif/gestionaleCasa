import { Component, inject, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { Router } from '@angular/router';
import { DeadlineService, Deadline } from '../../services/deadline/deadline.service';
import { NotificationService } from '../../services/notification/notification.service';
import { PushNotificationService } from '../../services/push-notification/push-notification.service';
import { Subscription } from 'rxjs';
import { DeadlineDialogComponent } from './deadline-dialog/deadline-dialog.component';

@Component({
  selector: 'app-deadlines',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule, MatTooltipModule,
    MatRippleModule, MatDividerModule
  ],
  templateUrl: './deadlines.component.html',
  styleUrl: './deadlines.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeadlinesComponent implements OnInit, OnDestroy {
  private deadlineService = inject(DeadlineService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private notification = inject(NotificationService);
  private pushNotificationService = inject(PushNotificationService);

  // Signals State
  allDeadlines = signal<Deadline[]>([]);

  // Computed Signal for Grouping
  groupedDeadlines = computed(() => {
    const list = this.allDeadlines();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    return {
      expired: list.filter(d => !d.isPaid && d.dueDate < now),
      upcoming: list.filter(d => !d.isPaid && d.dueDate >= now && d.dueDate <= now + thirtyDays),
      future: list.filter(d => !d.isPaid && d.dueDate > now + thirtyDays),
      paid: list.filter(d => d.isPaid)
    };
  });

  private sub?: Subscription;

  ngOnInit() {
    this.sub = this.deadlineService.getDeadlines().subscribe(data => {
      this.allDeadlines.set(data);
    });
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  openDeadlineDialog(deadline?: Deadline) {
    const dialogRef = this.dialog.open(DeadlineDialogComponent, {
      width: '95vw',
      maxWidth: '500px',
      data: deadline ? { ...deadline } : null
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          if (result.id) {
            await this.deadlineService.updateDeadline(result);
            this.notification.showSuccess('Scadenza aggiornata!');
          } else {
            await this.deadlineService.addDeadline(result);
            this.notification.showSuccess('Scadenza aggiunta!');
          }
          this.pushNotificationService.scheduleAll();
        } catch (error) { }
      }
    });
  }

  async togglePaid(deadline: Deadline) {
    if (!deadline.id) return;
    const newStatus = !deadline.isPaid;
    try {
      await this.deadlineService.markAsPaid(deadline.id, newStatus);
      this.pushNotificationService.scheduleAll();

      if (newStatus && deadline.recurring && deadline.recurring !== 'none') {
        // Crea automaticamente la prossima scadenza
        const nextDate = this.calculateNextDate(deadline.dueDate, deadline.recurring);
        const nextDeadline: Deadline = { ...deadline, dueDate: nextDate, isPaid: false };
        delete nextDeadline.id;
        await this.deadlineService.addDeadline(nextDeadline);
        this.pushNotificationService.scheduleAll();

        // Snackbar con opt-out: l'utente può eliminare la ricorrenza se non vuole più
        const label = new Date(nextDate).toLocaleDateString('it-IT');
        const snack = this.snackBar.open(
          `✅ Pagata! Prossima scadenza programmata per il ${label}`,
          'ELIMINA RICORRENZA',
          { duration: 12000, panelClass: ['snack-success'] }
        );

        snack.onAction().subscribe(async () => {
          try {
            // Elimina la ricorrenza sia dall'originale che dalla nuova
            const currentId = deadline.id!;
            await this.deadlineService.removeRecurring(currentId);
            this.notification.showSuccess('Ricorrenza eliminata.');
            this.pushNotificationService.scheduleAll();
          } catch (error) { }
        });

      } else if (newStatus) {
        this.notification.showSuccess('Scadenza segnata come pagata!');
      }
    } catch (error) { }
  }

  async removeRecurring(deadline: Deadline) {
    if (!deadline.id) return;
    const confirmed = confirm(`Eliminare la ricorrenza di "${deadline.title}"?\nLa scadenza rimarrà, ma non verrà più riprogrammata automaticamente.`);
    if (confirmed) {
      try {
        await this.deadlineService.removeRecurring(deadline.id);
        this.notification.showSuccess('Ricorrenza eliminata.');
        this.pushNotificationService.scheduleAll();
      } catch (error) { }
    }
  }

  private calculateNextDate(currentDate: number, recurring: string): number {
    const date = new Date(currentDate);
    switch (recurring) {
      case 'monthly': date.setMonth(date.getMonth() + 1); break;
      case 'bimonthly': date.setMonth(date.getMonth() + 2); break;
      case 'quarterly': date.setMonth(date.getMonth() + 3); break;
      case 'six-monthly': date.setMonth(date.getMonth() + 6); break;
      case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
      case 'two-years': date.setFullYear(date.getFullYear() + 2); break;
      case 'five-years': date.setFullYear(date.getFullYear() + 5); break;
      case 'ten-years': date.setFullYear(date.getFullYear() + 10); break;
    }
    return date.getTime();
  }

  async deleteDeadline(id: string) {
    if (confirm('Eliminare questa scadenza?')) {
      try {
        await this.deadlineService.deleteDeadline(id);
        this.notification.showSuccess('Scadenza eliminata.');
        this.pushNotificationService.scheduleAll();
      } catch (error) { }
    }
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'Auto': 'directions_car',
      'Casa': 'home',
      'Persona': 'person',
      'Salute': 'medical_services'
    };
    return icons[category] || 'event';
  }

  getDaysLeft(dueDate: number): number {
    return Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
