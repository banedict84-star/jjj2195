const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scheduleBody, flowConfigForUser, createFlowSchedule } = require('../flowCalendar');
const event = { title: '회의', date: '2026-10-04', start_time: '23:30', all_day: false };
test('midnight rollover uses next date', () => {
  const body = scheduleBody(event);
  assert.equal(body.startDateTime, '20261004233000');
  assert.equal(body.endDateTime, '20261005003000');
});
test('all day stays on selected date', () => {
  const body = scheduleBody({ ...event, all_day: true });
  assert.equal(body.startDateTime, '20261004000000');
  assert.equal(body.endDateTime, '20261004235959');
});
test('invalid dates and times rejected', () => {
  assert.throws(() => scheduleBody({ ...event, date: '2026-02-30' }));
  assert.throws(() => scheduleBody({ ...event, start_time: '25:00' }));
});
test('only allowlisted users can route to council project', () => {
  const raw = JSON.stringify({ apiKey: 'test-key', projectId: '747538', kakaoUserIds: ['council'] });
  assert.equal(flowConfigForUser(raw, 'other'), null);
  assert.equal(flowConfigForUser(raw, ''), null);
  assert.equal(flowConfigForUser(raw, 'council').projectId, '747538');
});
test('personal API endpoint and success envelope', async () => {
  await createFlowSchedule(event, { projectId: '747538', apiKey: 'test-key' }, async (url, options) => {
    assert.equal(url, 'https://api.flow.team/user/posts/projects/747538/schedules');
    assert.equal(options.headers['x-flow-api-key'], 'test-key');
    assert.equal(JSON.parse(options.body).title, '회의');
    return { ok: true, json: async () => ({ response: { success: true, data: {} } }) };
  });
});
test('uncertain outcome never retries writes', async () => {
  let calls = 0;
  await assert.rejects(createFlowSchedule(event, { projectId: '747538' }, async () => { calls++; throw new Error('timeout'); }), { code: 'FLOW_UNKNOWN' });
  assert.equal(calls, 1);
});
