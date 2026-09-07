# Recharge Meru — design (2026-09-06, révision 2 après relecture)

## 1. Le problème

Meru (getmeru.com) donne à ses utilisateurs un compte en dollars US et des cartes
virtuelles Visa. Pour l'alimenter, Meru accepte des virements US/EU, PayPal,
cartes, Wise, crypto… mais **aucun moyen de paiement haïtien**. En Haïti, la
majorité des gens n'ont que **MonCash** (Digicel) et **NatCash** (Natcom), en
gourdes (HTG).

**Recharge Meru** est une plateforme indépendante, opérée par Stanley Wendel
Joseph, qui sert de pont : le client paie en gourdes via MonCash ou NatCash, et
l'opérateur envoie les dollars sur le compte Meru du client (transfert Meru →
Meru, gratuit dans l'app Meru). Meru n'expose pas d'API publique : **la
recharge finale est un geste manuel et irréversible de l'opérateur**, la
plateforme automatise tout le reste (devis, encaissement, vérification, suivi,
notifications) et protège ce geste.

Le site n'est **pas affilié à Meru** ni à Digicel/Natcom ; ce point est affiché
dans le pied de page, la page de suivi et les conditions.

Exigence de l'opérateur : **beau, professionnel, digne de confiance**.

## 2. Décisions figées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Framework | Next.js **16.3.4**, App Router, Turbopack, React 19.2, TypeScript strict | Conventions Next 16 : `proxy.ts`, `await params` / `await cookies()`, ESLint direct. |
| Style | Tailwind CSS 4 + composants maison, icônes `lucide-react` | Pas de kit UI externe. |
| Base de données | Postgres (Neon) via `@neondatabase/serverless` (neon-http) + Drizzle ORM 0.45 + drizzle-kit, migrations versionnées | neon-http **n'a pas de transactions** : toute transition d'état est un `UPDATE … WHERE status IN (…) RETURNING` (compare-and-set). |
| Validation | Zod 4 | Corps de requête, formulaires, paramètres. |
| i18n | `next-intl` 4, locales **`fr`** (défaut) et **`ht`** (Kreyòl) pour le site public ; admin en français hors segment de locale ; bascule Français / Kreyòl dans l'en-tête de chaque page publique | Public haïtien sur mobile. |
| Layouts | **Un seul root layout** `app/layout.tsx` (`<html lang={await getLocale()}>`), `app/[locale]/layout.tsx` (site, `NextIntlClientProvider`, en-tête, pied), `app/admin/layout.tsx` (coquille admin). Pas de `generateStaticParams` ni `setRequestLocale` : site et admin en `dynamic = 'force-dynamic'` | Le site lit les paramètres en base à chaque requête ; `next build` doit réussir sans base. |
| Auth admin & comptes | **Clerk** (`@clerk/nextjs` 7.9). Un utilisateur connecté dont l’email **vérifié** figure dans `ADMIN_EMAILS` est administrateur ; `requireAdmin()` le revérifie dans chaque page et chaque action serveur. Les clients peuvent créer un compte (préremplissage, page « Mes commandes »), mais **la commande sans compte reste le chemin par défaut**, sans une étape de plus. Sans clés Clerk, le site public fonctionne à l’identique et l’admin affiche « connexion non configurée ». | Décision opérateur du 2026-09-07. Une adresse non vérifiée ne vaut jamais un accès admin ; le proxy tombe en repli si Clerk échoue, pour ne jamais casser la page de paiement. |
| MonCash | Port de pnice-academy : `direct` (Digicel) et `bazik`. **En production, `MONCASH_PROVIDER` doit être explicite** (sinon MonCash = non configuré). Le fournisseur ne signe pas ses callbacks : on re-demande toujours au fournisseur. | `direct` exige un compte marchand Digicel dédié dont les URL de retour pointent vers cette app ; documenté « à vérifier en sandbox ». |
| NatCash | Port de pnice-academy : `kobara`. Le webhook signé (HMAC-SHA256, `t` obligatoire, fenêtre 5 min) est **la seule preuve** qui mène à `paid` ; une lecture `GET` du paiement ne mène qu'à `needs_review` sauf correspondance stricte (id = `provider_ref`, `metadata.order_id` = id commande, montant conforme). | Kobara ne documente pas d'endpoint de lecture. |
| Mode sandbox | `orders.mode` vient de la réponse du fournisseur quand elle l'indique (Bazik `environment`), sinon du rail. **Une commande `sandbox` n'entraîne jamais un envoi réel** : exclue des listes « à recharger » et des totaux, pastille « TEST », toutes ses notifications préfixées « [TEST — aucun argent réel, ne rien envoyer] ». En production, un rail en sandbox n'est proposé qu'au navigateur porteur d'une session admin. | Le sandbox Digicel répond « successful » sans argent. |
| Email | Resend via `fetch`. **Obligatoire pour les alertes admin `paid` / `needs_review`** (le site refuse le mode live sans `RESEND_API_KEY` + `RESEND_FROM` : `/admin/sante` l'affiche en rouge). | Le WhatsApp seul est trop fragile. |
| WhatsApp | Messages modélisés `{ template, locale, params }`. Adaptateurs **Meta Cloud API** (mapping `(template, locale)` → nom de modèle approuvé via `WHATSAPP_META_TEMPLATES` JSON ; sans mapping → message `text`, valable seulement dans la fenêtre 24 h) et **Twilio** (`Body` rendu ; en sandbox Twilio, les messages **client** sont `skipped` : seul l'admin qui a fait « join » les reçoit). Canal manuel jour 1 : bouton « Envoyer sur WhatsApp » (`wa.me`) prérempli dans la fiche admin, journalisé `whatsapp_manual`. | Réalité des API WhatsApp. |
| Notifications | Matrice paramétrable. Défaut admin ← `paid`, `needs_review`, `failed` (erreur fournisseur à la création) ; défaut client ← `created`, `paid`, `fulfilled`, `failed`, `needs_review`, `refunded`. Re-alerte admin par le cron : `paid`/`needs_review` > 30 min sans notification admin réussie, puis rappel à 24 h. Dédoublonnage par **index unique partiel** en base. | Pas de doublon « PAYÉ » qui inviterait à envoyer deux fois. |
| Devis | Calculé **côté client** avec la même fonction pure que le serveur, à partir d'un instantané des paramètres passé par le serveur (pas d'API par frappe). `POST /api/orders` reçoit `expectedTotalHtg` + `settingsUpdatedAt` ; si le devis serveur diffère → **409 `quote_changed`** avec le nouveau devis, avant tout appel fournisseur. | Réseau lent ; jamais débiter un montant non vu. |
| Argent | USD en cents (`integer`), HTG en gourdes entières (`integer`), taux `numeric(10,4)` lu en `mode: 'number'` et converti en dix-millièmes entiers pour le calcul ; pourcentages en centièmes entiers. Invariant : `base_htg + Σ fee_lines = total_htg`. | Aucun flottant dans un arrondi d'argent. |
| Tests | Vitest 5 : devis, arrondis, références, session, téléphone, formats, parsers fournisseurs, signature Kobara, machine à états, `settleOrder` et `notifyOrder` avec dépendances injectées. | |
| Déploiement | Vercel + Neon. **Un seul cron** `GET /api/cron/tick` (réconciliation → expiration → re-alertes), `0 * * * *` (plan Pro). Sur Hobby : `0 11 * * *`, la réconciliation se fait surtout au retour client et à l'ouverture du tableau de bord. | Limites Vercel Hobby. |
| Cache Components | Désactivé. | |
| Comptes clients | Aucun. Commande invitée. | |

## 3. Parcours client

1. **Accueil (`/fr`, `/ht`)** — le héros EST le calculateur, présenté comme un
   reçu (« resi ») qui se remplit pendant la frappe. Montants rapides (5, 10,
   20, 50, 100 $ US) ou saisie libre ; total en gourdes, détail (taux, chaque
   frais, taxe), « soit 1 $ US = 149,25 HTG tout compris ». Méthodes : MonCash,
   NatCash (une méthode non disponible n'apparaît pas). Si le cookie
   `rm_order` désigne une commande récente non terminée : bandeau « Reprendre
   ma dernière commande MR-… ».
2. **Formulaire** — nom complet tel qu'affiché sur Meru ; **type d'identifiant
   Meru** (email ou nom d'utilisateur Meru — décision de l'opérateur ; types activables dans les
   paramètres) et sa valeur, normalisée (email en minuscules,
   nom d'utilisateur sans `@`) ; téléphone WhatsApp obligatoire (`+509` par
   défaut, numéros +1 acceptés) ; email facultatif. Texte d'aide Meru éditable.
3. **Confirmation avant envoi** — « Les dollars seront envoyés à
   **jean@mail.com** (Jean Baptiste). Un envoi vers un mauvais compte ne peut
   pas être annulé. » avec « Corriger » / « Confirmer ».
4. **`POST /api/orders`** — crée la commande, fige le devis, crée le paiement
   chez le fournisseur, persiste `redirect_url` + `redirect_expires_at`, pose
   le cookie `rm_order` (HttpOnly, référence, TTL = TTL commande + 1 h).
5. **Écran « Commande créée »** (toujours sur notre site) — « Commande
   **MR-7F3K2QAB** créée — gardez ce numéro », bouton Copier, lien de suivi,
   lien WhatsApp support prérempli, et le seul gros bouton « Payer 2 985 HTG
   avec MonCash » qui déclenche la redirection.
6. **Retour** — `GET /api/payments/{moncash|natcash}/retour` : identifie la
   commande par `orderId` (query) → `transactionId` Digicel (→
   `RetrieveTransactionPayment.payment.reference`) → cookie `rm_order` ;
   journalise la requête brute ; écrit `returned_at` + événement
   `callback_received` ; règle avec re-tentative sur « pas encore payé »
   (400 / 900 ms) ; redirige vers `/{locale}/commande/{reference}`. Sans
   commande identifiable → `/{locale}/suivi?checking=1`.
7. **Page de suivi `/{locale}/commande/[reference]`** :
   - **fenêtre de vérification** (retour reçu il y a < 15 min, ou redirection
     émise il y a < 15 min sans `verified_unpaid` depuis) : « Nous vérifions
     votre paiement… ne payez pas une deuxième fois. », auto-vérification
     toutes les 5 s pendant 2 min (Server Action `recheckOrder`, un appel
     fournisseur max toutes les 20 s par commande), puis « Vérifier à
     nouveau » + support ;
   - `pending_payment` hors fenêtre et `redirect_expires_at` futur : « Payer
     maintenant » (même URL fournisseur) ; sinon « Créer une nouvelle
     commande » ;
   - `paid` : « Paiement reçu. L'opérateur envoie vos dollars manuellement,
     généralement sous {sla} ({horaires}). » ;
   - `needs_review` : « Paiement reçu, vérification manuelle en cours, nous
     vous contactons sur WhatsApp. » ;
   - `fulfilled` : montant, référence Meru si connue, « vérifiez votre solde
     dans l'app Meru » ;
   - `failed` / `expired` / `cancelled` : raison + « Recommencer » ;
   - `refunded` : montant, portefeuille, date.
   Chaque état affiche le reçu figé, la mention « non affilié », un lien
   `wa.me` support prérempli « Bonjour, commande MR-… ».
   **Confidentialité** : par défaut la page montre référence, statut, méthode,
   montants, expiration, prénom + initiale, téléphone et identifiant Meru
   masqués. Les détails complets n'apparaissent que si le cookie `rm_order`
   correspond ou après `/suivi` (référence + téléphone exact).
8. **`/{locale}/suivi`** — référence + téléphone (Server Action `lookupOrder`,
   404 identique pour inconnu et non concordant, rate-limit) ; pose le cookie
   et redirige vers la page de suivi.
9. **`/{locale}/faq`, `/{locale}/conditions`**.

## 4. Parcours opérateur

1. **`/admin/login`** — email + mot de passe ; verrou compte persistant + IP.
2. **`/admin`** — « À recharger maintenant » (`paid` puis `needs_review`,
   hors sandbox, plus ancien en premier, raccourci « Recharger ») ; en attente
   > 10 min avec « Tout re-vérifier » (balayage throttlé à l'ouverture, max
   10, uniquement les commandes non vérifiées depuis 1 h) ; échouées 24 h ;
   volume USD/HTG du jour et du mois **en heure de Port-au-Prince**, frais
   encaissés (`paid_htg` et `fulfilled_usd_cents`, jamais le devis).
3. **`/admin/commandes`** — filtres statut, méthode, mode, période locale,
   recherche (référence, téléphone, identifiant Meru, nom) ; pagination.
4. **`/admin/commandes/[id]`** — en haut sur mobile, le **panneau
   « Recharger »** : nom du client en grand (à comparer avec Meru), puces
   copiables identifiant Meru et montant `20.00`, champ référence Meru
   (facultatif), « Marquer rechargée » (montant USD envoyé, défaut = commande),
   puis bouton `wa.me` client prérempli. Cartes : devis figé, client,
   fournisseur (mode, référence, transaction, portefeuille payeur — signalé
   s'il diffère du téléphone client), chronologie complète (`order_events`),
   notifications, JSON brut. Actions (toutes en compare-and-set) : Marquer
   rechargée, Marquer échouée (raison), Annuler (pending seulement), Marquer
   remboursée (montant + portefeuille, prérempli), Re-vérifier, Renvoyer les
   notifications, Corriger l'identifiant Meru (journalisé), Ajouter une note,
   Envoyer sur WhatsApp (manuel).
5. **`/admin/parametres`** — taux, règles de frais (libellé, `percent` ou
   `fixed`, valeur, base `base`/`subtotal`, min/max HTG facultatifs,
   s'applique à `all`/`moncash`/`natcash`, actif), tolérance de montant (HTG),
   min/max USD, TTL commande, délai annoncé (fr/ht) et horaires, destinataires
   admin (emails, WhatsApp), matrice de notifications, types d'identifiant
   Meru acceptés, nom commercial, WhatsApp support, textes d'aide Meru (fr/ht).
   Aperçu du devis en direct (20 $ US, chaque méthode).
6. **`/admin/sante`** — état des intégrations, dernière notification admin
   réussie par canal (alerte si > 48 h), boutons de test.
7. **`/admin/notifications`** — journal.

## 5. Modèle de données

```
platform_settings (id='singleton')
  fx_rate_htg numeric(10,4) NOT NULL DEFAULT 132
  fee_rules jsonb NOT NULL DEFAULT '[]'            -- FeeRule[]
  amount_tolerance_htg integer NOT NULL DEFAULT 0
  min_usd_cents integer NOT NULL DEFAULT 500
  max_usd_cents integer NOT NULL DEFAULT 50000
  order_ttl_minutes integer NOT NULL DEFAULT 30
  admin_emails jsonb NOT NULL DEFAULT '[]'
  admin_whatsapp_numbers jsonb NOT NULL DEFAULT '[]'
  notify_admin_events jsonb NOT NULL DEFAULT '["paid","needs_review","failed"]'
  notify_customer_events jsonb NOT NULL DEFAULT '["created","paid","fulfilled","failed","needs_review","refunded"]'
  meru_account_types jsonb NOT NULL DEFAULT '["email","username"]'
  business_name text NOT NULL DEFAULT 'Recharge Meru'
  support_whatsapp text
  support_hours text NOT NULL DEFAULT '8 h – 20 h, 7 j/7'
  fulfilment_sla_fr text NOT NULL DEFAULT 'moins de 2 heures'
  fulfilment_sla_ht text NOT NULL DEFAULT 'mwens pase 2 èdtan'
  meru_help_fr text, meru_help_ht text
  login_failures integer NOT NULL DEFAULT 0
  login_locked_until timestamptz
  updated_at timestamptz NOT NULL DEFAULT now()

FeeRule = { id; label; kind: 'percent'|'fixed'; value: number (percent à 2 décimales max / gourdes entières);
            basis: 'base'|'subtotal'; minHtg?: number; maxHtg?: number;
            appliesTo: 'all'|'moncash'|'natcash'; enabled: boolean }

orders
  id uuid PK, reference text UNIQUE ('MR-' + 8 caractères), status, method, provider, provider_ref,
  provider_transaction_id, payer_wallet, mode ('sandbox'|'live'),
  usd_cents, fx_rate_htg numeric(10,4), base_htg, fee_lines jsonb, total_htg, paid_htg,
  fulfilled_usd_cents, refund_htg, refund_wallet,
  customer_name, customer_phone (E.164), customer_email,
  meru_account_type ('email'|'username'), meru_account (normalisé), meru_reference,
  redirect_url, redirect_expires_at, returned_at, last_verified_at, verify_attempts integer DEFAULT 0,
  failure_reason, admin_note, locale, created_at, updated_at, expires_at, paid_at, fulfilled_at
  UNIQUE (provider, provider_ref) ; INDEX (status, created_at) ; INDEX (customer_phone) ; INDEX (mode)

order_events (id, order_id FK cascade, type, message, data jsonb, actor, created_at) INDEX (order_id, created_at)

notifications (id, order_id FK set null, channel ('email'|'whatsapp'|'whatsapp_manual'), audience ('admin'|'customer'),
  recipient, template, locale, status ('pending'|'sent'|'failed'|'skipped'), provider_id, error, resend_of uuid, created_at)
  UNIQUE INDEX partiel (order_id, template, audience, channel, recipient) WHERE status IN ('pending','sent') AND resend_of IS NULL

webhook_logs (id, source, order_id, matched_by ('id'|'provider_ref'|'reference'|'transaction'|'cookie'|null),
  status ('processed'|'ignored'|'rejected'|'failed'), payload jsonb, error, received_at)
```

`OrderStatus` : `pending_payment`, `paid`, `needs_review`, `fulfilled`, `failed`,
`expired`, `cancelled`, `refunded`. Transitions (`lib/orders/transitions.ts`,
table pure) :

```
pending_payment → paid | needs_review | failed | expired | cancelled
paid            → fulfilled | refunded | needs_review
needs_review    → fulfilled | refunded | failed
failed | expired | cancelled | refunded → needs_review   (paiement vérifié après coup)
fulfilled       → (aucune)
```

Chaque transition : `UPDATE orders SET status = cible, … WHERE id = ? AND status IN (origines autorisées) RETURNING *` ;
zéro ligne ⇒ quelqu'un d'autre a gagné ⇒ `already`, rien n'est notifié. Événements et
notifications ne partent qu'après un CAS réussi.

**Expiration dérivée** : `isExpired(order, now) = status === 'pending_payment' && expires_at < now`,
utilisée par la page de suivi, la création, l'admin et `settleOrder`. Le cron ne fait que
matérialiser `expired` pour les rapports, après une dernière vérification fournisseur.

## 6. Moteur de devis (`lib/pricing/quote.ts`, pur, isomorphe, sans import DB)

**Trois natures de frais** (décision opérateur du 2026-09-07) : `percent` (pourcentage, assiette `base` ou `subtotal`), `fixed` (gourdes entières) et **`fixed_usd`** (cents de dollar US, converti au taux de la commande). Les « frais de transfert » sont un `fixed_usd` de 300, donc **3 $ US quel que soit le taux**. Les paramètres exposent quatre champs nommés en haut de la page : taux de change, frais de service (%), taxe (% sur le sous-total, désactivée par défaut), frais de transfert (en dollars).

- `rateE4 = round(fxRateHtg × 10 000)` ; `baseHtg = max(1, round(usdCents × rateE4 / 1 000 000))`.
- Règles actives applicables, dans l'ordre : `percent` → `round(assiette × round(value × 100) / 10 000)`
  avec assiette = `baseHtg` (basis `base`) ou `baseHtg + frais déjà calculés` (basis `subtotal`) ;
  `fixed` → `round(value)` ; puis bornes `minHtg`/`maxHtg`.
- `totalHtg = baseHtg + Σ lines` ; `effectiveRateE4 = round(totalHtg × 1 000 000 / usdCents)`.
- Refus : montant non entier ou ≤ 0, `< min`, `> max`, `totalHtg > 75 000`.
- `Quote` porte `settingsUpdatedAt` ; le client renvoie `expectedTotalHtg` + `settingsUpdatedAt`.

## 7. Règlement (`lib/orders/settle.ts`, idempotent, jamais-throw, dépendances injectées)

`settleOrder(orderId, { proof?, actor, source, retryOnUnpaid? }, deps)` :
1. Charger ; inconnu ⇒ `unknown_order`.
2. Statut `paid` / `fulfilled` / `needs_review` ⇒ `already` (aucun appel fournisseur).
3. Preuve : fournie (webhook NatCash signé) ; sinon MonCash ⇒ `retrieveMoncashOrderFrom(order.provider, provider_ref ?? id)`
   avec re-tentatives (400/900 ms) sur erreur transitoire et, si `retryOnUnpaid`, sur « pas payé » ;
   NatCash sans preuve ⇒ `checkKobaraOrder(provider_ref)` (résultat **jamais** suffisant pour `paid`).
   Toujours : `last_verified_at = now`, `verify_attempts + 1`.
4. Lecture impossible : NatCash `unsupported_by_provider` / pas de référence ⇒ `pending` ; sinon `error`
   (événement `verification_failed` avec le message brut).
5. Non payé ⇒ événement `verified_unpaid` (au plus un toutes les 5 min) ⇒ `unpaid`.
6. Payé : `amount = proof.amountHtg`.
   - `late = now > expires_at` ou statut ∉ {pending_payment}
   - `short = amount === null` (événement `amount_unreported`) ou `amount < total − tolerance` (`amount_mismatch`)
   - `over = amount > total` (`amount_mismatch`, mais reste conforme)
   - `strict` (NatCash sans webhook) = id lu = provider_ref ∧ metadata.order_id = id ∧ montant conforme ; sinon `needs_review`
   - `mode = 'sandbox'` ⇒ traité comme `paid`/`needs_review` normalement mais **toutes** les notifications
     sont préfixées TEST et la commande est exclue des files de recharge.
   - cible = `needs_review` si `late || short || !strict`, sinon `paid`.
   - CAS depuis les origines autorisées ; 0 ligne ⇒ `already`. Puis événements (`verified_paid` + détails,
     `status_changed`), notification (`paid` ou `needs_review`) ; retour `granted` ou `review`.
   - Depuis `refunded` ⇒ `needs_review` + alerte admin « paiement reçu après remboursement ».

`resolveOrder(hint)` : uuid → `(provider, provider_ref)` → référence `MR-…` ; `webhook_logs.matched_by`.

## 8. Routes et actions

Public : `/`, `/commande/[reference]`, `/suivi`, `/faq`, `/conditions` sous `[locale]`.
Admin : `/admin/login`, `/admin`, `/admin/commandes`, `/admin/commandes/[id]`, `/admin/parametres`,
`/admin/sante`, `/admin/notifications`. Garde `proxy.ts` (matcher
`['/((?!api|admin|_next|_vercel|.*\\..*).*)', '/admin/:path*']`) **et** `requireAdmin()` dans le layout protégé
et chaque action. Le code admin n'importe jamais `@/i18n/navigation` (règle ESLint).

Server Actions publiques (`lib/orders/actions.ts`) : `recheckOrder(reference)` (rate-limit IP + throttle
20 s / commande, `revalidatePath`), `lookupOrder(reference, phone)`.

API :
- `POST /api/orders` — validation Zod, rate-limit IP (60 / 10 min) et téléphone (5 / 10 min), 409 `quote_changed`,
  création, cookie `rm_order`. Réponse `{ ok, reference, orderId, redirectUrl, totalHtg, expiresAt }`.
- `GET|POST /api/webhooks/moncash`, `POST /api/webhooks/natcash` (503 sans secret, 401 signature).
- `GET /api/payments/{moncash|natcash}/retour`.
- `GET /api/cron/tick` — garde `CRON_SECRET` ; réconciliation (`pending_payment` et `expired`, 10 min à
  5 jours, non vérifiées depuis 1 h, `verify_attempts < 24`, 30 max, budget 45 s, `maxDuration = 60`),
  expiration (matérialisation), re-alertes admin ; renvoie le décompte et `remaining`.

## 9. Notifications (`lib/notifications/`)

`notifyOrder(order, event, { force? })` : templates `created | paid | fulfilled | failed | expired |
needs_review | refunded | reminder_24h` ; destinataires selon la matrice ; préfixe TEST en sandbox ;
insertion `pending` avec `onConflictDoNothing` sur l'index partiel (doublon ⇒ `skipped`), envoi, puis
`sent`/`failed` ; événements `notification_sent`/`notification_failed`. Renvoi admin ⇒ `resend_of`.
Contenu : voir le plan (fr/ht, admin fr). Le message admin `paid` montre toujours montant attendu et
montant reçu, l'identifiant Meru, le nom, le lien fiche.

## 10. Sécurité et robustesse

Secrets à l'appel ; fournisseurs jamais-throw ; un paiement n'est jamais cru sur la foi d'une URL ;
références non devinables (`crypto.randomInt`, 8 caractères) ; page publique minimisée ; 404 identiques ;
rate-limits en mémoire (deuxième couche) + verrou compte persistant ; `Secure` seulement en production ;
URL de callback dérivées de l'origine de la requête (previews Vercel isolées) et `NEXT_PUBLIC_SITE_URL`
réservé aux liens des notifications (résolution : `NEXT_PUBLIC_SITE_URL` → `https://VERCEL_URL` hors
production → localhost).

## 11. Direction visuelle

Sujet : de l'argent mobile haïtien vers un dollar numérique ; public jeune, mobile, réseau lent ;
exigence : beau, pro, confiance.

- **Palette** : encre `#0E1B3D`, papier `#FFFFFF`, gris-bleu `#EEF2F8`, **soleil `#FFC531`** (accent
  unique), menthe `#159F6C`, corail `#DC3D43` ; pastilles MonCash `#E4002B`, NatCash `#F7941D`.
- **Typographie** : `Bricolage Grotesque` (titres, montants, chiffres tabulaires) + `Figtree` (texte).
- **Le moment mémorable** : le reçu qui se remplit pendant la frappe ; le total en gourdes est le plus
  gros élément de la page. Aucune animation d'entrée ; mouvement seulement en réponse à une action.
- **Confiance** : frais visibles avant de payer, ligne « paiement vérifié auprès de MonCash / NatCash »,
  suivi par référence, support WhatsApp réel, mention « non affilié », reçu figé, délai annoncé,
  états d'erreur qui disent quoi faire. Pas d'étiquettes en capitales, pas de numéros décoratifs.
- **Copie** : fr « 20 $ US », ht « 20 dola US » ; gourdes « 2 985 HTG » ; jamais un « $ » nu.
- Admin : même système, plus dense, statut = pastille + libellé, actions dangereuses confirmées.

## 12. Variables d'environnement

```
NEXT_PUBLIC_SITE_URL, DATABASE_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, ADMIN_EMAILS, CRON_SECRET
MONCASH_PROVIDER (direct|bazik ; obligatoire en production), MONCASH_CLIENT_ID, MONCASH_CLIENT_SECRET, MONCASH_MODE
BAZIK_USER_ID (ou BAZIK_ID), BAZIK_SECRET_KEY, BAZIK_MODE
KOBARA_SECRET_KEY, KOBARA_WEBHOOK_SECRET, KOBARA_MODE, KOBARA_API_BASE
RESEND_API_KEY, RESEND_FROM
WHATSAPP_PROVIDER (meta|twilio), WHATSAPP_META_TOKEN, WHATSAPP_META_PHONE_NUMBER_ID, WHATSAPP_META_TEMPLATES (JSON), WHATSAPP_META_TEMPLATE_LANG
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_SANDBOX (true|false)
NEXT_PUBLIC_USD_TO_HTG (taux de secours sans base)
```

## 13. Hors périmètre

Comptes clients, remboursement automatique via API, recharge automatique Meru, rôles multiples, app
mobile, carte/PayPal, taux automatique, table d'essais de paiement multiples (une commande = un
paiement fournisseur ; pour repayer après expiration, on crée une nouvelle commande).
