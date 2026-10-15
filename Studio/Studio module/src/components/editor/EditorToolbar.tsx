import { useEffect, useRef, useState } from 'react';
import { Bold, Download, History, Italic, Link, Strikethrough, Underline } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import type { StageMode } from '@/components/stages/types';
import type { EditorFormats } from './useEditorFormats';

export type EditorToolbarFormat = 'bold' | 'italic' | 'underline' | 'strike';

interface Props {
  stageMode: StageMode;
  remainingCharacters: number;
  counterClassName: string;
  activeFormats: EditorFormats;
  linkPopoverOpen: boolean;
  onFormat: (format: EditorToolbarFormat) => void;
  onToggleLink: () => void;
  onExportText?: (format: 'txt' | 'json') => void;
  onOpenVersionHistory?: () => void;
}

export function EditorToolbar({ stageMode, remainingCharacters, counterClassName, activeFormats, linkPopoverOpen, onFormat, onToggleLink, onExportText, onOpenVersionHistory }: Props) {
  const { t } = useLocale();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
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

  if (stageMode !== 'editor') return null;

  return (
    <div className="workspace-page-rich-text-toolbar is-airy" role="toolbar" aria-label={t('studio.formattingTools')} aria-orientation="horizontal">
      <span className={counterClassName} aria-live="polite">{remainingCharacters}</span>
      <div className="workspace-page-rich-text-toolbar-actions" role="group" aria-label={t('studio.formattingTools')}>
        {formatOptions.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="workspace-page-rich-text-format-option" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat(id)} aria-label={label} aria-pressed={activeFormats[id]} title={label}>
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ))}
        <span className="workspace-page-rich-text-toolbar-divider" aria-hidden="true" />
        <button type="button" className={`workspace-page-rich-text-link-trigger${linkPopoverOpen ? ' is-open' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={onToggleLink} aria-label={t('studio.insertLink')} aria-haspopup="dialog" aria-expanded={linkPopoverOpen} title={t('studio.insertLink')}>
          <span className="workspace-page-rich-text-link-trigger__icon" aria-hidden="true">
              <Link size={17} strokeWidth={1.8} aria-hidden="true" />
          </span>
        </button>
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
      </div>
    </div>
  );
}