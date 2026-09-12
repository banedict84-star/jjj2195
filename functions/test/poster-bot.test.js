const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../posterBotCore');
const { sendCompletion } = require('../posterBot');

function database() {
  const docs = new Map();
  let tail = Promise.resolve();
  const snapshot = path => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) });
  const ref = path => ({ path, get: async () => snapshot(path), update: async value => {
    assert.ok(docs.has(path)); docs.set(path, { ...docs.get(path), ...structuredClone(value) });
  } });
  return { docs, collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction(fn) {
    const task = tail.then(async () => {
      const writes = [];
      const result = await fn({
        get: async r => { assert.equal(writes.length, 0, 'Firestore reads must precede writes'); return snapshot(r.path); },
        set: (r, value) => writes.push(() => docs.set(r.path, structuredClone(value))),
        update: (r, value) => writes.push(() => docs.set(r.path, { ...docs.get(r.path), ...structuredClone(value) })),
        delete: r => writes.push(() => docs.delete(r.path)),
        create: (r, value) => { assert.equal(docs.has(r.path), false); writes.push(() => docs.set(r.path, structuredClone(value))); },
      });
      writes.forEach(f => f()); return result;
    });
    tail = task.catch(() => {}); return task;
  } };
}
const NOW = 1800000000000;
const ID = '11111111-1111-4111-8111-111111111111';
const photo = n => `https://secure.kakaocdn.net/dna/photo${n}.jpg?signature=abc${n}`;
const payload = (text = '', photos = [], uid = 'staff-A') => ({
  bot: { id: 'bot-id' }, userRequest: { utterance: text, user: { id: uid } },
  action: { params: { secureimage: JSON.stringify({ privacyAgreement: 'Y', secureUrls: `List(${photos.join(', ')})` }) } },
});
function deps(db, extra = {}) { return { db, now: NOW, uuid: () => ID, ...extra }; }
async function queued(db) {
  await core.handleInput(payload('', [photo(1), photo(2), photo(3)]), deps(db));
  return core.handleInput(payload('9월 11일 / 모바일 의정지원서비스 준공보고회'), deps(db));
}

test('official secureUrls string supports multiple photos without a text utterance', () => {
  assert.deepEqual(core.extractPhotos(payload('', [photo(1), photo(2)])), [photo(1), photo(2)]);
});
test('detailParams duplicates are deduplicated; callback and bot URLs are never input photos', () => {
  const body = payload('', [photo(1)]);
  body.action.detailParams = { image: { value: body.action.params.secureimage } };
  body.userRequest.callbackUrl = photo(9); body.bot.url = photo(8);
  assert.deepEqual(core.extractPhotos(body), [photo(1)]);
});
test('declined photo agreement and arbitrary/private hosts are rejected', () => {
  const body = payload('', []);
  body.action.params.secureimage = JSON.stringify({ privacyAgreement: 'N', secureUrls: photo(1) });
  assert.deepEqual(core.extractPhotos(body), []);
  for (const url of ['http://169.254.169.254/metadata', 'https://kakaocdn.net.evil.test/a.png', 'https://evil-kakaocdn.net/a.png', 'file:///etc/passwd', 'https://user@secure.kakaocdn.net/a.jpg', 'https://secure.kakaocdn.net:8443/a.jpg']) {
    assert.equal(core.imageUrl(url), null);
  }
  assert.equal(core.imageUrl('http://secure.kakaocdn.net/a.jpg'), 'https://secure.kakaocdn.net/a.jpg');
});
test('photo first → more photos → brief creates one durable job', async () => {
  const db = database();
  const a = await core.handleInput(payload('', [photo(1)]), deps(db));
  assert.match(a.template.outputs[0].simpleText.text, /사진 1장/);
  await core.handleInput(payload('', [photo(2), photo(3)]), deps(db));
  await core.handleInput(payload('9월 11일 / 준공보고회'), deps(db));
  const job = db.docs.get(`posterBotJobs/${ID}`);
  assert.equal(job.status, 'queued'); assert.deepEqual(job.imageUrls, [photo(1), photo(2), photo(3)]);
  assert.equal(job.uid, 'staff-A'); assert.equal(job.brief, '9월 11일 / 준공보고회');
});
test('simultaneous duplicate briefs do not create two generation jobs', async () => {
  const db = database();
  await core.handleInput(payload('', [photo(1)]), deps(db));
  await Promise.all([1, 2].map(() => core.handleInput(payload('9월 11일 / 준공보고회'), deps(db))));
  assert.equal([...db.docs.keys()].filter(k => k.startsWith('posterBotJobs/')).length, 1);
});
test('eleventh photo is rejected without silently changing the selection', async () => {
  const db = database(); const photos = Array.from({ length: 10 }, (_, i) => photo(i));
  await core.handleInput(payload('', photos), deps(db));
  const reply = await core.handleInput(payload('', [photo(11)]), deps(db));
  assert.match(reply.template.outputs[0].simpleText.text, /10장 이하/);
  assert.equal(db.docs.get(`posterBotSessions/${core.sessionKey('staff-A')}`).imageUrls.length, 10);
});
test('expired photos require re-upload and never queue an empty poster', async () => {
  const db = database();
  await core.handleInput(payload('', [photo(1)]), deps(db));
  const reply = await core.handleInput(payload('9월 11일 / 준공보고회'), deps(db, { now: NOW + core.PHOTO_TTL_MS + 1 }));
  assert.match(reply.template.outputs[0].simpleText.text, /유효시간/);
  assert.equal(db.docs.has(`posterBotJobs/${ID}`), false);
});
test('calendar messages are passed through; standalone poster commands stay separate', async () => {
  const db = database();
  assert.equal(await core.handleInput(payload('내일 오후 3시 포스터 회의'), deps(db)), null);
  assert.equal(await core.handleInput(payload('오늘 일정은?'), deps(db)), null);
  await core.handleInput(payload('웹자보 요청'), deps(db));
  assert.equal(await core.handleInput(payload('오늘 일정은?'), deps(db, { now: NOW + 31 * 60 * 1000 })), null);
});
test('missing identity, cancel and pre-photo brief are handled without a paid job', async () => {
  const db = database();
  assert.match((await core.handleInput(payload('웹자보', [], ''), deps(db))).template.outputs[0].simpleText.text, /사용자 정보/);
  await core.handleInput(payload('웹자보 요청'), deps(db));
  await core.handleInput(payload('9월 11일 / 준공보고회'), deps(db));
  assert.equal(db.docs.has(`posterBotJobs/${ID}`), false);
  await core.handleInput(payload('취소'), deps(db));
  assert.equal(db.docs.size, 0);
});
test('result is retained across reads and an event cannot read a different user result', async () => {
  const db = database(); await queued(db);
  db.docs.get(`posterBotJobs/${ID}`).status = 'completed';
  db.docs.get(`posterBotJobs/${ID}`).result = { title: '준공보고회', imageUrl: 'https://example.test/result.png' };
  const event = payload(''); event.userRequest.params = { posterJobId: ID };
  assert.ok((await core.handleInput(event, deps(db))).template.outputs[0].simpleImage);
  assert.ok((await core.handleInput(payload('자보 결과 받기'), deps(db))).template.outputs[0].simpleImage);
  event.userRequest.user.id = 'staff-B';
  assert.equal((await core.handleInput(event, deps(db))).template.outputs[0].simpleImage, undefined);
  assert.ok(db.docs.has(`posterBotJobs/${ID}`));
});
test('duplicate worker events build and notify once', async () => {
  const db = database(); await queued(db); let builds = 0, notifications = 0;
  const ref = db.collection('posterBotJobs').doc(ID);
  const options = { db, now: () => NOW, build: async () => { builds++; return { title: '준공보고회', imageUrl: 'https://example.test/result.png' }; }, notify: async () => { notifications++; return 'submitted'; } };
  await Promise.all([core.runJob(ref, options), core.runJob(ref, options)]);
  assert.equal(builds, 1); assert.equal(notifications, 1);
  assert.equal(db.docs.get(ref.path).status, 'completed');
});
test('failed delivery retains completed poster and does not regenerate', async () => {
  const db = database(); await queued(db); const ref = db.collection('posterBotJobs').doc(ID);
  let builds = 0;
  const options = { db, now: () => NOW, build: async () => { builds++; return { title: '완성', imageUrl: 'https://example.test/p.png' }; }, notify: async () => { throw new Error('channel_not_added'); } };
  await core.runJob(ref, options); await core.runJob(ref, options);
  assert.equal(db.docs.get(ref.path).status, 'completed'); assert.equal(db.docs.get(ref.path).delivery, 'failed'); assert.equal(builds, 1);
});
test('generation failures are visible instead of an indefinite waiting response', async () => {
  const db = database(); await queued(db); const ref = db.collection('posterBotJobs').doc(ID);
  await core.runJob(ref, { db, now: () => NOW, build: async () => { throw new Error('API 429'); }, notify: async () => 'submitted' });
  const reply = await core.handleInput(payload('자보 결과 받기'), deps(db));
  assert.match(reply.template.outputs[0].simpleText.text, /문제가 생겼어요/);
  assert.equal(db.docs.get(ref.path).status, 'failed');
});
test('completion notification targets requesting botUserKey, not an operator memo', async () => {
  let request;
  const accepted = await sendCompletion({ uid: 'staff-A', id: ID }, async (...args) => {
    request = args; return { data: { status: 'SUCCESS', taskId: 'task-123' } };
  }, { botId: 'my-bot', eventName: 'poster_ready' }, 'fake-test-key');
  assert.equal(request[0], 'https://bot-api.kakao.com/v2/bots/my-bot/talk');
  assert.deepEqual(request[1].user, [{ type: 'botUserKey', id: 'staff-A' }]);
  assert.deepEqual(request[1].params, { posterJobId: ID });
  assert.deepEqual(accepted, { status: 'submitted', taskId: 'task-123' });
  await assert.rejects(sendCompletion({ uid: 'A', id: ID }, async () => ({ data: { status: 'FAIL' } }), { botId: 'bot', eventName: 'poster_ready' }, 'fake-test-key'), /rejected/);
});
test('webhook secret comparison fails closed', () => {
  assert.equal(core.validSecret('', ''), false);
  assert.equal(core.validSecret('correct', 'correct'), true);
  assert.equal(core.validSecret('different', 'correct'), false);
});
