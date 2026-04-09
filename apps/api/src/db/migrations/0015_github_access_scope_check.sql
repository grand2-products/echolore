ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_access_scope_check"
  CHECK ("access_scope" IN ('all_members', 'admins', 'groups'));
