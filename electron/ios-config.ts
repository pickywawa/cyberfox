import type { Device, Settings } from '../shared/model.js';
export const WDA_PROVISIONING_DOC =
  'https://appium.github.io/appium-xcuitest-driver/latest/getting-started/provisioning-profile/';
export const NON_MAC_DOC =
  'https://appium.github.io/appium-xcuitest-driver/latest/guides/non-macos-hosts/';
export function iosCapabilities(
  settings: Settings,
  device: Device,
  host = process.platform,
): Record<string, unknown> {
  const mode = settings.iosWdaMode ?? 'build';
  const physical = device.kind !== 'simulator';
  const caps: Record<string, unknown> = { 'appium:showXcodeLog': true };
  if (host !== 'darwin') {
    if (mode === 'build')
      throw new Error(
        'La compilation de WebDriverAgent nécessite Xcode sur Mac. Dans Cyberfox → Paramètres → Appareils, choisissez WDA préinstallé ou WDA externe pour Windows/Linux.',
      );
    const version = device.osVersion || settings.iosPlatformVersion;
    if (!version || Number.parseInt(version) < 18)
      throw new Error(
        'Windows/Linux : renseignez la version iOS (18 ou plus) dans Cyberfox → Paramètres → Appareils et préparez le tunnel RemoteXPC.',
      );
    caps['appium:platformVersion'] = version;
  }
  if (mode === 'external') {
    if (settings.wdaDeviceId !== device.id.slice(device.id.indexOf(':') + 1))
      throw new Error(
        'Dans Cyberfox → Paramètres → Appareils, associez l’adresse WDA externe à l’UDID exact de cet iPhone.',
      );
    caps['appium:webDriverAgentUrl'] = settings.wdaUrl;
    return caps;
  }
  if (physical && !settings.iosWdaBundleId)
    throw new Error(
      'Renseignez le Bundle ID de base WebDriverAgent dans Cyberfox → Paramètres → Appareils. Le profil Development doit couvrir cet identifiant suivi de .xctrunner ; le profil TestFlight de l’application métier ne convient pas.',
    );
  if (settings.iosWdaBundleId) caps['appium:updatedWDABundleId'] = settings.iosWdaBundleId;
  if (mode === 'preinstalled') {
    caps['appium:usePreinstalledWDA'] = true;
    return caps;
  }
  if (settings.iosXcodeConfigFile) caps['appium:xcodeConfigFile'] = settings.iosXcodeConfigFile;
  else if (settings.iosTeamId) {
    caps['appium:xcodeOrgId'] = settings.iosTeamId;
    caps['appium:xcodeSigningId'] = 'Apple Development';
    caps['appium:allowProvisioningUpdates'] = true;
    caps['appium:allowProvisioningDeviceRegistration'] = true;
  } else if (physical)
    throw new Error(
      'Dans Cyberfox → Paramètres → Appareils, renseignez le Team ID Apple ou un fichier .xcconfig de signature. Ajoutez aussi le compte Apple de cette équipe dans Xcode → Settings → Apple Accounts.',
    );
  return caps;
}
export function failureComponent(message: string) {
  if (/DeviceLocked|device is locked|déverrouill/i.test(message)) return 'connection';
  if (/developer disk|DDI|image could not be mounted/i.test(message)) return 'ddi';
  if (
    /No profiles|provision|No signing certificate|No Accounts|signature|code.?65|code '65'|requires a development team|bundle identifier/i.test(
      message,
    )
  )
    return 'signing';
  if (/Cannot find module|MODULE_NOT_FOUND|Appium ne démarre/i.test(message)) return 'appium';
  if (/driver.*not.*found|Could not find.*driver/i.test(message)) return 'driver';
  if (/xcodebuild|Xcode/i.test(message)) return 'xcode';
  return 'agent';
}
