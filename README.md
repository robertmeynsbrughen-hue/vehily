# Véhily

Carnet de suivi de véhicules par OCTANE CODE.

Application statique : ouvrir index.html via un serveur HTTP ou publier la racine sur GitHub Pages. Aucun compte ChatGPT nécessaire sur GitHub Pages.

Les dossiers sont stockés dans le navigateur (localStorage). Avec un compte, ils sont aussi synchronisés automatiquement entre tes appareils (voir version 0.9). Sans compte, exporter une sauvegarde JSON avant de changer de domaine ou de navigateur : les données du site précédent ne migrent pas automatiquement.

Fonctions : véhicules, diagnostics, tâches, dépenses, VIN châssis et donneur, accès RealOEM, comptes rendus imprimables. La recherche automatique par plaque n’est pas connectée.

Les fichiers ne contiennent aucune clé API ni sauvegarde utilisateur. Les fiches E39/E91 de départ sont des exemples préremplis.

## Synchronisation (version 0.9)

Dans Sauvegardes, « Synchronisation automatique » : crée un compte (e-mail et mot de passe, 6 caractères minimum) ou connecte-toi. Chaque modification est envoyée environ 1,5 seconde après l'enregistrement ; les autres appareils la récupèrent à l'ouverture, au retour sur l'onglet et toutes les minutes. Hors connexion, les modifications attendent sur l'appareil et partent au retour du réseau. L'accueil indique « Synchronisé à … » ou l'envoi en attente.

Si les dossiers ont changé sur deux appareils en même temps, ou à la première connexion d'un appareil qui a déjà des dossiers, Véhily demande quelle version garder et télécharge l'autre en sauvegarde JSON. Se déconnecter laisse les dossiers sur l'appareil.

Stockage : projet Supabase « Rivio Backup », table `public.vehily` (une ligne par compte, accès limité à son propriétaire, contrôle de version contre les écrasements). Les comptes sont ceux de ce projet Supabase. Pour que le lien de confirmation e-mail ramène sur Véhily, ajouter l'adresse du site dans Supabase › Authentication › URL Configuration › Redirect URLs.

## Utiliser la version 0.8

Sur l’accueil, chaque carte indique si la voiture est « Roulante » ou « Immobilisée », depuis quand, le motif de l’immobilisation et la prochaine action. « Renseigner l’état » ou « Changer l’état » ouvre la saisie : le motif est obligatoire pour une immobilisation. Laisse la prochaine action vide pour reprendre automatiquement la panne en cours, puis l’entretien dû, puis la première tâche. Un dossier plus ancien affiche « État de route à renseigner ». Les sauvegardes incluent cet état.

Dans la fiche d’un véhicule, « Pièces du véhicule » suit chaque pièce d’un swap. Saisis son nom, sa référence OEM si elle est connue, sa provenance (châssis, donneur ou achat), son prix et son état. Utilise « Modifier » à réception ou après montage. Un prix vide reste inconnu et un prix de 0 € indique une pièce gratuite. Le prix de la pièce est conservé dans sa fiche ; pour comptabiliser un paiement, utilise le budget. Les sauvegardes incluent les pièces de chaque véhicule.

Depuis la fiche véhicule, relève le compteur puis ajoute un entretien ou un contrôle technique. Saisis la date figurant sur ton contrôle ou l’échéance de ton entretien. Un préavis en jours ou en kilomètres fait apparaître le rappel sur l’accueil. Le seuil atteint devient « À réaliser ». Les rappels sont consultables dans l’application.

Pour recevoir un rappel daté en dehors de Véhily, « Ajouter à mon agenda » télécharge un événement à importer dans ton calendrier. Le fichier inclut le préavis en jours ; la notification dépend des réglages de l’agenda. Après un changement d’échéance, actualise aussi l’événement dans ton agenda. Les rappels kilométriques utilisent le dernier relevé du compteur dans Véhily.

« Marquer comme fait » consigne les travaux, la date et le compteur dans le journal. Rattache une dépense déjà saisie ou indique un montant pour créer une dépense. Laisse les prochaines échéances vides pour terminer, ou renseigne une nouvelle date ou un kilométrage pour reconduire l’entretien.

Dans « Pannes et diagnostic », ouvre un dossier avec le symptôme et la prochaine action. Consigne les codes défaut, les mesures et les essais, puis utilise « Résoudre » pour conserver la réparation et le résultat de vérification dans l’historique.

Les dépenses et le journal permettent de corriger les montants, textes et dates. Après suppression, « Annuler la suppression » reste proposé sur la vue courante.

Dans Sauvegardes, l’import indique combien de dossiers seront remplacés et permet d’exporter les dossiers actuels avant de confirmer. La date sur l’accueil correspond au dernier export lancé sur cet appareil. Utilise HTTPS ou localhost pour permettre le verrouillage des écritures entre onglets.

Le scénario de régression utilise uniquement des données fictives. Avec Playwright et Chromium disponibles, lancer `node tests/workshop.cjs`, `node tests/road.cjs` puis `node tests/sync.cjs` (faux serveur Supabase local, deux appareils fictifs). Pour utiliser Chrome déjà installé, définir `CHROME_CHANNEL=chrome`.

## Photos

E39 : Damian B Oh, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:BMW_E39_LCI_530i_Black_(1).jpg (affichage recadré).
E91 : M 93, domaine public, https://commons.wikimedia.org/wiki/File:BMW_3er_Touring_E91_20090425_front.JPG.
Logo OCTANE CODE : visuel fourni par le propriétaire du projet.
