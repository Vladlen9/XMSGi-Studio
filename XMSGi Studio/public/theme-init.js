(() => {
  let theme = 'light';
  let themeVariant = '';

  try {
    const savedTheme = globalThis.localStorage.getItem('xmsgi-color-theme-v1');
    theme = savedTheme === 'dark' || savedTheme === 'charcoal' ? 'dark' : 'light';
    themeVariant = savedTheme === 'charcoal' ? 'charcoal' : '';
  } catch {
    // Keep the default light theme when browser storage is unavailable.
  }

  const root = globalThis.document.documentElement;
  root.dataset.theme = theme;
  if (themeVariant) root.dataset.themeVariant = themeVariant;
  root.style.colorScheme = theme;
  root.style.backgroundColor = themeVariant === 'charcoal' ? '#252422' : theme === 'dark' ? '#0d1115' : '#f7f8fa';
})();
