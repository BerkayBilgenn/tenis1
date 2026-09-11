import { Net } from './net.js';

const $ = (s) => document.querySelector(s);
const NAME_KEY = 'tenis-oyuncu-adi';

const RANDOM_NAMES = ['Fileci', 'Smaççı', 'Topspin', 'Volecı', 'Servisçi', 'Rallici', 'Slice', 'Dropshot'];

/** Lobi arayüzü: ağdaki oyuncuları listeler, davet alışverişini yönetir. */
export class Lobby {
  constructor({ onMatchStart, onMatchEnd, net }) {
    this.net = net;
    this.onMatchStart = onMatchStart;
    this.onMatchEnd = onMatchEnd;

    this.el = {
      open: $('#btn-mp'),
      panel: $('#lobby'),
      close: $('#lobby-close'),
      status: $('#lobby-status'),
      name: $('#lobby-name'),
      list: $('#player-list'),
      title: $('#players-title'),
      dot: $('#lobby-dot'),
      code: $('#room-code'),
      codeJoin: $('#room-join'),
      invite: $('#invite'),
      inviteName: $('#invite-name'),
      inviteYes: $('#invite-yes'),
      inviteNo: $('#invite-no'),
      badge: $('#mp-badge'),
      badgeName: $('#mp-name'),
      badgeDot: $('#mp-dot'),
      quit: $('#mp-quit'),
    };

    this.pendingInvite = null;
    this.invited = new Set();
    this.accepting = null;
    this.log = [];

    const saved = localStorage.getItem(NAME_KEY);
    this.el.name.value = saved || RANDOM_NAMES[(Math.random() * RANDOM_NAMES.length) | 0];

    this.el.open.addEventListener('click', () => this.show());
    this.el.close.addEventListener('click', () => this.hide());
    this.el.name.addEventListener('input', () => {
      localStorage.setItem(NAME_KEY, this.el.name.value.trim());
      this.net.name = this.playerName();
    });
    this.el.codeJoin.addEventListener('click', () => this.joinCode());
    this.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinCode(); });

    this.el.inviteYes.addEventListener('click', () => {
      if (!this.pendingInvite) { this.hideInvite(); return; }
      this.accepting = this.pendingInvite;
      this.net.accept(this.pendingInvite);
      this.el.inviteYes.disabled = true;
      this.el.inviteYes.textContent = 'Bağlanılıyor…';
    });
    this.el.inviteNo.addEventListener('click', () => {
      if (this.pendingInvite) this.net.decline(this.pendingInvite);
      this.hideInvite();
    });
    this.el.quit.addEventListener('click', () => {
      this.net.quitMatch();
      this.endMatch('quit');
    });
  }

  playerName() {
    return (this.el.name.value.trim() || 'Oyuncu').slice(0, 16);
  }

  async show() {
    this.el.panel.classList.remove('hidden');
    if (this.net.connected) { this.render(); return; }

    this.setStatus('Ağ kimliği alınıyor…', false);
    const id = await Net.networkId();

    if (!id) {
      this.setStatus('Ağ otomatik bulunamadı — aşağıdan oda kodu kullanın.', false);
      this.el.title.textContent = 'ODA';
      this.el.list.innerHTML = '<li class="empty">Oda kodu girip bağlanın</li>';
      const box = document.querySelector('.code-box');
      if (box) box.open = true;
      return;
    }

    this.setStatus('Ağa bağlanılıyor…', false);
    try {
      await this.net.join(id, this.playerName());
      this.setStatus("Aynı Wi-Fi'daki oyuncular burada görünür.", true);
      this.render();
    } catch (e) {
      console.error('[lobi]', e);
      this.setStatus('Bağlanılamadı. Oda kodunu deneyin.', false);
    }
  }

  async joinCode() {
    const code = (this.el.code.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 3) { this.setStatus('En az 3 karakterlik bir kod girin.', false); return; }
    if (this.net.connected) this.net.leave();
    this.setStatus(`"${code}" odasına giriliyor…`, false);
    try {
      await this.net.join(`kod-${code}`, this.playerName());
      this.el.title.textContent = `ODA: ${code}`;
      this.setStatus('Aynı kodu giren herkes burada görünür.', true);
      this.render();
    } catch (e) {
      console.error('[lobi]', e);
      this.setStatus('Odaya girilemedi.', false);
    }
  }

  hide() { this.el.panel.classList.add('hidden'); }

  setStatus(text, live) {
    this.el.status.textContent = text;
    this.el.dot.classList.toggle('on', !!live);
  }

  render(players = this.net.list()) {
    const ul = this.el.list;
    ul.innerHTML = '';
    if (!players.length) {
      ul.innerHTML = '<li class="empty">Henüz kimse yok.<br>Arkadaşın da aynı sayfayı açıp<br>“Arkadaşınla Oyna”ya bassın.</li>';
      return;
    }
    for (const p of players) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = p.name;
      li.appendChild(who);

      if (p.busy) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'MAÇTA';
        li.appendChild(tag);
      } else {
        const btn = document.createElement('button');
        const waiting = this.invited.has(p.id);
        btn.textContent = waiting ? 'Bekleniyor…' : 'Davet Et';
        btn.disabled = waiting;
        btn.addEventListener('click', () => {
          this.net.invite(p.id);
          this.invited.add(p.id);
          this.setStatus(`${p.name} davet edildi — yanıt bekleniyor…`, true);
          this.render();
        });
        li.appendChild(btn);
      }
      ul.appendChild(li);
    }
  }

  showInvite(id, name) {
    this.pendingInvite = id;
    this.el.inviteName.textContent = name;
    this.el.invite.classList.remove('hidden');
  }
  hideInvite() {
    this.pendingInvite = null;
    this.accepting = null;
    this.el.invite.classList.add('hidden');
    this.el.inviteYes.disabled = false;
    this.el.inviteYes.textContent = 'Kabul Et';
  }

  /** Davet sonucu: zaman aşımı, ret ya da kopma */
  inviteResult(reason, name) {
    this.invited.clear();
    this.hideInvite();
    const text = reason === 'decline' ? `${name || 'Rakip'} daveti reddetti.`
      : reason === 'busy' ? `${name || 'Rakip'} başka maçta.`
      : reason === 'timeout' ? 'Karşı taraftan yanıt gelmedi — tekrar dene.'
      : 'Bağlantı koptu.';
    this.setStatus(text, this.net.connected);
    this.render();
  }

  setLink(info) {
    if (!info) return;
    if (info.state === 'connected') {
      this.setStatus("Aynı Wi-Fi'daki oyuncular burada görünür.", true);
    } else if (info.state === 'failed') {
      this.setStatus('Sinyalleşme ağına bağlanılamadı. Oda kodunu deneyin.', false);
    }
  }

  addLog(line) {
    this.log.push(`${new Date().toLocaleTimeString('tr-TR')}  ${line}`);
    if (this.log.length > 60) this.log.shift();
  }

  startMatch(info) {
    this.hide();
    this.hideInvite();
    this.accepting = null;
    this.invited.clear();
    this.el.badge.classList.remove('hidden');
    this.el.badgeName.textContent = info.name;
    this.el.badgeDot.classList.remove('bad');
    this.onMatchStart && this.onMatchStart(info);
  }

  endMatch(reason) {
    this.el.badge.classList.add('hidden');
    this.invited.clear();
    this.render();
    this.onMatchEnd && this.onMatchEnd(reason);
  }

  setLinkQuality(ok) {
    this.el.badgeDot.classList.toggle('bad', !ok);
  }
}
