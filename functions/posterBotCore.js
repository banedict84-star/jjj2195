// Pure rules shared by the Kakao webhook, worker and offline tests.
const crypto = require("node:crypto");

const MAX_PHOTOS = 10;
const PHOTO_TTL_MS = 8 * 60 * 1000; // Kakao secure URLs last at most 10 minutes.
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const DRAFT_TTL_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function imageUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    // Never download arbitrary URLs from utterances, callback URLs or bot metadata.
    if (!/(^|\.)(kakaocdn\.net|daumcdn\.net)$/.test(u.hostname)) return null;
    u.protocol = 'https:';
    u.hash = '';
    return u.href;
  } catch (_) { return null; }
}

function extractPhotos(body) {
  const urls = new Set();
  function visit(v, depth = 0) {
    if (depth > 7 || v == null) return;
    if (typeof v === 'string') {
      if (v.length > 40000) return;
      try { if (/^\s*[\[{]/.test(v)) return visit(JSON.parse(v), depth + 1); } catch (_) {}
      for (const s of v.match(/https?:\/\/[^\s"'\\),\]]+/g) || []) {
        const url = imageUrl(s);
        if (url) urls.add(url);
      }
    } else if (Array.isArray(v)) {
      v.slice(0, 40).forEach(x => visit(x, depth + 1));
    } else if (typeof v === 'object') {
      if ('privacyAgreement' in v && v.privacyAgreement !== 'Y') return;
      if ('secureUrls' in v) return visit(v.secureUrls, depth + 1);
      // Recognized image fields only; no recursive scan of the entire payload.
      for (const key of ['value', 'url', 'imageUrl', 'image_url', 'images', 'attachments']) {
        if (key in v) visit(v[key], depth + 1);
      }
    }
  }
  Object.values(body?.action?.params || {}).forEach(v => visit(v));
  Object.values(body?.action?.detailParams || {}).forEach(v => visit(v));
  visit(body?.userRequest?.params?.attachments);
  visit(body?.userRequest?.params?.images);
  visit(body?.userRequest?.utterance);
  return [...urls];
}

const isStart = text => /^(?:웹\s*자보|행사\s*자보|자보|포스터|홍보\s*(?:이미지|자보|물))\s*(?:요청|만들기|만들어\s*(?:줘|주세요)?)?[.!?\s]*$/.test(text);
const isResult = text => /자보\s*(결과|받기|확인|나왔|완성|보기)|결과\s*받기/.test(text);
const isCancel = text => /^(취소|그만|메뉴|처음|중단|닫기)$/.test(text);

function textReply(text, buttons = []) {
  return { version: '2.0', template: {
    outputs: [{ simpleText: { text } }], quickReplies: buttons,
  } };
}
const resultButton = { label: '웹자보 결과 보기', action: 'message', messageText: '자보 결과 받기' };
const againButton = { label: '웹자보 만들기', action: 'message', messageText: '웹자보 요청' };
const cancelButton = { label: '취소', action: 'message', messageText: '취소' };

function photoReply(count, photoBlockId) {
  const buttons = [];
  if (photoBlockId) buttons.push({ label: count ? '사진 더 올리기' : '사진 올리기', action: 'block', blockId: photoBlockId });
  buttons.push(cancelButton);
  return textReply(count
    ? `사진 ${count}장을 받았어요.\n더 올릴 사진이 있으면 이어서 보내주세요. (최대 ${MAX_PHOTOS}장)\n\n모두 보냈다면 활동명과 날짜를 한 줄로 적어주세요.\n예) 9월 11일 / 모바일 의정지원서비스 준공보고회`
    : '활동 사진을 올려주세요.\n최대 10장을 받아 웹자보에 어울리는 사진을 골라드려요.', buttons);
}

function resultReply(job) {
  if (!job) return textReply('아직 요청한 웹자보가 없어요.', [againButton]);
  if (job.status === 'completed' && job.result) return {
    version: '2.0', template: {
      outputs: [
        { simpleImage: { imageUrl: job.result.imageUrl, altText: String(job.result.title).slice(0, 50) } },
        { simpleText: { text: '웹자보가 완성됐어요. 이미지를 열어 저장해 주세요.' } },
      ], quickReplies: [againButton],
    },
  };
  if (['failed', 'cancelled'].includes(job.status)) return textReply(
    job.errorMessage || '웹자보를 완성하지 못했어요. 사진을 다시 올려 요청해 주세요.', [againButton]);
  return textReply('웹자보를 만들고 있어요. 완성되면 이 채팅방으로 보내드릴게요.', [resultButton]);
}

function sessionKey(uid) { return crypto.createHash('sha256').update(uid).digest('hex'); }
function validSecret(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(String(actual)), b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// All reads occur before writes. Firestore retries serialize simultaneous inputs.
async function handleInput(body, { db, now = Date.now(), config = {}, uuid = crypto.randomUUID }) {
  const uid = String(body?.userRequest?.user?.id || '');
  const text = String(body?.userRequest?.utterance || '').trim();
  const photos = extractPhotos(body);
  const eventJobId = body?.userRequest?.params?.posterJobId;
  if (!uid || uid.length > 256) return textReply('사용자 정보를 확인할 수 없어요. 모이다 채널에서 다시 요청해 주세요.');
  const sessionRef = db.collection('posterBotSessions').doc(sessionKey(uid));
  return db.runTransaction(async tx => {
    const snap = await tx.get(sessionRef);
    let session = snap.exists ? snap.data() : null;
    // An abandoned draft must not consume tomorrow's calendar commands.
    if (session?.draftId && now - session.updatedAt > DRAFT_TTL_MS) session = null;
    const jobId = eventJobId || session?.jobId;
    let job = null;
    if (jobId && UUID.test(String(jobId))) {
      const jobSnap = await tx.get(db.collection('posterBotJobs').doc(jobId));
      if (jobSnap.exists && jobSnap.data().uid === uid) job = jobSnap.data();
    }
    if (eventJobId || isResult(text)) return resultReply(job);
    const busy = job && ['queued', 'processing'].includes(job.status);
    if (isCancel(text) && session) {
      if (busy) return resultReply(job);
      tx.delete(sessionRef);
      return textReply('웹자보 요청을 취소했어요.', [againButton]);
    }
    if (!photos.length && !isStart(text) && !session?.draftId) return null;
    if (busy) return resultReply(job);
    if (photos.length > MAX_PHOTOS) return textReply('사진은 최대 10장까지 올려주세요.', [cancelButton]);
    if (isStart(text) && !photos.length) {
      tx.set(sessionRef, { draftId: uuid(), imageUrls: [], createdAt: now, updatedAt: now });
      return photoReply(0, config.photoBlockId);
    }
    if (session?.photoReceivedAt && now - session.photoReceivedAt > PHOTO_TTL_MS) {
      session = null;
      if (!photos.length) {
        tx.set(sessionRef, { draftId: uuid(), imageUrls: [], createdAt: now, updatedAt: now });
        return textReply('사진 링크의 유효시간이 지나 사진을 다시 받아야 해요. 사진을 다시 올려주세요.', photoReply(0, config.photoBlockId).template.quickReplies);
      }
    }
    if (photos.length) {
      const existing = session?.draftId ? session.imageUrls || [] : [];
      const all = [...new Set([...existing, ...photos])];
      if (all.length > MAX_PHOTOS) return textReply(`이미 ${existing.length}장을 받았어요. 전체 사진이 10장 이하가 되도록 보내주세요.`, [cancelButton]);
      tx.set(sessionRef, {
        draftId: session?.draftId || uuid(), imageUrls: all,
        photoReceivedAt: session?.draftId && session.photoReceivedAt || now,
        createdAt: session?.createdAt || now, updatedAt: now,
      });
      return photoReply(all.length, config.photoBlockId);
    }
    if (!session?.imageUrls?.length) return photoReply(0, config.photoBlockId);
    if (text.length < 3 || text.length > 2000) return textReply('활동명과 날짜를 3~2,000자 이내로 적어주세요.', [cancelButton]);
    const newJob = {
      uid, id: session.draftId, status: 'queued', brief: text,
      imageUrls: session.imageUrls, photoReceivedAt: session.photoReceivedAt,
      createdAt: now, updatedAt: now,
    };
    tx.create(db.collection('posterBotJobs').doc(newJob.id), newJob);
    tx.set(sessionRef, { jobId: newJob.id, updatedAt: now });
    return resultReply(newJob);
  });
}

// Claimed once: duplicate Firestore deliveries never trigger another paid generation.
async function runJob(ref, { db, build, notify, now = Date.now, onError = () => {} }) {
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== 'queued') return null;
    tx.update(ref, { status: 'processing', startedAt: now(), updatedAt: now() });
    return snap.data();
  });
  if (!job) return;
  let result;
  try {
    if (now() - job.photoReceivedAt > PHOTO_TTL_MS) throw Object.assign(new Error('photo_expired'), { publicMessage: '사진 링크가 만료됐어요. 사진을 다시 올려 요청해 주세요.' });
    result = await build(job);
    await ref.update({ status: 'completed', result, updatedAt: now(), delivery: 'pending' });
  } catch (error) {
    onError(error);
    await ref.update({ status: 'failed', updatedAt: now(), errorMessage: error.publicMessage || '제작 중 문제가 생겼어요. 사진과 활동 내용을 확인한 뒤 다시 요청해 주세요.' });
  }
  // Delivery failure must not change a completed generation into a failed job.
  try {
    const delivery = await notify(job);
    await ref.update({ delivery: delivery || 'submitted', deliveryUpdatedAt: now() });
  } catch (error) {
    onError(error);
    await ref.update({ delivery: 'failed', deliveryUpdatedAt: now() });
  }
}

module.exports = { MAX_PHOTOS, PHOTO_TTL_MS, JOB_TIMEOUT_MS, UUID, imageUrl, extractPhotos,
  isStart, isResult, isCancel, textReply, resultReply, photoReply, sessionKey, validSecret,
  handleInput, runJob };
