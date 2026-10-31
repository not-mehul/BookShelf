<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    tags: string[];
    onchange: (tags: string[]) => void;
  }

  let { tags, onchange }: Props = $props();
  let draft = $state('');
</script>

<div class="modal-section">
  <div class="modal-section-label">Tags / Collections</div>
  <div class="tag-chip-row">
    {#each tags as tag (tag)}
      <span class="tag-chip"
        >{tag}<button
          type="button"
          class="tag-chip-x"
          aria-label="Remove tag {tag}"
          onclick={() => onchange(tags.filter((t) => t !== tag))}><Icon name="x" /></button
        ></span
      >
    {/each}
  </div>
  <input
    type="text"
    class="input tag-input"
    placeholder="Add a tag and press Enter…"
    aria-label="Add tag"
    bind:value={draft}
    onkeydown={(ev) => {
      if (ev.key !== 'Enter' && ev.key !== ',') return;
      ev.preventDefault();
      const val = draft.trim().replace(/,$/, '').trim();
      if (!val) return;
      draft = '';
      onchange([...new Set([...tags, val])]);
    }}
  />
</div>
