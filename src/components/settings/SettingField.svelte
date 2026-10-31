<script lang="ts">
  import { untrack } from 'svelte';
  import { removeSetting, setSetting } from '../../util/settings';
  import Field from '../Field.svelte';

  // A text setting that saves itself 280 ms after typing stops (secrets go to
  // the Keystore in the Android app; see util/settings).
  interface Props {
    key: string;
    label: string;
    hint?: string;
    type?: 'text' | 'password' | 'url';
    /** The stored value, loaded by the parent. */
    initial: string;
  }

  let { key, label, hint, type = 'text', initial }: Props = $props();
  let value = $state(untrack(() => initial));
  let timer: ReturnType<typeof setTimeout> | undefined;

  function save() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (value) await setSetting(key, value);
      else await removeSetting(key);
    }, 280);
  }
</script>

<Field {label} id="setting-{key}" {type} {hint} mono bind:value oninput={save} />
