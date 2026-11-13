// The rating scale as the screens see it: changing it in Settings redraws
// every card and control at once. Plain code (share text, exports) reads the
// same choice from util/stars.

import { ratingScale, setRatingScale, type RatingScale } from '../util/stars';

export const ratingView = $state<{ scale: RatingScale }>({ scale: ratingScale() });

export function chooseRatingScale(scale: RatingScale) {
  setRatingScale(scale);
  ratingView.scale = scale;
}
