'use client';

import TeamMakerApp from '../../views/TeamMakerApp';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <TeamMakerApp darkMode={darkMode} setDarkMode={setDarkMode} />;
}
