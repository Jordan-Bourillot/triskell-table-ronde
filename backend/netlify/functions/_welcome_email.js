// Template email de bienvenue (envoye par /api/verify a la 1ere connexion).
//
// Meme charte que _login_email.js (logo Triskell, gold/violet, dark) mais
// contenu plus riche : presentation rapide des 4 produits + CTA telecharger
// La Table Ronde.

'use strict';

const { LOGO_B64 } = require('./_email_assets');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function welcomeText(email) {
  return `Bienvenue à La Table Ronde !

Tu viens de rejoindre Triskell Studio avec ${email}.

Pour commencer :
  1. Télécharge La Table Ronde sur https://app.triskell-studio.fr
  2. Connecte-toi avec cet email (un code à 6 chiffres comme à l'instant — pas de mot de passe).
  3. Tes licences apparaissent automatiquement, tu cliques "Installer".

Les compagnons disponibles :
  - Suite des Héros (27 €) — 11 outils desktop
    https://productivite.triskell-studio.fr
  - DéliNote (79 €) — notes Markdown nouvelle génération
    https://delinote.triskell-studio.fr
  - Le Studio PDF (39 €) — fusion / split / OCR
    https://studio-pdf.triskell-studio.fr
  - Bobeez (27 €) — gestionnaire d'images moderne
    https://bobeez.triskell-studio.fr

Une question, un bug, une suggestion ? Réponds simplement à cet email,
c'est moi (Jordan) qui te lirai.

— Triskell Studio
https://triskell-studio.fr
`;
}

function welcomeHtml(email) {
  const safe = escapeHtml(email);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bienvenue à La Table Ronde</title>
</head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ecebf5;-webkit-font-smoothing:antialiased;">

  <div style="padding:40px 16px;background:radial-gradient(ellipse at top,#1a1f2e 0%,#0a0c12 60%);">

    <div style="max-width:560px;margin:0 auto;background:linear-gradient(180deg,#161a23 0%,#13161e 100%);border:1px solid rgba(212,179,90,0.18);border-radius:16px;padding:40px 36px;box-shadow:0 12px 40px rgba(0,0,0,0.4);">

      <!-- Logo + halo dore -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;padding:8px;background:radial-gradient(circle,rgba(212,179,90,0.18) 0%,transparent 70%);border-radius:50%;">
          <img src="data:image/png;base64,${LOGO_B64}"
               width="72" height="72" alt="Triskell"
               style="display:block;width:72px;height:72px;border-radius:14px;" />
        </div>
      </div>

      <!-- Titre principal -->
      <h1 style="font-family:'Cinzel',Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;letter-spacing:1.2px;color:#e6cd87;text-align:center;margin:0 0 6px;">
        Bienvenue à la Table
      </h1>
      <p style="text-align:center;color:#9da3b3;font-size:14px;margin:0 0 30px;letter-spacing:0.3px;">
        Tu viens d'être adoubé compagnon.
      </p>

      <!-- Intro -->
      <p style="font-size:15px;line-height:1.6;color:#ecebf5;margin:0 0 24px;">
        Tu as rejoint Triskell Studio avec
        <strong style="color:#e6cd87;">${safe}</strong>. Voici comment t'installer :
      </p>

      <!-- 3 etapes -->
      <ol style="padding-left:0;margin:0 0 28px;list-style:none;counter-reset:step;">
        <li style="position:relative;padding:10px 0 10px 44px;font-size:14px;color:#ecebf5;line-height:1.5;border-bottom:1px solid rgba(255,255,255,0.04);counter-increment:step;">
          <span style="position:absolute;left:0;top:10px;width:30px;height:30px;background:linear-gradient(135deg,#d4b35a,#a78bfa);color:#0d0f17;border-radius:50%;text-align:center;line-height:30px;font-weight:700;font-size:13px;">1</span>
          Télécharge <strong style="color:#fff;">La Table Ronde</strong> sur
          <a href="https://app.triskell-studio.fr" style="color:#a78bfa;text-decoration:none;">app.triskell-studio.fr</a>
        </li>
        <li style="position:relative;padding:10px 0 10px 44px;font-size:14px;color:#ecebf5;line-height:1.5;border-bottom:1px solid rgba(255,255,255,0.04);counter-increment:step;">
          <span style="position:absolute;left:0;top:10px;width:30px;height:30px;background:linear-gradient(135deg,#d4b35a,#a78bfa);color:#0d0f17;border-radius:50%;text-align:center;line-height:30px;font-weight:700;font-size:13px;">2</span>
          Connecte-toi avec <strong style="color:#fff;">cet email</strong> — un code à 6 chiffres, pas de mot de passe.
        </li>
        <li style="position:relative;padding:10px 0 10px 44px;font-size:14px;color:#ecebf5;line-height:1.5;counter-increment:step;">
          <span style="position:absolute;left:0;top:10px;width:30px;height:30px;background:linear-gradient(135deg,#d4b35a,#a78bfa);color:#0d0f17;border-radius:50%;text-align:center;line-height:30px;font-weight:700;font-size:13px;">3</span>
          Tes licences apparaissent automatiquement. Tu cliques <strong style="color:#fff;">Installer</strong>.
        </li>
      </ol>

      <!-- CTA principal -->
      <p style="text-align:center;margin:0 0 32px;">
        <a href="https://app.triskell-studio.fr"
           style="display:inline-block;background:linear-gradient(135deg,#e6cd87,#d4b35a 50%,#f97316 130%);color:#1a1408;text-decoration:none;font-weight:700;padding:14px 36px;border-radius:10px;font-size:15px;letter-spacing:0.3px;box-shadow:0 0 0 1px rgba(212,179,90,0.30),0 8px 22px rgba(212,179,90,0.30);">
          Télécharger La Table Ronde →
        </a>
      </p>

      <!-- Separateur dore -->
      <div style="height:1px;background:linear-gradient(90deg,transparent 0%,rgba(212,179,90,0.30) 50%,transparent 100%);margin:0 0 24px;"></div>

      <!-- Liste des compagnons -->
      <h2 style="font-family:'Cinzel',Georgia,'Times New Roman',serif;font-size:16px;font-weight:600;color:#e6cd87;text-align:center;margin:0 0 18px;letter-spacing:0.8px;text-transform:uppercase;">
        Les compagnons à ta disposition
      </h2>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#ecebf5;">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:12px 0;">
            <strong>Suite des Héros</strong><br>
            <span style="color:#9da3b3;font-size:12px;">11 outils desktop pour ranger, renommer, sécuriser</span>
          </td>
          <td style="padding:12px 0;text-align:right;">
            <a href="https://productivite.triskell-studio.fr" style="color:#e6cd87;text-decoration:none;font-weight:700;">27 €</a>
          </td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:12px 0;">
            <strong>DéliNote</strong><br>
            <span style="color:#9da3b3;font-size:12px;">Notes Markdown sans abonnement, à vie</span>
          </td>
          <td style="padding:12px 0;text-align:right;">
            <a href="https://delinote.triskell-studio.fr" style="color:#e6cd87;text-decoration:none;font-weight:700;">79 €</a>
          </td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:12px 0;">
            <strong>Le Studio PDF</strong><br>
            <span style="color:#9da3b3;font-size:12px;">Fusion, split, OCR, signature</span>
          </td>
          <td style="padding:12px 0;text-align:right;">
            <a href="https://studio-pdf.triskell-studio.fr" style="color:#e6cd87;text-decoration:none;font-weight:700;">39 €</a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;">
            <strong>Bobeez</strong><br>
            <span style="color:#9da3b3;font-size:12px;">Gestionnaire d'images calendrier + carte</span>
          </td>
          <td style="padding:12px 0;text-align:right;">
            <a href="https://bobeez.triskell-studio.fr" style="color:#e6cd87;text-decoration:none;font-weight:700;">27 €</a>
          </td>
        </tr>
      </table>

      <p style="font-size:12px;color:#9da3b3;text-align:center;margin:24px 0 0;line-height:1.5;">
        Bundle <em>Compléter ta Table</em> dispo dans le lanceur — jusqu'à <strong style="color:#e6cd87;">−35 %</strong> si tu prends plusieurs outils.
      </p>

      <!-- Separateur dore -->
      <div style="height:1px;background:linear-gradient(90deg,transparent 0%,rgba(212,179,90,0.30) 50%,transparent 100%);margin:24px 0;"></div>

      <!-- Footer chaleureux -->
      <p style="font-size:13px;color:#9da3b3;text-align:center;margin:0 0 6px;line-height:1.6;">
        Une question, un bug, une suggestion ?<br>
        <strong style="color:#ecebf5;">Réponds simplement à cet email</strong> — c'est moi (Jordan) qui te lirai.
      </p>

      <p style="font-size:11px;color:#6b7180;text-align:center;margin:18px 0 0;">
        <a href="https://triskell-studio.fr" style="color:#a78bfa;text-decoration:none;">triskell-studio.fr</a>
        · Tu peux te désinscrire depuis La Table Ronde &gt; Mon compte &gt; Zone sensible
      </p>

    </div>

  </div>

</body>
</html>`;
}

module.exports = { welcomeText, welcomeHtml };
