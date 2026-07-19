# Freeform Layer Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade freeform documents to a v3 recursive scene tree and deliver the approved right-side layer panel, inherited lock/hide state, nested grouping, lossless similarity transforms, persistence and export.

**Architecture:** Keep DOM rendering and the existing history/storage/export boundaries, but replace each slide's flat `elements` array with recursive `nodes`. Pure scene-tree and similarity-transform modules own all geometry and invariants; React consumes those contracts through a recursive renderer, a separate selection overlay, and an accessible right-side layer tree. All tasks follow TDD and leave the branch buildable at each commit.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, DOM/CSS transforms, existing Local/Remote storage adapters and Fastify integration fixture.

**Prerequisite:** Complete all tasks in `2026-07-17-editor-interaction-hardening-implementation-plan.md` first. In particular, this plan extends the `test:acceptance` script and `e2e/editor-acceptance.spec.ts` created there; it is not independently executable from the original baseline.

---

## File Structure

- Modify `src/freeform/types.ts`
  - v3 document, scene-node, group, path and action types.
- Modify `src/freeform/constants.ts`
  - shared depth, node-count, slide-count and effective-scale limits.
- Create `src/freeform/sceneTransform.ts`
  - 2D similarity matrices, decomposition, bounds and coordinate conversion.
- Create `src/freeform/sceneTree.ts`
  - traversal, immutable path updates, grouping, ungrouping, cloning and ordering.
- Create `src/freeform/sceneSelection.ts`
  - active-scope selection, effective state and logical-unit helpers.
- Create `src/freeform/FreeformSceneNodeView.tsx`
  - recursive group/leaf artwork renderer.
- Create `src/freeform/FreeformSelectionOverlay.tsx`
  - world-matrix selection UI and stable hit targets.
- Create `src/freeform/FreeformLayersPanel.tsx`
  - accessible recursive tree, rename, reorder, lock/hide and group commands.
- Create `src/freeform/FreeformRightPanel.tsx`
  - approved Property/Layers tabs.
- Modify `src/freeform/FreeformWorkspace.tsx`
  - orchestration, active group path, pointer/keyboard commands and persistence.
- Modify `src/freeform/PlainTextEditable.tsx`
  - effective read-only contract.
- Modify `src/freeform/document.ts`
  - v3 constructors/reducer and page cloning.
- Modify `src/freeform/selection.ts`, `src/freeform/snapping.ts`
  - scene-node logical bounds and local/world coordinate support.
- Modify `src/freeform/imageAssets.ts`, `src/freeform/fontRequests.ts`
  - recursive hidden-inclusive asset traversal.
- Modify `src/drafts.ts`, `src/storage/local.ts`, `src/storage/remote.ts`
  - strict v3 normalization and round-trip behavior.
- Modify `src/styles.css`
  - right tabs, tree, recursive groups, overlay and responsive states.
- Modify `e2e/freeform.spec.ts`, `e2e/editor-acceptance.spec.ts`
  - local interaction and visual regression coverage.
- Create `e2e-integration/ports.ts`; modify `e2e-integration/backend.spec.ts`, `playwright.integration.config.ts`
  - real backend v3 persistence/lease coverage on non-live ports.
- Create `docs/freeform-editor.md`; modify `docs/backend-plan.md`
  - v3 user/schema documentation and versions.
- Modify `package.json`, `package-lock.json`
  - frontend `0.10.0` and final scripts.

---

### Task 1: Similarity-transform primitives

**Files:**
- Create: `src/freeform/sceneTransform.ts`
- Create: `src/freeform/__tests__/sceneTransform.test.ts`

- [ ] **Step 1: Write failing matrix tests**

Cover:

```ts
const point = transformPoint(groupLocal(100, 80, 90, 2), { x: 10, y: 0 })
expect(point.x).toBeCloseTo(100)
expect(point.y).toBeCloseTo(100)

const world = multiply(
  groupLocal(200, 120, 30, 1.5),
  leafLocal(20, 10, 100, 40, -15, 0.75),
)
expect(matrixAlmostEqual(multiply(invert(world)!, world), identity(), SCENE_EPSILON)).toBe(true)
```

Also test clockwise rotation in y-down coordinates, vector conversion without translation, four-corner bounds, singular inverse returning `null`, similarity decomposition/recomposition, negative/NaN inputs being rejected and epsilon comparison.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTransform.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal matrix API**

Export:

```ts
type Matrix2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number]
type Point = { x: number; y: number }

identity()
multiply(left, right)
translation(x, y)
clockwiseRotation(degrees)
uniformScale(scale)
invert(matrix): Matrix2D | null
transformPoint(matrix, point)
transformVector(matrix, vector)
groupLocal(x, y, rotation, scale)
leafLocal(x, y, width, height, rotation, scale)
decomposeSimilarity(matrix): SimilarityTransform | null
boundsFromPoints(points)
```

Use column-vector composition exactly as the spec defines. Never round in these helpers.

- [ ] **Step 4: Verify GREEN and contracts**

Run the command from Step 2.

Expected: all matrix tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/freeform/sceneTransform.ts src/freeform/__tests__/sceneTransform.test.ts
git commit -m "feat(freeform): add scene transform primitives"
```

---

### Task 2: Additive v3 model, strict normalizer and legacy round trip

**Files:**
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/constants.ts`
- Create: `src/freeform/sceneDocument.ts`
- Create: `src/freeform/sceneTree.ts`
- Create: `src/freeform/__tests__/sceneDocument.test.ts`

- [ ] **Step 1: Write failing v3 migration tests**

Add tests for:

- v2 flat elements become v3 root nodes with `name`, `locked:false`, `hidden:false`, `scale:1`;
- duplicated element IDs on copied legacy pages remain valid because uniqueness is page-scoped;
- same-page duplicate/empty IDs are deterministically rewritten, not dropped;
- duplicate/empty slide IDs are deterministically rewritten and active slide resolution uses the first old match;
- invalid legacy elements/pages follow the tolerant rules from the spec;
- migration → save → read returns the same IDs and node count;
- v3 rejects empty slides, invalid active ID, fractional/out-of-range page sizes, 501 pages, empty/duplicate IDs, empty groups, depth 33, node 5001, non-finite `x/y/rotation`, non-positive leaf dimensions, leaf/group local `scale <= 0`, non-finite local scale and out-of-range world effective scale;
- legacy 501 pages and 5001 nodes are rejected rather than truncated.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneDocument.test.ts
```

Expected: FAIL because the additive v3 model/normalizer does not exist.

- [ ] **Step 3: Introduce additive scene types and limits**

Add new v3 types without changing the current runtime `FreeformDocument`/`FreeformSlide` aliases yet:

```ts
type ScenePath = readonly string[]
type FreeformSceneNode = FreeformSceneLeaf | FreeformGroupNode

interface FreeformGroupNode {
  id: string
  type: 'group'
  name: string
  locked: boolean
  hidden: boolean
  x: number
  y: number
  rotation: number
  scale: number
  children: FreeformSceneNode[]
}
```

Define `FreeformSceneLeaf`, `FreeformGroupNode`, `FreeformSlideV3` and `FreeformDocumentV3` additively. Add the shared constants from the spec. The shipping app remains v2 in this task, so no valid v3 group can yet be loaded and partially handled.

- [ ] **Step 4: Add basic tree traversal adapters**

In `sceneTree.ts`, initially implement only:

```ts
walkScene(nodes, visitor, depth)
flattenSceneLeaves(nodes)
countSceneNodes(nodes)
findNodeAtPath(nodes, path)
getChildrenAtPath(nodes, parentPath)
```

All functions enforce explicit depth and never mutate input.

- [ ] **Step 5: Implement standalone legacy migration and strict v3 validation**

In `sceneDocument.ts`, implement pure helpers for legacy tolerant migration and strict v3 normalization. Validate the complete document before returning it; no partial v3 output. Use deterministic collision IDs, not random IDs, during migration. This module is production code consumed by the atomic cutover task, not a test-only API.

- [ ] **Step 6: Verify additive GREEN without runtime changes**

Run the command from Step 2, then:

```powershell
npm run test:unit
npm run build
```

Expected: new scene-document tests and all existing tests/build pass while the shipping runtime still uses v2.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/freeform/types.ts src/freeform/constants.ts src/freeform/sceneDocument.ts src/freeform/sceneTree.ts src/freeform/__tests__/sceneDocument.test.ts
git commit -m "feat(freeform): define scene document v3"
```

---

### Task 3: Immutable tree operations and lossless group transforms

**Files:**
- Modify: `src/freeform/sceneTree.ts`
- Modify: `src/freeform/sceneTransform.ts`
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Create: `src/freeform/__tests__/sceneTree.test.ts`

- [ ] **Step 1: Write failing immutable-tree tests**

Cover path update reference preservation, unknown path returning the same root, stable same-parent reorder, non-contiguous grouping at the highest selected layer, nested group creation, explicit/automatic ungroup, deep clone IDs and page-scoped uniqueness.

Encode the full reducer permission matrix now, before v3 becomes the shipping runtime: final `node/set-locked`, `node/set-hidden` and `node/rename` actions allow the metadata exceptions; effective-lock rejects content/geometry/style/structure actions; locked parents reject insertion; mixed permitted/forbidden batches reject atomically. Exercise these exact actions through the additive v3 reducer entry point that Task 5A adopts unchanged, rather than testing only a detached predicate.

- [ ] **Step 2: Write failing transform-preservation tests**

For text, stroked shape, line/arrow and an already scaled nested group:

1. capture every leaf's world matrix and transformed corners before grouping;
2. group and assert grouping alone preserves those matrices/corners;
3. rotate and scale the group twice, then capture the new transformed matrices/corners;
4. ungroup one level and all levels;
5. assert each ungroup preserves the transformed snapshot within `1e-6` and leaf scales retain visual lengths.

Include invalid depth, effective-scale overflow, locked selection and mixed-parent selection returning the original document reference. Add reducer-boundary tests proving group/create at depth 32, paste/add operations at 5000 nodes, and `slide/add-after-active` at 500 pages return the original document reference.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTree.test.ts
```

Expected: FAIL because group operations are missing.

- [ ] **Step 4: Implement immutable path operations**

Add:

```ts
updateChildrenAtPath
updateNodeAtPath
removeNodesAtPath
reorderNodesAtPath
cloneSceneNodes
validateSelectionForParent
canApplySceneAction
```

Updates copy only the ancestor path and keep unaffected branches referentially equal.

- [ ] **Step 5: Implement group/recenter/ungroup**

Add pure operations whose result is a discriminated union:

```ts
type SceneMutationResult =
  | { ok: true; nodes: FreeformSceneNode[]; selectionIds: string[] }
  | { ok: false; reason: SceneMutationError }
```

Use matrices from Task 1, preserve selected child order, insert at the highest selected layer, and apply the exact recenter formula. Automatic one-child cleanup must call the same transform composition used by explicit ungroup.

Add a three-level rotated/scaled ancestor test: edit a leaf's position and size, recenter ancestors from inner to outer, and assert every leaf world corner is unchanged within `SCENE_EPSILON` except the intentionally edited leaf delta.

- [ ] **Step 6: Add the final path-based v3 reducer actions**

Add an additive `reduceFreeformDocumentV3` entry point with typed actions for `node/set-locked`, `node/set-hidden`, `node/rename`, content/style/geometry update, delete/reorder/clone, group/create, group/ungroup and child insertion. Every handler delegates to the same permission-aware helpers and preserves the original document reference on rejection. Task 5A switches the shipping alias to this already-tested reducer without rewriting it. Keep temporary root-element action adapters only where current v2 UI still calls them; mark their removal in Task 8.

- [ ] **Step 7: Verify GREEN and full unit suite**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTree.test.ts
npm run test:unit
```

Expected: scene tests and all unit tests pass.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/freeform
git commit -m "feat(freeform): add immutable nested group operations"
```

---

### Task 4: Additive recursive assets, fonts and page clone

**Files:**
- Modify: `src/freeform/imageAssets.ts`
- Modify: `src/freeform/fontRequests.ts`
- Modify: `src/freeform/sceneDocument.ts`
- Modify: `src/freeform/sceneTree.ts`
- Modify: related unit tests under `src/freeform/__tests__`

- [ ] **Step 1: Write failing recursive asset tests**

Build a two-level group containing a hidden image element, hidden image-filled shape and text with a web font. Assert:

- image collection returns both sources despite hidden ancestors;
- font request collection returns nested text;
- recursive scene mapping can materialize both `img:` refs without mutating the source v3 document;
- a failed async source conversion returns/rethrows without producing a partial v3 document.

- [ ] **Step 2: Write failing page-clone tests**

Duplicate a page with nested groups and assert every group/leaf ID changes, sibling order and fields remain, and source refs are unchanged.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/imageAssets.test.ts src/freeform/__tests__/fontRequests.test.ts src/freeform/__tests__/sceneDocument.test.ts src/freeform/__tests__/sceneTree.test.ts
```

Expected: nested descendants are missed or cloned IDs are reused.

- [ ] **Step 4: Implement one shared recursive traversal path**

Add v3-specific recursive collectors/mappers alongside the still-shipping v2 functions. Reuse `walkScene`/immutable mapping from `sceneTree.ts`; do not wire LocalStore/RemoteStore yet. Hidden affects rendering, never asset retention.

- [ ] **Step 5: Verify GREEN**

Run the command from Step 3.

Expected: all targeted tests pass.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/freeform
git commit -m "feat(freeform): traverse nested scene assets"
```

---

### Task 5: Independent selection overlay and stable accessible handles

**Files:**
- Create: `src/freeform/FreeformSelectionOverlay.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing overlay E2E tests and pointercancel regressions on the current v2 runtime**

Select a bottom root element and assert selection does not change artwork overlap order. At 50%, 100% and 150% fit-relative zoom, assert move/resize pointer hit targets remain at least 28 CSS pixels, expose `移动对象`/`调整大小` names, receive keyboard focus, and show a visible focus ring. Add named `leaf pointercancel cleanup` cases for both move and resize: dispatch `pointercancel` after a live change and assert the live snapshot, snapping guides and transient transform are cleared without creating a history entry.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "selection overlay hit targets|selection keeps artwork order|leaf pointercancel cleanup"
```

Expected: FAIL because selected artwork is raised and handle boxes scale below 28px; any already-correct pointercancel case is retained as explicit regression evidence rather than being treated as the reason for RED.

- [ ] **Step 3: Extract the current selection UI into the overlay**

Render outlines/handles after all current artwork through `FreeformSelectionOverlay`; remove `.freeform-element.selected { z-index: ... }`. Preserve all root pointer callbacks and one-history-entry behavior.

- [ ] **Step 4: Stabilize visual and hit sizes**

Set an inverse-preview-scale CSS variable. Keep the visible handle restrained with a pseudo-element while the focusable button's transparent pointer box remains at least 28px. Add `:focus-visible` styling with existing accent tokens.

- [ ] **Step 5: Verify GREEN and pointercancel regression**

Run the command from Step 2 plus:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "editor ui|dragging and resizing|marquee"
```

Expected: overlay/handle tests, both named pointercancel cases and existing root interactions pass; pointercancel clears live UI and overlay remains absent from exports.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/freeform/FreeformSelectionOverlay.tsx src/freeform/FreeformWorkspace.tsx src/styles.css e2e/freeform.spec.ts
git commit -m "fix(freeform): stabilize selection overlay controls"
```

---

### Task 5A: Atomically cut the shipping runtime over to v3

**Files:**
- Create: `src/freeform/FreeformSceneNodeView.tsx`
- Create: `src/freeform/sceneSelection.ts`
- Create: `src/freeform/__tests__/sceneSelection.test.ts`
- Modify: `src/freeform/types.ts`
- Modify: `src/freeform/document.ts`
- Modify: `src/drafts.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/PlainTextEditable.tsx`
- Modify: `src/freeform/imageAssets.ts`
- Modify: `src/freeform/fontRequests.ts`
- Modify: `src/storage/local.ts`
- Modify: `src/storage/remote.ts`
- Modify: all affected unit fixtures/tests and `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing selection and recursive-render tests**

Unit tests cover effective lock/hide inheritance, active-parent direct-child selection, ancestor/descendant deduplication, path fallback and logical bounds. E2E opens a nested v3 fixture and verifies every visible leaf bounding box, hidden descendants are absent, locked text is read-only, and root click selects the outer group without changing z-order.

- [ ] **Step 2: Write failing storage cutover tests**

Extend `draftMigration`, LocalStore and RemoteStore tests to assert:

- all reads return v3;
- strict-invalid v3 never overwrites an existing draft;
- nested `img:` materialization/URL retention is recursive and atomic;
- v2 migration → local/remote save → read satisfies every strict invariant;
- 501 pages, 5001 nodes, non-finite transforms and invalid active IDs are rejected consistently.

- [ ] **Step 3: Verify RED while runtime is still v2**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneSelection.test.ts src/freeform/__tests__/draftMigration.test.ts src/storage/local.test.ts src/storage/remote.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "renders nested v3 scene"
```

Expected: FAIL because production aliases/storage/rendering still use v2.

- [ ] **Step 4: Switch aliases, constructors and reducer to v3 together**

Make `FreeformDocument`/`FreeformSlide` the v3 runtime types, use `nodes`, include leaf metadata/scale, and route every document action through the Task 3 permission-aware scene helpers. Remove any save path that can serialize v2 after this point.

- [ ] **Step 5: Wire strict normalization and recursive storage together**

Use `sceneDocument.ts` from `normalizeDraftForRead` and write validation. Replace old flat materialization/retention/font/image paths with Task 4 recursive functions in the same change.

- [ ] **Step 6: Wire recursive rendering and safe root selection**

`FreeformSceneNodeView` renders nested transforms, hidden nodes return `null`, effective-locked leaves are read-only and ignore content edits, and the current root scope selects a root group as one unit. Keep group creation controls hidden until later tasks.

- [ ] **Step 7: Verify targeted GREEN**

Run the commands from Step 3.

Expected: all targeted v3, storage and rendering tests pass.

- [ ] **Step 8: Prove the atomic cutover has no half-state regression**

Run:

```powershell
npm run test:unit
npm run test:e2e
npm run build
git diff --check
```

Expected: full unit/E2E/build pass in the same commit that first accepts nested v3 drafts.

- [ ] **Step 9: Commit Task 5A**

```powershell
git add src e2e/freeform.spec.ts
git commit -m "feat(freeform): switch runtime to recursive scene v3"
```

---

### Task 6: Approved right-side Layers tab and accessible tree

**Files:**
- Create: `src/freeform/FreeformLayersPanel.tsx`
- Create: `src/freeform/FreeformRightPanel.tsx`
- Modify: `src/freeform/sceneSelection.ts`
- Modify: `src/freeform/__tests__/sceneSelection.test.ts`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing tabs/tree selection E2E tests**

Assert complete `tablist/tab/tabpanel` linkage and roving focus. Open a nested fixture and assert topmost-first visual order, `tree/treeitem/group` semantics, levels, expanded/selected state, Arrow/Home/End navigation and no canvas nudge while tree focus is active. Clicking or pressing Enter on a deep row must select it and synchronously set the editing scope to its parent; Space toggles only same-parent multi-selection, while a cross-parent attempt leaves the prior selection unchanged and announces the constraint. Add pure `reconcileSceneUiState` cases for document replacement, active-page change, draft identity change and user identity change, plus E2E cases proving deep tree selection cannot leave a stale path after delete, undo, page switch or opening another draft.

- [ ] **Step 2: Write failing rename/reorder/focus tests**

Cover F2/double-click rename with empty fallback, `Alt+↑` visual forward and `Alt+↓` backward, multi-node stable block order, drag reorder within one parent, cross-parent drop rejection, aria-live announcements, and deterministic focus after delete/collapse. For rename and reorder, assert one undo step restores the prior state, redo reapplies it, and each successful action marks the draft dirty exactly once.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneSelection.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "layers tab|layer tree|layer rename|layer reorder"
```

Expected: FAIL because components do not exist.

- [ ] **Step 4: Implement `FreeformRightPanel`**

Use the existing workspace-tab keyboard pattern for Property/Layers tabs. Tab selection is UI-only and survives workspace visibility changes during the current mount.

- [ ] **Step 5: Implement recursive tree presentation and complete row selection**

Render siblings in reverse array order, groups recursively, SVG type/expand icons and 40px rows. Wire click/Enter to direct selection, deep selection to the row's parent editing scope, and Space/modifier selection through the same-parent selection normalizer from Task 5A. Add one `reconcileSceneUiState` entry point and invoke it after document snapshot, active slide, active draft ID or user ID changes; invalid paths fall back to the nearest existing ancestor and selection is filtered atomically. Do not expose eye/lock or group/ungroup controls in this task; those appear only in the tasks that already have complete reducer enforcement. Stop handled keyboard events from reaching window shortcuts.

- [ ] **Step 6: Implement rename and same-parent ordering**

Wire path-based reducer actions. Keyboard ordering uses `node/reorder`; an exact mouse drop uses one atomic `node/reorder-above` action so non-contiguous selected siblings are removed and reinserted as a stable block without creating multiple history entries. Translate visual list positions to bottom-to-top array indices exactly as the spec states. A selected drop target is a no-op. Mouse drag is an enhancement; keyboard order must be complete first.

- [ ] **Step 7: Verify GREEN and responsive layout**

Run the command from Step 3 plus:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "compact|dark mode|toolbar keeps controls"
```

Expected: layers and existing 1024/dark tests pass without a fourth column or body overflow.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat(freeform): add accessible layers panel"
```

---

### Task 7: Expose lock and hide management after reducer enforcement

**Files:**
- Modify: `src/freeform/sceneSelection.ts`
- Modify: `src/freeform/sceneTree.ts`
- Modify: `src/freeform/document.ts`
- Modify: `src/freeform/FreeformLayersPanel.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/FreeformSceneNodeView.tsx`
- Modify: `src/freeform/PlainTextEditable.tsx`
- Modify: unit tests and `e2e/freeform.spec.ts`

- [ ] **Step 1: Confirm the reducer permission gate is already GREEN**

Run the Task 3 permission-matrix and Task 5A selection tests before exposing controls:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/sceneSelection.test.ts
```

Expected: PASS for metadata exceptions, atomic rejection of mixed locked batches, locked-parent insertion rejection and same-reference no-op behavior. Stop this task if that gate regresses.

- [ ] **Step 2: Write failing lock/hide UI and integration tests**

Assert:

- hidden leaf or fixture-provided group disappears from canvas/export but remains selected in the tree and can be restored;
- hiding the focused tree item moves focus to the next sibling, previous sibling or parent in that order while keeping the hidden row manageable;
- a locked leaf, or a leaf effectively locked by a fixture-provided group, still displays/exports but rejects the currently delivered leaf drag/resize handles, arrows, Delete, text focus, leaf property changes, layer ordering and paste into a locked parent;
- locked nodes can still be renamed, hidden and unlocked from the tree;
- the inspector's effective-lock banner exposes a keyboard-accessible unlock action that dispatches the same tested `node/set-locked` reducer action;
- unlocking a parent reveals each child's saved own state;
- undo/redo and save/reload preserve state.

- [ ] **Step 3: Verify the UI RED without treating the permission gate as RED**

Run:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "locks nested layers|hides nested layers|locked layer metadata"
```

Expected: FAIL because the eye/lock controls and their end-to-end action wiring are not exposed; the Step 1 permission gate remains GREEN.

- [ ] **Step 4: Wire controls only through the enforced reducer actions**

Dispatch the already-tested Task 3 `node/set-locked` and `node/set-hidden` actions from the new controls. Do not add replacement reducer paths or duplicate a weaker permission list in React handlers. Preserve one history entry for each accepted toggle and the original document reference for rejected changes.

- [ ] **Step 5: Implement rendering and inspector state**

Reconfirm that hidden nodes return no artwork DOM and locked leaves pass `readOnly` to `PlainTextEditable` and ignore canvas pointer entry. A tree-selected effective-locked node shows a read-only property banner. Add eye/lock buttons with `aria-pressed`, explicit names and event isolation to `FreeformLayersPanel`; their first render occurs only after the Step 1 reducer gate passed.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/sceneSelection.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "locks nested layers|hides nested layers|locked layer metadata"
npm run test:unit
```

Expected: all targeted and full unit tests pass.

- [ ] **Step 7: Commit Task 7**

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat(freeform): enforce layer lock and visibility"
```

---

### Task 7A: Implement the property-panel coordinate contract

**Files:**
- Create: `src/freeform/sceneProperties.ts`
- Create: `src/freeform/__tests__/sceneProperties.test.ts`
- Create: `src/freeform/InspectorNumberInput.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/InspectorSection.tsx` if a shared linked-field primitive is justified
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing property conversion unit tests**

For a leaf with `scale=1.5` inside a rotated/scaled parent, assert the property adapter reports a page-space unrotated rectangle from the full world center/effective scale, world rotation, and visual font/stroke values multiplied by world effective scale. Editing one page axis or dimension must preserve the other page properties while inverse-transforming parent-local geometry; no field may use the rotated world AABB.

For a group, assert page-space visual center `x/y`, linked page width/height from local descendant bounds and world effective scale, world rotation and world scale percent. Include a valid but non-centered v3 group: reads must not mutate or canonicalize it. Editing center, rotation, width, height or scale keeps its page center stable where applicable; compute the final clamped local scale before width/height conversion and center compensation. Cover editable, effectively locked and unlocked-with-locked-descendant states, including hidden descendants in bounds.

Drive every accepted pure mutation through the real reducer and read it back through the adapter. Cover rotated/scaled ancestors, leaf single-axis edits, non-centered group edits, effective-scale endpoints and clamps, ancestor recentering, no-op updates and unchanged world corners for sibling nodes not targeted by the edit. Normalize rotation to `[0, 360)` and cover `-180/180/270/360/720` plus a parent rotation that crosses the boundary.

- [ ] **Step 2: Write failing property E2E tests**

Open a rotated/scaled nested fixture through a draft. Assert the inspector breadcrumb shows the full page/group path, nested leaf fields show stable page properties, group width/height stay linked, and rotation/scale inputs work by keyboard. Compare preconstructed grouped and flattened drafts with equivalent world geometry; Task 8 owns the same assertion through the real group/ungroup UI. Number fields buffer invalid/partial input and commit at most one undoable history entry on blur or Enter. Locked nodes and unlocked groups with locked descendants are visibly read-only. Recheck that the Task 7 lock banner's unlock action restores editing through the shared reducer action.

Exercise numeric state boundaries: empty string, sign/decimal intermediate state, NaN/infinity rejection, zero/negative dimensions, Enter followed by blur deduplication, Escape cancellation, unchanged rounded display preserving stored precision, a clamp back to the current value, and an external undo or draft identity switch while editing.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneProperties.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "scene property coordinates|linked group dimensions"
```

Expected: FAIL because the current inspector treats geometry as flat element fields and has no group adapter.

- [ ] **Step 4: Implement pure read/write adapters**

Export `scenePropertiesForPath` and `scenePropertyMutation` with discriminated leaf/group property models and explicit editability state. Keep all matrix and scale math outside JSX. Adapters return either a typed path-based scene mutation or a stable rejection reason; reads never mutate and writes never round stored values.

- [ ] **Step 5: Wire inspector fields and breadcrumb**

Display at most two decimals but preserve full numbers on unchanged blur. Use labels `X/Y` for the leaf page rectangle and `中心 X/Y` for the group page center. Group width/height edits dispatch one uniform-scale action; expose world rotation and world scale percentage while writing local fields. Migrate every single-selection content, style and geometry control from the root-only compatibility action to full-path updates.

The path-update E2E matrix must include nested text content, font, font size, text fill, shape type/fill, image fit, line kind, stroke color and stroke width. Asynchronous shape-image fill captures a document-identity generation, the original `slideId` and full `ScenePath`: selection or active-slide changes within the same document still update that original shape; draft/user/new-document identity changes, a newer upload, or removal/type change of the original path discard the late document mutation and leave the uploaded asset for existing GC. Test both same-document routing and a second draft that deliberately reuses the same slide/path IDs. Task 7A hides align/distribute controls for unsupported nested/group selections; Task 9 enables their full world-space behavior.

- [ ] **Step 6: Verify GREEN**

Run the commands from Step 3 plus:

```powershell
npm run test:e2e -- e2e/freeform.spec.ts --grep "inspector|undo|redo"
```

Expected: new property tests and existing inspector/history tests pass.

- [ ] **Step 7: Commit Task 7A**

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat(freeform): define nested scene property coordinates"
```

---

### Task 8: Nested grouping and editing scopes

**Files:**
- Modify: `src/freeform/FreeformLayersPanel.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/document.ts`
- Modify: `src/styles.css`
- Modify: `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing group lifecycle E2E tests**

Cover two-leaf grouping, grouping that group with a sibling, non-contiguous layer semantics, panel group/ungroup actions, Ctrl/Cmd+G, Ctrl/Cmd+Shift+G, one history entry and ID uniqueness. Assert group/ungroup rejects effectively locked selections and insertion into a locked parent through both toolbar and shortcut paths.

- [ ] **Step 2: Write failing scope-navigation tests**

Assert canvas first click selects the current-scope outer group; double-click/Enter enters it; Esc exits one level before clearing. Re-run the Task 6 path-fallback cases after grouping, ungrouping and cut so stale shortcuts never act on a removed scope. Tree-driven deep selection, same-parent multi-selection and the unified identity-change reconciliation entry point were completed in Task 6; the real delayed remote-response case is covered in Task 10.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneSelection.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "groups layers|nested group scope|group shortcut"
```

Expected: FAIL because grouping is not exposed.

- [ ] **Step 4: Wire group commands and active-path validation**

Use Task 3 pure actions and the Task 6 reconciliation entry point; do not add a second cleanup path in event handlers. Only after these actions and tests are wired, expose panel `组合/解组` buttons and shortcuts.

- [ ] **Step 5: Add breadcrumb and scope feedback**

Show a compact page/group breadcrumb in the inspector header. Enter/Escape must not create history or change document dirty state.

- [ ] **Step 6: Verify GREEN and exact selection regressions**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneSelection.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "groups layers|nested group scope|group shortcut|marquee|multi-select|copies, pastes, and deletes|batch copies|batch deletes"
```

Expected: nested scope/group tests and the named flat marquee, multi-select, clipboard and delete regressions pass.

- [ ] **Step 7: Remove temporary root-only action adapters**

Grep for legacy `element/*` reducer actions and remove or formally retain only compatibility types still used by migration tests. Update names consistently across the repository.

- [ ] **Step 8: Commit Task 8**

```powershell
git add src/freeform src/styles.css e2e/freeform.spec.ts
git commit -m "feat(freeform): add nested grouping scopes"
```

---

### Task 9: Group transform, alignment, snapping and cross-scope clipboard

**Files:**
- Modify: `src/freeform/FreeformSelectionOverlay.tsx`
- Modify: `src/freeform/FreeformWorkspace.tsx`
- Modify: `src/freeform/sceneTransform.ts`
- Modify: `src/freeform/sceneTree.ts`
- Modify: `src/freeform/selection.ts`
- Modify: `src/freeform/snapping.ts`
- Modify: unit tests and `e2e/freeform.spec.ts`

- [ ] **Step 1: Write failing local-coordinate interaction tests**

Inside a parent rotated 30° and scaled 1.5, test pointer drag, arrow nudge, marquee and snapping deltas against `inverse(parentWorld)`. Verify no integer rounding until inspector display.

- [ ] **Step 2: Write failing group transform tests**

Use the overlay to move, corner-scale and rotate nested groups. Assert world matrices, effective-scale clamping, one history entry per gesture, pointercancel cleanup and pixel-stable ungroup for text/shape/arrow. Assert effectively locked groups expose no transform handles and reject pointer/keyboard transforms. Add a named `rotation handle accessibility` test: the focusable button is named `旋转对象`, has a screen-space hit box of at least 28×28px across tested zooms, and shows a visible focus ring without changing artwork order.

- [ ] **Step 3: Write failing logical align/distribute tests**

Select leaves and groups in one parent. Align/distribute by world bounds while preserving group internals. Hidden nodes are absent; locked visible siblings remain snapping references.

- [ ] **Step 4: Write failing clipboard-coordinate tests**

Copy from a rotated/scaled group and paste to root and a differently transformed group. Assert:

```ts
targetWorld === translation(16, 16) * sourceWorld
```

for every copied top node, IDs are recursively unique, states/refs persist, and an invalid effective-scale target rejects the whole paste. After rejection, paste again into a legal target and prove the original clipboard nodes, order, metadata and `sourceParentWorld` were unchanged.

- [ ] **Step 5: Verify RED**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTransform.test.ts src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/selection.test.ts src/freeform/__tests__/snapping.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "nested local pointer|nested group transform|rotation handle accessibility|logical group alignment|cross-scope paste"
```

Expected: local pointer deltas, group scale/rotate, group-as-unit alignment and target-parent clipboard matrix assertions fail.

- [ ] **Step 6: Implement coordinate-safe gestures**

Convert screen point → page → active-parent local once per event. Transform vectors through inverse linear matrices. Reuse scene helpers for live snapshots and commit on pointerup only.

- [ ] **Step 7: Implement group scale/rotation overlay**

Group/multi-select corner handles change uniform scale; a dedicated rotation handle changes local rotation. Clamp by descendant world effective scale. Leaf-only resize keeps current nonuniform width/height behavior while respecting leaf scale.

- [ ] **Step 8: Implement logical alignment/snapping and clipboard matrices**

Do not flatten groups into individual align units. Store `sourceParentWorld` in the in-memory clipboard and use the exact target-local formula from the spec.

- [ ] **Step 9: Verify GREEN**

Run:

```powershell
npm run test:unit -- src/freeform/__tests__/sceneTransform.test.ts src/freeform/__tests__/sceneTree.test.ts src/freeform/__tests__/selection.test.ts src/freeform/__tests__/snapping.test.ts
npm run test:e2e -- e2e/freeform.spec.ts --grep "nested local pointer|nested group transform|rotation handle accessibility|logical group alignment|cross-scope paste|snapping|clipboard"
```

Expected: all new and existing geometry/clipboard tests pass.

- [ ] **Step 10: Commit Task 9**

```powershell
git add src/freeform e2e/freeform.spec.ts
git commit -m "feat(freeform): transform nested groups safely"
```

---

### Task 10: Real-backend persistence, image leases, export and acceptance

**Files:**
- Create: `e2e-integration/ports.ts`
- Modify: `playwright.integration.config.ts`
- Modify: `e2e-integration/backend.spec.ts`
- Modify: `e2e/editor-acceptance.spec.ts`
- Modify: `e2e/freeform.spec.ts`
- Modify related client/server tests only if a real contract gap is exposed.

- [ ] **Step 1: Isolate integration ports from the live preview**

Create `e2e-integration/ports.ts` as the single source for `BACKEND_PORT=5310`, `FRONTEND_PORT=5273`, `API_BASE` and `FRONTEND_ORIGIN`; import it from both `playwright.integration.config.ts` and `e2e-integration/backend.spec.ts`. Update the integration test's comments and every direct `page.request` call to use the shared `API_BASE`, then run `rg -n "3100" playwright.integration.config.ts e2e-integration` and require no stale live-port references. Verify `VITE_API_BASE`, CORS and health checks all derive from that source. Set the integration-only `IMAGE_LEASE_MS=500` so expiry/GC can be exercised without changing production defaults. Never stop or reuse the user's 3100/5174 servers.

- [ ] **Step 2: Write failing remote v3 round-trip test**

Register a unique user, create nested groups with names/lock/hide/image refs, save, reload in a second context and verify strict v3 tree and geometry restoration.

Add a delayed-save variant: enter a nested group, start a held remote save, open another draft or switch user, then release the old response. Assert draft identity, root editing scope and selection remain tied to the newer context.

Add a history-authority gate for the existing optimistic `applyAction` path: hold a remote save, queue a document action or pointer gesture, then release the normalized save response. The returned action result, `history.current`, `currentDocumentRef`, dirty state and undo depth must agree. Consolidate every history mutation through one synchronous history ref/update entry point if the current React updater rebase can diverge; do not use `flushSync` as a workaround. Include save-in-flight plus pointerup/pointercancel so a normalized response cannot create a false live-edit history entry or be rolled back by the gesture's older start snapshot.

- [ ] **Step 3: Write failing hidden-image lease/GC integration test**

Upload an image element and shape fill under a hidden group and save the draft. Before waiting, upload a third control image through the real API but do not reference it from any draft. Wait at least 750ms beyond the integration-only lease start, then upload a fourth image solely to trigger the real reclaim path. Verify both draft-referenced hidden assets remain retrievable and decode after reload, the third expired unreferenced image returns 404, and the fourth trigger upload remains retrievable.

- [ ] **Step 4: Write failing export tests**

Assert hidden leaves/groups do not affect pixels, locked leaves/groups do, nested group scale/rotation is identical across light/dark and 50%/400% preview zoom, and editor overlay/tree never appears. Keep exact PNG dimensions.

- [ ] **Step 5: Extend editor acceptance**

Add layer-tab semantics, nested group creation, lock/hide, save/reload and export to `editor-acceptance.spec.ts`. Keep 1440/1366/1024 metrics, no native-control checks and the 5000ms export ceiling.

- [ ] **Step 6: Run the newly added integration verification**

Run:

```powershell
npm run test:integration
npm run test:acceptance
npm run test:e2e -- e2e/freeform.spec.ts --grep "nested group export|hidden group export"
```

Expected: the previously TDD-built behavior passes at integration level without touching live ports or network fonts. This task adds verification, not speculative production behavior, so it does not manufacture an artificial RED.

- [ ] **Step 7: If verification exposes a real gap, preserve RED and fix minimally**

For each failure, keep the exact failing test, identify the owning production contract, implement the smallest client/server fix, and rerun the exact command until GREEN. Record any extra production files in the task review. If server code/API changes, update server tests and reassess the server version in Task 11.

- [ ] **Step 8: Commit Task 10**

```powershell
git add playwright.integration.config.ts e2e-integration/ports.ts e2e-integration/backend.spec.ts e2e/editor-acceptance.spec.ts e2e/freeform.spec.ts
# Also add exact src/server test and implementation files only if Step 7 changed them.
git commit -m "test(freeform): cover nested scenes end to end"
```

---

### Task 11: Version, documentation and release verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Conditionally modify: `server/package.json`, `server/package-lock.json` only if Task 10 changed server implementation/API.
- Create: `docs/freeform-editor.md`
- Modify: `docs/backend-plan.md`

- [ ] **Step 1: Write/update documentation before version changes**

Document:

- v3 scene-tree schema and v1/v2 migration;
- right Layers tab, nesting, navigation and shortcuts;
- lock/hide inheritance;
- uniform-only group scaling and current non-goals;
- local/remote image retention behavior;
- `test:acceptance` and integration port isolation.

- [ ] **Step 2: Bump the frontend minor version**

Set root version to `0.10.0` in `package.json` and every root package location in `package-lock.json`. If Task 10 changed no server implementation/API, leave `server/package.json` and server lock at `0.2.0`; if it did, classify the server change under the repository version discipline, bump patch/minor as appropriate, and synchronize both server package files and `docs/backend-plan.md`. Update the frontend/backend version sentence with the actual result.

- [ ] **Step 3: Check names and contracts repository-wide**

Run:

```powershell
rg -n "documentVersion: 2|\.elements\b|element/|groupId|FreeformGroup|MAX_SCENE|activeGroupPath" src e2e e2e-integration docs
```

Review every match. Remove stale v2/current-model references except intentional legacy fixtures and migration documentation.

- [ ] **Step 4: Run full verification**

Run fresh:

```powershell
npm run test:unit
npm run test:server
npm run test:e2e
npm run test:integration
npm run test:acceptance
npm run build
node server/smoke-test.mjs
$env:JWT_SECRET='compose-config-check'; docker compose config
git diff --check
git status --short
```

Expected:

- all unit, server, E2E, integration, acceptance and smoke tests pass;
- build exits 0, with only a separately reported existing/new bundle warning;
- compose config parses; Docker daemon runtime is not required for this check;
- diff check is clean and status contains only intentional files.

- [ ] **Step 5: Run automated visual acceptance**

Start the worktree preview on ports different from 5174/3100. Use an independent headless browser to capture light/dark screenshots at 1440×900, 1366×768 and 1024×768; inspect nonblank canvas pixels, text containment, tree indentation, focus rings, handle hit targets, error notice position and absence of overlap. Do not connect to or close existing Chrome.

- [ ] **Step 6: Commit Task 11**

```powershell
git add package.json package-lock.json docs
# If Task 10 changed server implementation/API, also stage the synchronized server version files:
# git add server/package.json server/package-lock.json
git commit -m "chore(release): prepare freeform layers 0.10"
```

---

## Layer Tree Completion Gate

Before claiming completion, compare every acceptance criterion in the design spec against code and fresh evidence. Then request a final independent code review over the full branch diff and resolve every Critical/Important finding before offering merge options.
