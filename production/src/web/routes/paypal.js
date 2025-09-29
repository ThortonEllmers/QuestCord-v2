
const express = require('express');
const router = express.Router();
// Safe fetch helper for Node: use global fetch when available
async function fetchSafe(...args){
  if (typeof globalThis.fetch === 'function') return globalThis.fetchSafe(...args);
  const mod = await import('node-fetch');
  return mod.default(...args);
}

const cfg = require('../../utils/config');
const { db } = require('../../utils/store_sqlite');

try{
  db.exec(`CREATE TABLE IF NOT EXISTS paypal_orders(
    orderId TEXT PRIMARY KEY,
    guildId TEXT,
    tokens INTEGER,
    createdAt INTEGER
  );`);
}catch(e){ console.warn('[paypal] table create failed', e?.message); }

function apiBase(){
  const env = (cfg?.billing?.paypal?.environment || 'sandbox').toLowerCase();
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken(){
  const id = cfg?.billing?.paypal?.clientId;
  const secret = cfg?.billing?.paypal?.clientSecret;
  if (!id || !secret) throw new Error('paypal_not_configured');
  const res = await fetchSafe(apiBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error('paypal_oauth_failed');
  const data = await res.json();
  return data.access_token;
}

function priceFromConfig(priceId){
  const p = cfg?.billing?.paypal?.prices?.[priceId];
  if (!p) return null;
  const tokens = parseInt(p.tokens, 10) || 0;
  const amount = String(p.amount || '0.00');
  const currency = p.currency || 'USD';
  const name = p.name || 'Server Tokens';
  return { tokens, amount, currency, name };
}

async function createOrderInternal({ guildId, priceId }){
  const def = priceFromConfig(priceId);
  if (!def) throw new Error('unknown_price');
  if (!guildId) throw new Error('missing_guildId');
  const exists = db.prepare('SELECT 1 FROM servers WHERE guildId=?').get(guildId);
  if (!exists) throw new Error('unknown_server');
  const access = await getAccessToken();
  const res = await fetchSafe(apiBase() + '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: priceId,
        custom_id: guildId,
        amount: { currency_code: def.currency, value: def.amount, breakdown: { item_total: { currency_code: def.currency, value: def.amount } } },
        items: [{
          name: def.name,
          sku: priceId,
          quantity: '1',
          unit_amount: { currency_code: def.currency, value: def.amount }
        }]
      }],
      application_context: {
        brand_name: 'Server Tokens',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW'
      }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('create_failed: ' + t);
  }
  const order = await res.json();
  try{
    db.prepare('INSERT OR IGNORE INTO paypal_orders(orderId, guildId, tokens, createdAt) VALUES (?,?,?,?)')
      .run(order.id, guildId, def.tokens, Date.now());
  }catch{}
  const approve = (order.links || []).find(l=>l.rel === 'approve')?.href;
  return { id: order.id, approveUrl: approve };
}

router.get('/store/paypal/checkout', async (req, res) => {
  try{
    const guildId = (req.query.guildId || '').toString();
    const priceId = (req.query.priceId || '').toString();
    const order = await createOrderInternal({ guildId, priceId });
    return res.redirect(302, order.approveUrl);
  }catch(e){
    return res.status(400).send('Error: ' + e.message);
  }
});

router.post('/api/paypal/create', express.json(), async (req, res) => {
  try{
    const guildId = (req.body.guildId || '').toString();
    const priceId = (req.body.priceId || '').toString();
    const order = await createOrderInternal({ guildId, priceId });
    return res.json({ ok:true, id: order.id, approveUrl: order.approveUrl });
  }catch(e){
    return res.status(400).json({ ok:false, error: e.message });
  }
});

router.post('/api/paypal/capture', express.json(), async (req, res) => {
  try{
    const orderId = (req.body.orderId || '').toString();
    if (!orderId) return res.status(400).json({ ok:false, error: 'missing_orderId' });
    const access = await getAccessToken();
    const cap = await fetchSafe(apiBase() + `/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access }
    });
    const data = await cap.json();
    return res.json({ ok:true, data });
  }catch(e){
    return res.status(400).json({ ok:false, error: e.message });
  }
});

function mount(app){
  // Webhook requires raw body
  app.post('/api/paypal/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try{
      const headers = req.headers || {};
      const bodyStr = req.body.toString('utf8');
      const webhookId = cfg?.billing?.paypal?.webhookId;
      if (!webhookId) return res.status(400).json({ ok:false, error: 'missing_webhookId' });
      const access = await getAccessToken();
      const verifyRes = await fetchSafe(apiBase() + '/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access },
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: JSON.parse(bodyStr)
        })
      });
      const verifyJson = await verifyRes.json();
      if (verifyJson?.verification_status !== 'SUCCESS'){
        return res.status(400).json({ ok:false, error: 'invalid_signature' });
      }

      const evt = JSON.parse(bodyStr);
      const type = evt?.event_type || '';
      const resource = evt?.resource || {};
      const orderId = resource?.supplementary_data?.related_ids?.order_id || resource?.id || resource?.order_id || '';

      const row = orderId ? db.prepare('SELECT * FROM paypal_orders WHERE orderId=?').get(orderId) : null;

      if (type === 'PAYMENT.CAPTURE.COMPLETED'){
        if (!row) return res.json({ ok:false, error: 'missing_order_mapping' });
        db.prepare('INSERT OR IGNORE INTO servers(guildId) VALUES (?)').run(row.guildId);
        db.prepare('UPDATE servers SET tokens = COALESCE(tokens,0) + ? WHERE guildId=?').run(row.tokens, row.guildId);
        const after = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(row.guildId)?.tokens ?? 0;
        return res.json({ ok:true, guildId: row.guildId, credited: row.tokens, tokens: after });
      }

      if (type === 'PAYMENT.CAPTURE.REFUNDED'){
        if (!row) return res.json({ ok:false, error: 'missing_order_mapping' });
        db.prepare('UPDATE servers SET tokens = MAX(0, COALESCE(tokens,0) - ?) WHERE guildId=?').run(row.tokens, row.guildId);
        if (cfg?.billing?.autoBanOnRefund !== false){
          db.prepare('UPDATE servers SET isBanned=1, banReason=?, bannedAt=? WHERE guildId=?').run('paypal_refund', Date.now(), row.guildId);
        }
        const after = db.prepare('SELECT tokens FROM servers WHERE guildId=?').get(row.guildId)?.tokens ?? 0;
        return res.json({ ok:true, guildId: row.guildId, removed: row.tokens, tokens: after, banned: cfg?.billing?.autoBanOnRefund !== false });
      }

      if (type === 'CUSTOMER.DISPUTE.CREATED'){
        if (cfg?.billing?.autoBanOnDispute === 'created' && row?.guildId){
          db.prepare('UPDATE servers SET isBanned=1, banReason=?, bannedAt=? WHERE guildId=?').run('paypal_dispute', Date.now(), row.guildId);
          return res.json({ ok:true, guildId: row.guildId, banned: true, reason: 'paypal_dispute' });
        }
        return res.json({ ok:true, received: true });
      }

      if (type === 'CUSTOMER.DISPUTE.RESOLVED'){
        const outcome = (resource?.outcome?.outcome_code || '').toLowerCase();
        if (cfg?.billing?.autoBanOnDispute === 'lost' && outcome.includes('buyer')){
          if (row?.guildId){
            db.prepare('UPDATE servers SET isBanned=1, banReason=?, bannedAt=? WHERE guildId=?').run('paypal_dispute_lost', Date.now(), row.guildId);
            return res.json({ ok:true, guildId: row.guildId, banned: true, reason: 'paypal_dispute_lost' });
          }
        }
        return res.json({ ok:true, received: true });
      }

      return res.json({ ok:true, ignored: true, type });
    }catch(e){
      console.error('[paypal webhook] error', e);
      return res.status(500).json({ ok:false, error: 'server_error' });
    }
  });

  app.use(router);
}

module.exports = mount;
