# Campagnes, captures et cartographie

Dans l’onglet **Exécution**, cliquer sur **Lancer une nouvelle campagne de test** ou choisir une campagne existante. Le moteur refuse de démarrer sans campagne ouverte. La campagne sélectionnée est restaurée avec le projet. Son horodatage de création reste fixe ; son libellé est modifiable.

Une campagne contient plusieurs exécutions. Les boutons ▶ de l’arbre permettent d’exécuter un scénario ou un élément isolé. Un lancement partiel conserve ses enfants et revérifie sa précondition immédiate, sans rejouer automatiquement tous les ancêtres : l’application doit être dans l’état approprié. Le bouton de lecture d’un élément dans un panneau appareil, dans l’onglet Exécution, enregistre également une exécution dans la campagne pour cet OS. Les nouvelles tentatives s’ajoutent à l’historique. **Terminer la campagne** la ferme aux nouveaux lancements ; **Rouvrir** permet de poursuivre.

## Identification des écrans

Une navigation décrit son écran de destination avec un identifiant stable, un nom et des repères distinctifs pour chaque OS. L’IA complète ces champs pendant la génération. Les repères doivent avoir été observés ensemble sur le même écran et chacun doit désigner un seul composant. Les définitions contradictoires et les écrans différents utilisant exactement les mêmes repères sont refusés.

Dans l’éditeur d’une navigation, saisir l’identifiant et le nom de l’écran. Sur le miroir, sélectionner un composant de destination puis **Ajouter comme repère de l’écran destination**. Répéter avec des composants distinctifs, par exemple le titre et un champ propre à cet écran. Éviter les boutons génériques présents partout. Les navigations qui référencent le même écran partagent sa définition.

Pendant l’exécution, la navigation attend la présence des repères de destination dans la limite du délai de son opération. L’écran doit correspondre à une seule définition. Un écran sans correspondance ou avec plusieurs correspondances reste explicitement non identifié ; son empreinte de composants permet de conserver l’observation, sans lui attribuer un nom métier inventé. Les anciennes navigations doivent être complétées avant de pouvoir confirmer leur écran de destination.

## Captures et consultation pendant le déroulement

Chaque action, test et navigation exécuté conserve son résultat propre, l’écran avant et après l’opération, son heure et une capture PNG. La capture est demandée aussi bien après un succès qu’après un échec, avant d’exécuter les enfants. Une capture impossible est signalée sans remplacer le résultat du test. Les préconditions exécutées ont également leur capture. Les étapes simplement ignorées ou bloquées ne fabriquent pas de capture.

La frise verticale à droite de l’arbre permet de sélectionner une étape, d’avancer ou reculer et de lire automatiquement les captures. Elles remplacent les miroirs en consultation seule. Pour chaque OS, l’image est celle de sa dernière étape terminée à l’instant sélectionné, avec son propre horodatage. S’il n’existe aucune capture pour cet OS à cet instant, le panneau le précise. Les tests continuent pendant la consultation ; **Revenir au direct** restaure les miroirs. Les miroirs restent connectés pendant cette consultation. La sélection est partagée avec la fenêtre Appareils externalisée.

L’exécution consultée conserve une copie des scénarios utilisés. Les résultats et captures des anciennes tentatives restent disponibles même si le projet évolue. Les labels d’écran marquent les changements dans l’arbre et dans l’historique de progression.

## Carte et rapport

La vue **Cartographie des écrans** présente l’arbre des écrans Android/iOS et un graphe des transitions effectivement observées. Chaque écran indique ses vérifications réussies et ses échecs lorsqu’il en existe. Les compteurs correspondent aux tentatives de vérification, sans compter les scénarios parents ni les revérifications de précondition. Les actions et navigations restent consultables dans le détail de l’écran. Sélectionner une étape de ce détail ouvre sa capture. Une transition observée n’est pas une preuve que toutes les branches de l’application ont été explorées.

La vue **Rapport de campagne** présente une synthèse textuelle et les résultats des exécutions. **Exporter en texte (sans captures)** télécharge un fichier `.txt` réutilisable dans une page Confluence. Il ne contient ni images, ni données d’image, ni chemins des captures.

## Conservation et nettoyage

Les fichiers sont regroupés dans `campaigns/<identifiant>/` dans le dossier du projet :

- `campaign.json` : libellé, dates et état de la campagne ;
- `reports/` : résultats, analyses, identités d’écran et copies des scénarios ;
- `captures/` : fichiers PNG immuables référencés par les rapports.

Les rapports ne recopient pas les images en base64 à chaque mise à jour. La fermeture du logiciel tente de terminer les sauvegardes ; une exécution interrompue est restaurée comme annulée, avec les étapes déjà conservées. Les anciens rapports hors campagne restent dans le dossier `reports` initial du projet.

**Nettoyer cette campagne** efface ses exécutions et ses captures, tout en conservant son libellé et sa date. **Tout nettoyer** fait de même pour toutes les campagnes du projet courant. Ces actions demandent confirmation et sont refusées pendant une exécution ou une analyse concernée.
