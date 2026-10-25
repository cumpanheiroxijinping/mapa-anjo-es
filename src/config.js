// Frontend runtime config (Vite bakes these at BUILD time).
// Non-secret values only. Secrets stay server-side.
export const config = {
  // --- VTurb / ConverteAI videos (NOT tynk.ai) ---
  // VSL1: video shown before the email capture overlay.
  VSL1_VTURB: {
    id: 'vid-6ac7e81bbfc6689edfc25a5b',
    playerId: '6ac7e81bbfc6689edfc25a5b',
    scriptSrc:
      'https://scripts.converteai.net/8671d2f6-c45f-4b55-9776-68f6c495a79a/players/6ac7e81bbfc6689edfc25a5b/v4/player.js',
    // padding-top % of the placeholder = (video height / width) * 100.
    placeholderPadding: 177.77777777777777,
  },
  // VSL2: video shown after the email capture overlay (A/B test variant).
  VSL2_VTURB: {
    id: 'vid-6ac7eaf16785d5b41a2990be',
    playerId: '6ac7eaf16785d5b41a2990be',
    scriptSrc:
      'https://scripts.converteai.net/8671d2f6-c45f-4b55-9776-68f6c495a79a/players/6ac7eaf16785d5b41a2990be/v4/player.js',
    placeholderPadding: 177.77777777777777,
  },
  // VSL2 variants keyed by affiliate ref (?ref=...). When the funnel is started
  // with a known affiliate ref, the matching VSL2 player is used instead of the
  // default above. The affiliate's own checkout link (?ref=PPA25WTK) is wired
  // inside the VTurb player itself (ConverteAI dashboard), not here.
  VSL2_VTURB_AFFILIATE: {
    PPA25WTK: {
      id: 'vid-6acc006bf6a57d8e37b9e476',
      playerId: '6acc006bf6a57d8e37b9e476',
      scriptSrc:
        'https://scripts.converteai.net/8671d2f6-c45f-4b55-9776-68f6c495a79a/players/6acc006bf6a57d8e37b9e476/v4/player.js',
      placeholderPadding: 177.77777777777777,
    },
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

// Resolve the VSL2 player config for the given affiliate ref (?ref=...).
// Falls back to the default VSL2 when the ref is unknown/empty.
export function getVsl2Config(ref) {
  const r = (ref || '').toString().trim().toUpperCase();
  if (r && config.VSL2_VTURB_AFFILIATE[r]) {
    return config.VSL2_VTURB_AFFILIATE[r];
  }
  return config.VSL2_VTURB;
}
