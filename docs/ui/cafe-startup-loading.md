# Café startup loading: Sun watches the BTS

This changes the full `LoadingScene` shown on quick reopening into the café, as in Teera's screenshot. It does not change the cold-open shut-down/boot sequence. The previous room-travel overlay was a different screen.

Layers:
- Static 480×720 pixel café window background, 45,942 bytes.
- Existing `/sprites/world/train_day.webp`, clipped to the window and translated across the viaduct in a 14-second cycle.
- Static photographic male Sun cutout, 360×540 with alpha, 23,532 bytes. Generated with Sun's existing `server/portrait/neutral.webp` as the identity reference, holding a cup and looking left toward the window.
- Room title, one short line and the existing loading/ready state. Ready still enters through the existing callback; there is no new minimum wait.

The character and background were made separately with the built-in image generation tool and resized/compressed for production. The photographic character must never be turned into pixel art. Review identity preservation with Teera; generation is an interpretation, not a guarantee of identical facial geometry.

Character prompt: preserve Sun's face identity, eyes, nose, jaw, hair, cheek bandage, age and slim body. Standing quietly, three-quarter facing left, head looking left and slightly upward at a train. Both hands naturally holding a small cream ceramic coffee cup at waist level. Entire head through knees. Oatmeal knit sweater, fitted dark-brown café apron with green leaf, dark olive trousers. Real human photograph with soft daylight, genuine transparent background. No glasses or beret.

Background prompt: static portrait pixel-art café, eye-level camera, large window, elevated concrete BTS viaduct outside, blue sky, Bangkok rooftops. No people, no text and no train; train is a separate animated layer. Warm wood and sage, coffee cup at lower left, clear space at right for Sun. Crisp square pixels with restrained shading.

Reduced-motion preference makes the train still. No particles, video, zoom, pan or photographic body deformation. The two new compressed images total 69,474 bytes. Memory and heat still require physical iPhone testing.
