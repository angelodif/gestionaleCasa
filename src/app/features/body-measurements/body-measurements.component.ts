import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, Chart, registerables } from 'chart.js';

import {
  BodyMeasurement,
  BodyMeasurementService,
  BodySettings
} from '../../services/body-measurement/body-measurement.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { NotificationService } from '../../services/notification/notification.service';
import { ConfirmService } from '../../services/confirm/confirm.service';
import { AddMeasurementDialogComponent } from './components/add-measurement-dialog/add-measurement-dialog.component';

Chart.register(...registerables);

@Component({
  selector: 'app-body-measurements',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDialogModule,
    MatTooltipModule,
    MatDividerModule,
    BaseChartDirective
  ],
  templateUrl: './body-measurements.component.html',
  styleUrl: './body-measurements.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BodyMeasurementsComponent implements OnInit, OnDestroy {
  public bodyService = inject(BodyMeasurementService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  // User State
  private initUser = inject(AuthService).getCurrentUser();
  private initName: 'Angelo' | 'Daiana' = (this.initUser?.displayName?.toLowerCase().includes('daiana') || this.initUser?.email?.toLowerCase().includes('daiana')) ? 'Daiana' : 'Angelo';

  currentUserId = signal<string>(this.initUser?.uid || '');
  currentUserName = signal<'Angelo' | 'Daiana'>(this.initName);
  selectedUser = signal<'Angelo' | 'Daiana'>(this.initName);

  // Subscriptions
  private authSub?: Subscription;
  private measurementsSub?: Subscription;
  private settingsSub?: Subscription;
  private privacySub?: Subscription;

  // Settings
  userSettings = signal<BodySettings>({
    bodyTrackingEnabled: true,
    hideMyMeasurements: false,
    defaultHeightCm: 170
  });

  // Global privacy settings (chi ha nascosto le proprie misurazioni)
  privacySettings = signal<{ angeloHidden: boolean; daianaHidden: boolean }>({
    angeloHidden: false,
    daianaHidden: false
  });

  // Calcolo se l'utente loggato può vedere Angelo
  canViewAngelo = computed(() => {
    const curr = this.currentUserName();
    if (curr === 'Angelo') return true; // Angelo vede sempre se stesso
    // Se Angelo ha impostato angeloHidden = true nei settings globali
    if (this.privacySettings().angeloHidden) return false;
    // Fallback: se le misurazioni di Angelo hanno tutte isPrivate = true o non ce ne sono di pubbliche
    const angeloMeasurements = this.allMeasurements().filter(m => m.userName === 'Angelo');
    if (angeloMeasurements.length > 0 && angeloMeasurements.every(m => m.isPrivate)) {
      return false;
    }
    return true;
  });

  // Calcolo se l'utente loggato può vedere Daiana
  canViewDaiana = computed(() => {
    const curr = this.currentUserName();
    if (curr === 'Daiana') return true; // Daiana vede sempre se stessa
    // Se Daiana ha impostato daianaHidden = true nei settings globali
    if (this.privacySettings().daianaHidden) return false;
    // Fallback: se le misurazioni di Daiana hanno tutte isPrivate = true o non ce ne sono di pubbliche
    const daianaMeasurements = this.allMeasurements().filter(m => m.userName === 'Daiana');
    if (daianaMeasurements.length > 0 && daianaMeasurements.every(m => m.isPrivate)) {
      return false;
    }
    return true;
  });

  // Se entrambi sono visibili, mostriamo il toggle
  canSwitchUser = computed(() => {
    return this.canViewAngelo() && this.canViewDaiana();
  });

  // All Measurements from Firebase
  allMeasurements = signal<BodyMeasurement[]>([]);

  // Period Filter: 1, 3, 6, 12 months or 0 (All)
  selectedPeriod = signal<number>(3);

  // Active Chart Category: 'weightBmi' | 'composition' | 'metabolic'
  activeChartTab = signal<number>(0);

  // Filtered measurements for selected user, respect privacy
  userMeasurements = computed(() => {
    const user = this.selectedUser();
    const currUid = this.currentUserId();
    const currUser = this.currentUserName();

    // Se l'utente selezionato è nascosto all'altro account, lista vuota
    if (user === 'Angelo' && !this.canViewAngelo()) return [];
    if (user === 'Daiana' && !this.canViewDaiana()) return [];

    return this.allMeasurements()
      .filter(m => {
        if (m.userName !== user) return false;
        // Se è privato ed è dell'altro utente, non mostrarlo
        if (m.isPrivate && m.userName !== currUser && m.userId !== currUid) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.date - a.date); // Discendente per la lista
  });

  // Ultima misurazione
  latestMeasurement = computed(() => {
    const list = this.userMeasurements();
    return list.length > 0 ? list[0] : null;
  });

  // Misurazioni filtrate per periodo per i grafici (ordine cronologico ascendente)
  chartDataList = computed(() => {
    const list = [...this.userMeasurements()];
    const months = this.selectedPeriod();
    let filtered = list;

    if (months > 0) {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).getTime();
      filtered = list.filter(m => m.date >= cutoff);
    }

    return filtered.sort((a, b) => a.date - b.date);
  });

  // --- CHART CONFIGURATIONS ---

  // 1. Grafico Peso & BMI
  weightBmiChartData = computed<ChartData<'line'>>(() => {
    const data = this.chartDataList();
    const labels = data.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }));
    return {
      labels,
      datasets: [
        {
          label: 'Peso (kg)',
          data: data.map(d => d.weight),
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.15)',
          fill: true,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'BMI',
          data: data.map(d => d.bmi),
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.35,
          yAxisID: 'y1'
        }
      ]
    };
  });

  weightBmiChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Peso (kg)' }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'BMI' }
      }
    }
  };

  // 2. Grafico Composizione (Grassa %, Muscolo kg, Acqua %)
  compositionChartData = computed<ChartData<'line'>>(() => {
    const data = this.chartDataList();
    const labels = data.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }));
    return {
      labels,
      datasets: [
        {
          label: 'Massa Grassa (%)',
          data: data.map(d => d.bodyFatPercent),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.35,
          yAxisID: 'yPercent'
        },
        {
          label: 'Acqua (%)',
          data: data.map(d => d.waterPercent),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.1)',
          tension: 0.35,
          yAxisID: 'yPercent'
        },
        {
          label: 'Muscoli (kg)',
          data: data.map(d => d.muscleKg),
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          tension: 0.35,
          yAxisID: 'yKg'
        }
      ]
    };
  });

  compositionChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      yPercent: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Percentuale (%)' }
      },
      yKg: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Muscoli (kg)' }
      }
    }
  };

  // 3. Grafico Metabolico (BMR kcal & Grasso Viscerale)
  metabolicChartData = computed<ChartData<'line'>>(() => {
    const data = this.chartDataList();
    const labels = data.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }));
    return {
      labels,
      datasets: [
        {
          label: 'Metabolismo (kcal)',
          data: data.map(d => d.bmrKcal),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          tension: 0.35,
          yAxisID: 'yKcal'
        },
        {
          label: 'Grasso Viscerale',
          data: data.map(d => d.visceralFat),
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          tension: 0.35,
          yAxisID: 'yLevel'
        }
      ]
    };
  });

  metabolicChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      yKcal: {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Kcal' }
      },
      yLevel: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Livello Viscerale' }
      }
    }
  };

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      if (user) {
        this.currentUserId.set(user.uid);
        const name: 'Angelo' | 'Daiana' = (user.displayName?.toLowerCase().includes('daiana') || user.email?.toLowerCase().includes('daiana')) ? 'Daiana' : 'Angelo';
        this.currentUserName.set(name);
        this.selectedUser.set(name);

        this.settingsSub = this.bodyService.getUserSettingsStream(user.uid).subscribe(s => {
          this.userSettings.set(s);
        });
      }
    });

    this.measurementsSub = this.bodyService.getMeasurementsStream().subscribe(list => {
      this.allMeasurements.set(list);
    });

    this.privacySub = this.bodyService.getPublicPrivacySettingsStream().subscribe(priv => {
      this.privacySettings.set(priv);
      // Se l'utente attualmente selezionato è nascosto, switcha su di sé
      const curr = this.currentUserName();
      if (this.selectedUser() === 'Angelo' && !this.canViewAngelo()) {
        this.selectedUser.set(curr);
      } else if (this.selectedUser() === 'Daiana' && !this.canViewDaiana()) {
        this.selectedUser.set(curr);
      }
    });
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
    this.measurementsSub?.unsubscribe();
    this.settingsSub?.unsubscribe();
    this.privacySub?.unsubscribe();
  }

  setUser(user: 'Angelo' | 'Daiana') {
    this.selectedUser.set(user);
  }

  setPeriod(months: number) {
    this.selectedPeriod.set(months);
  }

  openAddDialog(itemToEdit?: BodyMeasurement) {
    const dialogRef = this.dialog.open(AddMeasurementDialogComponent, {
      width: '95vw',
      maxWidth: '620px',
      data: {
        userName: this.selectedUser(),
        defaultHeightCm: this.userSettings().defaultHeightCm || 170,
        initialData: itemToEdit
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (!result) return;

      try {
        if (itemToEdit && itemToEdit.id) {
          await this.bodyService.updateMeasurement(itemToEdit.id, result);
          this.notification.showSuccess('Misurazione aggiornata!');
        } else {
          await this.bodyService.addMeasurement({
            ...result,
            userId: this.currentUserId(),
            userName: this.selectedUser()
          });
          this.notification.showSuccess('Misurazione salvata con successo! ⚖️');
        }
      } catch (e) {
        console.error(e);
        this.notification.showError('Errore durante il salvataggio.');
      }
    });
  }

  async deleteMeasurement(item: BodyMeasurement) {
    const confirmed = await this.confirmService.confirm({
      title: 'Elimina Misurazione',
      message: `Vuoi eliminare la pesata del ${new Date(item.date).toLocaleDateString('it-IT')}?`,
      confirmLabel: 'Elimina',
      cancelLabel: 'Annulla',
      danger: true
    });

    if (confirmed && item.id) {
      try {
        await this.bodyService.deleteMeasurement(item.id);
        this.notification.showSuccess('Misurazione eliminata.');
      } catch (e) {
        this.notification.showError('Errore eliminazione.');
      }
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
