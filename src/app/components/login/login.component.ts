// src/app/components/login/login.component.ts

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form fields
  username = signal('');
  password = signal('');
  showPassword = signal(false);

  // Get state from auth service
  readonly isLoggingIn = this.authService.isLoggingIn;
  readonly loginError = this.authService.loginError;

  onUsernameChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.username.set(input.value);
    this.authService.clearError();
  }

  onPasswordChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.password.set(input.value);
    this.authService.clearError();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(event: Event): void {
    event.preventDefault();

    const username = this.username().trim();
    const password = this.password();

    if (!username || !password) {
      return;
    }

    this.authService.login(username, password).subscribe({
      next: () => {
        // Navigate to the main viewer on successful login
        this.router.navigate(['/viewer']);
      },
      error: (err) => {
        console.error('Login failed:', err);
        // Error is already set in the auth service
      }
    });
  }
}
