import { Component, inject, OnInit } from '@angular/core';
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
import { Observable, map } from 'rxjs';
import { DeadlineDialogComponent } from './deadline-dialog/deadline-dialog.component';

@Component({
  selector: 'app-deadlines',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressBarModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatRippleModule,
    MatDividerModule
  ],
  templateUrl: './deadlines.component.html',
  styleUrl: './deadlines.component.scss'
})
export class DeadlinesComponent implements OnInit {
  private deadlineService = inject(DeadlineService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  deadlines$: Observable<Deadline[]> = this.deadlineService.getDeadlines();
  
  // Raggruppamento per stato (Scadute, Imminenti, Future)
  groupedDeadlines$!: Observable<{
    expired: Deadline[],
    upcoming: Deadline[],
    future: Deadline[],
    paid: Deadline[]
  }>;

  ngOnInit() {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    this.groupedDeadlines$ = this.deadlines$.pipe(
      map(list => {
        return {
          expired: list.filter(d => !d.isPaid && d.dueDate < now),
          upcoming: list.filter(d => !d.isPaid && d.dueDate >= now && d.dueDate <= now + thirtyDays),
          future: list.filter(d => !d.isPaid && d.dueDate > now + thirtyDays),
          paid: list.filter(d => d.isPaid)
        };
      })
    );
  }

  openDeadlineDialog(deadline?: Deadline) {
    const dialogRef = this.dialog.open(DeadlineDialogComponent, {
      width: '95vw',
      maxWidth: '500px',
      data: deadline ? { ...deadline } : null
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (result.id) {
          this.deadlineService.updateDeadline(result);
          this.snackBar.open('Scadenza aggiornata!', 'OK', { duration: 3000 });
        } else {
          this.deadlineService.addDeadline(result);
          this.snackBar.open('Scadenza aggiunta!', 'OK', { duration: 3000 });
        }
      }
    });
  }

  togglePaid(deadline: Deadline) {
    if (deadline.id) {
      const newStatus = !deadline.isPaid;
      this.deadlineService.markAsPaid(deadline.id, newStatus);
      
      // Se è stata pagata ed è ricorrente, propone di creare la prossima
      if (newStatus && deadline.recurring && deadline.recurring !== 'none') {
        const nextDate = this.calculateNextDate(deadline.dueDate, deadline.recurring);
        const nextDeadline: Deadline = {
          ...deadline,
          dueDate: nextDate,
          isPaid: false
        };
        delete nextDeadline.id; // Rimuovi ID per creare nuovo documento
        
        const snack = this.snackBar.open(
          `Pagata! Vuoi programmare la prossima per il ${new Date(nextDate).toLocaleDateString()}?`, 
          'PROGRAMMA', 
          { duration: 6000 }
        );
        
        snack.onAction().subscribe(() => {
          this.deadlineService.addDeadline(nextDeadline);
        });
      }
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

  deleteDeadline(id: string) {
    if (confirm('Sei sicuro di voler eliminare questa scadenza?')) {
      this.deadlineService.deleteDeadline(id);
      this.snackBar.open('Scadenza eliminata', 'OK', { duration: 3000 });
    }
  }

  getCategoryIcon(category: string): string {
    switch (category) {
      case 'Auto': return 'directions_car';
      case 'Casa': return 'home';
      case 'Persona': return 'person';
      case 'Salute': return 'medical_services';
      default: return 'event';
    }
  }

  getDaysLeft(dueDate: number): number {
    const diff = dueDate - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
