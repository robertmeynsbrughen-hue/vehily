# Véhily

Carnet de suivi de véhicules par OCTANE CODE.

Application statique : ouvrir index.html via un serveur HTTP ou publier la racine sur GitHub Pages. Aucun compte ChatGPT nécessaire sur GitHub Pages.

Les dossiers sont stockés dans le navigateur (localStorage), sans synchronisation. Exporter une sauvegarde JSON avant de changer de domaine ou de navigateur : les données du site précédent ne migrent pas automatiquement. Importer ensuite cette sauvegarde dans Véhily.

Fonctions : véhicules, diagnostics, tâches, dépenses, VIN châssis et donneur, accès RealOEM, comptes rendus imprimables. La recherche automatique par plaque n’est pas connectée.

Les fichiers ne contiennent aucune clé API ni sauvegarde utilisateur. Les fiches E39/E91 de départ sont des exemples préremplis.

## Utiliser la version 0.5

Depuis la fiche véhicule, relève le compteur puis ajoute un entretien. Renseigne une échéance en kilomètres, une date, ou les deux. L’accueil affiche « À réaliser » dès que le compteur saisi ou la date du jour atteint l’une des limites. Après intervention, modifie la ligne pour indiquer la prochaine échéance.

Les dépenses et le journal permettent de corriger les montants, textes et dates. Après suppression, « Annuler la suppression » reste proposé sur la vue courante.

Dans Sauvegardes, l’import indique combien de dossiers seront remplacés et permet d’exporter les dossiers actuels avant de confirmer. La date sur l’accueil correspond au dernier export lancé sur cet appareil. Utilise HTTPS ou localhost pour permettre le verrouillage des écritures entre onglets.

Le scénario de régression utilise uniquement des données fictives. Avec Playwright et Chromium disponibles, lancer `node tests/workshop.cjs`. Pour utiliser Chrome déjà installé, définir `CHROME_CHANNEL=chrome`.

## Photos

E39 : Damian B Oh, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:BMW_E39_LCI_530i_Black_(1).jpg (affichage recadré).
E91 : M 93, domaine public, https://commons.wikimedia.org/wiki/File:BMW_3er_Touring_E91_20090425_front.JPG.
Logo OCTANE CODE : visuel fourni par le propriétaire du projet.
