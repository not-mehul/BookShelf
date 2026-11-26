<script lang="ts">
  import { untrack } from 'svelte';
  import type { KeyCheck } from '../../api/key-check';
  import { removeSetting, setSetting } from '../../util/settings';
  import Field from '../Field.svelte';

  // A text setting that saves itself 280 ms after typing stops (secrets go to
  // the Keystore in the Android app; see util/settings). A key with a `check`
  // is then tried against its service, and the line under the box says how
  // that went.
  interface Props {
    key: string;
    label: string;
    hint?: string;
    type?: 'text' | 'password' | 'url';
    /** The stored value, loaded by the parent. */
    initial: string;
    /** Tries a newly entered value (an API key) against its service. */
    check?: (value: string) => Promise<KeyCheck>;
    /** What the line under the box says once `check` says the key works. */
    works?: string;
    /** Called once the value is saved (or removed, with ''). */
    onsaved?: (value: string) => void;
    /** Called with the check's verdict on a newly entered value. */
    onchecked?: (result: KeyCheck) => void;
  }

  let { key, label, hint, type = 'text', initial, check, works, onsaved, onchecked }: Props = $props();
  let value = $state(untrack(() => initial));
  let status = $state<'idle' | 'checking' | KeyCheck['kind']>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const line = $derived(
    status === 'checking'
      ? 'Checking the key…'
      : status === 'works'
        ? (works ?? 'The key works.')
        : status === 'rejected'
          ? 'That key wasn’t accepted. Check it was copied whole, and paste it again.'
          : status === 'unknown'
            ? 'Saved, but the key couldn’t be checked (are you offline?). Searching will say if it doesn’t work.'
            : hint
  );

  function save() {
    clearTimeout(timer);
    status = 'idle';
    const mine = ++seq;
    timer = setTimeout(async () => {
      const v = value.trim();
      if (v) await setSetting(key, v);
      else await removeSetting(key);
      onsaved?.(v);
      if (!v || !check) return;
      status = 'checking';
      const result = await check(v);
      if (mine !== seq) return;
      status = result.kind;
      onchecked?.(result);
    }, 280);
  }
</script>

<Field
  {label}
  id="setting-{key}"
  {type}
  hint={line}
  hintTone={status === 'works' ? 'ok' : status === 'rejected' ? 'err' : undefined}
  hintLive={Boolean(check)}
  mono
  bind:value
  oninput={save}
/>
