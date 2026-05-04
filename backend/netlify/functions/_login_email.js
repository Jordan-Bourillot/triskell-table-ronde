// Template email pour le code de connexion (envoye par /api/login).
//
// Design :
//  - Fond sombre, dégradé subtil
//  - Logo Triskell inliné en base64 via _email_assets (marche meme sur
//    Gmail qui bloque les images externes par defaut)
//  - Code 6 chiffres mis en valeur avec gradient gold
//  - Wording chaleureux Table Ronde
//  - Compatible clients mail (Gmail, Outlook, Apple Mail) :
//    pas de Cinzel (font web non chargee) -> fallback Georgia

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
  <title>Ton code Triskell</title>
</head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ecebf5;-webkit-font-smoothing:antialiased;">

  <div style="padding:40px 16px;background:radial-gradient(ellipse at top,#1a1f2e 0%,#0a0c12 60%);">

    <div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#161a23 0%,#13161e 100%);border:1px solid rgba(212,179,90,0.18);border-radius:16px;padding:40px 36px;box-shadow:0 12px 40px rgba(0,0,0,0.4);">

      <div style="text-align:center;margin-bottom:18px;">
        <div style="display:inline-block;padding:8px;background:radial-gradient(circle,rgba(212,179,90,0.18) 0%,transparent 70%);border-radius:50%;">
          <img src="data:image/png;base64,${LOGO_B64}"
               width="72" height="72" alt="Triskell"
               style="display:block;width:72px;height:72px;border-radius:14px;" />
        </div>
      </div>

      <h1 style="font-family:'Cinzel',Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:1.5px;color:#e6cd87;text-align:center;margin:0 0 6px;">
        La Table Ronde
      </h1>
      <p style="text-align:center;color:#9da3b3;font-size:13px;margin:0 0 32px;letter-spacing:0.4px;">
        Ton compagnon t'attend
      </p>

      <p style="font-size:15px;line-height:1.55;color:#ecebf5;margin:0 0 24px;text-align:center;">
        Voici ton sceau pour ouvrir la Table.<br>
        Recopie-le dans le lanceur :
      </p>

      <div style="text-align:center;margin:0 0 28px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#1a1f2e,#0d0f17);border:1px solid #d4b35a;border-radius:12px;padding:22px 32px;box-shadow:0 0 0 1px rgba(212,179,90,0.20),0 8px 24px rgba(212,179,90,0.10);">
          <div style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:14px;color:#e6cd87;text-indent:14px;">${code}</div>
        </div>
      </div>

      <p style="font-size:13px;color:#9da3b3;text-align:center;margin:0 0 32px;line-height:1.5;">
        Valable <strong style="color:#ecebf5;">15 minutes</strong>.<br>
        Si tu n'as rien demandé, ignore simplement cet email.
      </p>

      <div style="height:1px;background:linear-gradient(90deg,transparent 0%,rgba(212,179,90,0.30) 50%,transparent 100%);margin:0 0 24px;"></div>

      <p style="font-size:12px;color:#6b7180;text-align:center;margin:0;line-height:1.6;">
        <strong style="color:#9da3b3;">Triskell Studio</strong> — outils desktop pensés pour les pros et les bricoleurs.<br>
        <a href="https://triskell-studio.fr" style="color:#a78bfa;text-decoration:none;">triskell-studio.fr</a>
      </p>

    </div>

    <p style="max-width:520px;margin:18px auto 0;font-size:11px;color:#5a606b;text-align:center;line-height:1.5;">
      Cet email a été envoyé par Triskell Studio à la demande de quelqu'un<br>
      qui a tapé ton adresse dans La Table Ronde.
    </p>

  </div>

</body>
</html>`;
}

module.exports = { emailText, emailHtml };
