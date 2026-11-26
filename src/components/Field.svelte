<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    id: string;
    value: string;
    placeholder?: string;
    /** A textarea of this many rows instead of a one-line input. */
    rows?: number;
    type?: 'text' | 'number' | 'url' | 'password' | 'search';
    inputmode?: HTMLInputAttributes['inputmode'];
    step?: string;
    min?: string;
    autofocus?: boolean;
    hint?: string;
    /** Colours the hint: a check that passed, or one that failed. */
    hintTone?: 'ok' | 'err';
    /** Announce changes to the hint (a check's result). */
    hintLive?: boolean;
    mono?: boolean;
    oninput?: () => void;
  }

  let {
    label,
    id,
    value = $bindable(),
    placeholder,
    rows,
    type = 'text',
    inputmode,
    step,
    min,
    autofocus = false,
    hint,
    hintTone,
    hintLive = false,
    mono = false,
    oninput
  }: Props = $props();

  let control = $state<HTMLInputElement | HTMLTextAreaElement>();
  // A secret can be shown to check it, with the eye at the end of the box.
  let shown = $state(false);
  const secret = $derived(type === 'password');
  $effect(() => {
    if (autofocus) control?.focus();
  });
</script>

<div class="field">
  <label class="label-field" for={id}>{label}</label>
  {#if rows}
    <textarea
      bind:this={control}
      {id}
      class="textarea"
      {placeholder}
      {rows}
      {value}
      oninput={(ev) => {
        value = ev.currentTarget.value;
        oninput?.();
      }}
    ></textarea>
  {:else if secret}
    <div class="field-secret">
      <input
        bind:this={control}
        {id}
        type={shown ? 'text' : 'password'}
        class="input"
        class:input-mono={mono}
        {placeholder}
        {inputmode}
        {step}
        {min}
        autocomplete="off"
        spellcheck={mono ? false : undefined}
        {value}
        oninput={(ev) => {
          // Not bind:value: that turns number inputs into numbers; this stays a string.
          value = ev.currentTarget.value;
          oninput?.();
        }}
      />
      <button
        type="button"
        class="btn-icon field-eye"
        aria-label="Show"
        aria-controls={id}
        aria-pressed={shown}
        title={shown ? 'Hide' : 'Show'}
        onclick={() => (shown = !shown)}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  {:else}
    <input
      bind:this={control}
      {id}
      {type}
      class="input"
      class:input-mono={mono}
      {placeholder}
      {inputmode}
      {step}
      {min}
      autocomplete="off"
      spellcheck={mono ? false : undefined}
      {value}
      oninput={(ev) => {
        // Not bind:value: that turns number inputs into numbers; this stays a string.
        value = ev.currentTarget.value;
        oninput?.();
      }}
    />
  {/if}
  {#if hint || hintLive}
    <div
      class="field-hint"
      class:field-hint-ok={hintTone === 'ok'}
      class:field-hint-err={hintTone === 'err'}
      aria-live={hintLive ? 'polite' : undefined}
    >
      {hint ?? ''}
    </div>
  {/if}
</div>
