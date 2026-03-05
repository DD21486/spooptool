#!/usr/bin/env node
/**
 * One-time setup: register a Vercel webhook so deploy events are sent to your app,
 * which then posts to Discord (via DISCORD_DEPLOY_WEBHOOK_URL).
 *
 * Prerequisites:
 * 1. In Vercel → Project → Settings → Environment Variables, add:
 *    DISCORD_DEPLOY_WEBHOOK_URL = your Discord channel's Incoming Webhook URL
 * 2. Create a Vercel API token: https://vercel.com/account/tokens (e.g. "Deploy webhook" scope)
 *
 * Usage (from repo root):
 *   node scripts/setup-vercel-deploy-webhook.js
 *
 * Required env vars:
 *   VERCEL_TOKEN     - Your Vercel API token
 *   APP_URL          - Your app URL, e.g. https://spooptool.vercel.app (no trailing slash)
 *
 * Optional:
 *   VERCEL_PROJECT_ID - Project ID (prj_xxx). If not set, the script lists your projects and uses the first one.
 *
 * Example:
 *   VERCEL_TOKEN=xxx APP_URL=https://spooptool.vercel.app node scripts/setup-vercel-deploy-webhook.js
 */

const token = process.env.VERCEL_TOKEN;
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
const projectId = process.env.VERCEL_PROJECT_ID;

if (!token) {
  console.error('Missing VERCEL_TOKEN. Create one at https://vercel.com/account/tokens');
  process.exit(1);
}
if (!appUrl || !appUrl.startsWith('https://')) {
  console.error('Missing or invalid APP_URL. Set it to your app URL, e.g. https://spooptool.vercel.app');
  process.exit(1);
}

const webhookUrl = appUrl + '/api/vercel-deploy-notify';
const events = ['deployment.succeeded', 'deployment.error', 'deployment.canceled'];

async function main() {
  let targetProjectId = projectId;

  if (!targetProjectId) {
    console.log('Listing your Vercel projects...');
    const listRes = await fetch('https://api.vercel.com/v9/projects', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!listRes.ok) {
      const t = await listRes.text();
      console.error('Failed to list projects:', listRes.status, t.slice(0, 300));
      console.error('\nIf you use a team, try: VERCEL_PROJECT_ID=prj_xxx (get it from Project → Settings → General)');
      process.exit(1);
    }
    const data = await listRes.json();
    const projects = data.projects || data;
    if (!projects || projects.length === 0) {
      console.error('No projects found.');
      process.exit(1);
    }
    targetProjectId = projects[0].id;
    console.log('Using project:', projects[0].name, '(' + targetProjectId + ')');
    if (projects.length > 1) {
      console.log('(To use a different project, set VERCEL_PROJECT_ID=prj_xxx)');
    }
  }

  console.log('\nCreating webhook:', webhookUrl);
  console.log('Events:', events.join(', '));

  const createRes = await fetch('https://api.vercel.com/v1/webhooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      url: webhookUrl,
      events,
      projectIds: [targetProjectId],
    }),
  });

  const result = await createRes.json().catch(() => ({}));

  if (!createRes.ok) {
    console.error('Failed to create webhook:', createRes.status, JSON.stringify(result, null, 2));
    if (createRes.status === 403) {
      console.error('\nYour token may need full access. Create a new token at https://vercel.com/account/tokens');
    }
    process.exit(1);
  }

  console.log('\nWebhook created successfully.');
  console.log('Next deploy (push to Git or manual deploy) will post to Discord if DISCORD_DEPLOY_WEBHOOK_URL is set in Vercel env.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
