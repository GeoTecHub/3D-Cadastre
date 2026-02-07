// src/app/services/auth.service.ts

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../environment/environment';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  auth_token?: string;
  key?: string;
  user?: {
    id?: number;
    username?: string;
    email?: string;
  };
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Store token in memory (as requested)
  private _token = signal<string | null>(null);
  private _user = signal<LoginResponse['user'] | null>(null);
  private _isLoggingIn = signal(false);
  private _loginError = signal<string | null>(null);

  // Public computed signals
  readonly token = computed(() => this._token());
  readonly user = computed(() => this._user());
  readonly isAuthenticated = computed(() => !!this._token());
  readonly isLoggingIn = computed(() => this._isLoggingIn());
  readonly loginError = computed(() => this._loginError());

  constructor(private http: HttpClient) {
    // Check for existing token in sessionStorage (persists during session)
    if (typeof window !== 'undefined') {
      const storedToken = sessionStorage.getItem('infobhoomi_token');
      if (storedToken) {
        this._token.set(storedToken);
      }
    }
  }

  /**
   * Login to the InfoBhoomi backend.
   * Uses the /api/user/login/ endpoint.
   */
  login(username: string, password: string): Observable<LoginResponse> {
    this._isLoggingIn.set(true);
    this._loginError.set(null);

    const loginUrl = environment.loginUrl;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body: LoginRequest = { username, password };

    return this.http.post<LoginResponse>(loginUrl, body, { headers }).pipe(
      tap(response => {
        // Extract token from response (handle different response formats)
        const token = response.token || response.auth_token || response.key;

        if (token) {
          this._token.set(token);
          this._user.set(response.user || null);

          // Store in sessionStorage for page refreshes
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('infobhoomi_token', token);
          }

          console.info('AuthService: Login successful, token received');
        } else {
          console.warn('AuthService: Login response did not contain a token', response);
          this._loginError.set('Login failed: No token received');
        }

        this._isLoggingIn.set(false);
      }),
      catchError(error => {
        console.error('AuthService: Login failed', error);
        this._isLoggingIn.set(false);

        const errorMessage = error.error?.message ||
                            error.error?.error ||
                            error.error?.detail ||
                            'Login failed. Please check your credentials.';
        this._loginError.set(errorMessage);

        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Logout - clears the token from memory and storage.
   */
  logout(): void {
    this._token.set(null);
    this._user.set(null);
    this._loginError.set(null);

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('infobhoomi_token');
    }

    console.info('AuthService: Logged out');
  }

  /**
   * Get the current token for API requests.
   */
  getToken(): string | null {
    return this._token();
  }

  /**
   * Clear any login errors.
   */
  clearError(): void {
    this._loginError.set(null);
  }
}
