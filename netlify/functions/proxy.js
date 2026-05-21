exports.handler = async function (event) {
  const targetUrl = event.queryStringParameters?.url;
  if (!targetUrl) return { statusCode: 400, body: 'Missing url parameter' };

  const isNewsApi = targetUrl.includes('newsapi.org');
  const finalUrl = isNewsApi
    ? `${targetUrl}&apiKey=${process.env.NEWSAPI_KEY}`
    : targetUrl;

  try {
    const res = await fetch(finalUrl, {
      headers: { 'User-Agent': 'BioSignal/1.0' },
    });
    const body = await res.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
