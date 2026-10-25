import { createServer } from 'node:http';
import { parseEvents, verifySignature, lineMessages, decisionReply } from './line.mjs';
import { aboutReply } from './attribution.mjs';

export function createWebhookServer({ secret, store, bot, reply, log = console.error }) {
  let running = false;
  let stopping = false;
  const drain = async () => {
    if (running || stopping) return;
    running = true;
    try {
      let job;
      while (!stopping && (job = store.nextJob())) {
        try {
          // 失效的 reply token 不重送，也不在重新啟動後執行舊 AI 任務。
          if (Date.now() - job.created > 50_000) { store.finishJob(job.id, 'expired'); continue; }
          const event = job.event, actor = event.source.userId;
          let result;
          if (event.type === 'follow') result = { text: '我是你的電影夥伴！可以問「最近有什麼電影？」、查簡介或評論，也能記下片名、日期、同伴與心得。票根會先讓你確認再儲存。輸入「關於」可查看資料來源。' };
          else if (event.type === 'postback') result = decisionReply(store, actor, event.postback.data);
          else if (['關於', '資料來源', 'about'].includes(event.message.text.trim().toLowerCase())) result = aboutReply();
          else result = await bot.respond(actor, event.message.text, job.id);
          await reply(event.replyToken, lineMessages(result));
          store.finishJob(job.id);
        } catch {
          store.finishJob(job.id, 'failed');
          log('[LINE] 回覆失敗；請檢查設定、網路與 reply token 時效。事件不會自動重新執行。');
        }
      }
    } finally { running = false; }
  };
  const server = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', app: 'movie-companion-bot' });
    if (req.method !== 'POST' || req.url !== '/webhook') return send(404, { error: 'not_found' });
    const chunks = []; let length = 0;
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1_048_576) { send(413, { error: 'body_too_large' }); return; }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      if (!verifySignature(raw, req.headers['x-line-signature'], secret)) return send(401, { error: 'invalid_signature' });
      let events;
      try { events = parseEvents(JSON.parse(raw.toString('utf8'))); }
      catch { return send(400, { error: 'invalid_payload' }); }
      for (const event of events) store.enqueue(event);
      send(200, { ok: true });
      // 先落盤並回 200，再呼叫 ADK / LINE；空事件可供 LINE Verify 使用。
      setImmediate(() => { void drain().catch(() => log('[worker] 工作佇列處理失敗')); });
    } catch { if (!res.headersSent) send(500, { error: 'internal_error' }); }
  });
  server.requestTimeout = 10_000;
  const timer = setInterval(() => { void drain().catch(() => log('[worker] 工作佇列處理失敗')); }, 1000);
  timer.unref();
  server.on('close', () => { stopping = true; clearInterval(timer); });
  return server;
}
