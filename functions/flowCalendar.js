"use strict";

// One server-side secret; never put keys or real Kakao user IDs in source control.
function flowConfigForUser(raw, uid) {
  if (!raw) return null;
  let config;
  try { config = JSON.parse(raw); } catch (_) { throw new Error("Invalid Flow configuration"); }
  if (!uid || !Array.isArray(config.kakaoUserIds) || !config.kakaoUserIds.includes(uid)) return null;
  if (!config.apiKey || String(config.projectId) !== "747538") throw new Error("Invalid Flow destination");
  return config;
}

function scheduleBody(parsed) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "")) throw new Error("Invalid date");
  if (typeof parsed.title !== "string" || !parsed.title.trim() || parsed.title.length > 200) throw new Error("Invalid title");
  const time = parsed.all_day ? "00:00" : (parsed.start_time || "09:00");
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(time) || (parsed.end_time && !validTime(parsed.end_time))) throw new Error("Invalid time");
  // Use UTC as a wall-clock container; Flow expects Korean local YYYYMMDDHHmmss.
  const start = new Date(`${parsed.date}T${time}:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== parsed.date) throw new Error("Invalid date");
  let end;
  if (parsed.all_day) end = new Date(`${parsed.date}T23:59:59Z`);
  else if (parsed.end_time) {
    end = new Date(`${parsed.date}T${parsed.end_time}:00Z`);
    if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  } else end = new Date(start.getTime() + 3600000);
  const format = date => date.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const memo = [parsed.location && `장소: ${parsed.location}`, parsed.description].filter(Boolean).join("\n");
  if (memo.length > 4000) throw new Error("Memo too long");
  return {
    title: parsed.title.trim(), isAllDay: Boolean(parsed.all_day),
    startDateTime: format(start), endDateTime: format(end),
    ...(memo ? { memo } : {}),
  };
}

async function createFlowSchedule(parsed, config, fetchImpl = fetch) {
  const body = scheduleBody(parsed);
  let response;
  try {
    response = await fetchImpl(`https://api.flow.team/user/posts/projects/${encodeURIComponent(config.projectId)}/schedules`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-flow-api-key": config.apiKey },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
    });
  } catch (_) {
    throw Object.assign(new Error("Flow result unknown"), { code: "FLOW_UNKNOWN" });
  }
  if (!response.ok) throw Object.assign(new Error("Flow request failed"), { code: response.status >= 500 ? "FLOW_UNKNOWN" : "FLOW_REJECTED" });
  let data;
  try { data = await response.json(); } catch (_) {
    throw Object.assign(new Error("Flow result unknown"), { code: "FLOW_UNKNOWN" });
  }
  if (data.response?.success !== true) throw Object.assign(new Error("Flow result unknown"), { code: "FLOW_UNKNOWN" });
  return data.response.data;
}

module.exports = { flowConfigForUser, scheduleBody, createFlowSchedule };
