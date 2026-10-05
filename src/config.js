// Frontend runtime config (Vite bakes these at BUILD time).
// Non-secret values only. Secrets stay server-side.
export const config = {
  // --- VTurb / ConverteAI videos (NOT tynk.ai) ---
  // VSL1: video shown before the email capture overlay.
  VSL1_VTURB: {
    id: 'vid-6ac1651e89c7a03a20614f34',
    playerId: '6ac1651e89c7a03a20614f34',
    scriptSrc:
      'https://scripts.converteai.net/eaf1c93c-4678-434c-baf0-14a7282b15d6/players/6ac1651e89c7a03a20614f34/v4/player.js',
    // padding-top % of the placeholder = (video height / width) * 100.
    placeholderPadding: 178.21782178217822,
  },
  // VSL2: video shown after the email capture overlay (A/B test variant).
  VSL2_VTURB: {
    id: 'ab-6ac1662495be2f74ba5fcbe5',
    playerId: '6ac1662495be2f74ba5fcbe5',
    scriptSrc:
      'https://scripts.converteai.net/eaf1c93c-4678-434c-baf0-14a7282b15d6/ab-test/6ac1662495be2f74ba5fcbe5/player.js',
    placeholderPadding: 177.77777777777777,
  },
  CHECKOUT_URL: import.meta.env.VITE_CHECKOUT_URL || 'https://pay.youshop.co/DS7KII7HJJ5MLP59',
  FUNNEL_NAME: import.meta.env.VITE_FUNNEL_NAME || 'angel_guarda',
  // Wall-clock second (after VSL1 starts) at which the email capture overlay
  // opens. Exact video-time sync would need to be configured inside the
  // VTurb/ConverteAI dashboard (their lead-capture-at-timestamp feature), since
  // the player runs in a cross-origin iframe and we can't read currentTime.
  // Set to 5:06 (306s) to match the requested moment.
  EMAIL_CAPTURE_AT_SEC: Number(import.meta.env.VITE_EMAIL_CAPTURE_AT_SEC || 306),
};
