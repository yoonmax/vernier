import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useStore } from 'zustand';
import { settingsStore } from '../settings/settingsStore.js';
import { getMode, resolveOptions } from '../modes/modeCatalog.js';
import { appStore } from '../state/appStore.js';

gsap.registerPlugin(useGSAP);

export const GameContext = createContext(null);

export const useGame = () => useContext(GameContext);
export const useApp = (selector) => useStore(appStore, selector);
export const useSettings = (selector) => useStore(settingsStore, selector);

/** The selected mode's options. Memoised, because resolving them creates a new object. */
export function useModeOptions() {
  const modeId = useApp((state) => state.modeId);
  const saved = useApp((state) => state.optionsByMode[modeId]);
  return useMemo(() => resolveOptions(getMode(modeId), saved), [modeId, saved]);
}

/** Runs a callback when Escape is pressed. Used by screens that can go back. */
export function useEscape(handler) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler]);
}

/** Click handler wrappers that also play the interface sounds. */
export function useUiSound() {
  const game = useGame();
  const hover = useCallback(() => game?.audio.play('uiHover', 'ui'), [game]);
  const confirm = useCallback(() => game?.audio.play('uiConfirm', 'ui'), [game]);
  return { hover, confirm };
}

/**
 * The shared entrance for every screen, in one short sequence:
 * - [data-reveal] text rises out of a mask
 * - [data-fade] content fades in slightly later
 * - [data-rule] lines draw from the left
 *
 * With reduced motion, everything simply appears. Never blocks input: all content is
 * interactive from the first frame, whatever point the animation has reached.
 */
export function useEntrance(scope) {
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } });
        const reveals = gsap.utils.toArray('[data-reveal]', scope.current);
        const fades = gsap.utils.toArray('[data-fade]', scope.current);
        const rules = gsap.utils.toArray('[data-rule]', scope.current);
        if (reveals.length > 0) {
          timeline.from(reveals, { yPercent: 108, duration: 0.8, stagger: 0.045 }, 0);
        }
        if (rules.length > 0) {
          timeline.from(rules, { scaleX: 0, transformOrigin: 'left center', duration: 0.9, stagger: 0.04 }, 0.05);
        }
        if (fades.length > 0) {
          timeline.from(fades, { autoAlpha: 0, y: 8, duration: 0.5, stagger: 0.025, ease: 'power2.out' }, 0.14);
        }
      });
      return () => media.revert();
    },
    { scope },
  );
}
