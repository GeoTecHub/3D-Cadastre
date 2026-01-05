import { Component } from '@angular/core';
import { ViewerContainer } from './components/viewer-container/viewer-container';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ViewerContainer],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {}
