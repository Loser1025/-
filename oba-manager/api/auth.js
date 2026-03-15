export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier, redirect_uri } = req.body;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: "87533023495-hdt3pp8ujq3p60ptgl66nqaesnli802v.apps.googleusercontent.com",
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code',
      code_verifier,
    }),
  });

  const data = await response.json();
  if (data.error) {
    return res.status(400).json({ error: data.error_description || data.error });
  }

  return res.status(200).json({ access_token: data.access_token });
}
