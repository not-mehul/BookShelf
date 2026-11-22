<script lang="ts">
  import { EGGS, eggsFound } from '../../util/delight';
  import { getSetting } from '../../util/settings';
  import { useModalFocus } from '../Modal.svelte';
  import ModalHead from '../ModalHead.svelte';
  import Segmented from '../Segmented.svelte';
  import DataSection from './DataSection.svelte';
  import SearchSection from './SearchSection.svelte';
  import SyncSection from './SyncSection.svelte';
  import { GOOGLE, TVDB } from './search-keys';
  import { setTheme, theme, type ThemeChoice } from '../../platform/theme.svelte';
  import { chooseRatingScale, ratingView } from '../../state/rating-scale.svelte';
  import type { RatingScale } from '../../util/stars';

  // Appearance, Sync, Your data, Search, About. The saved keys load first, so
  // focus settles once the sheet is whole.
  let values = $state<Record<string, string> | null>(null);
  let tokenIssued = $state(0);
  const settleFocus = useModalFocus();

  $effect(() => {
    void (async () => {
      const keys = [...TVDB, GOOGLE].map((d) => d.key);
      const loaded = await Promise.all(keys.map((k) => getSetting(k, '')));
      tokenIssued = parseInt(await getSetting('tvdb_token_issued', '0'), 10) || 0;
      values = Object.fromEntries(keys.map((k, i) => [k, loaded[i] ?? '']));
      settleFocus();
    })();
  });

  const SCALES: { value: '5' | '10'; label: string }[] = [
    { value: '5', label: 'Stars' },
    { value: '10', label: 'Out of 10' }
  ];

  const THEMES: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dusk' },
    { value: 'light', label: 'Dawn' }
  ];
</script>

<ModalHead eyebrow="Settings" title="Preferences" />

<div class="settings-modal-body">
  <section class="settings-group" aria-labelledby="set-appearance">
    <h3 class="settings-section-heading" id="set-appearance">Appearance</h3>
    <div class="theme-setting-row">
      <div class="theme-setting-text">
        <div class="theme-setting-label" id="themeLabel">Theme</div>
        <div class="theme-setting-sub">System follows your device.</div>
      </div>
      <Segmented
        options={THEMES}
        value={theme.choice}
        label="Theme"
        onchange={(choice) => void setTheme(choice)}
      />
    </div>
    <div class="theme-setting-row">
      <div class="theme-setting-text">
        <div class="theme-setting-label">Ratings</div>
        <div class="theme-setting-sub">Out of 10 takes half points, like 7.5.</div>
      </div>
      <Segmented
        options={SCALES}
        value={String(ratingView.scale) as '5' | '10'}
        label="Rating scale"
        onchange={(scale) => chooseRatingScale(Number(scale) as RatingScale)}
      />
    </div>
  </section>

  {#if values}
    <section class="settings-group">
      <SyncSection />
    </section>

    <section class="settings-group" aria-labelledby="set-data">
      <DataSection />
    </section>

    <section class="settings-group" aria-labelledby="set-search">
      <SearchSection {values} bind:tokenIssued />
    </section>

    <section class="settings-group" aria-labelledby="set-about">
      <h3 class="settings-section-heading" id="set-about">About</h3>
      <p class="field-hint">BookShelf {__APP_VERSION__}</p>
      <p class="field-hint" id="eggCount">Easter eggs: {eggsFound()} of {EGGS.length} found</p>
      <p class="field-hint settings-footnote">
        <em>Private.</em> Your shelf lives on this device. Searches go to the services above, and nothing else leaves
        it.
      </p>
    </section>
  {/if}
</div>

<style>
  .settings-group + .settings-group {
    margin-top: var(--space-6);
  }
  .settings-footnote {
    margin-top: var(--space-2);
  }
  .settings-footnote em {
    color: var(--accent-amber);
  }
</style>
