# Modèles WhatsApp (Meta Cloud API)

Les corps **exacts** de chaque message, en français et en kreyòl, avec `{{1}}…{{n}}` dans
l'ordre où l'application envoie les paramètres. Copiez-les tels quels dans le gestionnaire
de modèles WhatsApp, catégorie **Utility**, puis collez le JSON de la
[section 7](#7-le-json-à-coller-dans-whatsapp_meta_templates) dans
`WHATSAPP_META_TEMPLATES`.

Source de vérité : `lib/notifications/templates.ts`. Si ce fichier change, ce document doit
changer avec lui.

---

## 1. Pourquoi des modèles

Hors de la **fenêtre de 24 heures** ouverte par un message *du client*, Meta ne délivre que
des modèles pré-approuvés. Un message de commande arrive presque toujours hors fenêtre :
sans modèle approuvé, il n'arrive pas.

Le code s'adapte tout seul :

- un nom de modèle est mappé pour `(événement, langue)` ⇒ envoi d'un **message template**
  avec `components: [{ type: 'body', parameters: [...] }]` ;
- aucun mapping ⇒ envoi d'un **message texte** (le texte rendu), qui ne passera que dans la
  fenêtre de 24 h.

Twilio, lui, envoie toujours le texte rendu (`Body`) : rien à approuver de notre côté — mais
la politique WhatsApp reste la même, la fenêtre de 24 h s'applique aussi. Ses trois
variables, et où les lire dans la console, sont en
[section 9](#9-twilio--où-trouver-les-trois-valeurs). Le **canal manuel** (`wa.me` depuis la
fiche admin) n'est soumis à aucune de ces limites, puisque c'est vous qui écrivez.

Quand part un message ? À **chacune des deux étapes** qu'une commande traverse — sa
**création** (le client doit encore payer) et son **paiement** (l'opérateur doit envoyer les
dollars) — un email **et** un message WhatsApp partent à l'opérateur et au client. La liste
exacte des événements se règle dans `/admin/parametres`.

---

## 2. Règles à respecter en créant les modèles

1. **Corps uniquement.** L'application n'envoie que le composant `body`. Un modèle avec un
   **en-tête à variable** ou un **bouton à variable** sera refusé à l'envoi (il attend des
   composants que nous n'envoyons pas). Un pied de page **fixe** et un bouton d'URL
   **fixe** sont acceptables.
2. **Même code de langue pour tous les modèles.** `WHATSAPP_META_TEMPLATE_LANG` (défaut
   `fr`) est envoyé avec **chaque** modèle. Le kreyòl ayisyen n'existe pas dans la liste
   des langues WhatsApp : enregistrez le corps kreyòl **sous le même code de langue**
   (`fr`) avec un **nom différent** (`meru_paid_ht`). Le nom distingue la langue, pas le
   code.
3. **Le nombre de variables doit correspondre exactement** au nombre de paramètres envoyés
   (colonnes des tableaux ci-dessous). Un écart donne l'erreur Meta `#132000` et la
   notification finit `failed` dans `/admin/notifications`.
4. **Pas de variables adjacentes** (`{{1}} {{2}}` collés sans texte entre eux) : Meta
   refuse. Les corps ci-dessous respectent déjà cette règle.
5. Si Meta refuse un corps qui **se termine par une variable**, ajoutez une phrase fixe
   finale (« Merci. » / « Mèsi. ») et gardez tout le reste identique — l'ordre des
   variables ne doit pas bouger.
6. **Les paramètres sont nettoyés** avant l'envoi : retours à la ligne et tabulations
   remplacés par une espace, espaces multiples réduits, valeur vide remplacée par « — »
   (Meta refuse ces caractères dans un paramètre).
7. **Préfixe TEST** : pour une commande en bac à sable, `« [TEST — aucun argent réel, ne
   rien envoyer] »` (ou `« [TÈS — pa gen lajan reyèl] »` en kreyòl) est ajouté **devant la
   valeur de `{{1}}`**. Placez donc `{{1}}` là où une valeur longue reste lisible — c'est
   déjà le cas ci-dessous.
8. Corps limité à 1024 caractères ; noms en minuscules, chiffres et tirets bas.

---

## 3. Modèles client — français

**Les seize modèles à faire approuver** : huit événements, deux langues chacun. Les corps
exacts sont plus bas — français dans cette section, kreyòl en [section 4](#4-modèles-client--kreyòl).
Les deux premières lignes sont celles que l'opérateur a demandées : un message **à la
création** et un message **au paiement**, dans les deux langues.

| Événement | Modèle français | Modèle kreyòl | Variables | Quand il part |
|---|---|---|---|---|
| `created` | `meru_created_fr` | `meru_created_ht` | 6 | à la création, la commande n'est pas encore payée |
| `paid` | `meru_paid_fr` | `meru_paid_ht` | 6 | dès que le paiement est confirmé |
| `fulfilled` | `meru_fulfilled_fr` | `meru_fulfilled_ht` | 6 | quand l'opérateur a envoyé les dollars |
| `failed` | `meru_failed_fr` | `meru_failed_ht` | 5 | commande non aboutie |
| `needs_review` | `meru_needs_review_fr` | `meru_needs_review_ht` | 3 | paiement reçu, vérification manuelle |
| `expired` | `meru_expired_fr` | `meru_expired_ht` | 3 | commande expirée sans paiement |
| `refunded` | `meru_refunded_fr` | `meru_refunded_ht` | 4 | remboursement effectué |
| `reminder_24h` | `meru_reminder_24h_fr` | `meru_reminder_24h_ht` | 3 | relance ; **jamais envoyé au client** par défaut |

Si vous ne devez en soumettre que quatre, soumettez `meru_created_fr`, `meru_created_ht`,
`meru_paid_fr` et `meru_paid_ht` : ce sont les deux étapes que tout client traverse.

Locale `fr` : c'est la langue par défaut des commandes.

### `meru_created_fr` — commande créée

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom du client | `Jean` |
| 2 | Référence | `MR-7F3K2QAB` |
| 3 | Montant en dollars | `20 $ US` |
| 4 | Total en gourdes | `2 985 HTG` |
| 5 | Méthode | `MonCash` |
| 6 | Lien de suivi | `https://recharge-meru.com/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, votre commande {{2}} est créée : {{3}} sur votre compte Meru pour {{4}} par {{5}}. Terminez le paiement, gardez cette référence, puis suivez votre commande ici : {{6}}
```

### `meru_paid_fr` — paiement reçu

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Montant reçu en gourdes | `2 985 HTG` |
| 3 | Méthode | `MonCash` |
| 4 | Montant en dollars | `20 $ US` |
| 5 | Délai annoncé | `moins de 2 heures` |
| 6 | Lien de suivi | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, nous avons reçu votre paiement de {{2}} par {{3}}. Merci ! L'opérateur envoie vos {{4}} sur votre compte Meru manuellement, généralement sous {{5}}. Suivi : {{6}}
```

### `meru_fulfilled_fr` — dollars envoyés

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Dollars envoyés | `20 $ US` |
| 3 | Identifiant Meru | `jean@mail.com` |
| 4 | Référence Meru | `MERU-88213` (ou `non communiquée`) |
| 5 | Nom commercial | `Recharge Meru` |
| 6 | Lien de suivi | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, vos {{2}} ont été envoyés sur votre compte Meru {{3}} (référence Meru : {{4}}). Vérifiez votre solde dans l'application Meru. Merci d'avoir choisi {{5}}. Détails : {{6}}
```

### `meru_failed_fr` — commande non aboutie

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Référence | `MR-7F3K2QAB` |
| 3 | Raison | `paiement non abouti` |
| 4 | WhatsApp support (ou nom commercial) | `+509 3700 1234` |
| 5 | Lien de suivi | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, la commande {{2}} n'a pas pu aboutir : {{3}}. Si un montant a été débité, écrivez-nous sur WhatsApp ({{4}}) : nous le réglons rapidement. Détails : {{5}}
```

### `meru_expired_fr` — commande expirée

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Référence | `MR-7F3K2QAB` |
| 3 | Lien pour recommencer | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, la commande {{2}} a expiré sans paiement : rien n'a été débité. Pour recommencer, ouvrez : {{3}}
```

### `meru_needs_review_fr` — vérification en cours

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Référence | `MR-7F3K2QAB` |
| 3 | Lien de suivi | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, nous avons bien reçu un paiement pour la commande {{2}}. Une vérification manuelle est en cours ; nous vous contactons sur WhatsApp. Suivi : {{3}}
```

### `meru_refunded_fr` — remboursement

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Montant remboursé | `2 985 HTG` |
| 3 | Portefeuille | `+509 3700 1234` |
| 4 | Référence | `MR-7F3K2QAB` |

```
Bonjour {{1}}. Nous vous avons remboursé {{2}} sur le portefeuille {{3}} pour la commande {{4}}.
```

### `meru_reminder_24h_fr` — toujours en cours

| # | Contenu | Exemple |
|---|---|---|
| 1 | Prénom | `Jean` |
| 2 | Référence | `MR-7F3K2QAB` |
| 3 | Lien de suivi | `https://…/fr/commande/MR-7F3K2QAB` |

```
Bonjour {{1}}, votre commande {{2}} est toujours en cours de traitement. Nous vous prévenons dès que vos dollars sont envoyés. Suivi : {{3}}
```

---

## 4. Modèles client — kreyòl

Mêmes paramètres, dans le **même ordre** que la version française. À enregistrer sous le
code de langue de `WHATSAPP_META_TEMPLATE_LANG` (voir §2, règle 2). Les montants en dollars
arrivent déjà écrits « 20 dola US ».

### `meru_created_ht`

```
Bonjou {{1}}, kòmand ou {{2}} kreye : {{3}} sou kont Meru ou pou {{4}} pa {{5}}. Fini peman an, kenbe referans sa a, epi swiv kòmand ou isit la : {{6}}
```

### `meru_paid_ht`

```
Bonjou {{1}}, nou resevwa peman {{2}} ou pa {{3}}. Mèsi ! Operatè a ap voye {{4}} sou kont Meru ou manyèlman, anjeneral nan {{5}}. Swiv kòmand ou : {{6}}
```

### `meru_fulfilled_ht`

```
Bonjou {{1}}, {{2}} ou voye sou kont Meru ou {{3}} (referans Meru : {{4}}). Tcheke balans ou nan aplikasyon Meru a. Mèsi paske ou chwazi {{5}}. Detay : {{6}}
```

### `meru_failed_ht`

```
Bonjou {{1}}, kòmand {{2}} pa t ka abouti : {{3}}. Si yo te retire lajan sou kont ou, ekri nou sou WhatsApp ({{4}}) : n ap regle sa vit. Detay : {{5}}
```

### `meru_expired_ht`

```
Bonjou {{1}}, kòmand {{2}} ekspire san peman : yo pa t retire anyen sou kont ou. Pou rekòmanse, louvri : {{3}}
```

### `meru_needs_review_ht`

```
Bonjou {{1}}, nou byen resevwa yon peman pou kòmand {{2}}. N ap fè yon verifikasyon manyèl ; n ap kontakte w sou WhatsApp. Swiv : {{3}}
```

### `meru_refunded_ht`

```
Bonjou {{1}}. Nou ranbouse w {{2}} sou bous {{3}} pou kòmand {{4}}.
```

### `meru_reminder_24h_ht`

```
Bonjou {{1}}, kòmand ou {{2}} toujou ap trete. N ap avèti w kou dola yo voye. Swiv : {{3}}
```

---

## 5. Messages admin (français) — et la limite à connaître

Les alertes admin partent **toujours en français**. Le code choisit le nom de modèle avec
le couple `(événement, langue)` : **une alerte admin `paid` et un message client `paid` en
français demandent donc le même nom de modèle**, alors qu'ils n'ont pas le même nombre de
variables (12 contre 6).

**Conséquence pratique**

| Situation | Ce qui se passe |
|---|---|
| Un événement est dans **les deux** matrices (client et admin) et son modèle `fr` est mappé | Le modèle est écrit pour le client ; l'alerte admin envoie 12 paramètres pour 6 variables ⇒ **échec Meta `#132000`**, visible dans `/admin/notifications`. |
| Un événement n'est que dans la matrice **admin** | Aucune collision : le modèle `fr` peut porter le corps admin ci-dessous. |

**Recommandation** — et c'est la raison pour laquelle l'email est obligatoire :

1. Mappez les modèles `fr` sur les **corps client** (§3) : les clients sont ceux qui se
   trouvent hors fenêtre de 24 h.
2. Faites reposer vos alertes **admin** sur l'**email** (obligatoire) et le **canal manuel**.
   Concrètement, avec Meta actif, laissez *Paramètres → numéros WhatsApp admin* **vide**
   pour les événements partagés — par défaut `created` et `paid` (les deux étapes, envoyées
   aux deux publics), ainsi que `needs_review` et `failed`.
3. Si vous voulez malgré tout une alerte admin WhatsApp modélisée, choisissez un événement
   **absent de la matrice client** — par défaut `reminder_24h` (et `expired`, `fulfilled`,
   `refunded` si vous les retirez côté client) — et écrivez son modèle `fr` avec le corps
   admin correspondant.

Avec **Twilio**, rien de tout cela ne s'applique : le texte rendu part tel quel, l'alerte
admin et le message client ne partagent aucun nom de modèle, et les numéros WhatsApp de
l'opérateur peuvent donc rester renseignés pour les deux étapes.

Les corps admin, si vous en enregistrez :

| Événement | Variables | Corps |
|---|---|---|
| `paid` | 12 | `💰 PAYÉE {{1}} — envoyer {{2}} sur Meru. Reçu {{3}} (attendu {{4}}) par {{5}}, tx {{6}}, payeur {{7}}. Compte Meru : {{8}} {{9}} — {{10}}, tél. {{11}}. Ouvrir : {{12}}` |
| `needs_review` | 13 | `🔍 À VÉRIFIER {{1}} — {{2}}. {{3}} ({{4}}) par {{5}}, reçu {{6}}, tx {{7}}, payeur {{8}}. Compte Meru : {{9}} {{10}} — {{11}}, tél. {{12}}. Ouvrir : {{13}}` |
| `failed` | 8 | `⚠️ Échec {{1}} : {{2}}. {{3}} ({{4}}) par {{5}} — {{6}}, tél. {{7}}. Ouvrir : {{8}}` |
| `created` | 10 | `🆕 Nouvelle commande {{1}} — {{2}} ({{3}}) par {{4}}, en attente de paiement, expire le {{5}}. Compte Meru : {{6}} {{7}} — {{8}}, tél. {{9}}. Ouvrir : {{10}}` |
| `fulfilled` | 6 | `✅ Rechargée {{1}} — {{2}} envoyés sur {{3}} ({{4}}) pour {{5}}. Ouvrir : {{6}}` |
| `expired` | 8 | `⌛ Expirée {{1}} — {{2}} ({{3}}) par {{4}}, jamais payée (échéance {{5}}). {{6}}, tél. {{7}}. Ouvrir : {{8}}` |
| `refunded` | 5 | `↩️ Remboursée {{1}} — {{2}} sur {{3}} pour {{4}}. Ouvrir : {{5}}` |
| `reminder_24h` | 3 | `⏰ Toujours à recharger : {{1}} ({{2}}) payée il y a 24 h. {{3}}` |

Ordre des variables admin (l'ordre d'apparition dans le texte) :

| Événement | Paramètres |
|---|---|
| `paid` | référence, dollars, gourdes reçues, gourdes attendues, méthode, transaction, portefeuille payeur, type d'identifiant, identifiant Meru, nom complet, téléphone, lien fiche |
| `needs_review` | référence, raison, dollars, gourdes attendues, méthode, gourdes reçues, transaction, payeur, type d'identifiant, identifiant, nom, téléphone, lien |
| `failed` | référence, raison, dollars, gourdes, méthode, nom, téléphone, lien |
| `created` | référence, dollars, gourdes, méthode, expiration, type d'identifiant, identifiant, nom, téléphone, lien |
| `fulfilled` | référence, dollars envoyés, identifiant Meru, référence Meru, nom, lien |
| `expired` | référence, dollars, gourdes, méthode, expiration, nom, téléphone, lien |
| `refunded` | référence, montant remboursé, portefeuille, nom, lien |
| `reminder_24h` | référence, dollars, lien |

Le texte libre (email, Twilio, canal manuel) distingue « Création impossible » et
« Échouée » pour l'événement `failed` ; un modèle Meta unique ne peut pas faire cette
distinction, d'où le mot neutre « Échec » dans le corps ci-dessus. La raison exacte reste
dans `{{2}}`.

---

## 6. Soumission à Meta, pas à pas

1. **WhatsApp Manager → Modèles de messages → Créer un modèle**.
2. Catégorie **Utility** (ce sont des notifications de transaction, pas du marketing : une
   catégorie *Marketing* coûte plus cher et peut être bloquée par le client).
3. Nom : celui du tableau de la [section 7](#7-le-json-à-coller-dans-whatsapp_meta_templates).
4. Langue : celle de `WHATSAPP_META_TEMPLATE_LANG` (`fr` par défaut) — **y compris pour les
   modèles kreyòl**.
5. Corps : coller le bloc, sans en-tête ni bouton à variable.
6. **Exemples de valeurs** : Meta les exige pour la revue. Reprenez la colonne « Exemple »
   des tableaux ci-dessus (pour un modèle kreyòl, les mêmes valeurs conviennent).
7. Envoyer, attendre l'approbation (quelques minutes à 24 h). Un modèle *En attente* ou
   *Refusé* ne s'envoie pas.

---

## 7. Le JSON à coller dans `WHATSAPP_META_TEMPLATES`

Une seule ligne, guillemets doubles, sans espace superflu :

```json
{"created":{"fr":"meru_created_fr","ht":"meru_created_ht"},"paid":{"fr":"meru_paid_fr","ht":"meru_paid_ht"},"fulfilled":{"fr":"meru_fulfilled_fr","ht":"meru_fulfilled_ht"},"failed":{"fr":"meru_failed_fr","ht":"meru_failed_ht"},"expired":{"fr":"meru_expired_fr","ht":"meru_expired_ht"},"needs_review":{"fr":"meru_needs_review_fr","ht":"meru_needs_review_ht"},"refunded":{"fr":"meru_refunded_fr","ht":"meru_refunded_ht"},"reminder_24h":{"fr":"meru_reminder_24h_fr","ht":"meru_reminder_24h_ht"}}
```

Règles de lecture appliquées par le code :

- une entrée peut être une **chaîne** au lieu d'un objet (`"paid": "meru_paid"`) : ce nom
  sert alors pour toutes les langues ;
- une langue absente **retombe sur `fr`** ;
- un événement absent du JSON part **en texte libre** ;
- un JSON invalide est ignoré **silencieusement** (tout part en texte libre) — d'où le test
  de la section suivante.

N'inscrivez un nom dans ce JSON qu'**après** approbation du modèle : un nom inconnu de Meta
fait échouer l'envoi au lieu de le faire basculer en texte.

Commencez petit si vous voulez : mappez d'abord `created`, `paid` et `fulfilled` (les trois
messages que tout client reçoit), ajoutez les autres ensuite.

---

## 8. Tester

**Depuis l'application** : `/admin/sante` → « Envoyer un WhatsApp de test », puis
`/admin/notifications` — statut `sent` avec un identifiant Meta, ou `failed` avec l'erreur
brute renvoyée par Meta.

**Directement chez Meta** (utile pour valider un corps sans passer par l'application) :

```bash
curl -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_META_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "50937001234",
    "type": "template",
    "template": {
      "name": "meru_paid_fr",
      "language": { "code": "fr" },
      "components": [{ "type": "body", "parameters": [
        { "type": "text", "text": "Jean" },
        { "type": "text", "text": "2 985 HTG" },
        { "type": "text", "text": "MonCash" },
        { "type": "text", "text": "20 $ US" },
        { "type": "text", "text": "moins de 2 heures" },
        { "type": "text", "text": "https://recharge-meru.com/fr/commande/MR-7F3K2QAB" }
      ]}]
    }
  }'
```

Le destinataire s'écrit **sans le `+`**. Les erreurs les plus fréquentes :

| Erreur Meta | Cause | Correction |
|---|---|---|
| `#132000` nombre de paramètres | Le corps n'a pas le même nombre de `{{n}}` que la liste envoyée | Recompter avec les tableaux ci-dessus (attention aux messages admin, §5) |
| `#132001` modèle introuvable | Nom ou code de langue faux | Vérifier le nom exact et `WHATSAPP_META_TEMPLATE_LANG` |
| `#132005` modèle non approuvé | Modèle en attente ou refusé | Attendre / corriger, retirer le nom du JSON en attendant |
| `#131047` fenêtre expirée | Message texte hors fenêtre de 24 h | Mapper un modèle pour cet événement |
| `#131030` numéro non autorisé | Compte en mode développement | Ajouter le numéro aux destinataires de test, ou passer le compte en production |

---

## 9. Twilio — où trouver les trois valeurs

Avec Twilio il n'y a **aucun modèle à créer** : l'application envoie le texte déjà rendu
(`Body`), en français ou en kreyòl selon la commande. Trois variables suffisent.

### 9.1 `TWILIO_ACCOUNT_SID` et `TWILIO_AUTH_TOKEN`

1. Ouvrez [console.twilio.com](https://console.twilio.com) et connectez-vous.
2. Sur la page d'accueil de la console, encadré **Account Info** (en bas de la page projet).
3. **Account SID** — une chaîne de 34 caractères qui commence par `AC`. Copiez-la telle
   quelle dans `TWILIO_ACCOUNT_SID`.
4. **Auth Token** — masqué : cliquez sur l'œil (« Show ») ou sur **Copy**. C'est le mot de
   passe du compte : il ouvre l'envoi de SMS payants, ne le mettez jamais dans un fichier
   suivi par git ni dans une capture d'écran. Collez-le dans `TWILIO_AUTH_TOKEN`.
   S'il a fuité : **Account → API keys & tokens → Auth tokens → Request a secondary token**,
   puis promotion, et remplacez la valeur ici.

L'application n'envoie ces deux valeurs qu'à `api.twilio.com`, en authentification **Basic**
(SID en utilisateur, jeton en mot de passe) ; elles ne sont jamais journalisées ni renvoyées
au navigateur, et un message d'erreur Twilio ne les contient jamais.

### 9.2 `TWILIO_WHATSAPP_FROM` — deux cas, très différents

**a) Bac à sable (gratuit, immédiat, ADMIN SEULEMENT)**

1. **Messaging → Try it out → Send a WhatsApp message**.
2. Twilio affiche un numéro (`+1 415 523 8886`) et un code du type `join <deux-mots>`.
3. Depuis **votre** WhatsApp, envoyez ce code à ce numéro. Twilio répond « connected ».
4. `TWILIO_WHATSAPP_FROM=+14155238886` et `TWILIO_SANDBOX=true`.

Ce mode ne parle qu'aux numéros qui ont fait « join », et cette autorisation **expire toutes
les 72 heures**. L'application le sait : les messages **clients** ne sont pas tentés, ils
sont journalisés dans `/admin/notifications` avec la raison en toutes lettres — « Bac à sable
Twilio : seuls les numéros ayant envoyé "join" reçoivent, les messages client ne partent
pas ». `/admin/sante` l'affiche en orange. Les clients restent prévenus **par email** et par
le bouton **« Envoyer sur WhatsApp »** de la fiche de commande.

**b) Numéro WhatsApp approuvé (le vrai mode, celui qui écrit aux clients)**

1. **Messaging → Senders → WhatsApp senders → New WhatsApp sender**.
2. Suivez l'enregistrement Meta (profil d'entreprise, numéro qui n'est **pas** déjà utilisé
   par l'application WhatsApp, vérification par code).
3. Une fois le sender **approuvé**, copiez son numéro dans `TWILIO_WHATSAPP_FROM` (format
   international, ex. `+50937001234`) et mettez `TWILIO_SANDBOX=false`.
4. Les modèles restent utiles hors fenêtre de 24 h : Twilio les gère sous le nom de
   *Content Templates* (**Content Template Builder**). L'application, elle, envoie du texte ;
   avec Twilio, gardez donc l'email comme canal de référence pour ce qui sort de la fenêtre.

Le préfixe `whatsapp:` est **accepté et retiré** (`whatsapp:+14155238886` fonctionne), tout
comme les espaces, points, tirets et parenthèses d'un copier-coller de la console. Ce qui
n'est pas accepté : un numéro sans `+` et sans indicatif — `/admin/sante` affiche alors
« TWILIO_WHATSAPP_FROM n'est pas un numéro au format international » et aucun message ne
part (raison `bad_sender` dans le journal), plutôt qu'un code Twilio 21212 dix secondes plus
tard.

### 9.3 Choisir Twilio quand les deux fournisseurs sont configurés

`WHATSAPP_PROVIDER=twilio`. Vide, Meta gagne s'il est configuré. Un nom sans identifiants
**désactive** WhatsApp — jamais de bascule silencieuse vers l'autre fournisseur.

### 9.4 Vérifier

`/admin/sante` → **Envoyer un WhatsApp de test**, puis `/admin/notifications` : `sent` avec
l'identifiant `SM…` renvoyé par Twilio, ou `failed` avec le code Twilio et son message
(`HTTP 400 — 63016 — Failed to send freeform message`, par exemple). Les codes les plus
fréquents :

| Code Twilio | Cause | Correction |
|---|---|---|
| `21211` | Le numéro destinataire n'est pas au format E.164 | Le téléphone de la commande doit commencer par `+` |
| `21212` | `TWILIO_WHATSAPP_FROM` invalide | Écrire l'expéditeur en `+indicatif…` |
| `63015` / `63016` | Hors fenêtre de 24 h sans modèle approuvé | Passer par un *Content Template* Twilio, ou compter sur l'email |
| `63007` | L'expéditeur n'est pas un sender WhatsApp du compte | Terminer l'enregistrement du sender (§9.2 b) |
| `20003` | Authentification refusée | SID ou jeton faux, ou jeton régénéré |

---

## 10. Les deux autres canaux

- **Canal manuel** — le bouton « Envoyer sur WhatsApp » de chaque fiche de commande ouvre
  `wa.me` avec le message déjà écrit ; il suffit d'appuyer sur envoyer. L'envoi est
  journalisé (`whatsapp_manual`) pour que la commande garde une trace. Aucune fenêtre de
  24 h ne s'y applique, puisque c'est vous qui écrivez.
- **Email** — le canal qui ne dépend d'aucune fenêtre : c'est lui qui garantit qu'une
  commande payée finit par être vue. Il part à **trois** destinataires : l'opérateur (chaque
  adresse de *Paramètres → Emails de l'opérateur*), l'adresse saisie dans le formulaire de
  commande, et celle du compte client quand la commande a été passée en étant connecté —
  dédoublonnées, une seule fois quand les deux ne font qu'une.
