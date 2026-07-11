// pages/api/save-signature.js
// Persists the homeowner's e-signature + non-representation acknowledgment.
// Call this from success.js the moment onSigned() fires, BEFORE /api/send-letter,
// so there is a durable record that the owner adopted and signed the protest
// before anything was mailed.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side; do not use the anon key here
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sessionId, signatureImage, typedName, acknowledged, signedAt } = req.body;

  if (!sessionId || !acknowledged || !signedAt) {
    return res.status(400).json({ error: "Missing signature, acknowledgment, or session" });
  }

  // Capture signer IP for the record (works behind Vercel's proxy).
  const signerIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null;

  try {
    // Store on the existing order row keyed by Stripe session id.
    const { error } = await supabase
      .from("orders")
      .update({
        signature_image: signatureImage || null,
        signature_typed_name: typedName || null,
        owner_ack: true,
        signed_at: signedAt,
        signer_ip: signerIp,
      })
      .eq("stripe_session_id", sessionId);

    if (error) {
      console.error("Supabase signature save failed:", error);
      return res.status(500).json({ error: "Could not save signature" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("save-signature error:", err);
    return res.status(500).json({ error: "Server error saving signature" });
  }
}

/*
 * One-time Supabase migration — run in the SQL editor before deploying:
 *
 *   alter table orders
 *     add column if not exists signature_image        text,
 *     add column if not exists signature_typed_name    text,
 *     add column if not exists owner_ack               boolean default false,
 *     add column if not exists signed_at               timestamptz,
 *     add column if not exists signer_ip               text;
 */
