'use client';

import ResultsPage from '../../views/ResultsPage';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <ResultsPage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
