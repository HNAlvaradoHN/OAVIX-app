import webpush from 'web-push';

const MAX_REMINDERS = 200;
const MAX_DELIVERIES_PER_RUN = 25;

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin'
    }
  });
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifiedGoogleEmail(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('unauthorized');
  const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: authorization }
  });
  if (!response.ok) throw new Error('unauthorized');
  const payload = await response.json();
  if (!payload.user?.emailAddress) throw new Error('unauthorized');
  return String(payload.user.emailAddress).toLowerCase();
}

function normalizeReminder(record) {
  const sourceId = String(record?.id || '').slice(0, 180);
  const due = new Date(String(record?.dueAt || ''));
  if (!sourceId || Number.isNaN(due.getTime())) return null;
  return {
    sourceId,
    title: String(record.title || 'Mantenimiento programado').slice(0, 180),
    category: String(record.category || '').slice(0, 120),
    dueAt: due.toISOString()
  };
}

async function syncState(request, env, origin) {
  try {
    const body = await request.json();
    const subscription = body.subscription;
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return json({ error: 'invalid-subscription' }, 400, origin);
    }
    const accountHash = await sha256(await verifiedGoogleEmail(request));
    const subscriptionId = await sha256(subscription.endpoint);
    const now = new Date().toISOString();
    const desired = [];
    for (const item of (Array.isArray(body.reminders) ? body.reminders : []).slice(0, MAX_REMINDERS)) {
      const reminder = normalizeReminder(item);
      if (reminder) desired.push({ ...reminder, id: await sha256(`${accountHash}:${reminder.sourceId}`) });
    }

    const statements = [env.DB.prepare(
      `INSERT INTO subscriptions (id, account_hash, subscription, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET account_hash=?2, subscription=?3, updated_at=?4`
    ).bind(subscriptionId, accountHash, JSON.stringify(subscription), now)];
    const desiredIds = new Set(desired.map(item => item.id));
    const current = await env.DB.prepare('SELECT id FROM reminders WHERE account_hash=?1').bind(accountHash).all();
    for (const row of current.results) {
      if (!desiredIds.has(row.id)) statements.push(env.DB.prepare('DELETE FROM reminders WHERE id=?1').bind(row.id));
    }
    for (const item of desired) {
      statements.push(env.DB.prepare(
        `INSERT INTO reminders (id, account_hash, source_id, title, category, due_at, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)
         ON CONFLICT(id) DO UPDATE SET title=?4, category=?5, due_at=?6,
         status=CASE WHEN reminders.status='sent' AND reminders.due_at=?6 THEN 'sent' ELSE 'pending' END, updated_at=?7`
      ).bind(item.id, accountHash, item.sourceId, item.title, item.category, item.dueAt, now));
    }
    await env.DB.batch(statements);
    return json({ status: 'synced', reminders: desired.length }, 200, origin);
  } catch (error) {
    const unauthorized = error.message === 'unauthorized';
    console.error('[OAVIX push sync]', error);
    return json({ error: unauthorized ? 'unauthorized' : 'push-sync-failed' }, unauthorized ? 401 : 500, origin);
  }
}

async function deliver(env) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const due = await env.DB.prepare(
    `SELECT * FROM reminders WHERE status='pending' AND due_at<=?1 ORDER BY due_at LIMIT ?2`
  ).bind(new Date().toISOString(), MAX_DELIVERIES_PER_RUN).all();
  for (const reminder of due.results) {
    const subscriptions = await env.DB.prepare(
      'SELECT id, subscription FROM subscriptions WHERE account_hash=?1 LIMIT 5'
    ).bind(reminder.account_hash).all();
    let delivered = false;
    for (const row of subscriptions.results) {
      try {
        await webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify({
          title: `OAVIX: ${reminder.title}`,
          body: `Mantenimiento programado${reminder.category ? ` · ${reminder.category}` : ''}`,
          tag: `oavix-${reminder.source_id}`,
          url: './?tab=alerts'
        }), { TTL: 86400 });
        delivered = true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await env.DB.prepare('DELETE FROM subscriptions WHERE id=?1').bind(row.id).run();
        } else console.error('[OAVIX push delivery]', error);
      }
    }
    if (delivered) {
      await env.DB.prepare("UPDATE reminders SET status='sent', sent_at=?2 WHERE id=?1")
        .bind(reminder.id, new Date().toISOString()).run();
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin-not-allowed' }, 403, 'null');
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin'
      }
    });
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, origin);
    return syncState(request, env, origin);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(deliver(env));
  }
};
