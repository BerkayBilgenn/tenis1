const $ = (s) => document.querySelector(s);
const NAMES = ['0', '15', '30', '40'];

export class Hud {
  constructor() {
    this.el = {
      youPts: $('#you-points'), oppPts: $('#opp-points'),
      youGames: $('#you-games'), oppGames: $('#opp-games'),
      rally: $('#rally'), speed: $('#speed'), best: $('#best'),
      msg: $('#center-msg'), msgText: $('#center-msg span'),
      feel: $('#feel'), feelText: $('#feel span'),
      gestures: {
        track: $('.g[data-g="track"]'), pinch: $('.g[data-g="pinch"]'),
        fist: $('.g[data-g="fist"]'), swing: $('.g[data-g="swing"]'),
      },
    };
    this.pts = [0, 0];      // [sen, rakip]
    this.games = [0, 0];
    this.rally = 0;
    this.best = 0;
    this._msgTimer = 0;
    this._feelTimer = 0;
    this._swingGlow = 0;
    this.render();
  }

  reset() {
    this.pts = [0, 0]; this.games = [0, 0]; this.rally = 0;
    this.render();
  }

  /** who: 0 = sen, 1 = rakip. Oyun kazanıldıysa true döner. */
  point(who) {
    this.pts[who]++;
    let gameWon = false;
    const [a, b] = this.pts;
    if (Math.max(a, b) >= 4 && Math.abs(a - b) >= 2) {
      this.games[who]++;
      this.pts = [0, 0];
      gameWon = true;
    }
    this.bump(who);
    this.render();
    return gameWon;
  }

  label(i) {
    const [a, b] = this.pts;
    if (a >= 3 && b >= 3) {
      if (a === b) return '40';
      return (i === 0 ? a > b : b > a) ? 'AV' : '—';
    }
    return NAMES[this.pts[i]] ?? '40';
  }

  bump(who) {
    const el = who === 0 ? this.el.youPts : this.el.oppPts;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  render() {
    this.el.youPts.textContent = this.label(0);
    this.el.oppPts.textContent = this.label(1);
    this.el.youGames.textContent = this.games[0];
    this.el.oppGames.textContent = this.games[1];
    this.el.rally.textContent = this.rally;
    this.el.best.innerHTML = `${this.best}<i>ralli</i>`;
  }

  setRally(n) {
    this.rally = n;
    if (n > this.best) this.best = n;
    this.render();
  }

  setSpeed(kmh) {
    this.el.speed.innerHTML = `${Math.round(kmh)}<i>km/s</i>`;
  }

  say(text, tone = '', seconds = 1.6) {
    this.el.msgText.textContent = text;
    this.el.msg.className = 'show ' + tone;
    this._msgTimer = seconds;
  }

  hideMsg() { this.el.msg.className = ''; this._msgTimer = 0; }

  /** Vuruş kalitesi geri bildirimi (kısa ömürlü) */
  feel(text, tone = '') {
    if (!this.el.feel) return;
    this.el.feelText.textContent = text;
    this.el.feel.className = 'show ' + tone;
    void this.el.feel.offsetWidth;
    this._feelTimer = 0.75;
  }

  flashSwing() { this._swingGlow = 0.28; }

  update(dt, hand) {
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.el.msg.className = '';
    }
    if (this._feelTimer > 0) {
      this._feelTimer -= dt;
      if (this._feelTimer <= 0 && this.el.feel) this.el.feel.className = '';
    }
    if (this._swingGlow > 0) this._swingGlow -= dt;

    const g = this.el.gestures;
    g.track.classList.toggle('on', hand.present);
    g.pinch.classList.toggle('on', hand.pinch);
    g.fist.classList.toggle('on', hand.fist);
    g.swing.classList.toggle('on', this._swingGlow > 0 || hand.speed > 2.2);
  }
}
