export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const secret = request.headers.get('x-trigger-secret') || searchParams.get('secret');
  if (secret !== process.env.TRIGGER_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(
    'https://api.github.com/repos/Loser1025/-/actions/workflows/244935312/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `token ${process.env.GITHUB_PAT}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) {
    return Response.json({ ok: true });
  }
  const text = await res.text();
  return Response.json({ error: text }, { status: res.status });
}
