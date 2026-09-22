// Frontend runtime config (Vite bakes these at BUILD time).
// Non-secret values only. Secrets stay server-side.
export const config = {
  VSL1_EMBED_ID: import.meta.env.VITE_VSL1_EMBED_ID || '5ede5862-c8bb-47ed-9fe9-814bb13660f0',
  VSL2_EMBED_ID: import.meta.env.VITE_VSL2_EMBED_ID || '76879b03-46a2-4702-b614-ed4f75ee77ee',
  CHECKOUT_URL: import.meta.env.VITE_CHECKOUT_URL || 'https://pay.youshop.co/DS7KII7HJJ5MLP59',
  FUNNEL_NAME: import.meta.env.VITE_FUNNEL_NAME || 'angel_guarda',
  // Exact second in VSL1 at which the email capture overlay opens (original: 5:04).
  EMAIL_CAPTURE_AT_SEC: Number(import.meta.env.VITE_EMAIL_CAPTURE_AT_SEC || 304),
};
