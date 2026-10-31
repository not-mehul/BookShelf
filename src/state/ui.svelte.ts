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
}

export const ui = new UiState();
