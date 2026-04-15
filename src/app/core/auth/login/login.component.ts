import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common'; // Aggiunto isPlatformBrowser
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../services/auth/auth.service';
import { 
  Auth, 
  getMultiFactorResolver, 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator, 
  RecaptchaVerifier 
} from '@angular/fire/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    FormsModule, 
    RouterLink, 
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private auth = inject(Auth);
  private platformId = inject(PLATFORM_ID); // Inject per capire se siamo nel browser

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  // Variabili per gestione MFA
  mfaRequired = false;
  verificationCode = '';
  resolver: any;
  verificationId = '';
  recaptchaVerifier: RecaptchaVerifier | undefined;

  ngOnInit() {
    // Inizializza recaptcha SOLO se siamo nel browser
    if (isPlatformBrowser(this.platformId)) {
      this.recaptchaVerifier = new RecaptchaVerifier(this.auth, 'recaptcha-container', {
        size: 'invisible'
      });
    }
  }

  async onSubmit() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;
      try {
        await this.authService.login(email, password);
        this.router.navigate(['/dashboard']);
      } catch (error: any) {
        // Gestione errore Multi-Factor
        if (error.code === 'auth/multi-factor-auth-required' && isPlatformBrowser(this.platformId)) {
          
          this.resolver = getMultiFactorResolver(this.auth, error);
          
          const phoneInfoOptions = {
            multiFactorHint: this.resolver.hints[0],
            session: this.resolver.session
          };
          
          const phoneAuthProvider = new PhoneAuthProvider(this.auth);
          
          // Usiamo l'istanza locale di recaptchaVerifier
          if (this.recaptchaVerifier) {
            this.verificationId = await phoneAuthProvider.verifyPhoneNumber(
              phoneInfoOptions, 
              this.recaptchaVerifier
            );
            this.mfaRequired = true;
          }
          
        } else {
          alert("Credenziali errate o errore di connessione");
        }
      }
    }
  }

  async verifyMfa() {
    try {
      const cred = PhoneAuthProvider.credential(this.verificationId, this.verificationCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      await this.resolver.resolveSignIn(multiFactorAssertion);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      alert("Codice SMS non valido");
    }
  }
}