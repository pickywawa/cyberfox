<div align="center">
  <img src="site/assets/icon.svg" width="88" alt="Logo Cyberfox">
  <h1>Cyberfox</h1>
  <p><strong>Vos tests mobiles. Les preuves en plus.</strong></p>
  <p>Un atelier de bureau open source pour explorer, créer et rejouer vos scénarios Android et iOS.</p>
  <p><strong>Français</strong> · <a href="README.md">English</a></p>
  <p>
    <a href="https://pickywawa.github.io/cyberfox/">Site web</a> ·
    <a href="https://github.com/pickywawa/cyberfox/releases/latest">Télécharger</a> ·
    <a href="CHANGELOG.md">Nouveautés</a> ·
    <a href="https://github.com/pickywawa/cyberfox/issues">Signaler un problème</a>
  </p>
  <p>
    <a href="https://github.com/pickywawa/cyberfox/releases/latest"><img src="https://img.shields.io/github/v/release/pickywawa/cyberfox?style=flat-square&color=bfa0fa" alt="Dernière version"></a>
    <a href="https://github.com/pickywawa/cyberfox/actions/workflows/ci.yml"><img src="https://github.com/pickywawa/cyberfox/actions/workflows/ci.yml/badge.svg" alt="Compilation et tests"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-cbef9c?style=flat-square" alt="Licence MIT"></a>
  </p>
</div>

![Progression d’une campagne Cyberfox avec captures Android et iOS](site/assets/screenshots/campaign.png)

_Captures réelles de l’aperçu navigateur de Cyberfox. Atlas Mobile est une application fictive ; les résultats et écrans mobiles sont des données de démonstration._

## Un parcours. Deux plateformes. Une preuve à chaque étape.

Cyberfox réunit l’arbre des scénarios, les résultats et les appareils dans un espace redimensionnable. Construisez vos scénarios à la main ou laissez Codex / GitHub Copilot explorer les appareils connectés et proposer des ajouts à valider. Lancez une campagne, retrouvez les captures et partagez vos résultats.

| Explorer                                                | Créer                                                       | Vérifier                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Inspecter les composants accessibles Android et iOS.    | Décrire un parcours ou associer les composants soi-même.    | Exécuter les scénarios et contrôler les résultats observables. |
| Cibler des éléments plutôt que des coordonnées d’écran. | Une intention commune, des opérations et sélecteurs par OS. | Un clic réussi ne constitue pas une preuve de réussite métier. |

## Dans l’atelier

### Des campagnes qui gardent le contexte

- Historique persistant des campagnes et résultats par plateforme.
- Tableau compact avec recherche, filtre de statut et jauge d’avancement.
- Sélection d’une étape pour afficher sa capture dans le panneau appareil.
- Détails dépliables sans capture au milieu du tableau.
- Export de la campagne en **texte, CSV, Markdown ou balisage wiki Confluence**.
- Avant de tout rejouer, choix entre conserver les résultats ou nettoyer la campagne courante et relancer l’application. Les données de l’application sont conservées.

### La carte de ce que vous avez testé

![Cartographie des écrans testés et compteurs par plateforme](site/assets/screenshots/screen-map.png)

Seuls les écrans associés à des tests exécutés apparaissent. Retrouvez les captures disponibles, les chemins observés et de petits compteurs Android/iOS. Un clic sur un écran ouvre ses tests dans une popup contextuelle.

### Une création assistée, avec validation

![Éditeur de scénarios et espace de travail Cyberfox](site/assets/screenshots/workspace.png)

- **Codex ou GitHub Copilot**, avec choix du modèle et de l’effort de raisonnement.
- Modes **Interactif / Auto-approve**. Auto-approve gère les précisions et la création des variables fournies sans popup ; la proposition finale reste à valider.
- Variables projet référencées sous la forme `${VARIABLE_NAME}` dans les scénarios.
- Enregistrement des identifiants fournis pendant l’exploration et utilisation immédiate.
- Confrontation des propositions aux sélecteurs observés et aux interactions réussies ; correction bornée des propositions incomplètes.
- Rejeu facultatif avant acceptation, identités d’écran, préconditions et étapes bloquantes.
- Traces d’exploration locales et couverture manquante explicitée lorsqu’un appareil est absent.

## Télécharger

**[Télécharger Cyberfox 0.4.0 pour macOS Apple Silicon](https://github.com/pickywawa/cyberfox/releases/download/v0.4.0/Cyberfox-0.4.0-mac-arm64.dmg)**

Ouvrir le DMG, puis glisser **Cyberfox** dans **Applications**. Les [notes de version](https://github.com/pickywawa/cyberfox/releases/tag/v0.4.0) regroupent les détails et les empreintes de contrôle.

L’application macOS possède une signature locale ad hoc, sans signature Apple Developer ID ni notarisation. Après une première tentative d’ouverture, macOS peut demander une autorisation dans **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**. Une mise à jour conserve les projets et réglages à leurs emplacements habituels.

Cette release publie uniquement l’installateur macOS Apple Silicon. Les versions de développement Windows, Linux et Intel peuvent être construites depuis les sources ; aucun installateur correspondant n’est fourni ici. Les mises à jour intégrées détectent les prochaines releases stables GitHub et permettent de télécharger leur installateur.

## Préparer les appareils

| Cible   | Prérequis                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android | Android SDK Platform Tools, JDK, débogage USB et appareil autorisé ; les émulateurs démarrés peuvent aussi être sélectionnés.                                                      |
| iOS     | Configuration standard : Mac, Xcode et WebDriverAgent. Pour un iPhone physique : confiance, mode développeur et signature du runner WDA. Démarrer les simulateurs avant sélection. |
| Flutter | Composants accessibles exposés à Appium. Un projet Flutter cible Android et iOS, avec des sélecteurs distincts.                                                                    |

Appium, UiAutomator2 et XCUITest sont embarqués. Un appareil détecté n’est pas nécessairement prêt pour l’automatisation : le diagnostic distingue connexion, signature, WDA et miroir. La qualité de l’accessibilité et des identifiants de l’application reste déterminante.

## Données et IA

Les projets, variables, captures et résultats sont enregistrés sur votre machine. L’exploration et l’analyse IA transmettent la demande et le contexte d’interface concernés au fournisseur choisi, avec votre compte authentifié. Les limites et conditions du fournisseur s’appliquent ; aucun compte Cyberfox n’est nécessaire.

Les scénarios conservent des références de variables plutôt que des identifiants en clair. Les variables appartiennent aux fichiers locaux du projet : **ce n’est pas un coffre-fort chiffré**. Protégez les dossiers et exports contenant des données sensibles. Le dépôt et ses captures ne contiennent que des données de démonstration.

## Développement

Node.js **22.12+** et npm :

```sh
git clone https://github.com/pickywawa/cyberfox.git
cd cyberfox
npm ci
npm run dev
```

| Commande                            | Rôle                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`                       | Vite + surveillance TypeScript + Electron avec redémarrage automatique du backend.       |
| `npm run dev:web`                   | Aperçu navigateur avec stockage distinct, sans contrôle des appareils ni IA réelle.      |
| `npm run build`                     | Vérification TypeScript et compilation.                                                  |
| `npm test`                          | Tests unitaires, de protocole et de persistance.                                         |
| `npm run test:e2e`                  | Tests navigateur Playwright ; installer Chromium avec `npx playwright install chromium`. |
| `npm run test:electron`             | Tests de lancement de bureau dans un profil isolé.                                       |
| `npm run dist -- --mac dmg --arm64` | Construction du DMG Apple Silicon sur Mac.                                               |
| `npm run test:package:mac`          | Contrôle d’intégrité, de signature et des icônes du paquet.                              |
| `npm run test:package:appium`       | Chargement des pilotes embarqués et démarrage du serveur Appium empaqueté.               |

Pour isoler le profil de développement : `CYBERFOX_USER_DATA=/chemin/absolu/profil-dev npm run dev`. L’aperçu navigateur utilise un stockage indépendant. Le [site statique](site/) est déployé sur GitHub Pages par [son workflow](.github/workflows/pages.yml).

Documentation complémentaire : [création assistée](docs/creation-assistance.md), [campagnes de test](docs/test-campaigns.md), [référence technique](docs/development.md).

## Contribuer

Un signalement utile inclut la version Cyberfox, l’OS hôte, l’OS cible, l’étape concernée et une erreur ou trace anonymisée. Ne publiez ni identifiants, ni informations personnelles, ni captures métier réelles. Voir les [issues](https://github.com/pickywawa/cyberfox/issues).

Construit avec Electron, React, TypeScript, Appium et les intégrations Codex et GitHub Copilot. De la même famille que [Cyberdog](https://pickywawa.github.io/cyberdog/).

[MIT](LICENSE) · © 2026 pickywawa
