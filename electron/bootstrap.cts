// Keep startup failures visible even when an ESM dependency fails before main loads.
import { app, dialog } from 'electron';
void import('./main.js').catch((error: unknown) => {
  console.error('Cyberfox could not load its main module:', error);
  void app.whenReady().then(() => {
    dialog.showErrorBox('Cyberfox', String(error));
    app.exit(1);
  });
});
