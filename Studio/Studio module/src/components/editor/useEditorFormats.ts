import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { StageMode } from '@/components/stages/types';

export type EditorFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  unorderedList: boolean;
  orderedList: boolean;
};

const emptyFormats: EditorFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  unorderedList: false,
  orderedList: false,
};

const formatSelectors = {
  bold: 'b,strong',
  italic: 'i,em',
  underline: 'u',
  strike: 's,strike,del',
  unorderedList: 'ul',
  orderedList: 'ol',
} as const;

const commandByFormat = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
  unorderedList: 'insertUnorderedList',
  orderedList: 'insertOrderedList',
} as const;

function isSelectionInsideEditor(editor: HTMLElement, selection: Selection): boolean {
  if (selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return [range.commonAncestorContainer, selection.anchorNode, selection.focusNode]
    .every((node) => node === null || node === editor || editor.contains(node));
}

/**
 * Состояние нативной команды — источник истины для браузера: оно учитывает
 * «отложенные» состояния каретки так же, как execCommand. В окружениях без
 * queryCommandState (jsdom) возвращаем null и полагаемся на DOM-обход.
 */
function readCommandState(command: string): boolean | null {
  try {
    if (typeof document.queryCommandState !== 'function') return null;
    return document.queryCommandState(command);
  } catch {
    return null;
  }
}

export function useEditorFormats(editorRef: MutableRefObject<HTMLDivElement | null>, stageMode: StageMode) {
  const [activeFormats, setActiveFormats] = useState(emptyFormats);
  const selectionSyncFrameRef = useRef<number | null>(null);

  const getSelectionFormatState = (): EditorFormats | null => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    // Состояние пересчитываем только для выделения внутри редактора: когда
    // браузер очищает selection (например, при взаимодействии с кнопками
    // меню), иконки должны сохранять последнее известное состояние, а не
    // «залипать» в сброшенном.
    if (!selection || !editor || !isSelectionInsideEditor(editor, selection)) return null;

    const range = selection.getRangeAt(0);

    // Обход предков ограничен редактором: element.closest() уходил за его
    // пределы и мог «залипать» на форматировании соседних элементов страницы.
    const walkMatches = (candidate: Node | null, selector: string): boolean => {
      let current: Node | null = candidate;
      while (current) {
        if (current.nodeType === Node.ELEMENT_NODE && (current as Element).matches(selector)) return true;
        if (current === editor) break;
        current = current.parentNode;
      }
      return false;
    };

    const candidates: Node[] = [];
    [range.commonAncestorContainer, range.startContainer, range.endContainer, selection.anchorNode, selection.focusNode]
      .forEach((node) => {
        if (node) candidates.push(node);
      });

    // Для коллапсированной каретки смотрим только её inline-контекст — без
    // соседних узлов, иначе состояние форматирования «залипало» на границе
    // жирного и обычного текста и снять его было нельзя.
    const fragment = range.collapsed ? null : range.cloneContents();

    const next = { ...emptyFormats };
    (Object.keys(formatSelectors) as Array<keyof EditorFormats>).forEach((format) => {
      const selector = formatSelectors[format];
      const inSelectionDom = candidates.some((candidate) => walkMatches(candidate, selector))
        || (fragment ? fragment.querySelector(selector) !== null : false);
      const commandState = readCommandState(commandByFormat[format]);
      next[format] = commandState ?? inSelectionDom;
    });
    return next;
  };

  const syncToolbarStateFromSelection = () => {
    const next = getSelectionFormatState();
    // Вне редактора (фокус на кнопке меню, очищенный браузером selection)
    // состояния иконок сохраняются, а не сбрасываются в ноль.
    if (next) {
      setActiveFormats((current) => (
        (Object.keys(emptyFormats) as Array<keyof EditorFormats>)
          .every((format) => current[format] === next[format])
          ? current
          : next
      ));
    }
  };

  const scheduleToolbarStateSync = () => {
    if (selectionSyncFrameRef.current !== null) return;
    selectionSyncFrameRef.current = window.requestAnimationFrame(() => {
      selectionSyncFrameRef.current = null;
      syncToolbarStateFromSelection();
    });
  };

  useEffect(() => {
    if (stageMode !== 'editor') return;

    const editor = editorRef.current;
    if (!editor) return;

    syncToolbarStateFromSelection();

    const handleNativeSelect = () => scheduleToolbarStateSync();
    const handleSelectionChange = () => scheduleToolbarStateSync();

    editor.addEventListener('select', handleNativeSelect);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      editor.removeEventListener('select', handleNativeSelect);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (selectionSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionSyncFrameRef.current);
        selectionSyncFrameRef.current = null;
      }
    };
  }, [stageMode]);

  return { activeFormats, syncToolbarStateFromSelection, scheduleToolbarStateSync };
}