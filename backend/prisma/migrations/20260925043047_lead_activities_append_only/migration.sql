-- Audit trail is append-only: activities can be inserted, never changed or removed.
CREATE FUNCTION prevent_lead_activity_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lead_activities is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_activities_append_only
  BEFORE UPDATE OR DELETE ON lead_activities
  FOR EACH ROW EXECUTE FUNCTION prevent_lead_activity_mutation();
