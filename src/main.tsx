import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource-variable/onest/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';

import { MIGRATED_FLAG, receiveMigration } from './lib/migrate';

// Pick up data moved from the old address before the app reads storage.
receiveMigration().then((result) => {
  if (result) {
    try {
      sessionStorage.setItem(MIGRATED_FLAG, result);
    } catch {
      /* ignore */
    }
  }
  createRoot(document.getElementById('root')!).render(<App />);
});
