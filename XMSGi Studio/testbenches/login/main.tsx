import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '@/lib/i18n';
import { applyTestbenchColorTheme, readTestbenchColorTheme } from '../shared/testbenchTheme';
import '../../src/index.css';
import '../../src/styles/colorThemes.css';
import { LoginTestbench } from './LoginTestbench';

applyTestbenchColorTheme(readTestbenchColorTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <LoginTestbench />
    </LocaleProvider>
  </StrictMode>,
);
