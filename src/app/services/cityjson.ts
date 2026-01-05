import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CityJSON } from './cityjson.model';
import {environment} from '../../environment/environment';


@Injectable({
  providedIn: 'root',
})
export class CityjsonService {
  // Use a BehaviorSubject to hold the current CityJSON data.
  // This allows components to subscribe and react to data changes.
  private readonly _cityjsonData = new BehaviorSubject<CityJSON | null>(null);
  
  // Expose the data as an Observable for components to subscribe to.
  readonly cityjsonData$: Observable<CityJSON | null> = this._cityjsonData.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Fetches CityJSON data from a protected API.
   * @param apiUrl The full URL to the API endpoint.
   * @returns A promise that resolves when the data is fetched.
   */
  async getCityJSONFromApi(apiUrl: string): Promise<void> {
    const headers = new HttpHeaders({
      // Use the token from the environment file.
      'Authorization': `token ${environment.apiToken}`,
    });

    try {
      // Use firstValueFrom for modern async/await syntax with Observables.
      const data = await firstValueFrom(
        this.http.get<CityJSON>(apiUrl, { headers }).pipe(
          catchError(this.handleError) // Centralized error handling
        )
      );
      // Update the BehaviorSubject with the new data.
      this._cityjsonData.next(data);
    } catch (error) {
      console.error('Failed to fetch CityJSON from API:', error);
      // Optionally update state to reflect the error
      this._cityjsonData.next(null);
    }
  }

  /**
   * Loads CityJSON data from a public URL.(this is good for fetching the file from saved data)
   * @param url The public URL of the .json file.
   * @returns A promise that resolves when the data is loaded.
   */
  async loadCityJSONFromUrl(url: string): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<CityJSON>(url).pipe(
          catchError(this.handleError)
        )
      );
      this._cityjsonData.next(data);
    } catch (error) {
      console.error('Failed to load CityJSON from URL:', error);
      this._cityjsonData.next(null);
    }
  }

  /**
   * A simple getter for the current value, for non-reactive use cases.
   * @returns The current CityJSON data or null.
   */
  getCityJSONSnapshot(): CityJSON | null {
    return this._cityjsonData.getValue();
  }

  /**
   * Centralized error handler for HTTP requests.
   * @param error The HttpErrorResponse object.
   */
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    if (error.error instanceof ErrorEvent) {
      // Client-side errors
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side errors
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

   // --- NEW METHOD FOR LOCAL FILE READING ---

  /**
   * Reads a CityJSON file selected by the user from their computer.
   * @param file The File object from the <input type="file"> element.
   * @returns A Promise that resolves on success or rejects on failure.
   */
  loadCityJSONFromFile(file: File): Promise<void> {
    // We wrap the FileReader logic in a Promise.
    return new Promise((resolve, reject) => {
      // 1. Basic validation
      if (!file.type.match('application/json')) {
        reject(new Error('Invalid file type. Please select a .json file.'));
        return;
      }

      // 2. Create a new FileReader instance
      const reader = new FileReader();

      // 3. Define what happens when the file is successfully read
      reader.onload = (event) => {
        try {
          const fileContent = event.target?.result as string;
          // 4. Parse the text content as JSON
          const jsonData: CityJSON = JSON.parse(fileContent);
          
          // 5. Update our BehaviorSubject with the new data
          this._cityjsonData.next(jsonData);
          console.log('File successfully parsed and loaded.');
          resolve(); // Resolve the promise to indicate success
        } catch (error) {
          // This will catch errors if the file is not valid JSON
          this._cityjsonData.next(null);
          console.error('Error parsing JSON from file:', error);
          reject(new Error('The selected file is not valid JSON.'));
        }
      };

      // 6. Define what happens if there's an error reading the file
      reader.onerror = (error) => {
        this._cityjsonData.next(null);
        console.error('Error reading file:', error);
        reject(new Error('An error occurred while reading the file.'));
      };

      // 7. Start the reading process. This will trigger either onload or onerror.
      reader.readAsText(file);
    });
  }

}