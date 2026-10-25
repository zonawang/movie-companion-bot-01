import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}, '請使用真實日期 YYYY-MM-DD');
export const ticketSchema = z.object({
  movieTitle: z.string().trim().min(1).max(150).describe('使用者提供的片名'),
  watchedOn: date.describe('使用者提供的觀影日期，YYYY-MM-DD；未提供先詢問'),
  cinema: z.string().max(150).describe('影院；未提供用空字串'),
  companions: z.string().max(200).describe('跟誰看；未提供用空字串'),
  note: z.string().max(1500).describe('逐字引用使用者的心得；未提供用空字串，禁止改寫'),
}).strict();

export class Store {
  constructor(path = ':memory:', now = () => Date.now()) {
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, request TEXT NOT NULL,
        payload TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(actor, request)
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL
      );
      UPDATE jobs SET status='pending' WHERE status='processing';
    `);
  }
  prepare(actor, request, input, originals) {
    const ticket = ticketSchema.parse(input);
    // 原始文字與逐字心得分開保留，不讓模型摘要蓋掉使用者紀錄。
    if (ticket.note && !originals.some(text => text.includes(ticket.note))) {
      throw new Error('心得必須逐字取自使用者訊息，請勿改寫。');
    }
    const previous = this.db.prepare('SELECT * FROM drafts WHERE actor=? AND request=?').get(actor, request);
    if (previous) return this.view(previous);
    this.db.prepare("UPDATE drafts SET status='cancelled' WHERE actor=? AND status='pending'").run(actor);
    const draft = { id: randomUUID(), actor, request, payload: JSON.stringify({ ...ticket, originalMessages: originals }), expires: this.now() + 10 * 60_000 };
    this.db.prepare('INSERT INTO drafts(id,actor,request,payload,expires) VALUES(?,?,?,?,?)')
      .run(draft.id, actor, request, draft.payload, draft.expires);
    return this.view({ ...draft, status: 'pending' });
  }
  view(row) { return row && { id: row.id, ...JSON.parse(row.payload), expires: row.expires, status: row.status }; }
  pending(actor) {
    return this.view(this.db.prepare("SELECT * FROM drafts WHERE actor=? AND status='pending' AND expires>? ORDER BY rowid DESC LIMIT 1").get(actor, this.now()));
  }
  decide(actor, id, decision) {
    if (!['confirm', 'cancel'].includes(decision)) return { status: 'invalid' };
    // 同一交易內檢查擁有者、期限與狀態；重複點擊不會新增第二張票根。
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM drafts WHERE id=? AND actor=?').get(id, actor);
      let result;
      if (!row) result = { status: 'not_found' };
      else if (row.status !== 'pending') result = { status: row.status };
      else if (row.expires <= this.now()) result = { status: 'expired' };
      else if (decision === 'cancel') {
        this.db.prepare("UPDATE drafts SET status='cancelled' WHERE id=?").run(id);
        result = { status: 'cancelled' };
      } else {
        this.db.prepare('INSERT OR IGNORE INTO tickets VALUES(?,?,?,?)').run(id, actor, row.payload, this.now());
        this.db.prepare("UPDATE drafts SET status='saved' WHERE id=?").run(id);
        result = { status: 'saved', ticket: this.view(row) };
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(actor, keyword = '') {
    return this.db.prepare('SELECT * FROM tickets WHERE actor=? ORDER BY created DESC LIMIT 200').all(actor)
      .map(row => ({ id: row.id, ...JSON.parse(row.payload) }))
      .filter(ticket => [ticket.movieTitle, ticket.note, ticket.companions, ticket.cinema, ticket.watchedOn]
        .some(value => value.toLowerCase().includes(keyword.toLowerCase())))
      .slice(0, 20);
  }
  enqueue(event) {
    return this.db.prepare('INSERT OR IGNORE INTO jobs(id,payload,created) VALUES(?,?,?)')
      .run(event.webhookEventId, JSON.stringify(event), this.now()).changes > 0;
  }
  nextJob() {
    const row = this.db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY rowid LIMIT 1").get();
    if (!row) return null;
    this.db.prepare("UPDATE jobs SET status='processing' WHERE id=?").run(row.id);
    return { id: row.id, event: JSON.parse(row.payload), created: row.created };
  }
  finishJob(id, status = 'done') {
    // 清除訊息與 reply token；保留事件 ID 作為去重依據。
    this.db.prepare("UPDATE jobs SET status=?, payload='{}' WHERE id=?").run(status, id);
  }
  close() { this.db.close(); }
}
