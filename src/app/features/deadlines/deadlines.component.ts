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
        } catch (error) {}
      }
    });
  }

  async togglePaid(deadline: Deadline) {
    if (deadline.id) {
      const newStatus = !deadline.isPaid;
      try {
        await this.deadlineService.markAsPaid(deadline.id, newStatus);
        
        if (newStatus && deadline.recurring && deadline.recurring !== 'none') {
          const nextDate = this.calculateNextDate(deadline.dueDate, deadline.recurring);
          const nextDeadline: Deadline = { ...deadline, dueDate: nextDate, isPaid: false };
          delete nextDeadline.id;
          
          const snack = this.snackBar.open(
            `Pagata! Programmare la prossima per il ${new Date(nextDate).toLocaleDateString()}?`, 
            'PROGRAMMA', 
            { duration: 6000 }
          );
          
          snack.onAction().subscribe(async () => {
            try {
              await this.deadlineService.addDeadline(nextDeadline);
              this.notification.showSuccess('Prossima scadenza programmata!');
            } catch (error) {}
          });
        }
      } catch (error) {}
    }
  }

  private calculateNextDate(currentDate: number, recurring: string): number {
    const date = new Date(currentDate);
    switch (recurring) {
      case 'monthly': date.setMonth(date.getMonth() + 1); break;
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
      } catch (error) {}
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
