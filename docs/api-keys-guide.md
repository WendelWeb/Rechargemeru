# Guide des clés et des accès

Comment obtenir **chaque** valeur de [`.env.example`](../.env.example), où la coller, et
comment vérifier qu'elle marche. Ordre conseillé : les secrets que vous créez vous-même,
puis la base de données, puis un rail de paiement, puis l'email, puis WhatsApp.

**Où coller les valeurs**

| Contexte | Emplacement |
|---|---|
| Développement | `.env.local` à la racine (copie de `.env.example`, jamais committée) |
| Production / prévisualisation | Vercel → *Project Settings → Environment Variables* |

Après avoir changé une variable sur Vercel, **redéployez** : les variables ne sont pas
relues à chaud. Une variable modifiée en local demande un redémarrage de `npm run dev`.

**Règles d'or**

- Une clé secrète ne s'écrit jamais dans le code, dans un ticket, dans un message
  WhatsApp, ni dans `.env.example` (qui ne contient que des **noms**).
- Les seules variables qui arrivent dans le navigateur sont celles préfixées
  `NEXT_PUBLIC_`. N'y mettez jamais un secret.
- Chaque intégration est **facultative sauf l'email** : le site démarre sans, `/admin/sante`
  affiche ce qui manque, et les modules concernés répondent « non configuré » au lieu de
  planter.

---

## 1. Les accès que vous créez vous-même

Deux choses, indépendantes de tout fournisseur de paiement : la connexion à
l'administration (Clerk) et le secret qui garde la tâche planifiée. Posez-les en premier.

### Clerk — l'accès à l'administration

L'administration ne connaît plus de mot de passe : elle s'ouvre avec un **compte Clerk**
dont l'adresse figure dans `ADMIN_EMAILS`. Il n'y a donc plus de `AUTH_SECRET`, plus de
`ADMIN_PASSWORD_HASH` et plus de commande `npm run admin:hash` — ces trois-là ont disparu
du projet, retirez-les de vos environnements s'ils y traînent encore.

#### Les deux clés : `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` et `CLERK_SECRET_KEY`

1. Créez un compte sur **dashboard.clerk.com**, puis *Create application*.
2. Nom libre. Laissez au moins **Email** comme moyen de connexion ; ajoutez Google ou un
   autre fournisseur si vous le souhaitez, cela ne change rien au code.
3. Ouvrez l'onglet **API keys** de l'application : Clerk y affiche les deux valeurs.
   - la clé publique (`pk_test_…` en développement, `pk_live_…` en production) va dans
     `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — elle est **publique par construction**, elle
     arrive dans le navigateur, c'est normal ;
   - la clé secrète (`sk_test_…` / `sk_live_…`) va dans `CLERK_SECRET_KEY` et ne sort
     **jamais** du serveur.
4. Redémarrez `npm run dev` (ou redéployez sur Vercel).

Les deux vont ensemble : avec une seule des deux, l'application se comporte comme si Clerk
n'existait pas — `/admin/login` explique ce qui manque, et le site public continue de
fonctionner et de se construire normalement.

Développement et production sont **deux instances Clerk différentes**, avec deux paires de
clés : créez l'instance de production quand vous branchez le domaine définitif, et ne
mélangez jamais une clé `pk_live_…` avec une clé `sk_test_…`.

#### `ADMIN_EMAILS` — qui entre dans `/admin`

La liste des adresses autorisées, séparées par des virgules (les points-virgules et les
retours à la ligne marchent aussi) :

```dotenv
ADMIN_EMAILS=vous@exemple.com,associe@exemple.com
```

- La comparaison se fait en minuscules, espaces ignorés, sur l'adresse **principale** du
  compte Clerk connecté.
- **Vide = personne n'entre.** Jamais « tout le monde ».
- Un compte connecté dont l'adresse n'est pas dans la liste voit un refus clair sur
  `/admin/login` (« ce compte n'a pas accès »), pas un formulaire de plus.
- Retirer une adresse **ferme l'accès dès la requête suivante** : il n'y a aucune session
  applicative à révoquer, aucun secret à faire tourner. C'est le geste à faire quand un
  téléphone est perdu — complété, dans Clerk, par la déconnexion des appareils du compte.

Ne confondez pas cette liste avec les **« emails de l'opérateur »** de `/admin/parametres` :
ceux-là sont les destinataires des alertes, ils vivent en base et n'ouvrent aucune porte.
Les deux listes ne sont pas synchronisées, et c'est voulu.

Créez votre compte avec l'adresse listée — depuis le site (`/fr/inscription`) ou depuis
Clerk (*Users → Create user*) — puis ouvrez `/admin`.

#### Les comptes clients

La même application Clerk sert aux clients qui veulent un compte (`/fr/inscription`,
`/fr/connexion`). C'est **facultatif** : la commande sans compte reste la voie normale et
n'a pas changé. Un client connecté n'obtient aucun droit particulier — seule la liste
`ADMIN_EMAILS` ouvre l'administration — juste un formulaire prérempli et ses commandes
rattachées à son compte.

### `CRON_SECRET` — garde de la tâche planifiée

Une chaîne aléatoire que vous créez vous-même :

```bash
openssl rand -base64 32
# ou, sans openssl :
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Vercel Cron l'envoie dans
`Authorization: Bearer …` vers `/api/cron/tick`. Sans elle, la route répond **503** :
la réconciliation ne tourne plus, mais rien n'est exposé.

Vérification :

```bash
curl -i https://votre-domaine/api/cron/tick                          # 503
curl -i -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/tick   # 200 + décompte
```

---

## 2. Neon — `DATABASE_URL`

Postgres serverless, gratuit pour démarrer.

1. Créez un compte sur **neon.tech** puis un projet (choisissez la région la plus proche
   de la région Vercel du projet, typiquement `us-east`).
2. Dans le tableau de bord du projet, section **Connection string**, choisissez la chaîne
   **« Pooled connection »** (elle contient `-pooler` dans l'hôte) et le format
   « psql / URI ».
3. Collez-la dans `DATABASE_URL`. Elle ressemble à :
   `postgresql://user:motdepasse@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Appliquez le schéma :

   ```bash
   npm run db:migrate     # applique db/migrations/
   ```

**À savoir**

- Ce projet utilise le pilote **HTTP** de Neon : il n'y a **pas de transactions**. C'est
  assumé dans le code (chaque changement de statut est un compare-and-set).
- La branche gratuite se met en veille ; la première requête après une pause est plus
  lente. Ce n'est pas une panne.
- Sans `DATABASE_URL`, le site fonctionne en mode dégradé (paramètres par défaut,
  `POST /api/orders` en 503). C'est voulu : `npm run build` doit passer sans base.

---

## 3. MonCash direct (Digicel) — `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET`, `MONCASH_MODE`

C'est la voie « sans intermédiaire » : aucun frais d'agrégateur, mais elle demande un
**compte MonCash Business** chez Digicel (dossier commercial, délai de plusieurs semaines).

1. Ouvrez un compte **MonCash Business** auprès de Digicel Haïti (agence entreprise ou
   contact commercial MonCash). Demandez explicitement l'**accès API/marchand**, pas
   seulement un compte de caisse.
2. Digicel donne accès à un portail marchand
   (`sandbox.moncashbutton.digicelgroup.com` pour les tests,
   `moncashbutton.digicelgroup.com` en production) où se trouvent
   **Client ID** et **Client Secret** de l'application (« Business API keys »).
3. Renseignez :

   ```dotenv
   MONCASH_PROVIDER=direct
   MONCASH_CLIENT_ID=…
   MONCASH_CLIENT_SECRET=…
   MONCASH_MODE=sandbox     # puis live, délibérément
   ```

4. **Déclarez les URL dans le portail** (Digicel les fixe une fois pour toutes, elles ne
   sont pas envoyées à chaque paiement) :

   | Champ du portail | Valeur |
   |---|---|
   | URL de retour / *Return URL* | `https://votre-domaine/api/payments/moncash/retour` |
   | URL de notification / *Alert URL* | `https://votre-domaine/api/webhooks/moncash` |

**Conséquences importantes**

- Le compte marchand doit être **dédié à cette application**. Partagé avec un autre site,
  les clients seraient renvoyés au mauvais endroit.
- Comme les URL sont fixes, un déploiement de prévisualisation ne recevra pas les retours
  Digicel : testez le rail direct sur le domaine de production (ou sur un domaine de test
  déclaré dans le portail sandbox).
- Le retour Digicel peut n'apporter qu'un `transactionId` : le code le résout en commande
  via `RetrieveTransactionPayment` (`payment.reference` = notre identifiant de commande).
- Les jetons OAuth de Digicel vivent **59 secondes** ; le cache interne en tient compte.

**Test sandbox** : créez une commande de 5 $ US, payez sur la page sandbox, revenez.
La commande doit passer en `paid` **avec la pastille TEST**, et la notification doit
commencer par « [TEST — aucun argent réel, ne rien envoyer] ». Notez les valeurs observées
dans le tableau « Clés d'identification renvoyées par chaque fournisseur » du README.

**Passage en production** : `MONCASH_MODE=live` **et** des identifiants de production. Le
défaut est `sandbox` exprès — se tromper dans ce sens coûte un paiement de test, se
tromper dans l'autre débite un vrai client sur un portefeuille de test.

---

## 4. Bazik — `BAZIK_USER_ID`, `BAZIK_SECRET_KEY`, `BAZIK_MODE`

Agrégateur haïtien qui fronte MonCash avec des identifiants **en libre-service** : la
solution pour accepter MonCash pendant que le dossier Digicel avance.

1. Créez un compte marchand sur **bazik.io** et demandez l'accès API (`api.bazik.io`).
2. Récupérez dans le tableau de bord le **User ID** (parfois écrit « userID » ou
   simplement « ID ») et la **Secret Key**.
3. Renseignez :

   ```dotenv
   MONCASH_PROVIDER=bazik
   BAZIK_USER_ID=…          # BAZIK_ID est accepté comme synonyme
   BAZIK_SECRET_KEY=…
   BAZIK_MODE=              # facultatif : sandbox | live
   ```

**À savoir**

- **L'environnement vit dans la clé** : Bazik a une seule URL de base et route vers le
  MonCash de test ou de production selon la clé utilisée. Le code infère le mode
  (`sandbox` si l'identifiant contient `sandbox` ou `_test`) et le **confirme** avec le
  champ `environment` de la réponse. `BAZIK_MODE` ne sert qu'à forcer l'affichage.
- **L'identifiant de commande est le leur** : nous envoyons notre `order.id` en
  `referenceId`, Bazik renvoie son propre `orderId` (`BZK_sandbox_…`) — c'est **lui** qui
  est stocké en `provider_ref` et qui sert à vérifier le paiement.
- Les URL de retour, d'erreur et de webhook sont envoyées **à chaque paiement** : rien à
  déclarer dans un portail, et les prévisualisations Vercel fonctionnent telles quelles.

---

## 5. Kobara (NatCash) — `KOBARA_SECRET_KEY`, `KOBARA_WEBHOOK_SECRET`, `KOBARA_MODE`, `KOBARA_API_BASE`

NatCash n'est proposé que si Kobara est configuré.

1. Créez un compte marchand sur **kobara.app** et activez le moyen de paiement **NatCash**.
2. Dans le dashboard, section **API keys**, copiez la **clé secrète serveur** :
   `kbr_sk_test_…` (test) ou `kbr_sk_live_…` (production). Elle ne doit jamais apparaître
   côté navigateur.
3. Dans la section **Webhooks**, créez un endpoint :

   | Champ | Valeur |
   |---|---|
   | URL | `https://votre-domaine/api/webhooks/natcash` |
   | Événement | `payment.succeeded` (et les autres événements de paiement si proposés) |

   Copiez le **secret de signature** affiché à la création dans `KOBARA_WEBHOOK_SECRET`.
4. Renseignez :

   ```dotenv
   KOBARA_SECRET_KEY=kbr_sk_test_…
   KOBARA_WEBHOOK_SECRET=…
   KOBARA_MODE=              # facultatif : sandbox | live
   KOBARA_API_BASE=          # facultatif, tests seulement (défaut https://api.kobara.app)
   ```

**Le secret de webhook n'est pas optionnel sur ce rail.** Kobara ne documente pas
d'endpoint de lecture fiable : **seul le webhook signé** (HMAC-SHA256, en-tête
`Kobara-Signature: t=<horodatage unix>,v1=<hex>`, fenêtre de 5 minutes) fait passer une
commande NatCash en `paid`. Sans ce secret, `/api/webhooks/natcash` répond **503** et
toutes les commandes NatCash finiront en `needs_review` (vérification manuelle).

Le mode se lit sur la clé : `_test_` ⇒ sandbox, sinon **live par défaut** (mieux vaut
afficher « live » à tort que tamponner TEST sur un vrai débit). `KOBARA_MODE` force
l'affichage si le préfixe de la clé change.

**Test** : payez une commande NatCash de test ; le webhook doit arriver en quelques
secondes et la commande passer en `paid`. S'il n'arrive pas, la commande reste
`pending_payment` puis part en `needs_review` au retour client : regardez le journal des
webhooks (`webhook_logs`) et l'URL déclarée.

---

## 6. Resend — `RESEND_API_KEY`, `RESEND_FROM` (obligatoire)

L'email est le **seul canal fiable** pour les alertes « à recharger » : ni fenêtre de 24 h,
ni bac à sable, ni ré-inscription toutes les 72 heures. `/admin/sante` l'affiche en rouge
tant qu'il manque.

1. Créez un compte sur **resend.com**.
2. **Domains → Add domain** : ajoutez votre domaine et publiez les enregistrements DNS
   proposés (SPF/DKIM, et DMARC si proposé) chez votre registrar. Attendez le statut
   *Verified* — un expéditeur non vérifié fait rejeter les messages.
3. **API Keys → Create API Key** (droit d'envoi suffit). La clé `re_…` n'est affichée
   qu'une fois.
4. Renseignez :

   ```dotenv
   RESEND_API_KEY=re_…
   RESEND_FROM=Recharge Meru <no-reply@votre-domaine>
   ```

5. Dans `/admin/parametres`, ajoutez au moins une **adresse admin** destinataire, puis
   utilisez le bouton **« Envoyer un email de test »** de `/admin/sante`.

Sans domaine vérifié, Resend n'autorise que son domaine de bac à sable, réservé à
l'adresse du propriétaire du compte : bon pour un premier test, insuffisant en production.

---

## 7. Meta WhatsApp Cloud API — `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_TEMPLATES`, `WHATSAPP_META_TEMPLATE_LANG`

Le canal le plus solide pour joindre les clients haïtiens, mais aussi le plus
administratif : hors de la fenêtre de 24 h ouverte par un message **du client**, Meta ne
délivre que des **modèles approuvés**.

1. **Compte Meta Business** vérifié (business.facebook.com).
2. Sur **developers.facebook.com** : créez une application de type *Business*, ajoutez le
   produit **WhatsApp**.
3. Ajoutez un **numéro d'expéditeur** (un numéro qui n'est pas déjà utilisé dans
   l'application WhatsApp classique) et faites-le vérifier. Notez le
   **Phone number ID** (un nombre, pas le numéro de téléphone) →
   `WHATSAPP_META_PHONE_NUMBER_ID`.
4. **Jeton permanent** : *Business Settings → Users → System users* → créez un utilisateur
   système, donnez-lui accès à l'application WhatsApp, puis *Generate token* avec les
   droits `whatsapp_business_messaging` et `whatsapp_business_management`. Sans date
   d'expiration → `WHATSAPP_META_TOKEN`. (Le jeton de test affiché dans l'interface
   développeur expire en 24 h : il ne sert qu'à un premier essai.)
5. **Modèles** : soumettez les corps fournis dans
   [whatsapp-templates.md](whatsapp-templates.md) (catégorie **Utility**), attendez
   l'approbation, puis collez le mapping :

   ```dotenv
   WHATSAPP_PROVIDER=meta
   WHATSAPP_META_TOKEN=…
   WHATSAPP_META_PHONE_NUMBER_ID=…
   WHATSAPP_META_TEMPLATES={"created":{"fr":"meru_created_fr","ht":"meru_created_ht"}, …}
   WHATSAPP_META_TEMPLATE_LANG=fr
   ```

   Le JSON doit tenir **sur une seule ligne** dans la variable. Un JSON invalide n'est pas
   une erreur bloquante : le code retombe silencieusement sur le message texte libre —
   d'où l'importance du test ci-dessous.
6. Testez avec `/admin/sante` → **« Envoyer un WhatsApp de test »**, puis regardez
   `/admin/notifications` : `sent` avec un identifiant Meta, ou `failed` avec le message
   d'erreur brut de Meta.

**Pièges connus**

- **`WHATSAPP_META_TEMPLATE_LANG` est global** : tous les modèles, y compris ceux en
  kreyòl, doivent être enregistrés chez Meta sous **ce même code de langue** (le kreyòl
  ayisyen n'est pas dans la liste des langues WhatsApp — enregistrez le corps kreyòl sous
  `fr` avec un **nom** différent, par exemple `meru_paid_ht`).
- Un modèle refusé ou en attente ne s'envoie pas : la notification finit en `failed`.
- Sans mapping, les messages ne partent qu'aux clients qui vous ont écrit dans les 24 h.

---

## 8. Twilio WhatsApp — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SANDBOX`

Alternative sans modèles à faire approuver : Twilio envoie le texte rendu. Pratique pour
les alertes **admin** dès le premier jour.

1. Compte sur **twilio.com**. Le tableau de bord affiche **Account SID** (`AC…`) et
   **Auth Token**.
2. Deux voies :
   - **Bac à sable** (immédiat) : *Messaging → Try it out → Send a WhatsApp message*.
     Twilio donne un numéro partagé `+14155238886` et un mot de passe « join … » que
     chaque destinataire doit envoyer depuis son WhatsApp.
   - **Numéro dédié** (production) : demandez l'activation WhatsApp d'un numéro Twilio
     (validation Meta incluse), puis utilisez ce numéro comme expéditeur.
3. Renseignez :

   ```dotenv
   WHATSAPP_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=AC…
   TWILIO_AUTH_TOKEN=…
   TWILIO_WHATSAPP_FROM=+509…      # « whatsapp:+509… » est aussi accepté
   TWILIO_SANDBOX=false            # true pour le bac à sable
   ```

**Limite du bac à sable, à connaître avant de compter dessus** : seuls les numéros ayant
envoyé « join … » reçoivent des messages, et l'autorisation **expire toutes les
72 heures**. Le code en tient compte : en mode bac à sable, les messages **clients** sont
marqués `skipped` (jamais envoyés à moitié), seul l'admin est joint. Le bac à sable n'est
donc pas un canal client.

---

## 9. Site et taux de secours — `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_USD_TO_HTG`

- `NEXT_PUBLIC_SITE_URL` : origine canonique **sans barre finale**
  (`https://recharge-meru.com`). Elle sert aux liens envoyés dans les notifications. Sans
  elle : `https://$VERCEL_URL` sur les prévisualisations, sinon `http://localhost:3000`.
  Les URL de callback des fournisseurs, elles, sont dérivées de l'origine de la requête —
  ne mettez donc pas l'URL de production sur un environnement de prévisualisation.
- `NEXT_PUBLIC_USD_TO_HTG` : taux affiché **uniquement** quand il n'y a pas de base de
  données. Le vrai taux se règle dans `/admin/parametres`.

Ces deux variables sont **publiques** (préfixe `NEXT_PUBLIC_`) : elles arrivent dans le
navigateur. N'y mettez jamais autre chose qu'une URL et un nombre.

---

## 10. Récapitulatif

| Variable | Obligatoire ? | Source | Vérification |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | en production | vous | un lien de notification s'ouvre bien |
| `NEXT_PUBLIC_USD_TO_HTG` | non | vous | taux affiché sans base |
| `DATABASE_URL` | oui (sinon lecture seule) | Neon, chaîne *pooled* | `npm run db:migrate` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | oui (sinon admin fermé) | Clerk → API keys | le formulaire s'affiche sur `/admin/login` |
| `CLERK_SECRET_KEY` | oui (sinon admin fermé) | Clerk → API keys | `/admin` s'ouvre après connexion |
| `ADMIN_EMAILS` | oui | vous | votre adresse ouvre `/admin`, une autre est refusée |
| `CRON_SECRET` | oui (sinon cron inerte) | vous | `curl` avec et sans en-tête |
| `MONCASH_PROVIDER` | **oui en production** | vous (`direct`\|`bazik`) | `/admin/sante` |
| `MONCASH_CLIENT_ID` / `_SECRET` | si `direct` | portail Digicel | paiement sandbox |
| `MONCASH_MODE` | non (défaut `sandbox`) | vous | `/admin/sante` |
| `BAZIK_USER_ID` / `BAZIK_SECRET_KEY` | si `bazik` | dashboard Bazik | paiement sandbox |
| `BAZIK_MODE` | non | vous | `/admin/sante` |
| `KOBARA_SECRET_KEY` | si NatCash | dashboard Kobara | NatCash apparaît sur l'accueil |
| `KOBARA_WEBHOOK_SECRET` | si NatCash | dashboard Kobara → Webhooks | un paiement passe en `paid` |
| `KOBARA_MODE` / `KOBARA_API_BASE` | non | vous | `/admin/sante` |
| `RESEND_API_KEY` / `RESEND_FROM` | **oui** | resend.com | bouton de test |
| `WHATSAPP_PROVIDER` | non | vous (`meta`\|`twilio`) | `/admin/sante` |
| `WHATSAPP_META_*` | si Meta | Meta Business | bouton de test |
| `TWILIO_*` | si Twilio | console Twilio | bouton de test |

`NODE_ENV`, `VERCEL_ENV` et `VERCEL_URL` sont posées par la plateforme : ne les définissez
pas à la main.

---

## 11. Rotation et incidents

| Situation | Geste |
|---|---|
| Téléphone ou ordinateur perdu | Dans Clerk : changez le mot de passe du compte et déconnectez ses appareils. Si le compte lui-même est compromis, retirez son adresse de `ADMIN_EMAILS` puis redéployez — l'accès tombe à la requête suivante. |
| Une clé Clerk a fuité | Clerk → API keys → *Regenerate* la clé secrète, mettez `CLERK_SECRET_KEY` à jour, redéployez. La clé publique n'est pas un secret. |
| Une clé fournisseur a fuité | Révoquez-la chez le fournisseur, créez-en une nouvelle, mettez à jour Vercel, **redéployez**, vérifiez `/admin/sante`. |
| Secret de webhook changé | Mettez à jour `KOBARA_WEBHOOK_SECRET` **avant** de sauvegarder côté Kobara : entre les deux, les webhooks sont rejetés en 401 et les commandes partent en `needs_review`. |
| Passage en production | `MONCASH_MODE=live` + identifiants de production, `MONCASH_PROVIDER` explicite, `NEXT_PUBLIC_SITE_URL` sur le domaine réel, `CRON_SECRET` posé, email vérifié. |
| Doute sur une intégration | `/admin/sante` d'abord : il nomme le fournisseur actif, son mode et la dernière notification admin réussie par canal. |

Aucune de ces valeurs n'est journalisée par l'application : les messages d'erreur affichés
dans l'admin contiennent le texte renvoyé par le fournisseur, jamais la clé utilisée.
