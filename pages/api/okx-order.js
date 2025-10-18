// pages/api/okx-order.js
import crypto from 'crypto';

const OKX_BASE = 'https://www.okx.com';
const INST_ID = process.env.OKX_INST_ID || 'DOGE-USDT-SWAP';
const TD_MODE = process.env.OKX_TDMODE || 'cross';

function okxSign({ method, path, body = '' }) {
  const ts = new Date().toISOString();
  const prehash = ts + method + path + body;
  const sign = crypto.createHmac('sha256', process.env.OKX_API_SECRET).update(prehash).digest('base64');
  const headers = {
    'OK-ACCESS-KEY': process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_API_PASSPHRASE,
    'Content-Type': 'application/json',
  };
  if (process.env.OKX_USE_DEMO === '1') headers['x-simulated-trading'] = '1';
  return headers;
}

async function okxPost(path, payload) {
  const body = JSON.stringify(payload);
  const headers = okxSign({ method: 'POST', path, body });
  const res = await fetch(OKX_BASE + path, { method: 'POST', headers, body });
  const data = await res.json();
  return { status: res.status, data };
}

async function placeOrder({ side, posSide, sz, ordType = 'market', px }) {
  const path = '/api/v5/trade/order';
  const payload = { instId: INST_ID, tdMode: TD_MODE, side, posSide, ordType, sz: String(sz) };
  if (ordType === 'limit' && px) payload.px = String(px);
  return okxPost(path, payload);
}

async function placeOcoTpSl({ posSide, tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx }) {
  const path = '/api/v5/trade/order-algo';
  const payload = {
    instId: INST_ID, tdMode: TD_MODE, posSide, ordType: 'oco', closeFraction: '1',
    tpTriggerPx: String(tpTriggerPx), tpOrdPx: String(tpOrdPx),
    slTriggerPx: String(slTriggerPx), slOrdPx: String(slOrdPx),
  };
  return okxPost(path, payload);
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, instId: INST_ID, tdMode: TD_MODE });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { action, sz, ordType, px, tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx } = req.body || {};
    if (!action || !sz) return res.status(400).json({ error: 'action & sz required' });

    let side, posSide;
    if (action === 'open_long')  { side = 'buy';  posSide = 'long'; }
    if (action === 'open_short') { side = 'sell'; posSide = 'short'; }
    if (action === 'close_long') { side = 'sell'; posSide = 'long'; }
    if (action === 'close_short'){ side = 'buy';  posSide = 'short'; }

    const orderResp = await placeOrder({ side, posSide, sz, ordType: ordType || 'market', px });
    const result = orderResp.data;
    const ok = orderResp.status === 200 && result?.data?.[0]?.sCode === '0';

    let ocoResp = null;
    const isOpen = action === 'open_long' || action === 'open_short';
    const wantOco = tpTriggerPx && tpOrdPx && slTriggerPx && slOrdPx;
    if (ok && isOpen && wantOco) {
      ocoResp = await placeOcoTpSl({ posSide, tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx });
    }

    return res.status(200).json({ ok, order: result, oco: ocoResp ? ocoResp.data : null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'internal error' });
  }
}
