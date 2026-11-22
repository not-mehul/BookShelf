<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    value: string;
    /** Called 300 ms after typing stops. */
    onsave: (notes: string) => void;
  }

  let { value, onsave }: Props = $props();

  let text = $state(untrack(() => value));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let field: HTMLTextAreaElement;

  // Notes saved elsewhere (a sync from another device) show here, unless
  // they're being typed in right now.
  $effect(() => {
    const next = value;
    untrack(() => {
      if (next !== text && timer === undefined && document.activeElement !== field) text = next;
    });
  });
</script>

<textarea
  class="textarea notes-field"
  placeholder="Add a note"
  aria-label="Notes"
  bind:this={field}
  bind:value={text}
  oninput={() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      onsave(text);
    }, 300);
  }}
></textarea>

<style>
  .notes-field {
    min-height: 80px;
  }
</style>
