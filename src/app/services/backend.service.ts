// Path: src/app/services/backend.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environment/environment';
import {
  CityJSON,
  CityJSONSavePayload,
  CityJSONRecord,
  CityObjectSavePayload,
  CityObjectRecord
} from './cityjson.model';

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  private readonly cityjsonUrl = `${environment.apiBaseUrl}/cityjson/`;
  private readonly cityobjectsUrl = `${environment.apiBaseUrl}/cityobjects/`;

  constructor(private http: HttpClient) {}

  private get authHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `token ${environment.apiToken}`,
      'Content-Type': 'application/json'
    });
  }

  // ─── CityJSON Model Endpoints ──────────────────────────────

  /** Save a CityJSON model to the backend. */
  async saveCityJSON(name: string, cityjsonData: CityJSON): Promise<CityJSONRecord> {
    const payload: CityJSONSavePayload = {
      name,
      cityjson_data: cityjsonData
    };

    return firstValueFrom(
      this.http.post<CityJSONRecord>(this.cityjsonUrl, payload, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** List all saved CityJSON models. */
  async listCityJSON(): Promise<CityJSONRecord[]> {
    return firstValueFrom(
      this.http.get<CityJSONRecord[]>(this.cityjsonUrl, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** Get a specific CityJSON model by ID. */
  async getCityJSON(id: number): Promise<CityJSONRecord> {
    return firstValueFrom(
      this.http.get<CityJSONRecord>(`${this.cityjsonUrl}${id}/`, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** Delete a CityJSON model by ID. */
  async deleteCityJSON(id: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.cityjsonUrl}${id}/`, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  // ─── CityObjects (Apartments) Endpoints ────────────────────

  /** Save an apartment (city object) to the backend. */
  async saveApartment(
    cityjsonRecordId: number,
    apartmentId: string,
    rooms: string[]
  ): Promise<CityObjectRecord> {
    const payload: CityObjectSavePayload = {
      cityjson_record: cityjsonRecordId,
      apartment_id: apartmentId,
      rooms
    };

    return firstValueFrom(
      this.http.post<CityObjectRecord>(this.cityobjectsUrl, payload, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** List all saved apartments. Optionally filter by CityJSON record ID. */
  async listApartments(cityjsonRecordId?: number): Promise<CityObjectRecord[]> {
    let url = this.cityobjectsUrl;
    if (cityjsonRecordId !== undefined) {
      url += `?cityjson_record=${cityjsonRecordId}`;
    }

    return firstValueFrom(
      this.http.get<CityObjectRecord[]>(url, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** Get a specific apartment by ID. */
  async getApartment(id: number): Promise<CityObjectRecord> {
    return firstValueFrom(
      this.http.get<CityObjectRecord>(`${this.cityobjectsUrl}${id}/`, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  /** Delete an apartment by ID. */
  async deleteApartment(id: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.cityobjectsUrl}${id}/`, {
        headers: this.authHeaders
      }).pipe(catchError(this.handleError))
    );
  }

  // ─── Error Handling ────────────────────────────────────────

  private handleError(error: HttpErrorResponse) {
    let message = 'An unknown error occurred';
    if (error.error instanceof ErrorEvent) {
      message = `Client error: ${error.error.message}`;
    } else {
      message = `Server error ${error.status}: ${error.message}`;
    }
    console.error('BackendService:', message);
    return throwError(() => new Error(message));
  }
}
