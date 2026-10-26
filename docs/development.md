# Référence technique Cyberfox

Documentation détaillée. Pour la présentation et l’installation courantes : [français](../README.fr.md) · [English](../README.md).

Atelier QA mobile Electron, React et TypeScript : exploration par composants, scénarios Android/iOS, génération exploratoire Codex/Copilot et rapport de rejeu en direct. Thèmes et style inspirés de Cyberdog ; français et anglais.

## Installation et mises à jour

Télécharger le DMG **macOS Apple Silicon (arm64)** depuis les [releases GitHub](https://github.com/pickywawa/cyberfox/releases/latest), puis glisser Cyberfox dans Applications. La version 0.3.1 utilise une signature locale ad hoc valide, mais n’a pas de signature Developer ID ni de notarisation Apple. Gatekeeper ne l’accepte donc pas automatiquement. Après une première tentative d’ouverture, une autorisation manuelle peut être proposée dans Réglages Système → Confidentialité et sécurité → Ouvrir quand même. Une distribution reconnue sans cette intervention exige un certificat Developer ID Application et une notarisation Apple. Les autres architectures n’ont pas encore d’installateur publié.

À partir de la version 0.3.0, Cyberfox vérifie les releases stables au démarrage puis toutes les quatre heures. Une nouvelle version affiche le bouton **Nouveau**. Paramètres → **Mises à jour** permet de vérifier manuellement, lire les notes, télécharger avec une barre de progression et activer le téléchargement automatique. Les réglages utilisent le bouton Enregistrer habituel.

Le téléchargement ne ferme jamais l’application. **Installer la mise à jour** demande confirmation avant d’ouvrir le DMG puis fermer Cyberfox ; l’utilisateur remplace ensuite l’application dans Applications. Une exécution de tests active doit être arrêtée au préalable. Les projets et réglages restent dans leurs emplacements habituels. Un fichier déjà téléchargé est retrouvé au prochain contrôle après redémarrage.

La pile réseau Chromium utilise le proxy système et PAC, y compris derrière un VPN, avec rechargement du proxy après une erreur de connexion. Si le VPN ou le pare-feu interdit GitHub, il doit autoriser GitHub et ses hôtes de téléchargement. Les vérifications TLS restent actives. L’installateur est contrôlé par taille et SHA-256 fourni par GitHub avant installation ; aucun fichier incompatible ou sans empreinte n’est exécuté.

Pour produire la prochaine release : incrémenter la version, lancer `npm ci`, `npm run dist -- --mac dmg --arm64`, puis publier le tag et le DMG sur ce dépôt public. Conserver le nom généré `Cyberfox-<version>-mac-arm64.dmg` : le moteur choisit l’installateur selon l’OS et l’architecture. Les préversions sont exclues des mises à jour automatiques.

### Icône, taille et signature du paquet macOS

L’icône source est `public/cyberfox.svg` ; `npm run icons` régénère `build/icon.png` et `build/icon.icns`. Le paquet utilise cette icône pour Finder et le Dock, y compris au lancement de la version de développement.

Les bibliothèques React et les icônes Lucide sont uniquement des dépendances de développement : Vite les compile dans le frontend. Copilot partage un seul exécutable entre authentification et transport SDK, sans embarquer le second runtime natif optionnel du SDK. Codex et Appium restent inclus et les fonctions QA sont conservées. Le DMG passe de 494,7 à 420,8 Mo ; les fichiers de l’application passent de 1 115,1 à 918,7 Mo.

`mac.identity` vaut `-` pour activer une signature ad hoc, et non `null` qui désactive la signature et laissait en 0.3.0 un sceau Electron invalide. Le hook `afterSign` vérifie la signature profonde et stricte, l’icône et l’absence du second runtime Copilot avant de créer le DMG. `npm run test:package:mac` répète ces contrôles sur le paquet construit. Ce contrôle d’intégrité ne remplace pas l’approbation Gatekeeper : celle-ci exige la signature Developer ID et la notarisation.

## Développement

Node.js 22.12+ et npm :

```sh
npm ci
npm run dev
```

`npm run build && npm start` lance la version compilée. L’aperçu navigateur (`npm run dev:web`, http://127.0.0.1:5173) possède un stockage local distinct et ne prétend pas contrôler des appareils ou appeler l’IA. Avec `npm run dev`, Vite recharge l’interface à chaud et Electron redémarre automatiquement après recompilation du backend ou du preload. Fermer la version installée avant de lancer ce mode : les projets et réglages peuvent être partagés. Pour un profil isolé, fournir `CYBERFOX_USER_DATA=/chemin/vers/profil-dev npm run dev`. Ctrl+C dans le terminal arrête Electron, Vite et TypeScript.

## Organisation

- Un seul projet courant, un dossier par projet ; emplacement réglable dans Paramètres → Projets.
- Scénarios **uniquement à la racine** ; enfants de type action, navigation ou test.
- `+` ajoute immédiatement un élément, configuré dans le panneau central : nom, description, tags du projet, précondition, comportement des enfants et échec bloquant.
- Les préconditions référencent le **test immédiatement précédent**. Le moteur le vérifie à nouveau avant l’élément. Si la précondition est fausse, l’élément est ignoré ; ses enfants ne sont exécutés que si l’option correspondante est activée.
- Une intention commune avec des variantes et sélecteurs distincts par OS. Flutter implique **Android et iOS**, même si une seule autre case est cochée.
- Les tags ajoutés depuis l’éditeur restent disponibles dans tout le projet.
- Onglets Création/Exécution dans la barre supérieure, choix conservé par projet.
- Panneaux gauche/droit et chat redimensionnables, dimensions conservées.

Le fichier `cyberfox.project.json` conserve arbre, tags, appareils, sélection, échanges et révision. Les anciens arbres sont migrés en préservant noms, descriptions et identifiants. Les propositions refusées ne modifient jamais l’arbre.

## Appareils et composants

La détection se rafraîchit toutes les cinq secondes et à chaque ouverture du sélecteur. Un téléphone USB autorisé est automatiquement sélectionné puis connecté pour chaque OS du projet ; Flutter implique les deux OS. Un choix manuel encore connecté est conservé. Choisir Aucun suspend cette sélection automatique jusqu’au prochain changement de connexion USB ou redémarrage. Les appareils réseau et simulateurs ne sont pas choisis automatiquement. La confiance iOS et l’autorisation du débogage Android doivent toujours être accordées sur le téléphone. Les appareils USB sont visibles immédiatement ; simulateurs/émulateurs sont dans un groupe repliable. Un projet avec un seul OS a une vue mobile ; Android+iOS ou Flutter en a deux. Elles passent côte à côte lorsque leur panneau dépasse 620 px. La fenêtre Appareils peut être externalisée et se restaure au redémarrage.

Le miroir utilise des captures PNG périodiques et reste distinct du moteur d’automatisation. « Explorer » interroge l’arbre d’accessibilité via Appium. Cliquer sur l’image sélectionne un **composant du dernier arbre inspecté** : on peut l’associer à l’élément courant ou l’activer. Le bouton de sélection bascule vers un mode d’interaction directe, qui résout également le composant avant d’agir. Aucun clic exécuté ni scénario enregistré n’utilise des coordonnées. Les rectangles ne servent qu’à sélectionner un composant dans le miroir et à afficher le pointeur rouge.

Les sélecteurs ambigus sont refusés. Les assertions attendent une condition (visible, absent, texte exact, activé) dans le délai configuré. La présence d’un appareil ne suffit pas : un avertissement signale les OS sans appareil associé **et inspectable**.

### Android

Installer Android SDK Platform Tools et un JDK, activer le débogage USB et autoriser l’ordinateur. Le logiciel recherche ADB dans les emplacements SDK usuels et détecte le JDK macOS. `ANDROID_HOME` et `JAVA_HOME` peuvent être fournis explicitement.

### iOS

Mac, Xcode, confiance de l’iPhone et mode développeur. La détection utilise `xcrun devicectl`, sans dépendance à libimobiledevice. Les simulateurs doivent être démarrés au préalable.

Pour un iPhone physique : connecter le compte Apple dans Xcode → Settings → Accounts ; régler **Team ID** et **WebDriverAgent Bundle ID** dans Paramètres → Appareils. Xcode doit pouvoir signer et installer le test runner sur cet appareil. Un profil pour l’application métier ne remplace pas le profil du runner. Les erreurs de signature restent des blocages visibles ; aucun succès iOS n’est inventé.

Appium et les pilotes UiAutomator2/XCUITest sont des dépendances npm. Le backend démarre un serveur local si aucun serveur n’écoute à l’adresse configurée. Toutes les dépendances de production sont extraites de l’archive Electron pour ce processus Node ; son répertoire Appium inscriptible et ses liens vers les pilotes inclus sont préparés dans les données de Cyberfox. Le projet WebDriverAgent et ses fichiers de compilation sont copiés dans ce répertoire avant utilisation, afin de ne pas modifier la signature de l’application installée. Il n’arrête que le serveur qu’il a lui-même lancé. Le tunnel WDA manuel reste une solution de secours pour le miroir ; il doit être explicitement associé au bon UDID.

## Exécution

Dans Exécution, `▶` sur un scénario le lance ; le bouton global lance toutes les racines. Un appareil par OS, deux OS en parallèle. Les étapes d’un même appareil restent séquentielles. Bleu : en cours ; vert : réussi ; rouge : échec ; gris : ignoré/bloqué/annulé.

Le moteur exécute un **instantané** de l’arbre. Un échec non bloquant ne coupe pas la suite. Un échec bloquant bloque la suite de son scénario ; les autres scénarios restent indépendants. Un OS sans appareil donne un résultat bloqué, jamais un succès implicite.

Le rapport est diffusé en direct et enregistré dans `campaigns/<campaign-id>/reports/<run-id>.json`, avec les captures d’échec. Le dernier rapport est restauré à l’ouverture ; une exécution interrompue est marquée annulée. L’annulation est prise en compte entre les étapes et pendant les attentes ; le lancement initial d’une session native peut prendre plus longtemps.

Paramètres → Exécution propose : analyse IA automatique, demande à l’utilisateur, ou aucune analyse. L’analyse utilise l’étape originale et ses traces ; elle ne réécrit aucun test. Les popups de demande sont mises en file et ne bloquent pas le moteur. Une analyse peut être déclenchée depuis une entrée du rapport.

## Génération IA exploratoire

Connecter Codex ou GitHub Copilot dans Paramètres → Intégration IA. Les CLI officielles incluses gèrent l’authentification et réutilisent les sessions locales. Les modèles Copilot viennent du compte ; Codex utilise son catalogue local si disponible, un identifiant explicite ou son modèle par défaut.

Dans Paramètres → Intégration IA, une session authentifiée affiche **IA connectée · prête à être utilisée** et **Déconnecter mon compte**. Le statut se rafraîchit à la fin de la connexion. Les sessions sont celles des CLI officiels : une déconnexion peut aussi affecter leur utilisation dans le terminal. L’authentification ne garantit pas l’accès à chaque modèle ni un quota restant.

Le modèle et l’effort de raisonnement (par défaut, low, medium, high) sont enregistrés dans les paramètres et envoyés au SDK pour les prochaines demandes ; les niveaux acceptés dépendent du modèle. Le chat affiche le fournisseur, le modèle sélectionné (ou explicitement « par défaut du fournisseur »), l’effort et l’état de connexion. Le pourcentage du quota premium Copilot apparaît si le fournisseur le transmet ; sinon **Quota : non communiqué**. Codex expose les tokens du dernier échange via le SDK utilisé, sans pourcentage de quota du compte. L’avertissement des appareils indisponibles se trouve juste au-dessus du prompt.

Le moteur embarque ses consignes QA dans `electron/qa-instructions.ts` : protocole d’observation/action/réinspection, sélecteurs observés, cohérence inter-OS, préconditions, assertions, limites et analyse des régressions. Il envoie le **chemin courant complet en métadonnées**, l’arbre existant et les composants des appareils sélectionnés. L’IA peut naviguer pendant la génération ; ses décisions structurées sont exécutées uniquement par le backend sur des composants inspectés. Les outils système intégrés de Copilot sont désactivés ; Codex travaille dans un répertoire temporaire en lecture seule, sans recherche web.

L’exploration est limitée à 40 étapes / 10 minutes et peut être arrêtée. Un appareil réservé par une exécution ne peut pas être piloté simultanément par l’IA ou une action manuelle. Les sélecteurs proposés sont comparés aux sélecteurs effectivement observés.

La grande popup affiche l’arbre existant et les ajouts en bleu, avec détail à droite. Accepter ajoute les nœuds ; décliner garde l’arbre intact. Une révision empêche d’écraser silencieusement des modifications intervenues pendant la validation.

Les observations et demandes sont envoyées au fournisseur choisi, selon ses conditions et les quotas du compte. Les champs signalés comme sécurisés par l’OS sont masqués dans les composants envoyés au modèle. Les variantes de saisie acceptent `${NOM}` ; le moteur cherche d’abord la clé dans les variables du projet, puis `CYBERFOX_SECRET_NOM` dans son environnement. Ne versionnez pas les valeurs des comptes de test.

Sources : [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [authentification Copilot](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate), [UiAutomator2](https://appium.github.io/appium-uiautomator2-driver/latest/getting-started/).

## Vérifications

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run test:electron
npm run test:updates
# Après construction du paquet macOS :
npm run test:package:appium
```

Les tests couvrent persistance, migration, contraintes de l’arbre, protocole WebDriver, attentes d’assertion, exécution parallèle, préconditions, échecs non bloquants et parcours d’édition/validation. Le test Electron utilise un dossier temporaire isolé.

Vérifications facultatives sur matériel et compte IA (consomment les ressources du poste et, pour l’IA, le quota du fournisseur) :

```sh
npm run test:mobile
npm run test:ai-live
```

Ces deux scripts sont dédiés à l’écran MFA de Pro SNP actuellement affiché sur un Android USB. Ils ne saisissent aucun identifiant et n’envoient aucun code. Le test IA vérifie que la proposition est fondée sur l’écran et qu’elle n’a pas été insérée sans accord.

Validation réelle effectuée pendant le développement : connexion Android jusqu’au choix de réception du code MFA, inspection de 37 composants, assertion sur le titre MFA réussie, génération Codex d’un scénario et d’une assertion sans insertion automatique. L’essai iPhone est bloqué par Xcode (« No Accounts » et profil WDA absent). Le fonctionnement simultané Android+iOS est couvert avec des pilotes de test ; il reste à valider sur les deux appareils physiques une fois la signature iOS préparée.

Les dépendances Appium apportent des avis `npm audit`, dont certains concernent des dépendances empaquetées dans les pilotes et ne sont pas corrigés par `npm audit fix`. Le serveur reste limité à l’interface locale. La signature Developer ID, la notarisation Apple et la validation complète du packaging Appium restent à préparer pour une distribution reconnue automatiquement par macOS.

### Préparer l’iPhone et comprendre les diagnostics

Dans **Cyberfox → Paramètres → Appareils**, le guide intégré distingue l’application TestFlight et WebDriverAgent : WDA est un runner séparé, qui nécessite sa propre signature **Development**, un certificat avec sa clé privée et un profil couvrant les iPhone QA. Le Bundle ID saisi est la base du runner ; Xcode ajoute normalement `.xctrunner`. Le nom d’exemple fourni historiquement ne crée aucun identifiant Apple.

Avec Fastlane/match, préparer un profil `development` pour le runner WDA final : le profil `appstore` de l’application métier ne convient pas. Pour imposer le profil installé par l’équipe, fournir un fichier `.xcconfig` de signature dans Cyberfox ; les paramètres automatiques de signature sont alors omis. Le bouton **Ouvrir le projet WDA dans Xcode** ouvre une copie modifiable propre à l’appareil, hors du bundle signé de Cyberfox.

La barre de chaque appareil affiche l’état des composants. Clic ou clic droit : diagnostic, remède, dernier journal Xcode et accès aux paramètres. Vert signifie que la vérification correspondante a réussi ; un pilote installé ou un miroir ADB ne garantit pas une session d’automatisation opérationnelle. Après modification de la signature, enregistrer puis **Reconnecter**.

Le mode standard de compilation WDA nécessite macOS/Xcode. Le pilote XCUITest prévoit aussi un parcours limité Windows/Linux pour iOS 18+ : WDA préinstallé/signé ou déjà lancé, UDID et version iOS explicites, dépendances Apple/RemoteXPC et tunnel préparés. Cyberfox expose ces modes et une entrée manuelle ; cette configuration n’a pas été validée physiquement sous Windows. Voir [la documentation Appium](https://appium.github.io/appium-xcuitest-driver/latest/guides/non-macos-hosts/).

### Enseignements de l’exploration réelle

Les noms iOS partagés entre bouton et texte sont qualifiés par type natif ; les sélecteurs restant ambigus sont refusés. Les échecs temporaires du miroir ne déclassent pas une session native valide. Le diagnostic iPhone signale le verrouillage lorsque le pilote sait le lire.

Les réponses Codex d’exploration utilisent un schéma JSON structuré, un rappel du protocole hôte à chaque échange et des outils shell désactivés. Une réponse sans résultat est arrêtée après deux minutes avec un message explicite ; l’interface affiche le temps d’attente. Les actions déjà effectuées restent effectives après annulation. Un choix de canal OTP ne prouve pas l’envoi ; une confirmation dans l’interface ne prouve pas la livraison réelle du SMS/e-mail.

En développement uniquement, Electron expose un port CDP aléatoire sur la boucle locale pour les vérifications de l’interface réelle et du pont IPC ; son port figure dans le fichier DevToolsActivePort du répertoire utilisateur de Cyberfox.

### Maintenir un iPhone éveillé (expérimental)

Dans **Paramètres → Appareils → iOS**, l’option **Maintenir l’iPhone éveillé** est désactivée par défaut. Lorsqu’elle est enregistrée et activée, Cyberfox essaie un appui volume + puis − toutes les 20 secondes sur l’iPhone physique sélectionné du projet courant, uniquement avec une session WDA existante et déverrouillée. Il ne lance aucune session supplémentaire et ne tente pas de déverrouiller le téléphone.

Les interactions sont sérialisées avec les commandes mobiles. Le maintien est suspendu pendant une exécution de tests ou une commande en cours ; il peut agir pendant l’attente d’une réponse IA. Il s’arrête lorsque l’option est désactivée, le téléphone désélectionné/débranché ou Cyberfox fermé. Le diagnostic indique le dernier envoi, les pauses, le verrouillage et les erreurs.

Cette méthode peut afficher l’indicateur de volume et modifier légèrement le volume, surtout à ses limites. Les boutons de volume sont supportés par Appium, mais leur effet sur le délai de verrouillage dépend d’iOS et des règles de gestion : le maintien éveillé n’est pas garanti et n’a pas encore été validé sur cet iPhone déverrouillé. Le profil d’entreprise reste inchangé.

### Fenêtres et lancement en développement

La taille, la position et l’état maximisé sont enregistrés séparément pour la fenêtre principale et celle des appareils, dans les données utilisateur. Au redémarrage, une fenêtre précédemment située sur un écran déconnecté est replacée sur un écran disponible. Fermer la fenêtre principale quitte Cyberfox, y compris sur macOS, et ferme aussi la fenêtre des appareils détachée ; fermer uniquement la fenêtre des appareils la réintègre.

Le lanceur de développement compare le contenu des fichiers compilés : les réécritures TypeScript identiques au démarrage ne provoquent plus de fermeture/réouverture. Un changement réel du backend continue de redémarrer Electron. Après modification du lanceur lui-même, arrêter la commande avec Ctrl+C puis relancer `npm run dev`.

### Variables et sessions IA par projet

L’onglet **Variables**, à côté de Création et Exécution, permet d’ajouter, modifier, rechercher et supprimer des clés/valeurs. Enregistrer écrit les variables **en clair** dans `cyberfox.project.json`, dans le dossier du projet. Les clés sont uniques et utilisent lettres, chiffres et soulignements, sans chiffre initial.

Les références comme `${QA_USERNAME}` sont résolues dans les valeurs de saisie, textes attendus et sélecteurs lors des actions manuelles, de l’exploration IA et du rejeu, y compris les préconditions. Les valeurs du projet sont prioritaires ; les variables d’environnement historiques `CYBERFOX_SECRET_<CLE>` restent un recours si la clé n’existe pas dans le projet. Une référence inconnue fait échouer l’étape avec une erreur explicite. Le moteur utilise un instantané des variables pour chaque exécution. L’IA reçoit les clés disponibles ; l’hôte résout leurs valeurs pour les commandes mobiles.

Dans la barre du chat, **+** crée une nouvelle session et le sélecteur permet de rouvrir une ancienne. Chaque session conserve son historique et les prochains échanges reprennent les vingt derniers messages de cette session, avec le chemin courant et l’état des appareils. Les historiques restent dans la configuration du projet. Les conversations des anciens projets migrent vers une première session, sans perte de messages.

Le chat et son séparateur sont masqués dans les onglets Exécution et Variables. Lorsqu’un projet est ouvert, ses boutons de création de projet disparaissent : utiliser **Fichier → Nouveau projet…** ou **Cmd/Ctrl+N** dans Electron. L’aperçu navigateur dispose aussi d’un menu Fichier.

## Publication 0.4 et dépendances natives

`sharp` est une dépendance de production : la lecture des icônes Android l’importe dans le backend. `scripts/prepare-native-images.mjs` rétablit la bibliothèque libvips à côté des modules natifs lorsque le collecteur de dépendances du packager les place à des niveaux différents. Cette opération doit précéder la signature ; ne pas modifier une application déjà signée.

Avant une release, exécuter les tests du paquet (`test:package:mac`, `test:package:appium`) puis le smoke test avec `CYBERFOX_EXECUTABLE` pointant sur l’exécutable construit. La validité d’une signature ne garantit pas, à elle seule, que toutes les dépendances natives se chargent.

Le site vit dans `site/`, indépendamment du frontend Electron. `npm run test:site` vérifie langues, galerie, liens et débordements. Pour régénérer les captures de démonstration, lancer Vite puis `node scripts/capture-marketing.mjs` ; `CYBERFOX_PREVIEW_URL` permet de choisir un port distinct. Les captures ne doivent pas provenir d’un projet métier réel.
