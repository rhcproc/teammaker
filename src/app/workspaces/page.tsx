'use client';

import WorkspacesPage from '../../views/WorkspacesPage';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <WorkspacesPage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
