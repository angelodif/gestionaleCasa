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
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  authService = inject(AuthService);
  private pushNotificationService = inject(PushNotificationService);
  private platformId = inject(PLATFORM_ID);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private dialog = inject(MatDialog);

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  loading = false;

  isBrowser = false;
  pendingCount = 0;
  preferences: NotificationPreferences = {
    shifts: { angelo: false, daiana: true, leadTime: { hours: 1, minutes: 0 } },
    shiftsTomorrow: { angelo: true, daiana: true, time: '21:00' },
    officeReminder: { angelo: true, daiana: false, time: '21:00' },
    lunchPrep: { angelo: true, daiana: false, time: '19:00' },
    menuLunch: { angelo: true, daiana: true, time: '12:00' },
    menuDinner: { angelo: true, daiana: true, time: '19:00' },
    appointments: { angelo: true, daiana: true, leadTime: { hours: 1, minutes: 0 } },
    appointmentsSummary: { angelo: true, daiana: true, time: '21:00' },
    deadlinesToday: { enabled: true, time: '08:00' },
    deadlinesTomorrow: { enabled: true, time: '20:00' },
    deadlinesWeekly: { enabled: true, time: '09:00' },
    wasteCollection: { enabled: true, time: '20:45' },
    birthdays: { enabled: true, time: '09:00', timeEveningBefore: '20:30' }, // Inizializzazione della nuova preferenza

    notifyLunchOut: false,
    notifyDinnerOut: false
  };
  notificationCategories = NOTIFICATION_CATEGORIES;

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.loadPendingCount();
      this.preferences = this.pushNotificationService.getPreferences();
    }
    const user = this.authService.getCurrentUser();

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
}