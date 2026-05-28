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

// ── Recruiter notification: job offer created ──
async function sendJobOfferEmail({ offre, applicationLink }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: offre.email_recruteur,
    subject: `✅ Offre créée — ${offre.titre_poste}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #dcfce7;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#15803d,#16a34a);padding:24px;text-align:center">
        <h2 style="color:#fff;margin:0">Offre créée !</h2>
      </div>
      <div style="padding:24px">
        <table style="border-collapse:collapse;width:100%;margin:15px 0">
          <tr><td style="padding:10px;border:1px solid #dcfce7;background:#f0fdf4;font-weight:bold;color:#14532d;width:35%">Poste</td><td style="padding:10px;border:1px solid #dcfce7">${offre.titre_poste}</td></tr>
          <tr><td style="padding:10px;border:1px solid #dcfce7;background:#f0fdf4;font-weight:bold;color:#14532d">Contrat</td><td style="padding:10px;border:1px solid #dcfce7">${offre.type_contrat}</td></tr>
          <tr><td style="padding:10px;border:1px solid #dcfce7;background:#f0fdf4;font-weight:bold;color:#14532d">Localisation</td><td style="padding:10px;border:1px solid #dcfce7">${offre.localisation}</td></tr>
          <tr><td style="padding:10px;border:1px solid #dcfce7;background:#f0fdf4;font-weight:bold;color:#14532d">ID Offre</td><td style="padding:10px;border:1px solid #dcfce7">${offre.offre_id}</td></tr>
        </table>
        <h3 style="color:#15803d;text-align:center">Lien de candidature</h3>
        <p style="text-align:center;margin:20px 0">
          <a href="${applicationLink}" style="background:#15803d;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold">Partager le lien</a>
        </p>
        <p style="background:#f0fdf4;padding:12px;border-radius:8px;word-break:break-all;font-size:12px;color:#166534">${applicationLink}</p>
      </div>
    </div>`,
  });
  console.log(`[EMAIL] Job offer email sent to ${offre.email_recruteur}`);
}

// ── Acknowledgment email: confirmation to candidate ──
async function sendAcknowledgmentEmail({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  const thankYouMessage = offre.formule_remerciement || 'Nous vous remercions de l\'intérêt que vous portez à notre entreprise.';
  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: candidature.candidat_email,
    subject: `📩 Candidature reçue — ${offre.titre_poste}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0f2fe;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0369a1,#0284c7);padding:24px;text-align:center">
        <h2 style="color:#fff;margin:0">Candidature reçue ✅</h2>
      </div>
      <div style="padding:24px;background:#fff">
        <p>Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
        <p>${thankYouMessage}</p>
        <p>Nous avons bien reçu votre candidature pour le poste de <strong>${offre.titre_poste}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;background:#f8fafc;border-radius:8px">
          <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#374151;width:40%">Poste</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${offre.titre_poste}</td></tr>
          <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#374151">Contrat</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${offre.type_contrat}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:600;color:#374151">Localisation</td><td style="padding:10px 14px">${offre.localisation}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px">Notre équipe examinera votre dossier dans les meilleurs délais. Vous serez recontacté(e) si votre profil correspond à nos besoins.</p>
        <br><p>Cordialement,<br><strong>L'équipe Recrutement</strong></p>
      </div>
    </div>`,
  });
  console.log(`[EMAIL] Acknowledgment sent to ${candidature.candidat_email}`);
}

// ── Interview invitation + recruiter notification ──
async function sendQualificationEmails({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const appointmentLink = offre.lien_rdv || offre.lien_calendar || '#';

  if (candidature.candidat_email) {
    await transporter.sendMail({
      from: `"Recrutement" <${process.env.EMAIL_USER}>`,
      to: candidature.candidat_email,
      subject: `📅 Invitation entretien — ${offre.titre_poste}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#15803d,#16a34a);padding:24px;text-align:center;border-radius:12px 12px 0 0">
          <h2 style="color:#fff;margin:0">Félicitations !</h2>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #dcfce7;border-radius:0 0 12px 12px">
          <p>Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
          <p>Après analyse de votre candidature pour <strong>${offre.titre_poste}</strong>, nous souhaitons vous inviter à un entretien.</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${appointmentLink}" style="background:#15803d;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold">📅 Planifier mon entretien</a>
          </p>
          <p>Merci de réserver un créneau dans les <strong>48 heures</strong>.</p>
          <br><p>Cordialement,<br><strong>L'équipe Recrutement</strong></p>
        </div>
      </div>`,
    });
  }

  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: offre.email_recruteur,
    subject: `🟢 Candidat qualifié — ${candidature.candidat_nom} (${candidature.score ?? '?'}/10)`,
    html: `<div style="font-family:Arial,sans-serif;max-width:700px">
      <h2 style="color:#16a34a">🟢 Candidat qualifié</h2>
      <table style="border-collapse:collapse;width:100%;margin:15px 0">
        <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;font-weight:bold;width:35%">Nom</td><td style="padding:8px;border:1px solid #ddd">${candidature.candidat_nom}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd">${candidature.candidat_email || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;font-weight:bold">Téléphone</td><td style="padding:8px;border:1px solid #ddd">${candidature.candidat_telephone || '—'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;font-weight:bold">Score IA</td><td style="padding:8px;border:1px solid #ddd"><strong style="color:#16a34a">${candidature.score ?? 'N/A'}/10</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;font-weight:bold">Poste</td><td style="padding:8px;border:1px solid #ddd">${offre.titre_poste}</td></tr>
      </table>
    </div>`,
  });

  console.log(`[EMAIL] Qualification emails sent for ${candidature.candidat_nom}`);
}

// ── Interview reminder (D+2 and D+4 after invitation) ──
async function sendInterviewReminder({ candidature, offre, numRelance = 1 }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  const appointmentLink = offre.lien_rdv || offre.lien_calendar || '#';
  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: candidature.candidat_email,
    subject: `⏰ Rappel (${numRelance}/2) — Planifiez votre entretien pour ${offre.titre_poste}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #fde68a;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:24px;text-align:center">
        <h2 style="color:#fff;margin:0">Rappel — Entretien à planifier</h2>
      </div>
      <div style="padding:24px;background:#fff">
        <p>Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
        <p>Nous vous avions invité à planifier votre entretien pour le poste de <strong>${offre.titre_poste}</strong>. Nous n'avons pas encore reçu votre réservation.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${appointmentLink}" style="background:#d97706;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold">📅 Réserver maintenant</a>
        </p>
        ${numRelance >= 2 ? '<p style="color:#dc2626;font-size:13px"><strong>⚠️ Dernier rappel :</strong> Sans réponse de votre part dans les 48h, votre candidature sera archivée.</p>' : ''}
        <br><p>Cordialement,<br><strong>L'équipe Recrutement</strong></p>
      </div>
    </div>`,
  });
  console.log(`[EMAIL] Reminder ${numRelance} sent to ${candidature.candidat_email}`);
}

// ── Test summons ──
async function sendTestSummons({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  const testDateStr = offre.test_date
    ? new Date(offre.test_date).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    : 'À définir';

  if (candidature.candidat_email) {
    await transporter.sendMail({
      from: `"Recrutement" <${process.env.EMAIL_USER}>`,
      to: candidature.candidat_email,
      subject: `📋 Convocation test — ${offre.titre_poste}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #ddd6fe;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);padding:24px;text-align:center">
          <h2 style="color:#fff;margin:0">Convocation au test de recrutement</h2>
        </div>
        <div style="padding:24px;background:#fff">
          <p>Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
          <p>Votre candidature pour le poste de <strong>${offre.titre_poste}</strong> a été présélectionnée. Nous vous invitons à participer à notre test de recrutement.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;background:#f5f3ff;border-radius:8px">
            <tr><td style="padding:10px 14px;border-bottom:1px solid #ddd6fe;font-weight:600;color:#5b21b6;width:40%">📅 Date</td><td style="padding:10px 14px;border-bottom:1px solid #ddd6fe">${testDateStr}</td></tr>
            ${offre.test_heure ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #ddd6fe;font-weight:600;color:#5b21b6">🕐 Heure</td><td style="padding:10px 14px;border-bottom:1px solid #ddd6fe">${offre.test_heure}</td></tr>` : ''}
            ${offre.test_lieu ? `<tr><td style="padding:10px 14px;font-weight:600;color:#5b21b6">📍 Lieu</td><td style="padding:10px 14px">${offre.test_lieu}</td></tr>` : ''}
          </table>
          <p>Veuillez vous présenter muni(e) d'une pièce d'identité et de tout document justifiant votre parcours.</p>
          <br><p>Cordialement,<br><strong>L'équipe Recrutement</strong></p>
        </div>
      </div>`,
    });
  }

  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: offre.email_recruteur,
    subject: `📋 Test convoqué — ${candidature.candidat_nom} / ${offre.titre_poste}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#7c3aed">Convocation test envoyée</h2>
      <p>La convocation pour le test a été envoyée à <strong>${candidature.candidat_nom}</strong> pour le poste <strong>${offre.titre_poste}</strong>.</p>
      <p>Test prévu le <strong>${testDateStr}</strong>${offre.test_heure ? ` à ${offre.test_heure}` : ''}${offre.test_lieu ? ` — ${offre.test_lieu}` : ''}.</p>
    </div>`,
  });

  console.log(`[EMAIL] Test summons sent for ${candidature.candidat_nom}`);
}

// ── Rejection email ──
async function sendRejectionEmail({ candidature, offre }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  if (!candidature.candidat_email) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Recrutement" <${process.env.EMAIL_USER}>`,
    to: candidature.candidat_email,
    subject: `Suite de votre candidature — ${offre.titre_poste}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#374151,#4b5563);padding:24px;text-align:center">
        <h2 style="color:#fff;margin:0">Suite de votre candidature</h2>
      </div>
      <div style="padding:24px;background:#fff">
        <p>Bonjour <strong>${candidature.candidat_nom}</strong>,</p>
        <p>Nous vous remercions de l'intérêt que vous portez à notre entreprise et du temps consacré à votre candidature pour le poste de <strong>${offre.titre_poste}</strong>.</p>
        <p>Après examen attentif de votre dossier, nous avons le regret de vous informer que nous ne pouvons pas donner suite à votre candidature pour ce poste.</p>
        <p>Cette décision ne remet pas en cause vos compétences. Nous conservons votre dossier et n'hésiterons pas à vous recontacter si une opportunité correspondant à votre profil se présente.</p>
        <p>Nous vous souhaitons pleine réussite dans vos recherches.</p>
        <br><p>Cordialement,<br><strong>L'équipe Recrutement</strong></p>
      </div>
    </div>`,
  });
  console.log(`[EMAIL] Rejection email sent to ${candidature.candidat_email}`);
}

// ── New user credentials ──
async function sendCredentialsEmail({ nom, email, password, loginUrl, companyName }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Recrutement RH" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎉 Bienvenue sur la plateforme RH — ${companyName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:28px;text-align:center">
        <h2 style="color:#fff;margin:0">Bienvenue, ${nom} !</h2>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">${companyName} — Plateforme RH</p>
      </div>
      <div style="padding:28px;background:#fff">
        <p>Bonjour <strong>${nom}</strong>,</p>
        <p>Votre compte administrateur a été créé. Voici vos identifiants de connexion :</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 12px;font-weight:600;color:#64748b;width:40%">Email</td><td style="padding:8px 12px;font-weight:700;color:#0f172a">${email}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;color:#64748b">Mot de passe</td><td style="padding:8px 12px;font-weight:700;color:#0f172a;font-family:monospace;font-size:15px">${password}</td></tr>
          </table>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="background:#1e293b;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">Se connecter</a>
        </p>
        <p style="color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:16px">Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.</p>
      </div>
    </div>`,
  });
  console.log(`[EMAIL] Credentials sent to ${email}`);
}

// ── Password reset ──
async function sendPasswordResetEmail({ nom, email, resetUrl }) {
  if (!process.env.EMAIL_USER) return console.log('[EMAIL] Not configured — skipped');
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Recrutement RH" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🔒 Réinitialisation de votre mot de passe`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);padding:28px;text-align:center">
        <h2 style="color:#fff;margin:0">Réinitialisation du mot de passe</h2>
      </div>
      <div style="padding:28px;background:#fff">
        <p>Bonjour <strong>${nom}</strong>,</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous :</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" style="background:#7c3aed;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">Réinitialiser mon mot de passe</a>
        </p>
        <p style="color:#94a3b8;font-size:13px">Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      </div>
    </div>`,
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
};
