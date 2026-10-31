import { describe, it, expect } from 'vitest';
import {
  episodeProgress, seasons, setWatched, derivedTvState, reminderItems, guideIsStale, episodeCode, localDate
} from '../src/util/episodes';

const ep = (id, s, e, aired) => ({ id, s, e, name: `Ep ${s}x${e}`, aired });
const show = (extra = {}) => ({
  id: 'show', type: 'tv', title: 'Severance',
  episodeGuide: {
    fetchedAt: '2026-10-01T00:00:00Z',
    status: 'Continuing',
    episodes: [
      ep(1, 1, 1, '2026-01-01'), ep(2, 1, 2, '2026-01-08'), ep(3, 2, 1, '2026-10-20'),
      ep(4, 2, 2, '2026-11-05'), ep(9, 0, 1, '2026-02-01') // special
    ]
  },
  watchedEpisodes: [],
  ...extra
});
const TODAY = '2026-10-30';

describe('episodeProgress', () => {
  it('counts aired regular episodes and finds next up / upcoming', () => {
    const p = episodeProgress(show({ watchedEpisodes: [1] }), TODAY);
    expect(p).toMatchObject({ watched: 1, aired: 3, total: 4, caughtUp: false });
    expect(p.next?.id).toBe(2);
    expect(p.upcoming?.id).toBe(4);
  });
  it('is caught up when every aired episode is watched (specials ignored)', () => {
    const p = episodeProgress(show({ watchedEpisodes: [1, 2, 3] }), TODAY);
    expect(p.caughtUp).toBe(true);
    expect(p.next).toBeNull();
  });
});

describe('seasons and watching', () => {
  it('groups by season with specials last', () => {
    expect(seasons(show()).map((x) => x.season)).toEqual([1, 2, 0]);
  });
  it('marks episodes watched and unwatched without duplicates', () => {
    const s = show({ watchedEpisodes: [1] });
    setWatched(s, [1, 2], true);
    expect(s.watchedEpisodes.sort()).toEqual([1, 2]);
    setWatched(s, [1], false);
    expect(s.watchedEpisodes).toEqual([2]);
  });
});

describe('derivedTvState', () => {
  it('is in progress once anything is watched; progress counts aired episodes', () => {
    expect(derivedTvState(show({ watchedEpisodes: [1] }), TODAY)).toEqual({ progress: { current: 1, total: 3 }, status: 'in-progress' });
    expect(derivedTvState(show(), TODAY).status).toBeNull();
  });
  it('completes only when caught up on an ended show with nothing upcoming', () => {
    const caughtUp = { watchedEpisodes: [1, 2, 3] };
    expect(derivedTvState(show(caughtUp), TODAY).status).toBe('in-progress'); // still airing
    const ended = show({ ...caughtUp, episodeGuide: { ...show().episodeGuide, status: 'Ended', episodes: show().episodeGuide.episodes.filter((e) => e.id !== 4) } });
    expect(derivedTvState(ended, TODAY).status).toBe('finished');
  });
});

describe('reminders and refresh', () => {
  it('lists episodes in the reminder window for shows with reminders on', () => {
    expect(reminderItems([show()], TODAY)).toEqual([]);
    const items = reminderItems([show({ remindNewEpisodes: true })], TODAY);
    expect(items.map((i) => i.episodeId)).toEqual([4]); // 2026-10-20 is outside the 2-day lookback
    expect(items[0]).toMatchObject({ show: 'Severance', code: 'S2 E2', aired: '2026-11-05' });
  });
  it('refreshes stale guides of airing shows only', () => {
    const now = new Date('2026-10-30T00:00:00Z');
    expect(guideIsStale(show(), now)).toBe(true); // fetched 29 days ago, continuing
    expect(guideIsStale(show({ episodeGuide: { ...show().episodeGuide, status: 'Ended' } }), now)).toBe(false);
    expect(guideIsStale({ type: 'tv' }, now)).toBe(true);
  });
  it('formats codes and local dates', () => {
    expect(episodeCode(ep(1, 3, 7, null))).toBe('S3 E7');
    expect(episodeCode(ep(1, 0, 2, null))).toBe('Special 2');
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
