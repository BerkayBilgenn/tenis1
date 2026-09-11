/**
 * Çok oyunculu katman.
 *
 * Buluşma: aynı Wi-Fi'daki herkes aynı genel IP'den çıkar; /api/network bunun
 * tuzlanmış özetini döner ve o özet lobi odasının adı olur. Bağlantı kurulduktan
 * sonra veri WebRTC ile doğrudan cihazlar arasında akar.
 *
 * Dayanıklılık:
 *  - Birden çok sinyalleşme stratejisi sırayla denenir (biri engelliyse diğeri).
 *  - Davet/kabul üç adımlı ve TEKRARLI: tek paket kaybolunca taraflardan biri
 *    asılı kalmaz; iki taraf da onay almadan maç başlamaz.
 *  - Maç boyunca ping/pong ile gecikme ölçülür, sessizlik kopma sayılır.
 *
 * Koordinat aynalaması: iki taraf da kendi dünyasında +Z tarafında oynar.
 * Tel üzerindeki konum/hız/dönü Y ekseni etrafında 180° döndürülerek aktarılır.
 */

const STRATEGIES = [
  { name: 'nostr',   url: 'https://cdn.jsdelivr.net/npm/trystero@0.21.5/nostr/+esm' },
  { name: 'torrent', url: 'https://cdn.jsdelivr.net/npm/trystero@0.21.5/torrent/+esm' },
  { name: 'mqtt',    url: 'https://cdn.jsdelivr.net/npm/trystero@0.21.5/mqtt/+esm' },
];
const APP_ID = 'el-takipli-tenis-v1';

const HELLO_EVERY = 2000;      // varlık duyurusu
const PEER_TTL = 12000;        // bu kadar sessiz kalan eş listeden düşer
const HANDSHAKE_RETRY = 700;   // davet/kabul tekrar aralığı
const HANDSHAKE_TRIES = 8;
const MATCH_PING = 1000;
const MATCH_TIMEOUT = 8000;

export const mirror = (a) => [-a[0], a[1], -a[2]];
const now = () => performance.now();

export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.room = null;
    this.strategy = null;
    this.selfId = null;
    this.name = '';
    this.peers = new Map();          // id -> { name, busy }
    this.lastSeen = new Map();
    this.match = null;               // { peerId, isHost, confirmed }
    this.rtt = 0;
    this.lastRecv = 0;
    this._timers = new Set();
    this._pendingInvite = null;      // gönderdiğimiz davet
    this._pendingAccept = null;      // gönderdiğimiz kabul
  }

  get connected() { return !!this.room; }
  get inMatch() { return !!(this.match && this.match.confirmed); }

  _log(...a) { if (this.h.onLog) this.h.onLog(a.join(' ')); }

  /** Ağ kimliğini al; başarısızsa null (o zaman oda kodu kullanılır). */
  static async networkId() {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch('/api/network', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.id ? String(j.id) : null;
    } catch { return null; }
  }

  _every(ms, fn) {
    const id = setInterval(fn, ms);
    this._timers.add(id);
    return id;
  }
  _clearTimers() {
    for (const id of this._timers) clearInterval(id);
    this._timers.clear();
  }

  /** Lobiye gir. Stratejileri sırayla dener. */
  async join(roomKey, name) {
    this.leave();
    this.name = name;
    let lastErr = null;

    for (const st of STRATEGIES) {
      try {
        this._log('strateji deneniyor:', st.name);
        const mod = await import(/* @vite-ignore */ st.url);
        this.selfId = mod.selfId;
        this.room = mod.joinRoom({ appId: APP_ID }, `t-${roomKey}`);
        this.strategy = st.name;
        this._wire();
        this._log('bağlandı:', st.name, 'kimlik:', this.selfId.slice(0, 6));
        this.h.onStatus && this.h.onStatus({ state: 'connected', strategy: st.name });
        return this.selfId;
      } catch (e) {
        lastErr = e;
        this._log('strateji başarısız:', st.name, String(e.message || e).slice(0, 60));
        try { if (this.room) this.room.leave(); } catch {}
        this.room = null;
      }
    }
    this.h.onStatus && this.h.onStatus({ state: 'failed' });
    throw lastErr || new Error('Sinyalleşme ağına bağlanılamadı');
  }

  _wire() {
    const mk = (tag) => this.room.makeAction(tag);
    [this._sHi, this._rHi] = mk('hi');
    [this._sInv, this._rInv] = mk('inv');
    [this._sAcc, this._rAcc] = mk('acc');
    [this._sGo, this._rGo] = mk('go');
    [this._sBye, this._rBye] = mk('bye');
    [this._sPing, this._rPing] = mk('pi');
    [this._sPong, this._rPong] = mk('po');
    [this._sRk, this._rRk] = mk('rk');
    [this._sSh, this._rSh] = mk('sh');
    [this._sSt, this._rSt] = mk('st');

    const touch = (id) => { this.lastSeen.set(id, now()); this.lastRecv = now(); };

    this._rHi((d, id) => {
      touch(id);
      const prev = this.peers.get(id);
      const next = { name: String(d.n || 'Oyuncu').slice(0, 16), busy: !!d.b };
      this.peers.set(id, next);
      if (!prev || prev.name !== next.name || prev.busy !== next.busy) this._emitPeers();
    });

    // --- davet akışı (üç adım: inv -> acc -> go) ---
    this._rInv((d, id) => {
      touch(id);
      if (this.match) { this._sBye({ r: 'busy' }, id); return; }
      // karşılıklı davet çakışması: küçük kimlik ev sahibi olur
      if (this._pendingInvite && this._pendingInvite.id === id) {
        if (this.selfId < id) return;          // biz ev sahibiyiz, onun davetini yok say
        this._cancelInvite();                  // o ev sahibi olsun, biz kabul edelim
      }
      this.h.onInvite && this.h.onInvite(id, this.peerName(id));
    });

    this._rAcc((d, id) => {
      touch(id);
      if (this.match && this.match.peerId !== id) { this._sBye({ r: 'busy' }, id); return; }
      this._cancelInvite();
      this.match = { peerId: id, isHost: true, confirmed: true };
      this._sGo({}, id);                       // karşı tarafa "başla" onayı
      this._repeat(() => this._sGo({}, id), 3, 400);
      this._broadcastHi();
      this._startMatchTimers();
      this.h.onMatchStart && this.h.onMatchStart({ isHost: true, peerId: id, name: this.peerName(id) });
    });

    this._rGo((d, id) => {
      touch(id);
      if (!this._pendingAccept || this._pendingAccept.id !== id) return;
      this._cancelAccept();
      this.match = { peerId: id, isHost: false, confirmed: true };
      this._broadcastHi();
      this._startMatchTimers();
      this.h.onMatchStart && this.h.onMatchStart({ isHost: false, peerId: id, name: this.peerName(id) });
    });

    this._rBye((d, id) => {
      touch(id);
      const reason = (d && d.r) || 'peer';
      if (this._pendingInvite && this._pendingInvite.id === id) {
        this._cancelInvite();
        this.h.onInviteResult && this.h.onInviteResult(reason, this.peerName(id));
        return;
      }
      if (this.match && this.match.peerId === id) this._endMatch(reason);
    });

    // --- gecikme ölçümü ---
    this._rPing((d, id) => { touch(id); this._sPong({ t: d.t }, id); });
    this._rPong((d, id) => { touch(id); this.rtt = Math.round(now() - d.t); });

    // --- maç verisi ---
    this._rRk((d, id) => { touch(id); if (this._isPeer(id)) this.h.onRacket && this.h.onRacket(d); });
    this._rSh((d, id) => { touch(id); if (this._isPeer(id)) this.h.onShot && this.h.onShot(d); });
    this._rSt((d, id) => { touch(id); if (this._isPeer(id)) this.h.onState && this.h.onState(d); });

    this.room.onPeerJoin((id) => {
      this.lastSeen.set(id, now());
      this._broadcastHi();
      setTimeout(() => this._broadcastHi(), 400);   // karşı taraf hazır olsun
      this._log('eş katıldı:', id.slice(0, 6));
    });

    this.room.onPeerLeave((id) => {
      this.peers.delete(id);
      this.lastSeen.delete(id);
      this._emitPeers();
      this._log('eş ayrıldı:', id.slice(0, 6));
      if (this.match && this.match.peerId === id) this._endMatch('disconnect');
      if (this._pendingInvite && this._pendingInvite.id === id) this._cancelInvite();
      if (this._pendingAccept && this._pendingAccept.id === id) {
        this._cancelAccept();
        this.h.onInviteResult && this.h.onInviteResult('disconnect', '');
      }
    });

    this._broadcastHi();
    this._every(HELLO_EVERY, () => {
      this._broadcastHi();
      let changed = false;
      const t = now();
      for (const [id, seen] of this.lastSeen) {
        if (t - seen > PEER_TTL) { this.peers.delete(id); this.lastSeen.delete(id); changed = true; }
      }
      if (changed) this._emitPeers();
    });
  }

  _isPeer(id) { return this.match && this.match.peerId === id; }
  _emitPeers() { this.h.onPeers && this.h.onPeers(this.list()); }
  _broadcastHi() { if (this._sHi) this._sHi({ n: this.name, b: !!this.match }); }

  _repeat(fn, times, ms) {
    let n = 0;
    const id = setInterval(() => { if (++n >= times) clearInterval(id); fn(); }, ms);
    this._timers.add(id);
    return id;
  }

  list() {
    return [...this.peers.entries()]
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  peerName(id) {
    const p = this.peers.get(id);
    return p ? p.name : 'Oyuncu';
  }

  // ---------------------------------------------------------- davet
  invite(id) {
    if (this.match || this._pendingInvite) return;
    let tries = 0;
    this._sInv({}, id);
    const timer = setInterval(() => {
      if (!this._pendingInvite || this.match) { clearInterval(timer); return; }
      if (++tries >= HANDSHAKE_TRIES) {
        clearInterval(timer);
        this._cancelInvite();
        this.h.onInviteResult && this.h.onInviteResult('timeout', this.peerName(id));
        return;
      }
      this._sInv({}, id);
    }, HANDSHAKE_RETRY);
    this._timers.add(timer);
    this._pendingInvite = { id, timer };
  }

  _cancelInvite() {
    if (!this._pendingInvite) return;
    clearInterval(this._pendingInvite.timer);
    this._timers.delete(this._pendingInvite.timer);
    this._pendingInvite = null;
  }

  accept(id) {
    if (this.match || this._pendingAccept) return;
    let tries = 0;
    this._sAcc({}, id);
    const timer = setInterval(() => {
      if (!this._pendingAccept || this.match) { clearInterval(timer); return; }
      if (++tries >= HANDSHAKE_TRIES) {
        clearInterval(timer);
        this._cancelAccept();
        this.h.onInviteResult && this.h.onInviteResult('timeout', this.peerName(id));
        return;
      }
      this._sAcc({}, id);
    }, HANDSHAKE_RETRY);
    this._timers.add(timer);
    this._pendingAccept = { id, timer };
  }

  _cancelAccept() {
    if (!this._pendingAccept) return;
    clearInterval(this._pendingAccept.timer);
    this._timers.delete(this._pendingAccept.timer);
    this._pendingAccept = null;
  }

  decline(id) { this._sBye({ r: 'decline' }, id); }

  // ---------------------------------------------------------- maç
  _startMatchTimers() {
    this.lastRecv = now();
    this._matchTimer = this._every(MATCH_PING, () => {
      if (!this.match) return;
      this._sPing({ t: now() }, this.match.peerId);
      if (now() - this.lastRecv > MATCH_TIMEOUT) this._endMatch('disconnect');
    });
  }

  _endMatch(reason) {
    if (!this.match) return;
    this.match = null;
    this.rtt = 0;
    this._broadcastHi();
    this._emitPeers();
    this.h.onMatchEnd && this.h.onMatchEnd(reason);
  }

  quitMatch() {
    if (!this.match) return;
    this._sBye({ r: 'quit' }, this.match.peerId);
    this.match = null;
    this._broadcastHi();
    this._emitPeers();
  }

  leave() {
    this._clearTimers();
    this._cancelInvite();
    this._cancelAccept();
    if (this.match) { try { this._sBye({ r: 'quit' }, this.match.peerId); } catch {} }
    this.match = null;
    if (this.room) { try { this.room.leave(); } catch {} }
    this.room = null;
    this.peers.clear();
    this.lastSeen.clear();
  }

  // --- maç içi gönderim (aynalama burada yapılır) ---
  sendRacket(r) {
    if (!this.inMatch) return;
    this._sRk({ p: mirror(r.p), t: -r.t, s: r.s, f: r.f ? 1 : 0 }, this.match.peerId);
  }

  sendShot(s) {
    if (!this.inMatch) return;
    this._sSh({ i: s.id, p: mirror(s.p), v: mirror(s.v), w: mirror(s.w), q: s.serve ? 1 : 0 },
              this.match.peerId);
  }

  sendState(st) {
    if (!this.inMatch || !this.match.isHost) return;
    this._sSt({
      p: mirror(st.p), v: mirror(st.v), w: mirror(st.w),
      l: st.live ? 1 : 0, b: st.bounces, m: st.byHost ? 1 : 0,
      g: st.gs, s: st.score, r: st.rally, a: st.ack,
    }, this.match.peerId);
  }
}
