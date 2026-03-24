import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartdukaan.app',
  appName: 'Smart Dukaan',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    allowNavigation: ['*']
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      androidBackgroundColor: '#22c55e',
      showSpinner: false
    }
  }
};

export default config;