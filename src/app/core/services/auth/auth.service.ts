import { inject, Injectable } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  user,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword
} from '@angular/fire/auth';
import { Firestore, doc, setDoc, docData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { multiFactor, PhoneAuthProvider, PhoneMultiFactorGenerator } from '@angular/fire/auth';
import { Observable, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  private firestore = inject(Firestore);

  /** Stream dell'utente Firebase Auth (senza foto). */
  user$ = user(this.auth);

  /**
   * Observable reattivo della photoURL letta da Firestore.
   * Aggiornato automaticamente ad ogni cambio di autenticazione o modifica del documento.
   * Nessun limite di dimensione: Firestore supporta documenti fino a 1 MB.
   */
  photoUrl$: Observable<string | null> = this.user$.pipe(
    switchMap(u => {
      if (!u) return of(null);
      // Ascolta in tempo reale il documento Firestore dell'utente
      return docData(doc(this.firestore, `users/${u.uid}`)).pipe(
        map((data: any) => (data?.photoURL as string) ?? null)
      );
    })
  );

  async login(email: string, pass: string) {
    await signInWithEmailAndPassword(this.auth, email, pass);
    this.router.navigate(['/dashboard']);
  }

  /**
   * Converte un File immagine in una stringa base64 ridimensionata.
   * @param maxSize dimensione massima in pixel del lato più lungo (default 400px)
   * @param quality qualità JPEG 0–1 (default 0.85)
   */
  private fileToBase64(file: File, maxSize = 400, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target!.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async register(email: string, pass: string, name: string, image: File | null) {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, pass);

    if (image) {
      const photoURL = await this.fileToBase64(image);
      // Salva su Firestore — unica fonte di verità per la foto
      await setDoc(doc(this.firestore, `users/${userCredential.user.uid}`), { photoURL }, { merge: true });
    }

    // Auth: salviamo solo il displayName, NON la base64 in photoURL
    await updateProfile(userCredential.user, { displayName: name });
  }

  /**
   * Aggiorna nome e/o foto del profilo.
   * La foto viene salvata SOLO su Firestore (nessun limite di dimensione pratico).
   * Auth riceve solo il displayName aggiornato.
   */
  async updateUserProfile(name: string, image: File | null) {
    const u = this.auth.currentUser;
    if (!u) return;

    if (image) {
      const photoURL = await this.fileToBase64(image);
      // Firestore è la fonte di verità: foto di qualsiasi dimensione ragionevole sono ok
      await setDoc(doc(this.firestore, `users/${u.uid}`), { photoURL }, { merge: true });
    }

    // Aggiorna solo il displayName su Auth (photoURL di Auth non viene toccato)
    await updateProfile(u, { displayName: name });
  }

  async enrollMfa(phoneNumber: string, recaptchaVerifier: any) {
    const u = this.auth.currentUser;
    if (!u) return;
    const session = await multiFactor(u).getSession();
    const phoneAuthProvider = new PhoneAuthProvider(this.auth);
    return await phoneAuthProvider.verifyPhoneNumber({ phoneNumber, session }, recaptchaVerifier);
  }

  async confirmMfaEnrollment(verificationId: string, smsCode: string, displayName: string) {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Utente non trovato');
    const cred = PhoneAuthProvider.credential(verificationId, smsCode);
    const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
    return await multiFactor(u).enroll(multiFactorAssertion, displayName);
  }

  async updateUserPassword(newPassword: string) {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Utente non autenticato');
    return updatePassword(u, newPassword);
  }

  async logout() {
    return signOut(this.auth);
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }
}