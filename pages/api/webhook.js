const expected = process.env.WEBHOOK_SECRET;
console.log('[webhook] has_expected_secret:', Boolean(expected));
console.log('[webhook] body_has_secret:', typeof body?.secret === 'string', 'len=', (body?.secret||'').length);
if (expected && body?.secret !== expected) {
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}
// pages/api/webhook.js
import axios from 'axios';

function sendCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  sendCORS(res);

  // 预检/HEAD
  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  // GET：浏览器自测，返回 BTC/USD 价格
  if (req.method === 'GET') {
    try {
      const { data } = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      return res.status(200).json({ ok: true, price: data?.bitcoin?.usd ?? null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'fetch_failed' });
    }
  }

  // POST：TradingView/工具发信号
  if (req.method === 'POST') {
    // 解析 JSON
    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    // 校验 secret（稍后在 Vercel 配置环境变量）
    const expected = process.env.WEBHOOK_SECRET;
    if (expected && body?.secret !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    // 查询 BTC 价格并回传
    try {
      const { data } = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      const btc = data?.bitcoin?.usd ?? null;

      console.log('[webhook] payload:', body);
      console.log('[webhook] btc_usd:', btc);

      return res.status(200).json({ ok: true, btc_usd: btc });
    } catch {
      return res.status(500).json({ ok: false, error: 'fetch_failed' });
    }
  }

  // 其他方法
  res.setHeader('Allow', 'GET, POST, OPTIONS, HEAD');
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
