import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

// Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ImageCropperDialogComponent } from './image-cropper-dialog.component';
import { AuthService } from '../../core/services/auth/auth.service';
import { PushNotificationService, NotificationPreferences, NOTIFICATION_CATEGORIES } from '../../services/push-notification/push-notification.service';
import { NotificationService } from '../../services/notification/notification.service';
import { ConfirmService } from '../../services/confirm/confirm.service';
import { BackupService } from '../../services/backup/backup.service';
import { DietService } from '../../services/diet/diet.service';
import { BodyMeasurementService } from '../../services/body-measurement/body-measurement.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { firstValueFrom } from 'rxjs';
import { BodyMetricConfigService } from '../../services/body-metric-config/body-metric-config.service';
import { MetricConfigDialogComponent } from './metric-config-dialog/metric-config-dialog.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatDialogModule,
    MetricConfigDialogComponent,
    MatCheckboxModule
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  authService = inject(AuthService);
  private pushNotificationService = inject(PushNotificationService);
  private dietService = inject(DietService);
  private bodyService = inject(BodyMeasurementService);
  private platformId = inject(PLATFORM_ID);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private dialog = inject(MatDialog);
private bodyMetricConfigService = inject(BodyMetricConfigService);

  backupService = inject(BackupService);

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  loading = false;
  dietEnabled = false;
  bodyTrackingEnabled = false;
  hideMyMeasurements = false;
  defaultHeightCm = 170;

  isBrowser = false;
  pendingCount = 0;
  preferences: NotificationPreferences = {
    shifts: { angelo: false, daiana: true, leadTime: { hours: 1, minutes: 0 } },
    shiftsTomorrow: { angelo: true, daiana: true, time: '21:00' },
    officeReminder: { angelo: true, daiana: false, time: '21:00' },
    lunchPrep: { angelo: true, daiana: false, time: '19:00' },
    snackMorning: { angelo: true, daiana: true, time: '11:00' },
    menuLunch: { angelo: true, daiana: true, time: '12:00' },
    snackAfternoon: { angelo: true, daiana: true, time: '16:00' },
    menuDinner: { angelo: true, daiana: true, time: '19:00' },
    appointments: { angelo: true, daiana: true, leadTime: { hours: 1, minutes: 0 } },
    appointmentsSummary: { angelo: true, daiana: true, time: '21:00' },
    deadlinesToday: { enabled: true, time: '08:00' },
    deadlinesTomorrow: { enabled: true, time: '20:00' },
    deadlinesWeekly: { enabled: true, time: '09:00' },
    wasteCollection: { enabled: true, time: '20:45' },
    birthdays: { angelo: true, daiana: true, time: '09:00', timeEveningBefore: '20:30' },
    physicalActivity: { angelo: true, daiana: true, time: '20:30', leadTimeEnabled: true },

    notifyLunchOut: false,
    notifyDinnerOut: false
  };
  notificationCategories = NOTIFICATION_CATEGORIES;

  async ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.loadPendingCount();
      this.preferences = this.pushNotificationService.getPreferences();
    }
    const dietSettings = await this.dietService.getDietSettings();
    this.dietEnabled = dietSettings.dietEnabled;
    const user = this.authService.getCurrentUser();

    if (user) {
      this.bodyService.getUserSettingsStream(user.uid).subscribe(s => {
        this.bodyTrackingEnabled = s.bodyTrackingEnabled;
        this.hideMyMeasurements = s.hideMyMeasurements;
        this.defaultHeightCm = s.defaultHeightCm || 170;

        // Assicura che la privacy sia sincronizzata sul documento pubblico
        const isDaiana = user.displayName?.toLowerCase().includes('daiana') || false;
        const uName: 'Angelo' | 'Daiana' = isDaiana ? 'Daiana' : 'Angelo';
        this.bodyService.setPrivacyForUser(uName, s.hideMyMeasurements).catch(() => {});
      });
    }

    this.profileForm = this.fb.group({
      displayName: [user?.displayName || '', Validators.required]
    });

    this.passwordForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(g: FormGroup) {
    const pass = g.get('newPassword')?.value;
    const confirm = g.get('confirmPassword')?.value;
    return pass === confirm ? null : { mismatch: true };
  }

  onFileSelected(event: any) {
    if (!event.target.files || event.target.files.length === 0) return;
    
    // Apri il dialog del cropper passandogli l'evento nativo
    const dialogRef = this.dialog.open(ImageCropperDialogComponent, {
      width: '95vw',
      maxWidth: '600px',
      data: { imageChangedEvent: event },
      panelClass: 'cropper-dialog-container',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((result: { blob: Blob, url: string } | null) => {
      // Resetta l'input file per permettere di riselezionare la stessa foto se si annulla
      event.target.value = '';

      if (result && result.blob) {
        // L'utente ha confermato il ritaglio
        this.selectedFile = new File([result.blob], 'avatar.jpg', { type: 'image/jpeg' });
        
        if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.previewUrl);
        }
        this.previewUrl = result.url; // L'URL creato nel dialog
      }
    });
  }

  async updateProfile() {
    if (this.profileForm.valid) {
      this.loading = true;
      try {
        await this.authService.updateUserProfile(
          this.profileForm.value.displayName,
          this.selectedFile
        );
        this.notification.showSuccess('Profilo aggiornato!');
        this.selectedFile = null;
        this.previewUrl = null;
      } catch (e) {
        this.notification.showError('Errore durante l\'aggiornamento.');
      } finally {
        this.loading = false;
      }
    }
  }

  async changePassword() {
    if (this.passwordForm.valid) {
      try {
        await this.authService.updateUserPassword(this.passwordForm.value.newPassword);
        this.notification.showSuccess('Password modificata con successo!');
        this.passwordForm.reset();
      } catch (error: any) {
        this.notification.showError('Errore: Devi aver effettuato l\'accesso di recente per cambiare password.');
      }
    }
  }

  async loadPendingCount() {
    if (this.isBrowser) {
      this.pendingCount = await this.pushNotificationService.getPendingCount();
    }
  }

  async openMetricConfigDialog() {
    const user = this.authService.getCurrentUser();
    const uid = user?.uid;
    let existingConfigs: any = {};
    let userName: 'Angelo' | 'Daiana' | null = null;
    if (uid) {
      const isDaiana = user?.displayName?.toLowerCase().includes('daiana');
      userName = isDaiana ? 'Daiana' : 'Angelo';
      try {
        existingConfigs = await firstValueFrom(this.bodyMetricConfigService.getUserConfigs(userName));
      } catch {}
    }
    const dialogRef = this.dialog.open(MetricConfigDialogComponent, {
      width: '95vw',
      maxWidth: '580px',
      autoFocus: false,
      // Passa l'intera mappa così il dialog può caricare la config per ogni metrica
      data: { configs: existingConfigs }
    });
    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (result && userName) {
        // result è un singolo BodyMetricConfig (per la metrica selezionata nel dialog)
        await this.bodyMetricConfigService.setConfig(userName, result);
        // Aggiorna cache locale così i grafici usano subito le soglie personalizzate
        const fresh = await firstValueFrom(this.bodyMetricConfigService.getUserConfigs(userName));
        this.bodyService.setUserConfigs(userName, fresh);
        this.notification.showSuccess('Configurazione metrica salvata');
      }
    });
  }

  togglePreference(key: keyof NotificationPreferences) {
    const val = this.preferences[key] as any;
    if (val && typeof val === 'object' && val.enabled !== undefined) {
      (this.preferences as any)[key] = {
        ...val,
        enabled: !val.enabled
      };
      this.pushNotificationService.savePreferences(this.preferences);
    } else if (typeof val === 'boolean') {
      (this.preferences as any)[key] = !val;
      this.pushNotificationService.savePreferences(this.preferences);
    }
  }

  toggleUserPreference(key: keyof NotificationPreferences, target: 'angelo' | 'daiana') {
    const val = this.preferences[key] as any;
    if (val && typeof val === 'object' && !Array.isArray(val) && val[target] !== undefined) {
      (this.preferences as any)[key] = {
        ...val,
        [target]: !val[target]
      };
      this.pushNotificationService.savePreferences(this.preferences);
    }
  }

  togglePhysicalActivityLeadTime() {
    const val = this.preferences.physicalActivity as any;
    const current = val.leadTimeEnabled !== false;
    this.preferences.physicalActivity = { ...val, leadTimeEnabled: !current };
    this.pushNotificationService.savePreferences(this.preferences);
  }

  async toggleDiet(enabled: boolean) {
    this.dietEnabled = enabled;
    try {
      await this.dietService.setDietEnabled(enabled);
      this.notification.showSuccess(enabled ? 'Modalità Dieta attivata! 🥗' : 'Modalità Dieta disattivata.');
    } catch {
      this.notification.showError('Errore salvataggio modalità dieta.');
    }
  }

  async toggleBodyTracking(enabled: boolean) {
    this.bodyTrackingEnabled = enabled;
    const user = this.authService.getCurrentUser();
    if (user) {
      try {
        await this.bodyService.saveUserSettings(user.uid, { bodyTrackingEnabled: enabled });
        this.notification.showSuccess(enabled ? 'Monitoraggio Peso & Composizione Corporea attivato! ⚖️' : 'Monitoraggio Peso disattivato.');
      } catch {
        this.notification.showError('Errore salvataggio impostazioni peso.');
      }
    }
  }

  async toggleHideMeasurements(hide: boolean) {
    this.hideMyMeasurements = hide;
    const user = this.authService.getCurrentUser();
    if (user) {
      try {
        const isDaiana = user.displayName?.toLowerCase().includes('daiana') || false;
        const uName: 'Angelo' | 'Daiana' = isDaiana ? 'Daiana' : 'Angelo';
        await this.bodyService.saveUserSettings(user.uid, { hideMyMeasurements: hide }, uName);
        this.notification.showSuccess(hide ? 'Le tue misurazioni sono ora nascoste agli altri account 🔒' : 'Le tue misurazioni sono ora condivise 👥');
      } catch {
        this.notification.showError('Errore salvataggio privacy misurazioni.');
      }
    }
  }

  async updateDefaultHeight(height: number) {
    this.defaultHeightCm = height;
    const user = this.authService.getCurrentUser();
    if (user && height > 50) {
      try {
        await this.bodyService.saveUserSettings(user.uid, { defaultHeightCm: height });
        this.notification.showSuccess(`Altezza predefinita aggiornata a ${height} cm!`);
      } catch {
        this.notification.showError('Errore aggiornamento altezza.');
      }
    }
  }

  async saveAndReschedule() {
    if (this.isBrowser) {
      this.loading = true;
      try {
        this.pushNotificationService.savePreferences(this.preferences);
        await this.pushNotificationService.scheduleAll();
        await this.loadPendingCount();
        this.notification.showSuccess('Preferenze salvate e notifiche ricalcolate!');
      } catch (e) {
        this.notification.showError('Errore durante la ri-schedulazione delle notifiche.');
      } finally {
        this.loading = false;
      }
    }
  }

  async triggerTestNotif() {
    const success = await this.pushNotificationService.testNotification();
    if (success) {
      this.notification.showInfo('Notifica di test schedulata tra 5 secondi! Chiudi l\'app o blocca lo schermo per vederla.');
      setTimeout(() => this.loadPendingCount(), 6000);
    } else {
      this.notification.showError('Impossibile schedulare la notifica di test. Verifica i permessi.');
    }
  }

  async forceReschedule() {
    if (this.isBrowser) {
      this.loading = true;
      try {
        await this.pushNotificationService.scheduleAll();
        await this.loadPendingCount();
        this.notification.showSuccess('Notifiche locali ricalcolate e ri-schedulate con successo!');
      } catch (e) {
        this.notification.showError('Errore durante la ri-schedulazione delle notifiche.');
      } finally {
        this.loading = false;
      }
    }
  }

  async logout() {
    const ok = await this.confirmService.confirm({
      title: 'Esci dall\'account',
      message: 'Sei sicuro di voler uscire?',
      confirmLabel: 'Esci',
      danger: true
    });
    if (!ok) return;
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  async manualBackup() {
    await this.backupService.createAndSaveBackup(false);
  }

  onRestoreFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const ok = await this.backupService.restoreBackup(json);
        if (ok) {
          input.value = '';
        }
      } catch {
        this.notification.showError('File di backup non valido.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }
}