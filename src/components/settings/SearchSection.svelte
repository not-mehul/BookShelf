<script lang="ts">
  import { untrack } from 'svelte';
  import type { KeyCheck } from '../../api/key-check';
  import SettingField from './SettingField.svelte';
  import { GOOGLE, TMDB } from './search-keys';

  // Search providers, each folded behind a summary that says whether it is set up.
  let { values }: { values: Record<string, string> } = $props();

  // Each key: none, saved, or saved and turned away by its service.
  type KeyState = 'none' | 'saved' | 'rejected';
  const initialState = (key: string): KeyState => (values[key] ? 'saved' : 'none');
  let tmdb = $state<KeyState>(untrack(() => initialState(TMDB.key)));
  let google = $state<KeyState>(untrack(() => initialState(GOOGLE.key)));
  const STATE_LABEL: Record<KeyState, string> = {
    none: 'Not set up',
    saved: 'Key saved',
    rejected: 'Key not accepted'
  };

  function tmdbChecked(result: KeyCheck) {
    tmdb = result.kind === 'rejected' ? 'rejected' : 'saved';
  }
</script>

<h3 class="settings-section-heading" id="set-search">Search</h3>
<p class="field-hint settings-lead">
  Book search works as it is. Films and shows come from TMDB, which needs a free key of your own.
</p>

<details class="settings-fold">
  <summary>
    <span class="settings-fold-name">Films and TV <span class="settings-fold-via">TMDB</span></span>
    <span class="settings-fold-state" class:is-ready={tmdb === 'saved'} class:is-error={tmdb === 'rejected'}
      >{STATE_LABEL[tmdb]}</span
    >
  </summary>
  <div class="settings-fold-body">
    <SettingField
      {...TMDB}
      initial={values[TMDB.key] ?? ''}
      onsaved={(v) => (tmdb = v ? 'saved' : 'none')}
      onchecked={tmdbChecked}
    />
  </div>
</details>

<details class="settings-fold">
  <summary>
    <span class="settings-fold-name">Books <span class="settings-fold-via">Google Books</span></span>
    <span
      class="settings-fold-state"
      class:is-ready={google === 'saved'}
      class:is-error={google === 'rejected'}>{google === 'none' ? 'Optional' : STATE_LABEL[google]}</span
    >
  </summary>
  <div class="settings-fold-body">
    <SettingField
      {...GOOGLE}
      initial={values[GOOGLE.key] ?? ''}
      onsaved={(v) => (google = v ? 'saved' : 'none')}
      onchecked={(r) => (google = r.kind === 'rejected' ? 'rejected' : 'saved')}
    />
  </div>
</details>

<style>
  .settings-fold {
    border-top: 1px solid var(--border-faint);
  }
  .settings-fold:last-child {
    border-bottom: 1px solid var(--border-faint);
  }
  .settings-fold summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 56px;
    cursor: pointer;
    list-style: none;
  }
  .settings-fold summary::-webkit-details-marker {
    display: none;
  }
  .settings-fold summary::after {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border: solid var(--text-faint);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
    transition: transform var(--spring-spatial-fast-dur) var(--spring-spatial-fast);
  }
  .settings-fold[open] summary::after {
    transform: rotate(-135deg);
  }
  .settings-fold-name {
    flex: 1;
    font-family: var(--font-serif);
    font-size: 1rem;
    color: var(--text-heading);
  }
  .settings-fold-via {
    margin-left: 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-dim);
  }
  .settings-fold-state {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .settings-fold-state.is-ready {
    color: var(--accent-sage);
  }
  .settings-fold-state.is-error {
    color: var(--danger);
  }
  .settings-fold-body {
    padding-bottom: var(--space-4);
  }
  .settings-lead {
    margin: 0 0 var(--space-3);
  }
</style>
