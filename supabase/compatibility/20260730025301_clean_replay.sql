-- Clean-baseline compatibility boundary for the immutable 20260730025301 migration.
--
-- Pass 3 creates attach_problem_report_screenshot(uuid, text) returning void.
-- The already-applied Lovable migration replaces that signature with a boolean
-- return, which PostgreSQL cannot do with CREATE OR REPLACE. Existing databases
-- have already crossed this boundary and must not run this file. A new baseline
-- replay runs it after Pass 3 and immediately before applying 20260730025301.
DO $$
BEGIN
  IF to_regprocedure('public.attach_problem_report_screenshot(uuid,text)') IS NOT NULL
    AND pg_get_function_result(
      'public.attach_problem_report_screenshot(uuid,text)'::regprocedure
    ) = 'void'
  THEN
    DROP FUNCTION public.attach_problem_report_screenshot(uuid, text);
  END IF;
END
$$;
