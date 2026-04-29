-- Pin search_path on all trigger / SECURITY DEFINER functions.
--
-- Without an explicit search_path, a function resolves unqualified identifiers
-- against the caller's search_path, which can be manipulated (e.g. to shadow
-- a table or operator via pg_temp). Pinning `search_path = public, pg_temp`
-- makes the resolution deterministic and blocks the shadow-table escalation.
--
-- Two of these (handle_new_user, sync_auth_display_name) already had
-- `SET search_path TO 'public'`, which is functionally equivalent but omits
-- pg_temp from the allow-list. We re-specify both for uniformity.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_study_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_card_overrides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_package_access (user_id, package_id, source)
  VALUES (NEW.id, 'pa-year-1-fall-2026', 'auto-grant')
  ON CONFLICT (user_id, package_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_auth_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
    UPDATE public.user_preferences
    SET display_name = NEW.raw_user_meta_data->>'full_name'
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
