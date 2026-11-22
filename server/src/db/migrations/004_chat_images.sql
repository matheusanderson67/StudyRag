CREATE TABLE IF NOT EXISTS group_message_images (
  message_id BIGINT UNSIGNED PRIMARY KEY,
  image_data MEDIUMBLOB NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;
