<script lang="ts" generics="V extends string">
  // style.md §8.4: two to four short, mutually exclusive options.
  interface Props {
    options: { value: V; label: string }[];
    value: V;
    label: string;
    onchange?: (value: V) => void;
    /** Stretch across the row, the options sharing it evenly. */
    full?: boolean;
  }

  let { options, value = $bindable(), label, onchange, full = false }: Props = $props();
</script>

<!-- Scrolls sideways so wide controls don't overflow on narrow screens. -->
<div class="seg-scroll" class:seg-full={full}>
  <div class="segmented" role="radiogroup" aria-label={label}>
    {#each options as opt (opt.value)}
      <button
        type="button"
        role="radio"
        aria-checked={opt.value === value}
        onclick={() => {
          if (opt.value === value) return;
          value = opt.value;
          onchange?.(opt.value);
        }}>{opt.label}</button
      >
    {/each}
  </div>
</div>
