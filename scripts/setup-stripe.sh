#!/usr/bin/env bash
# Triskell Lanceur — setup Stripe en 1 commande
# Usage : bash scripts/setup-stripe.sh
#
# Prerequis : avoir cree dans Stripe Dashboard (mode Live) :
#   - Un produit "Pack Table Ronde — 4 outils" avec un prix unique 89 €
#   - Un produit "Pack Table Ronde — 3 outils" avec un prix unique 69 €
#   - Un produit "Pack Table Ronde — 2 outils" avec un prix unique 49 €
#   - Recupere les 3 IDs de prix (price_xxxxxxxxxxxxxx)
#   - Active le Customer Portal Stripe (Settings > Billing > Customer portal)
#   - Cree un webhook qui pointe sur https://api.triskell-studio.fr/api/webhook-bundle
#     avec l'evenement checkout.session.completed
#   - Note le webhook signing secret (whsec_xxxxxxxxxxxxxx)

set -euo pipefail

cd "$(dirname "$0")/../backend" || { echo "Lance ce script depuis n'importe ou — il bascule auto sur backend/"; exit 1; }

echo ""
echo "🛡️  Setup Stripe pour Triskell Lanceur"
echo "------------------------------------"
echo ""
read -p "Stripe SECRET KEY (sk_live_...) : " STRIPE_KEY
read -p "Price ID pack 4 outils (price_...) : " P4
read -p "Price ID pack 3 outils (price_...) : " P3
read -p "Price ID pack 2 outils (price_...) : " P2
read -p "Webhook signing secret (whsec_...) : " WH

echo ""
echo "On configure Netlify..."
netlify env:set STRIPE_SECRET_KEY            "$STRIPE_KEY"
netlify env:set STRIPE_BUNDLE_PRICE_4        "$P4"
netlify env:set STRIPE_BUNDLE_PRICE_3        "$P3"
netlify env:set STRIPE_BUNDLE_PRICE_2        "$P2"
netlify env:set STRIPE_BUNDLE_WEBHOOK_SECRET "$WH"

echo ""
echo "On redeploie..."
netlify deploy --prod --no-build

echo ""
echo "✅ Done. Test : ouvre le Lanceur → connecte-toi avec un user qui a 1+ licence,"
echo "   le bundle 'Compléter ta Table' doit s'afficher et fonctionner."
