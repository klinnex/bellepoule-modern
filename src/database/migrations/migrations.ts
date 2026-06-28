/**
 * BellePoule Modern - Liste des migrations DB
 * Ajouter ici chaque nouvelle migration avec un numéro de version croissant.
 */

import { Migration } from './index';

export const ALL_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Tables initiales (baseline)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS competitions (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, short_title TEXT,
          date TEXT NOT NULL, location TEXT, organizer TEXT,
          weapon TEXT NOT NULL, gender TEXT NOT NULL, category TEXT NOT NULL,
          championship TEXT, color TEXT DEFAULT '#3B82F6',
          current_phase_index INTEGER DEFAULT 0, is_team_event INTEGER DEFAULT 0,
          status TEXT DEFAULT 'draft', settings TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS phases (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS fencers (
          id TEXT PRIMARY KEY, competition_id TEXT NOT NULL,
          ref INTEGER NOT NULL, last_name TEXT NOT NULL, first_name TEXT NOT NULL,
          birth_date TEXT, gender TEXT NOT NULL, nationality TEXT DEFAULT 'FRA',
          region TEXT, club TEXT, license TEXT, ranking INTEGER,
          status TEXT DEFAULT 'N', seed_number INTEGER, final_ranking INTEGER,
          pool_stats TEXT, photo TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY, number INTEGER NOT NULL,
          pool_id TEXT, table_id TEXT,
          fencer_a_id TEXT, fencer_b_id TEXT,
          score_a TEXT, score_b TEXT, max_score INTEGER NOT NULL,
          status TEXT DEFAULT 'not_started', referee_id TEXT,
          strip INTEGER, round INTEGER, position INTEGER,
          start_time TEXT, end_time TEXT, duration INTEGER,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS pools (
          id TEXT PRIMARY KEY, phase_id TEXT NOT NULL,
          number INTEGER NOT NULL, strip INTEGER, start_time TEXT,
          is_complete INTEGER DEFAULT 0, has_error INTEGER DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS pool_fencers (
          pool_id TEXT NOT NULL, fencer_id TEXT NOT NULL, position INTEGER NOT NULL,
          PRIMARY KEY (pool_id, fencer_id)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS session_state (
          competition_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS match_touches (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          zone TEXT NOT NULL,
          points INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          is_valid_in_sudden_death INTEGER DEFAULT 0,
          is_reversed INTEGER DEFAULT 0,
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS match_cards (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          card_type TEXT NOT NULL,
          reason TEXT NOT NULL,
          card_group INTEGER NOT NULL DEFAULT 1,
          timestamp TEXT NOT NULL,
          points_awarded INTEGER NOT NULL DEFAULT 0,
          resulting_exclusion INTEGER DEFAULT 0,
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS referees (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          ref INTEGER NOT NULL,
          name TEXT NOT NULL,
          gender TEXT,
          nationality TEXT DEFAULT 'FRA',
          club TEXT,
          license TEXT,
          category TEXT,
          status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS fencer_abandons (
          id TEXT PRIMARY KEY,
          fencer_id TEXT NOT NULL,
          competition_id TEXT NOT NULL,
          previous_status TEXT NOT NULL,
          abandon_type TEXT NOT NULL,
          match_snapshots TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      // Colonnes ajoutées progressivement (compat ascendante pour DBs existantes)
      try { db.run(`ALTER TABLE matches ADD COLUMN start_time TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE matches ADD COLUMN end_time TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE matches ADD COLUMN duration INTEGER`); } catch { /* */ }
      try { db.run(`ALTER TABLE fencers ADD COLUMN photo TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE fencers RENAME COLUMN league TO region`); } catch { /* */ }

      // Index de performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_competitions_date ON competitions(date)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_phases_competition ON phases(competition_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fencers_competition ON fencers(competition_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fencers_name ON fencers(last_name, first_name)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fencers_club ON fencers(club)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_pool ON matches(pool_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_table ON matches(table_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pools_phase ON pools(phase_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pool_fencers_pool ON pool_fencers(pool_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pool_fencers_fencer ON pool_fencers(fencer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_touches_match ON match_touches(match_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_touches_fencer ON match_touches(fencer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_cards_match ON match_cards(match_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_cards_fencer ON match_cards(fencer_id)`);
    },
  },

  {
    version: 2,
    description: 'Table bracket_nodes pour l\'élimination directe',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS bracket_nodes (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          phase_id TEXT NOT NULL,
          round INTEGER NOT NULL,
          position INTEGER NOT NULL,
          fencer_id TEXT,
          match_id TEXT,
          is_bye INTEGER DEFAULT 0,
          is_third_place INTEGER DEFAULT 0,
          parent_node_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bracket_competition ON bracket_nodes(competition_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bracket_phase ON bracket_nodes(phase_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bracket_round_pos ON bracket_nodes(round, position)`);
    },
  },

  {
    version: 3,
    description: 'Table score_audit_log pour la traçabilité des scores',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS score_audit_log (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          arena_id TEXT,
          previous_score_a TEXT,
          previous_score_b TEXT,
          new_score_a TEXT NOT NULL,
          new_score_b TEXT NOT NULL,
          changed_by TEXT NOT NULL,
          changed_at TEXT NOT NULL,
          reason TEXT,
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_match ON score_audit_log(match_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON score_audit_log(changed_at)`);
    },
  },

  {
    version: 4,
    description: 'Table arena_state pour la persistance des arènes',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS arena_state (
          arena_id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          current_match TEXT,
          match_queue TEXT DEFAULT '[]',
          settings TEXT,
          status TEXT DEFAULT 'idle',
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_arena_state_competition ON arena_state(competition_id)`);
    },
  },

  {
    version: 5,
    description: 'Table match_arena_exits pour les sorties d\'arène',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS match_arena_exits (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          exit_type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          points_awarded INTEGER NOT NULL DEFAULT 3,
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_arena_exits_match ON match_arena_exits(match_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_arena_exits_fencer ON match_arena_exits(fencer_id)`);
    },
  },

  {
    version: 6,
    description: 'Enrichissement score_audit_log : arbitre, IP, poule',
    up(db) {
      try { db.run(`ALTER TABLE score_audit_log ADD COLUMN referee_id TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE score_audit_log ADD COLUMN referee_name TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE score_audit_log ADD COLUMN ip_address TEXT`); } catch { /* */ }
      try { db.run(`ALTER TABLE score_audit_log ADD COLUMN pool_id TEXT`); } catch { /* */ }
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_pool ON score_audit_log(pool_id)`);
    },
  },

  {
    version: 7,
    description: 'Table pool_signatures pour signatures numériques des combattants',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS pool_signatures (
          id TEXT PRIMARY KEY,
          pool_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          signature_data TEXT NOT NULL,
          signed_at TEXT NOT NULL,
          UNIQUE(pool_id, fencer_id)
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pool_sigs_pool ON pool_signatures(pool_id)`);
    },
  },
  {
    version: 8,
    description: 'Index weapon + table formula_snapshots pour formule personnalisée (arme CUSTOM)',
    up(db) {
      db.run(`CREATE INDEX IF NOT EXISTS idx_competitions_weapon ON competitions(weapon)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS formula_snapshots (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          snapshot_name TEXT NOT NULL,
          formula_json TEXT NOT NULL,
          fencer_count_at_save INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_formula_snapshots_comp ON formula_snapshots(competition_id)`);
    },
  },
  {
    version: 9,
    description: 'Arbitre assigné à une poule (referee_id sur pools)',
    up(db) {
      try { db.run(`ALTER TABLE pools ADD COLUMN referee_id TEXT`); } catch { /* */ }
    },
  },
  {
    version: 10,
    description: 'Index composites pour les requêtes fréquentes (matchs en attente, stats par tireur, export tableau)',
    up(db) {
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_pool_status ON matches(pool_id, status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_fencer_a ON matches(fencer_a_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_fencer_b ON matches(fencer_b_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_table_round ON matches(table_id, round)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_matches_referee ON matches(referee_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_referees_competition ON referees(competition_id)`);
    },
  },
  {
    version: 11,
    description: 'Table de_match_signatures pour signatures des matchs de tableau (élimination directe)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS de_match_signatures (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          signature_data TEXT NOT NULL,
          signed_at TEXT NOT NULL,
          UNIQUE(match_id, fencer_id)
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_de_sigs_match ON de_match_signatures(match_id)`);
    },
  },

  {
    version: 12,
    description: 'Table season_results pour classement saisonnier Quest (multi-compétitions)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS season_results (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          competition_title TEXT NOT NULL,
          competition_date TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          fencer_last_name TEXT NOT NULL,
          fencer_first_name TEXT NOT NULL,
          fencer_club TEXT,
          victories INTEGER DEFAULT 0,
          matches_played INTEGER DEFAULT 0,
          quest_points INTEGER DEFAULT 0,
          quest_v4 INTEGER DEFAULT 0,
          quest_v3 INTEGER DEFAULT 0,
          quest_v2 INTEGER DEFAULT 0,
          quest_v1 INTEGER DEFAULT 0,
          touches_scored INTEGER DEFAULT 0,
          touches_received INTEGER DEFAULT 0,
          red_cards INTEGER DEFAULT 0,
          comp_rank INTEGER,
          added_at TEXT NOT NULL,
          UNIQUE(competition_id, fencer_id)
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_season_results_fencer ON season_results(fencer_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_season_results_comp ON season_results(competition_id)`);
    },
  },
  {
    version: 13,
    description: 'Tables équipes pour compétitions par équipes (teams, team_fencers, team_matches, team_bouts)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          name TEXT NOT NULL,
          club TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_teams_comp ON teams(competition_id)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS team_fencers (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          team_order INTEGER NOT NULL,
          is_reserve INTEGER DEFAULT 0,
          UNIQUE(team_id, fencer_id),
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
          FOREIGN KEY (fencer_id) REFERENCES fencers(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_fencers_team ON team_fencers(team_id)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS team_matches (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          pool_number INTEGER NOT NULL DEFAULT 1,
          team_a_id TEXT NOT NULL,
          team_b_id TEXT NOT NULL,
          score_bouts_a INTEGER DEFAULT 0,
          score_bouts_b INTEGER DEFAULT 0,
          status TEXT DEFAULT 'not_started',
          winner_id TEXT,
          current_bout_index INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (team_a_id) REFERENCES teams(id),
          FOREIGN KEY (team_b_id) REFERENCES teams(id)
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_matches_comp ON team_matches(competition_id)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS team_bouts (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          bout_order INTEGER NOT NULL,
          fencer_a_id TEXT NOT NULL,
          fencer_b_id TEXT NOT NULL,
          score_a INTEGER DEFAULT 0,
          score_b INTEGER DEFAULT 0,
          max_score INTEGER DEFAULT 5,
          status TEXT DEFAULT 'not_started',
          winner_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_bouts_match ON team_bouts(match_id)`);
    },
  },
];
