import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bookshelf.personal',
  appName: 'BookShelf',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
