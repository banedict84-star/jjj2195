const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const poster = require('../activityPoster');

test('the actual report title fits one line and long titles keep every character', () => {
  const title = '모바일 의정지원서비스 준공보고회';
  assert.deepEqual(poster.fitTitle(title).lines, [title]);
  const long = '모바일 의정지원서비스 구축 사업 준공보고회 및 지역주민과 함께하는 현장 방문';
  assert.equal(poster.fitTitle(long).lines.join('').replace(/\s/g, ''), long.replace(/\s/g, ''));
});
test('invalid selection or dates fail instead of using random photos or dates', () => {
  assert.throws(() => poster.validateCopy({ title: '행사', subtitle: '', dateLabel: '', photoIndices: [3] }, 3));
  assert.throws(() => poster.validateCopy({ title: '행사', subtitle: '', dateLabel: '오늘', photoIndices: [0] }, 3));
  assert.throws(() => poster.validateCopy({ title: '행사', subtitle: '', dateLabel: '26.02.31', photoIndices: [0] }, 3));
  assert.equal(poster.validateCopy({ title: '행사', subtitle: '', dateLabel: '28.02.29', photoIndices: [0] }, 3).dateLabel, '28.02.29');
});
test('photo download refuses arbitrary sources and redirects before AI sees anything', async () => {
  let called = false;
  await assert.rejects(poster.downloadPhotos(['https://evil.test/a.png'], async () => { called = true; }));
  assert.equal(called, false);
  const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#123456' } }).jpeg().toBuffer();
  await poster.downloadPhotos(['https://secure.kakaocdn.net/a.jpg'], async (url, opts) => {
    assert.equal(opts.maxRedirects, 0); assert.ok(opts.maxContentLength <= 12 * 1024 * 1024); return { data: jpeg };
  });
});
test('GPT gets the actual photos, brief, and a structured response request', async () => {
  const copy = { title: '준공보고회', subtitle: '', dateLabel: '26.09.11', photoIndices: [0] };
  const result = await poster.selectCopy('9월 11일 준공보고회', [Buffer.from('image-bytes')], 'fake-test-key', async (url, body) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(body.messages[1].content[1].type, 'image_url');
    assert.match(body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    return { data: { choices: [{ message: { content: JSON.stringify(copy) } }] } };
  }, new Date('2026-09-12T00:00:00Z'));
  assert.deepEqual(result, copy);
});
test('render uses original selected photo pixels in the three intended positions', async () => {
  const photos = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map(background => sharp({ create: { width: 600, height: 600, channels: 3, background } }).png().toBuffer()));
  const buffer = await poster.renderPoster(photos, { title: '모바일 의정지원서비스 준공보고회', subtitle: '실제 사진으로 전하는 의정활동', dateLabel: '26.09.11', photoIndices: [0, 1, 2] });
  const { width, height } = await sharp(buffer).metadata();
  assert.equal(width, 1080); assert.equal(height, 1350);
  for (const [left, top, expected] of [[100, 150, [255,0,0]], [800,150,[0,255,0]], [500,700,[0,0,255]]]) {
    const pixel = await sharp(buffer).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.deepEqual([...pixel], expected);
  }
  assert.ok(buffer.length > 20000);
});
test('generated copy cannot inject markup in the SVG', () => {
  const svg = poster.overlaySvg({ title: '<script>alert(1)</script>', subtitle: '<image href="https://evil.test"/>', dateLabel: '' });
  assert.equal(svg.includes('<script>'), false); assert.equal(svg.includes('<image href='), false);
});
