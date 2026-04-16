/**
 * app/api/feedback/notify/route.ts
 *
 * Called by a Supabase Database Webhook on INSERT into the `feedback` table.
 *
 * ─── ONE-TIME SETUP (Supabase Dashboard → Database → Webhooks → Create) ────
 *   Name:    feedback-notify
 *   Table:   public.feedback
 *   Events:  INSERT
 *   URL:     https://<your-vercel-domain>/api/feedback/notify
 *   Method:  POST
 *   Headers: { "x-webhook-secret": "<value of FEEDBACK_WEBHOOK_SECRET>" }
 *
 * ─── ENV VARS (add in Vercel → Project → Settings → Environment Variables) ──
 *   RESEND_API_KEY          → API key from https://resend.com (free: 3,000/mo)
 *   FEEDBACK_WEBHOOK_SECRET → any random string; must match webhook header above
 *   ADMIN_EMAIL             → your address, e.g. khalid@tutormd.com
 *   FROM_EMAIL              → verified Resend sender, e.g. noreply@studymd.app
 *   NEXT_PUBLIC_APP_URL     → e.g. https://studymd.vercel.app (used in "View in Admin" link)
 *
 * ─── EMAILS SENT ─────────────────────────────────────────────────────────────
 *   On INSERT:
 *     1. Admin notification (all types, subject varies for Bug Reports)
 *     2. Reporter confirmation (only if user was logged in — we have their email)
 *
 *   On RESOLVE (triggered from PUT /api/admin/feedback when status → 'resolved'):
 *     3. Reporter resolution notice (only if user was logged in)
 *
 * ─── NO SDK NEEDED ───────────────────────────────────────────────────────────
 *   Resend is called via plain fetch — no npm install required.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ─── Resend helper ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.FROM_EMAIL ?? 'StudyMD <noreply@studymd.app>';

  if (!apiKey) {
    console.warn('[StudyMD email] RESEND_API_KEY not set — email skipped for:', subject);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[StudyMD email] Resend error:', res.status, body);
  } else {
    console.log('[StudyMD email] Sent:', subject, '→', to);
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

const baseStyle = `font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px`;
const cardStyle = `background:#13161d;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px`;
const metaLabel = `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px`;
const msgBlock  = `background:#0d0f14;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:20px`;

function adminNotifyHtml(fb: {
  type: string; message: string; page_url: string | null;
  user_name: string; created_at: string;
}) {
  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://studymd.vercel.app'}/admin`;
  const isBug = fb.type === 'Bug Report';
  return `<div style="${baseStyle}"><div style="${cardStyle}">
    <div style="font-size:24px;font-weight:700;color:#e8eaf0;margin-bottom:4px">${isBug ? '🐛' : '💬'} ${fb.type} — StudyMD</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:22px">${new Date(fb.created_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;width:80px">From</td><td style="padding:6px 0;font-size:14px;color:#e8eaf0">${fb.user_name}</td></tr>
      <tr><td style="padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280">Type</td><td style="padding:6px 0;font-size:14px;color:${isBug ? '#ef4444' : '#5b8dee'};font-weight:600">${fb.type}</td></tr>
      ${fb.page_url ? `<tr><td style="padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280">Page</td><td style="padding:6px 0;font-size:12px;color:#6b7280;font-family:monospace">${fb.page_url}</td></tr>` : ''}
    </table>
    <div style="${msgBlock}">
      <div style="${metaLabel}">Message</div>
      <div style="font-size:14px;color:#e8eaf0;line-height:1.65;white-space:pre-wrap">${fb.message}</div>
    </div>
    <a href="${adminUrl}" style="display:inline-block;background:#5b8dee;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600">View in Admin Inbox →</a>
  </div></div>`;
}

function confirmationHtml(fb: { type: string; message: string }) {
  return `<div style="${baseStyle}"><div style="${cardStyle}">
    <div style="font-size:24px;font-weight:700;color:#e8eaf0;margin-bottom:8px">💬 We got your feedback</div>
    <p style="font-size:14px;color:#6b7280;line-height:1.65;margin-bottom:20px">
      Thanks for sending a <strong style="color:#e8eaf0">${fb.type}</strong>.
      We review every submission and will follow up if we need more details.
    </p>
    <div style="${msgBlock}">
      <div style="${metaLabel}">Your message</div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.65;white-space:pre-wrap">${fb.message.slice(0,400)}${fb.message.length > 400 ? '…' : ''}</div>
    </div>
    <p style="font-size:12px;color:#6b7280;margin:0">— The StudyMD Team</p>
  </div></div>`;
}

export function buildResolutionHtml(fb: { type: string; message: string }) {
  return `<div style="${baseStyle}"><div style="${cardStyle}">
    <div style="font-size:24px;font-weight:700;color:#10b981;margin-bottom:8px">✓ Your feedback has been resolved</div>
    <p style="font-size:14px;color:#6b7280;line-height:1.65;margin-bottom:20px">
      Your <strong style="color:#e8eaf0">${fb.type}</strong> has been marked resolved by our team.
    </p>
    <div style="${msgBlock}">
      <div style="${metaLabel}">Original message</div>
      <div style="font-size:13px;color:#9ca3af;line-height:1.65;white-space:pre-wrap">${fb.message.slice(0,400)}${fb.message.length > 400 ? '…' : ''}</div>
    </div>
    <p style="font-size:12px;color:#6b7280;margin:0">Thank you for helping us improve StudyMD. — The StudyMD Team</p>
  </div></div>`;
}

// ─── Exported helper used by PUT /api/admin/feedback on resolve ───────────────

export async function sendResolutionEmail({
  userId,
  type,
  message,
}: {
  userId: string | null;
  type: string;
  message: string;
}) {
  if (!userId) return;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;
  const supa = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const { data: authUser } = await supa.auth.admin.getUserById(userId);
  const email = (authUser?.user as any)?.email;
  if (!email) return;
  await sendEmail({
    to: email,
    subject: 'Your StudyMD feedback has been resolved',
    html: buildResolutionHtml({ type, message }),
  });
}

// ─── Webhook POST handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = process.env.FEEDBACK_WEBHOOK_SECRET;
  if (secret) {
    const incoming = req.headers.get('x-webhook-secret');
    if (incoming !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Supabase webhooks send { type: 'INSERT', record: {...}, old_record: null, ... }
  const record = body?.record ?? body;
  const { type, message, page_url, user_id, created_at } = record ?? {};

  if (!type || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  let user_name  = 'Anonymous';
  let user_email: string | null = null;

  if (user_id) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const supa = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
      const [{ data: profile }, { data: authUser }] = await Promise.all([
        supa.from('user_profiles').select('display_name, username').eq('user_id', user_id).single(),
        supa.auth.admin.getUserById(user_id),
      ]);
      user_name  = (profile as any)?.display_name ?? (profile as any)?.username ?? 'User';
      user_email = (authUser?.user as any)?.email ?? null;
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const promises: Promise<void>[] = [];

  // 1. Admin notification
  if (adminEmail) {
    promises.push(sendEmail({
      to: adminEmail,
      subject: type === 'Bug Report'
        ? `🐛 Bug Report from ${user_name} — StudyMD`
        : `💬 New ${type} from ${user_name} — StudyMD`,
      html: adminNotifyHtml({ type, message, page_url: page_url ?? null, user_name, created_at: created_at ?? new Date().toISOString() }),
    }));
  }

  // 2. Reporter confirmation
  if (user_email) {
    promises.push(sendEmail({
      to: user_email,
      subject: 'We received your feedback — StudyMD',
      html: confirmationHtml({ type, message }),
    }));
  }

  await Promise.allSettled(promises);
  return NextResponse.json({ ok: true });
}
