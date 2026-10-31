<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

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
    mono = false,
    oninput
  }: Props = $props();

  let control = $state<HTMLInputElement | HTMLTextAreaElement>();
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
  {#if hint}
    <div class="field-hint">{hint}</div>
  {/if}
</div>
