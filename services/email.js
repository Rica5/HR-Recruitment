const nodemailer = require('nodemailer');

function getTransporter() {
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

// ── Per-company branding (colors aligned with the app themes) ──
const COMPANY_BRANDING = {
  solumada: {
    name: 'Solumada',
    logo: 'https://www.solumada.mg/wp-content/uploads/2024/05/New-one.png',
    color: '#22c55e',
    colorDark: '#15803d',
    colorSoft: '#f0fdf4',
    logoBg: '#ffffff',   // colored logo → needs a white chip to stand out
    logoHeight: 36,
  },
  optimum: {
    name: 'Optimum Solutions',
    logo: 'https://optimumsolutions.eu/wp-content/uploads/2023/04/text-annotations-1.png',
    color: '#62A5D2',
    colorDark: '#2b6ca3',
    colorSoft: '#eff6ff',
    logoBg: '',          // white logo → shown directly on the colored header (no chip)
    logoHeight: 46,
  },
};
function getBranding(company) {
  return COMPANY_BRANDING[company] || COMPANY_BRANDING.solumada;
}

function getLanguage(company) {
  return company === 'optimum' ? 'en' : 'fr';
}

// ── Reusable, email-client-safe layout (tables + inline styles) ──
function emailLayout({ company, preheader = '', title, subtitle = '', bodyHtml, ctaLabel = '', ctaUrl = '' }) {
  const b = getBranding(company);
  const isEn = getLanguage(company) === 'en';
  const year = new Date().getFullYear();
  const cta = (ctaLabel && ctaUrl) ? `
    <tr><td align="center" style="padding:6px 32px 4px">
      <a href="${ctaUrl}" style="display:inline-block;background:${b.color};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 38px;border-radius:10px">${ctaLabel}</a>
    </td></tr>` : '';

  const logoH = b.logoHeight || 36;
  // White/transparent logos (logoBg empty) sit directly on the colored header;
  // colored logos get a white chip so they never blend into the gradient.
  const logoBlock = b.logoBg
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${b.logoBg};border-radius:14px;padding:13px 20px;box-shadow:0 6px 18px rgba(0,0,0,.12)">
         <img src="${b.logo}" alt="${b.name}" height="${logoH}" style="display:block;height:${logoH}px;max-height:${logoH}px;max-width:180px;border:0;outline:none">
       </td></tr></table>`
    : `<img src="${b.logo}" alt="${b.name}" height="${logoH}" style="display:block;height:${logoH}px;max-height:${logoH}px;max-width:210px;border:0;outline:none">`;

  const footerNote = isEn
    ? 'Recruitment · Please do not reply directly to this email.'
    : 'Service Recrutement · Merci de ne pas répondre directement à cet email.';
  const copyright = isEn ? 'All rights reserved' : 'Tous droits réservés';

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'fr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:#eef2f6;-webkit-font-smoothing:antialiased">
  <span style="display:none!important;font-size:0;line-height:0;max-height:0;opacity:0;overflow:hidden;mso-hide:all">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:30px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 44px rgba(15,23,42,.12);font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,${b.colorDark} 0%,${b.color} 100%);padding:34px 24px 30px" align="center">
          ${logoBlock}
          <h1 style="margin:20px 0 0;color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-.02em">${title}</h1>
          ${subtitle ? `<p style="margin:9px 0 0;color:rgba(255,255,255,.88);font-size:14px;font-weight:500">${subtitle}</p>` : ''}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:34px 32px 10px;color:#334155;font-size:15px;line-height:1.65">
          ${bodyHtml}
        </td></tr>
        ${cta}

        <!-- Footer -->
        <tr><td style="padding:30px 32px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #eef2f6;padding-top:20px">
            <p style="margin:0;color:#64748b;font-size:13px;font-weight:700">${b.name}</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;line-height:1.6">${footerNote}</p>
          </td></tr></table>
        </td></tr>

      </table>
      <p style="margin:18px 0 0;color:#cbd5e1;font-size:11px">© ${year} ${b.name} — ${copyright}</p>
    </td></tr>
  </table>
</body></html>`;
}

// Small helper for label/value detail tables inside the body
function detailTable(rows) {
  const trs = rows.filter(Boolean).map(([label, value]) => `
    <tr>
      <td style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #eef2f6;font-weight:600;color:#475569;font-size:13px;width:38%">${label}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #eef2f6;color:#0f172a;font-size:14px;font-weight:500">${value}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid #eef2f6;border-radius:12px;overflow:hidden;margin:20px 0">${trs}</table>`;
}

function fromHeader(company) {
  const b = getBranding(company);
  return `"${b.name} — Recrutement" <${process.env.EMAIL_USER}>`;
}

// Append ?guests=email to a Cal.com booking URL so the recruiter receives a calendar invite
function withGuest(url, email) {
  if (!url || url === '#' || !email) return url || '#';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}guests=${encodeURIComponent(email)}`;
}

// ── Recruiter notification: job offer created ──
async function sendJobOfferEmail({ offre, applicationLink }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const body = isEn
    ? `<p style="margin:0 0 14px">Your new job offer is now live. Here is a summary:</p>
       ${detailTable([
         ['Position', offre.titre_poste],
         ['Contract', offre.type_contrat],
         ['Location', offre.localisation],
         ['Offer ID', offre.offre_id],
       ])}
       <p style="margin:16px 0 6px">Share the link below with candidates to receive their applications:</p>
       <p style="margin:0;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:14px;word-break:break-all;font-size:13px;color:#475569">${applicationLink}</p>`
    : `<p style="margin:0 0 14px">Votre nouvelle offre d'emploi est en ligne. Voici le récapitulatif :</p>
       ${detailTable([
         ['Poste', offre.titre_poste],
         ['Contrat', offre.type_contrat],
         ['Localisation', offre.localisation],
         ['ID Offre', offre.offre_id],
       ])}
       <p style="margin:16px 0 6px">Partagez le lien ci-dessous aux candidats pour recevoir leurs candidatures :</p>
       <p style="margin:0;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:14px;word-break:break-all;font-size:13px;color:#475569">${applicationLink}</p>`;
  await transporter.sendMail({
    from: fromHeader(offre.company),
    to: offre.email_recruteur,
    subject: isEn ? `✅ Job offer created — ${offre.titre_poste}` : `✅ Offre créée — ${offre.titre_poste}`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn ? `Your offer "${offre.titre_poste}" is now live` : `Votre offre « ${offre.titre_poste} » est en ligne`,
      title: isEn ? 'Job Offer Created Successfully' : 'Offre créée avec succès',
      subtitle: offre.titre_poste,
      bodyHtml: body,
      ctaLabel: isEn ? '🔗 Open application link' : '🔗 Ouvrir le lien de candidature',
      ctaUrl: applicationLink,
    }),
  });
  console.log(`[EMAIL] Job offer email sent to ${offre.email_recruteur}`);
}

// ── Acknowledgment email: confirmation to candidate ──
async function sendAcknowledgmentEmail({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const thankYouMessage = offre.formule_remerciement || (
    isEn
      ? 'Thank you for your interest in our company.'
      : 'Nous vous remercions de l\'intérêt que vous portez à notre entreprise.'
  );
  const body = isEn
    ? `<p style="margin:0 0 14px">Hello <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 14px">${thankYouMessage}</p>
       <p style="margin:0 0 6px">We have received your application for the position of <strong>${offre.titre_poste}</strong>.</p>
       ${detailTable([
         ['Position', offre.titre_poste],
         ['Contract', offre.type_contrat],
         ['Location', offre.localisation],
       ])}
       <p style="margin:6px 0 0;color:#64748b;font-size:13px">Our team will review your file as soon as possible. You will be contacted if your profile matches our needs.</p>`
    : `<p style="margin:0 0 14px">Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 14px">${thankYouMessage}</p>
       <p style="margin:0 0 6px">Nous avons bien reçu votre candidature pour le poste de <strong>${offre.titre_poste}</strong>.</p>
       ${detailTable([
         ['Poste', offre.titre_poste],
         ['Contrat', offre.type_contrat],
         ['Localisation', offre.localisation],
       ])}
       <p style="margin:6px 0 0;color:#64748b;font-size:13px">Notre équipe examinera votre dossier dans les meilleurs délais. Vous serez recontacté(e) si votre profil correspond à nos besoins.</p>`;
  await transporter.sendMail({
    from:    fromHeader(offre.company),
    replyTo: offre.email_recruteur,
    to:      candidature.candidat_email,
    subject: isEn
      ? `📩 Application received — ${offre.titre_poste}`
      : `📩 Candidature reçue — ${offre.titre_poste}`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn
        ? `Your application for ${offre.titre_poste} has been received`
        : `Votre candidature pour ${offre.titre_poste} a bien été reçue`,
      title: isEn ? 'Application Received ✅' : 'Candidature bien reçue ✅',
      subtitle: offre.titre_poste,
      bodyHtml: body,
    }),
  });
  console.log(`[EMAIL] Acknowledgment sent to ${candidature.candidat_email}`);
}

// ── Interview invitation + recruiter notification ──
async function sendQualificationEmails({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const appointmentLink = withGuest(offre.lien_rdv || offre.lien_calendar || '#', offre.email_recruteur);

  if (candidature.candidat_email) {
    const body = isEn
      ? `<p style="margin:0 0 14px">Hello <strong>${candidature.candidat_nom}</strong>,</p>
         <p style="margin:0 0 14px">Following our review of your application for the position of <strong>${offre.titre_poste}</strong>, we would like to invite you to an interview.</p>
         <p style="margin:0 0 6px">Please book the time slot that suits you best by clicking the button below.</p>
         <p style="margin:14px 0 0;color:#64748b;font-size:13px">⏳ Please book your slot within <strong>48 hours</strong>.</p>`
      : `<p style="margin:0 0 14px">Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
         <p style="margin:0 0 14px">Suite à l'examen de votre candidature pour le poste de <strong>${offre.titre_poste}</strong>, nous souhaitons vous rencontrer dans le cadre d'un entretien.</p>
         <p style="margin:0 0 6px">Merci de réserver le créneau qui vous convient le mieux en cliquant sur le bouton ci-dessous.</p>
         <p style="margin:14px 0 0;color:#64748b;font-size:13px">⏳ Merci de réserver votre créneau dans les <strong>48 heures</strong>.</p>`;
    await transporter.sendMail({
      from:    fromHeader(offre.company),
      replyTo: offre.email_recruteur,
      to:      candidature.candidat_email,
      subject: isEn
        ? `📅 Interview invitation — ${offre.titre_poste}`
        : `📅 Invitation à un entretien — ${offre.titre_poste}`,
      html: emailLayout({
        company: offre.company,
        preheader: isEn
          ? `Interview invitation for ${offre.titre_poste}`
          : `Invitation à un entretien pour le poste de ${offre.titre_poste}`,
        title: isEn ? 'Interview Invitation' : 'Invitation à un entretien',
        subtitle: offre.titre_poste,
        bodyHtml: body,
        ctaLabel: isEn ? '📅 Schedule my interview' : '📅 Planifier mon entretien',
        ctaUrl: appointmentLink,
      }),
    });
  }

  const b = getBranding(offre.company);
  const recruiterBody = isEn
    ? `<p style="margin:0 0 14px">A candidate has just been <strong style="color:${b.colorDark}">qualified</strong> for the <strong>${offre.titre_poste}</strong> position.</p>
       ${detailTable([
         ['Name', candidature.candidat_nom],
         ['Email', candidature.candidat_email || '—'],
         ['Phone', candidature.candidat_telephone || '—'],
         ['Score', `<strong style="color:${b.colorDark}">${candidature.score ?? 'N/A'}/10</strong>`],
         ['Position', offre.titre_poste],
       ])}`
    : `<p style="margin:0 0 14px">Un candidat vient d'être <strong style="color:${b.colorDark}">qualifié</strong> pour l'offre <strong>${offre.titre_poste}</strong>.</p>
       ${detailTable([
         ['Nom', candidature.candidat_nom],
         ['Email', candidature.candidat_email || '—'],
         ['Téléphone', candidature.candidat_telephone || '—'],
         ['Score', `<strong style="color:${b.colorDark}">${candidature.score ?? 'N/A'}/10</strong>`],
         ['Poste', offre.titre_poste],
       ])}`;
  await transporter.sendMail({
    from: fromHeader(offre.company),
    to: offre.email_recruteur,
    subject: isEn
      ? `🟢 Candidate qualified — ${candidature.candidat_nom} (${candidature.score ?? '?'}/10)`
      : `🟢 Candidat qualifié — ${candidature.candidat_nom} (${candidature.score ?? '?'}/10)`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn
        ? `${candidature.candidat_nom} has been qualified`
        : `${candidature.candidat_nom} a été qualifié(e)`,
      title: isEn ? 'Candidate Qualified 🟢' : 'Candidat qualifié 🟢',
      subtitle: candidature.candidat_nom,
      bodyHtml: recruiterBody,
    }),
  });

  console.log(`[EMAIL] Qualification emails sent for ${candidature.candidat_nom}`);
}

// ── Interview reminder (D+2 and D+4 after invitation) ──
async function sendInterviewReminder({ candidature, offre, numRelance = 1 }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const appointmentLink = withGuest(offre.lien_rdv || offre.lien_calendar || '#', offre.email_recruteur);
  const lastWarning = numRelance >= 2
    ? (isEn
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;color:#c2410c;font-size:13px"><strong>⚠️ Final reminder:</strong> if we do not hear from you within 48h, your application will be archived.</td></tr></table>`
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;color:#c2410c;font-size:13px"><strong>⚠️ Dernier rappel :</strong> sans réponse de votre part sous 48h, votre candidature sera archivée.</td></tr></table>`)
    : '';
  const body = isEn
    ? `<p style="margin:0 0 14px">Hello <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 6px">We had invited you to schedule an interview for the position of <strong>${offre.titre_poste}</strong>, but we have not yet received your booking.</p>
       ${lastWarning}`
    : `<p style="margin:0 0 14px">Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 6px">Nous vous avions invité(e) à planifier votre entretien pour le poste de <strong>${offre.titre_poste}</strong>, mais nous n'avons pas encore reçu votre réservation.</p>
       ${lastWarning}`;
  await transporter.sendMail({
    from:    fromHeader(offre.company),
    replyTo: offre.email_recruteur,
    to:      candidature.candidat_email,
    subject: isEn
      ? `⏰ Reminder (${numRelance}/2) — Schedule your interview for ${offre.titre_poste}`
      : `⏰ Rappel (${numRelance}/2) — Planifiez votre entretien pour ${offre.titre_poste}`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn
        ? `Reminder: schedule your interview for ${offre.titre_poste}`
        : `Rappel : planifiez votre entretien pour ${offre.titre_poste}`,
      title: isEn ? 'Interview to Schedule ⏰' : 'Entretien à planifier ⏰',
      subtitle: isEn ? `Reminder ${numRelance}/2` : `Rappel ${numRelance}/2`,
      bodyHtml: body,
      ctaLabel: isEn ? '📅 Book my slot' : '📅 Réserver mon créneau',
      ctaUrl: appointmentLink,
    }),
  });
  console.log(`[EMAIL] Reminder ${numRelance} sent to ${candidature.candidat_email}`);
}

// ── Test summons ──
async function sendTestSummons({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const testDateStr = offre.test_date
    ? new Date(offre.test_date).toLocaleDateString(isEn ? 'en-GB' : 'fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : (isEn ? 'To be defined' : 'À définir');

  if (candidature.candidat_email) {
    const body = isEn
      ? `<p style="margin:0 0 14px">Hello <strong>${candidature.candidat_nom}</strong>,</p>
         <p style="margin:0 0 6px">Your application for the position of <strong>${offre.titre_poste}</strong> has been pre-selected. We invite you to participate in our recruitment test.</p>
         ${detailTable([
           ['📅 Date', testDateStr],
           offre.test_heure ? ['🕐 Time', offre.test_heure] : null,
           offre.test_lieu ? ['📍 Location', offre.test_lieu] : null,
         ])}
         <p style="margin:6px 0 0;color:#64748b;font-size:13px">Please come with a valid ID and any document supporting your career history.</p>`
      : `<p style="margin:0 0 14px">Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
         <p style="margin:0 0 6px">Votre candidature pour le poste de <strong>${offre.titre_poste}</strong> a été présélectionnée. Nous vous invitons à participer à notre test de recrutement.</p>
         ${detailTable([
           ['📅 Date', testDateStr],
           offre.test_heure ? ['🕐 Heure', offre.test_heure] : null,
           offre.test_lieu ? ['📍 Lieu', offre.test_lieu] : null,
         ])}
         <p style="margin:6px 0 0;color:#64748b;font-size:13px">Veuillez vous présenter muni(e) d'une pièce d'identité et de tout document justifiant votre parcours.</p>`;
    await transporter.sendMail({
      from:    fromHeader(offre.company),
      replyTo: offre.email_recruteur,
      to:      candidature.candidat_email,
      subject: isEn
        ? `📋 Test summons — ${offre.titre_poste}`
        : `📋 Convocation test — ${offre.titre_poste}`,
      html: emailLayout({
        company: offre.company,
        preheader: isEn
          ? `Test summons — ${offre.titre_poste}`
          : `Convocation au test de recrutement — ${offre.titre_poste}`,
        title: isEn ? 'Test Summons 📋' : 'Convocation au test 📋',
        subtitle: offre.titre_poste,
        bodyHtml: body,
      }),
    });
  }

  const detailLine = `${testDateStr}${offre.test_heure ? ` ${isEn ? 'at' : 'à'} ${offre.test_heure}` : ''}${offre.test_lieu ? ` — ${offre.test_lieu}` : ''}`;
  const recruiterBody = isEn
    ? `<p style="margin:0 0 14px">The test summons has been sent to <strong>${candidature.candidat_nom}</strong> for the position <strong>${offre.titre_poste}</strong>.</p>
       ${detailTable([['Test scheduled', detailLine]])}`
    : `<p style="margin:0 0 14px">La convocation au test a été envoyée à <strong>${candidature.candidat_nom}</strong> pour le poste <strong>${offre.titre_poste}</strong>.</p>
       ${detailTable([['Test prévu', detailLine]])}`;
  await transporter.sendMail({
    from: fromHeader(offre.company),
    to: offre.email_recruteur,
    subject: isEn
      ? `📋 Test summons sent — ${candidature.candidat_nom} / ${offre.titre_poste}`
      : `📋 Test convoqué — ${candidature.candidat_nom} / ${offre.titre_poste}`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn
        ? `Test summons sent for ${candidature.candidat_nom}`
        : `Test convoqué pour ${candidature.candidat_nom}`,
      title: isEn ? 'Summons Sent 📋' : 'Convocation envoyée 📋',
      subtitle: candidature.candidat_nom,
      bodyHtml: recruiterBody,
    }),
  });

  console.log(`[EMAIL] Test summons sent for ${candidature.candidat_nom}`);
}

// ── Rejection email ──
async function sendRejectionEmail({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  const isEn = getLanguage(offre.company) === 'en';
  const body = isEn
    ? `<p style="margin:0 0 14px">Hello <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 14px">Thank you for your interest in our company and for the time you dedicated to your application for the position of <strong>${offre.titre_poste}</strong>.</p>
       <p style="margin:0 0 14px">After careful review of your file, we regret to inform you that we are unable to pursue your application for this position.</p>
       <p style="margin:0 0 14px">This decision does not reflect on your skills. We will keep your file on record and will reach out if an opportunity matching your profile arises.</p>
       <p style="margin:0">We wish you the best in your job search.</p>`
    : `<p style="margin:0 0 14px">Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
       <p style="margin:0 0 14px">Nous vous remercions de l'intérêt que vous portez à notre entreprise et du temps consacré à votre candidature pour le poste de <strong>${offre.titre_poste}</strong>.</p>
       <p style="margin:0 0 14px">Après examen attentif de votre dossier, nous avons le regret de vous informer que nous ne pouvons pas donner une suite favorable à votre candidature pour ce poste.</p>
       <p style="margin:0 0 14px">Cette décision ne remet nullement en cause vos compétences. Nous conservons votre dossier et reviendrons vers vous si une opportunité correspondant à votre profil se présente.</p>
       <p style="margin:0">Nous vous souhaitons pleine réussite dans vos recherches.</p>`;
  await transporter.sendMail({
    from:    fromHeader(offre.company),
    replyTo: offre.email_recruteur,
    to:      candidature.candidat_email,
    subject: isEn
      ? `Regarding your application — ${offre.titre_poste}`
      : `Suite de votre candidature — ${offre.titre_poste}`,
    html: emailLayout({
      company: offre.company,
      preheader: isEn
        ? `Regarding your application for ${offre.titre_poste}`
        : `Suite de votre candidature pour ${offre.titre_poste}`,
      title: isEn ? 'Regarding your application' : 'Suite de votre candidature',
      subtitle: offre.titre_poste,
      bodyHtml: body,
    }),
  });
  console.log(`[EMAIL] Rejection email sent to ${candidature.candidat_email}`);
}

// ── New user credentials ──
async function sendCredentialsEmail({ nom, email, password, loginUrl, company }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const isEn = getLanguage(company) === 'en';
  const body = isEn
    ? `<p style="margin:0 0 14px">Hello <strong>${nom}</strong>,</p>
       <p style="margin:0 0 6px">Your administrator account has been created. Here are your login credentials:</p>
       ${detailTable([
         ['Email', email],
         ['Password', `<span style="font-family:monospace;font-size:15px;font-weight:700">${password}</span>`],
       ])}
       <p style="margin:6px 0 0;color:#94a3b8;font-size:12px">🔒 For your security, we recommend changing your password after your first login.</p>`
    : `<p style="margin:0 0 14px">Bonjour <strong>${nom}</strong>,</p>
       <p style="margin:0 0 6px">Votre compte administrateur a été créé. Voici vos identifiants de connexion :</p>
       ${detailTable([
         ['Email', email],
         ['Mot de passe', `<span style="font-family:monospace;font-size:15px;font-weight:700">${password}</span>`],
       ])}
       <p style="margin:6px 0 0;color:#94a3b8;font-size:12px">🔒 Pour votre sécurité, nous vous recommandons de modifier votre mot de passe après votre première connexion.</p>`;
  await transporter.sendMail({
    from: fromHeader(company),
    to: email,
    subject: isEn
      ? `🎉 Welcome to the HR platform — ${getBranding(company).name}`
      : `🎉 Bienvenue sur la plateforme RH — ${getBranding(company).name}`,
    html: emailLayout({
      company,
      preheader: isEn ? 'Your login credentials for the HR platform' : 'Vos identifiants de connexion à la plateforme RH',
      title: isEn ? `Welcome, ${nom}! 🎉` : `Bienvenue, ${nom} ! 🎉`,
      subtitle: isEn ? 'Your access to the HR platform' : 'Votre accès à la plateforme RH',
      bodyHtml: body,
      ctaLabel: isEn ? 'Log in' : 'Se connecter',
      ctaUrl: loginUrl,
    }),
  });
  console.log(`[EMAIL] Credentials sent to ${email}`);
}

// ── Password reset ──
async function sendPasswordResetEmail({ nom, email, resetUrl, company }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const isEn = getLanguage(company) === 'en';
  const body = isEn
    ? `<p style="margin:0 0 14px">Hello <strong>${nom}</strong>,</p>
       <p style="margin:0 0 6px">You have requested to reset your password. Click the button below to choose a new one.</p>
       <p style="margin:14px 0 0;color:#94a3b8;font-size:13px">This link is valid for <strong>1 hour</strong>. If you did not make this request, simply ignore this email.</p>`
    : `<p style="margin:0 0 14px">Bonjour <strong>${nom}</strong>,</p>
       <p style="margin:0 0 6px">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
       <p style="margin:14px 0 0;color:#94a3b8;font-size:13px">Ce lien est valable <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>`;
  await transporter.sendMail({
    from: fromHeader(company),
    to: email,
    subject: isEn ? '🔒 Password reset request' : '🔒 Réinitialisation de votre mot de passe',
    html: emailLayout({
      company,
      preheader: isEn ? 'Reset your password' : 'Réinitialisez votre mot de passe',
      title: isEn ? 'Password Reset 🔒' : 'Réinitialisation du mot de passe 🔒',
      bodyHtml: body,
      ctaLabel: isEn ? 'Reset my password' : 'Réinitialiser mon mot de passe',
      ctaUrl: resetUrl,
    }),
  });
  console.log(`[EMAIL] Password reset sent to ${email}`);
}

module.exports = {
  sendJobOfferEmail,
  sendAcknowledgmentEmail,
  sendQualificationEmails,
  sendInterviewReminder,
  sendTestSummons,
  sendRejectionEmail,
  sendCredentialsEmail,
  sendPasswordResetEmail,
  getBranding,
  getLanguage,
  withGuest,
  emailLayout,
  detailTable,
};
