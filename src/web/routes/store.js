const express = require('express');
const router = express.Router();
const cfg = require('../../utils/config');
const { db } = require('../../utils/store_sqlite');

// simple form body parsing for this router
router.use(express.urlencoded({ extended: false }));

function isSnowflake(id){
  return typeof id === 'string' && /^[0-9]{16,20}$/.test(id);
}

router.get('/store', (req, res) => {
  const presetGuildId = (req.query.guildId || '').toString();
  const packs = Object.entries((cfg?.billing?.paypal?.prices)||{});
  const hasPayPal = !!cfg?.billing?.paypal?.clientId;

  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Buy Tokens</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;background:#0b1220;color:#e5e7eb;margin:0}
    .wrap{max-width:720px;margin:40px auto;padding:24px}
    h1{font-size:28px;margin:0 0 16px}
    p{color:#9ca3af}
    form{background:#111827;border:1px solid #374151;border-radius:12px;padding:20px;margin-top:12px}
    label{display:block;margin:12px 0 6px;color:#d1d5db}
    input,select,button{width:100%;padding:10px;border-radius:8px;border:1px solid #374151;background:#0b1220;color:#e5e7eb}
    button{margin-top:16px;background:#16a34a;border-color:#16a34a;font-weight:600;cursor:pointer}
    .note{margin-top:10px;font-size:12px;color:#9ca3af}
    code{background:#0f172a;padding:2px 6px;border-radius:6px;border:1px solid #1f2937}
    a{color:#93c5fd}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Buy Server Tokens</h1>
    <p>Enter your Discord <b>Server ID</b> and pick a token pack (PayPal).</p>
    ${hasPayPal ? '' : '<p style="color:#fca5a5">PayPal not configured. Set <code>billing.paypal.clientId</code> and <code>clientSecret</code> in <code>config.json</code>.</p>'}
    <form action="/store/paypal/checkout" method="get">
      <label for="guildId">Discord Server ID</label>
      <input id="guildId" name="guildId" placeholder="123456789012345678" required value="${presetGuildId}">
      <label for="priceId">Token Pack</label>
      <select id="priceId" name="priceId" required>
        ${packs.map(([id, p]) => `<option value="${id}">${p.name || id} — ${p.amount} ${p.currency || 'USD'}</option>`).join('')}
      </select>
      <button type="submit">Continue to PayPal</button>
      <p class="note">Payments are processed by PayPal. After payment, tokens are credited automatically via webhook.</p>
    </form>
  </div>
</body>
</html>`);
});

module.exports = router;
