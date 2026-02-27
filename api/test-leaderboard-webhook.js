/**
 * GET /api/test-leaderboard-webhook
 * Sends a test message to the Discord leaderboard channel (DISCORD_LEADERBOARD_WEBHOOK_URL).
 * Used by the Settings modal "Send test" button to verify the webhook works.
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = (process.env.DISCORD_LEADERBOARD_WEBHOOK_URL || '').trim();
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return res.status(200).json({
      ok: false,
      error: 'Leaderboard webhook not configured. Add DISCORD_LEADERBOARD_WEBHOOK_URL in Vercel environment variables.',
    });
  }

  const body = {
    embeds: [
      {
        title: '🏆 Boss kill leader changed',
        description: '**This is a test from SpoopTool.** If you see this, your leaderboard notification webhook is working. You\'ll get a message here when someone ties or overtakes the boss KC lead.',
        color: 0xf59e0b,
        footer: { text: 'SpoopTool (test)' },
      },
    ],
  };

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(200).json({
        ok: false,
        error: 'Discord returned ' + resp.status + (text ? ': ' + text.slice(0, 100) : ''),
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: (e && e.message) ? e.message : 'Failed to send test message',
    });
  }
};
