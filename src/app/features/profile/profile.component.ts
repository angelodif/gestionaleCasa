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
import { AuthService } from '../../core/services/auth/auth.service';
import { PushNotificationService, NotificationPreferences, NOTIFICATION_CATEGORIES } from '../../services/push-notification/push-notification.service';
import { NotificationService } from '../../services/notification/notification.service';

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
    MatTooltipModule
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

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  selectedFile: File | null = null;
  loading = false;
  
  isBrowser = false;
  pendingCount = 0;
  preferences: NotificationPreferences = {
    shifts: true,
    officeReminder: true,
    lunchPrep: true,
    menuLunch: true,
    menuDinner: true,
    appointments: true,
    appointmentsSummary: true,
    deadlinesToday: true,
    deadlinesTomorrow: true,
    deadlinesWeekly: true,
    wasteCollection: true
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
    this.selectedFile = event.target.files[0];
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
    this.preferences = { ...this.preferences, [key]: !this.preferences[key] };
    this.pushNotificationService.savePreferences(this.preferences);
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
    if (confirm('Sei sicuro di voler uscire?')) {
      await this.authService.logout();
      this.router.navigate(['/login']);
    }
  }
}