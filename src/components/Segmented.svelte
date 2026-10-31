<script lang="ts" generics="V extends string">
  interface Props {
    options: { value: V; label: string }[];
    value: V;
    onchange?: (value: V) => void;
  }

  let { options, value = $bindable(), onchange }: Props = $props();
</script>

<!-- Scrolls sideways so wide controls don't overflow on narrow screens. -->
<div class="seg-scroll">
  <div class="segmented" role="tablist">
    {#each options as opt (opt.value)}
      <button
        type="button"
        role="tab"
        aria-selected={opt.value === value}
        class:active={opt.value === value}
        onclick={() => {
          if (opt.value === value) return;
          value = opt.value;
          onchange?.(opt.value);
        }}>{opt.label}</button
      >
    {/each}
  </div>
</div>
