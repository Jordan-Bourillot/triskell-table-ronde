// Template email pour le code de connexion (envoyé par /api/login).
//
// Design :
//  - Fond sombre Triskell (Table Ronde), card navy avec accents or/champagne.
//  - Layout 100% table-based + attributs HTML `bgcolor` : Gmail, Outlook,
//    Apple Mail, Yahoo et Thunderbird respectent ces attributs même quand ils
//    strippent les `background` CSS sur <body> ou <div>. Sans ça, certains
//    clients rendaient l'email en blanc et le texte gris clair devenait
//    illisible.
//  - Logo Triskell inliné en base64 via _email_assets (marche même sur Gmail
//    qui bloque les images externes par défaut).
//  - Fallback police : 'Cinzel' (web font absent dans les emails) →
//    Georgia → Times New Roman → serif.
//  - Couleurs de texte renforcées (#f5f1e6 plutôt que #ecebf5,
//    #b8b0c0 plutôt que #9da3b3) pour le cas où un client ferait
//    une "auto dark→light inversion".

'use strict';

const { LOGO_B64 } = require('./_email_assets');

function emailText(code) {
  return `Bienvenue à la Table Ronde.

Ton code de connexion : ${code}

Recopie-le dans La Table Ronde pour te connecter.
Le code expire dans 15 minutes.

Si tu n'as rien demandé, ignore cet email.

— Triskell Studio
https://triskell-studio.fr
`;
}

function emailHtml(code) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Ton code Triskell</title>
</head>
<body bgcolor="#0a0c12" style="margin:0;padding:0;background-color:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f5f1e6;-webkit-font-smoothing:antialiased;">

  <!-- Outer table : force dark background même si <body> est ignoré -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0c12" style="background-color:#0a0c12;">
    <tr>
      <td align="center" bgcolor="#0a0c12" style="background-color:#0a0c12;padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#161a23" style="background-color:#161a23;border-radius:16px;max-width:520px;width:100%;border:1px solid #3a3320;">
          <tr>
            <td bgcolor="#161a23" style="background-color:#161a23;padding:40px 36px;">

              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:18px;">
                    <img src="data:image/png;base64,${LOGO_B64}"
                         width="72" height="72" alt="Triskell"
                         style="display:block;width:72px;height:72px;border-radius:14px;border:0;outline:none;text-decoration:none;" />
                  </td>
                </tr>
              </table>

              <!-- Titre -->
              <h1 style="font-family:'Cinzel',Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:1.5px;color:#e6cd87;text-align:center;margin:0 0 6px;">
                La Table Ronde
              </h1>
              <p style="font-family:Helvetica,Arial,sans-serif;text-align:center;color:#c9c0d0;font-size:13px;margin:0 0 32px;letter-spacing:0.4px;">
                Ton compagnon t'attend
              </p>

              <!-- Instruction -->
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#f5f1e6;margin:0 0 24px;text-align:center;">
                Voici ton sceau pour ouvrir la Table.<br>
                Recopie-le dans le lanceur :
              </p>

              <!-- Code -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d0f17" style="background-color:#0d0f17;border:2px solid #d4b35a;border-radius:12px;">
                      <tr>
                        <td bgcolor="#0d0f17" style="background-color:#0d0f17;padding:22px 32px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:14px;color:#e6cd87;text-indent:14px;mso-line-height-rule:exactly;line-height:1;">
                          ${code}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Validité -->
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#c9c0d0;text-align:center;margin:0 0 32px;line-height:1.5;">
                Valable <strong style="color:#f5f1e6;">15 minutes</strong>.<br>
                Si tu n'as rien demandé, ignore simplement cet email.
              </p>

              <!-- Séparateur -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:1px;background-color:#3a3320;line-height:1px;font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#a39aab;text-align:center;margin:24px 0 0;line-height:1.6;">
                <strong style="color:#e6cd87;">Triskell Studio</strong> — outils desktop pensés pour les pros et les bricoleurs.<br>
                <a href="https://triskell-studio.fr" style="color:#a78bfa;text-decoration:none;">triskell-studio.fr</a>
              </p>

            </td>
          </tr>
        </table>

        <!-- Disclaimer hors-card -->
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
          <tr>
            <td align="center" style="padding-top:18px;">
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#8a8395;text-align:center;line-height:1.5;margin:0;">
                Cet email a été envoyé par Triskell Studio à la demande de quelqu'un<br>
                qui a tapé ton adresse dans La Table Ronde.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { emailText, emailHtml };
