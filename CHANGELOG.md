# Cyberfox 0.3.1

## Icône et paquet macOS

- Icône Cyberfox dans Finder, le Dock, les fenêtres et le navigateur. Sources SVG et génération reproductible PNG/ICNS.
- Signature macOS ad hoc rétablie : la version 0.3.0 désactivait la signature et conservait un sceau Electron invalide, pouvant provoquer le message « application endommagée ».
- Vérification profonde et stricte de la signature et des icônes avant construction du DMG.

**La signature reste locale, sans Developer ID ni notarisation Apple. Gatekeeper ne reconnaît donc pas automatiquement cette version. Après une première tentative d’ouverture, macOS peut proposer Réglages Système → Confidentialité et sécurité → Ouvrir quand même. Une ouverture sans cette intervention nécessite un certificat Developer ID Application et une notarisation Apple.**

## Taille réduite

- DMG : **494,7 → 420,8 Mo (−15 %)**.
- Fichiers de l’application : **1 115,1 → 918,7 Mo (−18 %)**, hors différence de comptage de Finder et du système de fichiers.
- Un seul moteur Copilot sert à la connexion et au SDK ; le second runtime natif est exclu du paquet.
- React, React DOM et Lucide sont compilés dans le frontend et ne sont plus embarqués une seconde fois comme dépendances backend.
- Electron, Codex et Appium restent inclus.

## Vérifications

Build, 18 tests unitaires/protocole, parcours navigateur, lancement de l’application empaquetée, persistance et signature macOS. Le transport SDK Copilot communique avec le CLI unique et l’authentification a été vérifiée ; les derniers essais de catalogue et de réponse IA ont rencontré des délais réseau. Le contrôle Gatekeeper reste rejeté sans Developer ID/notarisation, indépendamment du contrôle d’intégrité de la signature qui réussit.

---

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
