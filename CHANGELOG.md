# Cyberfox 0.3.0

## Mises à jour depuis GitHub

- Vérification automatique au démarrage et toutes les quatre heures, désactivable dans les paramètres.
- Bouton **Nouveau** lorsqu’une version stable plus récente est disponible.
- Onglet **Paramètres → Mises à jour** : vérification manuelle, notes de version, téléchargement manuel ou automatique.
- Progression en direct dans les paramètres et dans la fenêtre principale.
- Contrôle de la taille et de l’empreinte SHA-256 avant ouverture de l’installateur ; restauration des téléchargements vérifiés au redémarrage.
- Confirmation avant ouverture du DMG et fermeture de Cyberfox. Les projets et paramètres sont conservés. Une exécution de tests active empêche la fermeture pour mise à jour.
- Réseau Chromium avec proxy système et PAC ; rechargement du proxy après erreur réseau. TLS reste vérifié. Un VPN qui interdit GitHub doit autoriser ses domaines et hôtes de téléchargement.

## Correctif

- Lancement du runtime GitHub Copilot depuis son emplacement natif extrait, pour fonctionner dans l’application Electron empaquetée.

## Installation

**macOS Apple Silicon (M1/M2/M3/M4 et suivants)** : télécharger `Cyberfox-0.3.0-mac-arm64.dmg`, l’ouvrir et glisser Cyberfox dans Applications.

Le DMG n’est pas signé ni notarié. macOS peut demander une autorisation d’ouverture dans Réglages Système → Confidentialité et sécurité. Aucun installateur Intel, Windows ou Linux n’est publié dans cette release.

La première installation de cette version est manuelle ; le système intégré détectera les releases suivantes. Le remplacement de l’application après ouverture du DMG reste manuel.

## Validation

Build de production, 17 tests unitaires/protocole, 4 parcours navigateur, téléchargement vérifié via un proxy Chromium local, et test de l’application macOS empaquetée (persistance et restauration du projet, Codex et Copilot).

L’automatisation iPhone conserve ses prérequis Xcode/WebDriverAgent ; cette release ne résout pas la signature du runner iOS. La validation complète d’Appium dans l’installateur reste à effectuer.
