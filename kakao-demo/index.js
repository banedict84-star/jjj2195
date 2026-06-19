/**
 * Claude + KakaoTalk 자동화 데모
 *
 * 실행: node index.js "보낼 메시지"
 * 설치: npm install
 * 설정: .env.example → .env 복사 후 키 입력
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── 카카오톡 나에게 보내기 ─────────────────────────────────
async function sendKakaoMessage(text) {
  const token = process.env.KAKAO_ACCESS_TOKEN;
  if (!token) throw new Error('KAKAO_ACCESS_TOKEN이 없습니다 (.env 확인)');

  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: 'text',
        text: text,
        link: { web_url: 'https://jjj2195-1bd15.web.app' },
      }),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 오류: ${JSON.stringify(data)}`);
  return data;
}

// ─── Claude 도구 정의 ──────────────────────────────────────
const tools = [
  {
    name: 'send_kakao',
    description: '카카오톡 나에게 보내기로 메시지를 전송합니다. 최대 200자.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '전송할 메시지 내용',
        },
      },
      required: ['message'],
    },
  },
];

// ─── 메인 ─────────────────────────────────────────────────
async function main() {
  const userInput = process.argv[2] || '오늘 일정 정리해서 카카오톡으로 보내줘';

  console.log('\n📨 Claude에게 요청:', userInput);
  console.log('─'.repeat(50));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools,
    messages: [
      {
        role: 'user',
        content: userInput,
      },
    ],
  });

  // Claude가 도구를 호출했는지 확인
  for (const block of response.content) {
    if (block.type === 'text') {
      console.log('\n🤖 Claude:', block.text);
    }

    if (block.type === 'tool_use' && block.name === 'send_kakao') {
      const msg = block.input.message;
      console.log('\n📲 카카오톡 전송 중...');
      console.log('   내용:', msg);

      try {
        await sendKakaoMessage(msg);
        console.log('   ✅ 전송 완료!');
      } catch (err) {
        console.log('   ❌ 전송 실패:', err.message);
      }
    }
  }
}

main().catch(console.error);
