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
la politique WhatsApp reste la même, la fenêtre de 24 h s'applique aussi. Le **canal
manuel** (`wa.me` depuis la fiche admin) n'est soumis à aucune de ces limites, puisque c'est
vous qui écrivez.

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
Bonjour {{1}}, votre commande {{2}} est créée : {{3}} sur votre compte Meru pour {{4}} par {{5}}. Terminez le paiement, puis suivez votre commande ici : {{6}}
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
Bonjou {{1}}, kòmand ou {{2}} kreye : {{3}} sou kont Meru ou pou {{4}} pa {{5}}. Fini peman an, epi swiv kòmand ou isit la : {{6}}
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
   pour les événements partagés (`paid`, `needs_review`, `failed` par défaut).
3. Si vous voulez malgré tout une alerte admin WhatsApp modélisée, choisissez un événement
   **absent de la matrice client** — par défaut `reminder_24h` (et `created`, `expired`,
   `fulfilled`, `refunded` si vous les retirez côté client) — et écrivez son modèle `fr`
   avec le corps admin correspondant.

Les corps admin, si vous en enregistrez :

| Événement | Variables | Corps |
|---|---|---|
| `paid` | 12 | `💰 PAYÉE {{1}} — envoyer {{2}} sur Meru. Reçu {{3}} (attendu {{4}}) par {{5}}, tx {{6}}, payeur {{7}}. Compte Meru : {{8}} {{9}} — {{10}}, tél. {{11}}. Ouvrir : {{12}}` |
| `needs_review` | 13 | `🔍 À VÉRIFIER {{1}} — {{2}}. {{3}} ({{4}}) par {{5}}, reçu {{6}}, tx {{7}}, payeur {{8}}. Compte Meru : {{9}} {{10}} — {{11}}, tél. {{12}}. Ouvrir : {{13}}` |
| `failed` | 8 | `⚠️ Échec {{1}} : {{2}}. {{3}} ({{4}}) par {{5}} — {{6}}, tél. {{7}}. Ouvrir : {{8}}` |
| `created` | 10 | `🆕 Nouvelle commande {{1}} — {{2}} ({{3}}) par {{4}}, expire le {{5}}. Compte Meru : {{6}} {{7}} — {{8}}, tél. {{9}}. Ouvrir : {{10}}` |
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

## 9. Et sans Meta ?

- **Twilio** — aucun modèle à créer : le texte rendu est envoyé tel quel. En **bac à sable**
  Twilio, seuls les numéros ayant envoyé « join … » reçoivent, l'autorisation expire toutes
  les **72 heures**, et les messages **clients** sont volontairement `skipped` par
  l'application. Utilisable pour vos propres alertes, pas pour les clients.
- **Canal manuel** — le bouton « Envoyer sur WhatsApp » de chaque fiche de commande ouvre
  `wa.me` avec le message déjà écrit ; il suffit d'appuyer sur envoyer. L'envoi est
  journalisé (`whatsapp_manual`) pour que la commande garde une trace.
- **Email** — le canal qui ne dépend d'aucune fenêtre : c'est lui qui garantit qu'une
  commande payée finit par être vue.
