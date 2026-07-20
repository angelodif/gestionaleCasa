import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.angelo.oraridaiana',
  appName: 'Orari Daiana',
  webDir: 'dist/gestionale-casa/browser',
  plugins: {
    BackgroundRunner: {
      // Percorso dello script eseguito in background (relativo a webDir)
      label: 'com.angelo.oraridaiana.background',
      src: 'assets/background-runner.js',
      event: 'backgroundFetch',
      // Intervallo in minuti (15 = minimo consentito da iOS; Android è gestito da WorkManager)
      interval: 60,
      autoStart: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#673AB7',
      sound: 'beep.wav',
    },
  },
};

export default config;

