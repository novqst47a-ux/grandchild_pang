# Tree mode generated graphics

Generated on 2026-09-22 using the built-in `image_gen.imagegen` tool (`tools.image_gen__imagegen`), one generation call per asset. No CLI or external image model was used. Each selected PNG was copied unmodified from the built-in tool's generated-images directory into this folder; original alpha channels are preserved.

## Validation and integration

- All four delivered images are 1254 × 1254 PNGs with 32-bit RGBA pixels. Every top-left corner has alpha 0 (fully transparent). Of all 16 corners, 15 have alpha 0 and the mature tree's bottom-left corner has alpha 1 (0.4% opacity); the generated alpha was preserved without postprocessing.
- Each delivered local file was visually inspected with `view_image`.
- `sprout.png`: stage 1; two leaves on a small grassy mound, empty upper canvas intentionally makes the start look small.
- `sapling.png`: stage 2; young three-branch tree with individual large leaves.
- `mature.png`: stage 3; full broad crown without baked-in fruit. Approximate crown area is x=3–97%, y=3–65%. Useful normalized fruit-center positions include (30%, 30%), (50%, 20%), (70%, 30%), (25%, 48%), (75%, 48%). Positions are suggestions for UI overlays, not baked into the artwork.
- `fruit.png`: golden-orange fruit with one leaf. A circular custom image may be overlaid with center near x=50%, y=56% and diameter around 50–55% of this sprite's square box.
- Use the complete square canvas for the tree sprites and align their bottom edge. Tree growth stages use the same light direction, green palette, and grassy soil-mound motif.

## Full prompts

### sprout.png

```text
Use case: stylized-concept
Asset type: single transparent PNG sprite for a cozy casual match-three puzzle game, tree growth stage 1 of 3.
Primary request: a tiny cheerful fresh green sprout with exactly two plump leaves on a short curved pale-green stem, growing from a small rounded grassy soil mound.
Style/medium: charming polished softly shaded clay and storybook game art; smooth rounded forms, subtle velvety material, crisp silhouette, warm gentle light from upper left. Palette fresh lime and leaf green, warm brown soil. Will sit on warm cream UI.
Composition/framing: square canvas, front view with slight view of the mound top. Entire isolated sprout and mound centered horizontally, mound base at 89% canvas height, mound occupies 60% canvas width. Sprout top at 47% canvas height, allowing transparent empty room above for later growth. No cropping. Readable at 250px.
Scene/backdrop: genuinely transparent background with alpha, no opaque color or checkerboard. Only the plant and its little grassy soil mound are visible.
Constraints: no face, eyes, text, letters, logos, watermark, pot, fruit, scenery, border, cast shadow outside the mound. Produce ONE isolated sprite, no sprite sheet.
```

### sapling.png

```text
Use case: stylized-concept
Asset type: single transparent PNG sprite for a cozy casual match-three puzzle game, tree growth stage 2 of 3.
Primary request: a young sapling tree with a slim warm brown gently curved trunk, two small branching arms and a compact rounded crown of plump fresh green leaves, growing from a small rounded grassy soil mound. Clear young tree silhouette, substantially larger than a two-leaf sprout but not full-grown.
Style/medium: charming polished softly shaded clay and storybook game art; smooth rounded forms, subtle velvety material, crisp silhouette, warm gentle light from upper left. Palette fresh lime and leaf green, warm brown soil. Will sit on warm cream UI.
Composition/framing: square canvas, front view with slight view of the mound top. Entire isolated tree and mound centered horizontally, mound base at 89% canvas height, mound occupies 60% canvas width. Sapling top at 24% canvas height, leafy crown occupies 60% canvas width and top-to-mid of plant. No cropping. Readable at 250px.
Scene/backdrop: genuinely transparent background with alpha, no opaque color or checkerboard. Only the tree and its little grassy soil mound are visible.
Constraints: no face, eyes, text, letters, logos, watermark, pot, fruit, scenery, border, cast shadow outside the mound. Produce ONE isolated sprite, no sprite sheet.
```

### mature.png

```text
Use case: stylized-concept
Asset type: single transparent PNG sprite for a cozy casual match-three puzzle game, tree growth stage 3 of 3, full-grown tree ready to receive separate fruit overlays.
Primary request: a full-grown lush broad rounded green tree with a thick friendly gently curved warm-brown trunk and a dense broad fluffy rounded crown of plump green leaf clusters, growing from a small rounded grassy soil mound. It must have NO FRUIT anywhere. A large continuous canopy is essential; the UI will add five fruit images on it.
Style/medium: charming polished softly shaded clay and storybook game art; smooth rounded forms, subtle velvety material, crisp silhouette, warm gentle light from upper left. Palette fresh lime highlights and rich leaf green, warm brown soil. Will sit on warm cream UI.
Composition/framing: square canvas, centered front view with slight view of the mound top. Entire isolated tree and mound visible. Broad canopy extends from 8% to 92% canvas width and from 7% to 66% canvas height, gently cloud-like but composed of large stylized leaf clusters. Canopy face is full around x=30%,50%,70% y=30%, and x=37%,63% y=52%, suitable for adding fruits. Short visible trunk occupies lower middle from 58% to 81% canvas height. Mound base at 90% height and mound width 60% canvas. No cropping. Readable at 250px.
Scene/backdrop: genuinely transparent background with alpha, no opaque color or checkerboard. Only the tree and its little grassy soil mound visible.
Constraints: no face, eyes, text, letters, logos, watermark, pot, fruit, flowers, scenery, border, cast shadow outside mound. Produce ONE isolated sprite, no sprite sheet.
```

### fruit.png

```text
Use case: stylized-concept
Asset type: single transparent PNG fruit sprite for a cozy casual match-three tree-growing puzzle game. It will be overlaid on a leafy green tree and sometimes a circular custom photograph will be layered onto the center of the fruit by the UI.
Primary request: ONE plump round golden-orange fruit with softly lobed apple-like silhouette, a short tiny warm brown stem at the top and one small rich green leaf leaning right. Big simple smooth round golden-orange body, broad clear unadorned central area suitable for an optional photo insert. Front view.
Style/medium: charming polished softly shaded clay and storybook game art; smooth rounded forms, subtle velvety material, crisp silhouette, warm gentle light from upper left. Warm golden-orange body with amber shading and a very soft highlight. Will sit on a fresh green tree over a cream UI.
Composition/framing: square canvas. Entire fruit fully visible and centered horizontally. Body fills 78% canvas width, from 24% to 89% canvas height; leaf and stem top at 8% canvas height. Fruit body center near 50% x,57% y. Compact icon readable at 48px.
Scene/backdrop: genuinely transparent background with alpha, no opaque color or checkerboard. Only the fruit is visible.
Constraints: no face, eyes, text, letters, logos, watermark, photograph, hole, frame, slice, extra fruit, branch, scenery, border, cast shadow. Produce ONE isolated sprite, no sprite sheet.
```
