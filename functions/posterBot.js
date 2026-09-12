const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('node:crypto');
const core = require('./posterBotCore');
const { buildActivityPoster } = require('./activityPoster');

if (!admin.apps.length) admin.initializeApp();
const OPENAI_KEY = defineSecret('OPENAI_API_KEY');
const KAKAO_KEY = defineSecret('KAKAO_REST_API_KEY');
const SKILL_SECRET = defineSecret('KAKAO_SKILL_SECRET');
const REGION = 'asia-northeast3';
const PROJECT = 'jjj2195-1bd15';
const FUNCTION_BASE = `https://${REGION}-${PROJECT}.cloudfunctions.net`;

function config() {
  return {
    botId: process.env.KAKAO_BOT_ID || '',
    eventName: process.env.KAKAO_POSTER_EVENT_NAME || 'poster_ready',
    photoBlockId: process.env.KAKAO_PHOTO_BLOCK_ID || '',
    bucket: process.env.POSTER_STORAGE_BUCKET || 'jjj2195-1bd15-moida',
  };
}

async function routePoster(req) {
  const body = req.body || {};
  const c = config();
  const isExplicit = core.isStart(String(body.userRequest?.utterance || '')) ||
    core.isResult(String(body.userRequest?.utterance || '')) ||
    core.extractPhotos(body).length || body.userRequest?.params?.posterJobId;
  let expected = '';
  try { expected = SKILL_SECRET.value(); } catch (_) {}
  // Put this server-side secret in the Kakao skill URL's key parameter (or header).
  // It never appears in bot messages, logs, image URLs or the repository.
  const actual = req.get('x-moida-skill-key') || req.query?.key;
  if (!c.botId || !core.validSecret(actual, expected) || body.bot?.id !== c.botId.replace(/!$/, '')) {
    return isExplicit ? core.textReply('웹자보 연결 설정이 필요해요. 관리자에게 알려주세요.') : null;
  }
  return core.handleInput(body, { db: admin.firestore(), config: c });
}

async function sendCompletion(job, post = axios.post, c = config(), apiKey = KAKAO_KEY.value()) {
  if (!c.botId || !apiKey) throw new Error('kakao_event_not_configured');
  const response = await post(`https://bot-api.kakao.com/v2/bots/${encodeURIComponent(c.botId)}/talk`, {
    event: { name: c.eventName },
    user: [{ type: 'botUserKey', id: job.uid }],
    // The event block calls kakaoSkill, which reads this user's stored result.
    // Do not trust a client-provided result image URL or message.
    params: { posterJobId: job.id },
  }, { timeout: 10000, headers: { Authorization: `KakaoAK ${apiKey}`, 'Content-Type': 'application/json' } });
  if (response.data?.status !== 'SUCCESS' || !response.data?.taskId) throw new Error('kakao_event_rejected');
  // SUCCESS is acceptance, not confirmed delivery. Store the taskId for inspection.
  return { status: 'submitted', taskId: response.data.taskId };
}

exports.processPosterJob = onDocumentCreated({
  document: 'posterBotJobs/{jobId}', region: REGION,
  timeoutSeconds: 240, memory: '1GiB', maxInstances: 2, concurrency: 1, retry: false,
  secrets: [OPENAI_KEY, KAKAO_KEY],
}, async event => {
  if (!event.data) return;
  const db = admin.firestore();
  await core.runJob(event.data.ref, {
    db,
    build: async job => {
      const { buffer, copy } = await buildActivityPoster(job, OPENAI_KEY.value());
      const storagePath = `poster-bot/results/${job.id}.png`;
      await admin.storage().bucket(config().bucket).file(storagePath).save(buffer, {
        resumable: false, metadata: { contentType: 'image/png', cacheControl: 'private, max-age=3600' },
      });
      const accessToken = crypto.randomBytes(24).toString('hex');
      return {
        title: copy.title, copy, storagePath, accessToken,
        imageUrl: `${FUNCTION_BASE}/posterBotImage?id=${job.id}&token=${accessToken}`,
      };
    },
    notify: job => sendCompletion(job),
    // Avoid logging raw request bodies, photos, user IDs or provider error headers.
    onError: error => console.error('poster_bot_job_error', error.code || 'operation_failed'),
  });
});

exports.posterBotImage = onRequest({ region: REGION, memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method not allowed');
  const id = String(req.query.id || '');
  const token = String(req.query.token || '');
  if (!core.UUID.test(id) || !/^[0-9a-f]{48}$/.test(token)) return res.status(404).send('Not found');
  try {
    const snap = await admin.firestore().collection('posterBotJobs').doc(id).get();
    const job = snap.exists ? snap.data() : null;
    if (job?.status !== 'completed' || !core.validSecret(token, job.result?.accessToken)) return res.status(404).send('Not found');
    const [buffer] = await admin.storage().bucket(config().bucket).file(`poster-bot/results/${id}.png`).download();
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    return res.send(buffer);
  } catch (_) { return res.status(404).send('Not found'); }
});

// A process crash/timeout is visible to the user, never "still generating" forever.
// Do not automatically repeat a possibly already billed generation.
exports.expirePosterJobs = onSchedule({ schedule: 'every 5 minutes', region: REGION, timeoutSeconds: 60 }, async () => {
  const db = admin.firestore();
  const pending = await db.collection('posterBotJobs').where('status', 'in', ['queued', 'processing']).limit(100).get();
  const now = Date.now();
  for (const doc of pending.docs) {
    await db.runTransaction(async tx => {
      const snap = await tx.get(doc.ref);
      const job = snap.data();
      if (job && ['queued', 'processing'].includes(job.status) && now - job.updatedAt > core.JOB_TIMEOUT_MS) {
        tx.update(doc.ref, { status: 'failed', updatedAt: now, errorMessage: '제작 시간이 길어져 작업이 중단됐어요. 사진을 다시 올려 요청해 주세요.' });
      }
    });
  }
});

exports.routePoster = routePoster;
exports.skillSecret = SKILL_SECRET;
exports.sendCompletion = sendCompletion;
