# Recharge Meru

Passerelle de paiement haïtienne vers les comptes **Meru** (getmeru.com) : le client
paie en **gourdes** avec **MonCash** ou **NatCash**, l'opérateur envoie les **dollars US**
sur le compte Meru du client (transfert Meru → Meru, gratuit dans l'application Meru).

Meru accepte les virements US/EU, PayPal, les cartes, Wise et la crypto, mais **aucun
moyen de paiement haïtien**. Cette plateforme est le pont. Meru n'expose pas d'API
publique : **la recharge finale est un geste manuel et irréversible de l'opérateur**.
Tout le reste — devis, encaissement, vérification du paiement, suivi, notifications —
est automatisé, et le code est écrit pour qu'aucune commande de test, aucun rappel de
callback et aucun identifiant mal saisi ne puisse déclencher un envoi de dollars par erreur.

**Recharge Meru n'est affilié ni à Meru, ni à Digicel, ni à Natcom.** Cette mention
figure dans le pied de page, sur la page de suivi et dans les conditions.

---

## Sommaire

- [Ce que fait le site](#ce-que-fait-le-site)
- [Pile technique](#pile-technique)
- [Démarrage local](#démarrage-local)
- [Scripts npm](#scripts-npm)
- [Structure du dépôt](#structure-du-dépôt)
- [Paramètres : base de données ou variables d'environnement ?](#paramètres--base-de-données-ou-variables-denvironnement-)
- [URL à déclarer chez chaque fournisseur](#url-à-déclarer-chez-chaque-fournisseur)
- [Clés d'identification renvoyées par chaque fournisseur](#clés-didentification-renvoyées-par-chaque-fournisseur)
- [Déploiement sur Vercel](#déploiement-sur-vercel)
- [Notifications](#notifications)
- [Le mode sandbox et la règle « TEST »](#le-mode-sandbox-et-la-règle--test-)
- [Sécurité](#sécurité)
- [Vérifications avant livraison](#vérifications-avant-livraison)
- [Documentation](#documentation)

---

## Ce que fait le site

### Côté client (français et kreyòl, `/fr` et `/ht`)

1. **Accueil** — le calculateur est le héros de la page : montant en dollars (montants
   rapides 5, 10, 20, 50, 100 $ US ou saisie libre), méthode (MonCash / NatCash), et un
   reçu qui se remplit pendant la frappe : taux, chaque frais, total en gourdes, taux
   effectif « tout compris ». Le devis est calculé dans le navigateur avec **la même
   fonction pure** que le serveur.
2. **Formulaire** — nom complet tel qu'affiché sur Meru, identifiant Meru (email ou nom
   d'utilisateur, selon ce qui est activé dans les paramètres), téléphone WhatsApp,
   email facultatif.
3. **Confirmation** — « Les dollars seront envoyés à … Un envoi vers un mauvais compte
   ne peut pas être annulé. »
4. **Création** — `POST /api/orders` fige le devis sur la commande, crée le paiement chez
   le fournisseur et renvoie la référence `MR-XXXXXXXX` ; le serveur refuse un devis
   périmé (**409 `quote_changed`**, avec le nouveau devis) **avant** tout appel fournisseur.
5. **Paiement** — un seul gros bouton « Payer … avec MonCash / NatCash » vers la page du
   fournisseur, puis retour sur `/api/payments/{moncash|natcash}/retour`.
6. **Suivi** — `/{locale}/commande/{reference}` : fenêtre de vérification automatique,
   « Payer maintenant » tant que la redirection est valide, reçu figé, lien WhatsApp
   support. `/{locale}/suivi` retrouve une commande avec référence + téléphone.

**Le compte client est facultatif.** La commande invitée reste la voie normale — aucun
compte n'est demandé à aucun moment, et le cookie `rm_order` (HttpOnly) suffit à reprendre
la dernière commande et à en voir les détails complets. Un client qui le souhaite peut
créer un compte (`/fr/inscription`, `/fr/connexion`) : cela ne change rien au prix ni au
parcours, cela lui donne un formulaire prérempli et ses commandes rattachées à son compte
(`orders.clerk_user_id`), visibles dans la fiche admin.

### Côté opérateur (français, `/admin`)

`/admin` (tableau de bord « À recharger maintenant », volumes du jour et du mois en heure
de Port-au-Prince), `/admin/commandes` (filtres et recherche), `/admin/commandes/[id]`
(panneau **Recharger**, chronologie complète, notifications, JSON brut, toutes les
actions), `/admin/parametres` (panneau **Tarification** : taux de change, frais de service,
taxe et frais de transfert en dollars — puis règles avancées, min/max, TTL, délais annoncés,
destinataires, matrice de notifications, textes d'aide), `/admin/sante` (état des
intégrations, boutons de test), `/admin/notifications` (journal).

Le déroulé complet du travail quotidien est dans **[docs/exploitation.md](docs/exploitation.md)**.

---

## Pile technique

| Domaine | Choix |
|---|---|
| Framework | Next.js **16.3.4** (App Router, `proxy.ts`, `await params` / `await cookies()`), React 19.2, TypeScript 5 strict |
| Style | Tailwind CSS 4 + composants maison, icônes `lucide-react` |
| Base de données | Postgres **Neon** via `@neondatabase/serverless` (neon-http) + Drizzle ORM 0.45, migrations versionnées |
| Validation | Zod 4 |
| i18n | `next-intl` 4 — `fr` (défaut) et `ht` pour le site public ; admin en français, hors segment de locale |
| Comptes | **Clerk** (`@clerk/nextjs`) — obligatoire pour `/admin`, facultatif pour le client |
| Tests | Vitest 5 |
| Hébergement | Vercel (un seul cron) + Neon |

**neon-http n'a pas de transactions** : chaque changement de statut est un
`UPDATE … WHERE id = ? AND status IN (…) RETURNING *` (compare-and-set). Zéro ligne
renvoyée ⇒ quelqu'un d'autre a déjà traité la commande ⇒ on ne notifie rien.

L'argent est en entiers : dollars en **cents**, gourdes **entières**, taux `numeric(10,4)`
converti en dix-millièmes entiers, pourcentages en centièmes entiers. Invariant vérifié
par les tests : `base_htg + Σ frais = total_htg`.

---

## Démarrage local

Prérequis : **Node.js ≥ 20.9** et npm.

```bash
npm install
cp .env.example .env.local          # puis remplir (voir docs/api-keys-guide.md)
npm run dev                          # http://localhost:3000
```

Minimum pour ouvrir l'administration :

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…   # Clerk → API keys
CLERK_SECRET_KEY=sk_test_…                    # Clerk → API keys
ADMIN_EMAILS=vous@exemple.com                 # votre adresse, en clair
```

**Créer l'application Clerk** (deux minutes, une seule fois) :

1. Compte sur **dashboard.clerk.com** → *Create application*. Nom libre ; laissez au
   moins **Email** comme moyen de connexion.
2. Onglet **API keys** : copiez la clé publique dans `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   et la clé secrète dans `CLERK_SECRET_KEY`. Les deux vont ensemble — une seule des
   deux et l'administration reste fermée (le site public, lui, ne change pas).
3. Mettez **votre** adresse dans `ADMIN_EMAILS` (plusieurs adresses : séparez-les par des
   virgules), puis redémarrez `npm run dev`.
4. Créez votre compte avec cette adresse — depuis le site (`/fr/inscription`) ou depuis
   Clerk (*Users → Create user*) — puis ouvrez `/admin`.

Il n'y a **plus de mot de passe admin dans cette application** : plus de
`ADMIN_PASSWORD_HASH`, plus de `AUTH_SECRET`, et la commande `npm run admin:hash`
n'existe plus. Un administrateur est un compte Clerk dont l'adresse figure dans
`ADMIN_EMAILS` ; retirer l'adresse ferme l'accès à la requête suivante.

Sans `DATABASE_URL`, le site démarre quand même : il affiche les paramètres par défaut
(taux `NEXT_PUBLIC_USD_TO_HTG`), `POST /api/orders` répond **503** et l'admin s'ouvre en
lecture. C'est aussi ce que fait `npm run build` en intégration continue.

Avec une base Neon :

```bash
# DATABASE_URL renseigné dans .env.local
npm run db:migrate     # applique db/migrations/ (recommandé)
# ou, en développement seulement :
npm run db:push        # synchronise le schéma sans fichier de migration
```

Après un changement de `db/schema.ts` : `npm run db:generate` puis relire le SQL produit
dans `db/migrations/` avant de le committer.

---

## Scripts npm

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (Turbopack). |
| `npm run build` | Build de production. **Doit réussir sans `DATABASE_URL`.** |
| `npm start` | Sert le build. |
| `npm test` | Vitest, une passe. `npm run test:watch` pour le mode continu. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (config plate ; pas de `next lint` en Next 16). |
| `npm run db:generate` | Génère une migration SQL depuis `db/schema.ts`. |
| `npm run db:migrate` | Applique les migrations. |
| `npm run db:push` | Pousse le schéma directement (développement). |
| `npm run db:studio` | Drizzle Studio. |

---

## Structure du dépôt

```
app/
  [locale]/           site public (fr, ht) — accueil, commande, suivi, faq, conditions,
                      connexion et inscription (facultatives pour le client)
  admin/              back-office français (login + segment protégé)
  api/                orders, webhooks, retours de paiement, cron
components/ui/        design system (Button, Card, StatusPill, Table, …)
components/site/      en-tête, pied, bandeau sandbox, widget de recharge
components/admin/     tableaux, panneaux et formulaires de l'admin
db/                   schéma Drizzle, client Neon, migrations
i18n/                 routing, navigation et chargement des messages next-intl
lib/
  admin/              requêtes, actions et état de santé du back-office
  auth/               Clerk (clés, utilisateur courant) et la liste ADMIN_EMAILS
  cron/               garde du cron
  notifications/      email (Resend), WhatsApp (Meta/Twilio), gabarits, dispatch
  orders/             références, transitions, création, règlement, réconciliation
  payments/           MonCash (direct/Bazik), NatCash (Kobara), retry
  pricing/            arithmétique entière et moteur de devis isomorphe
  settings/           types, valeurs par défaut, validation Zod, store
messages/{fr,ht}/     textes du site public (mêmes clés dans les deux langues)
proxy.ts              redirection de locale + garde /admin (Next 16 : jamais middleware.ts)
docs/                 ce dossier — guides d'exploitation et de configuration
```

---

## Paramètres : base de données ou variables d'environnement ?

- **Variables d'environnement** = raccordements et secrets : base, admin, cron,
  fournisseurs de paiement, email, WhatsApp. Voir [`.env.example`](.env.example) et
  [docs/api-keys-guide.md](docs/api-keys-guide.md).
- **Base de données** (`/admin/parametres`, table `platform_settings`, une seule ligne) =
  tout ce qui se règle au quotidien : taux USD→HTG, règles de frais, tolérance de montant,
  min/max, TTL des commandes, délai annoncé et horaires, destinataires des alertes,
  matrice de notifications, types d'identifiant Meru acceptés, nom commercial, WhatsApp
  support, textes d'aide Meru.

`NEXT_PUBLIC_USD_TO_HTG` n'est qu'un **taux de secours** utilisé quand il n'y a pas de base
de données (build, développement sans `DATABASE_URL`). Dès qu'une base répond, c'est la
ligne `platform_settings` qui fait foi.

---

## URL à déclarer chez chaque fournisseur

Remplacez `https://votre-domaine` par l'origine réelle du déploiement.

| Fournisseur | Type d'URL | Valeur | Où la déclarer |
|---|---|---|---|
| **MonCash direct (Digicel)** | Retour client | `https://votre-domaine/api/payments/moncash/retour` | Portail marchand MonCash Business — **fixe**, une seule fois |
| **MonCash direct (Digicel)** | Notification | `https://votre-domaine/api/webhooks/moncash` | Portail marchand MonCash Business — **fixe** |
| **Bazik** | Retour + erreur + webhook | envoyés **à chaque paiement** par l'application | rien à déclarer |
| **Kobara (NatCash)** | Webhook signé | `https://votre-domaine/api/webhooks/natcash` | Dashboard Kobara → Webhooks (récupérer le secret de signature) |
| **Kobara (NatCash)** | Retour client | `https://votre-domaine/api/payments/natcash/retour` | envoyé à chaque paiement (`success_url`) |
| **Vercel Cron** | Tâche horaire | `https://votre-domaine/api/cron/tick` | `vercel.json` + `CRON_SECRET` |

Points d'attention :

- **Digicel fixe ses URL dans le portail, pas par requête.** Le compte MonCash Business
  doit donc être **dédié à cette application** : deux applications ne peuvent pas partager
  le même compte marchand sans se voler les retours clients. C'est aussi pourquoi le
  retour Digicel peut n'apporter qu'un `transactionId` : le code sait le résoudre en
  commande via `RetrieveTransactionPayment`.
- **Bazik et Kobara acceptent les URL par requête** : les déploiements de prévisualisation
  Vercel fonctionnent tels quels, chaque commande revient sur son propre déploiement.
- **Un callback n'est jamais une preuve de paiement.** Sur MonCash, le serveur redemande
  toujours au fournisseur. Sur NatCash, **seul le webhook Kobara signé** (HMAC-SHA256,
  en-tête `Kobara-Signature: t=…,v1=…`, fenêtre de 5 minutes) mène à `paid` ; une lecture
  `GET` du paiement ne mène qu'à `needs_review`, sauf correspondance stricte.

---

## Clés d'identification renvoyées par chaque fournisseur

Chaque fournisseur nomme ses identifiants à sa façon, et la documentation publique est
incomplète. **À vérifier avec un paiement sandbox, puis à noter ici** (ce tableau fait
partie de la documentation d'exploitation : gardez-le à jour).

| Fournisseur | Champ renvoyé à la création | Ce que nous stockons dans `orders` | Champ de vérification | Vérifié le | Observé (exemple réel) |
|---|---|---|---|---|---|
| MonCash direct | `payment_token.token` (redirection) + `orderId` (le nôtre) | `provider_ref` = notre `order.id`, `redirect_url` | `RetrieveOrderPayment` → `payment.transaction_id`, `payment.payer`, `payment.cost` | | |
| MonCash direct (retour) | `transactionId` en query | `provider_transaction_id` | `RetrieveTransactionPayment` → `payment.reference` = notre `order.id` | | |
| Bazik | `orderId` (`BZK_sandbox_…`), `redirectUrl`, `environment` | `provider_ref` = **l'`orderId` de Bazik**, `mode` | `GET /order/{orderId}` → statut, montant, payeur | | |
| Kobara (NatCash) | `id` ou `kobara_reference`, `checkout_url` | `provider_ref` | Webhook `payment.succeeded` signé → `metadata.order_id`, `amount`, `transaction_id` | | |

Rappel : `UNIQUE (provider, provider_ref)` en base — un même paiement fournisseur ne peut
pas être attaché à deux commandes.

---

## Déploiement sur Vercel

1. **Importer le dépôt** dans Vercel (projet Next.js, aucune configuration de build
   particulière).
2. **Saisir les variables** de [`.env.example`](.env.example) dans
   *Project Settings → Environment Variables*, environnement par environnement.
   `NEXT_PUBLIC_SITE_URL` doit valoir l'origine canonique de production, **sans barre
   finale**. Sur les prévisualisations, laissez-la vide : le code retombe sur
   `https://$VERCEL_URL`.
3. **Base Neon** : utilisez la chaîne « pooled » dans `DATABASE_URL`, puis appliquez les
   migrations (`npm run db:migrate` depuis un poste dont la variable pointe sur la base de
   production).
4. **Cron** — un seul point d'entrée, `GET /api/cron/tick` (réconciliation → expiration →
   re-alertes admin), gardé par `CRON_SECRET` (`Authorization: Bearer …`) :

   ```json
   {
     "crons": [{ "path": "/api/cron/tick", "schedule": "0 * * * *" }],
     "functions": { "app/api/cron/tick/route.ts": { "maxDuration": 60 } }
   }
   ```

   - **Plan Pro** : `0 * * * *` (toutes les heures).
   - **Plan Hobby** : un seul cron par jour — mettez `0 11 * * *`. La réconciliation se
     fait alors surtout au retour du client et à l'ouverture du tableau de bord (bouton
     « Tout re-vérifier »).
   - Sans `CRON_SECRET`, la route répond **503** : elle est inerte, pas ouverte.
5. **Domaine et cookies** : la session admin est un cookie Clerk, posé et vérifié par
   Clerk ; pensez à créer une **instance de production** Clerk et à utiliser ses clés
   `pk_live_…` / `sk_live_…` sur le domaine définitif.
   Les liens des notifications utilisent `NEXT_PUBLIC_SITE_URL` ; les URL de callback,
   elles, sont dérivées de l'origine de la requête, ce qui isole proprement les
   prévisualisations.
6. **Après le premier déploiement** : ouvrez `/admin/sante` — chaque intégration doit être
   au vert ou explicitement désactivée, et l'email doit être configuré (voir ci-dessous).

> `.gitignore` ignore `.env*`. Si `.env.example` n'apparaît pas dans `git status`,
> ajoutez-le une fois avec `git add -f .env.example`.

---

## Notifications

### Email (Resend) — obligatoire

Les alertes admin `paid` et `needs_review` **doivent** partir : c'est le seul canal qui ne
dépend ni d'une fenêtre de 24 h ni d'un bac à sable. Sans `RESEND_API_KEY` **et**
`RESEND_FROM` (expéditeur sur un domaine vérifié), `/admin/sante` l'affiche en rouge.
Renseignez au moins une adresse dans *Paramètres → destinataires admin*.

### WhatsApp

Deux adaptateurs, un seul actif (`WHATSAPP_PROVIDER`) :

- **Meta Cloud API** — hors de la fenêtre de 24 h ouverte par un message du client, Meta
  ne délivre que des **modèles approuvés**. Le mapping `(template, locale) → nom de modèle`
  se fait dans `WHATSAPP_META_TEMPLATES` (JSON). Sans mapping, le message part en texte
  libre, **valable seulement dans la fenêtre de 24 h**. Les corps prêts à soumettre sont
  dans **[docs/whatsapp-templates.md](docs/whatsapp-templates.md)**.
- **Twilio** — texte libre, aucun modèle à faire approuver. En **bac à sable Twilio**
  (`TWILIO_SANDBOX=true` ou numéro `+14155238886`), seuls les numéros ayant envoyé le mot
  « join … » reçoivent quelque chose, et l'autorisation expire **toutes les 72 heures** :
  les messages **clients** sont donc marqués `skipped`, seul l'admin est joignable.

- **Canal manuel (jour 1)** — chaque fiche de commande a un bouton « Envoyer sur WhatsApp »
  qui ouvre `wa.me` avec le message prérempli ; l'envoi est journalisé comme
  `whatsapp_manual`. Rien à configurer, et cela fonctionne même sans API.

Dédoublonnage : une notification `(commande, modèle, audience, canal, destinataire)` déjà
`pending` ou `sent` n'est jamais réinsérée (index unique partiel en base). Un renvoi
volontaire depuis l'admin est tracé par `resend_of`.

Re-alertes automatiques du cron : une commande `paid`/`needs_review` sans notification
admin réussie depuis **30 minutes** est ré-alertée, puis rappelée à **24 heures**.

---

## Le mode sandbox et la règle « TEST »

Le bac à sable de Digicel répond « successful » sans qu'un centime bouge. Une commande
créée sur un rail en sandbox porte donc `mode = 'sandbox'` et, définitivement :

- elle **n'apparaît jamais** dans « À recharger maintenant » ni dans les totaux ;
- elle porte une pastille **TEST** partout où elle s'affiche ;
- **toutes** ses notifications commencent par « [TEST — aucun argent réel, ne rien
  envoyer] » (« [TÈS — pa gen lajan reyèl] » en kreyòl) ;
- en production, un rail en sandbox n'est proposé qu'au navigateur porteur d'une session
  admin — un visiteur ne peut pas créer une commande de test.

Corollaire pour l'opérateur : **si un message porte le préfixe TEST, on n'envoie rien sur
Meru.** C'est la seule règle à ne jamais discuter.

En production, `MONCASH_PROVIDER` doit être explicite (`direct` ou `bazik`) : vide en
production ⇒ MonCash est considéré comme non configuré, plutôt que basculé au hasard.

---

## Sécurité

- **Secrets** lus dans `process.env` **au moment de l'appel**, jamais journalisés, jamais
  envoyés au navigateur. Seules les variables `NEXT_PUBLIC_*` traversent vers le client.
- **Admin** : connexion **Clerk**, autorisation par liste. Un administrateur est un compte
  Clerk dont une adresse email **vérifiée** figure dans `ADMIN_EMAILS` (comparaison en
  minuscules). Une adresse simplement ajoutée — donc non vérifiée — n'ouvre rien. L'application ne stocke aucun mot de passe et ne signe aucun cookie de
  session : Clerk tient la session, le verrouillage après échecs répétés et, si vous
  l'activez, la double authentification. **Retirer une adresse de `ADMIN_EMAILS` ferme
  l'accès dès la requête suivante** — rien à révoquer, rien à faire tourner.
- **Comptes clients** : un client peut créer un compte, mais rien ne l'y oblige et la
  commande invitée n'a pas changé d'un pouce. Être connecté ne donne aucun droit
  supplémentaire : la seule liste qui ouvre `/admin` est `ADMIN_EMAILS`.
- **Aucun paiement n'est cru sur la foi d'une URL** : MonCash est toujours re-interrogé,
  NatCash exige un webhook signé (horodatage `t` obligatoire, fenêtre 5 minutes).
- **Références non devinables** : `crypto.randomInt`, alphabet sans caractères ambigus.
- **Page publique minimisée** : prénom + initiale, téléphone et identifiant Meru masqués ;
  les détails complets n'apparaissent qu'avec le cookie `rm_order`, depuis le compte qui a
  passé la commande, ou après avoir prouvé référence + téléphone sur `/suivi`. Les 404 sont identiques pour « inconnu » et « non
  concordant ».
- **Limiteurs en mémoire** (deuxième couche, pas la seule) : création de commande 60/10 min
  par IP et 5/10 min par téléphone, re-vérification 30/min, suivi 20/5 min. Le freinage des
  tentatives de connexion, lui, est du ressort de Clerk.
- **`/admin` est gardé deux fois** : `proxy.ts` **et** `requireAdmin()` dans le layout
  protégé et dans chaque action serveur.
- **En-têtes de sécurité** posés dans `next.config.ts` ; les pages de commande et l'admin
  sont en `noindex`.

Si un secret fuit : changez-le chez le fournisseur, mettez à jour Vercel, redéployez. Pour
l'accès admin, tout se fait dans Clerk (changer le mot de passe du compte, déconnecter les
appareils) ou dans `ADMIN_EMAILS` (retirer l'adresse ferme la porte immédiatement).

---

## Vérifications avant livraison

```bash
npm test          # Vitest
npm run typecheck # tsc --noEmit
npm run lint      # ESLint
npm run build     # doit réussir SANS DATABASE_URL
```

Fumigation en développement : `/fr`, `/ht`, `/fr/faq`, `/fr/conditions`, `/fr/suivi` et
`/admin/login` répondent 200 ; `/admin` redirige vers la connexion ; `POST /api/orders`
sans base répond 503 ; `GET /api/cron/tick` sans secret répond 503 ;
`POST /api/webhooks/natcash` sans secret répond 503.

---

## Documentation

- **[docs/api-keys-guide.md](docs/api-keys-guide.md)** — obtenir chaque clé, pas à pas
  (Neon, MonCash Business, Bazik, Kobara, Resend, Meta WhatsApp, Twilio) et où la coller.
- **[docs/exploitation.md](docs/exploitation.md)** — la routine quotidienne de l'opérateur
  depuis un téléphone : recharger, vérifier, rembourser, changer le taux, comprendre chaque
  statut.
- **[docs/whatsapp-templates.md](docs/whatsapp-templates.md)** — les corps exacts fr et ht
  de chaque modèle avec `{{1}}…{{n}}`, prêts à soumettre à Meta, et le JSON
  `WHATSAPP_META_TEMPLATES` à coller.
- **[.env.example](.env.example)** — toutes les variables, commentées.
- `docs/superpowers/specs/` et `docs/superpowers/plans/` — la conception et le plan
  d'implémentation d'origine.

---

Recharge Meru est une plateforme indépendante opérée par Stanley Wendel Joseph.
**Aucune affiliation avec Meru, Digicel ou Natcom.** Les marques citées appartiennent à
leurs propriétaires respectifs.
