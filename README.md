# Deezer Collection

Extension Chrome (Manifest V3) qui ajoute un bouton dans la barre de lecture de Deezer Web, juste après le cœur.
Un clic ajoute le titre en cours à votre dernière playlist « Collection N », seulement s'il n'est dans aucune de vos collections.

## États du bouton

| Couleur | Signification |
|---|---|
| Violet | Absent de toutes les collections : un clic l'ajoute à la dernière (ex. « Collection Malo 10 ») |
| Vert | Déjà présent : le survol indique dans quelle collection |
| Gris | Aucun titre en cours (podcast, radio, rien en lecture) |
| Rouge | Erreur de chargement : un clic relance |

## Installation

1. Ouvrir `chrome://extensions` et activer le **Mode développeur**
2. **Charger l'extension non empaquetée** et choisir ce dossier
3. Recharger l'onglet Deezer

## Fonctionnement

- Les collections sont les playlists dont vous êtes propriétaire et dont le titre commence par « Collection » et finit par un numéro. La cible est celle qui a le plus grand numéro.
- Au chargement, l'extension lit le contenu de toutes les collections (environ 2 s pour 10 000 titres), puis rafraîchit toutes les 5 minutes.
- Un titre compte comme présent s'il a le même ID Deezer, ou le même ISRC (même enregistrement publié sur un autre album).
- Avant chaque ajout, les collections sont relues pour éviter un doublon ajouté depuis ailleurs.
- L'extension utilise l'API interne de Deezer (`/ajax/gw-light.php`) avec votre session : aucune clé ni connexion supplémentaire.

## Limites

- L'API interne et la barre de lecture (`#page_player [data-testid^="add_to_favorite_button"]`) peuvent changer avec les mises à jour de Deezer.
- Aucune limite de taille : quand une collection est « pleine » à vos yeux, créez « Collection … 11 » et elle deviendra la cible.
