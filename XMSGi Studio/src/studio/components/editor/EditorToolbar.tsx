import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bold, Download, History, ImagePlus, Italic, Link, Smile, Sparkles, Strikethrough, Underline } from 'lucide-react';
import { useLocale } from '@studio/lib/i18n';
import type { StageMode } from '@studio/components/stages/types';
import type { EditorFormats } from './useEditorFormats';

export type EditorToolbarFormat = 'bold' | 'italic' | 'underline' | 'strike';

interface Props {
  stageMode: StageMode;
  activeFormats: EditorFormats;
  linkPopoverOpen: boolean;
  linkPopover?: ReactNode;
  onFormat: (format: EditorToolbarFormat) => void;
  onOpenAlbum?: () => void;
  albumDisabled?: boolean;
  onToggleLink: () => void;
  onExportText?: (format: 'txt' | 'json') => void;
  onOpenVersionHistory?: () => void;
  selectedEffectId?: string | null;
  onSelectEffect?: (effectId: string | null) => void;
  onInsertEmoji?: (emoji: string) => void;
}

const studioEmojiOptions = ['😀', '😃', '😄', '😁', '😊', '😉', '😍', '🥰', '😘', '😎', '🤔', '😂', '🤣', '🥳', '😭', '👍', '👏', '🙏', '🔥', '❤️', '✨', '🎉', '💯', '🚀'];

type TelegramMessageEffect = { id: string; emoticon: string; premiumRequired: boolean };

export function EditorToolbar({ stageMode, activeFormats, linkPopoverOpen, linkPopover, onFormat, onOpenAlbum, albumDisabled = false, onToggleLink, onExportText, onOpenVersionHistory, selectedEffectId = null, onSelectEffect, onInsertEmoji }: Props) {
  const { t } = useLocale();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [albumInfoVisible, setAlbumInfoVisible] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [effects, setEffects] = useState<TelegramMessageEffect[]>([]);
  const [effectsLoading, setEffectsLoading] = useState(false);
  const [effectsLoaded, setEffectsLoaded] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const effectsPickerRef = useRef<HTMLDivElement | null>(null);
  const albumInfoTimerRef = useRef<number | null>(null);
  const selectedEffect = effects.find((effect) => effect.id === selectedEffectId);
  const formatOptions = [
    { id: 'bold' as const, label: t('studio.bold'), icon: Bold },
    { id: 'italic' as const, label: t('studio.italic'), icon: Italic },
    { id: 'underline' as const, label: t('studio.underline'), icon: Underline },
    { id: 'strike' as const, label: t('studio.strikethrough'), icon: Strikethrough },
  ];

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportMenuOpen(false); };
    document.addEventListener('pointerdown', onDown as EventListener);
    document.addEventListener('mousedown', onDown as EventListener);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown as EventListener);
      document.removeEventListener('mousedown', onDown as EventListener);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!effectPickerOpen && !emojiPickerOpen) return undefined;
    const onDown = (event: PointerEvent) => {
      if (effectsPickerRef.current && !effectsPickerRef.current.contains(event.target as Node)) setEffectPickerOpen(false);
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) setEmojiPickerOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEffectPickerOpen(false);
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [effectPickerOpen, emojiPickerOpen]);

  useEffect(() => {
    if (!effectPickerOpen || effectsLoaded) return undefined;
    let active = true;
    const loadEffects = window.telegram?.getAvailableEffects;
    if (typeof loadEffects !== 'function') {
      setEffectsLoaded(true);
      return undefined;
    }
    setEffectsLoading(true);
    void loadEffects().then((result) => {
      if (!active) return;
      if (result.success) setEffects(result.effects ?? []);
      setEffectsLoaded(true);
    }).catch(() => {
      if (active) setEffectsLoaded(true);
    }).finally(() => {
      if (active) setEffectsLoading(false);
    });
    return () => { active = false; };
  }, [effectPickerOpen, effectsLoaded]);

  useEffect(() => () => {
    if (albumInfoTimerRef.current !== null) window.clearTimeout(albumInfoTimerRef.current);
  }, []);

  const scheduleAlbumInfo = () => {
    if (albumInfoTimerRef.current !== null) window.clearTimeout(albumInfoTimerRef.current);
    albumInfoTimerRef.current = window.setTimeout(() => {
      albumInfoTimerRef.current = null;
      setAlbumInfoVisible(true);
    }, 450);
  };

  const hideAlbumInfo = () => {
    if (albumInfoTimerRef.current !== null) {
      window.clearTimeout(albumInfoTimerRef.current);
      albumInfoTimerRef.current = null;
    }
    setAlbumInfoVisible(false);
  };

  if (stageMode !== 'editor') return null;

  return (
    <div className="workspace-page-rich-text-toolbar is-airy" role="toolbar" aria-label={t('studio.formattingTools')} aria-orientation="horizontal">
      <div className="workspace-page-rich-text-leading-tools" role="group" aria-label={t('studio.messageTools')}>
        {onSelectEffect && (
          <div className="workspace-page-rich-text-tool-anchor" ref={effectsPickerRef}>
            <button
              type="button"
              className={`workspace-page-rich-text-link-trigger${effectPickerOpen || selectedEffectId ? ' is-open' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { setEffectPickerOpen((open) => !open); setEmojiPickerOpen(false); }}
              aria-label={t('studio.messageEffects')}
              aria-haspopup="dialog"
              aria-expanded={effectPickerOpen}
              aria-pressed={Boolean(selectedEffectId)}
              title={selectedEffect ? t('studio.effectSelectedTitle', { effect: selectedEffect.emoticon }) : t('studio.messageEffects')}
            >
              <Sparkles size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {effectPickerOpen && (
              <div className="workspace-page-rich-text-tool-popover workspace-page-rich-text-effects-picker" role="dialog" aria-label={t('studio.messageEffects')}>
                <strong>{t('studio.chooseMessageEffect')}</strong>
                <div className="workspace-page-rich-text-effect-options" role="group" aria-label={t('studio.chooseMessageEffect')}>
                  <button type="button" className={`workspace-page-rich-text-effect-option${selectedEffectId === null ? ' is-selected' : ''}`} aria-label={t('studio.noEffect')} aria-pressed={selectedEffectId === null} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectEffect(null); setEffectPickerOpen(false); }}>
                    <span aria-hidden="true">−</span><small>{t('studio.noEffect')}</small>
                  </button>
                  {effects.map((effect) => (
                    <button key={effect.id} type="button" className={`workspace-page-rich-text-effect-option${selectedEffectId === effect.id ? ' is-selected' : ''}`} aria-label={t(effect.premiumRequired ? 'studio.premiumEffectOption' : 'studio.effectOption', { emoticon: effect.emoticon })} aria-pressed={selectedEffectId === effect.id} title={`${effect.emoticon} · ${effect.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectEffect(effect.id); setEffectPickerOpen(false); }}>
                      <span aria-hidden="true">{effect.emoticon}</span><small>{effect.premiumRequired ? t('studio.premiumEffect') : effect.emoticon}</small>
                    </button>
                  ))}
                </div>
                {effectsLoading && <span className="workspace-page-rich-text-picker-status" role="status">{t('studio.effectsLoading')}</span>}
                {!effectsLoading && effectsLoaded && effects.length === 0 && <span className="workspace-page-rich-text-picker-status" role="status">{t('studio.effectsUnavailable')}</span>}
              </div>
            )}
          </div>
        )}
        {onInsertEmoji && (
          <div className="workspace-page-rich-text-tool-anchor" ref={emojiPickerRef}>
            <button type="button" className={`workspace-page-rich-text-link-trigger${emojiPickerOpen ? ' is-open' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setEmojiPickerOpen((open) => !open); setEffectPickerOpen(false); }} aria-label={t('studio.chooseEmoji')} aria-haspopup="dialog" aria-expanded={emojiPickerOpen} title={t('studio.chooseEmoji')}>
              <Smile size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {emojiPickerOpen && (
              <div className="workspace-page-rich-text-tool-popover workspace-page-rich-text-emoji-picker" role="dialog" aria-label={t('studio.chooseEmoji')}>
                <strong>{t('studio.emoji')}</strong>
                <div className="workspace-page-rich-text-emoji-options" role="group" aria-label={t('studio.emoji')}>
                  {studioEmojiOptions.map((emoji) => (
                    <button key={emoji} type="button" aria-label={t('studio.insertEmoji', { emoji })} title={emoji} onMouseDown={(event) => event.preventDefault()} onClick={() => { onInsertEmoji(emoji); setEmojiPickerOpen(false); }}>{emoji}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="workspace-page-rich-text-toolbar-actions" role="group" aria-label={t('studio.formattingTools')}>
        {formatOptions.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="workspace-page-rich-text-format-option" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat(id)} aria-label={label} aria-pressed={activeFormats[id]} title={label}>
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ))}
        <div className={`workspace-page-rich-text-link-controls${linkPopoverOpen ? ' is-open' : ''}`}>
          <button type="button" className={`workspace-page-rich-text-link-trigger${linkPopoverOpen ? ' is-open' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={onToggleLink} aria-label={t('studio.insertLink')} aria-haspopup="dialog" aria-expanded={linkPopoverOpen} title={t('studio.insertLink')}>
            <span className="workspace-page-rich-text-link-trigger__icon" aria-hidden="true">
              <Link size={17} strokeWidth={1.8} aria-hidden="true" />
            </span>
          </button>
          {linkPopover}
        </div>
        <span className="workspace-page-rich-text-toolbar-divider" aria-hidden="true" />
        {onOpenVersionHistory && (
          <button type="button" className="workspace-page-rich-text-link-trigger workspace-page-version-history-trigger" onMouseDown={(e) => e.preventDefault()} onClick={onOpenVersionHistory} aria-label={t('studio.openVersionHistory')} aria-haspopup="dialog" title={t('studio.openVersionHistory')}>
            <History size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        {onExportText && (
          <div className="workspace-page-editor-export" ref={exportRef}>
            <button type="button" className={`workspace-page-editor-export-trigger${exportMenuOpen ? ' is-open' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setExportMenuOpen((v) => !v)} aria-label={t('studio.exportEditorText')} aria-haspopup="menu" aria-expanded={exportMenuOpen} title={t('studio.exportEditorTextTitle')}>
              <Download size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {exportMenuOpen && (
              <div className="workspace-page-editor-export-menu" role="menu" aria-label={t('studio.exportTextFormat')}>
                <button type="button" role="menuitem" className="workspace-page-editor-export-option" onClick={() => { setExportMenuOpen(false); onExportText('txt'); }}><span>{t('studio.exportTextAsTxt')}</span></button>
                <button type="button" role="menuitem" className="workspace-page-editor-export-option" onClick={() => { setExportMenuOpen(false); onExportText('json'); }}><span>{t('studio.exportTextAsJson')}</span></button>
              </div>
            )}
          </div>
        )}
        {onOpenAlbum && (
          <div
            className={`workspace-page-rich-text-album-controls${albumInfoVisible ? ' is-info-visible' : ''}`}
            onMouseEnter={scheduleAlbumInfo}
            onMouseLeave={hideAlbumInfo}
            onFocusCapture={scheduleAlbumInfo}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              hideAlbumInfo();
            }}
          >
            <button type="button" className="workspace-page-rich-text-link-trigger workspace-page-rich-text-album-trigger" onMouseDown={(event) => event.preventDefault()} onClick={onOpenAlbum} disabled={albumDisabled} aria-label={t('studio.addPhotoAlbum')} aria-describedby="workspace-page-photo-album-limits">
              <ImagePlus size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <div className="workspace-page-rich-text-album-info" id="workspace-page-photo-album-limits" role="tooltip">
              <strong>{t('studio.photoAlbumLimits')}</strong>
              <span>{t('studio.photoAlbumLimitInfo', { albums: 3, perAlbum: 10, total: 30 })}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}