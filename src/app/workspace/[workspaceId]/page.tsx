'use client';

import WorkspacePage from '../../../views/WorkspacePage';
import { useAppSettings } from '../../../contexts/AppSettingsContext';

export default function Page() {
  const { darkMode, setDarkMode } = useAppSettings();
  return <WorkspacePage darkMode={darkMode} setDarkMode={setDarkMode} />;
}
