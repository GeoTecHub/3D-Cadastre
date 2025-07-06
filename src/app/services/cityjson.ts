import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TOKEN } from '../../../env'


@Injectable({
  providedIn: 'root',
})
export class CityjsonService {
  private cityjsonData: any = null;

  constructor(private http: HttpClient) { }

  async getCityJSONFromApi(apiUrl: string): Promise<any> {
    const headers = new HttpHeaders({
      Authorization: `token ${TOKEN}`, 
      'Content-Type': 'application/json'
    });
    return this.http.get(apiUrl, { headers }).toPromise();
  }

  async loadCityJSONFromUrl(url: string): Promise<any> {
    this.cityjsonData = await firstValueFrom(this.http.get(url));
    return this.cityjsonData;
  }

  getCityJSON(): any {
    return this.cityjsonData;
  }
}
