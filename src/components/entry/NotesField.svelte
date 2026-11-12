<script lang="ts">
  import { untrack } from 'svelte';

  import type { EntryType } from '../../types';

  interface Props {
    value: string;
    type?: EntryType;
    /** Called 300 ms after typing stops. */
    onsave: (notes: string) => void;
  }

  let { value, type = 'book', onsave }: Props = $props();

  // An example of the kind of note worth keeping, rather than a label.
  const EXAMPLES: Record<EntryType, string> = {
    book: 'The middle dragged, but the last fifty pages made up for it.',
    movie: 'Saw it twice; the score is what stays with me.',
    tv: 'Season two is where it finds its feet.',
    quote: 'Read this aloud at dinner; nobody agreed with it.'
  };
  let text = $state(untrack(() => value));
  let timer: ReturnType<typeof setTimeout> | undefined;
</script>

<textarea
  class="textarea notes-field"
  placeholder={EXAMPLES[type]}
  aria-label="Notes"
  bind:value={text}
  oninput={() => {
    clearTimeout(timer);
    timer = setTimeout(() => onsave(text), 300);
  }}
></textarea>

<style>
  .notes-field {
    min-height: 80px;
  }
</style>
