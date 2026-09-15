# Enhancement Registration Contract

Register legitimate enhancements once in `.governance/ENHANCEMENT_REGISTRY.json`.

The registration entry is the canonical source for:

- feature registry impact
- boot/load registration impact
- source lifecycle state
- docs and changelog requirement

Agents must not manually discover and edit unrelated governance files to make a valid enhancement pass. Validators derive their checks from the canonical enhancement entry and from `.governance/SOURCE_LIFECYCLE.json`.

## Source Lifecycle States

Allowed source lifecycle states:

- `active`
- `loaded-by`
- `experimental`
- `deferred`
- `removed`
- `generated`
- `ignored`

Every source file under `src/` must match one declared lifecycle entry.

