---
change_id: ui-tokens-onboarding
title: Ui tokens onboarding
status: impl_reviewed
created: 2026-10-07
updated: 2026-10-15
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

**Implementation adaptation (2026-10-07):** where `plan.md` contradicts the decisions below, the
decisions win (confirmed at `/10x-implement` entry):
- Q4: the cosmic background becomes its own token variable + utility; the dashboard uses it instead of `bg-background`.
- Q5: the heading gradient gets its own tokens + utility instead of being dropped for `text-foreground`.
- Q7: `LibBadge.astro` is deleted in Phase 1 (criterion 1.2 therefore expects `badge.tsx button.tsx card.tsx table.tsx`). `Topbar.astro` turned out to be live (`Welcome.astro:2,18`, landing `/`), so it is kept and deferred to the landing migration.

## Decisions to Open Questions

1. **Który widok jest docelowy?** Przyjęto `dashboard.astro`; potwierdź w `change.md`
   (10x-ui: jeden widok na zmianę). - Decyzja:Potwierdzam
2. **Motyw**: ciemny przez `class="dark"` na `<html>` czy przejście na jasny? Blokuje fazę tokenów. - Decyzja:ciemny
3. **Marka**: zostaje fiolet (→ wartości `--primary`/`--ring`/`--accent` w obu motywach) czy
   neutral shadcn? Potrzebne źródło wartości (motyw/preset) do zdeponowania w folderze zmiany. - Decyzja: zostaje fiolet
4. **Tło `bg-cosmic`**: zostaje jako dekoracja, staje się tokenem (`--background` z gradientem nie zadziała jako kolor — wymaga osobnej zmiennej) czy znika? - Decyzja: wymaga osobnej zmiennej - Decyzja: zostaje fiolet
5. **Gradientowe nagłówki** (`from-blue-200 to-purple-200 bg-clip-text`, 6 plików): bez tokenu —
   usunąć czy zdefiniować? - Decyzja: zdefiniowac
6. **Token wyniku dodatniego** (np. `--success`): dodać teraz, czy w S-02 razem z wynikiem? - Decyzja: dodac w s2
7. **`Topbar.astro`, `LibBadge.astro`**: usunąć jako martwy kod czy zostawić? - Decyzja: usunąć