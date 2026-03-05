/**
 * POST /api/vercel-deploy-notify
 *
 * Receives Vercel deployment webhooks and posts a short summary to a Discord
 * channel. Use this so collaborators can see deploy results without Vercel
 * team access (e.g. on Hobby plan).
 *
 * Setup:
 * 1. Discord: Create an Incoming Webhook for the channel (Channel → Edit → Integrations → Webhooks).
 * 2. Vercel env: Add DISCORD_DEPLOY_WEBHOOK_URL with that webhook URL.
 * 3. Vercel webhook: In project Settings → Webhooks (or via API), add a webhook
 *    URL: https://your-app.vercel.app/api/vercel-deploy-notify
 *    Events: deployment.succeeded, deployment.error, deployment.canceled
 *
 * Vercel webhooks are created via Dashboard (Project → Settings → Integrations / Webhooks)
 * or via REST API: POST https://api.vercel.com/v1/webhooks with body
 * { "url": "https://...", "events": ["deployment.succeeded", "deployment.error", "deployment.canceled"] }
 * (requires Vercel API token from vercel.com/account/tokens)
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = (process.env.DISCORD_DEPLOY_WEBHOOK_URL || '').trim();
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return res.status(200).json({
      ok: false,
      error: 'DISCORD_DEPLOY_WEBHOOK_URL not set. Add it in Vercel → Project → Settings → Environment Variables.',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (_) {
    return res.status(200).json({ ok: false, error: 'Invalid JSON' });
  }

  const type = body.type || '';
  const payload = body.payload || {};
  const project = payload.project || {};
  const deployment = payload.deployment || {};
  const projectName = project.name || 'SpoopTool';
  const deploymentUrl = deployment.url || deployment.links?.preview || '';
  const state = deployment.state || '';
  const commitMessage = (deployment.meta && deployment.meta.githubCommitMessage) || (deployment.meta && deployment.meta.gitCommitMessage) || '';

  const isSuccess = type === 'deployment.succeeded' || state === 'READY';
  const isError = type === 'deployment.error' || state === 'ERROR';
  const isCanceled = type === 'deployment.canceled' || state === 'CANCELED';

  let color = 0x3b82f6; // blue
  let title = 'Deploy';
  if (isSuccess) {
    color = 0x22c55e; // green
    title = '✅ Deploy succeeded';
  } else if (isError) {
    color = 0xef4444; // red
    title = '❌ Deploy failed';
  } else if (isCanceled) {
    color = 0x94a3b8; // slate
    title = '⏹ Deploy canceled';
  } else {
    title = `Deploy: ${type || state || 'unknown'}`;
  }

  const description = [
    `**${projectName}**`,
    deploymentUrl ? `🔗 ${deploymentUrl}` : '',
    commitMessage ? `\n${String(commitMessage).trim().slice(0, 200)}${commitMessage.length > 200 ? '…' : ''}` : '',
  ].filter(Boolean).join('\n');

  const discordBody = {
    embeds: [
      {
        title,
        description: description || 'No details.',
        color,
        footer: { text: 'Vercel → Discord' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordBody),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('Discord deploy webhook failed', resp.status, text?.slice(0, 200));
      return res.status(200).json({
        ok: false,
        error: 'Discord returned ' + resp.status,
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('vercel-deploy-notify', e?.message || e);
    return res.status(200).json({
      ok: false,
      error: (e && e.message) ? e.message : 'Failed to send to Discord',
    });
  }
};
