/**
 * Çok oyunculu katman.
 *
 * Buluşma: aynı Wi-Fi'daki herkes aynı genel IP'den çıkar; /api/network bunun
 * tuzlanmış özetini döner ve o özet bir lobi odası adı olur. Bağlantı kurulduktan
 * sonra veri WebRTC ile doğrudan cihazlar arasında akar (aynı ağdaysanız
 * router'dan bile çıkmaz).
 *
 * Koordinat aynalaması: iki taraf da kendi dünyasında +Z tarafında oynar.
 * Tel üzerindeki konum/hız/dönü Y ekseni etrafında 180° döndürülerek
 * (x,z -> -x,-z) aktarılır. Böylece oyun kodunun geri kalanı tek oyunculu
 * hâliyle birebir aynı kalır.
 */

const TRYSTERO = 'https://cdn.jsdelivr.net/npm/trystero@0.21.5/nostr/+esm';
const APP_ID = 'el-takipli-tenis-v1';

export const mirror = (a) => [-a[0], a[1], -a[2]];

const now = () => performance.now();

export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.room = null;
    this.selfId = null;
    this.name = '';
    this.peers = new Map();       // id -> { name, busy, t }
    this.match = null;            // { peerId, isHost }
    this.lastSeen = new Map();
    this._hb = null;
  }

  get connected() { return !!this.room; }
  get inMatch() { return !!this.match; }

  /** Ağ kimliğini al; başarısızsa null döner (o zaman oda kodu kullanılır). */
  static async networkId() {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/network', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.id ? String(j.id) : null;
    } catch { return null; }
  }

  /** Lobiye gir. roomKey: ağ kimliği ya da elle girilen oda kodu. */
  async join(roomKey, name) {
    const { joinRoom, selfId } = await import(/* @vite-ignore */ TRYSTERO);
    this.selfId = selfId;
    this.name = name;

    this.room = joinRoom({ appId: APP_ID }, `t-${roomKey}`);

    const mk = (tag) => this.room.makeAction(tag);
    [this._sendHi, this._onHi] = mk('hi');
    [this._sendInv, this._onInv] = mk('inv');
    [this._sendAcc, this._onAcc] = mk('acc');
    [this._sendBye, this._onBye] = mk('bye');
    [this._sendRk, this._onRk] = mk('rk');
    [this._sendSh, this._onSh] = mk('sh');
    [this._sendSt, this._onSt] = mk('st');

    this._onHi((d, id) => {
      this.peers.set(id, { name: String(d.n || 'Oyuncu').slice(0, 16), busy: !!d.b });
      this.lastSeen.set(id, now());
      this.h.onPeers && this.h.onPeers(this.list());
    });

    this._onInv((d, id) => {
      if (this.match) { this._sendBye({ r: 'busy' }, id); return; }
      this.h.onInvite && this.h.onInvite(id, this.peerName(id));
    });

    this._onAcc((d, id) => {
      if (this.match) return;
      // daveti gönderen ev sahibi olur
      this.match = { peerId: id, isHost: true };
      this._broadcastHi();
      this.h.onMatchStart && this.h.onMatchStart({ isHost: true, peerId: id, name: this.peerName(id) });
    });

    this._onBye((d, id) => {
      if (this.match && this.match.peerId === id) {
        const reason = d && d.r;
        this.match = null;
        this._broadcastHi();
        this.h.onMatchEnd && this.h.onMatchEnd(reason || 'peer');
      }
    });

    this._onRk((d, id) => {
      if (this.match && this.match.peerId === id) this.h.onRacket && this.h.onRacket(d);
    });
    this._onSh((d, id) => {
      if (this.match && this.match.peerId === id) this.h.onShot && this.h.onShot(d);
    });
    this._onSt((d, id) => {
      if (this.match && this.match.peerId === id) this.h.onState && this.h.onState(d);
    });

    this.room.onPeerJoin((id) => {
      this._broadcastHi();
      this.lastSeen.set(id, now());
    });
    this.room.onPeerLeave((id) => {
      this.peers.delete(id);
      this.lastSeen.delete(id);
      if (this.match && this.match.peerId === id) {
        this.match = null;
        this.h.onMatchEnd && this.h.onMatchEnd('disconnect');
      }
      this.h.onPeers && this.h.onPeers(this.list());
    });

    this._broadcastHi();
    this._hb = setInterval(() => {
      this._broadcastHi();
      // sessizleşen eşleri düş
      const t = now();
      let changed = false;
      for (const [id, seen] of this.lastSeen) {
        if (t - seen > 9000) { this.peers.delete(id); this.lastSeen.delete(id); changed = true; }
      }
      if (changed) this.h.onPeers && this.h.onPeers(this.list());
    }, 2500);

    return this.selfId;
  }

  _broadcastHi() {
    if (this._sendHi) this._sendHi({ n: this.name, b: !!this.match });
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

  invite(id) { this._sendInv({}, id); }

  accept(id) {
    this.match = { peerId: id, isHost: false };   // daveti kabul eden misafir
    this._sendAcc({}, id);
    this._broadcastHi();
    this.h.onMatchStart && this.h.onMatchStart({ isHost: false, peerId: id, name: this.peerName(id) });
  }

  decline(id) { this._sendBye({ r: 'decline' }, id); }

  quitMatch() {
    if (!this.match) return;
    this._sendBye({ r: 'quit' }, this.match.peerId);
    this.match = null;
    this._broadcastHi();
  }

  leave() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
    this.quitMatch();
    if (this.room) this.room.leave();
    this.room = null;
    this.peers.clear();
  }

  // --- maç içi gönderim (aynalama burada yapılır) ---
  sendRacket(r) {
    if (!this.match) return;
    this._sendRk({ p: mirror(r.p), t: -r.t, s: r.s, f: r.f ? 1 : 0 }, this.match.peerId);
  }

  sendShot(s) {
    if (!this.match) return;
    this._sendSh({
      i: s.id, p: mirror(s.p), v: mirror(s.v), w: mirror(s.w), q: s.serve ? 1 : 0,
    }, this.match.peerId);
  }

  sendState(st) {
    if (!this.match || !this.match.isHost) return;
    this._sendSt({
      p: mirror(st.p), v: mirror(st.v), w: mirror(st.w),
      l: st.live ? 1 : 0, b: st.bounces, m: st.byHost ? 1 : 0,
      g: st.gs, s: st.score, r: st.rally, a: st.ack, n: st.shotId,
    }, this.match.peerId);
  }
}
