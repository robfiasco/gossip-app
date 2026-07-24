// Shared Slack sender - used by scripts/dlmmScanner.mjs and
// scripts/positionMonitor.mjs so both post through the same pattern
// instead of duplicating fetch/error-handling.
export async function sendSlack(payload, webhookUrl) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Slack send failed:', error.message);
  }
}
