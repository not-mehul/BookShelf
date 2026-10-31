<script lang="ts">
  import { starString } from '../../util/stars';
  import type { CatalogEntry } from '../../types';
  import RatingControl from '../RatingControl.svelte';

  // Optional finer-grained scores, by media type.
  const ASPECTS: Record<'book' | 'movie' | 'tv', [string, string][]> = {
    book: [
      ['story', 'Story'],
      ['writing', 'Writing'],
      ['characters', 'Characters'],
      ['pacing', 'Pacing']
    ],
    movie: [
      ['story', 'Story'],
      ['acting', 'Acting'],
      ['direction', 'Direction'],
      ['visuals', 'Visuals']
    ],
    tv: [
      ['story', 'Story'],
      ['acting', 'Acting'],
      ['characters', 'Characters'],
      ['pacing', 'Pacing']
    ]
  };

  interface Props {
    entry: CatalogEntry;
    onchange: (aspects: Record<string, number>) => void;
  }

  let { entry, onchange }: Props = $props();
  const aspects = $derived(entry.type === 'quote' ? [] : ASPECTS[entry.type]);
  const scores = $derived(entry.aspectRatings || {});
  const summary = $derived(
    aspects
      .filter(([k]) => scores[k] != null)
      .map(([k, l]) => `${l} ${starString(scores[k])}`)
      .join(' · ')
  );

  function set(key: string, v: number | null) {
    const next = { ...scores };
    if (v == null) delete next[key];
    else next[key] = v;
    onchange(next);
  }
</script>

<details class="aspect-ratings">
  <summary>Rate aspects<span class="aspect-summary">{summary ? ` · ${summary}` : ''}</span></summary>
  {#each aspects as [key, label] (key)}
    <div class="aspect-row">
      <span class="aspect-label">{label}</span>
      <RatingControl value={scores[key]} onchange={(v) => set(key, v)} label="{label} rating" compact />
    </div>
  {/each}
</details>
