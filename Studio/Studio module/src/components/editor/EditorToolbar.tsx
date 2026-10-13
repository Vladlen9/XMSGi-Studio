import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, History } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import type { StageMode } from '@/components/stages/types';

interface Props {
  stageMode: StageMode;
  remainingCharacters: number;
  counterClassName: string;
  linkPopoverOpen: boolean;
  onToggleLink: () => void;
  onExportText?: (format: 'txt' | 'json') => void;
  onOpenVersionHistory?: () => void;
}

export function EditorToolbar({ stageMode, remainingCharacters, counterClassName, linkPopoverOpen, onToggleLink, onExportText, onOpenVersionHistory }: Props) {
  const { t } = useLocale();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

  return (
    <div
      className="workspace-page-rich-text-toolbar"
      aria-label={t('studio.linkTools')}
      aria-hidden={stageMode !== 'editor'}
    >
      <div className="workspace-page-rich-text-counter-group">
        <span className={counterClassName} aria-live="polite">
          {remainingCharacters}
        </span>
        {stageMode === 'editor' && onExportText && (
          <div className="workspace-page-editor-export" ref={exportRef}>
            <button
              type="button"
              className={`workspace-page-editor-export-trigger ${exportMenuOpen ? 'is-open' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setExportMenuOpen((open) => !open)}
              aria-label={t('studio.exportEditorText')}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title={t('studio.exportEditorTextTitle')}
            >
              <Download size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {exportMenuOpen && (
              <div className="workspace-page-editor-export-menu" role="menu" aria-label={t('studio.exportTextFormat')}>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-page-editor-export-option"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportText('txt');
                  }}
                >
                  <span>{t('studio.exportTextAsTxt')}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-page-editor-export-option"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportText('json');
                  }}
                >
                  <span>{t('studio.exportTextAsJson')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="workspace-page-rich-text-toolbar-actions">
        <span className="workspace-page-rich-text-photo-slot" aria-hidden="true" />
        {stageMode === 'editor' && onOpenVersionHistory && (
          <button
            type="button"
            className="workspace-page-rich-text-link-trigger workspace-page-version-history-trigger"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenVersionHistory}
            aria-label={t('studio.openVersionHistory')}
            aria-haspopup="dialog"
            title={t('studio.openVersionHistory')}
          >
            <History size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={`workspace-page-rich-text-link-trigger ${linkPopoverOpen ? 'is-open' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleLink}
          aria-label={t('studio.insertLink')}
          aria-expanded={linkPopoverOpen}
          title={t('studio.insertLink')}
        >
          <span className="workspace-page-rich-text-link-trigger__icon" aria-hidden="true">
            <ArrowUpRight size={16} strokeWidth={1.8} />
          </span>
        </button>
      </div>
    </div>
  );
}