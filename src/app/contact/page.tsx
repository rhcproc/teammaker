'use client';

import ContactPage from '../../views/ContactPage';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <ContactPage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
