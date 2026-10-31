<script lang="ts">
  import { currentTheme, setTheme } from '../../platform/theme';
  import { shelf } from '../../state/shelf.svelte';
  import Icon from '../Icon.svelte';

  let light = $state(currentTheme() === 'light');

  async function toggle() {
    light = !light;
    await setTheme(light ? 'light' : 'dark');
    void shelf.refresh(); // re-skins the home-screen widget
  }
</script>

<button
  type="button"
  class="theme-toggle"
  role="switch"
  aria-label="Toggle theme"
  aria-checked={light}
  onclick={toggle}
>
  <span class="icon-moon"><Icon name="moon" /></span>
  <span class="icon-sun"><Icon name="sun" /></span>
  <span class="knob" aria-hidden="true"></span>
</button>
