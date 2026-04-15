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
import { 
  Storage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from '@angular/fire/storage';
import { Router } from '@angular/router';
import { multiFactor, PhoneAuthProvider, PhoneMultiFactorGenerator } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private router = inject(Router);
  
  user$ = user(this.auth);

  async login(email: string, pass: string) {
    await signInWithEmailAndPassword(this.auth, email, pass);
    this.router.navigate(['/dashboard']);
  }


private storage = inject(Storage);

async register(email: string, pass: string, name: string, image: File | null) {
  const userCredential = await createUserWithEmailAndPassword(this.auth, email, pass);
  let photoURL = '';

  if (image) {
    const storageRef = ref(this.storage, `avatars/${userCredential.user.uid}`);
    await uploadBytes(storageRef, image);
    photoURL = await getDownloadURL(storageRef);
  }

  await updateProfile(userCredential.user, { displayName: name, photoURL: photoURL });
}




async enrollMfa(phoneNumber: string, recaptchaVerifier: any) {
  const user = this.auth.currentUser;
  if (!user) return;

  const session = await multiFactor(user).getSession();
  const phoneInfoOptions = {
    phoneNumber: phoneNumber,
    session: session
  };
  const phoneAuthProvider = new PhoneAuthProvider(this.auth);
  return await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
  // Qui dovrai mostrare un input per il codice ricevuto via SMS
}

async confirmMfaEnrollment(verificationId: string, smsCode: string, displayName: string) {
  const user = this.auth.currentUser;
  if (!user) throw new Error("Utente non trovato");

  const cred = PhoneAuthProvider.credential(verificationId, smsCode);
  const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
  
  // Questo "enroll" attiva effettivamente la 2FA sull'account
  return await multiFactor(user).enroll(multiFactorAssertion, displayName);
}
async updateUserProfile(name: string, image: File | null) {
  const user = this.auth.currentUser;
  if (!user) return;
  let photoURL = user.photoURL || '';
  if (image) {
    const storageRef = ref(this.storage, `avatars/${user.uid}`);
    await uploadBytes(storageRef, image);
    photoURL = await getDownloadURL(storageRef);
  }
  return updateProfile(user, { displayName: name, photoURL: photoURL });
}

// Per aggiornare la Password
async updateUserPassword(newPassword: string) {
  const user = this.auth.currentUser;
  if (!user) throw new Error("Utente non autenticato");
  return updatePassword(user, newPassword);
}

// Per uscire
async logout() {
  return signOut(this.auth);
}

getCurrentUser() {
  return this.auth.currentUser;
}




}