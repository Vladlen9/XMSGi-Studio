import { useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import editorLogo from '@/assets/logo.png';
import type { StageMode } from '@/components/stages/types';

export interface LogoIntroState {
  hasPlayed: boolean;
  flying: boolean;
  glowActive: boolean;
  glowFinishing: boolean;
  introReady: boolean;
}

interface Props {
  stageMode: StageMode;
  editorFocused: boolean;
  hasContent: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  state: LogoIntroState;
  setState: Dispatch<SetStateAction<LogoIntroState>>;
}

export function LogoIntroAnimation({ stageMode, editorFocused, hasContent, editorRef, state, setState }: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasPlayedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (stageMode !== 'editor') {
      setState({ hasPlayed: false, flying: false, glowActive: false, glowFinishing: false, introReady: false });
      hasPlayedRef.current = false;
    }
  }, [setState, stageMode]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (stageMode !== 'editor' || !editorFocused || hasContent || hasPlayedRef.current) return;
    const image = imageRef.current;
    if (!image) return;

    hasPlayedRef.current = true;
    setState({ hasPlayed: true, flying: true, glowActive: true, glowFinishing: false, introReady: true });

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const duration = prefersReducedMotion ? 1 : 720;
    const editorBounds = editorRef.current?.getBoundingClientRect();
    const logoBounds = image.getBoundingClientRect();
    const targetSize = editorBounds ? Math.min(editorBounds.width, editorBounds.height) * 0.8 : 0;
    const logoBaseSize = Math.max(logoBounds.width, logoBounds.height);
    const targetScale = targetSize > 0 && logoBounds.width > 0
      ? Math.max(1, Math.min(targetSize / logoBaseSize, 1.35))
      : 1.15;

    const finishIntro = () => {
      setState((current) => ({ ...current, flying: false, introReady: false, glowFinishing: true }));
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setState((current) => ({ ...current, glowActive: false, glowFinishing: false }));
        timerRef.current = null;
      }, 180);
    };

    const animation = typeof image.animate === 'function'
      ? image.animate([
          { opacity: 0, transform: 'scale(0.88)' },
          { opacity: 1, transform: `scale(${targetScale})`, offset: 0.45 },
          { opacity: 0, transform: `scale(${targetScale * 1.05})` },
        ], {
          duration,
          easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          fill: 'forwards',
        })
      : null;

    if (animation) {
      animation.onfinish = finishIntro;
    } else {
      image.classList.add('is-fallback-animating');
      window.setTimeout(() => image.classList.remove('is-fallback-animating'), duration + 100);
      finishIntro();
    }

    timerRef.current = window.setTimeout(finishIntro, duration + 80);
  }, [editorFocused, editorRef, hasContent, setState, stageMode]);

  const shouldRender = stageMode === 'editor'
    && editorFocused
    && (state.flying || (!hasContent && (!hasPlayedRef.current || state.introReady)));

  if (!shouldRender) return null;

  return (
    <div
      className={`workspace-page-rich-text-empty-logo ${state.flying ? 'is-flying' : ''}`}
      aria-hidden="true"
    >
      <img ref={imageRef} src={editorLogo} alt="" className={state.introReady ? 'is-animating' : ''} />
    </div>
  );
}