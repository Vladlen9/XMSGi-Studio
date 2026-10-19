import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LocaleProvider } from '@/lib/i18n';
import { isDesktopTelegramRuntime } from '@/services/telegramAppService';

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}
document.documentElement.classList.toggle('electron-runtime', isDesktopTelegramRuntime());
window.scrollTo(0, 0);

const DevPreviewHarness = import.meta.env.DEV
  ? lazy(() => import('./DevPreviewHarness.tsx'))
  : null;
const devPreviewMode = new URLSearchParams(window.location.search).get('devPreview');
const useDevPreview = import.meta.env.DEV && (devPreviewMode === '1' || devPreviewMode === 'planner');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      {useDevPreview && DevPreviewHarness
        ? <Suspense fallback={null}><DevPreviewHarness /></Suspense>
        : <App />}
    </LocaleProvider>
  </StrictMode>
);
