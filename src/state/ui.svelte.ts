// Which dialog is open. One at a time: opening another replaces it.

import type { SharePrefill } from '../util/share-intake';
import type { EntryType } from '../types';

export interface AddOptions {
  /** Text shared into the app: prefills the quote form and the search query. */
  prefill?: SharePrefill;
  /** Skip the medium picker: the quote form, or a search of `searchType`. */
  startWith?: 'quote' | 'search';
  searchType?: Exclude<EntryType, 'quote'>;
  /** Pre-link a new quote to this entry. */
  linkedEntryId?: string;
}

export type Modal =
  | { kind: 'entry'; id: string }
  | { kind: 'add'; options: AddOptions }
  | { kind: 'settings' }
  | { kind: 'stats' }
  | { kind: 'queue' }
  | { kind: 'bulk'; ids: string[] }
  | { kind: 'share'; id: string };

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
  /** Called when the toast goes away without the action being taken. */
  dismissed?: () => void;
}

export interface Toast {
  message: string;
  kind: ToastKind;
  key: number;
  action?: ToastAction;
  /** Fading out. */
  leaving?: boolean;
}

/** How long a toast stays (style.md §8.12): longer when it offers an action. */
export const TOAST_MS = 4000;
export const TOAST_ACTION_MS = 6000;
/** --dur-exit */
const TOAST_EXIT_MS = 160;

class UiState {
  modal = $state.raw<Modal | null>(null);
  /** Bumps on every open, so reopening the same kind of dialog starts fresh. */
  modalKey = $state(0);

  open(modal: Modal): void {
    this.modal = modal;
    this.modalKey++;
  }

  openEntry(id: string): void {
    this.open({ kind: 'entry', id });
  }

  openAdd(options: AddOptions = {}): void {
    this.open({ kind: 'add', options });
  }

  close(): void {
    this.modal = null;
  }

  // ── Toast ─────────────────────────────────────────────────────

  toast = $state.raw<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastKey = 0;

  /** Shows one toast, replacing any current one. */
  notify(message: string, kind: ToastKind = 'info', action?: ToastAction): void {
    if (!this.toast?.leaving) this.toast?.action?.dismissed?.();
    this.toast = { message, kind, key: ++this.toastKey, action };
    this.resumeToast();
  }

  /** Holds the toast on screen while it is touched or hovered. */
  pauseToast(): void {
    clearTimeout(this.toastTimer);
  }

  resumeToast(): void {
    clearTimeout(this.toastTimer);
    const toast = this.toast;
    if (!toast || toast.leaving) return;
    this.toastTimer = setTimeout(
      () => this.dismissToast(toast.key),
      toast.action ? TOAST_ACTION_MS : TOAST_MS
    );
  }

  dismissToast(key: number): void {
    const toast = this.toast;
    if (toast?.key !== key || toast.leaving) return;
    clearTimeout(this.toastTimer);
    toast.action?.dismissed?.();
    this.toast = { ...toast, action: undefined, leaving: true };
    setTimeout(() => {
      if (this.toast?.key === key) this.toast = null;
    }, TOAST_EXIT_MS);
  }

  /** Runs the toast's action and closes it. */
  actOnToast(): void {
    const toast = this.toast;
    if (!toast?.action) return;
    clearTimeout(this.toastTimer);
    this.toast = null;
    toast.action.run();
  }
}

export const ui = new UiState();
