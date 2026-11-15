// 盤面専用のリアルタイム部屋。観戦ワールドの状態は書き換えない。
const INTERVAL = 80;
const STATE_EVERY = 0.16;

export class BoardRoom {
  constructor(game, client, revision, onStatus) {
    this.game = game;
    this.client = client;
    this.revision = revision;
    this.onStatus = onStatus;
    this.id = crypto.randomUUID();
    this.seq = 0;
    this.received = -1;
    this.actionSeq = 0;
    this.outbox = [];
    this.host = null;
    this.lastReceived = 0;
    this.ready = false;
  }

  start(char, world) {
    if (!this.client) { this.onStatus('failed'); return; }
    this.profile = { char, world, since: Date.now() };
    this.absent = new Map();
    this.lastTick = this.startedAt = performance.now();
    this.lastState = 0;
    this.channel = this.client.channel('oc-sugoroku-v1-' + this.revision, {
      config: { presence: { key: this.id }, broadcast: { self: false } },
    });
    this.channel
      .on('presence', { event: 'sync' }, () => this.elect())
      .on('broadcast', { event: 'board' }, ({ payload }) => this.receive(payload))
      .on('broadcast', { event: 'action' }, ({ payload }) => {
        if (this.isHost && this.members?.has(payload.from)) this.applyAction(payload);
      })
      .subscribe(async (status) => {
        if (!this.channel) return;
        this.subscribed = status === 'SUBSCRIBED';
        if (this.subscribed) await this.track();
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) this.onStatus(this.ready ? 'reconnect' : 'failed');
      });
    this.interval = setInterval(() => this.tick(), INTERVAL);
    this.visibility = () => this.track();
    document.addEventListener('visibilitychange', this.visibility);
  }

  async track() {
    if (!this.channel || !this.subscribed) return;
    await this.channel.track({ ...this.profile, active: !document.hidden });
  }

  stop() {
    if (!this.channel) return;
    clearInterval(this.interval);
    document.removeEventListener('visibilitychange', this.visibility);
    const ch = this.channel;
    this.channel = null;
    this.client.removeChannel(ch);
  }

  get isHost() { return this.host === this.id; }

  elect() {
    if (!this.channel) return;
    const members = new Map(Object.entries(this.channel.presenceState()).flatMap(([id, records]) => records[0] ? [[id, records[0]]] : []));
    if (!members.has(this.id)) return;
    this.members = members;
    const ids = [...members.keys()].sort((a, b) => {
      const A = members.get(a), B = members.get(b);
      return Number(B.active) - Number(A.active) || A.since - B.since || a.localeCompare(b);
    });
    if (this.host !== ids[0]) {
      this.host = ids[0];
      this.received = -1;
      this.lastReceived = performance.now();
    }
    if (this.isHost) {
      for (const [id, { char, world }] of members) this.game.join(id, char, world);
      this.sendState();
      this.markReady();
    }
  }

  markReady() {
    if (!this.ready && this.game.player(this.id)) {
      this.ready = true;
      this.onStatus('online');
    }
  }

  receive(payload) {
    if (this.isHost || payload.from !== this.host || payload.seq <= this.received) return;
    if (!this.game.restore(payload.state)) return;
    this.received = payload.seq;
    this.lastReceived = performance.now();
    this.markReady();
    if (this.ready) this.onStatus('online');
  }

  send(op, value, token) {
    if (!this.ready || this.outbox.length >= 16) return;
    this.outbox.push({ from: this.id, seq: ++this.actionSeq, op, value, token });
    this.flushCommands();
  }

  applyAction(message) {
    const p = this.game.player(message.from);
    if (!p || !Number.isSafeInteger(message.seq) || message.seq <= (p.inputSeq ?? 0)) return;
    this.game.act(p, message.op, message.value, message.token);
    p.inputSeq = message.seq;
  }

  flushCommands() {
    const p = this.game.player(this.id);
    if (!p || !this.subscribed) return;
    while (this.outbox.length && this.outbox[0].seq <= (p.inputSeq ?? 0)) this.outbox.shift();
    const first = this.outbox[0];
    if (!first) return;
    if (this.isHost) this.applyAction(first);
    else if (performance.now() - (first.sentAt ?? -Infinity) >= 290) {
      first.sentAt = performance.now();
      this.broadcast('action', first);
    }
  }

  broadcast(event, payload) {
    this.channel?.send({ type: 'broadcast', event, payload });
  }

  sendState() {
    this.lastState = this.game.time;
    this.broadcast('board', { from: this.id, seq: ++this.seq, state: this.game.state });
  }

  tick() {
    const now = performance.now();
    const elapsed = Math.min(1.2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (!this.ready && now - this.startedAt > 15000) this.onStatus('failed');
    if (!this.subscribed) return;
    this.flushCommands();
    if (!this.isHost) {
      if (this.ready && now - this.lastReceived > 5000) this.onStatus('reconnect');
      return;
    }
    if (this.ready) this.onStatus('online');
    for (const p of [...this.game.state.players]) {
      if (this.members?.has(p.id)) this.absent.delete(p.id);
      else {
        if (!this.absent.has(p.id)) this.absent.set(p.id, now);
        if (now - this.absent.get(p.id) > 12000) {
          this.game.leave(p.id);
          this.absent.delete(p.id);
        }
      }
    }
    for (let remaining = elapsed; remaining > 0;) {
      const dt = Math.min(0.08, remaining);
      this.game.update(dt);
      remaining -= dt;
    }
    if (this.game.time - this.lastState >= STATE_EVERY) this.sendState();
  }
}
