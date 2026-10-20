CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS `groups` (
  id CHAR(36) PRIMARY KEY, name VARCHAR(80) NOT NULL, description VARCHAR(300),
  subject VARCHAR(80), period VARCHAR(40), invite_code VARCHAR(20) NOT NULL UNIQUE,
  owner_id CHAR(36) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS group_members (
  group_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  role ENUM('owner','member') NOT NULL, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id,user_id), INDEX idx_member_user(user_id),
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) PRIMARY KEY, group_id CHAR(36) NOT NULL, uploader_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL, stored_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL, sha256 CHAR(64) NOT NULL,
  visibility ENUM('group','private') NOT NULL DEFAULT 'group',
  status ENUM('processing','ready','error') NOT NULL DEFAULT 'processing',
  error TEXT, page_count INT, chunk_count INT, embedding_model VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_doc (group_id,uploader_id,sha256), INDEX idx_docs_group(group_id),
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY(uploader_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, document_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL, page INT NOT NULL, idx INT NOT NULL,
  content TEXT NOT NULL, embedding JSON NOT NULL,
  INDEX idx_doc_pages(document_id,page,idx), INDEX idx_chunk_group(group_id),
  FULLTEXT KEY idx_chunk_fulltext(content),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS questions (
  id CHAR(36) PRIMARY KEY, group_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  question TEXT NOT NULL, answer MEDIUMTEXT NOT NULL, found BOOLEAN NOT NULL,
  sources JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_questions(group_id,user_id,created_at),
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS summaries (
  id CHAR(36) PRIMARY KEY, group_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  content MEDIUMTEXT NOT NULL, sources JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quizzes (
  id CHAR(36) PRIMARY KEY, group_id CHAR(36) NOT NULL, created_by CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL, questions JSON NOT NULL, sources JSON NOT NULL,
  minutes INT NOT NULL DEFAULT 30, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quiz_group(group_id,created_at),
  FOREIGN KEY(group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id CHAR(36) PRIMARY KEY, quiz_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  answers JSON NOT NULL, score INT NOT NULL, total INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attempts(quiz_id,user_id),
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
