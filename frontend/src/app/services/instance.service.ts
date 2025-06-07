import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Instance } from '../models/instance.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InstanceService {
  private apiUrl = `${environment.apiUrl}/instances`;
  private chatwootApiUrl = `${environment.apiUrl}/chatwoot`;

  constructor(private http: HttpClient) {}

  getInstances(): Observable<Instance[]> {
    return this.http.get<Instance[]>(this.apiUrl);
  }

  createChatwootInbox(name: string, accountId: string, instanceId: string, apiToken: string): Observable<Instance> {
    return this.http.post<Instance>(`${this.chatwootApiUrl}/connect/${instanceId}`, { accountId, name, apiToken });
  }

  getInstance(id: string): Observable<Instance> {
    return this.http.get<Instance>(`${this.apiUrl}/${id}`);
  }

  createInstance(name: string): Observable<Instance> {
    return this.http.post<Instance>(this.apiUrl, { name });
  }

  updateInstance(id: string, updates: Partial<Instance>): Observable<Instance> {
    return this.http.put<Instance>(`${this.apiUrl}/${id}`, updates);
  }

  deleteInstance(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  connectInstance(id: string): Observable<Instance> {
    return this.http.post<Instance>(`${this.apiUrl}/${id}/connect`, {});
  }

  disconnectInstance(id: string): Observable<Instance> {
    return this.http.post<Instance>(`${this.apiUrl}/${id}/disconnect`, {});
  }

  sendMessage(instanceId: string, number: string, message: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/v1/messages`, {
      instanceId,
      number,
      message
    });
  }

  sendMediaMessage(instanceId: string, number: string, message: string, mediaUrl: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/v1/messages/media`, {
      instanceId,
      number,
      message,
      mediaUrl
    });
  }
} 