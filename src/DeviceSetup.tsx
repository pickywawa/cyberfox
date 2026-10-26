import { ExternalLink, Info, Laptop } from 'lucide-react';
import { api } from './bridge';
import type { L } from './NodeEditor';
export function DeviceSetup({ L }: { L: L }) {
  return (
    <div className="device-setup-guide">
      <div className="connection-chain">
        <span>Cyberfox</span> → <span>Appium</span> → <span>XCUITest</span> →{' '}
        <span>WebDriverAgent</span> → <span>{L('App testée', 'App under test')}</span>
      </div>
      <div className="notice">
        <Info size={18} />
        <div>
          <b>
            {L(
              'TestFlight et WebDriverAgent : deux applications, deux signatures',
              'TestFlight and WebDriverAgent: two apps, two signatures',
            )}
          </b>
          <p>
            {L(
              'Votre application TestFlight reste telle quelle. WebDriverAgent (WDA) est un petit runner de test installé séparément sur l’iPhone pour explorer les composants, agir et capturer l’écran. Son profil de développement est distinct du profil App Store/TestFlight de votre application.',
              'Your TestFlight app stays as it is. WebDriverAgent (WDA) is a small test runner installed separately on the iPhone to inspect components, interact and capture the screen. Its development profile is separate from your app’s App Store/TestFlight profile.',
            )}
          </p>
        </div>
      </div>
      <details open>
        <summary>
          {L(
            'Configurer un iPhone avec le compte Apple de l’équipe',
            'Set up an iPhone with your team’s Apple account',
          )}
        </summary>
        <ol>
          <li>
            <b>{L('Sur l’iPhone', 'On the iPhone')}</b> —{' '}
            {L(
              'activer le mode développeur, approuver ce Mac, déverrouiller l’écran et le garder allumé pendant la première connexion.',
              'enable Developer Mode, trust this Mac, unlock the screen and keep it on during first connection.',
            )}
            <p>
              {L(
                'Pour garder l’écran allumé pendant la QA : sur l’iPhone, Réglages → Luminosité et affichage → Verrouillage automatique → Jamais. Si le choix est grisé, désactiver le mode économie d’énergie ; une restriction de gestion d’entreprise peut aussi limiter ce réglage. Cyberfox ne désactive pas automatiquement le verrouillage système via WDA.',
                'To keep the screen on during QA: on the iPhone, Settings → Display & Brightness → Auto-Lock → Never. If unavailable, turn off Low Power Mode; company management restrictions may also limit this setting. Cyberfox does not automatically disable system Auto-Lock through WDA.',
              )}
            </p>
          </li>
          <li>
            <b>Xcode</b> —{' '}
            {L(
              'Window → Devices and Simulators : attendre que l’iPhone soit prêt. Settings → Apple Accounts : ajouter le compte autorisé à signer pour votre équipe. Le certificat Apple Development et sa clé privée doivent être présents dans le trousseau du Mac.',
              'Window → Devices and Simulators: wait for the iPhone to be ready. Settings → Apple Accounts: add an account allowed to sign for your team. An Apple Development certificate and its private key must be in this Mac’s keychain.',
            )}
          </li>
          <li>
            <b>
              {L('Identifiant WDA de votre organisation', 'Your organization’s WDA identifier')}
            </b>{' '}
            —{' '}
            {L(
              'choisir une base dédiée, par exemple com.pickywawa.cyberfox.WebDriverAgentRunner. Le profil Development doit autoriser cette base suivie de .xctrunner (ou un wildcard compatible), le certificat et l’UDID des iPhone QA. Le nom affiché dans Cyberfox ne crée pas d’identifiant Apple à lui seul.',
              'choose a dedicated base, for example com.pickywawa.cyberfox.WebDriverAgentRunner. The Development profile must allow this base plus .xctrunner (or a compatible wildcard), the certificate and QA iPhone UDIDs. Typing the name in Cyberfox does not by itself create an Apple identifier.',
            )}
            <div className="apple-profile-steps">
              <p>
                {L(
                  'Exemple Cyberfox : base com.pickywawa.cyberfox.WebDriverAgentRunner ; identifiant final com.pickywawa.cyberfox.WebDriverAgentRunner.xctrunner. Cet exemple n’est pas enregistré pour votre équipe : utilisez un identifiant disponible et autorisé par votre organisation.',
                  'Cyberfox example: base com.pickywawa.cyberfox.WebDriverAgentRunner; final identifier com.pickywawa.cyberfox.WebDriverAgentRunner.xctrunner. This example is not registered for your team: use an available identifier authorized by your organization.',
                )}
              </p>
              <p>
                <b>Apple Developer → Certificates, Identifiers &amp; Profiles</b>
              </p>
              <ul>
                <li>
                  {L(
                    'Identifiers → + → App IDs → App : déclarer un Bundle ID explicite correspondant à l’identifiant final avec .xctrunner. Aucun enregistrement App Store Connect n’est nécessaire pour WDA.',
                    'Identifiers → + → App IDs → App: register an explicit Bundle ID matching the final identifier with .xctrunner. WDA needs no App Store Connect listing.',
                  )}
                </li>
                <li>
                  {L(
                    'Devices : enregistrer les UDID des iPhone QA. Certificates : disposer d’un certificat Apple Development.',
                    'Devices: register QA iPhone UDIDs. Certificates: have an Apple Development certificate available.',
                  )}
                </li>
                <li>
                  {L(
                    'Profiles → + → iOS App Development : sélectionner cet identifiant, le certificat de développement et les iPhone QA ; nommer le profil, Generate puis Download. Les profils AdHoc et App Store des applications testées restent inchangés.',
                    'Profiles → + → iOS App Development: select this identifier, the development certificate and QA iPhones; name the profile, Generate, then Download. Existing AdHoc and App Store profiles for your tested apps stay as they are.',
                  )}
                </li>
              </ul>
              <p>
                <b>{L('Installer le profil sur le Mac', 'Install the profile on the Mac')}</b>
              </p>
              <p>
                {L(
                  'Ouvrir Xcode puis glisser le fichier .mobileprovision téléchargé sur son icône dans le Dock. L’installation peut être silencieuse. Autre possibilité : Xcode → Settings → Accounts / Apple Accounts → votre compte → votre équipe → Download Manual Profiles.',
                  'Open Xcode, then drag the downloaded .mobileprovision file onto its Dock icon. Installation may be silent. Alternatively: Xcode → Settings → Accounts / Apple Accounts → your account → your team → Download Manual Profiles.',
                )}
              </p>
              <p>
                <b>
                  {L(
                    'Installer et vérifier le certificat avec sa clé privée',
                    'Install and verify the certificate with its private key',
                  )}
                </b>
              </p>
              <p>
                {L(
                  'Ouvrir Trousseaux d’accès → Mes certificats : déplier Apple Development: … et vérifier qu’une clé privée apparaît dessous. Un fichier .cer seul ne contient pas cette clé. Si le certificat vient d’un autre Mac, importer le fichier .p12 exporté avec sa clé privée (mot de passe requis), ou utiliser votre lane match development pour synchroniser certificat, clé et profil depuis le stockage de l’équipe. Si aucun certificat n’existe, le créer via Xcode → Settings → Apple Accounts → équipe → Manage Certificates → + → Apple Development, puis l’inclure dans le profil.',
                  'Open Keychain Access → My Certificates: expand Apple Development: … and verify that a private key appears underneath. A .cer file alone does not contain this key. If the certificate comes from another Mac, import its exported .p12 containing the private key (password required), or use your match development lane to sync the certificate, key and profile from team storage. If no certificate exists, create one through Xcode → Settings → Apple Accounts → team → Manage Certificates → + → Apple Development, then include it in the profile.',
                )}
              </p>
            </div>
          </li>
          <li>
            <b>{L('Dans Cyberfox → Paramètres → Appareils', 'In Cyberfox → Settings → Devices')}</b>{' '}
            —{' '}
            {L(
              'renseigner le Team ID à 10 caractères et la base WDA, enregistrer puis cliquer Reconnecter sur l’iPhone. En mode compilation, Xcode peut gérer le provisionnement automatiquement si votre compte a les droits ; sinon utiliser le profil installé par l’équipe et un fichier .xcconfig.',
              'enter the 10-character Team ID and WDA base, save, then click Reconnect on the iPhone. In build mode, Xcode can provision automatically if the account has permission; otherwise use your team’s installed profile and an .xcconfig file.',
            )}
          </li>
        </ol>
      </details>
      <details>
        <summary>
          {L(
            'Équipe Fastlane / match : quel profil préparer ?',
            'Fastlane / match team: which profile is needed?',
          )}
        </summary>
        <p>
          {L(
            'Demandez à l’équipe qui gère match de créer ou synchroniser un profil de type development pour le runner WDA final (.xctrunner), avec les appareils QA enregistrés. Un match appstore pour le Bundle ID de l’application métier ne couvre pas WDA. En QA, synchroniser ensuite ce profil et son certificat sur le Mac ; readonly ne crée pas un profil manquant.',
            'Ask the team managing match to create or sync a development profile for the final WDA runner (.xctrunner), including registered QA devices. A match appstore profile for the business app Bundle ID does not cover WDA. Then sync this profile and certificate to the QA Mac; readonly does not create missing profiles.',
          )}
        </p>
        <p>
          {L(
            'Pour imposer le profil existant, renseigner un .xcconfig contenant DEVELOPMENT_TEAM, CODE_SIGN_IDENTITY = Apple Development, CODE_SIGN_STYLE = Manual et PROVISIONING_PROFILE_SPECIFIER avec le nom exact du profil WDA installé. Ce fichier est lu sur le Mac qui compile WDA. Lorsqu’il est fourni, Cyberfox n’envoie pas les paramètres automatiques de signature concurrents.',
            'To force an existing profile, provide an .xcconfig containing DEVELOPMENT_TEAM, CODE_SIGN_IDENTITY = Apple Development, CODE_SIGN_STYLE = Manual and PROVISIONING_PROFILE_SPECIFIER with the exact installed WDA profile name. This file is read on the Mac building WDA. When supplied, Cyberfox does not send competing automatic signing parameters.',
          )}
        </p>
        <p>
          {L(
            'Code 65 : compilation/signature à examiner dans le journal Xcode du menu d’état. Code 70 : vérifier aussi la préparation du téléphone, son déverrouillage et les images développeur (DDI).',
            'Code 65: inspect build/signing details in the status menu’s Xcode log. Code 70: also check device preparation, unlock state and developer images (DDI).',
          )}
        </p>
      </details>
      <details>
        <summary>
          <Laptop size={15} />{' '}
          {L('Windows / Linux avec un iPhone', 'Windows / Linux with an iPhone')}
        </summary>
        <p>
          {L(
            'Le pilote XCUITest propose un parcours limité pour iOS 18+ : WDA doit être préinstallé et signé (préparé auparavant sur Mac), ou déjà lancé et joignable. La compilation et les simulateurs iOS nécessitent toujours Xcode sur Mac. L’iPhone doit être indiqué manuellement par UDID et version iOS ; sa détection automatique USB n’est pas implémentée dans Cyberfox sous Windows/Linux.',
            'XCUITest provides a limited iOS 18+ path: WDA must be preinstalled and signed (prepared on a Mac beforehand), or already running and reachable. Building WDA and iOS simulators still require Xcode on Mac. Enter the iPhone UDID and iOS version manually; Cyberfox does not implement automatic USB iPhone discovery on Windows/Linux.',
          )}
        </p>
        <p>
          {L(
            'Prérequis supplémentaires : pilotes Apple Mobile Device sur Windows, dépendance et tunnel RemoteXPC préparés sur le poste. Choisir le mode WDA préinstallé ou externe dans les paramètres ci-dessus, puis sélectionner l’iPhone dans la rubrique Configuration manuelle du sélecteur. Ce parcours est avancé et n’a pas été validé sur un poste Windows pendant ce développement.',
            'Additional prerequisites: Apple Mobile Device drivers on Windows, plus the RemoteXPC dependency and tunnel prepared on the host. Choose preinstalled or external WDA in the settings above, then select the iPhone under Manual configuration in the picker. This advanced path was not validated on a Windows host during development.',
          )}
        </p>
        <button onClick={() => void api.openDeviceDocumentation('windows')}>
          <ExternalLink size={13} />
          {L('Guide officiel Windows/Linux', 'Official Windows/Linux guide')}
        </button>
        <button onClick={() => void api.openDeviceDocumentation('tunnels')}>
          <ExternalLink size={13} />
          RemoteXPC
        </button>
      </details>
      <button
        className="documentation-link"
        onClick={() => void api.openDeviceDocumentation('provisioning')}
      >
        <ExternalLink size={13} />
        {L(
          'Documentation officielle Appium : signature WDA',
          'Official Appium documentation: WDA signing',
        )}
      </button>
    </div>
  );
}
