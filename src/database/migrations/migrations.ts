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
      try {
        db.run(`ALTER TABLE matches ADD COLUMN start_time TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE matches ADD COLUMN end_time TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE matches ADD COLUMN duration INTEGER`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE fencers ADD COLUMN photo TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE fencers RENAME COLUMN league TO region`);
      } catch {
        /* */
      }

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
    description: "Table bracket_nodes pour l'élimination directe",
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
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_arena_state_competition ON arena_state(competition_id)`
      );
    },
  },

  {
    version: 5,
    description: "Table match_arena_exits pour les sorties d'arène",
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
      try {
        db.run(`ALTER TABLE score_audit_log ADD COLUMN referee_id TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE score_audit_log ADD COLUMN referee_name TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE score_audit_log ADD COLUMN ip_address TEXT`);
      } catch {
        /* */
      }
      try {
        db.run(`ALTER TABLE score_audit_log ADD COLUMN pool_id TEXT`);
      } catch {
        /* */
      }
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
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_formula_snapshots_comp ON formula_snapshots(competition_id)`
      );
    },
  },
  {
    version: 9,
    description: 'Arbitre assigné à une poule (referee_id sur pools)',
    up(db) {
      try {
        db.run(`ALTER TABLE pools ADD COLUMN referee_id TEXT`);
      } catch {
        /* */
      }
    },
  },
  {
    version: 10,
    description:
      'Index composites pour les requêtes fréquentes (matchs en attente, stats par tireur, export tableau)',
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
    description:
      'Table de_match_signatures pour signatures des matchs de tableau (élimination directe)',
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
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_season_results_comp ON season_results(competition_id)`
      );
    },
  },
  {
    version: 13,
    description:
      'Tables équipes pour compétitions par équipes (teams, team_fencers, team_matches, team_bouts)',
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
  {
    version: 14,
    description:
      'Tableau équipes (élimination directe) : colonnes table_id/round/position sur team_matches',
    up(db) {
      // Un même `team_matches` sert aux poules (pool_number) et au tableau (table_id/round/position),
      // comme `matches` le fait déjà pour les tireurs individuels (pool_id vs table_id/round/position).
      try {
        db.run(`ALTER TABLE team_matches ADD COLUMN table_id TEXT`);
      } catch {
        /* colonne déjà présente */
      }
      try {
        db.run(`ALTER TABLE team_matches ADD COLUMN round INTEGER`);
      } catch {
        /* colonne déjà présente */
      }
      try {
        db.run(`ALTER TABLE team_matches ADD COLUMN position INTEGER`);
      } catch {
        /* colonne déjà présente */
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_matches_table ON team_matches(table_id)`);
    },
  },
  {
    version: 15,
    description:
      "Cartons d'équipe 'E' (format arène Sabre Laser) : table team_match_cards, traçabilité par rencontre",
    up(db) {
      // Un carton "E" (blanc/jaune/rouge/noir) sanctionne un retard de désignation
      // de combattant, cumulable durant les 9 assauts d'une même rencontre
      // (règlement épreuve par équipe Sabre Laser). N'affecte pas encore le score
      // automatiquement (traçabilité uniquement).
      db.run(`
        CREATE TABLE IF NOT EXISTS team_match_cards (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          type TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_match_cards_match ON team_match_cards(match_id)`);
    },
  },
  {
    version: 16,
    description: 'Arbitres multiples par poule (referee_ids JSON sur pools, mode expert)',
    up(db) {
      // referee_id reste l'arbitre principal (compatibilité) ; referee_ids stocke
      // la liste ordonnée complète (principal + assistant/vidéo…) en JSON.
      try {
        db.run(`ALTER TABLE pools ADD COLUMN referee_ids TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 17,
    description: "Motif d'exclusion des tireurs (carton noir, rapport fédéral)",
    up(db) {
      try {
        db.run(`ALTER TABLE fencers ADD COLUMN exclusion_reason TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 18,
    description: 'Commentaires de formation des arbitres saisis par les formateurs (#989)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS referee_comments (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          referee_id TEXT NOT NULL,
          author TEXT,
          comment TEXT NOT NULL,
          match_label TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (referee_id) REFERENCES referees(id) ON DELETE CASCADE
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_referee_comments_referee ON referee_comments(competition_id, referee_id)`
      );
    },
  },
  {
    version: 19,
    description:
      'Cartons individuels des relais par équipes (relais FIE) persistés : table team_bout_cards (#1086)',
    up(db) {
      // card_json = Card sérialisé (type, raison, groupe, points, exclusion) — même forme
      // que les cartons individuels, l'escalade se recalcule depuis l'historique.
      db.run(`
        CREATE TABLE IF NOT EXISTS team_bout_cards (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          bout_id TEXT NOT NULL,
          fencer_id TEXT NOT NULL,
          card_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE,
          FOREIGN KEY (bout_id) REFERENCES team_bouts(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_team_bout_cards_match ON team_bout_cards(match_id)`);
    },
  },
  {
    version: 20,
    description: 'Latéralité des tireurs (droitier R par défaut / gaucher L, #1415)',
    up(db) {
      try {
        db.run(`ALTER TABLE fencers ADD COLUMN handedness TEXT NOT NULL DEFAULT 'R'`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 21,
    description: 'Département des tireurs (code 01…95, 2A, 2B, 971…, #1504)',
    up(db) {
      try {
        db.run(`ALTER TABLE fencers ADD COLUMN department TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 22,
    description: 'Journée multi-épreuves : pistes de la salle et arbitres partagés (#1714)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS event_days (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          strip_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      // weapons = codes d'arme séparés par des virgules ("F,E") ; vide = toutes armes
      db.run(`
        CREATE TABLE IF NOT EXISTS event_day_referees (
          id TEXT PRIMARY KEY,
          event_day_id TEXT NOT NULL,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          club TEXT,
          license TEXT,
          category TEXT,
          weapons TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (event_day_id) REFERENCES event_days(id) ON DELETE CASCADE
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_event_day_referees_day ON event_day_referees(event_day_id)`
      );
      try {
        db.run(`ALTER TABLE competitions ADD COLUMN event_day_id TEXT`);
      } catch {
        /* colonne déjà présente */
      }
      // Lien arbitre de l'épreuve → arbitre de la journée
      try {
        db.run(`ALTER TABLE referees ADD COLUMN day_referee_id TEXT`);
      } catch {
        /* colonne déjà présente */
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_referees_day_referee ON referees(day_referee_id)`);
    },
  },
  {
    version: 23,
    description:
      'Table remote_events : appels DT, déconnexions et resynchros des tablettes (#1817)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS remote_events (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          type TEXT NOT NULL,
          arena_id TEXT,
          match_id TEXT,
          referee_id TEXT,
          detail TEXT,
          created_at TEXT NOT NULL
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_remote_events_comp ON remote_events(competition_id, type)`
      );
    },
  },
  {
    version: 24,
    description:
      'Table cyrano_pistes : table des pistes des appareils Cyrano, par compétition (#1829)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS cyrano_pistes (
          competition_id TEXT NOT NULL,
          piste TEXT NOT NULL,
          position INTEGER NOT NULL,
          config TEXT NOT NULL,
          PRIMARY KEY (competition_id, piste)
        )
      `);
    },
  },
  {
    version: 25,
    description:
      'Mode Club : membres, séances, présences et combats libres conservés sur la saison (#1872)',
    up(db) {
      // weapons = codes d'arme séparés par des virgules ; vide = toutes armes
      db.run(`
        CREATE TABLE IF NOT EXISTS club_members (
          id TEXT PRIMARY KEY,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          license TEXT,
          gender TEXT,
          birth_year INTEGER,
          weapons TEXT NOT NULL DEFAULT '',
          laterality TEXT,
          category TEXT,
          notes TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_club_members_name ON club_members(last_name, first_name)`
      );
      db.run(`
        CREATE TABLE IF NOT EXISTS club_sessions (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          label TEXT,
          weapon TEXT,
          strip_count INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'open',
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_sessions_date ON club_sessions(date)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS club_attendance (
          session_id TEXT NOT NULL,
          member_id TEXT NOT NULL,
          checked_in_at TEXT NOT NULL,
          PRIMARY KEY (session_id, member_id)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS club_bouts (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          date TEXT NOT NULL,
          strip INTEGER,
          member_a_id TEXT NOT NULL,
          member_b_id TEXT NOT NULL,
          score_a INTEGER NOT NULL DEFAULT 0,
          score_b INTEGER NOT NULL DEFAULT 0,
          max_score INTEGER NOT NULL DEFAULT 5,
          winner_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          entry_mode TEXT NOT NULL DEFAULT 'master',
          weapon TEXT,
          started_at TEXT,
          finished_at TEXT,
          duration INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_bouts_session ON club_bouts(session_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_bouts_date ON club_bouts(date)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_bouts_a ON club_bouts(member_a_id, date)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_bouts_b ON club_bouts(member_b_id, date)`);
    },
  },
  {
    version: 26,
    description: 'Mode Club : code de carte de membre (QR) et identité du club (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_members ADD COLUMN card_code TEXT`);
      } catch {
        /* colonne déjà présente */
      }
      // Membres existants : code aléatoire 10 hex (40 bits)
      db.run(
        `UPDATE club_members SET card_code = upper(hex(randomblob(5))) WHERE card_code IS NULL`
      );
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_club_members_card ON club_members(card_code)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS club_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
    },
  },
  {
    version: 27,
    description: 'Mode Club : photo des membres (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_members ADD COLUMN photo TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 28,
    description:
      'Mode Club : plusieurs clubs (table clubs, club_id), club existant conservé (#1872)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS clubs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT '',
          logo TEXT,
          strip_count INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      for (const table of ['club_members', 'club_sessions', 'club_bouts']) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN club_id TEXT`);
        } catch {
          /* colonne déjà présente */
        }
      }
      // Club unique des versions 25-27 : devient le club « club-default » s'il a des données
      db.run(`
        INSERT OR IGNORE INTO clubs (id, name, logo, strip_count, created_at, updated_at)
        SELECT 'club-default',
          COALESCE((SELECT value FROM club_settings WHERE key = 'name'), ''),
          (SELECT value FROM club_settings WHERE key = 'logo'),
          COALESCE(CAST((SELECT value FROM club_settings WHERE key = 'strip_count') AS INTEGER), 1),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE EXISTS (SELECT 1 FROM club_settings)
           OR EXISTS (SELECT 1 FROM club_members)
           OR EXISTS (SELECT 1 FROM club_sessions)
      `);
      for (const table of ['club_members', 'club_sessions', 'club_bouts']) {
        db.run(`UPDATE ${table} SET club_id = 'club-default' WHERE club_id IS NULL`);
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members(club_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_sessions_club ON club_sessions(club_id, date)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_bouts_club ON club_bouts(club_id, date)`);
    },
  },
  {
    version: 29,
    description:
      'Mode Club : préparation des séances (objectifs, plan, notes) et bilan (séance, par tireur) (#1872)',
    up(db) {
      for (const col of ['objectives', 'plan', 'notes', 'feedback']) {
        try {
          db.run(`ALTER TABLE club_sessions ADD COLUMN ${col} TEXT`);
        } catch {
          /* colonne déjà présente */
        }
      }
      try {
        db.run(`ALTER TABLE club_attendance ADD COLUMN feedback TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 30,
    description: 'Mode Club : arme par défaut du club (règles de la saisie distante) (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE clubs ADD COLUMN weapon TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 31,
    description: "Mode Club : bibliothèque d'exercices (échauffements, technique…) (#1872)",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS club_exercises (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'other',
          minutes INTEGER NOT NULL DEFAULT 0,
          details TEXT,
          images TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_club_exercises_cat ON club_exercises(category, title)`
      );
    },
  },
  {
    version: 32,
    description:
      "Mode Club : date de naissance, catégories d'âge des séances et exercices, séances récurrentes (#1872)",
    up(db) {
      const cols: Array<[string, string]> = [
        ['club_members', 'birth_date'],
        ['club_sessions', 'age_from'],
        ['club_sessions', 'age_to'],
        ['club_sessions', 'series_id'],
        ['club_exercises', 'age_categories'],
      ];
      for (const [table, col] of cols) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
        } catch {
          /* colonne déjà présente */
        }
      }
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_club_sessions_series ON club_sessions(series_id, date)`
      );
    },
  },
  {
    version: 33,
    description:
      "RGPD : horodatage d'anonymisation des compétitions et des membres du club (#1882)",
    up(db) {
      for (const table of ['competitions', 'club_members']) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN anonymized_at TEXT`);
        } catch {
          /* colonne déjà présente */
        }
      }
    },
  },
  {
    version: 34,
    description:
      'Mode Club : inventaire du matériel (club_items) et prêts aux tireurs (club_loans)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS club_items (
          id TEXT PRIMARY KEY,
          club_id TEXT NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          brand TEXT,
          model TEXT,
          serial_number TEXT,
          weapon TEXT,
          size TEXT,
          color TEXT,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchase_date TEXT,
          purchase_price REAL,
          supplier TEXT,
          invoice_ref TEXT,
          warranty_until TEXT,
          condition TEXT NOT NULL DEFAULT 'good',
          location TEXT,
          notes TEXT,
          retired INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_items_club ON club_items(club_id, category)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS club_loans (
          id TEXT PRIMARY KEY,
          club_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          member_id TEXT,
          quantity INTEGER NOT NULL DEFAULT 1,
          lent_at TEXT NOT NULL,
          due_date TEXT,
          returned_at TEXT,
          condition_out TEXT NOT NULL DEFAULT 'good',
          condition_in TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_loans_item ON club_loans(item_id, returned_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_loans_member ON club_loans(member_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_loans_club ON club_loans(club_id, lent_at)`);
    },
  },
  {
    version: 35,
    description: 'Mode Club : catégories de matériel créées par le club (club_item_categories)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS club_item_categories (
          id TEXT PRIMARY KEY,
          club_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_club_item_categories_name ON club_item_categories(club_id, name COLLATE NOCASE)`
      );
    },
  },
  {
    version: 36,
    description: 'Mode Club : catalogue de marques du matériel et verrou de l’inventaire',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS club_item_brands (
          id TEXT PRIMARY KEY,
          club_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_club_item_brands_name ON club_item_brands(club_id, name COLLATE NOCASE)`
      );
      try {
        db.run(`ALTER TABLE clubs ADD COLUMN inventory_locked INTEGER NOT NULL DEFAULT 0`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 37,
    description:
      'Journée multi-épreuves : réservation des pistes et affectation automatique des pistes libérées (#1878)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS event_day_strip_rules (
          event_day_id TEXT NOT NULL,
          strip INTEGER NOT NULL,
          rule TEXT NOT NULL,
          PRIMARY KEY (event_day_id, strip)
        )
      `);
      try {
        db.run(`ALTER TABLE event_days ADD COLUMN auto_assign INTEGER NOT NULL DEFAULT 0`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 38,
    description:
      'Paramétrage global du poste (app_settings) et salles déclarées une fois (venues, venue_strips) (#1880)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS venues (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS venue_strips (
          venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          number INTEGER NOT NULL,
          label TEXT,
          cyrano_config TEXT,
          PRIMARY KEY (venue_id, number)
        )
      `);
      // Une seule salle par défaut
      db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_single_default ON venues(is_default) WHERE is_default = 1`
      );
      for (const table of ['event_days', 'club_sessions']) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN venue_id TEXT`);
        } catch {
          /* colonne déjà présente */
        }
      }
      // Reprise : les pistes déjà déclarées (journées, clubs) deviennent la salle par défaut,
      // une fois, si aucune salle n'existe ; les journées gardent leur propre nombre de pistes
      const strips = `(SELECT MIN(100, MAX(n)) FROM (
          SELECT MAX(strip_count) AS n FROM event_days
          UNION ALL SELECT MAX(strip_count) FROM clubs WHERE strip_count > 1))`;
      db.run(`
        INSERT INTO venues (id, name, is_default, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), 'Salle principale', 1, datetime('now'), datetime('now')
        WHERE NOT EXISTS (SELECT 1 FROM venues) AND COALESCE(${strips}, 0) > 0
      `);
      db.run(`
        WITH RECURSIVE seq(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM seq WHERE k < ${strips})
        INSERT INTO venue_strips (venue_id, number, label, cyrano_config)
        SELECT v.id, seq.k, NULL, NULL FROM venues v, seq
        WHERE v.is_default = 1 AND NOT EXISTS (SELECT 1 FROM venue_strips WHERE venue_id = v.id)
      `);
    },
  },
  {
    version: 39,
    description: "Mode Club : maîtres d'armes du club et encadrement des séances",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS club_coaches (
          id TEXT PRIMARY KEY,
          club_id TEXT NOT NULL,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          title TEXT,
          phone TEXT,
          email TEXT,
          weapons TEXT,
          notes TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_club_coaches_club ON club_coaches(club_id)`);
      db.run(`
        CREATE TABLE IF NOT EXISTS club_session_coaches (
          session_id TEXT NOT NULL,
          coach_id TEXT NOT NULL,
          PRIMARY KEY (session_id, coach_id)
        )
      `);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_club_session_coaches_coach ON club_session_coaches(coach_id)`
      );
    },
  },
  {
    version: 40,
    description: 'Mode Club : armes visées par les exercices (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_exercises ADD COLUMN weapons TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 41,
    description: 'Mode Club : facture PDF importée sur le matériel (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_items ADD COLUMN invoice_pdf TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 42,
    description: 'Mode Club : heure de début des séances (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_sessions ADD COLUMN start_time TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 43,
    description: 'Mode Club : plusieurs armes par club (liste, copie de l’arme actuelle) (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE clubs ADD COLUMN weapons TEXT`);
      } catch {
        /* colonne déjà présente */
      }
      db.run(`UPDATE clubs SET weapons = weapon WHERE weapons IS NULL AND weapon IS NOT NULL`);
    },
  },
  {
    version: 44,
    description: 'Mode Club : image du matériel (JPEG/PNG redimensionnée 720p) (#1872)',
    up(db) {
      try {
        db.run(`ALTER TABLE club_items ADD COLUMN image TEXT`);
      } catch {
        /* colonne déjà présente */
      }
    },
  },
  {
    version: 45,
    description: 'Journal des événements par épreuve, en ajout seul (#1980)',
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS competition_events (
          competition_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          author TEXT,
          source TEXT NOT NULL,
          at TEXT NOT NULL,
          PRIMARY KEY (competition_id, revision)
        )
      `);
    },
  },
  {
    version: 46,
    description:
      'Journal : identifiant d’événement, de commande et version de charge (#1980, docs/adr/0007)',
    up(db) {
      // Changement de clé primaire : table recréée, lignes de la 45 recopiées.
      // event_id : UUID v4 neuf ; command_id : identique pour les lignes d'un même ajout
      // (même épreuve, même heure, même source) ; schema_version 1.
      db.run(`
        CREATE TABLE competition_events_v46 (
          event_id TEXT PRIMARY KEY,
          command_id TEXT NOT NULL,
          competition_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          type TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          payload TEXT NOT NULL,
          author TEXT,
          source TEXT NOT NULL,
          at TEXT NOT NULL,
          UNIQUE (competition_id, revision)
        )
      `);
      db.run(`
        INSERT INTO competition_events_v46
          (event_id, command_id, competition_id, revision, type, schema_version, payload, author, source, at)
        SELECT
          lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))), 2) || '-' ||
            substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) ||
            '-' || lower(hex(randomblob(6))),
          'legacy:' || competition_id || ':' || source || ':' || at,
          competition_id, revision, type, 1, payload, author, source, at
        FROM competition_events
      `);
      db.run(`DROP TABLE competition_events`);
      db.run(`ALTER TABLE competition_events_v46 RENAME TO competition_events`);
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_competition_events_command ON competition_events (competition_id, command_id)`
      );
    },
  },
];
