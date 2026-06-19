/**
 * MOIDA 일정 알림 자동화
 *
 * Firebase에서 내일 일정을 가져와 카카오톡으로 자동 발송
 * 실행: node schedule-notify.js
 * 크론 설정 예: 매일 오후 9시 → "0 21 * * * node /path/to/schedule-notify.js"
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── 카카오톡 전송 ─────────────────────────────────────────
async function sendKakao(text) {
  const token = process.env.KAKAO_ACCESS_TOKEN;
  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: 'text',
        text,
        link: { web_url: 'https://jjj2195-1bd15.web.app/moida-schedule' },
      }),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ─── 내일 일정 (실제로는 Firebase에서 읽어옴) ──────────────
function getTomorrowSchedule() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ymd = tomorrow.toISOString().slice(0, 10);

  // TODO: Firebase Firestore에서 실제 데이터 읽기
  // const snapshot = await db.collection('events').where('date', '==', ymd).get()
  // 지금은 샘플 데이터 반환
  return {
    date: ymd,
    events: [
      { time: '10:00', title: '수암 119센터 개청식', location: '안산시 상록구' },
      { time: '18:00', title: '안산학교 미팅', location: '안산시청' },
    ],
  };
}

// ─── Claude로 메시지 생성 ──────────────────────────────────
async function generateMessage(schedule) {
  const prompt = `
다음 내일 일정을 카카오톡 알림 메시지로 200자 이내로 요약해줘.
친근하고 간결하게, 이모지 적절히 사용.

날짜: ${schedule.date}
일정:
${schedule.events.map(e => `  - ${e.time} ${e.title} (${e.location})`).join('\n')}
  `.trim();

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return res.content[0].text;
}

// ─── 실행 ─────────────────────────────────────────────────
async function main() {
  console.log('📅 내일 일정 조회 중...');
  const schedule = getTomorrowSchedule();

  if (!schedule.events.length) {
    console.log('내일 일정 없음 — 발송 생략');
    return;
  }

  console.log(`📋 일정 ${schedule.events.length}건 발견`);

  console.log('🤖 Claude로 메시지 생성 중...');
  const message = await generateMessage(schedule);
  console.log('\n생성된 메시지:');
  console.log('─'.repeat(40));
  console.log(message);
  console.log('─'.repeat(40));

  console.log('\n📲 카카오톡 전송 중...');
  await sendKakao(message);
  console.log('✅ 전송 완료!');
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
