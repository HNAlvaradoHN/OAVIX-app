const { createHash } = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { DateTime } = require('luxon');
const webpush = require('web-push');

initializeApp();
const db = getFirestore();
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');
const vapidPublicKey = defineString('VAPID_PUBLIC_KEY');
const vapidSubject = defineString('VAPID_SUBJECT', { default: 'mailto:admin@example.com' });
const allowedOrigin = defineString('OAVIX_ALLOWED_ORIGIN', { default: 'https://hnalvaradohn.github.io' });

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function cors(req, res) {
  const origin = req.get('origin') || '';
  if (origin === allowedOrigin.value()) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function verifiedGoogleEmail(req) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('missing-token');
  const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: authorization }
  });
  if (!response.ok) throw new Error('invalid-token');
  const payload = await response.json();
  const email = payload.user && payload.user.emailAddress;
  if (!email) throw new Error('missing-email');
  return String(email).toLowerCase();
}

function normalizeReminder(record, zone) {
  const id = String(record && record.id || '').slice(0, 180);
  const date = String(record && record.alertDate || '');
  const time = String(record && record.alertTime || '09:00');
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const due = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!due.isValid) return null;
  return {
    sourceId: id,
    title: String(record.title || 'Mantenimiento programado').slice(0, 180),
    category: String(record.category || '').slice(0, 120),
    dueAt: Timestamp.fromDate(due.toUTC().toJSDate()),
    timeZone: zone,
    status: 'pending'
  };
}

exports.syncPushState = onRequest({ cors: false, region: 'us-central1' }, async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const email = await verifiedGoogleEmail(req);
    const accountHash = hash(email);
    const subscription = req.body && req.body.subscription;
    const endpoint = subscription && subscription.endpoint;
    if (!endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ error: 'invalid-subscription' });
    }
    const zone = DateTime.local().setZone(String(req.body.timeZone || 'America/Tegucigalpa')).isValid
      ? String(req.body.timeZone || 'America/Tegucigalpa') : 'America/Tegucigalpa';
    const subscriptionId = hash(endpoint);
    await db.collection('pushSubscriptions').doc(subscriptionId).set({
      accountHash, subscription, updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    const desired = new Map((Array.isArray(req.body.reminders) ? req.body.reminders.slice(0, 200) : [])
      .map(record => normalizeReminder(record, zone)).filter(Boolean)
      .map(record => [hash(`${accountHash}:${record.sourceId}`), record]));
    const existing = await db.collection('pushReminders').where('accountHash', '==', accountHash).get();
    const existingById = new Map(existing.docs.map(doc => [doc.id, doc.data()]));
    const batch = db.batch();
    existing.docs.forEach(doc => { if (!desired.has(doc.id)) batch.delete(doc.ref); });
    desired.forEach((record, id) => {
      const previous = existingById.get(id);
      const alreadySent = previous && previous.status === 'sent' && previous.dueAt &&
        previous.dueAt.toMillis() === record.dueAt.toMillis();
      batch.set(db.collection('pushReminders').doc(id), {
        ...record,
        status: alreadySent ? 'sent' : 'pending',
        accountHash,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
    return res.json({ status: 'synced', reminders: desired.size });
  } catch (error) {
    console.error('[OAVIX push sync]', error);
    return res.status(error.message === 'missing-token' || error.message === 'invalid-token' ? 401 : 500)
      .json({ error: 'push-sync-failed' });
  }
});

exports.deliverDueReminders = onSchedule({
  schedule: 'every 1 minutes', region: 'us-central1', secrets: [vapidPrivateKey]
}, async () => {
  webpush.setVapidDetails(vapidSubject.value(), vapidPublicKey.value(), vapidPrivateKey.value());
  const due = await db.collection('pushReminders')
    .where('status', '==', 'pending').where('dueAt', '<=', Timestamp.now()).limit(100).get();
  for (const reminder of due.docs) {
    const data = reminder.data();
    const subscriptions = await db.collection('pushSubscriptions').where('accountHash', '==', data.accountHash).get();
    let delivered = 0;
    for (const subscription of subscriptions.docs) {
      try {
        await webpush.sendNotification(subscription.data().subscription, JSON.stringify({
          title: `OAVIX: ${data.title}`,
          body: `Mantenimiento programado${data.category ? ` · ${data.category}` : ''}`,
          tag: `oavix-${data.sourceId}`,
          url: './?tab=alerts'
        }));
        delivered += 1;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) await subscription.ref.delete();
        else console.error('[OAVIX push delivery]', error);
      }
    }
    await reminder.ref.set({
      status: delivered ? 'sent' : 'pending',
      delivered,
      lastAttemptAt: FieldValue.serverTimestamp(),
      ...(delivered ? { sentAt: FieldValue.serverTimestamp() } : {})
    }, { merge: true });
  }
});
