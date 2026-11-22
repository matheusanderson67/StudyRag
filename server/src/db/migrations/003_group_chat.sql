CREATE TABLE IF NOT EXISTS group_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_chat_send (group_id, user_id, client_id),
  INDEX idx_chat_history (group_id, id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
