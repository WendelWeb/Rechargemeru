# WhatsApp — mise en service, de A à Z

Ce guide part de zéro et va jusqu'aux messages automatiques envoyés à tes
clients. Il est écrit pour Recharge Meru et pour un opérateur seul en Haïti.

Le code est déjà prêt : il attend seulement des clés. Rien de ce qui suit ne
demande une modification du programme.

---

## Ce qu'il faut comprendre avant de commencer

WhatsApp n'est pas un SMS. Personne ne peut écrire à un client sans passer par
Meta, et Meta impose trois choses :

1. **Un numéro dédié.** Il devient l'expéditeur de l'entreprise et ne sert plus
   de WhatsApp personnel.
2. **Une entreprise identifiée.** Meta veut savoir qui écrit.
3. **Des messages écrits d'avance.** On ne peut pas envoyer n'importe quel texte
   à quelqu'un qui ne t'a pas écrit dans les 24 heures. Il faut des « modèles »
   approuvés à l'avance.

Twilio est un intermédiaire devant Meta. Il simplifie l'inscription et fournit
un bac à sable pour tester tout de suite, mais c'est Meta qui approuve, et
Twilio ajoute sa marge sur chaque message.

Le programme sait parler aux deux. Aujourd'hui, choisis Twilio : l'inscription
est guidée et le bac à sable te fait gagner deux semaines.

---

## Étape 0 — Aujourd'hui, en dix minutes : tes propres alertes

Objectif : recevoir sur ton téléphone un message à chaque commande, sans
attendre aucune approbation. Tes clients, eux, recevront leurs emails, et tu
leur écriras à la main depuis la fiche de commande (voir l'étape 1).

1. Crée un compte sur **twilio.com**. Le compte d'essai suffit pour le bac à
   sable ; l'inscription d'un vrai expéditeur exigera un compte payant.
2. Dans la console Twilio, ouvre **Messaging → Try it out → Send a WhatsApp
   message**. Twilio affiche un numéro partagé, `+14155238886`, et un code de
   la forme `join xxxx-yyyy`.
3. Depuis **ton** WhatsApp, envoie exactement ce texte `join xxxx-yyyy` au
   numéro `+14155238886`. Twilio répond pour confirmer.
4. Sur la page d'accueil de la console, relève dans l'encadré **Account Info** :
   - **Account SID**, 34 caractères commençant par `AC`
   - **Auth Token**, bouton « Show »
5. Envoie-moi ces deux valeurs. Je pose dans Vercel :

   ```
   TWILIO_ACCOUNT_SID     = AC……
   TWILIO_AUTH_TOKEN      = ……
   TWILIO_WHATSAPP_FROM   = +14155238886
   TWILIO_SANDBOX         = true
   ```

6. Va ensuite dans **/admin/parametres**, section « WhatsApp de l'opérateur »,
   et mets ton numéro au format `+509XXXXXXXX`, un par ligne. **Cette liste est
   vide par défaut : sans elle tu ne reçois rien, même avec les clés posées.**

### Les deux limites du bac à sable, à connaître

- **Tes clients ne reçoivent rien.** Seuls les numéros ayant envoyé le code
  `join` sont joignables. Le programme le sait : il marque ces envois
  « ignorés » dans `/admin/notifications` au lieu de faire croire à un succès.
- **L'autorisation expire au bout de trois jours**, et l'envoi libre dépend
  d'une fenêtre de 24 heures ouverte par ton dernier message entrant. En clair :
  **réécris `join xxxx-yyyy` au numéro Twilio une fois par jour** tant que tu es
  dans le bac à sable, sinon tes alertes s'arrêtent en silence. La page
  `/admin/sante` te dit quand la dernière notification est passée.

---

## Étape 1 — Tes clients, dès aujourd'hui, sans rien approuver

Dans la fiche d'une commande, le bouton **« Envoyer sur WhatsApp »** ouvre
WhatsApp sur ton téléphone avec le message déjà rédigé, en français ou en
kreyòl selon la langue du client. Tu relis, tu appuies sur envoyer.

Trois avantages qui ne sont pas des consolations :

- aucune approbation, aucun coût, aucun délai ;
- le message part de **ton vrai numéro**, que le client peut rappeler — pour un
  service qui manipule son argent, cela inspire davantage confiance qu'un numéro
  inconnu ;
- l'envoi est journalisé dans la fiche, donc l'historique reste complet.

C'est la solution à garder tant que la vérification Meta n'est pas finie, et
même après pour les cas délicats.

---

## Étape 2 — L'expéditeur approuvé, de A à Z

À faire en parallèle de l'étape 0, parce que la vérification Meta prend
plusieurs semaines.

### A. Choisir le numéro

Il te faut un numéro **qui n'a aucun compte WhatsApp**. Si tu comptes utiliser
un numéro qui en a un, ouvre d'abord WhatsApp sur ce téléphone et fais
**Paramètres → Compte → Supprimer mon compte**. Sans cela, l'inscription sera
refusée.

Le numéro doit pouvoir recevoir un SMS ou un appel : Meta y enverra un code.
Un numéro qui ne reçoit rien, ou branché sur un répondeur automatique, ne
fonctionnera pas.

Tu peux acheter un numéro chez Twilio ou apporter le tien. Un numéro haïtien
convient.

**Ce numéro ne servira plus de WhatsApp normal.** Ne prends pas celui que tes
clients connaissent déjà, à moins d'accepter de le transformer en compte
d'entreprise.

### B. Passer le compte Twilio en payant

L'inscription d'un expéditeur exige un compte Twilio **upgraded**. Ajoute un
moyen de paiement dans la console. Le crédit initial est faible ; tu ne paies
qu'à l'usage.

### C. Créer l'expéditeur

Dans la console Twilio : **Messaging → Senders → WhatsApp senders → Create new
sender**.

1. Indique le numéro choisi.
2. Clique **Continue with Facebook**. Une fenêtre Meta s'ouvre.
3. Connecte-toi avec ton compte Facebook.
4. **Crée ou choisis un portefeuille Meta Business.** C'est l'identité de ton
   entreprise chez Meta. Mets le nom sous lequel tu exerces réellement.
5. **Crée le compte WhatsApp Business (WABA).**
6. **Renseigne le profil** : nom d'affichage, catégorie, description, site web.
   - Le **nom d'affichage** est ce que tes clients verront. « Recharge Meru »
     convient. Il doit correspondre à ton activité réelle ; un nom fantaisiste
     ou trompeur est refusé.
   - Mets `https://rechargemeru.vercel.app` comme site, ou ton domaine quand tu
     en auras un. Un site qui existe et qui décrit le service aide à
     l'approbation.
7. **Vérifie la propriété du numéro** avec le code reçu par SMS ou par appel.

Twilio traite l'inscription en quelques minutes, puis l'expéditeur apparaît
dans la liste.

### D. La vérification d'entreprise chez Meta

C'est l'étape longue. Meta demande des documents prouvant que l'entreprise
existe, **au nom exact que tu as déclaré** : registre du commerce, patente,
document fiscal, facture d'un service au nom de l'entreprise. Le nom sur les
documents et le nom du portefeuille doivent correspondre à la lettre.

Compte **plusieurs semaines** selon la région. Tu peux relancer si le dossier
reste bloqué.

**Bonne nouvelle : tu n'es pas obligé d'attendre la fin pour écrire à tes
clients.** Avant la vérification, tu es plafonné à **250 conversations
engagées par toi et par tranche de 24 heures**. Pour un service qui démarre,
c'est largement suffisant. La vérification sert à lever ce plafond.

### E. Faire approuver les modèles de messages

Un message envoyé à quelqu'un qui ne t'a pas écrit dans les 24 dernières heures
doit être un **modèle approuvé**. Le fichier `docs/whatsapp-templates.md`
contient les tiens, déjà rédigés en français et en kreyòl, avec l'ordre exact
de leurs variables.

Commence par les quatre qui comptent :

| Modèle | Qui le reçoit | Quand |
|---|---|---|
| `created` | le client | commande créée, paiement à faire |
| `paid` | le client | paiement reçu, dollars en route |
| `fulfilled` | le client | dollars envoyés sur Meru |
| `paid` (admin) | toi | une commande est payée, à recharger |

Soumets-les dans **Messaging → Content Template Builder** chez Twilio, en
catégorie **Utility**. L'approbation prend de quelques minutes à quelques
heures. Une catégorie « Marketing » déclarée à tort est le motif de refus le
plus courant : tes messages sont bien des messages de service.

### F. Basculer en production

Quand l'expéditeur est actif, envoie-moi le numéro approuvé. Je remplace dans
Vercel :

```
TWILIO_WHATSAPP_FROM = +509……      (ton numéro approuvé)
TWILIO_SANDBOX       = false
```

Et je pose la correspondance entre nos modèles et leurs noms approuvés. À partir
de là, les clients reçoivent leurs messages automatiquement, aux deux étapes,
dans leur langue.

---

## Ce que ça coûte

Meta facture **au message**, selon la catégorie et le pays du destinataire. Tes
messages de commande sont des messages **utilitaires**, la catégorie la moins
chère. Twilio ajoute sa marge par message.

Deux économies à connaître :

- Un message envoyé **dans les 24 heures** suivant un message du client est
  gratuit et n'a pas besoin d'être un modèle. Si ton client t'écrit, la
  conversation qui suit ne coûte rien.
- Les emails, eux, ne coûtent presque rien et partent déjà. WhatsApp est un
  confort qui augmente la confiance, pas une nécessité pour encaisser.

---

## Si un message ne part pas

Ouvre **/admin/notifications**. Chaque tentative y figure avec sa raison, en
français :

| Ce que tu lis | Ce que ça veut dire |
|---|---|
| Canal non configuré sur ce serveur | Les clés Twilio manquent dans Vercel. |
| Bac à sable Twilio : client ignoré | Normal avant l'expéditeur approuvé. |
| Numéro expéditeur invalide | `TWILIO_WHATSAPP_FROM` mal écrit. |
| 63016 ou message libre refusé | Hors fenêtre de 24 heures : il faut un modèle approuvé. |
| 63015 | Le destinataire n'a pas rejoint le bac à sable. |

**/admin/sante** indique la date de la dernière notification réussie par canal
et prévient au-delà de 48 heures de silence.

---

## Récapitulatif de ce que tu dois me donner

| Quand | Valeurs |
|---|---|
| Tout de suite | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Après l'approbation | le numéro approuvé, et les noms des modèles approuvés |

Et de ton côté, sans moi : ton numéro dans **/admin/parametres → WhatsApp de
l'opérateur**.
