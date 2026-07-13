'use client';

import NotificationsPage from '../../views/NotificationsPage';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <NotificationsPage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
