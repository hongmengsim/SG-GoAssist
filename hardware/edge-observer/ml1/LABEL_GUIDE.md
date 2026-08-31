# ML1 assistance-cue label guide

ML1 identifies anonymous transport-related objects. It does not identify people,
infer disability, perform face recognition, or confirm that help is wanted.

| ID | Label | Include | Exclude |
|---:|---|---|---|
| 0 | `wheelchair` | Manual/powered chair, including occupied chair | Office chairs, bicycles, mobility scooters without wheelchair form |
| 1 | `walker` | Walking frame, rollator, visible walking aid | Railings, trolleys, tripods |
| 2 | `stroller` | Folded or open child stroller/pram | Shopping trolley, wheelchair |
| 3 | `luggage` | Suitcase or large travel bag affecting boarding space/time | Handbag, clothing, litter |

## Annotation rules

- Draw a tight box around the complete object, including wheels and handles.
- Label partially occluded objects only when the class is still unambiguous.
- Ignore objects smaller than 24 × 24 pixels in the training resolution.
- Include negative images: empty stop, ordinary bags, trolleys, bicycles, shadows,
  posters, foliage, crowds, and buses without a target object.
- Record day/night, rain/dry, backlight, distance, occlusion, stop, and capture
  session in a separate non-identifying trial log.
- Keep all frames from one capture sequence in exactly one data split.
- A detection produces a confirmation prompt only; it never actuates the ramp.
