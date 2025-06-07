import { Component, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'frontend';
  isLoggedIn = !!localStorage.getItem('token');

  constructor(private cdr: ChangeDetectorRef) {
    window.addEventListener('storage', () => {
      this.isLoggedIn = !!localStorage.getItem('token');
      this.cdr.detectChanges();
    });
  }
}
