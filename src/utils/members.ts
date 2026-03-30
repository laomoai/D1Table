const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

/**
 * Hard-delete a team member: nullify their ownership references, then remove user record.
 * Resources (notes, groups, etc.) remain in the Space (team_id unchanged), only personal ownership is cleared.
 */
export async function hardDeleteMember(db: D1Database, userId: number) {
  await db.batch([
    db.prepare(`UPDATE _notes SET owner_id = NULL WHERE owner_id = ?`).bind(userId),
    db.prepare(`UPDATE _notes SET created_by = NULL WHERE created_by = ?`).bind(userId),
    db.prepare(`UPDATE _groups SET owner_id = NULL WHERE owner_id = ?`).bind(userId),
    db.prepare(`UPDATE _meta SET owner_id = NULL WHERE owner_id = ?`).bind(userId),
    db.prepare(`UPDATE _dashboards SET owner_id = NULL WHERE owner_id = ?`).bind(userId),
    db.prepare(`UPDATE _trash SET owner_id = NULL WHERE owner_id = ?`).bind(userId),
    db.prepare(`DELETE FROM _user_preferences WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM _api_keys WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM _users WHERE id = ?`).bind(userId),
  ])
}

/**
 * Delete an entire Space and all its data.
 * Order matters: must respect FK constraints.
 *   _api_key_groups / _api_key_note_roots → _api_keys → _users
 *   _group_tables → _groups
 *   _teams.created_by → _users  (must nullify before deleting users)
 */
export async function hardDeleteSpace(db: D1Database, teamId: number) {
  const [users, tables] = await Promise.all([
    db.prepare(`SELECT id FROM _users WHERE team_id = ?`).bind(teamId).all<{ id: number }>(),
    db.prepare(`SELECT table_name FROM _meta WHERE team_id = ?`).bind(teamId).all<{ table_name: string }>(),
  ])

  // Step 1: Break circular FK — nullify _teams.created_by so _users can be deleted later
  await db.prepare(`UPDATE _teams SET created_by = NULL WHERE id = ?`).bind(teamId).run()

  // Step 2: Delete FK-dependent association tables
  await db.batch([
    db.prepare(`DELETE FROM _api_key_groups WHERE key_id IN (SELECT id FROM _api_keys WHERE team_id = ?)`).bind(teamId),
    db.prepare(`DELETE FROM _api_key_note_roots WHERE key_id IN (SELECT id FROM _api_keys WHERE team_id = ?)`).bind(teamId),
    db.prepare(`DELETE FROM _group_tables WHERE group_id IN (SELECT id FROM _groups WHERE team_id = ?)`).bind(teamId),
  ])

  // Step 3: Delete user-scoped data (preferences, api_keys)
  const userStmts: D1PreparedStatement[] = []
  for (const u of users.results) {
    userStmts.push(db.prepare(`DELETE FROM _user_preferences WHERE user_id = ?`).bind(u.id))
  }
  if (userStmts.length > 0) await db.batch(userStmts)

  await db.prepare(`DELETE FROM _api_keys WHERE team_id = ?`).bind(teamId).run()

  // Step 4: Delete space-scoped system records (no more FK deps on these)
  await db.batch([
    db.prepare(`DELETE FROM _notes WHERE team_id = ?`).bind(teamId),
    db.prepare(`DELETE FROM _groups WHERE team_id = ?`).bind(teamId),
    db.prepare(`DELETE FROM _dashboards WHERE team_id = ?`).bind(teamId),
    db.prepare(`DELETE FROM _trash WHERE team_id = ?`).bind(teamId),
    db.prepare(`DELETE FROM _meta WHERE team_id = ?`).bind(teamId),
  ])

  // Step 5: Delete users, then the team
  await db.batch([
    db.prepare(`DELETE FROM _users WHERE team_id = ?`).bind(teamId),
    db.prepare(`DELETE FROM _teams WHERE id = ?`).bind(teamId),
  ])

  // Step 6: Drop user-created data tables
  for (const t of tables.results) {
    try {
      await db.prepare(`DROP TABLE IF EXISTS "${t.table_name}"`).run()
    } catch {
      // Table may already be gone
    }
  }
}
