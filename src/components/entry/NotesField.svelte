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
</script>

<textarea
  class="textarea notes-field"
  placeholder="Private notes…"
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
