<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { applyBulkChanges, type BulkChanges } from '../util/bulk';
  import { messageOf } from '../util/errors';
  import { STATUS_LABEL } from '../util/status';
  import type { EntryStatus } from '../types';
  import Icon from './Icon.svelte';
  import ModalHead from './ModalHead.svelte';

  // "Edit selected": status and tags for a multi-selection.
  let { ids }: { ids: string[] } = $props();

  const KEEP = '__keep';
  let status = $state(KEEP);
  let addTag = $state('');
  let removeTag = $state('');
  let error = $state('');
  let busy = $state(false);
  // Offer only tags the selection actually has.
  const tags = $derived(
    [...new Set(shelf.entries.filter((e) => ids.includes(e.id)).flatMap((e) => e.tags || []))].sort()
  );

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    busy = true;
    const changes: BulkChanges = { addTag, removeTag };
    if (status !== KEEP) changes.status = (status as EntryStatus) || null;
    try {
      await applyBulkChanges(ids, changes);
      ui.close();
      shelf.changed();
    } catch (e) {
      error = messageOf(e);
      busy = false;
    }
  }
</script>

<ModalHead eyebrow="{ids.length} selected" title="Edit selected" />

<form class="add-form bulk-form" onsubmit={submit}>
  <div class="field">
    <label class="label-field" for="bulk-status">Status</label>
    <div class="select-wrap">
      <select class="select" id="bulk-status" bind:value={status}>
        <option value={KEEP}>— No change —</option>
        {#each Object.entries(STATUS_LABEL) as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
        <option value="">Clear status</option>
      </select>
    </div>
  </div>
  <div class="field">
    <label class="label-field" for="bulk-add-tag">Add tag</label>
    <input
      type="text"
      class="input"
      id="bulk-add-tag"
      placeholder="e.g. Summer 2026"
      autocomplete="off"
      bind:value={addTag}
    />
  </div>
  <div class="field">
    <label class="label-field" for="bulk-remove-tag">Remove tag</label>
    <div class="select-wrap">
      <select class="select" id="bulk-remove-tag" bind:value={removeTag}>
        <option value="">— None —</option>
        {#each tags as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </div>
  </div>
  {#if error}
    <div class="msg-error">{error}</div>
  {/if}
  <div class="modal-actions add-form-actions">
    <button type="submit" class="btn btn-primary" disabled={busy}
      ><Icon name="check" /> Apply to {ids.length}</button
    >
  </div>
</form>
