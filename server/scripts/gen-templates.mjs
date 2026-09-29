// One-off generator for automation email scaffolds (Fase 7).
// Produces .txt templates in server/email-templates/angel_guarda/.
// Copy is scaffold + placeholders for items still open in spec §19
// (mentora name, upsell prices/terms, guarantee, delivery window).
// Run: node server/scripts/gen-templates.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'email-templates', 'angel_guarda');
fs.mkdirSync(DIR, { recursive: true });

const SENDER = 'Mapa del Ángel - hola@mapa-del-angel.com';

// Shared footer with unsubscribe + support links (spec §12.9 / §13).
function footer() {
  return `
      <p style="margin:28px 0 0;font-size:13px;color:#9aa0b5;">
        Con cariño,<br/>El equipo de Mapa del Ángel de la Guarda
      </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7186;">
          <a href="%UNSUBSCRIBE_URL%" style="color:#6b7186;">Cancelar suscripción</a>
          &nbsp;·&nbsp;
          <a href="%SUPPORT_URL%" style="color:#6b7186;">Soporte</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Minimal HTML wrapper.
function wrap(name, subject, preheader, bodyHtml) {
  return `Subject line: ${subject}
Preheader: ${preheader}
From: ${SENDER}

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
</head>
<body style="margin:0;padding:0;background:#0b1020;font-family:Arial,Helvetica,sans-serif;color:#e9e9f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121a33;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px;">
${bodyHtml}
${footer()}`;
}

// Challenge-specific angle (spec §11).
const CHALLENGE_ANGLE = {
  love: 'Tu corazón guarda residuos emocionales que merecen claridad. Este mensaje habla de relaciones que no permanecen y del miedo a quedarte con migajas.',
  finance: 'El dinero que llega y se escapa deja una inercia. Este mensaje habla de oportunidades que se pierden y de la sensación de escasez.',
  health: 'La vitalidad cansada pide una rutina de claridad. Este mensaje habla de energía personal sin prometer curas.',
  happiness: 'El agotamiento de sostener todo y la invisibilidad merecen un descanso. Este mensaje habla de volver a tu propio eje.',
};

function challengeBlock(challenge) {
  if (!challenge) return '';
  return `              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">${CHALLENGE_ANGLE[challenge]}</p>\n`;
}

// Build a recovery-style email with optional challenge variant.
function recoveryEmail({ key, step, subject, preheader, challenge, body }) {
  const suffix = challenge ? `_${challenge}` : '';
  const file = `${key}_${step}${suffix}.txt`;
  const name = `${key}_${step}${suffix}`;
  const bodyHtml = body(challenge);
  fs.writeFileSync(path.join(DIR, file), wrap(name, subject, preheader, bodyHtml));
  return file;
}

// ============================================================ A. Quiz abandon
['quiz_abandon_1', 'quiz_abandon_2'].forEach((f, i) => {
  recoveryEmail({
    key: 'quiz_abandon', step: i + 1,
    subject: i === 0 ? 'Tu lectura quedó a medio camino' : 'Falta una respuesta para completar tu señal',
    preheader: 'No terminaste el quiz de tu ángel',
    body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Tu lectura quedó a medio camino. Tu ángel de la guarda ya comenzó a trazar
                tu mapa, pero falta una respuesta para completar tu señal.
              </p>
              <p style="margin:0 0 24px;line-height:1.6;font-size:16px;">
                "Falta una respuesta para completar tu señal" — retómala cuando quieras.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%CHECKOUT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Continuar mi lectura
                  </a>
                </td></tr>
              </table>`,
  });
});

// ============================================================ C. Lead -> VSL2
const C_STEPS = [
  { step: 1, subj: 'Tu acceso a la continuación de tu lectura', pre: 'Sigue tu mapa', delay: 'T+15 min' },
  { step: 2, subj: 'El mecanismo del rádio y la señal', pre: 'Una clave para tu ángel', delay: 'T+8 h' },
  { step: 3, subj: 'Tu ventana de preparación', pre: 'Prepárate para recibir', delay: 'T+24 h' },
  { step: 4, subj: 'No dejes que se cierre tu lectura', pre: 'Último acceso', delay: 'T+48 h' },
];
for (const s of C_STEPS) {
  const challenges = [null, 'love', 'finance', 'health', 'happiness'];
  for (const ch of challenges) {
    recoveryEmail({
      key: 'lead_vsl2', step: s.step,
      subject: s.subj, preheader: s.pre,
      challenge: ch,
      body: (c) => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
${challengeBlock(c)}              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Tu ángel dejó preparada la segunda parte de tu lectura (${s.delay}).
                Está hecha según tu signo %ZODIAC_SIGN% y tu etapa de vida.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="https://mapa.timeoffaith.online/" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Ver mi lectura
                  </a>
                </td></tr>
              </table>`,
    });
  }
}

// ============================================================ D. VSL2 no offer
const D_STEPS = [
  { step: 1, subj: 'Tu mapa necesita la parte más importante', pre: 'La revelación', delay: 'T+1 h' },
  { step: 2, subj: 'No basta con que el portal se abra', pre: 'El mecanismo', delay: 'T+12 h' },
  { step: 3, subj: 'Los tres golpes de sincronía', pre: 'Alineación', delay: 'T+36 h' },
];
for (const s of D_STEPS) {
  const challenges = [null, 'love', 'finance', 'health', 'happiness'];
  for (const ch of challenges) {
    recoveryEmail({
      key: 'vsl2_nooffer', step: s.step,
      subject: s.subj, preheader: s.pre, challenge: ch,
      body: (c) => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
${challengeBlock(c)}              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Viste gran parte de tu lectura (${s.delay}), pero parece que no llegaste
                a la parte donde se revela el mecanismo de tu mapa.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="https://mapa.timeoffaith.online/" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Ver la revelación
                  </a>
                </td></tr>
              </table>`,
    });
  }
}

// ============================================================ E. Offer no checkout
const E_STEPS = [
  { step: 1, subj: 'Resumen del mecanismo de tu mapa', pre: 'Lo esencial', delay: 'T+2 h' },
  { step: 2, subj: 'Qué viene en tu mapa y los bonos', pre: 'Contenido', delay: 'T+24 h' },
  { step: 3, subj: 'Dudas de confianza y entrega', pre: 'Confianza', delay: 'T+48 h' },
  { step: 4, subj: 'Tu garantía (si aplica)', pre: 'Garantía', delay: 'T+72 h' },
  { step: 5, subj: 'Último acceso a tu mapa', pre: 'Cierre', delay: 'T+5 d' },
];
for (const s of E_STEPS) {
  const challenges = [null, 'love', 'finance', 'health', 'happiness'];
  for (const ch of challenges) {
    recoveryEmail({
      key: 'offer_nocheckout', step: s.step,
      subject: s.subj, preheader: s.pre, challenge: ch,
      body: (c) => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
${challengeBlock(c)}              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Llegaste a la oferta de tu Mapa del Ángel de la Guarda (${s.delay}),
                pero parece que no iniciaste el pago. %PRIMARY_CHALLENGE_LABEL%.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%CHECKOUT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Obtener mi mapa — US$ 27
                  </a>
                </td></tr>
              </table>`,
    });
  }
}

// ============================================================ F. Checkout recovery
const F_STEPS = [
  { step: 1, subj: 'Tu mapa quedó reservado', pre: 'Pendiente', delay: 'T+30 min' },
  { step: 2, subj: 'Tu desafío principal merece claridad', pre: 'Tu dolor', delay: 'T+6 h' },
  { step: 3, subj: 'Cómo funciona tu mapa', pre: 'Mecanismo', delay: 'T+24 h' },
  { step: 4, subj: 'Sobre la entrega y la confianza', pre: 'Confianza', delay: 'T+48 h' },
  { step: 5, subj: 'Tu garantía (si aplica)', pre: 'Garantía', delay: 'T+72 h' },
  { step: 6, subj: 'Esta es tu ventana real', pre: 'Urgencia', delay: 'T+5 d' },
  { step: 7, subj: 'Cerramos tu recuperación', pre: 'Adiós por ahora', delay: 'T+7 d' },
];
for (const s of F_STEPS) {
  const challenges = [null, 'love', 'finance', 'health', 'happiness'];
  for (const ch of challenges) {
    recoveryEmail({
      key: 'checkout_recovery', step: s.step,
      subject: s.subj, preheader: s.pre, challenge: ch,
      body: (c) => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
${challengeBlock(c)}              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Iniciaste el pago de tu Mapa del Ángel de la Guarda (${s.delay}) pero no se
                confirmó. No diremos que ya fue creado hasta que el pago se confirme.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%CHECKOUT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Reintentar pago — US$ 27
                  </a>
                </td></tr>
              </table>`,
    });
  }
}

// ============================================================ G. Payment failed
const G_STEPS = [
  { step: 1, subj: 'Hubo una interrupción en tu pago', pre: 'No es tu deseo', delay: 'inmediato' },
  { step: 2, subj: 'Intenta de nuevo en un clic', pre: 'Simple', delay: 'T+6 h' },
  { step: 3, subj: 'Otro medio de pago', pre: 'Alternativa', delay: 'T+24 h' },
  { step: 4, subj: 'Seguridad y soporte', pre: 'Confianza', delay: 'T+48 h' },
  { step: 5, subj: 'Cerramos esta recuperación', pre: 'Adiós', delay: 'T+72 h' },
];
for (const s of G_STEPS) {
  const challenges = [null, 'love', 'finance', 'health', 'happiness'];
  for (const ch of challenges) {
    recoveryEmail({
      key: 'payment_failed', step: s.step,
      subject: s.subj, preheader: s.pre, challenge: ch,
      body: (c) => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
${challengeBlock(c)}              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Parece que hubo una interrupción en el procesamiento de tu pago (${s.delay}).
                Tu acceso todavía no fue confirmado. No es falta de deseo: a veces el
                procesador rechaza sin motivo claro.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%CHECKOUT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Reintentar pago seguro
                  </a>
                </td></tr>
              </table>`,
    });
  }
}

// ============================================================ H. Payment pending (PIX/OXXO future)
recoveryEmail({
  key: 'payment_pending', step: 1,
  subject: 'Confirmamos tu pago pendiente', pre: 'Instrucciones',
  body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Recibimos tu solicitud de pago. Mientras se confirma, aqui están las
                instrucciones para completarlo (válido hasta el vencimiento).
              </p>
              <p style="margin:0 0 24px;line-height:1.6;font-size:16px;">
                [INSTRUCCIONES_PAGO_PENDIENTE]
              </p>`,
});
recoveryEmail({
  key: 'payment_pending', step: 'expire',
  subject: 'Tu pago pendiente expiró', pre: 'Expirado',
  body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Tu pago pendiente expiró. Puedes iniciar de nuevo cuando quieras.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%CHECKOUT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Reintentar pago
                  </a>
                </td></tr>
              </table>`,
});

// ============================================================ I. Onboarding
const I_STEPS = [
  { step: 1, subj: '¡Tu mapa está confirmado!', pre: 'Recibo', delay: 'inmediato' },
  { step: 2, subj: 'Cómo acceder a tu mapa', pre: 'Acceso', delay: 'T+1 h' },
  { step: 3, subj: 'Cómo usar tu mapa', pre: 'Uso', delay: 'T+24 h' },
  { step: 4, subj: 'Tu ritual diario', pre: 'Práctica', delay: 'T+3 d' },
  { step: 5, subj: 'Soporte y próximo paso', pre: 'Soporte', delay: 'T+7 d' },
];
for (const s of I_STEPS) {
  recoveryEmail({
    key: 'onboarding', step: s.step,
    subject: s.subj, preheader: s.pre,
    body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Gracias por tu compra. Tu Mapa del Ángel de la Guarda está confirmado (${s.delay}).
                [DETALLES_ENTREGA — plazo: PLACEHOLDER].
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="https://mapa.timeoffaith.online/gracias/" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Acceder a mi mapa
                  </a>
                </td></tr>
              </table>`,
  });
}

// ============================================================ J. Upsells
const UPS = [
  { key: 'upsell_up1', offer: 'Acelerados Angélico', route: '/up1' },
  { key: 'upsell_up2', offer: 'Combo de Prosperidad', route: '/up2' },
  { key: 'upsell_up3', offer: 'Consultoría individual Mahila Luz', route: '/up3' },
];
for (const u of UPS) {
  recoveryEmail({
    key: u.key, step: 1,
    subject: `Oferta especial: ${u.offer}`,
    preheader: 'Solo para compradores',
    body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Como ya tienes tu Mapa del Ángel de la Guarda, te ofrecemos
                <strong>${u.offer}</strong> ([PRECIO/MONEDA — PLACEHOLDER], [única/recurrente — PLACEHOLDER]).
              </p>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                [QUE SE ENTREGA — PLACEHOLDER] · [PLAZO DE ENTREGA — PLACEHOLDER].
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="https://mapa.timeoffaith.online${u.route}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Ver ${u.offer}
                  </a>
                </td></tr>
              </table>`,
  });
}

// ============================================================ K. Refund/chargeback
recoveryEmail({
  key: 'refund_support', step: 1,
  subject: 'Sobre tu reembolso',
  preheader: 'Soporte',
  body: () => `              <h1 style="margin:0 0 16px;font-size:24px;color:#f4d58d;">Hola %FIRSTNAME% ✨</h1>
              <p style="margin:0 0 16px;line-height:1.6;font-size:16px;">
                Registramos tu solicitud de reembolso/cancelación. No enviaremos más
                correos promocionales. Aquí tienes el estado de tu proceso y cómo
                contactar soporte.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="border-radius:8px;background:#f4d58d;">
                  <a href="%SUPPORT_URL%" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#0b1020;text-decoration:none;">
                    Ir a soporte
                  </a>
                </td></tr>
              </table>`,
});

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt'));
console.log(`Generated ${files.length} template files in ${DIR}`);
