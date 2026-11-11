<script lang="ts">
  // BookShelf's idle toy: the library cat, asleep on the returns. Pet it and it
  // leans into your hand; nine pets and it is yours (an easter egg).
  import { play } from 'dusk-dawn';
  import { cheer, hatch } from '../util/delight';

  const PURRS = [
    'Prrrr.',
    'A slow blink. That means trust.',
    'The library cat approves of your shelf.',
    'It has read every book here. Sat on them, anyway.',
    'Back to your book, then.',
    'It moves to sit on whatever you were reading.',
    'One ear turns towards the quiet.',
    'A purr like a page turning.'
  ];
  const LIVES = 9;

  let pets = $state(0);
  let petting = $state(false);
  let toy = $state<HTMLButtonElement>();
  let settle: ReturnType<typeof setTimeout> | undefined;
  const line = $derived(
    pets === 0
      ? 'The library cat is asleep on the returns.'
      : PURRS[(pets - 1) % PURRS.length]
  );

  function pet() {
    pets += 1;
    petting = false;
    requestAnimationFrame(() => (petting = true));
    clearTimeout(settle);
    settle = setTimeout(() => (petting = false), 1000);
    if (pets === LIVES) {
      play(toy, 'heartbeat');
      cheer(toy, { count: 36, spread: 0.6, shapes: ['heart', 'circle'] });
      hatch('cat', 'Nine pets, nine lives. The library cat is yours now.');
    }
  }
</script>

<button
  type="button"
  class="idle-toy"
  class:is-petting={petting}
  bind:this={toy}
  aria-label="Pet the library cat"
  onclick={pet}
>
  <!-- Lucide "cat", with eyes that close when petted, and Lucide "heart" -->
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g class="cat">
      <path
        d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"
      />
      <g class="eyes-open">
        <path d="M8 14v.5" />
        <path d="M16 14v.5" />
      </g>
      <g class="eyes-closed">
        <path d="M7 14.5c.6-.6 1.4-.6 2 0" />
        <path d="M15 14.5c.6-.6 1.4-.6 2 0" />
      </g>
      <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />
    </g>
    <path
      class="heart"
      d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    />
  </svg>
</button>
<p class="idle-line" aria-live="polite">{line}</p>

<style>
  .cat,
  .heart {
    transform-box: view-box;
  }
  .cat {
    transform-origin: 12px 21px;
  }
  .eyes-closed,
  .heart {
    opacity: 0;
  }
  .heart {
    transform-origin: 12px 12px;
    transform: translate(7px, -9px) scale(0.32);
    stroke-width: 4;
  }
  .is-petting .eyes-open {
    opacity: 0;
  }
  .is-petting .eyes-closed {
    opacity: 1;
  }
  @media (prefers-reduced-motion: no-preference) {
    /* Petted, the cat leans into the hand and a heart floats up and away. */
    .is-petting .cat {
      animation: lean 700ms var(--ease-standard);
    }
    .is-petting .heart {
      animation: float-up 900ms var(--ease-standard);
    }
  }
  @keyframes lean {
    30% {
      transform: rotate(-7deg) scale(1.02, 0.97);
    }
    65% {
      transform: rotate(4deg);
    }
  }
  @keyframes float-up {
    0% {
      opacity: 0;
      transform: translate(7px, -6px) scale(0.2);
    }
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(9px, -15px) scale(0.36);
    }
  }
</style>
