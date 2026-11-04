import { useEffect, useRef, useState } from 'react';
import { Game } from './core/Game.js';
import { GameState } from './core/GameStateMachine.js';
import { settingsStore } from './settings/settingsStore.js';
import { appStore } from './state/appStore.js';
import { AboutScreen } from './ui/AboutScreen.jsx';
import { GameContext, useApp } from './ui/hooks.js';
import { HUD } from './ui/HUD.jsx';
import { DesktopOnlyNotice, GraphicsErrorNotice } from './ui/Notices.jsx';
import { MainMenu } from './ui/MainMenu.jsx';
import { ModeSelection } from './ui/ModeSelection.jsx';
import { CountdownOverlay, PauseMenu, ReadyOverlay } from './ui/SessionScreens.jsx';
import { ResultsScreen } from './ui/ResultsScreen.jsx';
import { SettingsPanel } from './ui/SettingsPanel.jsx';
import { StatisticsScreen } from './ui/StatisticsScreen.jsx';

const hasMouse = () => window.matchMedia('(any-pointer: fine)').matches;

function Screens() {
  const screen = useApp((state) => state.screen);
  switch (screen) {
    case GameState.MAIN_MENU:
      return <MainMenu />;
    case GameState.MODE_SELECTION:
      return <ModeSelection />;
    case GameState.READY:
      return <ReadyOverlay />;
    case GameState.COUNTDOWN:
    case GameState.PLAYING:
      return <CountdownOverlay />;
    case GameState.PAUSED:
      return <PauseMenu />;
    case GameState.RESULTS:
      return <ResultsScreen />;
    case GameState.SETTINGS:
      return <SettingsPanel />;
    case GameState.STATISTICS:
      return <StatisticsScreen />;
    case GameState.ABOUT:
      return <AboutScreen />;
    default:
      return null;
  }
}

export function App() {
  const container = useRef(null);
  const [game, setGame] = useState(null);
  const [failed, setFailed] = useState(false);
  const [desktop] = useState(hasMouse);

  useEffect(() => {
    if (!desktop || !container.current) return undefined;
    let instance;
    try {
      instance = new Game({ container: container.current, settingsStore, appStore });
      setGame(instance);
    } catch (error) {
      console.error(error);
      setFailed(true);
      return undefined;
    }

    // The saved copy must not lag behind if the tab closes right after a change.
    const flush = () => settingsStore.getState().flush();
    window.addEventListener('pagehide', flush);

    if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
      window.__vernier = instance;
    }

    return () => {
      window.removeEventListener('pagehide', flush);
      instance.dispose();
      setGame(null);
    };
  }, [desktop]);

  if (!desktop) return <DesktopOnlyNotice />;
  if (failed) return <GraphicsErrorNotice />;

  return (
    <div ref={container} className="fixed inset-0">
      {game && (
        <GameContext.Provider value={game}>
          <HUD />
          <Screens />
        </GameContext.Provider>
      )}
    </div>
  );
}
