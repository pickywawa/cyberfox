import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Device, DeviceCheck, DeviceHealth, Settings } from '../shared/model.js';
import type { Automation } from './automation.js';
import { command, commandEnv } from './commands.js';
import { failureComponent, WDA_PROVISIONING_DOC, NON_MAC_DOC } from './ios-config.js';

export class DeviceDiagnostics {
  private probes = new Map<string, { time: number; task: Promise<string> }>();
  constructor(
    private automation: Automation,
    private settings: () => Settings,
  ) {}
  private probe(name: string, args: string[]) {
    const old = this.probes.get(name);
    if (old && Date.now() - old.time < 30000) return old.task;
    const task = command(name, args, { timeout: 6000 }).then(
      (buffer) => buffer.toString().trim() || 'Disponible',
    );
    // Store rejected results too, so opening a menu does not launch repeated host processes.
    void task.catch(() => {});
    this.probes.set(name, { time: Date.now(), task });
    return task;
  }
  async health(device: Device | undefined, id: string): Promise<DeviceHealth> {
    const settings = this.settings();
    const t = (fr: string, en: string) => (settings.language === 'en' ? en : fr);
    const checks: DeviceCheck[] = [];
    const connection = this.automation.connectionState(id);
    const add = (
      id: string,
      label: string,
      state: DeviceCheck['state'],
      detail: string,
      fix?: string,
      documentation?: string,
    ) => checks.push({ id, label, state, detail, fix, documentation });
    add(
      'connection',
      device?.platform === 'android' ? 'ADB / USB' : 'USB / iPhone',
      !device || device.status !== 'ready'
        ? 'error'
        : device.kind === 'manual' && !connection.connected
          ? 'unknown'
          : 'ok',
      device?.detail ??
        t('Appareil absent du dernier relevé.', 'Device missing from the last scan.'),
      t(
        'Branchez et déverrouillez le téléphone. Autorisez la confiance / le débogage USB sur le téléphone, puis actualisez les appareils dans Cyberfox.',
        'Connect and unlock the phone, approve trust / USB debugging on the phone, then refresh devices in Cyberfox.',
      ),
    );
    let appiumReady = false;
    try {
      appiumReady = !!(await this.automation.request('/status', 'GET', undefined, 1500))?.ready;
    } catch {}
    add(
      'appium',
      'Appium',
      appiumReady ? 'ok' : connection.starting ? 'pending' : 'error',
      appiumReady
        ? t('Serveur joignable : ', 'Server reachable: ') + settings.appiumUrl
        : t(
            'Le serveur ne répond pas à son adresse configurée.',
            'The server is not responding at its configured address.',
          ),
      t(
        'Dans Cyberfox → Paramètres → Appareils, vérifiez l’adresse Appium. Reconnecter démarre le serveur local si nécessaire.',
        'In Cyberfox → Settings → Devices, check the Appium URL. Reconnect starts the local server when needed.',
      ),
    );
    if (connection.connected) {
      if (!appiumReady) connection.connected = false;
      else if (connection.sessionId) {
        try {
          await this.automation.request(
            '/session/' + connection.sessionId + '/timeouts',
            'GET',
            undefined,
            1500,
          );
        } catch {
          connection.connected = false;
        }
      }
    }
    const ios = device?.platform === 'ios' || id.startsWith('ios:') || id.startsWith('sim:');
    const modules = path
      .resolve(import.meta.dirname, '../../node_modules')
      .replace('app.asar/', 'app.asar.unpacked/');
    const pkgName = ios ? 'appium-xcuitest-driver' : 'appium-uiautomator2-driver';
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(modules, pkgName, 'package.json'), 'utf8'),
      );
      add(
        'driver',
        ios ? 'XCUITest' : 'UiAutomator2',
        'ok',
        t('Pilote installé · version ', 'Driver installed · version ') + pkg.version,
        t(
          'Installé ne signifie pas que la session appareil est prête ; consultez le statut de l’agent.',
          'Installed does not mean the device session is ready; check the agent status.',
        ),
      );
    } catch {
      add(
        'driver',
        ios ? 'XCUITest' : 'UiAutomator2',
        'error',
        t('Pilote inclus introuvable.', 'Bundled driver not found.'),
        t(
          'Réinstallez Cyberfox. En développement : npm ci.',
          'Reinstall Cyberfox. In development: npm ci.',
        ),
      );
    }
    if (ios) {
      if (connection.connected && connection.sessionId) {
        try {
          const locked = await this.automation.request(
            '/session/' + connection.sessionId + '/execute/sync',
            'POST',
            { script: 'mobile: isLocked', args: [] },
            3000,
          );
          if (typeof locked === 'boolean')
            add(
              'lock',
              t('Écran iPhone', 'iPhone screen'),
              locked ? 'error' : 'ok',
              locked
                ? t(
                    'L’iPhone est verrouillé : le formulaire de l’application n’est pas accessible.',
                    'The iPhone is locked: the app form is not accessible.',
                  )
                : t('L’iPhone est déverrouillé.', 'The iPhone is unlocked.'),
              t(
                'Déverrouillez manuellement l’iPhone, rouvrez l’application testée et choisissez Réglages iPhone → Luminosité et affichage → Verrouillage automatique → Jamais pendant la QA.',
                'Manually unlock the iPhone, reopen the app under test and select iPhone Settings → Display & Brightness → Auto-Lock → Never during QA.',
              ),
            );
        } catch {
          /* Screen lock status is optional on unsupported driver versions. */
        }
      }
      if (settings.iosKeepAwake && device?.kind !== 'simulator') {
        const activity = connection.keepAwake;
        const state = activity?.state;
        add(
          'keep-awake',
          t('Maintien éveillé · expérimental', 'Keep awake · experimental'),
          state === 'error' || state === 'locked'
            ? 'error'
            : state === 'active'
              ? 'ok'
              : state === 'paused'
                ? 'unknown'
                : 'pending',
          state === 'active'
            ? t(
                'Appuis volume + / − envoyés. Dernière interaction : ',
                'Volume up / down sent. Last activity: ',
              ) +
                activity!.lastActivity +
                t(
                  '. L’effet sur la veille reste à vérifier.',
                  '. Sleep prevention still needs verification.',
                )
            : state === 'locked'
              ? t(
                  'iPhone verrouillé : aucune interaction de maintien envoyée.',
                  'iPhone locked: no keep-awake interaction sent.',
                )
              : state === 'paused'
                ? t(
                    'Suspendu pendant une commande mobile ou une exécution de tests.',
                    'Paused during a mobile command or test execution.',
                  )
                : state === 'error'
                  ? t('Dernière tentative impossible : ', 'Last attempt failed: ') +
                    activity!.detail
                  : t(
                      'En attente d’une session WDA disponible et du prochain cycle de 20 secondes.',
                      'Waiting for an available WDA session and the next 20-second cycle.',
                    ),
          t(
            'Dans Cyberfox → Paramètres → Appareils → iOS, désactivez cette option si les boutons de volume perturbent votre application. Déverrouillez manuellement l’iPhone si nécessaire. Cette option ne modifie pas la politique de verrouillage.',
            'In Cyberfox → Settings → Devices → iOS, turn this off if volume buttons interfere with your app. Manually unlock the iPhone if necessary. This option does not change the lock policy.',
          ),
        );
      }
      const mode = settings.iosWdaMode ?? 'build';
      if (mode === 'build') {
        if (process.platform !== 'darwin')
          add(
            'xcode',
            'Xcode',
            'error',
            t(
              'La compilation WDA est disponible uniquement sur macOS.',
              'Building WDA is only available on macOS.',
            ),
            t(
              'Préparez WDA sur un Mac, puis choisissez WDA préinstallé ou externe dans Cyberfox → Paramètres → Appareils. Windows/Linux requiert iOS 18+ et RemoteXPC.',
              'Prepare WDA on a Mac, then choose preinstalled or external WDA in Cyberfox → Settings → Devices. Windows/Linux requires iOS 18+ and RemoteXPC.',
            ),
            NON_MAC_DOC,
          );
        else
          try {
            add(
              'xcode',
              'Xcode',
              'ok',
              await this.probe('xcodebuild', ['-version']),
              t(
                'La présence de Xcode ne valide ni le profil de signature, ni la préparation de l’iPhone.',
                'Xcode being present does not validate signing or iPhone preparation.',
              ),
            );
          } catch (e) {
            add(
              'xcode',
              'Xcode',
              'error',
              String(e),
              t(
                'Installer Xcode, l’ouvrir une fois et sélectionner ses outils de ligne de commande dans Xcode → Settings → Locations.',
                'Install Xcode, open it once and select its command line tools in Xcode → Settings → Locations.',
              ),
            );
          }
        if (device?.kind !== 'simulator') {
          const configured = !!(
            settings.iosWdaBundleId &&
            (settings.iosXcodeConfigFile || settings.iosTeamId)
          );
          const validTeam = !settings.iosTeamId || /^[A-Z0-9]{10}$/.test(settings.iosTeamId);
          let configExists = true;
          if (settings.iosXcodeConfigFile)
            try {
              await fs.access(settings.iosXcodeConfigFile);
            } catch {
              configExists = false;
            }
          add(
            'signing',
            t('Signature WDA', 'WDA signing'),
            connection.connected
              ? 'ok'
              : configured && validTeam && configExists
                ? 'unknown'
                : 'error',
            connection.connected
              ? t(
                  'Une session WDA a été établie avec ces réglages.',
                  'A WDA session was established with these settings.',
                )
              : t(
                  'Team ID / fichier xcconfig et profil Development WDA doivent correspondre. Un champ renseigné ne prouve pas qu’un profil valide est installé.',
                  'Team ID / xcconfig and WDA Development profile must match. A filled field does not prove that a valid profile is installed.',
                ),
            t(
              'Dans Cyberfox → Paramètres → Appareils : utilisez un Bundle ID WDA autorisé par votre équipe. Le profil Development doit couvrir la base + .xctrunner, cet iPhone et une clé Apple Development présente sur le Mac. Un profil TestFlight ne convient pas. Vérifiez aussi le chemin xcconfig et le Team ID à 10 caractères.',
              'In Cyberfox → Settings → Devices: use a WDA Bundle ID allowed by your team. A Development profile must cover the base + .xctrunner, this iPhone and an Apple Development key on the Mac. A TestFlight profile does not work. Also check the xcconfig path and the 10-character Team ID.',
            ),
            WDA_PROVISIONING_DOC,
          );
        }
      } else
        add(
          'signing',
          t('WDA préparé', 'Prepared WDA'),
          connection.connected ? 'ok' : 'unknown',
          mode === 'preinstalled'
            ? t(
                'WDA doit déjà être installé et signé sur l’iPhone. Cyberfox ne le compile pas dans ce mode.',
                'WDA must already be installed and signed on the iPhone. Cyberfox does not build it in this mode.',
              )
            : t(
                'WDA doit être lancé et l’adresse locale associée au bon UDID.',
                'WDA must be running and its local URL associated with the right UDID.',
              ),
          t(
            'Dans Cyberfox → Paramètres → Appareils, vérifiez le mode WDA, son Bundle ID, l’UDID et, sous Windows/Linux, iOS 18+ et le tunnel RemoteXPC.',
            'In Cyberfox → Settings → Devices, check WDA mode, Bundle ID, UDID and, on Windows/Linux, iOS 18+ and RemoteXPC.',
          ),
          NON_MAC_DOC,
        );
      if (device?.ddiReady !== undefined)
        add(
          'ddi',
          t('Préparation iOS', 'iOS preparation'),
          device.ddiReady ? 'ok' : 'error',
          device.ddiReady
            ? t(
                'Services développeur iOS disponibles lors de la dernière détection.',
                'iOS developer services were available at the last scan.',
              )
            : t(
                'Image développeur iOS (DDI) non montée lors de la dernière détection.',
                'iOS developer image (DDI) was not mounted at the last scan.',
              ),
          t(
            'Déverrouillez l’iPhone et gardez son écran allumé. Dans Xcode → Window → Devices and Simulators, attendez la fin de sa préparation. Vérifiez la compatibilité Xcode/iOS.',
            'Unlock the iPhone and keep the screen on. In Xcode → Window → Devices and Simulators, wait for preparation to finish. Check Xcode/iOS compatibility.',
          ),
        );
    } else {
      try {
        await this.probe('java', ['-version']);
        await fs.access(commandEnv.ANDROID_HOME);
        add(
          'environment',
          'JDK / SDK',
          'ok',
          t('Java disponible et dossier SDK trouvé.', 'Java available and SDK directory found.'),
        );
      } catch (e) {
        add(
          'environment',
          'JDK / SDK',
          'error',
          String(e),
          t(
            'Installez un JDK et Android SDK Platform Tools. Vérifiez JAVA_HOME et ANDROID_HOME avant de lancer Cyberfox.',
            'Install a JDK and Android SDK Platform Tools. Check JAVA_HOME and ANDROID_HOME before launching Cyberfox.',
          ),
        );
      }
    }
    add(
      'agent',
      ios ? 'WebDriverAgent' : 'Agent UiAutomator2',
      connection.connected ? 'ok' : connection.connecting ? 'pending' : 'error',
      connection.connected
        ? t(
            'Session native établie ; les composants peuvent être explorés.',
            'Native session established; components can be inspected.',
          )
        : connection.connecting
          ? t('Connexion native en cours.', 'Native connection in progress.')
          : t(
              'Aucune session native prête pour cet appareil.',
              'No native session ready for this device.',
            ),
      t(
        'Corrigez les composants rouges, puis cliquez Reconnecter. Un miroir Android ADB peut fonctionner sans session UiAutomator2.',
        'Fix the red components, then click Reconnect. Android ADB mirroring can work without a UiAutomator2 session.',
      ),
    );
    if (connection.failure) {
      const component = failureComponent(connection.failure);
      const check = checks.find((c) => c.id === component) ?? checks.find((c) => c.id === 'agent')!;
      check.state = 'error';
      check.log = connection.failure;
      check.detail +=
        '\n' + t('Dernier échec : ', 'Last failure: ') + connection.failure.split('\n')[0];
    }
    return { deviceId: id, checkedAt: new Date().toISOString(), checks };
  }
}
