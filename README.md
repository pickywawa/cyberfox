# Cyberfox

Atelier QA mobile Electron, React et TypeScript : exploration par composants, scénarios Android/iOS, génération exploratoire Codex/Copilot et rapport de rejeu en direct. Thèmes et style inspirés de Cyberdog ; français et anglais.

## Développement

Node.js 22.12+ et npm :

```sh
npm ci
npm run dev
```

`npm run build && npm start` lance la version compilée. L’aperçu navigateur (`npm run dev:web`, http://127.0.0.1:5173) possède un stockage local distinct et ne prétend pas contrôler des appareils ou appeler l’IA. Redémarrer Electron après une modification du backend ; Vite recharge l’interface à chaud.

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

Le sélecteur se rafraîchit à chaque ouverture. Les appareils USB sont visibles immédiatement ; simulateurs/émulateurs sont dans un groupe repliable. Un projet avec un seul OS a une vue mobile ; Android+iOS ou Flutter en a deux. Elles passent côte à côte lorsque leur panneau dépasse 620 px. La fenêtre Appareils peut être externalisée et se restaure au redémarrage.

Le miroir utilise des captures PNG périodiques et reste distinct du moteur d’automatisation. « Explorer » interroge l’arbre d’accessibilité via Appium. Cliquer sur l’image sélectionne un **composant du dernier arbre inspecté** : on peut l’associer à l’élément courant ou l’activer. Le bouton de sélection bascule vers un mode d’interaction directe, qui résout également le composant avant d’agir. Aucun clic exécuté ni scénario enregistré n’utilise des coordonnées. Les rectangles ne servent qu’à sélectionner un composant dans le miroir et à afficher le pointeur rouge.

Les sélecteurs ambigus sont refusés. Les assertions attendent une condition (visible, absent, texte exact, activé) dans le délai configuré. La présence d’un appareil ne suffit pas : un avertissement signale les OS sans appareil associé **et inspectable**.

### Android

Installer Android SDK Platform Tools et un JDK, activer le débogage USB et autoriser l’ordinateur. Le logiciel recherche ADB dans les emplacements SDK usuels et détecte le JDK macOS. `ANDROID_HOME` et `JAVA_HOME` peuvent être fournis explicitement.

### iOS

Mac, Xcode, confiance de l’iPhone et mode développeur. La détection utilise `xcrun devicectl`, sans dépendance à libimobiledevice. Les simulateurs doivent être démarrés au préalable.

Pour un iPhone physique : connecter le compte Apple dans Xcode → Settings → Accounts ; régler **Team ID** et **WebDriverAgent Bundle ID** dans Paramètres → Appareils. Xcode doit pouvoir signer et installer le test runner sur cet appareil. Un profil pour l’application métier ne remplace pas le profil du runner. Les erreurs de signature restent des blocages visibles ; aucun succès iOS n’est inventé.

Appium et les pilotes UiAutomator2/XCUITest sont des dépendances npm. Le backend démarre un serveur local si aucun serveur n’écoute à l’adresse configurée. Il n’arrête que le serveur qu’il a lui-même lancé. Le tunnel WDA manuel reste une solution de secours pour le miroir ; il doit être explicitement associé au bon UDID.

## Exécution

Dans Exécution, `▶` sur un scénario le lance ; le bouton global lance toutes les racines. Un appareil par OS, deux OS en parallèle. Les étapes d’un même appareil restent séquentielles. Bleu : en cours ; vert : réussi ; rouge : échec ; gris : ignoré/bloqué/annulé.

Le moteur exécute un **instantané** de l’arbre. Un échec non bloquant ne coupe pas la suite. Un échec bloquant bloque la suite de son scénario ; les autres scénarios restent indépendants. Un OS sans appareil donne un résultat bloqué, jamais un succès implicite.

Le rapport est diffusé en direct et enregistré dans `reports/<run-id>.json`, avec les captures d’échec. Le dernier rapport est restauré à l’ouverture ; une exécution interrompue est marquée annulée. L’annulation est prise en compte entre les étapes et pendant les attentes ; le lancement initial d’une session native peut prendre plus longtemps.

Paramètres → Exécution propose : analyse IA automatique, demande à l’utilisateur, ou aucune analyse. L’analyse utilise l’étape originale et ses traces ; elle ne réécrit aucun test. Les popups de demande sont mises en file et ne bloquent pas le moteur. Une analyse peut être déclenchée depuis une entrée du rapport.

## Génération IA exploratoire

Connecter Codex ou GitHub Copilot dans Paramètres → Intégration IA. Les CLI officielles incluses gèrent l’authentification et réutilisent les sessions locales. Les modèles Copilot viennent du compte ; Codex utilise son catalogue local si disponible, un identifiant explicite ou son modèle par défaut.

Le moteur embarque ses consignes QA dans `electron/qa-instructions.ts` : protocole d’observation/action/réinspection, sélecteurs observés, cohérence inter-OS, préconditions, assertions, limites et analyse des régressions. Il envoie le **chemin courant complet en métadonnées**, l’arbre existant et les composants des appareils sélectionnés. L’IA peut naviguer pendant la génération ; ses décisions structurées sont exécutées uniquement par le backend sur des composants inspectés. Les outils système intégrés de Copilot sont désactivés ; Codex travaille dans un répertoire temporaire en lecture seule, sans recherche web.

L’exploration est limitée à 40 étapes / 10 minutes et peut être arrêtée. Un appareil réservé par une exécution ne peut pas être piloté simultanément par l’IA ou une action manuelle. Les sélecteurs proposés sont comparés aux sélecteurs effectivement observés.

La grande popup affiche l’arbre existant et les ajouts en bleu, avec détail à droite. Accepter ajoute les nœuds ; décliner garde l’arbre intact. Une révision empêche d’écraser silencieusement des modifications intervenues pendant la validation.

Les observations et demandes sont envoyées au fournisseur choisi, selon ses conditions et les quotas du compte. Les champs signalés comme sécurisés par l’OS sont masqués dans les composants envoyés au modèle. Les variantes de saisie acceptent `${NOM}` ; le moteur lit alors `CYBERFOX_SECRET_NOM` dans son environnement. Ne versionnez pas les valeurs des comptes de test.

Sources : [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [authentification Copilot](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate), [UiAutomator2](https://appium.github.io/appium-uiautomator2-driver/latest/getting-started/).

## Vérifications

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run test:electron
```

Les tests couvrent persistance, migration, contraintes de l’arbre, protocole WebDriver, attentes d’assertion, exécution parallèle, préconditions, échecs non bloquants et parcours d’édition/validation. Le test Electron utilise un dossier temporaire isolé.

Vérifications facultatives sur matériel et compte IA (consomment les ressources du poste et, pour l’IA, le quota du fournisseur) :

```sh
npm run test:mobile
npm run test:ai-live
```

Ces deux scripts sont dédiés à l’écran MFA de Pro SNP actuellement affiché sur un Android USB. Ils ne saisissent aucun identifiant et n’envoient aucun code. Le test IA vérifie que la proposition est fondée sur l’écran et qu’elle n’a pas été insérée sans accord.

Validation réelle effectuée pendant le développement : connexion Android jusqu’au choix de réception du code MFA, inspection de 37 composants, assertion sur le titre MFA réussie, génération Codex d’un scénario et d’une assertion sans insertion automatique. L’essai iPhone est bloqué par Xcode (« No Accounts » et profil WDA absent). Le fonctionnement simultané Android+iOS est couvert avec des pilotes de test ; il reste à valider sur les deux appareils physiques une fois la signature iOS préparée.

Les dépendances Appium apportent des avis `npm audit`, dont certains concernent des dépendances empaquetées dans les pilotes et ne sont pas corrigés par `npm audit fix`. Le serveur reste limité à l’interface locale. Les installateurs signés et la validation du packaging Appium restent à préparer avant distribution.
