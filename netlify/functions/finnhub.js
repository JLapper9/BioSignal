exports.handler = async function (event) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { statusCode: 500, body: 'Missing FINNHUB_API_KEY' };

  const path = event.path.replace(/^\/.netlify\/functions\/finnhub/, '');
  const qs = event.rawQuery ? `?${event.rawQuery}&token=${key}` : `?token=${key}`;
  const url = `https://finnhub.io/api/v1${path}${qs}`;

  try {
    const res = await fetch(url);
    const data = await res.text();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: data,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
