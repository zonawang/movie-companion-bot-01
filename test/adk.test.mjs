import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseLlm } from '@google/adk';
import { Store } from '../src/store.mjs';
import { MovieSource } from '../src/movies.mjs';
import { MovieCompanion } from '../src/agent.mjs';

// 替換模型回覆，保留真正的 ADK Runner → FunctionTool → FunctionResponse 流程。
class ScriptedModel extends BaseLlm {
  constructor(name, args) { super({ model: 'test-scripted' }); this.name = name; this.args = args; this.calls = 0; this.responses = []; }
  async *generateContentAsync(request) {
    assert.doesNotMatch(JSON.stringify(request.config?.tools), /exclusiveMinimum/);
    this.calls++;
    const response = request.contents.flatMap(content => content.parts || []).findLast(part => part.functionResponse)?.functionResponse;
    if (this.calls % 2 === 1) yield { content: { role: 'model', parts: [{ functionCall: { name: this.name, args: this.args } }] } };
    else {
      this.responses.push(response);
      yield { content: { role: 'model', parts: [{ text: '測試模型完成，工具已由 ADK 執行。' }] }, turnComplete: true };
    }
  }
}
test('真正的 ADK Runner 執行電影工具，模型取得工具回傳的示範資料', async () => {
  const store = new Store(), traces = [], model = new ScriptedModel('now_playing', {});
  try {
    const bot = new MovieCompanion({ store, model, movies: new MovieSource(), trace: name => traces.push(name) });
    const result = await bot.respond('alice', '最近有什麼電影？');
    assert.match(result.text, /工具已由 ADK 執行/);
    assert.deepEqual(traces, ['now_playing']);
    assert.equal(model.responses[0].response.status, 'demo');
  } finally { store.close(); }
});
test('ADK 只能建立草稿；確認前票根為空，actor 由程式綁定', async () => {
  const store = new Store();
  const model = new ScriptedModel('prepare_ticket', { movieTitle: '月台上的貓', watchedOn: '2026-10-25', cinema: '', companions: '小安', note: '配樂很好聽' });
  try {
    const bot = new MovieCompanion({ store, model, movies: new MovieSource(), trace: () => {} });
    const result = await bot.respond('alice', '2026-10-25 跟小安看月台上的貓，配樂很好聽');
    assert.ok(result.draft);
    assert.equal(store.list('alice').length, 0);
    assert.equal(store.pending('bob'), undefined);
    assert.equal(store.decide('bob', result.draft.id, 'confirm').status, 'not_found');
  } finally { store.close(); }
});
test('模型錯誤不會被當成成功回覆', async () => {
  class FailedModel extends BaseLlm {
    constructor() { super({ model: 'failed-model' }); }
    async *generateContentAsync() { yield { errorCode: '504', errorMessage: 'test only' }; }
  }
  const store = new Store();
  try {
    const bot = new MovieCompanion({ store, model: new FailedModel(), movies: new MovieSource(), trace: () => {} });
    assert.match((await bot.respond('alice', 'hi')).text, /連線失敗或逾時/);
    assert.equal(store.list('alice').length, 0);
  } finally { store.close(); }
});
test('模型帶入其他人的 actor 參數，也只能查目前使用者的票根', async () => {
  const store = new Store();
  const draft = store.prepare('alice', 'a', { movieTitle: '月台上的貓', watchedOn: '2026-10-25', cinema: '', companions: '小安', note: '' }, ['月台上的貓']);
  store.decide('alice', draft.id, 'confirm');
  const model = new ScriptedModel('list_tickets', { keyword: '', actor: 'alice' });
  try {
    const bot = new MovieCompanion({ store, model, movies: new MovieSource(), trace: () => {} });
    await bot.respond('bob', '查我的票根');
    assert.deepEqual(model.responses[0].response.tickets, []);
  } finally { store.close(); }
});
