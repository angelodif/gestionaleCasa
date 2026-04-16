import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShiftService } from '../../services/shift/shift.service';

@Component({
  selector: 'app-public-shifts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-shifts.component.html',
  styleUrl: './public-shifts.component.scss'
})
export class PublicShiftsComponent implements OnInit {
  private shiftService = inject(ShiftService);
  upcomingShifts: any[] = [];
  isLoading = true;

  ngOnInit() {
    this.loadUpcomingDays();
  }

  async loadUpcomingDays() {
    this.isLoading = true;
    const now = new Date();
    const daysToFetch = [];

    // Carichiamo 7 giorni
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      daysToFetch.push({
        dateObj: d,
        name: d.toLocaleDateString('it-IT', { weekday: 'long' }),
        weekId: this.getWeekId(d)
      });
    }

    const results = [];
    for (const day of daysToFetch) {
      const data: any = await this.shiftService.getAssignmentByDay(day.weekId, day.name);
      results.push({
        dayName: day.name,
        dateString: day.dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
        label: data?.label || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
        store: data?.store || '',
        noShift: !data
      });
    }
    
    this.upcomingShifts = results;
    this.isLoading = false;
  }

  private getWeekId(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }
}
