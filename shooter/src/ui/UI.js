import { Hud } from './Hud.js';
// временная заглушка интерфейса (будет заменена полноценным меню)
export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.hud = new Hud(this.root);
  }
  onMatchStart(m) { this.hud.attach(m); }
  onMatchEnd() {}
  showPause() {}
  update(dt) { if (this.game.match) this.hud.update(dt, this.game); }
}
