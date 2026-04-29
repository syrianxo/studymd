-- Rename legacy keys in user_card_overrides.overrides JSONB to match the
-- canonical flashcard/question schema in lib/validate-lecture.ts.
--   flashcard rows: question -> front, answer -> back
--   question rows:  question -> stem,  correct_answer -> answer
--
-- Idempotent: each UPDATE is guarded by the presence of the legacy key, so
-- re-running is a no-op. Canonical keys that already exist are preserved
-- (the legacy key is dropped rather than overwriting canonical content).

-- Flashcard overrides: question -> front
UPDATE public.user_card_overrides
SET overrides = CASE
  WHEN overrides ? 'front'
    THEN overrides - 'question'
  ELSE (overrides - 'question') || jsonb_build_object('front', overrides -> 'question')
END
WHERE card_type = 'flashcard'
  AND overrides ? 'question';

-- Flashcard overrides: answer -> back
UPDATE public.user_card_overrides
SET overrides = CASE
  WHEN overrides ? 'back'
    THEN overrides - 'answer'
  ELSE (overrides - 'answer') || jsonb_build_object('back', overrides -> 'answer')
END
WHERE card_type = 'flashcard'
  AND overrides ? 'answer';

-- Question overrides: question -> stem
UPDATE public.user_card_overrides
SET overrides = CASE
  WHEN overrides ? 'stem'
    THEN overrides - 'question'
  ELSE (overrides - 'question') || jsonb_build_object('stem', overrides -> 'question')
END
WHERE card_type = 'question'
  AND overrides ? 'question';

-- Question overrides: correct_answer -> answer
UPDATE public.user_card_overrides
SET overrides = CASE
  WHEN overrides ? 'answer'
    THEN overrides - 'correct_answer'
  ELSE (overrides - 'correct_answer') || jsonb_build_object('answer', overrides -> 'correct_answer')
END
WHERE card_type = 'question'
  AND overrides ? 'correct_answer';
