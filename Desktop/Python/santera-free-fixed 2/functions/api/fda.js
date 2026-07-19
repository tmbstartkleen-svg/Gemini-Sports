export async function onRequestGet() {
  const startDate = '20260301';
  const url = `https://api.fda.gov/food/enforcement.json?search=report_date:[${startDate}+TO+99991231]&sort=report_date:desc&limit=100`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Santera-Food-Facility-Intelligence/1.0' }
    });
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=900',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return Response.json(
      { error: 'FDA feed unavailable', detail: String(error) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
