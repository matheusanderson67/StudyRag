-- Extensão independente: não modifica colunas nem dados existentes.
CREATE TABLE IF NOT EXISTS personal_spaces (
  user_id CHAR(36) PRIMARY KEY,
  group_id CHAR(36) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS study_reminders (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  details VARCHAR(500) NOT NULL DEFAULT '',
  kind ENUM('study','exam','assignment','other') NOT NULL DEFAULT 'study',
  scheduled_at DATETIME(3) NOT NULL,
  repeat_type ENUM('none','daily','weekly','weekdays') NOT NULL DEFAULT 'none',
  repeat_days JSON NULL,
  timezone_offset_minutes INT NOT NULL DEFAULT 0,
  alert_minutes_before INT NOT NULL DEFAULT 0,
  notified_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reminder_due(user_id,completed_at,notified_at,scheduled_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
