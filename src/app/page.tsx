'use client';

import LandingPage from '../views/LandingPage';
import { useAppSettings } from '../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <LandingPage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
