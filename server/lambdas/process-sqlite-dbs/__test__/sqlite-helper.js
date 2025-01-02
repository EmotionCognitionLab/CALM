const Database = require('better-sqlite3');


export async function initSqliteDb(dbPath) {
    const db = new Database(dbPath);

    const createSessionsTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS emwave_sessions(emwave_session_id TEXT PRIMARY KEY, avg_coherence FLOAT NOT NULL, pulse_start_time INTEGER NOT NULL, valid_status INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, stage INTEGER NOT NULL, emo_pic_name TEXT, weighted_avg_coherence FLOAT NOT NULL DEFAULT 0.0, weighted_inverse_coherence FLOAT DEFAULT 0.0)');
    createSessionsTableStmt.run();

    const createCogResultsTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS cognitive_results(id INTEGER NOT NULL PRIMARY KEY, experiment TEXT NOT NULL, is_relevant INTEGER NOT NULL, date_time TEXT NOT NULL, results TEXT NOT NULL, stage INTEGER NOT NULL)');
    createCogResultsTableStmt.run();
    
    return db;
}

export function insertEmwaveSessions(db, sessions) {
    const stmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, pulse_start_time, valid_status, duration_seconds, stage, emo_pic_name, weighted_avg_coherence, weighted_inverse_coherence) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of sessions) {
        if (!s.emo_pic_name) s.emo_pic_name = null;
        stmt.run(s.emwave_session_id, s.avg_coherence, s.pulse_start_time, s.valid_status, s.duration_seconds, s.stage, s.emo_pic_name, s.weighted_avg_coherence, s.weighted_inverse_coherence);
    }
}

export function deleteSessions(db) {
    const stmt = db.prepare('DELETE FROM emwave_sessions');
    stmt.run();
}
